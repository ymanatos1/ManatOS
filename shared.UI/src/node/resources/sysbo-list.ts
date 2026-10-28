import { uiEntryProjectRecord } from '../../components/entry/EntryMetadata.js';
import {
  allSysBOMetadata,
  apiPathFor,
  entryNameSource,
  entryPhotoField,
  entryTypeSource,
  relationshipForField,
  enumItemsForField,
  evaluateExpression,
  type ManatOSEntryValueSourceMetadata,
} from '@manatos/shared';
/** Sanitized upstream request facts; never includes headers, tokens or response bodies. */
export interface UiSurfaceUpstreamExchange {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly statusText?: string;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly responseHeaders?: Readonly<Record<string, string>>;
}
export type UiSurfaceUpstreamObserver = (exchange: UiSurfaceUpstreamExchange) => void;

/** Scope the upstream trace to one authenticated UI resource response. */
export function createUiSurfaceResponseTrace(
  setHeader: (name: string, value: string) => void,
): UiSurfaceUpstreamObserver {
  const exchanges: UiSurfaceUpstreamExchange[] = [];
  return (exchange) => {
    if (exchanges.length >= 24) return;
    exchanges.push(exchange);
    setHeader('x-manatos-surface-upstream', JSON.stringify(exchanges));
  };
}

async function tracedResourceFetch(
  url: string,
  init: RequestInit,
  observe?: UiSurfaceUpstreamObserver,
): Promise<Response> {
  const started = Date.now();
  let status = 0;
  let statusText = '';
  const responseHeaders: Record<string, string> = {};
  try {
    const response = await fetch(url, init);
    status = response.status;
    statusText = response.statusText;
    // Only allowlisted transport facts are exposed to the browser. Never the
    // bearer token, set-cookie, or arbitrary upstream headers.
    for (const name of ['content-type', 'content-length', 'x-request-id']) {
      const value = response.headers.get(name);
      if (value) responseHeaders[name] = value.slice(0, 256);
    }
    return response;
  } finally {
    if (observe) {
      const parsed = new URL(url);
      // The debugger must not receive credentials accidentally added to URLs.
      for (const key of parsed.searchParams.keys())
        if (/authorization|cookie|token|password|secret|credential|api[-_]?key|session/i.test(key))
          parsed.searchParams.set(key, '[REDACTED]');
      try {
        observe({
          method: init.method ?? 'GET',
          path: parsed.pathname + parsed.search,
          status,
          statusText,
          durationMs: Math.max(0, Date.now() - started),
          // Safe, actual request headers; the private Authorization value is
          // represented only by a redacted placeholder.
          requestHeaders: (() => {
            const outgoing = new Headers(init.headers);
            const safe: Record<string, string> = {};
            for (const name of ['accept', 'content-type', 'x-client-name']) {
              const value = outgoing.get(name);
              if (value) safe[name] = value.slice(0, 256);
            }
            if (outgoing.has('authorization')) safe.authorization = '[REDACTED]';
            return safe;
          })(),
          responseHeaders,
        });
      } catch {
        // Observability must not alter a resource request's outcome.
      }
    }
  }
}

