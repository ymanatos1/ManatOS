import { canonicalEnumItems } from '../metadata/subsystems/enum-registry.js';
import { MANATOS_COMPANY, resolvePlatform } from '../domain/company-platform.js';
import { allManatOSObjectMetadata } from '../metadata/bo/registry.js';
import {
  allManatOSSubsystemMetadata,
  effectiveSubsystemContextCatalogue,
  effectiveEnumKeys,
  effectiveObjectKeys,
  subsystemContextCatalogue,
} from '../metadata/subsystems/registry.js';
import type { ManatOSSubsystemContextProjection } from '../metadata/subsystems/registry.js';
import type { ManatOSSubsystemMetadata } from '../metadata/subsystems/types.js';
import type { CompanyInfo, SysPlatform } from '../platforms/types.js';
import type {
  ManatOSCompanyContext,
  ManatOSEffectiveRuntimeContext,
  ManatOSEntitiesContext,
  ManatOSEnumsContext,
  ManatOSEntityContext,
  ManatOSHostSystemContext,
  ManatOSRuntimeCompanyContext,
  ManatOSSystemContext,
  ManatOSUserContext,
} from './manatos-context.js';
import { contextPointer } from './manatos-context.js';

const CONTEXT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function entityContextName(objectKey: string): string {
  const metadata = allManatOSObjectMetadata[objectKey as keyof typeof allManatOSObjectMetadata];
  if (!metadata) throw new Error(`Unknown ManatOS object key for ctx.entities: ${objectKey}`);
  if (!CONTEXT_IDENTIFIER.test(metadata.name)) {
    throw new Error(`Invalid ManatOS ctx entity identifier: ${metadata.name}`);
  }
  return metadata.name;
}

function sysBOContext(keys: Iterable<string>) {
  return Object.freeze(
    Object.fromEntries(
      [...keys].map((sysBOKey) => {
        const name = entityContextName(sysBOKey);
        return [name, Object.freeze({ key: sysBOKey, name, contribution: { sysBOKey } })];
      }),
    ),
  );
}

export function createCompanyContext(
  company: CompanyInfo = MANATOS_COMPANY,
  currentPlatform: SysPlatform | null = resolvePlatform(company),
): ManatOSCompanyContext {
  const currentPlatformIndex =
    currentPlatform === null
      ? -1
      : company.platforms.findIndex((candidate) => candidate.id === currentPlatform.id);
  const effectiveKeys = effectiveObjectKeys(company, currentPlatform);
  const companyKeys = Object.values(allManatOSObjectMetadata)
    .filter((metadata) => {
      const subsystem =
        allManatOSSubsystemMetadata[metadata.subsystem as keyof typeof allManatOSSubsystemMetadata];
      return effectiveKeys.has(metadata.key) && subsystem?.owner.kind === 'manatos';
    })
    .map((metadata) => metadata.key);
  return Object.freeze({
    ...company,
    sysBO: sysBOContext(companyKeys),
    platforms: Object.freeze(
      company.platforms.map((platform) => {
        const platformKeys =
          currentPlatform !== null && platform.id === currentPlatform.id
            ? Object.values(allManatOSObjectMetadata)
                .filter((metadata) => {
                  const subsystem =
                    allManatOSSubsystemMetadata[
                      metadata.subsystem as keyof typeof allManatOSSubsystemMetadata
                    ];
                  return (
                    effectiveKeys.has(metadata.key) &&
                    subsystem?.owner.kind === 'platform' &&
                    subsystem.owner.platformId === platform.id
                  );
                })
                .map((metadata) => metadata.key)
            : [];
        return Object.freeze({ ...platform, sysBO: sysBOContext(platformKeys) });
      }),
    ),
    currentPlatform: currentPlatform?.id ?? null,
    currentPlatformIndex,
  });
}

/** Build the stable modern Company branch without duplicating effective entity catalogues. */
export function createRuntimeCompanyContext(
  company: CompanyInfo = MANATOS_COMPANY,
  currentPlatform: SysPlatform | null = resolvePlatform(company),
): ManatOSRuntimeCompanyContext {
  const currentPlatformIndex =
    currentPlatform === null
      ? -1
      : company.platforms.findIndex((candidate) => candidate.id === currentPlatform.id);

  return Object.seal({
    ...company,
    platforms: Object.freeze(company.platforms.map((platform) => Object.freeze({ ...platform }))),
    currentPlatform: currentPlatform?.id ?? null,
    currentPlatformIndex,
  });
}

/** Update only the mutable current-platform selector of the stable modern Company branch. */
export function selectRuntimeCompanyPlatform(
  companyContext: ManatOSRuntimeCompanyContext,
  currentPlatform: SysPlatform | null,
): void {
  companyContext.currentPlatform = currentPlatform?.id ?? null;
  companyContext.currentPlatformIndex =
    currentPlatform === null
      ? -1
      : companyContext.platforms.findIndex((candidate) => candidate.id === currentPlatform.id);
}

function contextMetadata(value: unknown, omitOwnKey = false): unknown {
  if (Array.isArray(value)) return value.map((item) => contextMetadata(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'ast' && !(omitOwnKey && (key === 'key' || key === 'subsystem')))
      .map(([key, child]) => [key, contextMetadata(child)]),
  );
}

