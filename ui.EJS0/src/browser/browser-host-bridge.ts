import { resolveSysBOUIView, type ResolvedSysBOUIView } from '@manatos/shared/metadata/ui';

import type { UiInvocation } from '../runtime/v2/contracts.js';
import type { UiHostDefinition, UiSurfaceDefinition } from '../runtime/v2/registries.js';
import { UiContext, type UiCtxObject, type UiCtxRuntimePort } from '../runtime/v2/ui-context.js';
import type { UiRuntime } from '../runtime/v2/ui-runtime.js';
import type { UiLevel } from '../runtime/v2/ui-level.js';
import { entryPresentationDefinition } from '../runtime/v2/entry-presentation.js';
import { projectUiLayout } from '../runtime/v2/layout.js';
import type { UiPresentationDefinition } from '../runtime/v2/presentation.js';
import {
  createUiSurfaceResult,
  type UiSurfaceResult,
  type UiSurfaceResultDetail,
} from '../runtime/v2/surface-host.js';

interface PreparedBrowserSurface {
  readonly control: {
    readonly id: string;
    readonly host: string;
    readonly kind: string;
    readonly entityKey?: string;
    readonly mode?: string;
    readonly invocation?: Readonly<Record<string, unknown>>;
    readonly state?: Readonly<Record<string, unknown>>;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

interface BrowserOpenSurfaceInput {
  readonly parentPath?: string | null;
  readonly host?: string;
  readonly kind?: string;
  readonly mode?: string;
  readonly name?: string;
  readonly entityKey?: string | null;
  readonly entityName?: string | null;
  readonly recordId?: string | null;
  readonly invocation?: Readonly<Record<string, unknown>>;
  readonly presentation?: Readonly<Record<string, unknown>>;
  readonly state?: Readonly<Record<string, unknown>>;
  readonly entry?: Readonly<Record<string, unknown>> | null;
  readonly resources?: Readonly<Record<string, unknown>> | null;
  readonly data?: Readonly<Record<string, unknown>> | null;
  readonly supportsUserChanges?: boolean;
  readonly source?: string;
}

interface BrowserHydrateEntryInput {
  readonly path: string;
}

interface BrowserSwitchEntryViewInput {
  readonly path: string;
  readonly viewKey: string;
}

interface BrowserOpenPreparedInput {
  readonly parentPath: string;
  readonly childPath: string;
  readonly child: PreparedBrowserSurface;
  readonly source?: string;
}

interface BrowserCloseInput {
  readonly id: string;
  readonly source?: string;
  readonly decision?: 'save' | 'discard' | 'cancel';
}

interface BrowserDisposeAllInput {
  readonly source?: string;
  readonly decision?: 'discard';
}

interface BrowserEntryOpening {
  readonly host: string;
}

type BrowserEntryPresenter = (opening: BrowserEntryOpening) => unknown;

interface BrowserHostBridge {
  openEntry(opening: BrowserEntryOpening): unknown;
  openSurface(
    input?: BrowserOpenSurfaceInput,
  ): Readonly<{ id: string; host: string; path: string; parentPath: string }> | null;
  hydrateEntrySurface(handle: BrowserHydrateEntryInput, entryBootstrap: unknown): boolean;
  switchEntryView(
    input: BrowserSwitchEntryViewInput,
  ): Readonly<{ viewKey: string; layout: unknown }> | null;
  openPrepared(
    input: BrowserOpenPreparedInput,
  ): Readonly<{ id: string; host: string; path: string; parentPath: string }>;
  surfaceResult(
    handle: Readonly<{ id: string }>,
    outcome?: string,
    detail?: UiSurfaceResultDetail,
  ): UiSurfaceResult;
  close(input: BrowserCloseInput): Promise<string>;
  disposeAll(input?: BrowserDisposeAllInput): Promise<boolean>;
}

interface BrowserCtxPort extends UiCtxRuntimePort {
  entity(entityKey: string): unknown;
}

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const textValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const safeName = (value: unknown, fallback = 'page'): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_$-]+/g, '-');
  if (/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(normalized)) return normalized;
  if (normalized) return `page-${normalized}`;
  return fallback;
};

