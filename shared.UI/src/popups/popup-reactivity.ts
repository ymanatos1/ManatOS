import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import { UiReactivityRuntime, type UiReactiveExpression } from '../runtime/reactivity.js';
import { popupViews, type UiPopupDefinition } from './popup-definition.js';

/** Maps popup policy onto the shared expression scheduler. */
export class PopupReactivity extends UiReactivityRuntime {
  constructor(
    context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    levelPath: string,
    definition: UiPopupDefinition,
  ) {
    const expressions: UiReactiveExpression[] = [];
    for (const rule of definition.rules)
      expressions.push({
        key: `rule.${rule.id}`,
        outputPath: `${levelPath}.state.rules.${rule.id}`,
        expression: rule.expression,
      });
    // Declarative tab availability shares the existing dependency-aware evaluator.
    // Fixed Auth views omit these conditions and therefore remain available.
    for (const tab of popupViews(definition)) {
      expressions.push({
        key: `tab.visible.${tab.id}`,
        outputPath: `${levelPath}.state.visibleTabs.${tab.id}`,
        expression: tab.visibleWhen ?? null,
      });
      expressions.push({
        key: `tab.required.${tab.id}`,
        outputPath: `${levelPath}.state.requiredTabs.${tab.id}`,
        expression: tab.requiredWhen ?? 'false',
      });
      expressions.push({
        key: `tab.enabled.${tab.id}`,
        outputPath: `${levelPath}.state.enabledTabs.${tab.id}`,
        expression: tab.enabledWhen ?? null,
      });
    }
    const actions = new Map<string, { enabled: string | null; visible: string | null }>();
    // Root-level actions are evaluated once; legacy Auth tab actions retain
    // their established conditions and per-tab ownership.
    const actionGroups = definition.actions
      ? [definition.actions]
      : popupViews(definition).map((tab) => tab.actions);
    for (const group of actionGroups)
      for (const action of group) {
        const enabled = action.enabledWhen ?? null;
        const visible = action.visibleWhen ?? null;
        const prior = actions.get(action.id);
        if (prior && (prior.enabled !== enabled || prior.visible !== visible))
          throw new Error(`Conflicting popup action conditions for '${action.id}'.`);
        actions.set(action.id, { enabled, visible });
      }
    for (const [id, condition] of actions) {
      expressions.push({
        key: `action.${id}`,
        outputPath: `${levelPath}.state.actions.${id}`,
        expression: condition.enabled,
      });
      expressions.push({
        key: `visible.${id}`,
        outputPath: `${levelPath}.state.visibleActions.${id}`,
        expression: condition.visible,
      });
    }
    super(context, levelPath, expressions, `${levelPath}.state.expressionErrors`);
  }
}
