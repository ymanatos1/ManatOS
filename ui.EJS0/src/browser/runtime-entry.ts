import { EntityListRuntime } from '../runtime/list/entity-list-runtime.js';
import { ownerContextPresentation } from '../runtime/v2/owner-context-presentation.js';
import {
  OrganizationHierarchySurface,
  organizationHierarchyEntryState,
} from '../runtime/v2/organization-hierarchy-surface.js';
import {
  UiHierarchyRelationshipPolicy,
  type UiHierarchyRelation,
  type UiHierarchyRecord,
  type UiHierarchyRelationshipOptions,
} from '../runtime/v2/hierarchy-relationship.js';
import { hierarchicalReportRenderer } from '../runtime/hierarchical-report.js';
import { changeReportPopup } from '../runtime/change-report-popup.js';
import { alertPopup } from '../runtime/alert-popup.js';
import { pictureValuePresentation } from '../runtime/picture-value-presentation.js';
import { semanticChangePresentation } from '../runtime/semantic-change-presentation.js';
import { semanticReportPresentation } from '../runtime/semantic-report-presentation.js';
import {
  entrySemanticChangeReport,
  hierarchySemanticChangeReport,
  recoveredFieldDeltaReport,
} from '../runtime/v2/semantic-change-report.js';
import { workspaceRecoveryController } from '../runtime/workspace-recovery.js';
import { semanticEqual } from '../runtime/v2/dirty.js';
import { EntityEntrySurface } from '../runtime/v2/entity-entry-surface.js';
import { ownedEntryPersistence } from '../runtime/v2/owned-entry-persistence.js';
import type {
  UiEntryPersistenceDefinition,
  UiEntryPersistenceResult,
} from '../runtime/v2/entry-persistence.js';
import type { SysBOFieldMetadata, ManatOSObjectMetadata } from '@manatos/shared/metadata/bo';
import type { SysBOUIMetadata } from '@manatos/shared/metadata/ui';
import { UiSurfaceRecoveryRegistry } from '../runtime/v2/surface-recovery.js';
import {
  organizationRecoveryAdapter,
  organizationRecoveryProvider,
} from '../runtime/v2/organization-recovery.js';
import { ownedEntryRecoveryProvider } from '../runtime/v2/owned-entry-recovery.js';
import {
  ownedReferenceOptions,
  referenceTargetEntityKey,
} from '../runtime/v2/owned-reference-options.js';
import {
  persistedCollectionPictureSource,
  persistedScalarPictureSource,
} from '@manatos/shared/presentation/picture-value';
import {
  buildWorkspaceCommitPlan,
  commitPlanReportModel,
} from '../runtime/v2/workspace-commit-plan.js';
/** Browser entry point for the typed ManatOS UI runtime. */
export type {
  UiExitStatus,
  UiHostTypeId,
  UiInvocation,
  UiLevelId,
  UiLevelResult,
  UiSurfaceTypeId,
  UiViewId,
} from '../runtime/v2/contracts.js';
export { UiLevel } from '../runtime/v2/ui-level.js';
export type { UiLevelLifecycle } from '../runtime/v2/ui-level.js';
export { UiContext } from '../runtime/v2/ui-context.js';
export type {
  UiCtxChange,
  UiCtxMutationCause,
  UiCtxSubscriptionDetails,
} from '../runtime/v2/ui-context.js';
export { CtxBinding, EntityFieldBinding } from '../runtime/v2/binding.js';
export type { UiBindingListener, UiBindingMode } from '../runtime/v2/binding.js';
export { EntityFieldRuntime } from '../runtime/v2/field.js';
export {
  UiExpressionRuntime,
  expressionDependencies,
  isUiExpressionDefinition,
  resolveUiDynamicValue,
} from '../runtime/v2/expression.js';
export type {
  UiDynamicValue,
  UiExpressionDefinition,
  UiExpressionDependency,
  UiExpressionListener,
} from '../runtime/v2/expression.js';
export { UiDirtyRuntime } from '../runtime/v2/dirty.js';
export { semanticEqual };
export { EntityEntryValidationRuntime, validateCanonicalField } from '../runtime/v2/validation.js';
export type {
  UiValidationIssue,
  UiValidationResult,
  UiValidationSeverity,
} from '../runtime/v2/validation.js';
export { UiPolicyRuntime } from '../runtime/v2/policy.js';
export type { UiEffectivePolicy, UiPolicyDefinition } from '../runtime/v2/policy.js';
export type {
  UiFieldComponentCompatibility,
  UiFieldComponentDefinition,
} from '../runtime/v2/field.js';
export {
  UiComponentInstance,
  assertComponentBindingCompatibility,
} from '../runtime/v2/component.js';
export type {
  UiComponentBindingRequirement,
  UiComponentController,
  UiComponentCreateContext,
  UiComponentDefinition,
  UiComponentInstanceId,
  UiComponentLifecycle,
} from '../runtime/v2/component.js';
export { UI_STRUCTURAL_ROOT_ID, UiRuntime } from '../runtime/v2/ui-runtime.js';
export { projectUiLayout } from '../runtime/v2/layout.js';
export type { UiLayoutNode, UiLayoutNodeKind, UiLayoutProjection } from '../runtime/v2/layout.js';
export { UiRegistry } from '../runtime/v2/registry.js';
export type {
  UiCapabilityId,
  UiExtensionDefinition,
  UiExtensionId,
  UiRegistryOptions,
} from '../runtime/v2/registry.js';
export { UiRuntimeRegistries } from '../runtime/v2/registries.js';
export type {
  UiHostOpenContext,
  UiOpenedSurface,
  UiOpenRequest,
  UiSurfaceOpenContext,
} from '../runtime/v2/surface-host.js';
export {
  UiPresentationInstance,
  UiRegionInstance,
  UiTabInstance,
} from '../runtime/v2/presentation.js';
export type {
  UiPresentationDefinition,
  UiPresentationLifecycle,
  UiRegionDefinition,
  UiRegionId,
  UiTabDefinition,
  UiTabId,
} from '../runtime/v2/presentation.js';
export type {
  UiActionDefinition,
  UiBindingDefinition,
  UiHostDefinition,
  UiPersistenceDefinition,
  UiRelationshipDefinition,
  UiResourceProviderDefinition,
  UiSurfaceDefinition,
} from '../runtime/v2/registries.js';

