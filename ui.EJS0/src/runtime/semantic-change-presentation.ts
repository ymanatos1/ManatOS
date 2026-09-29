/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Domain-neutral semantic presentation for change/report consumers.
 *
 * Recovery, commit review, audit investigation and future change-reporting
 * surfaces should resolve canonical field meaning here rather than leaking
 * storage/property keys or maintaining consumer-specific label maps.
 */

const browserWindow = window as any;
browserWindow.ManatOS ||= {};

export class SemanticChangePresentation {
  install(): void {
    const entityContext = (entityKey: any): any => {
      const registry = browserWindow.ManatOS?.ctx?.value?.entities;
      if (!registry || typeof registry !== 'object') return null;
      return (
        Object.values(registry as Record<string, any>).find(
          (candidate: any) => candidate?.key === entityKey,
        ) ||
        registry?.[entityKey] ||
        null
      );
    };

    const entityLabel = (entityKey: any) => {
      const metadata = entityContext(entityKey)?.metadata;
      return String(metadata?.pluralLabel || metadata?.label || entityKey || 'Entity');
    };

    const entityIcon = (entityKey: any) => {
      const context = entityContext(entityKey);
      return String(context?.icon || context?.metadata?.icon || 'box').replace(/^bi-/, '');
    };

    const fieldMetadata = (entityKey: any, fieldKey: any) =>
      entityContext(entityKey)?.metadata?.fieldDefinition?.[fieldKey] || null;

    const fieldLabel = (entityKey: any, fieldKey: any) => {
      const metadata = fieldMetadata(entityKey, fieldKey);
      return String(metadata?.label || fieldKey || 'Field');
    };

    const effectiveFieldOptions = (
      entityKey: any,
      fieldKey: any,
      ownerPath: string | null = null,
    ): any[] => {
      if (!ownerPath) return [];
      const ctx = browserWindow.ManatOS?.ctx;
      const level = ctx?.get?.(ownerPath);
      if (level?.control?.entityKey !== entityKey) return [];
      const options = level?.data?.fields?.[fieldKey]?.options;
      return Array.isArray(options) ? options : [];
    };

    const relationshipForField = (entityKey: any, fieldKey: any) => {
      const metadata = entityContext(entityKey)?.metadata;
      if (!metadata || typeof metadata !== 'object') return null;
      let match = null;
      for (const [relationshipKey, relationship] of Object.entries(
        metadata.relationships || {},
      ) as [string, any][]) {
        const fields = Array.isArray(relationship?.fields) ? relationship.fields : [];
        const fieldIndex = fields.indexOf(fieldKey);
        if (fieldIndex < 0) continue;
        if (match) return null;
        match = {
          relationshipKey,
          relationship,
          fieldIndex,
          targetEntityKey: relationship?.references?.objectKey || null,
          targetField: relationship?.references?.fields?.[fieldIndex] || 'id',
        };
      }
      return match;
    };

    const referenceOptions = (entityKey: any, fieldKey: any, ownerPath: string | null = null) => {
      const ctx = browserWindow.ManatOS?.ctx;
      const catalogues: any[][] = [];
      const exact = ownerPath ? ctx?.get?.(`${ownerPath}.data.fields.${fieldKey}.options`) : null;
      if (Array.isArray(exact)) catalogues.push(exact);
      const ownerResources = ownerPath
        ? ctx?.get?.(`${ownerPath}.data.resources.referenceData.${fieldKey}`)
        : null;
      if (Array.isArray(ownerResources)) catalogues.push(ownerResources);

      const chain: any[] = [];
      let level = ctx?.value?.ui?.level;
      while (level && typeof level === 'object') {
        chain.push(level);
        level = level?.level;
      }
      for (const candidateLevel of chain.reverse()) {
        if (candidateLevel?.control?.entityKey !== entityKey) continue;
        const options = candidateLevel?.data?.fields?.[fieldKey]?.options;
        if (Array.isArray(options)) catalogues.push(options);
        const resources = candidateLevel?.data?.resources?.referenceData?.[fieldKey];
        if (Array.isArray(resources)) catalogues.push(resources);
      }
      return catalogues.flat();
    };

    const referenceDescriptor = (
      entityKey: any,
      fieldKey: any,
      value: any,
      ownerPath: string | null = null,
    ) => {
      if (value == null || String(value) === '') return { label: '∅', icons: [] };
      const relationship = relationshipForField(entityKey, fieldKey);
      if (!relationship) return null;
      const option = referenceOptions(entityKey, fieldKey, ownerPath).find(
        (candidate) =>
          String(
            candidate?.[relationship.targetField] ?? candidate?.id ?? candidate?.value ?? '',
          ) === String(value),
      );
      if (!option) return { label: String(value), icons: [] };
      const presentation = browserWindow.ManatOS?.entryRepresentation?.projected?.(option, value);
      if (!presentation) return { label: String(value), icons: [] };
      return {
        label: String(presentation.name ?? value),
        icons: (presentation.icons || []).map(
          (icon: any) => `bi-${String(icon).replace(/^bi-/, '')}`,
        ),
        ownerWorkspaceState: presentation.ownerWorkspaceState === true,
      };
    };

    const descriptor = (value: any) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && 'label' in value)
        return value;
      return { label: value == null || String(value) === '' ? '∅' : String(value) };
    };

    const fieldDescriptor = (
      entityKey: any,
      fieldKey: any,
      value: any,
      ownerPath: string | null = null,
      identity: string | null = null,
    ) => {
      const metadata = fieldMetadata(entityKey, fieldKey);
      const component = String(metadata?.component || metadata?.type || '').toLowerCase();
      const fieldType = String(metadata?.type || '').toLowerCase();
      // Recovery can render before the recovered entity metadata catalogue has been
      // reloaded. Preserve canonical primitive semantics even in that early phase.
      if (fieldType === 'boolean' || typeof value === 'boolean') {
        const positive = value === true;
        const key = String(fieldKey || '').toLowerCase();
        const label =
          key === 'emailverified'
            ? positive
              ? 'Verified'
              : 'Not verified'
            : key === 'enabled'
              ? positive
                ? 'Enabled'
                : 'Disabled'
              : positive
                ? 'Yes'
                : 'No';
        return { label, kind: 'boolean-badge', positive, rawValue: value };
      }
      if (fieldType === 'email' || component === 'email') {
        if (value == null || String(value) === '') return { label: '∅', rawValue: value };
        return { label: String(value), kind: 'email', rawValue: value };
      }
      const pictureShaped =
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        ('pending' in value || 'revision' in value) &&
        ('contentType' in value || 'size' in value || 'revision' in value);
      if (component === 'picture' || pictureShaped) {
        return (
          browserWindow.ManatOS?.pictureValuePresentation?.scalarDescriptor?.(
            entityKey,
            identity,
            fieldKey,
            value,
          ) || descriptor(value)
        );
      }
      if (component === 'pictures') {
        return (
          browserWindow.ManatOS?.pictureValuePresentation?.collectionDescriptor?.(
            entityKey,
            identity,
            fieldKey,
            value,
          ) || descriptor(value)
        );
      }
      // References have an effective options domain too, but their canonical
      // presentation is an entry descriptor rather than an option badge.
      if (fieldType === 'reference') {
        return referenceDescriptor(entityKey, fieldKey, value, ownerPath) || descriptor(value);
      }
      if (fieldType === 'guid' && metadata?.readOnly === true) {
        if (value == null || String(value) === '') return { label: '∅', rawValue: value };
        return { label: String(value), kind: 'system-identifier', rawValue: value };
      }
      // Match the canonical browser field-runtime contract: enum fields and
      // scalar fields with configured optionItems are option-backed. Live
      // UiLevels own the effective options; metadata is only the display-time
      // fallback when no live surface exists (for example Recovery preview).
      if (fieldType === 'enum' || (metadata?.optionItems?.length ?? 0) > 0) {
        if (value == null || String(value) === '') return { label: '∅', rawValue: value };
        const effectiveOptions = effectiveFieldOptions(entityKey, fieldKey, ownerPath);
        const configuredItems = Array.isArray(metadata?.optionItems) ? metadata.optionItems : [];
        const enumItems =
          fieldType === 'enum' ? browserWindow.ManatOS?.enumItemsForField?.(metadata) || [] : [];
        const candidates = effectiveOptions.length
          ? effectiveOptions
          : fieldType === 'enum' && enumItems.length
            ? enumItems
            : configuredItems;
        const option = candidates.find((candidate: any) =>
          Object.is(candidate?.value ?? null, value),
        );
        if (option) {
          return {
            label: String(option.label ?? value),
            kind: 'option-badge',
            rawValue: value,
            ...(option.icon ? { icon: `bi-${String(option.icon).replace(/^bi-/, '')}` } : {}),
            ...(option.tone ? { tone: String(option.tone) } : {}),
            ...(option.toneStrength ? { toneStrength: String(option.toneStrength) } : {}),
          };
        }
      }
      return descriptor(value);
    };

    const entryReferenceData = (entityKey: any, ownerPath: string | null = null) => {
      const ctx = browserWindow.ManatOS?.ctx;
      const result: Record<string, any[]> = {};
      const collect = (level: any) => {
        if (!level || level?.control?.entityKey !== entityKey) return;
        for (const [fieldKey, field] of Object.entries(level?.data?.fields || {}) as [
          string,
          any,
        ][]) {
          if (Array.isArray(field?.options)) result[fieldKey] = field.options;
        }
        for (const [fieldKey, rows] of Object.entries(
          level?.data?.resources?.referenceData || {},
        ) as [string, any][]) {
          if (Array.isArray(rows) && !result[fieldKey]) result[fieldKey] = rows;
        }
      };
      if (ownerPath) collect(ctx?.get?.(ownerPath));
      let level = ctx?.value?.ui?.level;
      while (level && typeof level === 'object') {
        collect(level);
        level = level?.level;
      }
      return result;
    };

    const entryDescriptor = (entityKey: any, row: any, identityField = 'id', options: any = {}) => {
      const context = entityContext(entityKey);
      const config = context?.entryRepresentation;
      const resolver = browserWindow.ManatOS?.entryRepresentation;
      const fallback = String(row?.[identityField] ?? options.fallbackIdentity ?? 'Entry');
      const resolved =
        config && resolver?.resolve
          ? resolver.resolve(config, row || {}, {
              metadata: context?.metadata || {},
              entityIcon: entityIcon(entityKey),
              referenceData: entryReferenceData(entityKey, options.ownerPath ?? null),
              ownerPath: options.ownerPath ?? null,
              fallbackName: fallback,
            })
          : null;
      return {
        label: String(resolved?.name || fallback),
        icons: (resolved?.icons || []).map((icon: any) => `bi-${String(icon).replace(/^bi-/, '')}`),
        ownerWorkspaceState: options.ownerWorkspaceState === true,
      };
    };

    const changeDetail = ({
      entityKey,
      fieldKey,
      before,
      after,
      presentValue,
      ownerPath,
      identity,
    }: any = {}) => {
      const canonicalReference = (value: any) =>
        referenceDescriptor(entityKey, fieldKey, value, ownerPath);
      const metadata = fieldMetadata(entityKey, fieldKey);
      const component = String(metadata?.component || metadata?.type || '').toLowerCase();
      const pictureDescriptor = (value: any) =>
        fieldDescriptor(entityKey, fieldKey, value, ownerPath, identity);
      const present =
        typeof presentValue === 'function'
          ? presentValue
          : component === 'picture'
            ? pictureDescriptor
            : (value: any) =>
                fieldDescriptor(entityKey, fieldKey, value, ownerPath, identity) ||
                canonicalReference(value) ||
                descriptor(value);
      return {
        fieldKey: String(fieldKey || ''),
        label: fieldLabel(entityKey, fieldKey),
        from: descriptor(present(before, 'before')),
        to: descriptor(present(after, 'after')),
      };
    };

    const presentReportModel = (model: any, ownerPath: string | null = null) => {
      const entryNodes = new Map<string, any>();
      const collectEntries = (node: any, inheritedEntityKey: string | null = null) => {
        if (!node || typeof node !== 'object') return;
        const explicitEntityKey =
          typeof node.entityKey === 'string' && node.entityKey ? node.entityKey : null;
        const labelEntityKey =
          typeof node.label === 'string' && entityContext(node.label) ? node.label : null;
        const entityKey = explicitEntityKey || labelEntityKey || inheritedEntityKey;
        const identity = String(node.identity ?? '');
        if (entityKey && identity && node.entryRecord && typeof node.entryRecord === 'object') {
          entryNodes.set(`${entityKey}:${identity}`, { node, entityKey });
        }
        for (const child of node.children || []) collectEntries(child, entityKey);
      };
      for (const node of model?.nodes || []) collectEntries(node);

      const presentNode = (
        node: any,
        inheritedEntityKey: string | null = null,
        inheritedIdentity: string | null = null,
      ) => {
        if (!node || typeof node !== 'object') return;
        const explicitEntityKey =
          typeof node.entityKey === 'string' && node.entityKey ? node.entityKey : null;
        const labelEntityKey =
          typeof node.label === 'string' && entityContext(node.label) ? node.label : null;
        const entityKey = explicitEntityKey || labelEntityKey || inheritedEntityKey;
        const identity = String(node.identity ?? inheritedIdentity ?? '') || null;

        if (entityKey && node.entryRecord && typeof node.entryRecord === 'object') {
          node.entryDescriptor = entryDescriptor(entityKey, node.entryRecord, '', {
            fallbackIdentity: identity,
            ownerWorkspaceState: node.identityKind === 'workspace',
            ownerPath,
          });
          node.label = node.entryDescriptor.label;
        }

        if (entityKey) {
          for (const detail of node.details || []) {
            if (!detail?.fieldKey) continue;
            detail.label = fieldLabel(entityKey, detail.fieldKey);
            const workspaceTarget = (descriptorValue: any) => {
              const raw = descriptorValue?.rawValue ?? descriptorValue?.label;
              const reference = (node.references || []).find(
                (candidate: any) =>
                  candidate?.key === detail.fieldKey &&
                  candidate?.identityKind === 'workspace' &&
                  String(candidate?.identity ?? '') === String(raw ?? ''),
              );
              if (!reference) return null;
              const target = entryNodes.get(`${reference.entityKey}:${reference.identity}`);
              if (!target?.node?.entryRecord) return null;
              return entryDescriptor(reference.entityKey, target.node.entryRecord, '', {
                fallbackIdentity: reference.identity,
                ownerWorkspaceState: true,
                ownerPath,
              });
            };
            const present = (descriptorValue: any) => {
              if (descriptorValue?.ownerWorkspaceState === true) return descriptorValue;
              const workspaceDescriptor = workspaceTarget(descriptorValue);
              if (workspaceDescriptor) return workspaceDescriptor;
              const raw = descriptorValue?.rawValue ?? descriptorValue?.label;
              return (
                fieldDescriptor(entityKey, detail.fieldKey, raw, ownerPath, identity) ||
                referenceDescriptor(entityKey, detail.fieldKey, raw, ownerPath) ||
                descriptor(descriptorValue)
              );
            };
            if (detail.value) detail.value = present(detail.value);
            if (detail.from) detail.from = present(detail.from);
            if (detail.to) detail.to = present(detail.to);
          }
        }

        for (const child of node.children || []) presentNode(child, entityKey, identity);
        if ((explicitEntityKey || labelEntityKey) && entityKey && !node.entryRecord)
          node.label = entityLabel(entityKey);
      };

      for (const node of model?.nodes || []) presentNode(node);
      return model;
    };

    browserWindow.ManatOS.semanticChangePresentation = Object.freeze({
      entityContext,
      entityLabel,
      entityIcon,
      fieldMetadata,
      fieldLabel,
      effectiveFieldOptions,
      relationshipForField,
      referenceDescriptor,
      descriptor,
      fieldDescriptor,
      entryDescriptor,
      changeDetail,
      presentReportModel,
    });
  }
}

export const semanticChangePresentation = new SemanticChangePresentation();