/** Authenticated UI server -> API SysBO list. The caller holds the bearer token server-side. */
export async function requestAuthenticatedSysBOList(
  apiBaseUrl: string,
  accessToken: string,
  entityKey: string,
  raw: Readonly<Record<string, unknown>>,
  observe?: UiSurfaceUpstreamObserver,
): Promise<{
  items: Record<string, unknown>[];
  paging: { total: number; page: number; pageSize: number; totalPages: number };
  pageSizeOptions: number[];
  references: Record<string, Record<string, unknown>[]>;
  imageVariants: Record<string, unknown>;
}> {
  if (!Object.hasOwn(allSysBOMetadata, entityKey))
    throw new UiSysBOResourceFailure(400, 'Unknown entity.');
  const path = apiPathFor(entityKey); // strict allowlist, never use untrusted URL segments
  const defaults = [2, 5, 10, 20, 50, 100];
  let pageSizeOptions = defaults;
  try {
    const response = await tracedResourceFetch(
      `${apiBaseUrl}/api/v1/public/ui-bootstrap`,
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      },
      observe,
    );
    if (response.ok) {
      const body = (await response.json()) as { data?: { ui?: { pageSizeOptions?: unknown } } };
      const supplied = body.data?.ui?.pageSizeOptions;
      if (Array.isArray(supplied)) {
        const allowed = [...new Set(supplied)]
          .filter(
            (n): n is number =>
              typeof n === 'number' && Number.isSafeInteger(n) && n >= 1 && n <= 100,
          )
          .sort((a, b) => a - b);
        if (allowed.length) pageSizeOptions = allowed;
      }
    }
  } catch {
    /* API bootstrap unavailable; use canonical defaults. */
  }
  const page = boundedInteger(raw.page, 1, 1000000, 1);
  const requested = boundedInteger(raw.pageSize, 1, 100, 10);
  const pageSize = pageSizeOptions.includes(requested) ? requested : pageSizeOptions[0]!;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    includeReferences: 'true',
    variant: 'thumbnail',
  });
  const metadata = (
    allSysBOMetadata as Readonly<
      Record<
        string,
        { fieldDefinition: Readonly<Record<string, { sensitive?: boolean; persistent?: boolean }>> }
      >
    >
  )[entityKey]!;
  const allowed = metadata.fieldDefinition;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue;
    if (
      key.startsWith('filter.') &&
      allowed[key.slice(7)] &&
      !allowed[key.slice(7)]?.sensitive &&
      value.length <= 200
    )
      params.set(key, value);
  }
  if (typeof raw.sort === 'string' && allowed[raw.sort] && !allowed[raw.sort]?.sensitive) {
    params.set('sort', raw.sort);
    if (raw.direction === 'desc') params.set('direction', 'desc');
  }
  const target = `${apiBaseUrl}/api/v1/${path}?${params.toString()}`;
  let response: Response;
  try {
    response = await tracedResourceFetch(
      target,
      {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-client-name': 'ManatOS UI Surface',
        },
        signal: AbortSignal.timeout(15000),
      },
      observe,
    );
  } catch {
    throw new UiSysBOResourceFailure(503, 'API unavailable.');
  }
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new UiSysBOResourceFailure(response.ok ? 502 : response.status, 'Invalid API response.');
  }
  if (!response.ok)
    throw new UiSysBOResourceFailure(response.status, 'Unable to retrieve entity records.');
  const data = (envelope as { data?: unknown })?.data;
  if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown }).items))
    throw new UiSysBOResourceFailure(502, 'Invalid entity list payload.');
  const result = data as {
    items: Record<string, unknown>[];
    paging: { total: number; page: number; pageSize: number; totalPages: number };
  };
  if (
    !result.paging ||
    !Number.isFinite(result.paging.total) ||
    !Number.isFinite(result.paging.totalPages)
  )
    throw new UiSysBOResourceFailure(502, 'Invalid paging metadata.');
  const rawReferences = (data as { references?: unknown }).references;
  const references: Record<string, Record<string, unknown>[]> = Object.create(null);
  if (rawReferences && typeof rawReferences === 'object' && !Array.isArray(rawReferences)) {
    for (const [key, value] of Object.entries(rawReferences)) {
      if (!Object.hasOwn(allSysBOMetadata, key) || !Array.isArray(value)) continue;
      references[key] = value.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      );
    }
  }
  const imageVariants = resourceImageVariants((data as { imageVariants?: unknown }).imageVariants);
  return { ...result, pageSizeOptions, references, imageVariants };
}
export class UiSysBOResourceFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UiSysBOResourceFailure';
  }
}
function boundedInteger(raw: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(raw);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

/** EJS0-compatible read-only reference candidate catalogue. No selector or mutation authority.
 * Failed catalogues never block reading an already-authorized Entry record.
 */
async function entryReferenceCatalogues(
  apiBaseUrl: string,
  accessToken: string,
  sourceEntity: string,
  sourceId: string,
  record: Readonly<Record<string, unknown>>,
  observe?: UiSurfaceUpstreamObserver,
): Promise<{
  rows: Record<string, Record<string, unknown>[]>;
  statuses: Record<string, 'unavailable' | 'unauthorized' | 'partial'>;
}> {
  const entity = allSysBOMetadata[sourceEntity as keyof typeof allSysBOMetadata];
  const result: Record<string, Record<string, unknown>[]> = Object.create(null);
  const statuses: Record<string, 'unavailable' | 'unauthorized' | 'partial'> = Object.create(null);
  if (!entity) return { rows: result, statuses };
  const requests = new Map<string, Promise<Record<string, unknown>[]>>();
  const catalogue = (key: string): Promise<Record<string, unknown>[]> => {
    const existing = requests.get(key);
    if (existing) return existing;
    const job = (async () => {
      try {
        const path = apiPathFor(key);
        const response = await tracedResourceFetch(
          `${apiBaseUrl}/api/v1/${path}?pageSize=500&sort=createdAt&direction=asc`,
          {
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${accessToken}`,
              'x-client-name': 'ManatOS UI Surface',
            },
            signal: AbortSignal.timeout(15000),
          },
          observe,
        );
        if (!response.ok) {
          statuses[key] =
            response.status === 401 || response.status === 403 ? 'unauthorized' : 'unavailable';
          return [];
        }
        const body: unknown = await response.json();
        const data = (body as { data?: { items?: unknown; paging?: { total?: unknown } } })?.data;
        const items = data?.items;
        if (!Array.isArray(items)) {
          statuses[key] = 'unavailable';
          return [];
        }
        if (typeof data?.paging?.total === 'number' && data.paging.total > items.length)
          statuses[key] = 'partial';
        return items.filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === 'object' && !Array.isArray(item),
        );
      } catch {
        statuses[key] = 'unavailable';
        return [];
      }
    })();
    requests.set(key, job);
    return job;
  };
  for (const [fieldKey, field] of Object.entries(entity.fieldDefinition)) {
    if (field.sensitive || field.type !== 'reference') continue;
    const direct = relationshipForField(entity, fieldKey);
    const targetKey =
      direct?.relationship.references.objectKey ?? field.inverseRelationship?.objectKey;
    if (!targetKey || !Object.hasOwn(allSysBOMetadata, targetKey)) continue;
    const target = allSysBOMetadata[targetKey as keyof typeof allSysBOMetadata];
    const inverse = field.inverseRelationship;
    const inverseOwner = inverse
      ? allSysBOMetadata[inverse.objectKey as keyof typeof allSysBOMetadata]
      : undefined;
    const inverseRelationship = inverseOwner?.relationships?.[inverse?.relationship ?? ''];
    const selection =
      direct?.relationship.selection ??
      (inverseRelationship?.references.objectKey === sourceEntity
        ? inverseRelationship.selection
        : undefined);
    const sourceFilter =
      !direct && inverseRelationship?.references.objectKey === sourceEntity
        ? inverseRelationship.sourceFilterExpression
        : undefined;
    const rows = await catalogue(targetKey);
    const unique = selection?.uniqueThrough;
    const linked = unique ? await catalogue(unique.objectKey) : [];
    const used = new Set(
      linked.map((row) => String(row[unique?.field ?? ''] ?? '')).filter(Boolean),
    );
    const accepted: Record<string, unknown>[] = [];
    for (const row of rows) {
      const id = String(row.id ?? '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
      try {
        if (
          sourceFilter &&
          evaluateExpression(sourceFilter, row, row, {
            source: 'reference-selection',
            sourcePath: `${sourceEntity}.${fieldKey}`,
            purpose: 'filter inverse reference candidates',
          }) !== true
        )
          continue;
        if (
          selection?.filterExpression &&
          evaluateExpression(selection.filterExpression, row, row, {
            source: 'reference-selection',
            sourcePath: `${sourceEntity}.${fieldKey}`,
            purpose: 'filter reference candidates',
          }) !== true
        )
          continue;
        const trait = selection?.filterEnumItemTrait;
        if (trait) {
          const definition = target.fieldDefinition[trait.field];
          if (
            !definition ||
            !enumItemsForField(definition).some(
              (item) =>
                item.value === row[trait.field] &&
                (item as unknown as Record<string, unknown>)[trait.trait] === true,
            )
          )
            continue;
        }
      } catch {
        continue;
      }
      const unavailable =
        (unique !== undefined && statuses[unique.objectKey] !== undefined) ||
        (selection?.excludeCurrent === true && sourceEntity === targetKey && id === sourceId) ||
        (unique
          ? Boolean(row[unique.field] && String(row[unique.field]) !== sourceId)
          : used.has(id));
      accepted.push({
        ...(await projectReferenceEntry(targetKey, row)),
        __referenceFieldAvailability: { [fieldKey]: !unavailable },
        ...(unavailable
          ? {
              __referenceFieldDisabledReason: {
                [fieldKey]:
                  unique !== undefined && statuses[unique.objectKey] !== undefined
                    ? 'catalogue-unavailable'
                    : selection?.excludeCurrent === true &&
                        sourceEntity === targetKey &&
                        id === sourceId
                      ? 'current-record'
                      : 'already-linked',
              },
            }
          : {}),
      });
    }
    // The selected Entry may be outside the catalogue page. Resolve it through
    // the same authenticated API boundary without exposing arbitrary target IDs.
    const selectedId = record[fieldKey];
    if (
      typeof selectedId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedId) &&
      !accepted.some((row) => String(row.id).toLowerCase() === selectedId.toLowerCase())
    ) {
      try {
        const selectedResponse = await tracedResourceFetch(
          `${apiBaseUrl}/api/v1/${apiPathFor(targetKey)}/${encodeURIComponent(selectedId)}`,
          {
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${accessToken}`,
              'x-client-name': 'ManatOS UI Surface',
            },
            signal: AbortSignal.timeout(15000),
          },
          observe,
        );
        if (selectedResponse.ok) {
          const selectedBody: unknown = await selectedResponse.json();
          const selectedRecord = (selectedBody as { data?: unknown })?.data;
          if (
            selectedRecord &&
            typeof selectedRecord === 'object' &&
            !Array.isArray(selectedRecord)
          )
            accepted.unshift({
              ...(await projectReferenceEntry(
                targetKey,
                selectedRecord as Record<string, unknown>,
              )),
              // Display an already selected record, but never grant selection
              // merely because direct-read access to that record succeeded.
              __referenceFieldAvailability: { [fieldKey]: false },
            });
        }
      } catch {
        /* A denied or unavailable related record remains unknown. */
      }
    }
    // Several source fields may reference the same entity but have different
    // selection policies. Merge by record ID without losing field provenance.
    const indexed = new Map(
      (result[targetKey] ?? []).map((row) => [String(row.id).toLowerCase(), row]),
    );
    for (const row of accepted) {
      const id = String(row.id).toLowerCase();
      const previous = indexed.get(id);
      const earlier = previous?.__referenceFieldAvailability;
      const previousReasons = previous?.__referenceFieldDisabledReason;
      const incomingReasons = row.__referenceFieldDisabledReason;
      indexed.set(id, {
        ...previous,
        ...row,
        __referenceFieldAvailability: {
          ...(earlier && typeof earlier === 'object' && !Array.isArray(earlier) ? earlier : {}),
          [fieldKey]: (row.__referenceFieldAvailability as Record<string, boolean>)[fieldKey],
        },
        __referenceFieldDisabledReason: {
          ...(previousReasons &&
          typeof previousReasons === 'object' &&
          !Array.isArray(previousReasons)
            ? previousReasons
            : {}),
          ...(incomingReasons &&
          typeof incomingReasons === 'object' &&
          !Array.isArray(incomingReasons)
            ? incomingReasons
            : {}),
        },
      });
    }
    result[targetKey] = [...indexed.values()];
  }
  return { rows: result, statuses };
}

/** Verify a single reference candidate against metadata, record-specific API visibility,
 * enum traits and uniqueness. The 500-row catalogue is presentation only.
 * Fail closed on authorization, malformed records or unavailable uniqueness checks. */
export async function requestAuthenticatedSysBOReferenceChoice(
  apiBaseUrl: string,
  accessToken: string,
  input: unknown,
  observe?: UiSurfaceUpstreamObserver,
): Promise<Record<string, unknown>> {
  const args = input as Record<string, unknown> | null;
  const sourceEntity = args?.sourceEntity;
  const sourceId = args?.sourceId;
  const fieldKey = args?.field;
  const candidateId = args?.candidateId;
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !args ||
    typeof sourceEntity !== 'string' ||
    !Object.hasOwn(allSysBOMetadata, sourceEntity) ||
    typeof sourceId !== 'string' ||
    (sourceId !== 'new' && !guid.test(sourceId)) ||
    typeof fieldKey !== 'string' ||
    typeof candidateId !== 'string' ||
    !guid.test(candidateId)
  )
    throw new UiSysBOResourceFailure(400, 'Invalid reference selection request.');
  const source = allSysBOMetadata[sourceEntity as keyof typeof allSysBOMetadata];
  const field = source.fieldDefinition[fieldKey];
  const direct = relationshipForField(source, fieldKey);
  const targetKey =
    direct?.relationship.references.objectKey ?? field?.inverseRelationship?.objectKey;
  if (
    field?.type !== 'reference' ||
    field.sensitive ||
    !targetKey ||
    !Object.hasOwn(allSysBOMetadata, targetKey)
  )
    throw new UiSysBOResourceFailure(400, 'Invalid reference field.');
  // A caller must be authorized to read the owner, or open its create draft.
  if (sourceId === 'new') {
    await requestAuthenticatedSysBOEntryDraft(apiBaseUrl, accessToken, sourceEntity, observe);
  } else {
    await requestAuthenticatedSysBOEntry(apiBaseUrl, accessToken, sourceEntity, sourceId, observe);
  }
  const target = allSysBOMetadata[targetKey as keyof typeof allSysBOMetadata];
  const inverse = field.inverseRelationship;
  const inverseOwner = inverse
    ? allSysBOMetadata[inverse.objectKey as keyof typeof allSysBOMetadata]
    : undefined;
  const inverseRelation = inverseOwner?.relationships?.[inverse?.relationship ?? ''];
  const selection =
    direct?.relationship.selection ??
    (inverseRelation?.references.objectKey === sourceEntity
      ? inverseRelation.selection
      : undefined);
  const sourceFilter =
    !direct && inverseRelation?.references.objectKey === sourceEntity
      ? inverseRelation.sourceFilterExpression
      : undefined;
  // Direct API read is authorization-authoritative and does not depend on catalogue pages.
  const response = await tracedResourceFetch(
    `${apiBaseUrl}/api/v1/${apiPathFor(targetKey)}/${encodeURIComponent(candidateId)}`,
    {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        'x-client-name': 'ManatOS UI Surface',
      },
      signal: AbortSignal.timeout(15000),
    },
    observe,
  ).catch(() => {
    throw new UiSysBOResourceFailure(503, 'API unavailable.');
  });
  if (!response.ok)
    throw new UiSysBOResourceFailure(
      response.status === 404 ? 404 : response.status === 403 ? 403 : 503,
      'Reference candidate unavailable.',
    );
  const envelope: unknown = await response.json().catch(() => null);
  const raw = (envelope as { data?: unknown } | null)?.data;
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    String((raw as Record<string, unknown>).id ?? '').toLowerCase() !== candidateId.toLowerCase()
  )
    throw new UiSysBOResourceFailure(502, 'Invalid reference candidate.');
  const row = raw as Record<string, unknown>;
  const deny = (): never => {
    throw new UiSysBOResourceFailure(403, 'Reference is not eligible.');
  };
  try {
    for (const expression of [sourceFilter, selection?.filterExpression])
      if (
        expression &&
        evaluateExpression(expression, row, row, {
          source: 'reference-selection',
          sourcePath: `${sourceEntity}.${fieldKey}`,
          purpose: 'validate selected reference',
        }) !== true
      )
        deny();
    const trait = selection?.filterEnumItemTrait;
    if (trait) {
      const definition = target.fieldDefinition[trait.field];
      if (
        !definition ||
        !enumItemsForField(definition).some(
          (item) =>
            item.value === row[trait.field] &&
            (item as unknown as Record<string, unknown>)[trait.trait] === true,
        )
      )
        deny();
    }
    if (
      selection?.excludeCurrent &&
      sourceEntity === targetKey &&
      sourceId.toLowerCase() === candidateId.toLowerCase()
    )
      deny();
    if (selection?.uniqueThrough) {
      const unique = selection.uniqueThrough;
      const used = await tracedResourceFetch(
        `${apiBaseUrl}/api/v1/${apiPathFor(unique.objectKey)}?${new URLSearchParams({
          page: '1',
          pageSize: '100',
          [`filter.${unique.field}`]: candidateId,
        })}`,
        {
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
            'x-client-name': 'ManatOS UI Surface',
          },
          signal: AbortSignal.timeout(15000),
        },
        observe,
      );
      if (!used.ok) deny();
      const body: unknown = await used.json();
      const data = (body as { data?: { items?: unknown; paging?: { total?: unknown } } })?.data;
      if (
        !data ||
        !Array.isArray(data.items) ||
        typeof data.paging?.total !== 'number' ||
        data.paging.total > data.items.length
      )
        deny();
      const linked = data!.items as unknown[];
      if (
        linked.some(
          (item) =>
            !item ||
            typeof item !== 'object' ||
            String((item as Record<string, unknown>)[unique.field] ?? '').toLowerCase() !==
              candidateId.toLowerCase() ||
            sourceId === 'new' ||
            String((item as Record<string, unknown>).id ?? '').toLowerCase() !==
              sourceId.toLowerCase(),
        )
      )
        deny();
    }
  } catch (error) {
    if (error instanceof UiSysBOResourceFailure) throw error;
    deny();
  }
  return {
    ...(await projectReferenceEntry(targetKey, row)),
    __referenceFieldAvailability: { [fieldKey]: true },
  };
}

