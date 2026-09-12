import { describe, expect, it } from 'vitest';
import type { SysBOFieldMetadata } from '@manatos/shared';
import { CommandRuntime } from '../../src/runtime/commands/command-runtime.js';
import { RelationshipCompositionRuntime } from '../../src/runtime/relationships/relationship-composition-runtime.js';
import { EntryStateRuntime } from '../../src/runtime/state/entry-state-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

const fields: SysBOFieldMetadata[] = [
  { key: 'id', label: 'Id', type: 'string', order: 1 },
  { key: 'firstName', label: 'First name', type: 'string', order: 2 },
  { key: 'lastName', label: 'Last name', type: 'string', order: 3 },
  {
    key: 'principalId',
    label: 'Principal',
    type: 'reference',
    order: 4,
    nullable: true,
    referenceBOKey: 'sys-principals',
    referenceSelection: {
      filterExpression: "principalType === 'Person'",
      createRelated: {
        defaults: {
          firstName: { sourceField: 'firstName' },
          lastName: { sourceField: 'lastName' },
        },
        fixedValues: { userId: { sourceField: 'id' } },
        uiOverrides: { userId: { editable: false } },
      },
    },
  },
];

function setup() {
  const surfaces = new SurfaceRuntime();
  const source = surfaces.open({
    id: 'user-page',
    host: 'page',
    kind: 'entry',
    mode: 'edit',
    name: 'user',
    entityKey: 'sys-users',
    entityName: 'sysUsers',
    recordId: 'user-1',
  });
  const entry = new EntryStateRuntime(source.id, surfaces.events);
  for (const field of fields) entry.defineField(field.key);
  entry.initialize({
    server: { id: 'user-1', firstName: 'Yiannis', lastName: 'Manatos', principalId: null },
  });
  const commands = new CommandRuntime(surfaces, surfaces.events);
  const relationships = new RelationshipCompositionRuntime(commands);
  relationships.attach(source, entry, fields);
  return { surfaces, source, entry, commands, relationships };
}

describe('V2 relationship composition', () => {
  it('opens Add entry as a nested popup with canonical caller rules', async () => {
    const { surfaces, source, commands, relationships } = setup();
    const result = await commands.execute({
      name: 'relationship.add',
      surfaceId: source.id,
      payload: { targetEntityKey: 'sys-principals', targetField: 'principalId' },
    });
    const childId = (result.value as { childSurfaceId: string }).childSurfaceId;
    const child = surfaces.find(childId);
    expect(child?.host).toBe('popup');
    expect(child?.mode).toBe('create');
    expect(child?.invocation.caller).toEqual({
      surfaceRef: source.path,
      entityName: 'sysUsers',
      recordId: 'user-1',
    });
    expect(child?.invocation.rules?.values).toEqual({
      firstName: { default: 'Yiannis' },
      lastName: { default: 'Manatos' },
      userId: { fixed: 'user-1' },
    });
    expect(child?.invocation.rules?.fields).toEqual({ userId: { readOnly: true } });
    expect(child?.invocation.rules?.query).toBeUndefined();
    relationships.applyChildResult(source.id, 'principalId', {
      outcome: 'saved',
      surfaceId: childId,
      value: 'principal-42',
    });
  });

  it('routes a nested selector result back through canonical relationship field events', async () => {
    const { surfaces, source, entry, commands, relationships } = setup();
    const opened = await commands.execute({
      name: 'relationship.select',
      surfaceId: source.id,
      payload: { targetEntityKey: 'sys-principals', targetField: 'principalId' },
    });
    const childId = (opened.value as { childSurfaceId: string }).childSurfaceId;
    const child = surfaces.find(childId);
    expect(child?.invocation.purpose).toBe('select');
    expect(child?.invocation.behavior).toEqual({ selection: 'single' });
    expect(child?.invocation.rules?.query).toEqual({ predicate: "principalType === 'Person'" });
    await commands.execute({
      name: 'surface.close',
      surfaceId: childId,
      payload: {
        result: { outcome: 'selected', value: 'principal-7', record: { id: 'principal-7' } },
      },
    });
    relationships.consumeChildResult(childId);
    expect(entry.fields.require('principalId').value).toBe('principal-7');
    expect(surfaces.activeSurface()?.id).toBe(source.id);
    expect(
      surfaces.events
        .history()
        .some((event) => event.type === 'value:changed' && event.source === 'relationship'),
    ).toBe(true);
  });

  it('clears nullable relationships without opening a child surface', async () => {
    const { source, entry, commands } = setup();
    entry.fields.setValue({ field: 'principalId', value: 'principal-7', source: 'server' });
    const result = await commands.execute({
      name: 'relationship.clear',
      surfaceId: source.id,
      payload: { targetEntityKey: 'sys-principals', targetField: 'principalId' },
    });
    expect(result.surfaceResult?.outcome).toBe('cleared');
    expect(entry.fields.require('principalId').value).toBeNull();
  });

  it('opens an existing relationship as a view popup', async () => {
    const { source, commands, surfaces } = setup();
    const result = await commands.execute({
      name: 'relationship.open',
      surfaceId: source.id,
      payload: {
        targetEntityKey: 'sys-principals',
        targetField: 'principalId',
        recordId: 'principal-9',
      },
    });
    const childId = (result.value as { childSurfaceId: string }).childSurfaceId;
    expect(surfaces.find(childId)?.mode).toBe('view');
    expect(surfaces.find(childId)?.recordId).toBe('principal-9');
  });
});
