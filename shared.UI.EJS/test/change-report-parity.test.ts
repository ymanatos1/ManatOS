// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import type { UiChangeReport } from '@manatos/shared-ui';
import { renderHierarchicalReport } from '../src/components/common/change-report/HierarchicalReport.js';

describe('EJS1 Change Report presentation parity', () => {
  it('renders one report frame and retains expansions across live language changes', () => {
    const english: UiChangeReport = {
      kind: 'entry',
      count: 1,
      summary: 'One change',
      nodes: [
        {
          id: 'entry',
          label: 'User',
          expanded: true,
          children: [{ id: 'fields', label: 'Fields', expanded: true, count: 1 }],
        },
      ],
    };
    const greek: UiChangeReport = {
      kind: 'entry',
      count: 1,
      summary: 'Μία αλλαγή',
      nodes: [
        {
          id: 'entry',
          label: 'Χρήστης',
          expanded: true,
          children: [{ id: 'fields', label: 'Πεδία', expanded: true, count: 1 }],
        },
      ],
    };
    const report: UiChangeReport = { ...english, localized: { EN: english, EL: greek } };
    const host = document.createElement('div');
    renderHierarchicalReport(host, report, 'EN');
    expect(host.querySelectorAll('.ejs-change-report-frame')).toHaveLength(1);
    expect(host.textContent).toContain('One change');
    const child = host.querySelector<HTMLDetailsElement>(
      'details[data-change-node-path="/entry/fields"]',
    );
    expect(child).not.toBeNull();
    child!.open = false;
    const expanded = new Map<string, boolean>();
    for (const node of host.querySelectorAll<HTMLDetailsElement>(
      'details[data-change-node-path]',
    )) {
      expanded.set(node.dataset['changeNodePath']!, node.open);
    }
    host.querySelector('.ejs-change-report-frame')?.remove();
    renderHierarchicalReport(host, report, 'EL', expanded);
    expect(host.querySelectorAll('.ejs-change-report-frame')).toHaveLength(1);
    expect(host.textContent).toContain('Μία αλλαγή');
    expect(
      host.querySelector<HTMLDetailsElement>('details[data-change-node-path="/entry/fields"]')
        ?.open,
    ).toBe(false);
  });
});
