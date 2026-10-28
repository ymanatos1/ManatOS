import { describe, expect, it } from 'vitest';
import { resolveMetadataText } from '@manatos/shared';
import {
  changeValuesEqual,
  entryChangeReport,
  entryChangeReportLocalized,
  localizedChangeReport,
  CHANGE_REPORT_POPUP,
} from '../../src/index.js';

describe('Common semantic change-report Surface contract', () => {
  it('uses EJS0 structural equality without object key-order sensitivity', () => {
    expect(changeValuesEqual({ a: 1, b: [2, { c: 3 }] }, { b: [2, { c: 3 }], a: 1 })).toBe(true);
    expect(changeValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(changeValuesEqual(null, {})).toBe(false);
  });
  it('provides typed current and previous values with localized metadata labels', () => {
    const report = entryChangeReport({
      entityKey: 'sys-users',
      language: 'EL',
      original: { id: 'a', name: 'Old name', enabled: false },
      current: { id: 'a', name: 'New name', enabled: true },
    });
    expect(report.kind).toBe('entry');
    expect(report.count).toBe(2);
    const fields = report.nodes[0]?.children?.[0]?.details ?? [];
    expect(fields.find((field) => field.key === 'name')?.from?.label).toBe('Old name');
    expect(fields.find((field) => field.key === 'name')?.to?.label).toBe('New name');
    expect(fields.find((field) => field.key === 'enabled')?.to?.label).toBe(
      resolveMetadataText('@CM.Enabled', 'EL'),
    );
    expect(fields.every((field) => !field.label.startsWith('@'))).toBe(true);
  });
  it('never exposes undeclared or sensitive fields even if given raw records', () => {
    const report = entryChangeReport({
      entityKey: 'sys-users',
      language: 'EN',
      original: { id: 'a', name: 'Before', passwordHash: 'secret1', unrelatedSecret: 'x' },
      current: { id: 'a', name: 'After', passwordHash: 'secret2', unrelatedSecret: 'y' },
    });
    expect(report.count).toBe(1);
    expect(report.nodes[0]?.children?.[0]?.details?.map((field) => field.key)).toEqual(['name']);
  });
  it('keeps collection changes as nested read-only report nodes', () => {
    const report = entryChangeReport({
      entityKey: 'sys-users',
      language: 'EN',
      original: { name: 'A' },
      current: { name: 'A' },
      collections: { identities: { original: [], current: [{ id: '1' }] } },
    });
    expect(report.count).toBe(1);
    expect(
      report.nodes[0]?.children?.find((node) => node.id === 'collections')?.children?.[0]?.status,
    ).toBe('0 → 1');
  });
  it('keeps distinct localized safe report snapshots for live popup language changes', () => {
    const report = entryChangeReportLocalized({
      entityKey: 'sys-users',
      language: 'EN',
      original: { id: 'a', enabled: false, passwordHash: 'old' },
      current: { id: 'a', enabled: true, passwordHash: 'new' },
    });
    const english = localizedChangeReport(report, 'EN');
    const greek = localizedChangeReport(report, 'EL');
    const englishField = english.nodes[0]?.children?.[0]?.details?.[0];
    const greekField = greek.nodes[0]?.children?.[0]?.details?.[0];
    expect(englishField?.key).toBe('enabled');
    expect(greekField?.key).toBe('enabled');
    expect(englishField?.to?.label).toBe(resolveMetadataText('@CM.Enabled', 'EN'));
    expect(greekField?.to?.label).toBe(resolveMetadataText('@CM.Enabled', 'EL'));
    expect(english.count).toBe(greek.count);
    expect(report.localized?.EN?.localized).toBeUndefined();
    expect(report.localized?.EL?.localized).toBeUndefined();
  });
  it('declares the common popup through the canonical popup definition and no native inputs', () => {
    expect(CHANGE_REPORT_POPUP.id).toBe('semantic.changeReport');
    expect(CHANGE_REPORT_POPUP.showLanguageSelection).toBe(true);
    expect(CHANGE_REPORT_POPUP.fields).toEqual([]);
    expect(CHANGE_REPORT_POPUP.view?.actions[0]?.id).toBe('cancel');
  });
});