import { installBootstrapLayouts } from './bootstrap-layout.js';
import { installBrowserHostBridge } from './browser-host-bridge.js';
import { installPopupPresentationDescriptors } from './popup-presentation.js';
import { installRuntimeBootstrap } from './runtime-bootstrap.js';

const browserUiRuntime = installRuntimeBootstrap();
const surfaceRecoveryRegistry = new UiSurfaceRecoveryRegistry();
surfaceRecoveryRegistry.register(organizationRecoveryProvider);
surfaceRecoveryRegistry.register(ownedEntryRecoveryProvider);
(
  window.ManatOS as typeof window.ManatOS & { surfaceRecovery?: UiSurfaceRecoveryRegistry }
).surfaceRecovery = surfaceRecoveryRegistry;
(
  window.ManatOS as typeof window.ManatOS & {
    organizationRecoveryAdapter?: typeof organizationRecoveryAdapter;
  }
).organizationRecoveryAdapter = organizationRecoveryAdapter;

installBootstrapLayouts();
installPopupPresentationDescriptors();
installBrowserHostBridge(browserUiRuntime);
pictureValuePresentation.install();
semanticChangePresentation.install();
hierarchicalReportRenderer.install();
semanticReportPresentation.install();
changeReportPopup.install();
alertPopup.install();
workspaceRecoveryController.install();
export {
  createEntityEntryPresentation,
  entryPresentationDefinition,
} from '../runtime/v2/entry-presentation.js';
export type { EntityEntryPresentationFactory } from '../runtime/v2/entry-presentation.js';
export { EntityEntrySurface } from '../runtime/v2/entity-entry-surface.js';
export { OrganizationHierarchySurface } from '../runtime/v2/organization-hierarchy-surface.js';
export {
  buildWorkspaceCommitPlan,
  commitPlanReportModel,
} from '../runtime/v2/workspace-commit-plan.js';
export type {
  UiWorkspaceCommitPlan,
  UiCommitPlanOperation,
} from '../runtime/v2/workspace-commit-plan.js';
export type { OrganizationHierarchySurfaceOptions } from '../runtime/v2/organization-hierarchy-surface.js';
export {
  changedFieldKeys,
  emptyWorkspaceTransaction,
  flattenWorkspaceMutations,
  normalizeWorkspaceTransaction,
  removeWorkspaceMutation,
  upsertWorkspaceMutation,
} from '../runtime/v2/workspace-transaction.js';
export type {
  UiWorkspaceIdentityKind,
  UiWorkspaceReference,
  UiWorkspaceMutationOperation,
  UiWorkspaceRecordMutation,
  UiWorkspaceTransactionSnapshot,
} from '../runtime/v2/workspace-transaction.js';
export type {
  EntityEntryMode,
  EntityEntrySurfaceLifecycle,
  EntityEntrySurfaceOptions,
} from '../runtime/v2/entity-entry-surface.js';
export { returnToCallerPersistence } from '../runtime/v2/entry-persistence.js';
export type {
  UiEntryPersistenceDefinition,
  UiEntryPersistenceKind,
  UiEntryPersistenceRequest,
  UiEntryPersistenceResult,
  UiEntryReturnHandler,
} from '../runtime/v2/entry-persistence.js';
export type { UiEntrySaveResult, UiEntrySaveStatus } from '../runtime/v2/entry-action.js';
export { EntityCollectionRuntime, sameCollectionRowIdentity } from '../runtime/v2/collection.js';
export type { UiCollectionIdentityFields, UiCollectionRow } from '../runtime/v2/collection.js';
export { EmbeddedCollectionEntrySession } from '../runtime/v2/collection-entry.js';
export type { EmbeddedCollectionEntryOptions } from '../runtime/v2/collection-entry.js';

