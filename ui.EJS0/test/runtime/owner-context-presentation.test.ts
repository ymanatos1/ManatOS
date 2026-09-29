import { describe, expect, it } from 'vitest';
import { ownerContextPresentation } from '../../src/runtime/v2/owner-context-presentation.js';

describe('owner context presentation', () => {
  it('projects aggregate return-to-caller ownership without coupling it to a host', () => {
    const result = ownerContextPresentation({
      control: {
        host: 'page',
        persistence: {
          kind: 'return-to-caller',
          owner: { kind: 'hierarchy', name: 'organization', uiLevelPath: 'ctx.ui.level' },
          ultimateBoundary: { kind: 'aggregate', ownerUiLevelPath: 'ctx.ui.level' },
        },
      },
    });
    expect(result?.label).toBe('Owner: Organization');
    expect(result?.title).toContain('until the owning aggregate is committed');
  });

  it('projects inherited ownership independently of a descendant persistence strategy', () => {
    const result = ownerContextPresentation({
      control: {
        persistence: {
          kind: 'transient',
          owner: { kind: 'hierarchy', name: 'organization', uiLevelPath: 'ctx.ui.level' },
          ultimateBoundary: { kind: 'aggregate', ownerUiLevelPath: 'ctx.ui.level' },
        },
      },
    });
    expect(result?.label).toBe('Owner: Organization');
  });

  it('does not decorate surfaces without owner context', () => {
    expect(
      ownerContextPresentation({ control: { persistence: { kind: 'repository' } } }),
    ).toBeNull();
  });
});
