import { MANATOS_COMPANY, resolvePlatform } from '../domain/company-platform.js';
import { allManatOSObjectMetadata } from '../metadata/bo/registry.js';
import type { CompanyInfo, SysPlatform } from '../platforms/types.js';
import type {
  ManatOSCompanyContext,
  ManatOSEntitiesContext,
  ManatOSEntityContext,
  ManatOSSystemContext,
} from './manatos-context.js';

const CONTEXT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function entityContextName(objectKey: string): string {
  const metadata = allManatOSObjectMetadata[objectKey as keyof typeof allManatOSObjectMetadata];
  if (!metadata) throw new Error(`Unknown ManatOS object key for ctx.entities: ${objectKey}`);
  if (!CONTEXT_IDENTIFIER.test(metadata.name)) {
    throw new Error(`Invalid ManatOS ctx entity identifier: ${metadata.name}`);
  }
  return metadata.name;
}

function sysBOContext(entries: CompanyInfo['entities'] | SysPlatform['entities']) {
  return Object.freeze(
    Object.fromEntries(
      entries.map((contribution) => {
        const name = entityContextName(contribution.sysBOKey);
        return [name, Object.freeze({ key: contribution.sysBOKey, name, contribution })];
      }),
    ),
  );
}

export function createCompanyContext(
  company: CompanyInfo = MANATOS_COMPANY,
  currentPlatform: SysPlatform = resolvePlatform(company),
): ManatOSCompanyContext {
  const currentPlatformIndex = Math.max(
    0,
    company.platforms.findIndex((candidate) => candidate.id === currentPlatform.id),
  );
  return Object.freeze({
    ...company,
    sysBO: sysBOContext(company.entities),
    platforms: Object.freeze(
      company.platforms.map((platform) =>
        Object.freeze({ ...platform, sysBO: sysBOContext(platform.entities) }),
      ),
    ),
    currentPlatform: currentPlatform.id,
    currentPlatformIndex,
  });
}

function contextMetadata(value: unknown, omitOwnKey = false): unknown {
  if (Array.isArray(value)) return value.map((item) => contextMetadata(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'ast' && !(omitOwnKey && key === 'key'))
      .map(([key, child]) => [key, contextMetadata(child)]),
  );
}

/** Complete canonical entity registry used by every ManatOS CTX host. */
export function createEntitiesContext(): ManatOSEntitiesContext {
  return Object.fromEntries(
    Object.values(allManatOSObjectMetadata).map((metadata) => {
      const name = entityContextName(metadata.key);
      const entity: ManatOSEntityContext = {
        key: metadata.key,
        name,
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
}

export function createSystemContext(options: SystemContextOptions): ManatOSSystemContext {
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