export {
  UI_ENTRY_RECOVERY_FORMAT,
  applyEntityEntryRecovery,
  captureEntityEntryRecovery,
} from '../runtime/v2/recovery.js';
export type {
  UiEntryRecoverySnapshot,
  UiRecoveryOpeningDescriptor,
} from '../runtime/v2/recovery.js';
export {
  BoundFieldComponentController,
  GENERAL_FIELD_COMPONENTS,
  registerGeneralFieldComponents,
} from '../runtime/v2/field-components.js';

export {
  PictureFieldComponentController,
  PicturesFieldComponentController,
  RICH_FIELD_COMPONENTS,
  RichTextFieldComponentController,
  registerRichFieldComponents,
} from '../runtime/v2/rich-field-components.js';
export type {
  PendingPicturePayload,
  PictureDescriptor,
  PicturesValue,
  PictureValue,
  RichTextEditorMode,
} from '../runtime/v2/rich-field-components.js';

// Stage 19: expose the host-neutral List runtime to browser presentation adapters.

window.ManatOS ||= {};
const browserManatOS = window.ManatOS as typeof window.ManatOS & {
  EntityListRuntime?: typeof EntityListRuntime;
};
browserManatOS.EntityListRuntime = EntityListRuntime;
(
  browserManatOS as typeof browserManatOS & {
    organizationHierarchyEntryState?: typeof organizationHierarchyEntryState;
  }
).organizationHierarchyEntryState = organizationHierarchyEntryState;
(browserManatOS as typeof browserManatOS & { semanticEqual?: typeof semanticEqual }).semanticEqual =
  semanticEqual;
(
  browserManatOS as typeof browserManatOS & {
    hierarchyRelationshipEligibility?: (
      options: UiHierarchyRelationshipOptions,
      rows: readonly UiHierarchyRecord[],
      member: UiHierarchyRecord | null | undefined,
      candidate: UiHierarchyRecord | null | undefined,
      relation: UiHierarchyRelation,
    ) => ReturnType<UiHierarchyRelationshipPolicy['eligibility']>;
  }
).hierarchyRelationshipEligibility = (options, rows, member, candidate, relation) =>
  new UiHierarchyRelationshipPolicy(options).eligibility(rows, member, candidate, relation);
(browserManatOS as typeof browserManatOS & { workspaceCommit?: unknown }).workspaceCommit =
  Object.freeze({
    buildPlan: buildWorkspaceCommitPlan,
    reportModel: commitPlanReportModel,
  });
(
  browserManatOS as typeof browserManatOS & { semanticChangeReport?: unknown }
).semanticChangeReport = Object.freeze({
  entry: entrySemanticChangeReport,
  hierarchy: hierarchySemanticChangeReport,
  recoveredFieldDelta: recoveredFieldDeltaReport,
});

const organizationSurfaces = new Map<string, OrganizationHierarchySurface>();
const ownerReferenceProjectionSubscriptions = new Map<string, () => void>();