/** Forward only canonical capability-backed calls; API authorizes every traversed record. */
export async function requestAuthenticatedExpressionFunction(
  apiBaseUrl: string,
  accessToken: string,
  raw: unknown,
  observe?: UiSurfaceUpstreamObserver,
): Promise<{ value: unknown }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new UiSysBOResourceFailure(400, 'Invalid expression function request.');
  const { functionName, args } = raw as { functionName?: unknown; args?: unknown };
  if (
    functionName !== 'TraverseEntity' ||
    !Array.isArray(args) ||
    args.length < 3 ||
    args.length > 4
  )
    throw new UiSysBOResourceFailure(400, 'Unsupported expression function.');
  let response: Response;
  try {
    response = await tracedResourceFetch(
      `${apiBaseUrl}/api/v1/expressions/evaluate-function`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-client-name': 'ManatOS UI Surface',
        },
        body: JSON.stringify({ functionName, args }),
        signal: AbortSignal.timeout(15000),
      },
      observe,
    );
  } catch {
    throw new UiSysBOResourceFailure(503, 'Expression capability unavailable.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new UiSysBOResourceFailure(response.status, 'Expression capability denied.');
  const data = (payload as { data?: { value?: unknown } } | null)?.data;
  if (!data || !Object.hasOwn(data, 'value'))
    throw new UiSysBOResourceFailure(502, 'Invalid expression capability response.');
  return { value: data.value };
}

/** Read a single authorized record via the same session-to-API trust boundary as List. */
export async function requestAuthenticatedSysBOEntry(
  apiBaseUrl: string,
  accessToken: string,
  entityKey: string,
  recordId: string,
  observe?: UiSurfaceUpstreamObserver,
): Promise<Record<string, unknown>> {
  if (!Object.hasOwn(allSysBOMetadata, entityKey))
    throw new UiSysBOResourceFailure(400, 'Unknown entity.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId))
    throw new UiSysBOResourceFailure(400, 'Invalid record identifier.');
  const path = apiPathFor(entityKey);
  let response: Response;
  try {
    response = await tracedResourceFetch(
      `${apiBaseUrl}/api/v1/${path}/${encodeURIComponent(recordId)}?includeReferences=true&variant=thumbnail`,
      {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-client-name': 'ManatOS UI Surface',
        },
        signal: AbortSignal.timeout(15000),
      },
      observe,
    );
  } catch {
    throw new UiSysBOResourceFailure(503, 'API unavailable.');
  }
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new UiSysBOResourceFailure(response.ok ? 502 : response.status, 'Invalid API response.');
  }
  if (!response.ok) throw new UiSysBOResourceFailure(response.status, 'Entry unavailable.');
  const data = (envelope as { data?: unknown })?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new UiSysBOResourceFailure(502, 'Invalid entry payload.');
  // Collection-level `update` is deliberately false: visibility of Entry tabs
  // requires record-specific capabilities evaluated by the API.
  let permissions: Record<string, boolean> = {};
  try {
    const capabilityResponse = await tracedResourceFetch(
      `${apiBaseUrl}/api/v1/${path}/${encodeURIComponent(recordId)}/$capabilities`,
      {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-client-name': 'ManatOS UI Surface',
        },
        signal: AbortSignal.timeout(15000),
      },
      observe,
    );
    if (capabilityResponse.ok) {
      const parsed: unknown = await capabilityResponse.json();
      const raw = (parsed as { data?: { capabilities?: unknown } })?.data?.capabilities;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        permissions = Object.fromEntries(
          Object.entries(raw).filter(
            (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
          ),
        );
      }
    }
  } catch {
    // Capability failure is fail-closed for privileged tab visibility;
    // the successfully authorized Entry record remains readable.
  }
  const original = data as Record<string, unknown>;
  const existing =
    original.references &&
    typeof original.references === 'object' &&
    !Array.isArray(original.references)
      ? (original.references as Record<string, unknown>)
      : {};
  const catalogues = await entryReferenceCatalogues(
    apiBaseUrl,
    accessToken,
    entityKey,
    recordId,
    original,
    observe,
  );
  const references: Record<string, Record<string, unknown>[]> = Object.create(null);
  for (const [key, value] of Object.entries(existing))
    if (Object.hasOwn(allSysBOMetadata, key) && Array.isArray(value))
      references[key] = value
        .filter(
          (row): row is Record<string, unknown> =>
            !!row && typeof row === 'object' && !Array.isArray(row),
        )
        .map((value) => {
          const row = { ...value };
          delete row.__referenceFieldAvailability;
          return row;
        });
  for (const [key, rows] of Object.entries(catalogues.rows)) {
    const indexed = new Map(
      (references[key] ?? []).map((row) => [String(row.id ?? '').toLowerCase(), row]),
    );
    for (const row of rows) {
      const id = String(row.id ?? '').toLowerCase();
      const prior = indexed.get(id);
      // Original API references are display-only. Selection grants always
      // originate in the authenticated, metadata-filtered candidate catalogue.
      indexed.set(id, {
        ...row,
        ...prior,
        __referenceFieldAvailability: row.__referenceFieldAvailability,
      });
    }
    references[key] = [...indexed.values()];
  }
  return {
    ...original,
    references,
    __surfaceCapabilities: permissions,
    __referenceCatalogueStatus: catalogues.statuses,
  };
}