const leafPath = (ctx: BrowserCtxPort): string | null => {
  const ui = asRecord(ctx.value.ui);
  let level = asRecord(ui?.level);
  if (!level) return null;
  let path = 'ctx.ui.level';
  for (;;) {
    const childLevel = asRecord(level.level);
    if (!childLevel) break;
    level = childLevel;
    path += '.level';
  }
  return path;
};

const entityContextFor = (
  ctx: BrowserCtxPort,
  entityKey: string,
): Readonly<Record<string, unknown>> | null => asRecord(ctx.entity(entityKey));

const enumItemsForField = (
  ctx: BrowserCtxPort,
  field: Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] => {
  const enumKey = textValue(field.enum);
  if (enumKey) {
    const enums = asRecord(ctx.value.enums);
    const definition = Object.values(enums ?? {})
      .map(asRecord)
      .find((candidate) => candidate?.key === enumKey || candidate?.name === enumKey);
    const values = asRecord(definition?.values);
    if (values)
      return Object.values(values)
        .map(asRecord)
        .filter((item) => item !== null);
  }
  return Array.isArray(field.enumItems)
    ? field.enumItems.map(asRecord).filter((item) => item !== null)
    : [];
};

const entryFields = (
  ctx: BrowserCtxPort,
  entityKey: string,
  current: unknown,
  original: unknown,
  mode: string,
  referenceData: unknown,
  effectiveUiMetadata?: unknown,
): Readonly<Record<string, unknown>> => {
  const entity = entityContextFor(ctx, entityKey);
  const metadata = asRecord(entity?.metadata);
  const definitions = asRecord(metadata?.fieldDefinition) ?? {};
  const uiMetadata = asRecord(effectiveUiMetadata) ?? asRecord(entity?.uiMetadata);
  const recordMetadata = asRecord(uiMetadata?.record);
  const overrides = asRecord(recordMetadata?.fieldOverrides) ?? {};
  const currentValues = asRecord(current) ?? {};
  const originalValues = asRecord(original) ?? currentValues;
  const references = asRecord(referenceData) ?? {};

  const fields = Object.values(definitions)
    .map(asRecord)
    .filter(
      (field): field is Readonly<Record<string, unknown>> =>
        field !== null && field.sensitive !== true,
    )
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    .map((field) => {
      const key = String(field.key || '');
      const override = asRecord(overrides[key]) ?? {};
      const staticVisible = typeof override.visible === 'boolean' ? override.visible : true;
      const staticEditable = typeof override.editable === 'boolean' ? override.editable : true;
      const editable = mode !== 'view' && field.readOnly !== true && staticEditable;
      const value = currentValues[key] ?? null;
      const contextualOptions = Array.isArray(references[key]) ? references[key] : null;
      let options: readonly Readonly<Record<string, unknown>>[] | undefined;

      if (field.type === 'reference') {
        options = (contextualOptions ?? []).map(asRecord).filter((item) => item !== null);
      } else if (
        field.type === 'enum' ||
        (Array.isArray(field.optionItems) ? field.optionItems.length : 0) > 0
      ) {
        const configuredItems = Array.isArray(field.optionItems)
          ? field.optionItems.map(asRecord).filter((item) => item !== null)
          : [];
        const enumItems = field.type === 'enum' ? enumItemsForField(ctx, field) : configuredItems;
        const richItems =
          field.type === 'enum'
            ? enumItems.length
              ? enumItems
              : configuredItems
            : configuredItems;
        if (contextualOptions?.length) {
          options = contextualOptions.map((raw) => {
            const item = asRecord(raw) ?? {};
            const optionValue = item.value;
            const canonical = richItems.find((candidate) => candidate.value === optionValue) ?? {};
            return { ...canonical, ...item, value: optionValue };
          });
        } else {
          const enumValues = Array.isArray(field.enumValues)
            ? field.enumValues
            : richItems.map((item) => item.value);
          options = enumValues.map((optionValue) => ({
            ...(richItems.find((item) => item.value === optionValue) ?? {
              value: optionValue,
              label: String(optionValue),
            }),
            value: optionValue,
          }));
        }
      }
      const option = options
        ? (options.find((candidate) => Object.is(candidate.id ?? candidate.value ?? null, value)) ??
          null)
        : undefined;
      return [
        key,
        {
          originalValue: originalValues[key] ?? null,
          value,
          ...(options ? { option, options } : {}),
          valid: true,
          validationIssues: [],
          ux: {
            visible: staticVisible,
            enabled: editable,
            readonly: !editable,
            required: field.required === true,
          },
        },
      ] as const;
    });
  return Object.freeze(Object.fromEntries(fields));
};

