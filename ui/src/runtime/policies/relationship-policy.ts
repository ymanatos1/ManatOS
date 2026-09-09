import type {
  PolicyDecision,
  RelationshipPolicyDetails,
  RelationshipPolicyRequest,
} from './policy-contracts.js';

/**
 * Generic relationship policy baseline.
 *
 * Entity/domain-specific constraints are supplied as metadata/resolved policy
 * inputs rather than hardcoded here. The resolver may later extend this with
 * registered domain policies while keeping the consumer contract unchanged.
 */
export class RelationshipPolicy {
  evaluate(request: RelationshipPolicyRequest): PolicyDecision<RelationshipPolicyDetails> {
    const constraints = Object.freeze({
      ...(request.metadata?.constraints as Record<string, unknown> | undefined),
    });

    if (request.action === 'clear') {
      if (request.metadata?.nullable === false) {
        return { allowed: false, reason: 'The relationship is not nullable.' };
      }
      return {
        allowed: true,
        details: {
          targetEntityKey: request.targetEntityKey,
          targetField: request.targetField,
          mode: 'edit',
          returnOutcome: 'cleared',
          constraints,
        },
      };
    }

    if (request.action === 'add-entry' && request.metadata?.allowCreate === false) {
      return {
        allowed: false,
        reason: 'Creating a related entry is disabled by relationship policy.',
      };
    }

    if (request.action === 'select-existing' && request.metadata?.allowSelect === false) {
      return {
        allowed: false,
        reason: 'Selecting an existing entry is disabled by relationship policy.',
      };
    }

    const mode =
      request.requestedMode ??
      (request.action === 'add-entry'
        ? 'create'
        : request.action === 'select-existing'
          ? 'select'
          : 'view');

    return {
      allowed: true,
      details: {
        targetEntityKey: request.targetEntityKey,
        targetField: request.targetField,
        mode,
        returnOutcome:
          request.action === 'add-entry'
            ? 'saved'
            : request.action === 'select-existing'
              ? 'selected'
              : 'completed',
        constraints,
      },
    };
  }
}
