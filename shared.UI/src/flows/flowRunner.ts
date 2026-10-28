import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import type { UiSurfaceHandle, UiSurfaceManager } from '../runtime/surface/uiSurfaceManager.js';
import type { UiPopupLevel } from '../popups/popup-runtime.js';
import type { SessionHandler } from './auth/sessionHandler.js';
import type { ApiHandler } from '../api/apiHandler.js';
import { SignInFlow } from './auth/signinFlow.js';
import { RegisterFlow } from './auth/registerFlow.js';
import { ResetPasswordFlow } from './auth/resetPasswordFlow.js';
import { ChangePasswordFlow } from './auth/changePasswordFlow.js';

export type FlowStepStatus =
  'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

/** One registered hardcoded step; its children are explicitly activated by their parent Flow. */
export interface FlowStepDefinition {
  readonly id: string;
  readonly run: (
    execution: FlowExecution,
  ) => void | FlowStepOutcome | Promise<void | FlowStepOutcome>;
  readonly children?: readonly string[];
}

export interface FlowStepOutcome {
  readonly stop?: boolean;
}
export interface UiFlow {
  steps(): readonly FlowStepDefinition[];
}
export type UiFlowFactory = (params: Readonly<Record<string, unknown>>) => UiFlow;

export interface FlowStepContext {
  readonly control: {
    readonly host: 'flow';
    readonly kind: 'step';
    readonly id: string;
    readonly status: FlowStepStatus;
    readonly startedAt: string | null;
    readonly endedAt: string | null;
    readonly error: string | null;
  };
  readonly data: Record<string, unknown>;
  readonly steps?: Record<string, FlowStepContext>;
}

export interface FlowContext {
  readonly control: {
    readonly host: 'flow';
    readonly kind: 'flow';
    readonly name: string;
    readonly instanceId: string;
    /** Canonical CTX path reference, never a second copy of the step. */
    readonly currentStep: { readonly kind: 'pointer'; readonly value: string } | null;
    readonly status: FlowStepStatus;
  };
  readonly steps: Record<string, FlowStepContext>;
}

const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FLOW_PATH = 'ctx.flow';

function validateId(id: string): void {
  if (!ID.test(id) || id === '__proto__' || id === 'constructor' || id === 'prototype') {
    throw new Error(`Invalid Flow step identifier: ${id}`);
  }
}

function createStep(id: string, children: readonly string[] = []): FlowStepContext {
  validateId(id);
  const steps: Record<string, FlowStepContext> = Object.create(null);
  for (const child of children) {
    validateId(child);
    if (Object.hasOwn(steps, child)) throw new Error(`Duplicate Flow substep: ${child}`);
    steps[child] = createStep(child);
  }
  return {
    control: {
      host: 'flow',
      kind: 'step',
      id,
      status: 'pending',
      startedAt: null,
      endedAt: null,
      error: null,
    },
    data: {},
    ...(children.length ? { steps } : {}),
  };
}

/** Execution-local capability: steps never mutate CTX paths or own CTX lifetime. */
/** Flow registers bindings; FlowRunner owns dispatch, CTX transitions and step status. */
export interface FlowSurfaceStep {
  readonly step: string;
  readonly run: (level: UiPopupLevel, levelPath: string) => void | Promise<void>;
}

