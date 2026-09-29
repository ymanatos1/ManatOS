import type { SysBOFieldMetadata } from '@manatos/shared/metadata/bo';

import type { UiContext, UiCtxObject } from './ui-context.js';
import type { EntityFieldRuntime } from './field.js';

export type UiValidationSeverity = 'error' | 'warning';

export interface UiValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: UiValidationSeverity;
  readonly fieldKey?: string;
}

export interface UiValidationResult {
  readonly valid: boolean;
  readonly issues: readonly UiValidationIssue[];
}

/**
 * Semantic validation owner for one entity entry. Validation reads canonical field bindings and
 * canonical BO metadata; it never reads controls or component memory.
 */
export class EntityEntryValidationRuntime {
  constructor(
    readonly context: UiContext,
    readonly fields: ReadonlyMap<string, EntityFieldRuntime>,
  ) {}

  validate(): UiValidationResult {
    const issues: UiValidationIssue[] = [];
    for (const field of this.fields.values()) {
      issues.push(...validateCanonicalField(field.metadata, field.read()));
    }
    const result = { valid: issues.length === 0, issues } as const;
    this.#project(result);
    return result;
  }

  #project(result: UiValidationResult): void {
    const byField: UiCtxObject = {};
    for (const [key] of this.fields) {
      const fieldIssues = result.issues.filter((issue) => issue.fieldKey === key);
      byField[key] = {
        valid: fieldIssues.length === 0,
        issues: fieldIssues.map(issueProjection),
      };
    }
    this.context.replace(
      'validation',
      {
        valid: result.valid,
        issues: result.issues.map(issueProjection),
        fields: byField,
      },
      { source: 'validation-runtime:validate' },
    );
  }
}

export function validateCanonicalField(
  metadata: SysBOFieldMetadata,
  value: unknown,
): readonly UiValidationIssue[] {
  const issues: UiValidationIssue[] = [];
  const missing =
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  if (metadata.required === true && missing) {
    issues.push({
      code: 'required',
      message: `${metadata.label} is required.`,
      severity: 'error',
      fieldKey: metadata.key,
    });
    return issues;
  }
  if (missing) return issues;
  if (typeof value === 'string') {
    if (metadata.minLength !== undefined && value.length < metadata.minLength) {
      issues.push({
        code: 'minLength',
        message: `${metadata.label} must contain at least ${metadata.minLength} characters.`,
        severity: 'error',
        fieldKey: metadata.key,
      });
    }
    if (metadata.maxLength !== undefined && value.length > metadata.maxLength) {
      issues.push({
        code: 'maxLength',
        message: `${metadata.label} must contain at most ${metadata.maxLength} characters.`,
        severity: 'error',
        fieldKey: metadata.key,
      });
    }
  }
  return issues;
}

function issueProjection(issue: UiValidationIssue): UiCtxObject {
  return {
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    ...(issue.fieldKey ? { fieldKey: issue.fieldKey } : {}),
  };
}
