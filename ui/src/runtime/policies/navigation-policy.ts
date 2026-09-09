import type { NavigationPolicyRequest, PolicyDecision } from './policy-contracts.js';

/**
 * Universal V2 nesting policy.
 *
 * Pages may open pages or popups. Popups may open further popups, but may not
 * open nested pages. This is intentionally policy-owned instead of being
 * repeated by host/component implementations.
 */
export class NavigationPolicy {
  evaluate(request: NavigationPolicyRequest): PolicyDecision {
    if (request.parent?.host === 'popup' && request.childHost === 'page') {
      return {
        allowed: false,
        reason: 'V2 navigation rule violation: a popup cannot open a nested page.',
      };
    }
    return { allowed: true };
  }
}