function releaseOwnerReferenceProjectionSubscription(path: string): void {
  ownerReferenceProjectionSubscriptions.get(path)?.();
  ownerReferenceProjectionSubscriptions.delete(path);
}

function ensureOwnerReferenceProjectionSubscription(surface: OrganizationHierarchySurface): void {
  const path = surface.level.context?.path;
  if (
    !path ||
    ownerReferenceProjectionSubscriptions.has(path) ||
    !surface.level.context?.port.subscribe
  )
    return;
  const release = surface.ownerProvider.subscribeChanges(() => {
    for (const candidate of browserUiRuntime.levels.values()) {
      if (
        candidate.invocation?.surface === 'entry' &&
        candidate.ownerProvider === surface.ownerProvider &&
        candidate.context
      )
        refreshOwnedEntryReferenceOptions(candidate.context.path);
    }
  });
  ownerReferenceProjectionSubscriptions.set(path, release);
}

const bootstrapRuntimeResources = (ownerOnly = false): Record<string, unknown> => {
  const node = document.getElementById('manatosUiBootstrap');
  if (!node?.textContent) return {};
  try {
    const bootstrap = JSON.parse(node.textContent) as Record<string, unknown> | null;
    if (!bootstrap || typeof bootstrap !== 'object') return {};
    const direct = bootstrap.runtimeResources;
    if (!ownerOnly && direct && typeof direct === 'object' && !Array.isArray(direct))
      return direct as Record<string, unknown>;
    if (!ownerOnly) return {};
    const owner = bootstrap.owner;
    if (owner && typeof owner === 'object' && !Array.isArray(owner)) {
      const resources = (owner as Record<string, unknown>).runtimeResources;
      if (resources && typeof resources === 'object' && !Array.isArray(resources))
        return resources as Record<string, unknown>;
    }
  } catch {
    // Invalid bootstrap is handled by the normal bootstrap path; private resources
    // must never create a second startup failure mode.
  }
  return {};
};
const organizationSurfaceFor = (
  path: string,
  options: ConstructorParameters<typeof OrganizationHierarchySurface>[1] = {},
): OrganizationHierarchySurface => {
  const level = [...browserUiRuntime.levels.values()].find(
    (candidate) => candidate.context?.path === path,
  );
  const existing = organizationSurfaces.get(path);
  if (existing && existing.level === level) {
    const configured = existing.configure(options);
    level?.bindOwnerProvider(configured.ownerProvider);
    ensureOwnerReferenceProjectionSubscription(configured);
    return configured;
  }
  if (existing) {
    releaseOwnerReferenceProjectionSubscription(path);
    existing.disposeProvider();
    organizationSurfaces.delete(path);
  }
  if (!level) throw new Error(`Organization hierarchy UiLevel is not live: ${path}`);
  const surface = new OrganizationHierarchySurface(level, options);
  organizationSurfaces.set(path, surface);
  level.bindOwnerProvider(surface.ownerProvider);
  ensureOwnerReferenceProjectionSubscription(surface);
  return surface;
};
(
  browserManatOS as typeof browserManatOS & {
    organizationHierarchySurface?: typeof organizationSurfaceFor;
  }
).organizationHierarchySurface = organizationSurfaceFor;

const browserEntrySurfaces = new Map<string, EntityEntrySurface>();

const uiLevelForPath = (path: string) =>
  [...browserUiRuntime.levels.values()].find((candidate) => candidate.context?.path === path) ??
  null;