const initialState = (
  patch: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> => {
  // Lifecycle is reserved to UiRuntime. Callers may seed semantic state, but may
  // not pre-activate/deactivate a level while its topology is still being prepared.
  const semanticPatch = { ...patch };
  delete semanticPatch.lifecycle;
  delete semanticPatch.active;
  return Object.freeze({
    lifecycle: 'created',
    active: false,
    dirty: false,
    valid: true,
    loading: false,
    saving: false,
    deleting: false,
    blocked: false,
    userInputReady: true,
    navigation: { activeTabId: null, activeInternalTabIds: {} },
    ...semanticPatch,
  });
};

const canonicalEntryRules = (
  defaults: unknown,
  overrides: unknown,
): Readonly<Record<string, unknown>> => {
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(asRecord(defaults) ?? {}))
    values[key] = { default: value };
  const fields: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(asRecord(overrides) ?? {})) {
    const raw = asRecord(rawValue);
    if (!raw) continue;
    const rule: Record<string, unknown> = {};
    if (typeof raw.label === 'string') rule.label = raw.label;
    if (typeof raw.visible === 'boolean') rule.visible = raw.visible;
    if (typeof raw.required === 'boolean') rule.required = raw.required;
    if (typeof raw.enabled === 'boolean') rule.enabled = raw.enabled;
    if (typeof raw.readOnly === 'boolean') rule.readOnly = raw.readOnly;
    if (typeof raw.editable === 'boolean') rule.readOnly = !raw.editable;
    if (Array.isArray(raw.allowedValues)) rule.allowedValues = [...raw.allowedValues];
    if (Array.isArray(raw.excludedValues)) rule.excludedValues = [...raw.excludedValues];
    if (typeof raw.allowedEnumItemTrait === 'string')
      rule.allowedEnumItemTrait = raw.allowedEnumItemTrait;
    if (Object.keys(rule).length) fields[key] = rule;
    if (Object.prototype.hasOwnProperty.call(raw, 'readOnlyValue'))
      values[key] = { fixed: raw.readOnlyValue };
  }
  return Object.freeze({
    ...(Object.keys(values).length ? { values } : {}),
    ...(Object.keys(fields).length ? { fields } : {}),
  });
};

