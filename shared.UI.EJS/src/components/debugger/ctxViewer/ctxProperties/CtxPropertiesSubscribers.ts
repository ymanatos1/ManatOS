import type { CtxSubscriberMatch, CtxSubscriberProjection } from '@manatos/shared-ui';

interface SubscriberCategory {
  readonly key: CtxSubscriberMatch;
  readonly label: string;
  readonly description: string;
}

const CATEGORIES: readonly SubscriberCategory[] = Object.freeze([
  Object.freeze({
    key: 'direct',
    label: 'Direct',
    description: 'Registrations explicitly observing the selected CTX path.',
  }),
  Object.freeze({
    key: 'dependent',
    label: 'Dependents',
    description: 'Registrations whose CTX path overlaps the selected path.',
  }),
  Object.freeze({
    key: 'global',
    label: 'Global',
    description: 'Registrations observing all CTX mutations.',
  }),
]);

export interface CtxPropertiesSubscribersController {
  render(subscribers: readonly CtxSubscriberProjection[]): void;
  destroy(): void;
}

export function createCtxPropertiesSubscribers(
  host: HTMLElement,
): CtxPropertiesSubscribersController {
  const document = host.ownerDocument;
  const abortController = new AbortController();
  let selectedCategory: CtxSubscriberMatch = 'direct';
  let currentSubscribers: readonly CtxSubscriberProjection[] = [];

  const count = (category: CtxSubscriberMatch) =>
    currentSubscribers.filter((subscriber) => subscriber.match === category).length;

  const activeCategory = (): CtxSubscriberMatch => selectedCategory;

  const render = () => {
    const tabs = document.createElement('div');
    tabs.className = 'ctx-debug-subscriber-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'CTX subscriber registrations');
    tabs.dataset.multilingualAriaLabel = 'CtxSubscriberRegistrations';

    for (const category of CATEGORIES) {
      const button = document.createElement('button');
      const registrations = count(category.key);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.subscriberCategory = category.key;
      button.classList.toggle('is-active', activeCategory() === category.key);
      button.classList.toggle('has-registrations', registrations > 0);
      button.setAttribute('aria-selected', String(activeCategory() === category.key));
      button.title = category.description;
      button.textContent =
        registrations > 0 ? `${category.label} (${registrations})` : category.label;
      tabs.appendChild(button);
    }

    const list = document.createElement('ul');
    list.className = 'ctx-debug-subscriber-list';
    const visible = currentSubscribers.filter(
      (subscriber) => subscriber.match === activeCategory(),
    );

    if (!visible.length) {
      const empty = document.createElement('li');
      empty.className = 'ctx-debug-properties-empty';
      empty.textContent = 'No registrations in this category.';
      empty.dataset.multilingualText = 'NoRegistrations';
      list.appendChild(empty);
    } else {
      for (const subscriber of visible) {
        const item = document.createElement('li');
        const kind = document.createElement('span');
        kind.className = 'ctx-debug-subscriber-kind';
        kind.textContent = subscriber.label;
        const path = document.createElement('code');
        path.className = 'ctx-debug-subscriber-paths';
        path.textContent = `${subscriber.displayPath}${subscriber.recursive ? ' · recursive' : ''}`;
        item.append(kind, path);
        list.appendChild(item);
      }
    }

    host.replaceChildren(tabs, list);
  };

  host.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element;
      const button = target.closest<HTMLButtonElement>('[data-subscriber-category]');
      const category = button?.dataset.subscriberCategory as CtxSubscriberMatch | undefined;
      if (!category) return;
      selectedCategory = category;
      render();
    },
    { signal: abortController.signal },
  );

  return {
    render(subscribers) {
      currentSubscribers = subscribers;
      render();
    },
    destroy() {
      abortController.abort();
      host.replaceChildren();
    },
  };
}