const uiRuntimeResourceForPath = (path: string, key: string): unknown => {
  const level = uiLevelForPath(path);
  if (!level) return undefined;
  if (level.invocation?.surface === 'entry') return ensureBrowserEntrySurface(path).resource(key);
  if (level.invocation?.surface === 'hierarchy')
    return organizationSurfaceFor(path).runtimeResource(key);
  return level.getRuntimeResource(key);
};
const setUiRuntimeResourceForPath = (path: string, key: string, value: unknown): boolean => {
  const level = uiLevelForPath(path);
  if (!level) return false;
  if (level.invocation?.surface === 'entry')
    ensureBrowserEntrySurface(path).acceptResource(key, value);
  else if (level.invocation?.surface === 'hierarchy')
    organizationSurfaceFor(path).mergeRuntimeResources({ [key]: value });
  else level.setRuntimeResource(key, value);
  return true;
};
const uiRuntimeResourcesForPath = (path: string): Readonly<Record<string, unknown>> => {
  const level = uiLevelForPath(path);
  if (!level) return {};
  if (level.invocation?.surface === 'entry') return ensureBrowserEntrySurface(path).resources();
  if (level.invocation?.surface === 'hierarchy')
    return organizationSurfaceFor(path).runtimeResourceSnapshot();
  return level.runtimeResourceSnapshot();
};
(
  browserManatOS as typeof browserManatOS & {
    uiRuntimeResourceForPath?: typeof uiRuntimeResourceForPath;
  }
).uiRuntimeResourceForPath = uiRuntimeResourceForPath;
(
  browserManatOS as typeof browserManatOS & {
    setUiRuntimeResourceForPath?: typeof setUiRuntimeResourceForPath;
  }
).setUiRuntimeResourceForPath = setUiRuntimeResourceForPath;
(
  browserManatOS as typeof browserManatOS & {
    uiRuntimeResourcesForPath?: typeof uiRuntimeResourcesForPath;
  }
).uiRuntimeResourcesForPath = uiRuntimeResourcesForPath;

// An owned Entry page bootstraps its Organization as a distinct ancestor UiLevel.
// The Organization page script is not present in that document, so adopt the
// ancestor's canonical typed dirty runtime here. This does not copy Organization
// state into the Entry; it restores the normal lifecycle authority of the already
// bootstrapped Organization ancestor.
for (const candidate of browserUiRuntime.levels.values()) {
  if (candidate.invocation?.surface !== 'hierarchy' || !candidate.context) continue;
  const candidatePath = candidate.context.path;
  const hasEntryDescendant = [...browserUiRuntime.levels.values()].some(
    (other) =>
      other !== candidate &&
      other.invocation?.surface === 'entry' &&
      other.context?.path.startsWith(`${candidatePath}.level`),
  );
  if (hasEntryDescendant) organizationSurfaceFor(candidatePath);
}

const initialEntryResources = bootstrapRuntimeResources(false);
if (Object.keys(initialEntryResources).length) {
  const entryLevel = [...browserUiRuntime.levels.values()]
    .filter((candidate) => candidate.invocation?.surface === 'entry' && candidate.context)
    .at(-1);
  entryLevel?.replaceRuntimeResources(initialEntryResources);
}

const initialOrganizationResources = bootstrapRuntimeResources(true);
if (Object.keys(initialOrganizationResources).length) {
  const hierarchyLevels = [...browserUiRuntime.levels.values()].filter(
    (candidate) => candidate.invocation?.surface === 'hierarchy' && candidate.context,
  );
  const ownerLevel = hierarchyLevels.at(-1);
  if (ownerLevel?.context) {
    const surface = organizationSurfaceFor(ownerLevel.context.path);
    surface.replaceRuntimeResources(initialOrganizationResources);
    surface.pruneRuntimeResources();
  }
}

type BrowserRepositorySave = (
  request: import('../runtime/v2/entry-persistence.js').UiEntryPersistenceRequest,
) => Promise<UiEntryPersistenceResult>;

const canonicalEntityFor = (entityKey: string): Readonly<Record<string, unknown>> | null => {
  const ctx = browserManatOS.ctx as
    (typeof browserManatOS.ctx & { entity?: (key: string) => unknown }) | undefined;
  const candidate = ctx?.entity?.(entityKey);
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? (candidate as Readonly<Record<string, unknown>>)
    : null;
};

const persistedPictureResourceKey = (picture: unknown): string | null => {
  if (!picture || typeof picture !== 'object' || Array.isArray(picture)) return null;
  const descriptor = picture as Readonly<Record<string, unknown>>;
  if (descriptor.pending === true) return null;
  const identity = String(descriptor.id ?? descriptor.revision ?? '');
  return identity ? `picture:${identity}` : null;
};

const binaryBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
};

