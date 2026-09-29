import { AppError, type SysBOMetadata } from '@manatos/shared';

import type { SysBODefinition } from '../../../sysbo/types.js';

/**
 * Convert posted metadata-driven field values into UI-neutral SysBO data.
 *
 * Security-sensitive compound commands remain outside ordinary CRUD payloads;
 * route handlers add those commands explicitly when their workflows require it.
 */
export function formPayload(
  body: Record<string, unknown>,
  definition: SysBODefinition,
): Record<string, unknown> {
  // SysBODefinition is a closed union of metadata-specialized definitions. The
  // payload algorithm is entity-shape agnostic, so preserve that union instead of
  // letting generic inference incorrectly select the first member (SysBOUser).
  return formPayloadForMetadata(
    body,
    definition.key,
    definition.boMetadata as SysBOMetadata<unknown>,
  );
}

export function formPayloadForMetadata<T>(
  body: Record<string, unknown>,
  entityKey: string,
  metadata: SysBOMetadata<T>,
): Record<string, unknown> {
  const definition = { key: entityKey, boMetadata: metadata };
  const output: Record<string, unknown> = {};

  for (const field of Object.values(definition.boMetadata.fieldDefinition)) {
    if (
      field.generated ||
      field.readOnly ||
      field.sensitive ||
      field.type === 'picture' ||
      field.type === 'pictures'
    ) {
      continue;
    }

    /**
     * SysBOUser email verification is an explicit security command in the UI,
     * not a normal editable boolean. Omitting it here prevents an ordinary
     * Save from accidentally verifying or un-verifying an account.
     */
    if (definition.key === 'sys-users' && field.key === 'emailVerified') {
      continue;
    }

    // External-provider credentials are a trusted compound command, never
    // ordinary CRUD fields. Client ID therefore travels only through the
    // credential workflow together with its secret.
    if (definition.key === 'sys-ext-auth-providers' && field.key === 'clientId') {
      continue;
    }

    const raw = body[field.key];
    const submitted = Object.prototype.hasOwnProperty.call(body, field.key);
    const booleanPresenceMarker = `__manatos_field_present__${field.key}`;
    const booleanSubmitted =
      submitted || Object.prototype.hasOwnProperty.call(body, booleanPresenceMarker);

    // PATCH semantics are presence-sensitive. A control omitted from FormData
    // (notably a disabled/read-only control) is not a mutation. Boolean editors
    // publish a separate enabled presence marker because an editable unchecked
    // checkbox is also omitted by HTML FormData and must still mean false.
    if (!submitted && field.type !== 'boolean') continue;
    if (field.type === 'boolean' && !booleanSubmitted) continue;

    if (field.type === 'boolean') {
      output[field.key] = raw === 'on' || raw === 'true' || raw === true;
    } else if (field.type === 'number') {
      output[field.key] = Number(raw ?? 0);
    } else if (field.type === 'duration') {
      if (raw === undefined || raw === '') {
        if (field.nullable) output[field.key] = null;
        continue;
      }

      let parsed: unknown = raw;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new AppError(
            'VALIDATION_ERROR',
            `Invalid duration payload for ${field.key}.`,
            `${field.label} is not a valid duration.`,
            false,
          );
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Invalid duration payload for ${field.key}.`,
          `${field.label} is not a valid duration.`,
          false,
        );
      }
      const source = parsed as Record<string, unknown>;
      const durationPart = (key: 'years' | 'months' | 'days') => {
        const value = Number(source[key] ?? 0);
        if (!Number.isInteger(value) || value < 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Duration ${field.key}.${key} must be a non-negative integer.`,
            `${field.label} must use whole, non-negative years, months and days.`,
            false,
          );
        }
        return value;
      };
      output[field.key] = {
        years: durationPart('years'),
        months: durationPart('months'),
        days: durationPart('days'),
      };
    } else if (raw !== undefined && raw !== '') {
      output[field.key] = raw;
    } else if (field.nullable) {
      output[field.key] = null;
    }
  }

  return output;
}
