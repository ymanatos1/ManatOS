import { describe, expect, it } from 'vitest';
import type { ManatOSObjectMetadata, SysBOUIMetadata } from '@manatos/shared';
import { EntityEntryRuntime } from '../../src/runtime/state/entity-entry-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

const metadata: ManatOSObjectMetadata<Record<string, unknown>> = {
  key: 'people',
  name: 'Person',
  pluralName: 'People',
  primaryField: 'fullName',
  fieldDefinition: {
    firstName: { key: 'firstName', label: 'First name', type: 'string', order: 1, required: true },
    lastName: { key: 'lastName', label: 'Last name', type: 'string', order: 2, required: true },
    fullName: {
      key: 'fullName',
      label: 'Full name',
      type: 'string',
      order: 3,
      readOnly: true,
      calculation: { expression: "firstName + ' ' + lastName" },
    },
    runtimeStatus: {
      key: 'runtimeStatus',
      label: 'Runtime status',
      type: 'string',
      order: 4,
      readOnly: true,
      calculation: { expression: "hasRuntimeFact ? 'Present' : 'Missing'" },
    },
  },
};

const uiMetadata: SysBOUIMetadata = {
  key: 'people',
  list: { columns: [], addAction: { label: 'Add' } },
  record: {
    fieldOverrides: {},
    tabs: [
      {
        id: 'general',
        label: 'General',
        order: 1,
        fields: ['firstName', 'lastName', 'fullName', 'runtimeStatus'],
      },
      {
        id: 'details',
        label: 'Details',
        order: 2,
        fields: [],
        visible: { expression: "firstName === 'Yiannis'" },
      },
    ],
  },
};

function create(host: 'page' | 'popup', mode: 'create' | 'view' = 'create') {
  const surfaces = new SurfaceRuntime();
  const surface = surfaces.open({
    host,
    kind: 'entry',
    mode,
    name: 'person',
    entityKey: 'people',
    entry: { facts: { hasRuntimeFact: false } },
  });
  return {
    surfaces,
    surface,
    runtime: new EntityEntryRuntime({ surface, surfaces, metadata, uiMetadata }),
  };
}

