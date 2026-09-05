import {
  ConflictError,
  NotFoundError,
  sysBOAddressesMetadata,
  sysBOPrincipalsMetadata,
  type SysBOCreateInput,
  type SysBOUpdateInput,
  type SysEmailAddress,
  type SysPrincipalEmailAddress,
  type SysTelephoneNumber,
  type SysAddress,
  type SysPrincipalAddress,
  normalizeTelephoneNumber,
  evaluateExpression,
  type SysPrincipalTelephoneNumber,
  type SysBOPrincipal,
} from '@manatos/shared';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';
import { GenericSysBOService } from './generic-sysbo-service.js';
import type { AuditActor } from '../audit/audit-service.js';

function principalTypeCanHaveParent(principalType: SysBOPrincipal['principalType']): boolean {
  const field = sysBOPrincipalsMetadata.fieldDefinition.principalType!;
  const item = field.enumItems?.find((candidate) => candidate.value === principalType);
  return item?.canHaveParent === true;
}

function principalTypeCanContainChildren(principalType: SysBOPrincipal['principalType']): boolean {
  const field = sysBOPrincipalsMetadata.fieldDefinition.principalType!;
  const item = field.enumItems?.find((candidate) => candidate.value === principalType);
  return item?.isContainer === true;
}

/**
 * Application service for customer/commercial principals.
 */
type PrincipalTelephoneInput = { countryCode: string; number: string };
type PrincipalAddressInput = {
  recipientOrAttention: string;
  organization: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  poBox: string;
  postalCode: string;
  city: string;
  stateOrProvince: string;
  country: string;
};

function normalizeEmailAddress(value: string): string {
  return String(
    evaluateExpression(
      'EmailAddress(value)',
      { value },
      { value },
      { source: 'field-normalization', purpose: 'normalize email address' },
    ),
  );
}

type PrincipalRelatedChanges = {
  emailAddresses?: { current?: string[] };
  telephoneNumbers?: { current?: PrincipalTelephoneInput[] };
  addresses?: { current?: PrincipalAddressInput[] };
};

function principalPayload<T extends object>(
  value: T,
): { entity: T; relatedChanges?: PrincipalRelatedChanges } {
  const source = value as T & { relatedChanges?: PrincipalRelatedChanges };
  const { relatedChanges, ...entity } = source;
  return relatedChanges === undefined
    ? { entity: entity as T }
    : { entity: entity as T, relatedChanges };
}

function canonicalTelephoneKey(countryCode: string, number: string): string {
  return String(normalizeTelephoneNumber(countryCode, number));
}