/** Project only the fields required by canonical entry representation metadata.
 * Never return an entire related Entry record to a List through #data.references.
 */
async function projectReferenceEntry(
  entityKey: string,
  record: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const projected = await uiEntryProjectRecord(entityKey, record);
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const fieldDefinitions = entity.fieldDefinition as Readonly<
    Record<string, { sensitive?: boolean } | undefined>
  >;
  // The canonical name resolver falls back to the entity primary field when a
  // calculated entry name is empty. Include that non-sensitive source in the
  // authorized projection instead of leaking the GUID to every consumer.
  const required = new Set<string>(['id', 'createdAt', String(entity.primaryField ?? 'name')]);
  const addSource = (source: ManatOSEntryValueSourceMetadata | null | undefined): void => {
    if (!source) return;
    if ('field' in source && typeof source.field === 'string') {
      required.add(source.field);
      return;
    }
    if (!('expression' in source) || typeof source.expression !== 'string') return;
    // Identifiers are inspected only against canonical field names. The
    // evaluator remains authoritative for interpreting the expression.
    for (const field of Object.keys(fieldDefinitions)) {
      if (
        new RegExp(
          `(^|[^a-zA-Z0-9_$])${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9_$])`,
        ).test(source.expression)
      )
        required.add(field);
    }
  };
  addSource(entryNameSource(entity));
  addSource(entryTypeSource(entity));
  addSource(entity.entry?.description);
  addSource(entity.entry?.status);
  const photoField = entryPhotoField(entity);
  if (photoField) required.add(photoField);
  const result: Record<string, unknown> = Object.create(null);
  for (const field of required) {
    if (
      field !== 'id' &&
      (!Object.hasOwn(fieldDefinitions, field) || fieldDefinitions[field]?.sensitive)
    )
      continue;
    if (Object.hasOwn(projected, field)) result[field] = projected[field];
  }
  return result;
}