export class FlowExecution {
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly activeChildren = new Set<string>();
  private live = true;

  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    readonly flowId: string,
  ) {}

  get currentStepPath(): string | null {
    return this.context.root().flow?.control.currentStep?.value ?? null;
  }

  /** A Flow opens a surface from this step. The Surface Manager consumes this ownership link. */
  surfaceFlow(stepPath: string, events: Readonly<Record<string, string>>) {
    return { flowId: this.flowId, stepPath, events };
  }

  stepPath(step: string, child?: string): string {
    validateId(step);
    if (child) validateId(child);
    return `${FLOW_PATH}.steps.${step}${child ? `.steps.${child}` : ''}`;
  }

  private updateStatus(path: string, status: FlowStepStatus, error: string | null = null): void {
    if (!this.live) return;
    const control = this.context.get(`${path}.control`) as FlowStepContext['control'] | undefined;
    if (!control) return;
    this.context.setMembers(`${path}.control`, {
      status,
      startedAt: status === 'running' ? new Date().toISOString() : control.startedAt,
      endedAt: ['completed', 'failed', 'cancelled'].includes(status)
        ? new Date().toISOString()
        : null,
      error,
    });
  }

  private setCurrent(path: string | null): void {
    if (!this.live || !this.context.root().flow) return;
    this.context.set(
      `${FLOW_PATH}.control.currentStep`,
      path ? { kind: 'pointer', value: path } : null,
    );
  }

  /** Runner-internal sibling activation. */
  async execute(step: FlowStepDefinition): Promise<FlowStepOutcome | void> {
    const path = this.stepPath(step.id);
    this.setCurrent(path);
    this.updateStatus(path, 'running');
    try {
      const result = await step.run(this);
      // A UI step can stay waiting until its surface's disposing notification.
      await this.drain();
      this.updateStatus(path, 'completed');
      return result;
    } catch (error) {
      this.updateStatus(path, 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** A waiting step retains its execution status while reacting to popup events. */
  wait(step: string): void {
    this.updateStatus(this.stepPath(step), 'waiting');
  }

  /** Flow-owned event handlers select child steps; runner owns transitions and CTX. */
  runSubstep<T>(parent: string, child: string, work: () => T | Promise<T>): Promise<T> {
    const path = this.stepPath(parent, child);
    if (!this.live || !this.context.get(path))
      return Promise.reject(new Error(`Inactive Flow substep: ${path}`));
    if (this.activeChildren.has(path))
      return Promise.reject(new Error(`Flow substep already running: ${path}`));
    this.activeChildren.add(path);
    const previous = this.currentStepPath;
    this.setCurrent(path);
    this.updateStatus(path, 'running');
    const task = (async () => {
      try {
        const result = await work();
        this.updateStatus(path, 'completed');
        return result;
      } catch (error) {
        this.updateStatus(path, 'failed', error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        this.activeChildren.delete(path);
        if (this.currentStepPath === path) this.setCurrent(previous);
      }
    })();
    this.inFlight.add(task);
    void task.then(
      () => this.inFlight.delete(task),
      () => this.inFlight.delete(task),
    );
    return task;
  }

  /** Generic caller-selected surface event -> registered Flow substep routing. */
  bindSurfaceEvents(
    surface: UiSurfaceHandle,
    parent: string,
    bindings: Readonly<Record<string, FlowSurfaceStep>>,
  ): () => void {
    return surface.onEvent((eventName, levelPath, level) => {
      const binding = bindings[eventName];
      if (!binding) return;
      void this.runSubstep(parent, binding.step, () => binding.run(level, levelPath)).catch(
        (error: unknown) => {
          console.warn('Flow surface substep failed', binding.step, error);
        },
      );
    });
  }

  async drain(): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight]);
  }

  dispose(): void {
    this.live = false;
  }
}

/** One active Flow per application/session. Owns all Flow CTX publication and disposal. */
export class FlowRunner {
  private readonly factories = new Map<string, UiFlowFactory>();
  private running: Promise<void> | null = null;
  private sequence = 0;

  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    surfaces: UiSurfaceManager,
    api: ApiHandler,
    session: SessionHandler,
  ) {
    this.register('auth.signin', () => new SignInFlow(context, surfaces, api, session));
    this.register('auth.register', () => new RegisterFlow(context, surfaces, api));
    this.register('auth.changePassword', () => new ChangePasswordFlow(surfaces, api));
    this.register(
      'auth.resetPassword',
      (params) =>
        new ResetPasswordFlow(
          surfaces,
          api,
          typeof params['token'] === 'string' ? params['token'] : '',
        ),
    );
  }

  register(name: string, factory: UiFlowFactory): void {
    if (!name || this.factories.has(name)) throw new Error(`Duplicate or empty Flow name: ${name}`);
    this.factories.set(name, factory);
  }

  run(name: string, params: Readonly<Record<string, unknown>> = {}): Promise<void> {
    if (this.running) return this.running;
    const factory = this.factories.get(name);
    if (!factory) return Promise.reject(new Error(`Unknown Flow: ${name}`));

    const steps = factory(params).steps();
    const tree: Record<string, FlowStepContext> = Object.create(null);
    for (const step of steps) {
      validateId(step.id);
      if (Object.hasOwn(tree, step.id)) throw new Error(`Duplicate Flow step: ${step.id}`);
      tree[step.id] = createStep(step.id, step.children);
    }
    const flowId = `${name}-${++this.sequence}`;
    const flow: FlowContext = {
      control: {
        host: 'flow',
        kind: 'flow',
        name,
        instanceId: flowId,
        currentStep: null,
        status: 'running',
      },
      steps: tree,
    };
    this.context.set(FLOW_PATH, flow);
    this.context.registerSemanticKind(FLOW_PATH, 'flow');
    for (const step of steps) {
      const parentPath = `${FLOW_PATH}.steps.${step.id}`;
      this.context.registerSemanticKind(parentPath, 'flow-step');
      for (const child of step.children ?? [])
        this.context.registerSemanticKind(`${parentPath}.steps.${child}`, 'flow-step');
    }
    const execution = new FlowExecution(this.context, flowId);
    const operation = (async () => {
      try {
        for (const step of steps) {
          const result = await execution.execute(step);
          if (result && result.stop) break;
        }
      } finally {
        await execution.drain();
        execution.dispose();
        if (this.context.root().flow?.control.instanceId === flowId)
          this.context.set(FLOW_PATH, null);
      }
    })();
    this.running = operation;
    void operation
      .finally(() => {
        if (this.running === operation) this.running = null;
      })
      .catch(() => {});
    return operation;
  }
}
