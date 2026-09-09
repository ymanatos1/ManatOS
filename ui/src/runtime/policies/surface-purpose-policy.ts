import type {
  PolicyDecision,
  SurfacePurposePolicyDetails,
  SurfacePurposePolicyRequest,
} from './policy-contracts.js';

const MODE_ACTIONS = {
  browse: ['open', 'back'],
  create: ['save', 'close', 'back'],
  edit: ['save', 'delete', 'close', 'back'],
  view: ['close', 'back'],
  select: ['select', 'clear', 'close', 'back'],
  manage: ['save', 'delete', 'add', 'select', 'clear', 'close', 'back'],
} as const;

/**
 * Resolves generic action capability from canonical surface state.
 * Fine-grained permissions/metadata remain separate inputs to later policy
 * composition instead of being embedded in components.
 */
export class SurfacePurposePolicy {
  evaluate(request: SurfacePurposePolicyRequest): PolicyDecision<SurfacePurposePolicyDetails> {
    const purpose = request.purpose ?? request.surface.invocation.purpose ?? null;
    return {
      allowed: true,
      details: {
        purpose,
        allowedActions: MODE_ACTIONS[request.surface.mode],
      },
    };
  }
}