/** Resolve only explicitly requested canonical targets through the existing auth boundary. */
export async function requestAuthenticatedSysBOReferences(
  apiBaseUrl: string,
  accessToken: string,
  raw: unknown,
  observe?: UiSurfaceUpstreamObserver,
): Promise<Record<string, Record<string, Record<string, unknown>>>> {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { targets?: unknown }).targets))
    throw new UiSysBOResourceFailure(400, 'Invalid related-record request.');
  const targets = (raw as { targets: unknown[] }).targets;
  if (targets.length > 24) throw new UiSysBOResourceFailure(400, 'Too many related entities.');
  const normalized = new Map<string, Set<string>>();
  for (const target of targets) {
    if (!target || typeof target !== 'object')
      throw new UiSysBOResourceFailure(400, 'Invalid reference target.');
    const key = (target as { entityKey?: unknown }).entityKey;
    const ids = (target as { ids?: unknown }).ids;
    if (typeof key !== 'string' || !Object.hasOwn(allSysBOMetadata, key) || !Array.isArray(ids))
      throw new UiSysBOResourceFailure(400, 'Unknown related entity.');
    const set = normalized.get(key) ?? new Set<string>();
    for (const id of ids) {
      if (
        typeof id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      )
        throw new UiSysBOResourceFailure(400, 'Invalid related record ID.');
      set.add(id.toLowerCase());
    }
    normalized.set(key, set);
  }
  const jobs = [...normalized].flatMap(([entityKey, ids]) =>
    [...ids].map((recordId) => ({ entityKey, recordId })),
  );
  if (jobs.length > 500) throw new UiSysBOResourceFailure(400, 'Too many related records.');
  const records: Record<string, Record<string, Record<string, unknown>>> = Object.create(null);
  for (const key of normalized.keys()) records[key] = Object.create(null);
  // Bounded concurrency avoids amplifying a single browser request into a burst.
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, jobs.length) }, async () => {
      while (index < jobs.length) {
        const job = jobs[index++]!;
        try {
          const row = await requestAuthenticatedSysBOEntry(
            apiBaseUrl,
            accessToken,
            job.entityKey,
            job.recordId,
            observe,
          );
          records[job.entityKey]![job.recordId] = await projectReferenceEntry(job.entityKey, row);
        } catch (error) {
          // A missing or inaccessible related row must not disclose its existence.
          if (
            error instanceof UiSysBOResourceFailure &&
            (error.status === 403 || error.status === 404)
          )
            continue;
          throw error;
        }
      }
    }),
  );
  return records;
}

