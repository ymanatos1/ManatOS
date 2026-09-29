import { describe, expect, it } from 'vitest';

import { organizationRecoveryProvider } from '../../src/runtime/v2/organization-recovery.js';
import { UiSurfaceRecoveryRegistry } from '../../src/runtime/v2/surface-recovery.js';

const level = (control: Record<string, unknown>) => ({
  path: 'ctx.ui.level.level',
  control: { kind: 'hierarchy', name: 'organization', entityKey: 'sys-principals', ...control },
});

describe('surface recovery target identity', () => {
  it('matches a reconstructed Create Organization by semantic identity, not ephemeral path', () => {
    const registry = new UiSurfaceRecoveryRegistry();
    registry.register(organizationRecoveryProvider);
    const stored = level({ mode: 'create', path: '/ui/old-runtime-path' });
    const live = level({ mode: 'create', path: '/ui/new-runtime-path' });

    expect(registry.matchesRecoveryTarget(stored, live)).toBe(true);
    expect(organizationRecoveryProvider.recoveryUrl?.(stored)).toBe(
      '/bo/sys-principals/hierarchy/new',
    );
  });

  it('does not cross-match another organization entity, mode, workspace, or edited record', () => {
    const registry = new UiSurfaceRecoveryRegistry();
    registry.register(organizationRecoveryProvider);
    const stored = level({ mode: 'edit', recordId: 'p1', path: '/ui/old-runtime-path' });

    expect(registry.matchesRecoveryTarget(stored, level({ mode: 'edit', recordId: 'p1' }))).toBe(
      true,
    );
    expect(registry.matchesRecoveryTarget(stored, level({ mode: 'edit', recordId: 'p2' }))).toBe(
      false,
    );
    expect(registry.matchesRecoveryTarget(stored, level({ mode: 'create' }))).toBe(false);
    expect(
      registry.matchesRecoveryTarget(
        stored,
        level({ mode: 'edit', recordId: 'p1', name: 'other' }),
      ),
    ).toBe(false);
    expect(
      registry.matchesRecoveryTarget(
        stored,
        level({ mode: 'edit', recordId: 'p1', entityKey: 'other-entity' }),
      ),
    ).toBe(false);
  });
});