describe('V2 EntityEntryRuntime', () => {
  it('does not evaluate dependent expressions against partial initialization state', () => {
    const guardedMetadata: ManatOSObjectMetadata<Record<string, unknown>> = {
      ...metadata,
      fieldDefinition: {
        ...metadata.fieldDefinition,
        ready: { key: 'ready', label: 'Ready', type: 'boolean', order: 5 },
        status: {
          key: 'status',
          label: 'Status',
          type: 'string',
          order: 6,
          readOnly: true,
          calculation: { expression: "ready ? 'Ready' : 'Not ready'" },
        },
      },
    };
    const surfaces = new SurfaceRuntime();
    const surface = surfaces.open({
      host: 'page',
      kind: 'entry',
      mode: 'create',
      name: 'person',
      entityKey: 'people',
      // guardedMetadata extends the shared fixture, whose runtimeStatus formula
      // legitimately depends on this non-persisted projection fact. Keep the
      // initialization regression focused on partial *field* state rather than
      // accidentally constructing an invalid expression scope.
      entry: { facts: { hasRuntimeFact: false } },
    });
    const runtime = new EntityEntryRuntime({
      surface,
      surfaces,
      metadata: guardedMetadata,
      uiMetadata,
    });

    runtime.initialize({
      callerDefaults: { firstName: 'Yiannis', lastName: 'Manatos', ready: true },
    });
    expect(runtime.values().status).toBe('Ready');
    runtime.dispose();
  });

  it('uses the same entry runtime for page and popup hosts', () => {
    for (const host of ['page', 'popup'] as const) {
      const { runtime } = create(host);
      runtime.initialize({ callerDefaults: { firstName: 'Yiannis', lastName: 'Manatos' } });
      expect(runtime.values().fullName).toBe('Yiannis Manatos');
      expect(runtime.visibleTabs().map((tab) => tab.id)).toEqual(['general', 'details']);
      runtime.dispose();
    }
  });

  it('consumes canonical surface invocation defaults and UI overrides', () => {
    const surfaces = new SurfaceRuntime();
    const surface = surfaces.open({
      host: 'popup',
      kind: 'entry',
      mode: 'create',
      name: 'person',
      entityKey: 'people',
      entry: { facts: { hasRuntimeFact: false } },
      invocation: {
        defaults: { firstName: 'Yiannis', lastName: 'Manatos' },
        uiOverrides: { firstName: { editable: false } },
      },
    });
    const runtime = new EntityEntryRuntime({ surface, surfaces, metadata, uiMetadata });
    runtime.initialize();
    expect(runtime.values().fullName).toBe('Yiannis Manatos');
    expect(runtime.entry.fields.require('firstName').ux.readonly).toBe(true);
    runtime.dispose();
  });

  it('resolves mode-only declarative tab visibility after initialization for page and popup hosts', () => {
    const modeUiMetadata: SysBOUIMetadata = {
      ...uiMetadata,
      record: {
        ...uiMetadata.record,
        tabs: [
          ...uiMetadata.record.tabs,
          {
            id: 'organization',
            label: 'Organization',
            order: 3,
            fields: [],
            visible: { expression: "mode !== 'create'" },
          },
        ],
      },
    };

    for (const host of ['page', 'popup'] as const) {
      const surfaces = new SurfaceRuntime();
      const surface = surfaces.open({
        host,
        kind: 'entry',
        mode: 'create',
        name: 'person',
        entityKey: 'people',
        entry: { facts: { hasRuntimeFact: false } },
      });
      const runtime = new EntityEntryRuntime({
        surface,
        surfaces,
        metadata,
        uiMetadata: modeUiMetadata,
      });

      runtime.initialize({ callerDefaults: { firstName: 'Yiannis', lastName: 'Manatos' } });

      expect(runtime.visibleTabs().map((tab) => tab.id)).not.toContain('organization');
      runtime.dispose();
    }
  });

  it('reconciles create defaults with caller enum restrictions identically for page and popup hosts', () => {
    const enumMetadata: ManatOSObjectMetadata<Record<string, unknown>> = {
      ...metadata,
      fieldDefinition: {
        ...metadata.fieldDefinition,
        principalType: {
          key: 'principalType',
          label: 'Principal type',
          type: 'enum',
          order: 7,
          enumValues: ['Person', 'Company', 'Group'],
          enumItems: [
            { value: 'Person', label: 'Person', isContainer: false },
            { value: 'Company', label: 'Company', isContainer: true },
            { value: 'Group', label: 'Group', isContainer: true },
          ],
        },
      },
    };
    const enumUiMetadata: SysBOUIMetadata = {
      ...uiMetadata,
      record: {
        ...uiMetadata.record,
        fieldOverrides: {
          ...uiMetadata.record.fieldOverrides,
          principalType: { createDefaultValue: 'Person' },
        },
      },
    };

    for (const host of ['page', 'popup'] as const) {
      const surfaces = new SurfaceRuntime();
      const surface = surfaces.open({
        host,
        kind: 'entry',
        mode: 'create',
        name: 'person',
        entityKey: 'people',
        entry: { facts: { hasRuntimeFact: false } },
        invocation: {
          uiOverrides: { principalType: { allowedEnumItemTrait: 'isContainer' } },
        },
      });
      const runtime = new EntityEntryRuntime({
        surface,
        surfaces,
        metadata: enumMetadata,
        uiMetadata: enumUiMetadata,
      });

      runtime.initialize();
      expect(runtime.values().principalType).toBe('Company');
      runtime.dispose();
    }
  });

  it('applies evaluator-backed create defaults sequentially in both page and popup hosts', () => {
    const defaultMetadata: ManatOSObjectMetadata<Record<string, unknown>> = {
      ...metadata,
      fieldDefinition: {
        ...metadata.fieldDefinition,
        category: { key: 'category', label: 'Category', type: 'string', order: 7 },
        derivedCategory: {
          key: 'derivedCategory',
          label: 'Derived category',
          type: 'string',
          order: 8,
        },
      },
    };
    const defaultUiMetadata: SysBOUIMetadata = {
      ...uiMetadata,
      record: {
        ...uiMetadata.record,
        fieldOverrides: {
          ...uiMetadata.record.fieldOverrides,
          category: { createDefaultValue: 'Base' },
          derivedCategory: { createDefaultValue: { expression: "category + '-derived'" } },
        },
      },
    };

    for (const host of ['page', 'popup'] as const) {
      const surfaces = new SurfaceRuntime();
      const surface = surfaces.open({
        host,
        kind: 'entry',
        mode: 'create',
        name: 'person',
        entityKey: 'people',
        entry: { facts: { hasRuntimeFact: false } },
      });
      const runtime = new EntityEntryRuntime({
        surface,
        surfaces,
        metadata: defaultMetadata,
        uiMetadata: defaultUiMetadata,
      });

      runtime.initialize();
      expect(runtime.values().category).toBe('Base');
      expect(runtime.values().derivedCategory).toBe('Base-derived');
      runtime.dispose();
    }
  });

  it('uses runtime enum option domains for create defaults and keeps initialization clean', () => {
    const providerMetadata: ManatOSObjectMetadata<Record<string, unknown>> = {
      key: 'providers',
      name: 'Provider',
      pluralName: 'Providers',
      primaryField: 'provider',
      fieldDefinition: {
        provider: {
          key: 'provider',
          label: 'Provider',
          type: 'enum',
          order: 1,
          required: true,
          enumValues: ['microsoft', 'facebook'],
          enumItems: [
            { value: 'microsoft', label: 'Microsoft', callbackPath: '/auth/microsoft/callback' },
            { value: 'facebook', label: 'Facebook', callbackPath: '/auth/facebook/callback' },
          ],
        },
        callbackPath: {
          key: 'callbackPath',
          label: 'Callback path',
          type: 'string',
          order: 2,
          required: true,
        },
        secret: {
          key: 'secret',
          label: 'Secret',
          type: 'string',
          order: 3,
          sensitive: true,
        },
      },
    };
    const providerUiMetadata: SysBOUIMetadata = {
      key: 'providers',
      list: { columns: [], addAction: { label: 'Add' } },
      record: {
        tabs: [{ id: 'general', label: 'General', order: 1, fields: ['provider', 'callbackPath'] }],
        fieldOverrides: {
          provider: { createDefaultValue: { expression: "FirstCtx(provider.options, 'value')" } },
          callbackPath: { createDefaultValue: { expression: 'provider.option.callbackPath' } },
        },
      },
    };

    for (const host of ['page', 'popup'] as const) {
      const surfaces = new SurfaceRuntime();
      const surface = surfaces.open({
        host,
        kind: 'entry',
        mode: 'create',
        name: 'provider',
        entityKey: 'providers',
      });
      const runtime = new EntityEntryRuntime({
        surface,
        surfaces,
        metadata: providerMetadata,
        uiMetadata: providerUiMetadata,
        referenceData: {
          provider: [
            { value: 'facebook', label: 'Facebook', callbackPath: '/auth/facebook/callback' },
          ],
        },
      });

      runtime.initialize();
      expect(runtime.values()).toMatchObject({
        provider: 'facebook',
        callbackPath: '/auth/facebook/callback',
      });
      expect(runtime.entry.fields.get('secret')).toBeNull();
      expect(runtime.entry.fields.require('provider').dirty).toBe(false);
      expect(runtime.entry.fields.require('callbackPath').dirty).toBe(false);
      expect(surface.state.dirty).toBe(false);
      runtime.dispose();
    }
  });

  it('reacts to field changes for calculated values and declarative tab visibility', () => {
    const { runtime } = create('page');
    runtime.initialize({ callerDefaults: { firstName: 'Yiannis', lastName: 'Manatos' } });
    runtime.entry.fields.setValue({ field: 'firstName', value: 'John', source: 'user' });
    expect(runtime.values().fullName).toBe('John Manatos');
    expect(runtime.visibleTabs().map((tab) => tab.id)).toEqual(['general']);
    runtime.dispose();
  });

  it('resolves API-safe non-field runtime facts without mixing them into field state', () => {
    const surfaces = new SurfaceRuntime();
    const surface = surfaces.open({
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'person',
      entityKey: 'people',
      entry: {
        current: { firstName: 'Yiannis', lastName: 'Manatos' },
        facts: { hasRuntimeFact: true },
      },
    });
    const runtime = new EntityEntryRuntime({ surface, surfaces, metadata, uiMetadata });
    runtime.initialize({ server: surface.entry?.current });

    expect(runtime.values().runtimeStatus).toBe('Present');
    expect(runtime.entry.fields.get('hasRuntimeFact')).toBeNull();
    expect(surface.entry?.facts.hasRuntimeFact).toBe(true);
    runtime.dispose();
  });

  it('projects canonical enum option traits into the V2 expression scope', () => {
    const enumMetadata: ManatOSObjectMetadata<Record<string, unknown>> = {
      ...metadata,
      fieldDefinition: {
        ...metadata.fieldDefinition,
        principalType: {
          key: 'principalType',
          label: 'Principal type',
          type: 'enum',
          order: 7,
          enumValues: ['Person', 'Company'],
          enumItems: [
            { value: 'Person', label: 'Person', canHaveParent: true },
            { value: 'Company', label: 'Company', canHaveParent: false },
          ],
        },
        parentId: { key: 'parentId', label: 'Parent', type: 'string', order: 8 },
      },
    };
    const enumUiMetadata: SysBOUIMetadata = {
      ...uiMetadata,
      record: {
        ...uiMetadata.record,
        fieldOverrides: {
          ...uiMetadata.record.fieldOverrides,
          principalType: { createDefaultValue: 'Person' },
          parentId: {
            editable: {
              expression:
                'principalType.option != null && principalType.option.canHaveParent === true',
            },
          },
        },
      },
    };
    const surfaces = new SurfaceRuntime();
    const surface = surfaces.open({
      host: 'page',
      kind: 'entry',
      mode: 'create',
      name: 'person',
      entityKey: 'people',
      entry: { facts: { hasRuntimeFact: false } },
    });
    const runtime = new EntityEntryRuntime({
      surface,
      surfaces,
      metadata: enumMetadata,
      uiMetadata: enumUiMetadata,
    });

    runtime.initialize();
    expect(runtime.entry.fields.require('parentId').ux.readonly).toBe(false);
    runtime.entry.fields.setValue({ field: 'principalType', value: 'Company', source: 'user' });
    expect(runtime.entry.fields.require('parentId').ux.readonly).toBe(true);
    runtime.dispose();
  });

  it('projects presentation optionItems for non-enum fields into the expression scope', () => {
    const optionMetadata: ManatOSObjectMetadata<Record<string, unknown>> = {
      ...metadata,
      fieldDefinition: {
        ...metadata.fieldDefinition,
        provider: {
          key: 'provider',
          label: 'Provider',
          type: 'string',
          order: 7,
          optionItems: [
            { value: 'google', label: 'Google', tenant: null },
            { value: 'microsoft', label: 'Microsoft', tenant: 'common' },
          ],
        },
        tenantVisible: {
          key: 'tenantVisible',
          label: 'Tenant visible',
          type: 'boolean',
          order: 8,
          readOnly: true,
          calculation: { expression: 'provider.option.tenant != null' },
        },
      },
    };
    const surfaces = new SurfaceRuntime();
    const surface = surfaces.open({
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'person',
      entityKey: 'people',
      entry: { current: { provider: 'microsoft' }, facts: { hasRuntimeFact: false } },
    });
    const runtime = new EntityEntryRuntime({
      surface,
      surfaces,
      metadata: optionMetadata,
      uiMetadata,
    });
    runtime.initialize({ server: surface.entry?.current });
    expect(runtime.values().tenantVisible).toBe(true);
    runtime.dispose();
  });

  it('does not synchronously execute entityResolver calculations during server projection', () => {
    const resolverMetadata: ManatOSObjectMetadata<Record<string, unknown>> = {
      ...metadata,
      fieldDefinition: {
        ...metadata.fieldDefinition,
        parentId: { key: 'parentId', label: 'Parent', type: 'string', order: 7 },
        rootId: {
          key: 'rootId',
          label: 'Root',
          type: 'string',
          order: 8,
          readOnly: true,
          calculation: {
            expression:
              "parentId == null ? null : TraverseEntity(parentId, 'people', 'parentId', 'id')",
          },
        },
      },
    };
    const surfaces = new SurfaceRuntime();
    const surface = surfaces.open({
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'person',
      entityKey: 'people',
      entry: {
        current: { parentId: 'p1', rootId: 'root-from-server' },
        facts: { hasRuntimeFact: false },
      },
    });
    const runtime = new EntityEntryRuntime({
      surface,
      surfaces,
      metadata: resolverMetadata,
      uiMetadata,
    });
    expect(() => runtime.initialize({ server: surface.entry?.current })).not.toThrow();
    expect(runtime.values().rootId).toBe('root-from-server');
    runtime.dispose();
  });

  it('applies view mode universally independent of host', () => {
    const { runtime } = create('popup', 'view');
    expect(runtime.entry.fields.all().every((field) => field.ux.readonly)).toBe(true);
    expect(runtime.tabs().every((tab) => tab.readOnly)).toBe(true);
    runtime.dispose();
  });
});