const prepareBrowserSurface = (
  ctx: BrowserCtxPort,
  parent: Readonly<Record<string, unknown>>,
  input: BrowserOpenSurfaceInput,
): PreparedBrowserSurface => {
  const host = String(input.host || 'popup');
  const kind = String(input.kind || 'custom');
  const mode = String(input.mode || 'view');
  const name = safeName(input.name, kind || host);
  const parentControl = asRecord(parent.control);
  if (!parentControl) throw new Error('Browser child surface requires a semantic parent control.');
  const parentPersistence = asRecord(parentControl.persistence);
  const inheritedOwner = asRecord(parentPersistence?.owner);
  const inheritedBoundary = asRecord(parentPersistence?.ultimateBoundary);
  const semanticPath = `${String(parentControl.path || '')}/${host}:${name}`;
  const entry = asRecord(input.entry);
  const normalizedEntry = entry
    ? {
        ...entry,
        original: structuredClone(asRecord(entry.original) ?? {}),
        current: structuredClone(asRecord(entry.current) ?? {}),
      }
    : null;
  const resources = asRecord(input.resources);
  const fields =
    kind === 'entry' && input.entityKey
      ? entryFields(
          ctx,
          input.entityKey,
          normalizedEntry?.current,
          normalizedEntry?.original ?? normalizedEntry?.current,
          mode,
          resources?.referenceData,
        )
      : null;
  return Object.freeze({
    control: {
      id: `${host}-${kind}-${name}-${Date.now()}`,
      host,
      kind,
      mode,
      name,
      path: semanticPath,
      scope: 'sys',
      invocation: { ...(input.invocation ?? {}) },
      presentation: { kind, ...(input.presentation ?? {}) },
      facts: {},
      supportsUserChanges: input.supportsUserChanges === true,
      ...(inheritedOwner
        ? {
            persistence: {
              kind: 'transient',
              owner: structuredClone(inheritedOwner),
              ...(inheritedBoundary
                ? { ultimateBoundary: structuredClone(inheritedBoundary) }
                : {}),
            },
          }
        : {}),
      ...(input.entityKey ? { entityKey: String(input.entityKey) } : {}),
      ...(input.entityName ? { entityName: input.entityName } : {}),
      ...(input.recordId ? { recordId: input.recordId } : {}),
    },
    state: initialState(input.state),
    data: {
      ...(input.data ? structuredClone(input.data) : {}),
      ...(resources && Object.keys(resources).length ? { resources } : {}),
      ...(normalizedEntry ? { entry: normalizedEntry } : {}),
      ...(fields && Object.keys(fields).length ? { fields } : {}),
    },
  });
};

const invocationFor = (child: PreparedBrowserSurface): UiInvocation => {
  const legacyInvocation = asRecord(child.control.invocation);
  const behavior = asRecord(legacyInvocation?.behavior);
  const closePolicy = asRecord(behavior?.closePolicy);
  const dirtyPolicy =
    closePolicy?.dirty === 'discard'
      ? 'discard'
      : closePolicy?.dirty === 'prompt'
        ? 'prompt'
        : undefined;
  return {
    surface: child.control.kind,
    host: child.control.host,
    ...(child.control.entityKey ? { entity: child.control.entityKey } : {}),
    ...(child.control.mode ? { mode: child.control.mode } : {}),
    parameters: Object.freeze({ legacyInvocation: child.control.invocation ?? {} }),
    ...(behavior
      ? {
          behavior: {
            ...(typeof behavior.recoverable === 'boolean'
              ? { recoverable: behavior.recoverable }
              : {}),
            ...(dirtyPolicy ? { closePolicy: { dirty: dirtyPolicy } } : {}),
          },
        }
      : {}),
  };
};

const ensureSurface = (runtime: UiRuntime, surfaceId: string): void => {
  if (runtime.registries.surfaces.find(surfaceId)) return;
  const definition: UiSurfaceDefinition<PreparedBrowserSurface> = {
    id: surfaceId,
    contractVersion: 1,
    open: ({ request }) => request.parameters?.preparedSurface as PreparedBrowserSurface,
  };
  runtime.registries.surfaces.register(definition);
};

const ensureHost = (
  runtime: UiRuntime,
  ctx: BrowserCtxPort,
  hostId: 'page' | 'popup' | 'embedded',
): void => {
  if (runtime.registries.hosts.find(hostId)) return;
  const definition: UiHostDefinition = {
    id: hostId,
    contractVersion: 1,
    open: ({ runtime: owner, request }) => {
      const parent = request.parent;
      if (!parent?.context) throw new Error(`${hostId} host requires a live semantic parent.`);
      const childPath = request.context.path;
      const prepared = request.parameters?.preparedSurface;
      const preparedRecord = asRecord(prepared);
      if (!preparedRecord) throw new Error(`${hostId} host requires a prepared surface.`);

      // UiRuntime is the sole lifecycle authority. A popup deactivates its parent
      // before adoption/publication; embedded children deliberately leave it active.
      if (hostId !== 'embedded') owner.deactivate(parent, 'browser-host-bridge');
      const level = owner.adoptChild(parent, request.id, request.invocation, request.context);
      const preparedControl = asRecord(preparedRecord.control);
      const preparedInvocation = asRecord(preparedControl?.invocation);
      const preparedCaller = asRecord(preparedInvocation?.caller);
      if (preparedCaller?.workspaceOwned === true && parent.ownerProvider)
        level.bindOwnerProvider(parent.ownerProvider);
      const preparedPresentation = asRecord(preparedControl?.presentation);
      const preparedDefinition = preparedPresentation?.definition as
        UiPresentationDefinition | undefined;
      const preparedWithLayout = {
        ...preparedRecord,
        layout: projectUiLayout(preparedRecord, preparedDefinition),
      } as UiCtxObject;
      ctx.replace(childPath, preparedWithLayout, {
        source: 'browser-host-bridge',
        action: `open-${hostId}-surface`,
        triggerPath: childPath,
      });
      owner.activate(level, 'browser-host-bridge');
      return level;
    },
  };
  runtime.registries.hosts.register(definition);
};

