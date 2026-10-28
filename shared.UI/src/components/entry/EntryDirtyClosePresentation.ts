import type { MetadataLanguage } from '@manatos/shared';
import { entryChangeReportLocalized } from '../common/change-report/change-report.js';
import type { UiEntryLevel } from './EntryRuntime.js';
import type { UiDirtyClosePresentation } from '../../runtime/surface/dirty-close-coordinator.js';

/**
 * Derive decision presentation from the owning Entry Surface. The caller owns
 * the level; this helper neither copies edits nor persists any business data.
 */
export function entryDirtyClosePresentation(
  level: UiEntryLevel | null | undefined,
  language: MetadataLanguage,
): UiDirtyClosePresentation {
  if (!level || level.control.kind !== 'entry') return {};
  const entityKey = level.control.invocation.params['entityKey'];
  return {
    ownerLabel: level.control.entityName,
    reviewChanges: () => {
      if (
        typeof entityKey !== 'string' ||
        !level.state.entry.dirty ||
        !level.data.original ||
        !level.data.current
      )
        return null;
      return entryChangeReportLocalized({
        entityKey,
        original: level.data.original,
        current: level.data.current,
        caption: level.state.entry.caption,
        references: level.data.references,
        language,
      });
    },
  };
}
