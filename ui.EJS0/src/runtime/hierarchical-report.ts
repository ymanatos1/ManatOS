/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Universal hierarchical review/report renderer.
 *
 * Domain adapters project recovery snapshots, commit plans and future bulk
 * operations into this neutral tree. The renderer owns only presentation:
 * nested disclosure, counts, severity, scrolling and expand/collapse controls.
 */

const browserWindow = window as any;
browserWindow.ManatOS ||= {};

export class HierarchicalReportRenderer {
  install(): void {
    const text = (value: any) => String(value ?? '');
    const html = (value: any) =>
      text(value).replace(
        /[&<>"']/g,
        (character) =>
          (
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<
              string,
              string
            >
          )[character] ?? character,
      );
    const severityClass = (severity: any) =>
      (
        ({
          danger: 'text-danger',
          warning: 'text-warning-emphasis',
          success: 'text-success',
        }) as Record<string, string>
      )[String(severity)] || 'text-body';

    const icon = (value: any, fallback: any) =>
      /^bi-[a-z0-9-]+$/.test(text(value)) ? text(value) : fallback;

    const descriptorHtml = (
      descriptor: any,
      fallback = '∅',
      resourceResolver: any = null,
      className = '',
      resourceScope: string | null = null,
    ) => {
      if (descriptor == null || typeof descriptor !== 'object')
        return `<span${className ? ` class="${html(className)}"` : ''}>${html(descriptor ?? fallback)}</span>`;
      if (descriptor.kind === 'email') {
        return `<span class="metadata-compact-value metadata-readonly-email${className ? ` ${html(className)}` : ''}" title="Email address"><i class="bi bi-envelope" aria-hidden="true"></i> <span>${html(descriptor.label ?? fallback)}</span></span>`;
      }
      if (descriptor.kind === 'boolean-badge') {
        const positive = descriptor.positive === true;
        return `<span class="boolean-badge ${positive ? 'boolean-true' : 'boolean-false'}${className ? ` ${html(className)}` : ''}"><i class="bi ${positive ? 'bi-check-circle-fill' : 'bi-dash-circle'}"></i> ${html(descriptor.label ?? fallback)}</span>`;
      }
      if (descriptor.kind === 'system-identifier') {
        return `<span class="metadata-system-identifier${className ? ` ${html(className)}` : ''}" title="System identifier"><i class="bi bi-fingerprint" aria-hidden="true"></i> <code>${html(descriptor.label ?? fallback)}</code></span>`;
      }
      if (descriptor.kind === 'option-badge') {
        const tone = /^(primary|secondary|success|danger|warning|info)$/.test(
          String(descriptor.tone || ''),
        )
          ? String(descriptor.tone)
          : 'secondary';
        const optionIcon = /^bi-[a-z0-9-]+$/.test(text(descriptor.icon))
          ? `<i class="bi ${html(descriptor.icon)}" aria-hidden="true"></i> `
          : '';
        return `<span class="badge text-bg-${html(tone)}${className ? ` ${html(className)}` : ''}">${optionIcon}${html(descriptor.label ?? fallback)}</span>`;
      }
      if (Array.isArray(descriptor.images) && descriptor.images.length > 0) {
        const images = descriptor.images
          .map((imageDescriptor: any) =>
            descriptorHtml(imageDescriptor, 'Picture', resourceResolver, '', resourceScope),
          )
          .join('<span class="mx-1"></span>');
        return `<span class="d-inline-flex align-items-center flex-wrap gap-1${className ? ` ${html(className)}` : ''}">${images}</span>`;
      }
      const runtimeResource = descriptor.imageResourceKey
        ? resourceResolver?.(resourceScope, descriptor.imageResourceKey, descriptor) || null
        : null;
      const runtimeImageSrc =
        runtimeResource?.contentType && runtimeResource?.dataBase64
          ? `data:${runtimeResource.contentType};base64,${runtimeResource.dataBase64}`
          : '';
      const imageSrc =
        runtimeImageSrc || (typeof descriptor.imageSrc === 'string' ? descriptor.imageSrc : '');
      if (imageSrc) {
        return `<span class="d-inline-flex align-items-center gap-1${className ? ` ${html(className)}` : ''}"><img src="${html(imageSrc)}" alt="" style="width:1.15rem;height:1.15rem;object-fit:cover;border-radius:.2rem"><span${descriptor.ownerWorkspaceState === true ? ' class="fst-italic"' : ''}>${html(descriptor.label ?? fallback)}</span></span>`;
      }
      const icons = Array.isArray(descriptor.icons) ? descriptor.icons : [];
      const iconHtml = icons
        .filter((value: any) => /^bi-[a-z0-9-]+$/.test(text(value)))
        .map((value: any) => `<i class="bi ${html(value)} me-1" aria-hidden="true"></i>`)
        .join('');
      const prefix = descriptor.prefix ? html(descriptor.prefix) : '';
      return `<span${className ? ` class="${html(className)}"` : ''}>${prefix}${iconHtml}<span${descriptor.ownerWorkspaceState === true ? ' class="fst-italic"' : ''}>${html(descriptor.label ?? fallback)}</span></span>`;
    };

    const nodeHtml = (
      node: any,
      depth = 0,
      resourceResolver: any = null,
      inheritedResourceScope: string | null = null,
    ) => {
      const resourceScope =
        typeof node?.resourceScope === 'string' ? node.resourceScope : inheritedResourceScope;
      const children = Array.isArray(node?.children) ? node.children : [];
      const details = Array.isArray(node?.details) ? node.details : [];
      const expandable = children.length > 0 || details.length > 0;
      const count =
        node?.count != null
          ? `<span class="badge text-bg-light border ms-auto">${html(node.count)}</span>`
          : '';
      const statusValues = Array.isArray(node?.statuses)
        ? node.statuses.filter((value: any) => value != null && String(value).trim())
        : node?.status
          ? [node.status]
          : [];
      const status = statusValues
        .map((value: any) => `<span class="badge text-bg-light border ms-2">${html(value)}</span>`)
        .join('');
      const body = [
        ...details.map(
          (detail: any) => `<div class="d-flex gap-3 py-1 small border-bottom border-light-subtle">
          <span class="text-body-secondary flex-shrink-0" style="min-width:8rem">${html(detail.label)}</span>
          <span class="text-break">${
            detail?.from !== undefined || detail?.to !== undefined
              ? `<span class="d-inline-flex align-items-center flex-wrap">${descriptorHtml(detail.from, '∅', resourceResolver, '', resourceScope)}<i class="bi bi-arrow-right mx-2 text-body-secondary" aria-hidden="true"></i>${descriptorHtml(detail.to, '∅', resourceResolver, '', resourceScope)}</span>`
              : descriptorHtml(detail.value, '∅', resourceResolver, '', resourceScope)
          }</span>
        </div>`,
        ),
        ...children.map((child: any) =>
          nodeHtml(child, depth + 1, resourceResolver, resourceScope),
        ),
      ].join('');
      if (!expandable) {
        return `<div class="d-flex align-items-center gap-2 py-2 px-2 border-bottom ${severityClass(node?.severity)}" data-hierarchical-report-depth="${depth}">
        <i class="bi ${icon(node?.icon, 'bi-dot')} flex-shrink-0" aria-hidden="true"></i>
        ${
          node?.entryDescriptor
            ? descriptorHtml(
                node.entryDescriptor,
                node?.label || 'Item',
                resourceResolver,
                `text-truncate${node?.emphasis ? ' fw-bold' : ''}`,
                resourceScope,
              )
            : `<span class="text-truncate${node?.emphasis ? ' fw-bold' : ''}">${html(node?.label || 'Item')}</span>`
        }${status}${count}
      </div>`;
      }
      return `<details class="border-bottom" data-hierarchical-report-node data-hierarchical-report-depth="${depth}"${node?.expanded ? ' open' : ''}>
      <summary class="d-flex align-items-center gap-2 py-2 px-2 ${severityClass(node?.severity)}" style="cursor:pointer;list-style:none">
        <i class="bi bi-chevron-right hierarchical-report-chevron flex-shrink-0" aria-hidden="true"></i>
        <i class="bi ${icon(node?.icon, 'bi-folder2-open')} flex-shrink-0" aria-hidden="true"></i>
        ${
          node?.entryDescriptor
            ? descriptorHtml(
                node.entryDescriptor,
                node?.label || 'Group',
                resourceResolver,
                `text-truncate${node?.emphasis ? ' fw-bold' : ''}`,
                resourceScope,
              )
            : `<span class="text-truncate${node?.emphasis ? ' fw-bold' : ''}">${html(node?.label || 'Group')}</span>`
        }${status}${count}
      </summary>
      <div class="ps-3 border-start ms-3 mb-1">${body}</div>
    </details>`;
    };

    const render = (host: any, model: any, options: any = {}) => {
      if (!(host instanceof HTMLElement)) return;
      const nodes = Array.isArray(model?.nodes) ? model.nodes : [];
      host.innerHTML = `
      <div class="d-flex align-items-center gap-2 mb-2">
        <div class="small text-body-secondary">${html(model?.summary || '')}</div>
        <div class="ms-auto btn-group btn-group-sm" role="group" aria-label="Report expansion controls">
          <button type="button" class="btn btn-outline-secondary" data-hierarchical-report-expand>Expand all</button>
          <button type="button" class="btn btn-outline-secondary" data-hierarchical-report-collapse>Collapse all</button>
        </div>
      </div>
      <div class="border rounded overflow-auto" style="max-height:20rem" data-hierarchical-report-tree>
        ${nodes.map((node: any) => nodeHtml(node, 0, options?.runtimeResourceResolver)).join('') || '<div class="p-3 text-body-secondary small">No detailed items.</div>'}
      </div>`;
      host.querySelector('[data-hierarchical-report-expand]')?.addEventListener('click', () => {
        host
          .querySelectorAll<HTMLDetailsElement>('details[data-hierarchical-report-node]')
          .forEach((node) => (node.open = true));
      });
      host.querySelector('[data-hierarchical-report-collapse]')?.addEventListener('click', () => {
        host
          .querySelectorAll<HTMLDetailsElement>('details[data-hierarchical-report-node]')
          .forEach((node) => (node.open = false));
      });
    };

    browserWindow.ManatOS.hierarchicalReport = Object.freeze({ render });
  }
}

export const hierarchicalReportRenderer = new HierarchicalReportRenderer();
