import { describe, expect, it } from 'vitest';
import { projectUiCtx } from '../../src/runtime/context/surface-ctx-projection.js';
import { EntryAggregateStateRuntime } from '../../src/runtime/state/entry-aggregate-state-runtime.js';
import { EntryStateRuntime } from '../../src/runtime/state/entry-state-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';
import { ValidationRuntime } from '../../src/runtime/validation/validation-runtime.js';

function createEntry(mode: 'create' | 'edit' = 'create') {
  const surfaces = new SurfaceRuntime();
  const surface = surfaces.open({
    host: 'page',
    kind: 'entry',
    mode,
    name: 'principal',
    entityKey: 'sys-principals',
  });
  const entry = new EntryStateRuntime(surface.id, surfaces.events);
  entry.defineField('firstName');
  entry.defineField('lastName');
  const validation = new ValidationRuntime(surface.id, entry.fields, surfaces.events);
  const aggregate = new EntryAggregateStateRuntime(surface.id, surfaces, entry.fields);
  return { surfaces, surface, entry, validation, aggregate };
}

describe('UI Runtime V2 validation + aggregate entry state', () => {
  it('drives dynamic required validation from canonical field-state events', () => {
    const { surfaces, surface, entry, validation, aggregate } = createEntry();
    entry.fields.setUx('firstName', 'required', true, 'calculation');
    entry.initialize({});

    expect(entry.fields.require('firstName').valid).toBe(false);
    expect(surface.state.valid).toBe(false);
    expect(aggregate.snapshot().saveReady).toBe(false);

    entry.fields.setValue({ field: 'firstName', value: 'Yiannis', source: 'user' });
    expect(entry.fields.require('firstName').valid).toBe(true);
    expect(surface.state.valid).toBe(true);
    expect(surface.state.dirty).toBe(true);
    expect(aggregate.snapshot().saveReady).toBe(true);
    expect(surfaces.events.history().some((event) => event.type === 'validation:changed')).toBe(
      true,
    );

    validation.dispose();
    aggregate.dispose();
  });

  it('commits initialization calculations into the clean baseline', () => {
    const { surface, entry, validation, aggregate } = createEntry('edit');
    entry.defineField('fullName');
    entry.addValueCalculation({
      target: 'fullName',
      dependsOn: ['fields.firstName.value', 'fields.lastName.value'],
      calculate: ({ values }) =>
        `${String(values.firstName ?? '')} ${String(values.lastName ?? '')}`.trim(),
    });

    entry.initialize({ server: { firstName: 'Yiannis', lastName: 'Manatos' } });

    expect(entry.fields.require('fullName').value).toBe('Yiannis Manatos');
    expect(entry.fields.require('fullName').originalValue).toBe('Yiannis Manatos');
    expect(entry.fields.require('fullName').dirty).toBe(false);
    expect(surface.state.dirty).toBe(false);
    expect(aggregate.snapshot().dirty).toBe(false);

    entry.fields.setValue({ field: 'firstName', value: 'John', source: 'user' });
    expect(surface.state.dirty).toBe(true);

    validation.dispose();
    aggregate.dispose();
  });

  it('supports cross-field validators and recalculates them from dependency events', () => {
    const { surface, entry, validation, aggregate } = createEntry();
    validation.register({
      id: 'different-names',
      target: 'lastName',
      dependsOn: ['fields.firstName.value', 'fields.lastName.value'],
      validate: ({ values }) =>
        values.firstName && values.firstName === values.lastName
          ? {
              code: 'same-name',
              message: 'First and last name must differ.',
              severity: 'error',
            }
          : null,
    });
    entry.initialize({ callerDefaults: { firstName: 'Yiannis', lastName: 'Yiannis' } });

    expect(entry.fields.require('lastName').valid).toBe(false);
    expect(surface.state.valid).toBe(false);

    entry.fields.setValue({ field: 'firstName', value: 'John', source: 'user' });
    expect(entry.fields.require('lastName').valid).toBe(true);
    expect(surface.state.valid).toBe(true);

    validation.dispose();
    aggregate.dispose();
  });

  it('aggregates child/collection contributors without teaching Save buttons about them', () => {
    const { surface, entry, validation, aggregate } = createEntry();
    entry.initialize({});
    entry.fields.setValue({ field: 'firstName', value: 'Yiannis', source: 'user' });
    expect(aggregate.snapshot().saveReady).toBe(true);

    aggregate.setContributor({
      id: 'addresses-editor',
      dirty: true,
      valid: true,
      blocksPersistence: true,
    });
    expect(surface.state.blocked).toBe(true);
    expect(aggregate.snapshot().saveReady).toBe(false);

    aggregate.setContributor({
      id: 'addresses-editor',
      dirty: true,
      valid: true,
      blocksPersistence: false,
    });
    expect(surface.state.blocked).toBe(false);
    expect(aggregate.snapshot().saveReady).toBe(true);

    validation.dispose();
    aggregate.dispose();
  });

  it('projects validation and aggregate field state into CTX for formulas and debugging', () => {
    const { surfaces, surface, entry, validation, aggregate } = createEntry();
    entry.fields.setUx('firstName', 'required', true, 'calculation');
    entry.initialize({});

    const projection = projectUiCtx(surfaces, new Map([[surface.id, entry.fields]]));
    const field = projection.level?.fields?.firstName;
    expect(field?.valid).toBe(false);
    expect(field?.dirty).toBe(false);
    expect(field?.validationIssues[0]?.code).toBe('required');
    expect(field?.ux.required).toBe(true);
    expect(projection.level?.control.state.valid).toBe(false);

    validation.dispose();
    aggregate.dispose();
  });

  it('tracks saving lifecycle and commits a new reversible dirty baseline after success', () => {
    const { surface, entry, validation, aggregate } = createEntry();
    entry.initialize({});
    entry.fields.setValue({ field: 'firstName', value: 'Yiannis', source: 'user' });
    expect(aggregate.snapshot().saveReady).toBe(true);

    aggregate.beginSave();
    expect(surface.state.saving).toBe(true);
    expect(aggregate.snapshot().saveReady).toBe(false);

    aggregate.completeSave();
    expect(surface.state.saving).toBe(false);
    expect(surface.state.dirty).toBe(false);
    expect(entry.fields.require('firstName').originalValue).toBe('Yiannis');
    expect(aggregate.snapshot().saveReady).toBe(false);
    expect(surface.state.valid).toBe(true);

    entry.fields.setValue({ field: 'firstName', value: 'John', source: 'user' });
    expect(surface.state.dirty).toBe(true);
    entry.fields.setValue({ field: 'firstName', value: 'Yiannis', source: 'user' });
    expect(surface.state.dirty).toBe(false);

    validation.dispose();
    aggregate.dispose();
  });

  it('tracks delete lifecycle centrally and forbids delete for unsaved create surfaces', () => {
    const create = createEntry('create');
    expect(() => create.aggregate.beginDelete()).toThrow('cannot be deleted before save');
    create.validation.dispose();
    create.aggregate.dispose();

    const edit = createEntry('edit');
    edit.entry.initialize({ server: { firstName: 'Yiannis' } });
    edit.aggregate.beginDelete();
    expect(edit.surface.state.deleting).toBe(true);
    expect(edit.surfaces.events.history().some((event) => event.type === 'entry:deleting')).toBe(
      true,
    );
    edit.aggregate.completeDelete();
    expect(edit.surface.state.deleting).toBe(false);
    expect(edit.surfaces.events.history().some((event) => event.type === 'entry:deleted')).toBe(
      true,
    );
    edit.validation.dispose();
    edit.aggregate.dispose();
  });

  it('reacts to owner-qualified CTX dependencies from an ancestor surface', () => {
    const events = new SurfaceRuntime();
    const parent = events.open({ host: 'page', kind: 'list', mode: 'browse', name: 'parents' });
    const surface = events.open({
      parentId: parent.id,
      host: 'popup',
      kind: 'entry',
      mode: 'edit',
      name: 'child',
      entityKey: 'sys-principals',
    });
    const entry = new EntryStateRuntime(surface.id, events.events);
    entry.defineField('name');
    const validation = new ValidationRuntime(surface.id, entry.fields, events.events);
    let allowed = false;
    validation.register({
      id: 'ancestor-policy',
      target: 'name',
      dependsOn: [`surface:${parent.id}:policy.allowed`],
      validate: () =>
        allowed
          ? null
          : { code: 'policy', message: 'Blocked by parent policy.', severity: 'error' },
    });
    entry.initialize({ server: { name: 'Yiannis' } });
    expect(entry.fields.require('name').valid).toBe(false);

    allowed = true;
    events.events.emit({
      type: 'ctx:changed',
      surfaceId: parent.id,
      source: 'engine',
      payload: { path: 'policy.allowed', oldValue: false, newValue: true },
    });
    expect(entry.fields.require('name').valid).toBe(true);
    validation.dispose();
    entry.dispose();
  });

  it('does not validate reactive dependencies against a partially initialized entry', () => {
    const { surfaces, surface, entry, validation, aggregate } = createEntry();
    let evaluations = 0;
    validation.register({
      id: 'deferred-validation',
      target: 'lastName',
      dependsOn: ['state.valid'],
      validate: () => {
        evaluations += 1;
        return null;
      },
    });

    surfaces.setState(surface.id, 'valid', false, 'engine');
    expect(evaluations).toBe(0);

    entry.initialize({});
    expect(evaluations).toBe(1);

    surfaces.setState(surface.id, 'valid', true, 'engine');
    expect(evaluations).toBe(2);

    validation.dispose();
    aggregate.dispose();
  });

  it('validates a local field dependency once per canonical event', () => {
    const { entry, validation, aggregate } = createEntry();
    let evaluations = 0;
    validation.register({
      id: 'single-event-validation',
      target: 'lastName',
      dependsOn: ['fields.firstName.value'],
      validate: () => {
        evaluations += 1;
        return null;
      },
    });
    entry.initialize({});
    expect(evaluations).toBe(1);

    entry.fields.setValue({ field: 'firstName', value: 'Yiannis', source: 'user' });
    expect(evaluations).toBe(2);

    validation.dispose();
    aggregate.dispose();
  });
});
