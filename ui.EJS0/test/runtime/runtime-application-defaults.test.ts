import { sysBOApplicationsMetadata } from '@manatos/shared';
import { describe, expect, it } from 'vitest';

describe('V2 application create defaults', () => {
  it('declares the initial semantic version in canonical entity metadata', () => {
    expect(sysBOApplicationsMetadata.fieldDefinition.version?.createDefaultValue).toBe('0.0.1');
  });
});