function canonicalAddressKey(value: PrincipalAddressInput): string {
  const normalize = (part: unknown) =>
    String(part ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
  return [
    value.recipientOrAttention,
    value.organization,
    value.addressLine1,
    value.addressLine2,
    value.addressLine3,
    value.poBox,
    value.postalCode,
    value.city,
    value.stateOrProvince,
    value.country,
  ]
    .map(normalize)
    .join('\u001f');
}

export class SysBOPrincipalService extends GenericSysBOService<SysBOPrincipal> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysPrincipals, sysBOPrincipalsMetadata);
  }

  /**
   * Canonical enum-item metadata owns both sides of the hierarchy contract.
   * The child type decides whether it may have a parent; the selected parent
   * type decides whether it may contain children. Direct API callers therefore
   * cannot bypass the same structural facts exposed to metadata-driven UIs.
   */
  override async create(
    input: SysBOCreateInput<SysBOPrincipal>,
    actor: AuditActor,
  ): Promise<SysBOPrincipal> {
    const normalized = principalTypeCanHaveParent(input.principalType)
      ? input
      : { ...input, parentId: null };

    if (normalized.parentId) {
      const parent = await this.repository.getById(normalized.parentId);
      if (!parent) throw new NotFoundError('SysBOPrincipal parent', normalized.parentId);
      if (!principalTypeCanContainChildren(parent.principalType)) {
        throw new ConflictError(
          'PRINCIPAL_PARENT_NOT_CONTAINER',
          'The selected Principal cannot contain members.',
          'Choose a Principal type that is allowed to act as a parent.',
        );
      }
    }

    const split = principalPayload(normalized);
    return this.store.executeTransaction(async () => {
      /*
       * Specialized Principal persistence must preserve the same canonical
       * metadata-calculated-field materialization used by GenericSysBOService.
       * Keeping these protected generic hooks inside this single transaction
       * also lets Contact collection synchronization remain atomic with Save.
       */
      const created = await this.repository.create(split.entity, actor, (record) =>
        this.materializePersistedCalculatedFields(record),
      );
      await this.refreshPersistedCalculatedCollection();
      const persisted = (await this.repository.getById(created.id)) ?? created;
      await this.syncEmailAddresses(
        persisted.id,
        split.relatedChanges?.emailAddresses?.current,
        actor,
      );
      await this.syncTelephoneNumbers(
        persisted.id,
        split.relatedChanges?.telephoneNumbers?.current,
        actor,
      );
      await this.syncAddresses(persisted.id, split.relatedChanges?.addresses?.current, actor);
      return persisted;
    });
  }

  /**
   * Update a principal.
   *
   * Adds domain-specific validation for parent relationships and applies the
   * same declarative parentability trait used by the UI evaluator.
   */
  override async update(
    id: string,
    changes: SysBOUpdateInput<SysBOPrincipal>,
    actor: AuditActor,
  ): Promise<SysBOPrincipal> {
    const split = principalPayload(changes);
    const current = await this.repository.getById(id);
    if (!current) throw new NotFoundError('SysBOPrincipal', id);

    const effectiveType = split.entity.principalType ?? current.principalType;
    const normalizedChanges: SysBOUpdateInput<SysBOPrincipal> = principalTypeCanHaveParent(
      effectiveType,
    )
      ? split.entity
      : { ...split.entity, parentId: null };

    if (!principalTypeCanContainChildren(effectiveType)) {
      const children = await this.repository.list({
        page: 1,
        pageSize: 1,
        direction: 'asc',
        filters: { parentId: id },
      });
      if (children.total > 0) {
        throw new ConflictError(
          'PRINCIPAL_TYPE_CANNOT_CONTAIN_EXISTING_MEMBERS',
          'The selected Principal type cannot contain members.',
          "Move or remove this Principal's children before changing it to a non-container type.",
        );
      }
    }

    /*
     * A principal cannot be its own parent.
     */
    if (normalizedChanges.parentId === id) {
      throw new ConflictError(
        'SELF_PARENT_NOT_ALLOWED',

        'Self-parent is invalid.',

        'A customer cannot be its own parent.',
      );
    }

    /*
     * When a parent is supplied, that principal must exist.
     */
    if (normalizedChanges.parentId) {
      const parent = await this.repository.getById(normalizedChanges.parentId);
      if (!parent) throw new NotFoundError('SysBOPrincipal parent', normalizedChanges.parentId);
      if (!principalTypeCanContainChildren(parent.principalType)) {
        throw new ConflictError(
          'PRINCIPAL_PARENT_NOT_CONTAINER',
          'The selected Principal cannot contain members.',
          'Choose a Principal type that is allowed to act as a parent.',
        );
      }
    }

    return this.store.executeTransaction(async () => {
      const updated = await this.repository.update(id, normalizedChanges, actor, (record) =>
        this.materializePersistedCalculatedFields(record),
      );
      await this.refreshPersistedCalculatedCollection();
      const persisted = (await this.repository.getById(updated.id)) ?? updated;
      await this.syncEmailAddresses(id, split.relatedChanges?.emailAddresses?.current, actor);
      await this.syncTelephoneNumbers(id, split.relatedChanges?.telephoneNumbers?.current, actor);
      await this.syncAddresses(id, split.relatedChanges?.addresses?.current, actor);
      return persisted;
    });
  }

  /**
   * Resolve-or-create canonical SysEmailAddress rows and synchronize only the
   * Principal association rows. Shared email-address rows are never duplicated
   * or deleted as a side effect of editing one Principal.
   */
  private async syncEmailAddresses(
    principalId: string,
    requested: string[] | undefined,
    actor: AuditActor,
  ) {
    if (requested === undefined) return;

    const unique = [
      ...new Map(
        requested
          .map((address) => address.trim())
          .filter(Boolean)
          .map((address) => [normalizeEmailAddress(address), address] as const),
      ).values(),
    ];

    const existingLinks = (
      await this.store.sysPrincipalEmailAddresses.list({
        page: 1,
        pageSize: 10000,
        direction: 'asc',
        filters: { principalId },
      })
    ).items;

    const wantedIds = new Set<string>();
    for (const address of unique) {
      const normalized = normalizeEmailAddress(address);
      const matches = (
        await this.store.sysEmailAddresses.list({
          page: 1,
          pageSize: 10000,
          direction: 'asc',
          filters: { address: normalized },
        })
      ).items;
      let email = matches.find(
        (candidate) => normalizeEmailAddress(candidate.address) === normalized,
      );
      if (!email) {
        email = await this.store.sysEmailAddresses.create(
          {
            name: normalized,
            address,
            enabled: true,
          } as SysBOCreateInput<SysEmailAddress>,
          actor,
        );
      }
      wantedIds.add(email.id);
      if (!existingLinks.some((link) => link.emailAddressId === email!.id)) {
        await this.store.sysPrincipalEmailAddresses.create(
          {
            name: `${principalId}:${email.id}`,
            principalId,
            emailAddressId: email.id,
            enabled: true,
          } as SysBOCreateInput<SysPrincipalEmailAddress>,
          actor,
        );
      }
    }

    for (const link of existingLinks) {
      if (!wantedIds.has(link.emailAddressId)) {
        await this.store.sysPrincipalEmailAddresses.delete(link.id, actor);
      }
    }
  }

  /**
   * Resolve-or-create canonical telephone rows and synchronize Principal links.
   * Country code is a first-class field rather than an inferred presentation
   * detail; the normalized `name` key prevents duplicate canonical telephone
   * rows while retaining the friendly subscriber-number formatting separately.
   */
  private async syncTelephoneNumbers(
    principalId: string,
    requested: PrincipalTelephoneInput[] | undefined,
    actor: AuditActor,
  ) {
    if (requested === undefined) return;

    const unique = new Map<string, PrincipalTelephoneInput>();
    for (const raw of requested) {
      const countryCode = String(raw?.countryCode ?? '').trim();
      const number = String(raw?.number ?? '').trim();
      const key = canonicalTelephoneKey(countryCode, number);
      if (!unique.has(key)) unique.set(key, { countryCode, number });
    }

    const existingLinks = (
      await this.store.sysPrincipalTelephoneNumbers.list({
        page: 1,
        pageSize: 10000,
        direction: 'asc',
        filters: { principalId },
      })
    ).items;

    const wantedIds = new Set<string>();
    for (const [key, value] of unique) {
      let telephone = await this.store.sysTelephoneNumbers.findByUnique('fullNumber', key);
      if (!telephone) {
        const legacyCandidates = (
          await this.store.sysTelephoneNumbers.list({
            page: 1,
            pageSize: 10000,
            direction: 'asc',
            filters: {},
          })
        ).items;
        telephone =
          legacyCandidates.find((candidate) => {
            try {
              return normalizeTelephoneNumber(candidate.countryCode, candidate.number) === key;
            } catch {
              return false;
            }
          }) ?? null;
        if (telephone && telephone.fullNumber !== key) {
          telephone = await this.store.sysTelephoneNumbers.update(
            telephone.id,
            { name: key, fullNumber: key },
            actor,
          );
        }
      }
      if (!telephone) {
        telephone = await this.store.sysTelephoneNumbers.create(
          {
            name: key,
            countryCode: value.countryCode,
            number: value.number,
            fullNumber: key,
            enabled: true,
          } as SysBOCreateInput<SysTelephoneNumber>,
          actor,
        );
      }

      wantedIds.add(telephone.id);
      if (!existingLinks.some((link) => link.telephoneNumberId === telephone!.id)) {
        await this.store.sysPrincipalTelephoneNumbers.create(
          {
            name: `${principalId}:${telephone.id}`,
            principalId,
            telephoneNumberId: telephone.id,
            enabled: true,
          } as SysBOCreateInput<SysPrincipalTelephoneNumber>,
          actor,
        );
      }
    }

    for (const link of existingLinks) {
      if (!wantedIds.has(link.telephoneNumberId)) {
        await this.store.sysPrincipalTelephoneNumbers.delete(link.id, actor);
      }
    }
  }

  /**
   * Resolve-or-create canonical structured addresses and synchronize Principal links.
   * The canonical key ignores presentation whitespace/case while the persisted
   * constituent fields preserve useful display text. formattedAddress is produced
   * by canonical metadata calculated-field materialization, not by this UI host.
   */
  private async syncAddresses(
    principalId: string,
    requested: PrincipalAddressInput[] | undefined,
    actor: AuditActor,
  ) {
    if (requested === undefined) return;

    const unique = new Map<string, PrincipalAddressInput>();
    for (const raw of requested) {
      const value: PrincipalAddressInput = {
        recipientOrAttention: String(raw?.recipientOrAttention ?? '').trim(),
        organization: String(raw?.organization ?? '').trim(),
        addressLine1: String(raw?.addressLine1 ?? '').trim(),
        addressLine2: String(raw?.addressLine2 ?? '').trim(),
        addressLine3: String(raw?.addressLine3 ?? '').trim(),
        poBox: String(raw?.poBox ?? '').trim(),
        postalCode: String(raw?.postalCode ?? '').trim(),
        city: String(raw?.city ?? '').trim(),
        stateOrProvince: String(raw?.stateOrProvince ?? '').trim(),
        country: String(raw?.country ?? '').trim(),
      };
      if (!value.addressLine1 || !value.city || !value.country) continue;
      const key = canonicalAddressKey(value);
      if (!unique.has(key)) unique.set(key, value);
    }

    const existingLinks = (
      await this.store.sysPrincipalAddresses.list({
        page: 1,
        pageSize: 10000,
        direction: 'asc',
        filters: { principalId },
      })
    ).items;
    const wantedIds = new Set<string>();

    for (const [key, value] of unique) {
      let address = await this.store.sysAddresses.findByUnique('name', key);
      if (!address) {
        address = await this.store.sysAddresses.create(
          {
            name: key,
            ...value,
            formattedAddress: '',
            enabled: true,
          } as SysBOCreateInput<SysAddress>,
          actor,
          (record) => this.materializeAddress(record),
        );
      }
      wantedIds.add(address.id);
      if (!existingLinks.some((link) => link.addressId === address!.id)) {
        await this.store.sysPrincipalAddresses.create(
          {
            name: `${principalId}:${address.id}`,
            principalId,
            addressId: address.id,
            enabled: true,
          } as SysBOCreateInput<SysPrincipalAddress>,
          actor,
        );
      }
    }

    for (const link of existingLinks) {
      if (!wantedIds.has(link.addressId))
        await this.store.sysPrincipalAddresses.delete(link.id, actor);
    }
  }

  private materializeAddress(record: SysAddress): SysAddress {
    const calculation = sysBOAddressesMetadata.fieldDefinition.formattedAddress?.calculation;
    if (!calculation) return record;
    return {
      ...record,
      formattedAddress: String(
        evaluateExpression(
          calculation.expression,
          record as unknown as Record<string, unknown>,
          record as unknown as Record<string, unknown>,
          { source: 'calculated-field', purpose: 'materialize formatted address' },
        ),
      ),
    };
  }
}