export const installBrowserHostBridge = (runtime: UiRuntime): BrowserHostBridge => {
  const ctx = window.ManatOS?.ctx as BrowserCtxPort | undefined;
  if (!ctx?.get || !ctx?.replace) throw new Error('Browser host bridge requires canonical CTX.');
  ensureHost(runtime, ctx, 'page');
  ensureHost(runtime, ctx, 'popup');
  ensureHost(runtime, ctx, 'embedded');

  const bridge: BrowserHostBridge = Object.freeze({
    openEntry: (opening: BrowserEntryOpening) => {
      const presenters = window.ManatOS as typeof window.ManatOS & {
        entryPagePresenter?: BrowserEntryPresenter;
        entryPopupPresenter?: BrowserEntryPresenter;
      };
      const presenter =
        opening.host === 'page'
          ? presenters.entryPagePresenter
          : opening.host === 'popup'
            ? presenters.entryPopupPresenter
            : undefined;
      if (typeof presenter !== 'function') {
        throw new Error(`Entry host is not production-connected: ${opening.host}`);
      }
      return presenter(opening);
    },
    openSurface: (input: BrowserOpenSurfaceInput = {}) => {
      const host = String(input.host || 'popup');
      if (host !== 'page' && host !== 'popup' && host !== 'embedded') {
        throw new Error(`Unsupported browser child surface host: ${host}`);
      }
      const parentPath = input.parentPath || leafPath(ctx);
      if (!parentPath) return null;
      const parent = asRecord(ctx.get(parentPath));
      if (!parent?.control) return null;
      const childPath = `${parentPath}.level`;
      if (ctx.get(childPath) !== undefined) {
        throw new Error(`UI level already owns a child surface: ${parentPath}`);
      }
      const child = prepareBrowserSurface(ctx, parent, { ...input, host });
      return bridge.openPrepared({
        parentPath,
        childPath,
        child,
        source: input.source || 'ui-host',
      });
    },
    hydrateEntrySurface: (handle: BrowserHydrateEntryInput, entryBootstrap: unknown) => {
      if (!handle?.path) return false;
      const current = asRecord(ctx.get(handle.path));
      const currentControl = asRecord(current?.control);
      if (!current || currentControl?.kind !== 'entry') return false;
      const input = asRecord(entryBootstrap);
      const entityKey = textValue(input?.entityKey);
      if (!input || !entityKey) return false;
      const mode = input.isNew ? 'create' : input.readOnly ? 'view' : 'edit';
      if (mode !== currentControl.mode) return false;
      const entityName =
        textValue(input.entityName) ?? textValue(entityContextFor(ctx, entityKey)?.name);
      const rules = canonicalEntryRules(input.defaults, input.uiOverrides);
      const currentInvocation = asRecord(currentControl.invocation) ?? {};
      const invocation = {
        ...currentInvocation,
        ...(entityName ? { entityName } : {}),
        behavior: { recoverable: input.recoverable !== false },
        ...(Object.keys(rules).length ? { rules } : {}),
      };
      const currentPresentation = asRecord(currentControl.presentation) ?? {};
      const uiView = asRecord(input.uiView);
      const uiViewMetadata = asRecord(uiView?.metadata);
      const resolvedUIView =
        uiView && textValue(uiView.key) && textValue(uiView.viewType) && uiViewMetadata
          ? ({ ...uiView, metadata: uiViewMetadata } as unknown as ResolvedSysBOUIView)
          : null;
      if (!resolvedUIView) return false;
      // Browser-opened entries receive the same canonical typed presentation as
      // EntityEntrySurface/root bootstrap entries. SSR markup is a physical adapter;
      // it must never be the only owner of metadata-driven tabs/composition.
      const presentationDefinition = entryPresentationDefinition(resolvedUIView);
      const presentation = {
        ...currentPresentation,
        ...(textValue(input.title) ? { title: input.title } : {}),
        ...(textValue(input.icon) ? { icon: input.icon } : {}),
        uiView: { ...uiView },
        definition: presentationDefinition,
        layout: 'entity-entry',
      };
      const entry = asRecord(input.entry) ?? {};
      const facts = asRecord(entry.facts) ?? {};
      const resources = asRecord(input.resources) ?? {};
      const original = structuredClone(asRecord(entry.original) ?? {});
      const currentEntry = structuredClone(asRecord(entry.current) ?? {});
      const fields = entryFields(
        ctx,
        entityKey,
        currentEntry,
        original,
        mode,
        resources.referenceData,
        resolvedUIView.metadata,
      );
      const existingState = asRecord(current.state) ?? initialState();
      const navigation = asRecord(input.navigation) ?? {};
      const activeInternalTabIds = asRecord(navigation.activeInternalTabIds) ?? {};
      const hydrated = {
        ...current,
        control: {
          ...currentControl,
          mode,
          entityKey,
          ...(entityName ? { entityName } : {}),
          ...(textValue(input.recordId) ? { recordId: input.recordId } : {}),
          invocation,
          presentation,
          facts: { ...facts },
          supportsUserChanges: mode !== 'view',
        },
        state: {
          ...existingState,
          navigation: {
            activeTabId: navigation.activeTabId ?? null,
            activeInternalTabIds: { ...activeInternalTabIds },
          },
        },
        data: {
          ...(asRecord(current.data) ?? {}),
          entry: { original, current: currentEntry },
          ...(Object.keys(resources).length ? { resources } : {}),
          fields,
        },
      };
      ctx.replace(
        handle.path,
        { ...hydrated, layout: projectUiLayout(hydrated, presentationDefinition) } as UiCtxObject,
        {
          source: 'browser-host-bridge',
          action: 'hydrate-entry-surface',
          triggerPath: handle.path,
        },
      );
      const runtimeResources = asRecord(input.runtimeResources) ?? {};
      const level = [...runtime.levels.values()].find(
        (candidate) => candidate.context?.path === handle.path,
      );
      level?.replaceRuntimeResources(runtimeResources);
      return true;
    },
    switchEntryView: ({ path, viewKey }: BrowserSwitchEntryViewInput) => {
      const current = asRecord(ctx.get(path));
      const control = asRecord(current?.control);
      if (!current || control?.kind !== 'entry') return null;
      const entityKey = textValue(control.entityKey);
      const entity = entityKey ? entityContextFor(ctx, entityKey) : null;
      const uiMetadata = asRecord(entity?.uiMetadata);
      if (!entityKey || !uiMetadata) return null;

      const resolved = resolveSysBOUIView(
        uiMetadata as unknown as Parameters<typeof resolveSysBOUIView>[0],
        viewKey,
      );
      const currentView = asRecord(asRecord(control.presentation)?.uiView);
      const currentReadOnly =
        control.mode === 'view' ||
        asRecord(asRecord(currentView?.metadata)?.record)?.readOnly === true;
      const nextReadOnly = control.mode === 'view' || resolved.metadata.record.readOnly === true;
      if (currentReadOnly !== nextReadOnly) {
        throw new Error(`UI view '${viewKey}' is incompatible with the current entry mode.`);
      }

      const definition = entryPresentationDefinition(resolved);
      const presentation = {
        ...(asRecord(control.presentation) ?? {}),
        uiView: resolved,
        definition,
        layout: 'entity-entry',
      };
      const next = {
        ...current,
        control: { ...control, presentation },
      };
      const layout = projectUiLayout(next, definition);
      ctx.replace(path, { ...next, layout } as UiCtxObject, {
        source: 'browser-host-bridge',
        action: 'switch-entry-view',
        triggerPath: path,
      });
      return Object.freeze({ viewKey: resolved.key, layout });
    },
    openPrepared: ({
      parentPath,
      childPath,
      child,
      source = 'ui-host',
    }: BrowserOpenPreparedInput) => {
      if (child.control.host !== 'popup' && child.control.host !== 'embedded') {
        throw new Error(`Unsupported browser child surface host: ${child.control.host}`);
      }
      const parentValue = asRecord(ctx.get(parentPath));
      const parentId =
        typeof parentValue?.control === 'object' && parentValue.control
          ? String((parentValue.control as Readonly<Record<string, unknown>>).id || '')
          : '';
      const parent = parentId ? runtime.find(parentId) : undefined;
      if (!parent) throw new Error(`Typed parent UI level is not live: ${parentPath}`);
      ensureSurface(runtime, child.control.kind);
      const context = new UiContext(childPath, child as UiCtxObject, ctx);
      runtime.open<PreparedBrowserSurface>({
        id: child.control.id,
        invocation: invocationFor(child),
        context,
        parent,
        parameters: Object.freeze({ preparedSurface: child, source }),
      });
      return Object.freeze({
        id: child.control.id,
        host: child.control.host,
        path: childPath,
        parentPath,
      });
    },
    surfaceResult: (
      handle: Readonly<{ id: string }>,
      outcome = 'closed',
      detail: UiSurfaceResultDetail = {},
    ) => createUiSurfaceResult(handle?.id || '', outcome, detail),
    close: async ({ id, source = 'ui-host', decision }: BrowserCloseInput) => {
      const level = runtime.find(id);
      if (!level || level.isStructuralRoot) return 'not-found';
      const parent = level.parent;
      const host = level.invocation?.host;
      const path = level.context?.path ?? '';
      const browserHost = (
        window.ManatOS as unknown as
          | {
              uiHost?: {
                saveUserChanges?: (path: string) => Promise<boolean>;
                discardUserChanges?: (path: string) => Promise<boolean>;
              };
            }
          | undefined
      )?.uiHost;
      const announceDisposing = (closingLevel: UiLevel) => {
        const closingPath = closingLevel.context?.path;
        if (!closingPath) return;
        window.dispatchEvent(
          new CustomEvent('manatos:ui-level-disposing', {
            detail: Object.freeze({ path: closingPath, source }),
          }),
        );
      };
      const result = await runtime.requestClose(level, {
        source,
        dispose: announceDisposing,
        ...(decision ? { decision } : {}),
        save: async () => (await browserHost?.saveUserChanges?.(path)) === true,
        discard: async () => (await browserHost?.discardUserChanges?.(path)) !== false,
      });
      if (result.status === 'closed' && host !== 'embedded' && parent && !parent.isStructuralRoot)
        runtime.activate(parent, source);
      return result.status;
    },
    disposeAll: async ({ source = 'ui-host', decision }: BrowserDisposeAllInput = {}) => {
      const children = [...runtime.root.children];
      if (!children.length) return false;
      for (const child of children) {
        const result = await runtime.requestClose(child, {
          source,
          ...(decision === 'discard'
            ? { decision: 'discard' as const, discard: async () => true }
            : {}),
          dispose: (closingLevel) => {
            const closingPath = closingLevel.context?.path;
            if (!closingPath) return;
            window.dispatchEvent(
              new CustomEvent('manatos:ui-level-disposing', {
                detail: Object.freeze({ path: closingPath, source }),
              }),
            );
          },
        });
        if (result.status !== 'closed') return false;
      }
      return true;
    },
  });

  window.ManatOS ||= {};
  (window.ManatOS as typeof window.ManatOS & { uiHostV2?: BrowserHostBridge }).uiHostV2 = bridge;
  return bridge;
};
