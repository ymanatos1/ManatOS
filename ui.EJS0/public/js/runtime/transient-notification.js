(() => {
  'use strict';

  window.ManatOS ||= {};

  const variants = new Set(['success', 'danger', 'warning', 'info']);
  const show = ({ message, variant = 'info', anchor = null, duration = 3000 } = {}) => {
    const text = String(message || '').trim();
    if (!text) return null;
    const panel = document.createElement('div');
    panel.className = `manatos-transient-notification is-${variants.has(variant) ? variant : 'info'}`;
    panel.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
    panel.textContent = text;
    document.body.appendChild(panel);

    const margin = 10;
    const anchorRect = anchor instanceof Element ? anchor.getBoundingClientRect() : null;
    const panelRect = panel.getBoundingClientRect();
    const preferredLeft = anchorRect
      ? anchorRect.right + 8
      : window.innerWidth - panelRect.width - margin;
    const fallbackLeft = anchorRect ? anchorRect.left - panelRect.width - 8 : preferredLeft;
    let left =
      preferredLeft + panelRect.width <= window.innerWidth - margin ? preferredLeft : fallbackLeft;
    left = Math.max(margin, Math.min(left, window.innerWidth - panelRect.width - margin));
    let top = anchorRect ? anchorRect.top : margin;
    top = Math.max(margin, Math.min(top, window.innerHeight - panelRect.height - margin));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    requestAnimationFrame(() => panel.classList.add('is-visible'));

    const dispose = () => {
      panel.classList.remove('is-visible');
      panel.classList.add('is-disposing');
      window.setTimeout(() => panel.remove(), 220);
    };
    window.setTimeout(dispose, Math.max(0, Number(duration) || 3000));
    return Object.freeze({ element: panel, dispose });
  };

  window.ManatOS.notifications = Object.freeze({ show });
})();
