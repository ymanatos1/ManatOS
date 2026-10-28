const DEBUG_TOOLTIP_DELAY_MS = 2200;

export interface DebugTooltipHostController {
  destroy(): void;
}

export function mountDebugTooltipHost(host: HTMLElement): DebugTooltipHostController {
  const abortController = new AbortController();
  let activeTarget: HTMLElement | null = null;
  let tooltip: HTMLElement | null = null;
  let nativeTitle: string | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let pointerX: number | null = null;

  const isNode = (value: EventTarget | null): value is Node =>
    Boolean(value && typeof (value as Node).nodeType === 'number');

  const hide = () => {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    tooltip?.remove();
    tooltip = null;
    if (activeTarget && nativeTitle !== null) activeTarget.setAttribute('title', nativeTitle);
    activeTarget = null;
    nativeTitle = null;
    pointerX = null;
  };

  const position = () => {
    if (!activeTarget || !tooltip) return;
    const view = activeTarget.ownerDocument.defaultView;
    if (!view) return;

    const targetRect = activeTarget.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 8;
    let left =
      pointerX === null
        ? targetRect.left + Math.min(12, Math.max(0, targetRect.width / 4))
        : pointerX + 12;
    left = Math.max(margin, Math.min(left, view.innerWidth - tooltipRect.width - margin));

    let top = targetRect.bottom + 7;
    if (top + tooltipRect.height + margin > view.innerHeight) {
      top = Math.max(margin, targetRect.top - tooltipRect.height - 7);
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  };

  const show = (candidate: HTMLElement, title: string) => {
    showTimer = null;
    if (activeTarget !== candidate) return;

    const document = candidate.ownerDocument;
    const element = document.createElement('div');
    element.className = 'manatos-debug-tooltip';
    element.setAttribute('role', 'tooltip');

    const value = candidate.dataset.debugTooltipValue?.trim();
    if (value) {
      element.classList.add('is-value-tooltip');
      const line = document.createElement('div');
      line.className = 'manatos-debug-tooltip-value-line';
      const heading = document.createElement('span');
      heading.className = 'manatos-debug-tooltip-title';
      heading.textContent = title;
      const separator = document.createElement('span');
      separator.className = 'manatos-debug-tooltip-separator';
      separator.textContent = ' = ';
      const valueElement = document.createElement('span');
      valueElement.className = 'manatos-debug-tooltip-value';
      valueElement.textContent = value;
      line.append(heading, separator, valueElement);
      element.appendChild(line);
    } else {
      const heading = document.createElement('div');
      heading.className = 'manatos-debug-tooltip-title';
      heading.textContent = title;
      element.appendChild(heading);
    }

    const detail = candidate.dataset.debugTooltipDetail?.trim();
    if (detail) {
      const details = document.createElement('div');
      details.className = 'manatos-debug-tooltip-detail';
      details.textContent = detail;
      element.appendChild(details);
    }

    document.body.appendChild(element);
    tooltip = element;
    document.defaultView?.requestAnimationFrame(position);
  };

  const activate = (target: EventTarget | null, nextPointerX: number | null) => {
    if (!target || typeof (target as Element).closest !== 'function') return;
    const candidate = (target as Element).closest<HTMLElement>('[data-debug-tooltip], [title]');
    if (!candidate || !host.contains(candidate) || candidate === activeTarget) return;

    const title = candidate.dataset.debugTooltip?.trim() || candidate.getAttribute('title')?.trim();
    if (!title) return;

    hide();
    activeTarget = candidate;
    pointerX = candidate.dataset.ctxPath ? nextPointerX : null;
    nativeTitle = candidate.getAttribute('title');
    if (nativeTitle !== null) candidate.removeAttribute('title');
    showTimer = setTimeout(() => show(candidate, title), DEBUG_TOOLTIP_DELAY_MS);
  };

  host.addEventListener(
    'pointerover',
    (event) => activate(event.target, Number.isFinite(event.clientX) ? event.clientX : null),
    { signal: abortController.signal },
  );
  host.addEventListener(
    'pointermove',
    (event) => {
      if (activeTarget?.dataset.ctxPath && Number.isFinite(event.clientX)) {
        pointerX = event.clientX;
      }
    },
    { signal: abortController.signal },
  );
  host.addEventListener(
    'pointerout',
    (event) => {
      if (!activeTarget) return;
      const related = event.relatedTarget;
      if (isNode(related) && activeTarget.contains(related)) return;
      hide();
    },
    { signal: abortController.signal },
  );
  host.addEventListener('focusin', (event) => activate(event.target, null), {
    signal: abortController.signal,
  });
  host.addEventListener(
    'focusout',
    (event) => {
      if (!activeTarget) return;
      const related = event.relatedTarget;
      if (isNode(related) && activeTarget.contains(related)) return;
      hide();
    },
    { signal: abortController.signal },
  );
  host.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') hide();
    },
    { signal: abortController.signal },
  );

  return {
    destroy() {
      abortController.abort();
      hide();
    },
  };
}