/** Copy persisted picture resources behind stable descriptors into the Entry's own #data. */
const hydratePersistedEntryResources = async (
  surface: EntityEntrySurface,
  metadata: ManatOSObjectMetadata<Record<string, unknown>>,
): Promise<void> => {
  const current = surface.canonicalCurrent();
  const original = surface.context.get('data.entry.original') as Readonly<
    Record<string, unknown>
  > | null;
  const identity = String(current?.id ?? surface.context.get('control.recordId') ?? '');
  if (!identity) return;

  const requests = new Map<string, string>();
  const visit = (record: Readonly<Record<string, unknown>> | null) => {
    if (!record) return;
    for (const [fieldKey, field] of Object.entries(metadata.fieldDefinition) as [
      string,
      SysBOFieldMetadata,
    ][]) {
      if (field.type === 'picture') {
        const descriptor = record[fieldKey] as Readonly<Record<string, unknown>> | null;
        const key = persistedPictureResourceKey(descriptor);
        const source = persistedScalarPictureSource(
          surface.entityKey,
          identity,
          fieldKey,
          descriptor,
        );
        if (key && source && surface.resource(key) === undefined) requests.set(key, source);
      } else if (field.type === 'pictures') {
        const pictures = Array.isArray(record[fieldKey]) ? record[fieldKey] : [];
        for (const value of pictures) {
          const descriptor =
            value && typeof value === 'object' && !Array.isArray(value)
              ? (value as Readonly<Record<string, unknown>>)
              : null;
          const key = persistedPictureResourceKey(descriptor);
          const source = persistedCollectionPictureSource(
            surface.entityKey,
            identity,
            fieldKey,
            descriptor,
          );
          if (key && source && surface.resource(key) === undefined) requests.set(key, source);
        }
      }
    }
  };
  visit(original);
  visit(current);

  await Promise.all(
    [...requests].map(async ([key, source]) => {
      const response = await fetch(source, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Resource request failed (${response.status}): ${source}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      surface.acceptResource(key, {
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        dataBase64: binaryBase64(bytes),
      });
    }),
  );
};

/** Adopt each live browser Entry exactly once. Save reuses this semantic surface. */
const ensureBrowserEntrySurface = (path: string): EntityEntrySurface => {
  const existing = browserEntrySurfaces.get(path);
  if (existing && existing.lifecycle !== 'disposed') return existing;

  const level = uiLevelForPath(path);
  if (!level?.context || level.invocation?.surface !== 'entry')
    throw new Error(`Entry UiLevel is not live: ${path}`);

  const entityKey = String(level.invocation.entity ?? level.context.get('control.entityKey') ?? '');
  const resolvedEntity = canonicalEntityFor(entityKey);
  const entity =
    resolvedEntity && typeof resolvedEntity === 'object' && !Array.isArray(resolvedEntity)
      ? (resolvedEntity as Record<string, unknown>)
      : undefined;
  const metadata = entity?.metadata as ManatOSObjectMetadata<Record<string, unknown>> | undefined;
  const uiMetadata = entity?.uiMetadata as SysBOUIMetadata | undefined;
  if (!metadata || !uiMetadata)
    throw new Error(`Entry metadata is unavailable for '${entityKey}'.`);

  const modeValue = String(level.context.get('control.mode') ?? level.invocation.mode ?? 'edit');
  const mode = modeValue === 'create' || modeValue === 'view' ? modeValue : 'edit';
  const viewKey = level.context.get('control.presentation.uiView.key');
  const surface = new EntityEntrySurface(level, level.context, {
    entityKey,
    mode,
    uiMetadata,
    initialRecord: level.context.get('data.entry.current') as Readonly<Record<string, unknown>>,
    fieldMetadata: metadata.fieldDefinition as Readonly<Record<string, SysBOFieldMetadata>>,
    requestedView: typeof viewKey === 'string' ? viewKey : null,
  });
  surface.adopt();
  if (level.ownerProvider) {
    const identity = String(
      surface.canonicalCurrent()?.id ?? level.context.get('control.recordId') ?? '',
    );
    if (identity) {
      const transfer = level.ownerProvider.provideEntryIfPresent(entityKey, identity);
      if (transfer) surface.importEntry(transfer);
    }
  }
  browserEntrySurfaces.set(path, surface);
  void hydratePersistedEntryResources(surface, metadata).catch((error) => {
    console.warn('Entry persisted resources could not be hydrated.', error);
  });
  return surface;
};

const saveBrowserEntryForPath = async (path: string, repositorySave: BrowserRepositorySave) => {
  const surface = ensureBrowserEntrySurface(path);
  const owner = surface.level.ownerProvider;

  let persistence: UiEntryPersistenceDefinition;
  if (owner) {
    const resolvedEntity = canonicalEntityFor(surface.entityKey);
    const entity =
      resolvedEntity && typeof resolvedEntity === 'object' && !Array.isArray(resolvedEntity)
        ? (resolvedEntity as Record<string, unknown>)
        : undefined;
    const metadata = entity?.metadata as ManatOSObjectMetadata<Record<string, unknown>> | undefined;
    if (!metadata) throw new Error(`Entry metadata is unavailable for '${surface.entityKey}'.`);
    const parentLevel = surface.level.parent;
    const parentCurrent =
      parentLevel?.invocation?.surface === 'entry' && parentLevel.context
        ? (parentLevel.context.get('data.entry.current') as Readonly<
            Record<string, unknown>
          > | null)
        : null;
    const parentIdentity = parentCurrent
      ? String(parentCurrent.id ?? parentLevel?.context?.get('control.recordId') ?? '')
      : '';
    persistence = ownedEntryPersistence({
      entry: surface,
      owner,
      metadata,
      parent:
        parentLevel?.invocation?.surface === 'entry' &&
        parentLevel.invocation.entity &&
        parentIdentity
          ? { entityKey: parentLevel.invocation.entity, identity: parentIdentity }
          : null,
    });
  } else {
    persistence = {
      id: 'browser-repository',
      contractVersion: 1,
      kind: 'repository',
      save: repositorySave,
    };
  }

  const result = await surface.save(persistence);
  return { ...result, persistenceKind: persistence.kind };
};

// Root/bootstrap Entries are already live when this module initializes. Popup and
// other subsequently rendered Entries are adopted by the rendered-surface event below.
for (const candidate of browserUiRuntime.levels.values()) {
  if (candidate.invocation?.surface === 'entry' && candidate.context)
    ensureBrowserEntrySurface(candidate.context.path);
}

(
  browserManatOS as typeof browserManatOS & {
    saveEntrySurfaceForPath?: typeof saveBrowserEntryForPath;
  }
).saveEntrySurfaceForPath = saveBrowserEntryForPath;

const ownerContinuationFormStateForPath = (
  path: string,
): Readonly<Record<string, unknown>> | null => {
  const provider = uiLevelForPath(path)?.ownerProvider;
  return provider?.continuationFormStateSnapshot() ?? null;
};
(
  browserManatOS as typeof browserManatOS & {
    ownerContinuationFormStateForPath?: typeof ownerContinuationFormStateForPath;
  }
).ownerContinuationFormStateForPath = ownerContinuationFormStateForPath;

const ownerProviderForPath = (path: string) => uiLevelForPath(path)?.ownerProvider ?? null;
(
  browserManatOS as typeof browserManatOS & {
    ownerProviderForPath?: typeof ownerProviderForPath;
  }
).ownerProviderForPath = ownerProviderForPath;

const ownerWorkspaceReferenceSourceFor = (childPath: string) =>
  uiLevelForPath(childPath)?.ownerProvider ?? null;

/**
 * Reproject reference domains for one owned Entry from factual reference data plus
 * the live ultimate-owner transaction. Non-owned Entries deliberately no-op.
 */
const refreshOwnedEntryReferenceOptions = (entryPath: string): boolean => {
  const entryLevel = [...browserUiRuntime.levels.values()].find(
    (candidate) =>
      candidate.context?.path === entryPath && candidate.invocation?.surface === 'entry',
  );
  if (!entryLevel?.context) return false;
  const ownerWorkspace = ownerWorkspaceReferenceSourceFor(entryPath);
  if (!ownerWorkspace) return false;

  const entityFor = canonicalEntityFor;
  const entityKey = String(
    entryLevel.invocation?.entity ?? entryLevel.context.get('control.entityKey') ?? '',
  );
  const sourceEntity = entityFor(entityKey);
  const sourceMetadata = sourceEntity?.metadata as Readonly<Record<string, unknown>> | undefined;
  const definitions = sourceMetadata?.fieldDefinition;
  if (
    !sourceMetadata ||
    !definitions ||
    typeof definitions !== 'object' ||
    Array.isArray(definitions)
  )
    return false;

  const referenceData =
    (entryLevel.context.get('data.resources.referenceData') as Readonly<
      Record<string, readonly Readonly<Record<string, unknown>>[]>
    > | null) ?? {};
  let changed = false;

  for (const [fieldKey, rawField] of Object.entries(definitions)) {
    if (!rawField || typeof rawField !== 'object' || Array.isArray(rawField)) continue;
    if ((rawField as Readonly<Record<string, unknown>>).type !== 'reference') continue;
    const targetEntityKey = referenceTargetEntityKey(
      sourceMetadata as unknown as Parameters<typeof referenceTargetEntityKey>[0],
      fieldKey,
    );
    if (!targetEntityKey || !ownerWorkspace.canOwnEntity(targetEntityKey)) continue;
    const targetEntity = entityFor(targetEntityKey);
    const targetMetadata = targetEntity?.metadata;
    if (!targetMetadata || typeof targetMetadata !== 'object' || Array.isArray(targetMetadata))
      continue;
    const targetUiMetadata =
      (targetEntity?.uiMetadata as SysBOUIMetadata | null | undefined) ?? null;
    const baseOptions = Array.isArray(referenceData[fieldKey]) ? referenceData[fieldKey]! : [];
    const projectedEntityIcon = baseOptions.find(
      (candidate) => typeof candidate.__entityIcon === 'string' && candidate.__entityIcon,
    )?.__entityIcon;
    const options = ownedReferenceOptions(
      baseOptions,
      ownerWorkspace.queryEntries(targetEntityKey),
      targetMetadata as ManatOSObjectMetadata<Record<string, unknown>>,
      targetUiMetadata,
      typeof projectedEntityIcon === 'string' ? projectedEntityIcon : null,
    );
    const value = entryLevel.context.get(`data.fields.${fieldKey}.value`);
    const option =
      options.find(
        (candidate) => String(candidate.id ?? candidate.value ?? '') === String(value ?? ''),
      ) ?? null;
    entryLevel.context.replace(`data.fields.${fieldKey}.options`, options, {
      source: 'owned-reference-projection',
      triggerPath: 'owner-provider',
    });
    entryLevel.context.replace(`data.fields.${fieldKey}.option`, option, {
      source: 'owned-reference-projection',
      triggerPath: `data.fields.${fieldKey}.options`,
    });
    changed = true;
  }
  if (changed) {
    (
      browserManatOS as typeof browserManatOS & {
        refreshOwnedReferencePresentation?: (path: string) => boolean;
      }
    ).refreshOwnedReferencePresentation?.(entryPath);
  }
  return changed;
};
(
  browserManatOS as typeof browserManatOS & {
    refreshOwnedEntryReferenceOptions?: typeof refreshOwnedEntryReferenceOptions;
  }
).refreshOwnedEntryReferenceOptions = refreshOwnedEntryReferenceOptions;

for (const candidate of browserUiRuntime.levels.values()) {
  if (candidate.invocation?.surface === 'entry' && candidate.context)
    refreshOwnedEntryReferenceOptions(candidate.context.path);
}

// Popup/embedded Entry UiLevels are adopted after this module initializes. The
// canonical rendered-surface lifecycle event is the point at which their CTX is
// live and can receive the same owner-aware projection as full-page Entries.
window.addEventListener('manatos:ui-surface-rendered', (event) => {
  const path = String((event as CustomEvent<{ path?: string }>).detail?.path ?? '');
  if (!path) return;
  const level = uiLevelForPath(path);
  if (level?.invocation?.surface === 'entry') ensureBrowserEntrySurface(path);
  refreshOwnedEntryReferenceOptions(path);
});

window.addEventListener('manatos:ui-level-disposing', (event) => {
  const path = String((event as CustomEvent<{ path?: string }>).detail?.path ?? '');
  if (!path) return;
  releaseOwnerReferenceProjectionSubscription(path);
  const entrySurface = browserEntrySurfaces.get(path);
  entrySurface?.dispose();
  browserEntrySurfaces.delete(path);
  const organizationSurface = organizationSurfaces.get(path);
  organizationSurface?.disposeProvider();
  organizationSurfaces.delete(path);
});

export { EntityListRuntime };
export type { EntityListQuery, EntityListSnapshot } from '../runtime/list/entity-list-contracts.js';

export { ownerContextPresentation } from '../runtime/v2/owner-context-presentation.js';
(
  browserManatOS as typeof browserManatOS & {
    ownerContextPresentation?: typeof ownerContextPresentation;
  }
).ownerContextPresentation = ownerContextPresentation;
