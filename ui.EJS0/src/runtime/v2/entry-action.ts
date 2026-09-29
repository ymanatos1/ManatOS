import type { UiEntryPersistenceResult } from './entry-persistence.js';
import type { UiValidationResult } from './validation.js';

export type UiEntrySaveStatus = 'saved' | 'unchanged' | 'invalid';

export interface UiEntrySaveResult {
  readonly status: UiEntrySaveStatus;
  readonly validation: UiValidationResult;
  readonly persistence?: UiEntryPersistenceResult;
}