/** Effective canonical enum catalogue for the selected subsystem composition. */
export function createEnumsContext(
  company: CompanyInfo = MANATOS_COMPANY,
  currentPlatform: SysPlatform | null = resolvePlatform(company),
): ManatOSEnumsContext {
  const effective = effectiveEnumKeys(company, currentPlatform);
  return Object.freeze(
    Object.fromEntries(
      (Object.values(allManatOSSubsystemMetadata) as readonly ManatOSSubsystemMetadata[]).flatMap(
        (subsystem) =>
          Object.values(subsystem.enums ?? {})
            .filter((definition) => effective.has(definition.key))
            .map((definition) => [
              definition.name,
              Object.freeze({
                key: definition.key,
                name: definition.name,
                subsystem: subsystem.key,
                label: definition.label,
                values: Object.freeze(
                  Object.fromEntries(
                    canonicalEnumItems(definition.key).map((value) => [String(value.value), value]),
                  ),
                ),
              }),
            ]),
      ),
    ),
  );
}

/** Complete canonical entity registry used by every ManatOS CTX host. */
export function createEntitiesContext(
  company: CompanyInfo = MANATOS_COMPANY,
  currentPlatform: SysPlatform | null = resolvePlatform(company),
): ManatOSEntitiesContext {
  const effectiveKeys = effectiveObjectKeys(company, currentPlatform);
  return Object.fromEntries(
    Object.values(allManatOSObjectMetadata)
      .filter((metadata) => effectiveKeys.has(metadata.key))
      .map((metadata) => {
        const name = entityContextName(metadata.key);
        const entity: ManatOSEntityContext = {
          key: metadata.key,
          name,
          subsystem: metadata.subsystem,
          metadata: contextMetadata(metadata, true),
        };
        return [name, entity];
      }),
  );
}

export interface SystemContextOptions {
  scope?: string;
  runtimeMode?: string;
  apiBaseUrl?: string;
  clientKind: string;
  clientVersion: string;
  clientFeatures?: Readonly<Record<string, boolean>>;
  company?: CompanyInfo;
  currentPlatform?: SysPlatform | null;
}

export function createHostSystemContext(options: SystemContextOptions): ManatOSHostSystemContext {
  const runtimeMode = options.runtimeMode ?? 'development';
  return Object.freeze({
    scope: options.scope ?? 'sys',
    runtime: Object.freeze({
      mode: runtimeMode,
      developerMode: runtimeMode !== 'production',
    }),
    server: Object.freeze({ apiBaseUrl: options.apiBaseUrl ?? '' }),
    client: Object.freeze({
      kind: options.clientKind,
      version: options.clientVersion,
      features: Object.freeze({ ...(options.clientFeatures ?? {}) }),
    }),
  });
}

export function createSystemContext(options: SystemContextOptions): ManatOSSystemContext {
  const company = options.company ?? MANATOS_COMPANY;
  const currentPlatform =
    options.currentPlatform === undefined ? resolvePlatform(company) : options.currentPlatform;

  return Object.freeze({
    ...createHostSystemContext(options),
    subsystems: subsystemContextCatalogue(company, currentPlatform),
  });
}

export interface RuntimeSemanticProjection {
  readonly subsystems: Readonly<Record<string, ManatOSSubsystemContextProjection>>;
  readonly entities: ManatOSEntitiesContext;
  readonly enums: ManatOSEnumsContext;
}

/**
 * Immutable effective Company + Platform semantics.
 *
 * User/session state is layered on top separately. Hosts may cache this
 * projection within their own runtime lifetime when appropriate; the shared
 * factory deliberately does not share mutable CTX entity projections across
 * independent hosts/requests.
 */
export function createRuntimeSemanticContext(
  company: CompanyInfo = MANATOS_COMPANY,
  currentPlatform: SysPlatform | null = resolvePlatform(company),
): RuntimeSemanticProjection {
  return Object.freeze({
    subsystems: effectiveSubsystemContextCatalogue(company, currentPlatform),
    entities: createEntitiesContext(company, currentPlatform),
    enums: createEnumsContext(company, currentPlatform),
  });
}

/** Build the canonical effective runtime branch for modern clients. */
export function createEffectiveRuntimeContext(
  company: CompanyInfo = MANATOS_COMPANY,
  currentPlatform: SysPlatform | null = resolvePlatform(company),
  user: ManatOSEffectiveRuntimeContext['user'] = null,
  semantic: RuntimeSemanticProjection = createRuntimeSemanticContext(company, currentPlatform),
): ManatOSEffectiveRuntimeContext {
  return Object.freeze({
    subsystems: semantic.subsystems,
    entities: semantic.entities,
    enums: semantic.enums,
    user,
  });
}

export interface RuntimeUserIdentity {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

/**
 * Build the expression-safe authenticated-user projection used by modern UI
 * runtimes. Authorization policy remains API-owned; this function only shapes
 * already-resolved identity/capability facts into CTX.
 */
export function createRuntimeUserContext(
  identity: RuntimeUserIdentity,
  platformId: string,
  platformCapabilities: Readonly<Record<string, unknown>>,
  scope = 'sys',
): ManatOSUserContext {
  return Object.freeze({
    scope,
    entityName: entityContextName('sys-users'),
    mode: contextPointer('view'),
    fields: Object.freeze({
      id: Object.freeze({ value: identity.id }),
      name: Object.freeze({ value: identity.name }),
      role: Object.freeze({ value: identity.role }),
    }),
    permissions: Object.freeze({
      userRole: identity.role,
      platforms: Object.freeze({
        [platformId]: Object.freeze({
          capabilities: Object.freeze({
            ...platformCapabilities,
            platformAccess: platformCapabilities.platformAccess === true,
          }),
        }),
      }),
    }),
  });
}