/** Rewrite trusted API image descriptors to the same-origin authenticated UI proxy.
 * Only canonical entity keys, GUIDs and picture fields may produce URLs.
 */
function resourceImageVariants(raw: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [entityKey, rows] of Object.entries(raw)) {
    if (
      !Object.hasOwn(allSysBOMetadata, entityKey) ||
      !rows ||
      typeof rows !== 'object' ||
      Array.isArray(rows)
    )
      continue;
    const metadata = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
    const projectedRows: Record<string, unknown> = Object.create(null);
    for (const [id, fields] of Object.entries(rows)) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
        !fields ||
        typeof fields !== 'object' ||
        Array.isArray(fields)
      )
        continue;
      const projectedFields: Record<string, unknown> = Object.create(null);
      for (const [field, variants] of Object.entries(fields)) {
        if (
          metadata.fieldDefinition[field]?.type !== 'picture' ||
          !variants ||
          typeof variants !== 'object' ||
          Array.isArray(variants)
        )
          continue;
        const projectedVariants: Record<string, unknown> = Object.create(null);
        for (const [variant, descriptor] of Object.entries(variants)) {
          if (variant !== 'original' && variant !== 'thumbnail') continue;
          if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) continue;
          const revision = (descriptor as Record<string, unknown>).revision;
          projectedVariants[variant] = {
            revision: revision ?? null,
            url: `/_manatos/auth/resources/picture/${encodeURIComponent(entityKey)}/${encodeURIComponent(id)}/${encodeURIComponent(field)}?variant=${variant}&revision=${encodeURIComponent(String(revision ?? ''))}`,
          };
        }
        if (Object.keys(projectedVariants).length) projectedFields[field] = projectedVariants;
      }
      if (Object.keys(projectedFields).length) projectedRows[id] = projectedFields;
    }
    if (Object.keys(projectedRows).length) result[entityKey] = projectedRows;
  }
  return result;
}

/** Authenticated binary picture proxy: metadata and GUID validated before issuing API GET. */
export async function requestAuthenticatedSysBOPicture(
  apiBaseUrl: string,
  accessToken: string,
  entityKey: string,
  recordId: string,
  fieldKey: string,
  variant: string,
): Promise<{ bytes: Buffer; contentType: string; actualVariant: string }> {
  if (!Object.hasOwn(allSysBOMetadata, entityKey))
    throw new UiSysBOResourceFailure(400, 'Unknown entity.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId))
    throw new UiSysBOResourceFailure(400, 'Invalid record identifier.');
  const metadata = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  if (
    metadata.fieldDefinition[fieldKey]?.type !== 'picture' ||
    metadata.fieldDefinition[fieldKey]?.sensitive
  )
    throw new UiSysBOResourceFailure(400, 'Unknown picture field.');
  if (variant !== 'original' && variant !== 'thumbnail')
    throw new UiSysBOResourceFailure(400, 'Invalid picture variant.');
  const target = `${apiBaseUrl}/api/v1/${apiPathFor(entityKey)}/${encodeURIComponent(recordId)}/$picture/${encodeURIComponent(fieldKey)}?variant=${variant}`;
  let response: Response;
  try {
    response = await fetch(target, {
      headers: { authorization: `Bearer ${accessToken}`, 'x-client-name': 'ManatOS UI Surface' },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new UiSysBOResourceFailure(503, 'Picture unavailable.');
  }
  if (!response.ok) throw new UiSysBOResourceFailure(response.status, 'Picture unavailable.');
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^image\/(jpeg|png|webp|gif)(;|$)/i.test(contentType))
    throw new UiSysBOResourceFailure(502, 'Invalid picture content type.');
  const length = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > 3_000_000)
    throw new UiSysBOResourceFailure(502, 'Picture exceeds supported limit.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 3_000_000)
    throw new UiSysBOResourceFailure(502, 'Picture exceeds supported limit.');
  return {
    bytes,
    contentType,
    actualVariant:
      response.headers.get('x-manatos-image-variant') === 'thumbnail' ? 'thumbnail' : 'original',
  };
}

/** Fetch one persisted picture-collection item through the authenticated BFF. */
export async function requestAuthenticatedSysBOPictureItem(
  apiBaseUrl: string,
  accessToken: string,
  entityKey: string,
  recordId: string,
  fieldKey: string,
  pictureId: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  if (!Object.hasOwn(allSysBOMetadata, entityKey))
    throw new UiSysBOResourceFailure(400, 'Unknown entity.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(recordId) || !uuid.test(pictureId))
    throw new UiSysBOResourceFailure(400, 'Invalid picture identifier.');
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  if (
    entity.fieldDefinition[fieldKey]?.type !== 'pictures' ||
    entity.fieldDefinition[fieldKey]?.sensitive
  )
    throw new UiSysBOResourceFailure(400, 'Unknown pictures field.');
  const target = `${apiBaseUrl}/api/v1/${apiPathFor(entityKey)}/${encodeURIComponent(recordId)}/$pictures/${encodeURIComponent(fieldKey)}/${encodeURIComponent(pictureId)}`;
  let response: Response;
  try {
    response = await fetch(target, {
      headers: { authorization: `Bearer ${accessToken}`, 'x-client-name': 'ManatOS UI Surface' },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new UiSysBOResourceFailure(503, 'Picture unavailable.');
  }
  if (!response.ok) throw new UiSysBOResourceFailure(response.status, 'Picture unavailable.');
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^image\/(jpeg|png|webp|gif)(;|$)/i.test(contentType))
    throw new UiSysBOResourceFailure(502, 'Invalid picture content type.');
  const length = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > 3_000_000)
    throw new UiSysBOResourceFailure(502, 'Picture exceeds supported limit.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 3_000_000)
    throw new UiSysBOResourceFailure(502, 'Picture exceeds supported limit.');
  return { bytes, contentType };
}

/** Creation metadata is authorized by the API's collection policy. Do not infer grants from UI metadata. */
export async function requestAuthenticatedSysBOEntryDraft(
  apiBaseUrl: string,
  accessToken: string,
  entityKey: string,
  observe?: UiSurfaceUpstreamObserver,
): Promise<Record<string, unknown>> {
  if (!Object.hasOwn(allSysBOMetadata, entityKey))
    throw new UiSysBOResourceFailure(400, 'Unknown entity.');
  const path = apiPathFor(entityKey);
  let response: Response;
  try {
    response = await tracedResourceFetch(
      `${apiBaseUrl}/api/v1/${path}/$capabilities`,
      {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-client-name': 'ManatOS UI Surface',
        },
        signal: AbortSignal.timeout(15000),
      },
      observe,
    );
  } catch {
    throw new UiSysBOResourceFailure(503, 'API unavailable.');
  }
  if (!response.ok)
    throw new UiSysBOResourceFailure(response.status, 'Create permission unavailable.');
  const envelope: unknown = await response.json().catch(() => null);
  const raw = (envelope as { data?: { capabilities?: unknown } })?.data?.capabilities;
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    (raw as Record<string, unknown>).create !== true
  )
    throw new UiSysBOResourceFailure(403, 'Create permission denied.');
  // Leave absent fields undefined so the API's canonical create-default policy applies.
  // Sending null for every field would suppress server defaults.
  const record: Record<string, unknown> = {};
  const catalogues = await entryReferenceCatalogues(
    apiBaseUrl,
    accessToken,
    entityKey,
    '',
    record,
    observe,
  );
  return {
    ...record,
    references: catalogues.rows,
    __surfaceCapabilities: { create: true },
    __referenceCatalogueStatus: catalogues.statuses,
  };
}

/** The UI host forwards only metadata-declared writable fields to the API. API remains authoritative. */
export async function requestAuthenticatedSysBOEntryCreate(
  apiBaseUrl: string,
  accessToken: string,
  entityKey: string,
  record: unknown,
  observe?: UiSurfaceUpstreamObserver,
): Promise<Record<string, unknown>> {
  if (!Object.hasOwn(allSysBOMetadata, entityKey))
    throw new UiSysBOResourceFailure(400, 'Unknown entity.');
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw new UiSysBOResourceFailure(400, 'Invalid Entry draft.');
  const metadata = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const definition = metadata.fieldDefinition[key];
    if (
      !definition ||
      definition.sensitive ||
      definition.generated ||
      definition.applicationManaged ||
      definition.calculation ||
      definition.readOnly === true ||
      key === 'id'
    )
      continue;
    if (
      typeof value === 'function' ||
      (value && typeof value === 'object' && !Array.isArray(value))
    )
      throw new UiSysBOResourceFailure(400, 'Invalid Entry field value.');
    payload[key] = value;
  }
  let response: Response;
  try {
    response = await tracedResourceFetch(
      `${apiBaseUrl}/api/v1/${apiPathFor(entityKey)}`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-client-name': 'ManatOS UI Surface',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      },
      observe,
    );
  } catch {
    throw new UiSysBOResourceFailure(
      503,
      'Create request failed. Check whether the record was created before retrying.',
    );
  }
  const envelope: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new UiSysBOResourceFailure(
      response.status,
      (envelope as { error?: { message?: string } })?.error?.message ?? 'Create rejected.',
    );
  const data = (envelope as { data?: unknown })?.data;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String((data as Record<string, unknown>).id ?? ''),
    )
  )
    throw new UiSysBOResourceFailure(502, 'Create response lacks a valid record identifier.');
  return data as Record<string, unknown>;
}
