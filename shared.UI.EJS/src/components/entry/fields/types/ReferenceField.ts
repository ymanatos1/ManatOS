import { EntryFieldComponent } from '../EntryFieldComponent.js';
import { EjsTransientMenus } from '../../../../runtime/transient-menu.js';
import type { UiEntryFieldHistory, UiEntryFieldPresentation } from '@manatos/shared-ui';

/** Native selector displays authenticated Entry candidates and emits one canonical
 * select change; the semantic Field and Entry runtime own validation and editing. */
export class ReferenceField extends EntryFieldComponent {
  static readonly type = 'reference' as const;
  readonly templateName = 'ReferenceField';
  private canSelect = false;
  private selector: HTMLElement | null = null;
  private browseGeneration = 0;
  private browseReady = false;
  private canEditHistory = false;
  private readonly onPortalClick = (event: MouseEvent): void => {
    if (!this.root.contains(event.target as Node)) this.onClick(event);
  };
  private readonly onPortalInput = (event: Event): void => {
    if (!this.root.contains(event.target as Node)) this.onSearch(event);
  };
  private readonly onPortalKeydown = (event: KeyboardEvent): void => {
    if (!this.root.contains(event.target as Node)) this.onKeydown(event);
  };

  constructor(root: HTMLElement) {
    super(root);
  }

  override mount(): void {
    super.mount();
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('input', this.onSearch);
    this.root.addEventListener('keydown', this.onKeydown);
    this.root.addEventListener('manatos:reference-select-open', this.onOpen);
    this.selector = this.root.querySelector<HTMLElement>('[data-entry-reference-selector]');
    this.selector?.addEventListener('click', this.onPortalClick);
    this.selector?.addEventListener('input', this.onPortalInput);
    this.selector?.addEventListener('keydown', this.onPortalKeydown);
  }

  /** Closing invalidates an in-flight authorization response before it may write CTX. */
  private invalidateSelection(panel: HTMLElement): void {
    panel.dataset['referenceRequestVersion'] = String(
      (Number(panel.dataset['referenceRequestVersion']) || 0) + 1,
    );
    delete panel.dataset['referenceSelecting'];
    panel.inert = false;
  }

  private readonly onOpen = (): void => this.toggleSelector(true);
  private readonly onKeydown = (event: KeyboardEvent): void => {
    const panel = this.selector;
    if (!panel || panel.hidden || !panel.contains(event.target as Node)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.toggleSelector(false);
      this.root.querySelector<HTMLButtonElement>('[data-entry-reference-open]')?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)) return;
    const choices = Array.from(
      panel.querySelectorAll<HTMLButtonElement>(
        '[data-entry-reference-choice]:not([disabled]):not([hidden])',
      ),
    );
    if (!choices.length) return;
    if (event.key === 'Enter') {
      if (event.target instanceof HTMLInputElement) {
        event.preventDefault();
        choices[0]?.focus();
      }
      return;
    }
    event.preventDefault();
    const index = choices.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? choices.length - 1
          : event.key === 'ArrowDown'
            ? Math.min(index + 1, choices.length - 1)
            : index < 0
              ? choices.length - 1
              : Math.max(index - 1, 0);
    choices[next]?.focus();
  };

  private toggleSelector(open: boolean): void {
    const panel = this.selector;
    if (!panel) return;
    const coordinator = EjsTransientMenus.forDocument(this.root.ownerDocument);
    const anchor = this.root.querySelector<HTMLButtonElement>('[data-entry-reference-open]');
    if (open && this.canSelect && anchor) {
      panel.hidden = false;
      coordinator.open(panel, anchor, this.root, () => {
        panel.hidden = true;
        this.invalidateSelection(panel);
        ++this.browseGeneration;
        this.browseReady = false;
      });
      this.browseReady = false;
      const generation = ++this.browseGeneration;
      const entityKey = this.root.querySelector<HTMLElement>('[data-entry-related-entity]')
        ?.dataset['entryRelatedEntity'];
      const field = this.root.closest<HTMLElement>('[data-entry-field]')?.dataset['entryField'];
      const browse = panel.querySelector<HTMLButtonElement>('[data-entry-reference-browse]');
      if (browse) browse.disabled = true;
      if (entityKey && field)
        this.root.dispatchEvent(
          new CustomEvent('manatos:reference-browse-check', {
            bubbles: true,
            detail: {
              field,
              entityKey,
              resolve: (ready: boolean) => {
                if (generation !== this.browseGeneration || !coordinator.isOpen(panel)) return;
                this.browseReady = ready;
                if (browse) browse.disabled = !ready;
              },
            },
          }),
        );
    } else {
      ++this.browseGeneration;
      this.browseReady = false;
      if (coordinator.isOpen(panel)) coordinator.close();
      else this.invalidateSelection(panel);
      panel.hidden = true;
    }
    if (!panel.hidden) {
      const error = panel.querySelector<HTMLElement>('[data-entry-reference-error]');
      if (error) {
        error.hidden = true;
        error.textContent = '';
      }
      const search = panel.querySelector<HTMLInputElement>('[data-entry-reference-search]');
      if (search) {
        search.value = '';
        this.filter('');
        search.focus();
      }
    }
  }

  private filter(value: string): void {
    const term = value.trim().toLocaleLowerCase();
    for (const button of this.selector?.querySelectorAll<HTMLButtonElement>(
      '[data-entry-reference-choice]',
    ) ?? []) {
      button.hidden = !!term && !(button.textContent ?? '').toLocaleLowerCase().includes(term);
    }
  }

  private readonly onSearch = (event: Event): void => {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.matches('[data-entry-reference-search]')
    ) {
      this.filter(event.target.value);
    }
  };

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      this.selector?.dataset['referenceSelecting'] === 'true' &&
      target.closest(
        '[data-entry-reference-choice], [data-entry-reference-clear], ' +
          '[data-entry-reference-create], [data-entry-reference-browse]',
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const historyAction = target.closest<HTMLButtonElement>(
      '[data-entry-reference-undo], [data-entry-reference-redo]',
    );
    if (historyAction) {
      event.preventDefault();
      event.stopPropagation();
      if (!this.canEditHistory || historyAction.disabled) return;
      const field = this.root.closest<HTMLElement>('[data-entry-field]')?.dataset['entryField'];
      if (!field) return;
      this.toggleSelector(false);
      this.root.dispatchEvent(
        new CustomEvent('manatos:entry-field-history', {
          bubbles: true,
          detail: {
            field,
            action: historyAction.hasAttribute('data-entry-reference-undo') ? 'undo' : 'redo',
          },
        }),
      );
      return;
    }
    if (target.closest('[data-entry-reference-close]')) {
      this.toggleSelector(false);
      return;
    }
    if (target.matches('[data-entry-reference-selector]')) {
      this.toggleSelector(false);
      return;
    }
    if (target.closest('[data-entry-reference-view]')) {
      const id = this.root.querySelector<HTMLSelectElement>('select[data-entry-control]')?.value;
      const entityKey = this.root.querySelector<HTMLElement>('[data-entry-related-entity]')
        ?.dataset['entryRelatedEntity'];
      if (id && entityKey)
        this.root.dispatchEvent(
          new CustomEvent('manatos:reference-view', {
            bubbles: true,
            detail: { id, entityKey },
          }),
        );
      return;
    }
    if (target.closest('[data-entry-reference-clear]')) {
      if (!this.root.querySelector<HTMLSelectElement>('select[data-entry-control]')?.value) return;
      this.toggleSelector(false);
      this.root.dispatchEvent(
        new CustomEvent('manatos:reference-clear', {
          bubbles: true,
          detail: {
            field: this.root.closest<HTMLElement>('[data-entry-field]')?.dataset['entryField'],
          },
        }),
      );
      return;
    }
    if (target.closest('[data-entry-reference-create]')) {
      this.toggleSelector(false);
      this.root.dispatchEvent(
        new CustomEvent('manatos:reference-create', {
          bubbles: true,
          detail: {
            field: this.root.closest<HTMLElement>('[data-entry-field]')?.dataset['entryField'],
          },
        }),
      );
      return;
    }
    if (target.closest('[data-entry-reference-browse]')) {
      if (!this.browseReady) return;
      this.toggleSelector(false);
      this.root.dispatchEvent(
        new CustomEvent('manatos:reference-browse', {
          bubbles: true,
          detail: {
            field: this.root.closest<HTMLElement>('[data-entry-field]')?.dataset['entryField'],
          },
        }),
      );
      return;
    }
    if (target.closest('[data-entry-reference-open], [data-entry-reference-open-arrow]')) {
      this.toggleSelector(
        !EjsTransientMenus.forDocument(this.root.ownerDocument).isOpen(this.selector!),
      );
      return;
    }
    const choice = target.closest<HTMLButtonElement>('[data-entry-reference-choice]');
    if (!choice || choice.disabled || !this.canSelect) return;
    const id = choice.dataset['entryReferenceChoice'] ?? '';
    const select = this.root.querySelector<HTMLSelectElement>('select[data-entry-control]');
    if (
      !select ||
      !Array.from(select.options).some((option) => option.value === id && !option.disabled)
    ) {
      return;
    }
    // Cached candidates only advertise convenience choices. The Entry runtime
    // validates the GUID/relationship/authorization through the BFF before changing CTX.
    this.root.dispatchEvent(
      new CustomEvent('manatos:reference-choice', {
        bubbles: true,
        detail: {
          field: this.root.closest<HTMLElement>('[data-entry-field]')?.dataset['entryField'],
          id,
        },
      }),
    );
  };

  override updateHistory(history: UiEntryFieldHistory | undefined): void {
    const visible = this.canEditHistory && !!history?.changes.length;
    for (const [selector, ready] of [
      ['[data-entry-reference-undo]', !!history && history.cursor > 0],
      ['[data-entry-reference-redo]', !!history && history.cursor < history.changes.length],
    ] as const) {
      const button = this.root.querySelector<HTMLButtonElement>(selector);
      if (!button) continue;
      button.hidden = !visible;
      button.disabled = !visible || !ready;
    }
  }

  override update(field: UiEntryFieldPresentation): void {
    this.canSelect = !field.readOnly && !!field.relatedEntityKey;
    this.canEditHistory = !field.readOnly;
    const wrapper = this.root.querySelector<HTMLElement>('[data-entry-related-entity]');
    if (wrapper) wrapper.dataset['entryRelatedEntity'] = field.relatedEntityKey ?? '';
    const control = this.root.querySelector<HTMLButtonElement>('[data-entry-reference-open]');
    const select = this.root.querySelector<HTMLSelectElement>('select[data-entry-control]');
    const name = this.root.querySelector<HTMLElement>('[data-entry-reference-name]');
    if (name) {
      name.textContent =
        field.relatedName ||
        (field.value
          ? field.language === 'EL'
            ? 'Άγνωστο'
            : 'Unknown'
          : field.language === 'EL'
            ? field.required
              ? 'Επιλογή…'
              : 'Κανένα'
            : field.required
              ? 'Choose…'
              : 'None');
    }
    const icons = this.root.querySelector<HTMLElement>('[data-entry-reference-icons]');
    if (icons) {
      icons.replaceChildren();
      for (const icon of field.relatedIcons ?? []) {
        if (!/^[a-z][a-z0-9-]*$/.test(icon)) continue;
        const element = icons.ownerDocument.createElement('i');
        element.className = `bi bi-${icon}`;
        element.setAttribute('aria-hidden', 'true');
        icons.append(element);
      }
    }
    const photo = this.root.querySelector<HTMLImageElement>('[data-entry-reference-photo]');
    if (photo) {
      if (field.relatedPhotoUrl && photo.getAttribute('src') !== field.relatedPhotoUrl) {
        photo.src = field.relatedPhotoUrl;
      }
      photo.hidden = !field.relatedPhotoUrl;
    }
    if (control) {
      control.disabled = !this.canSelect;
      control.setAttribute('aria-label', field.label);
    }
    const arrow = this.root.querySelector<HTMLButtonElement>('[data-entry-reference-open-arrow]');
    if (arrow) {
      arrow.disabled = !this.canSelect;
      arrow.title = field.language === 'EL' ? 'Επιλογή εγγραφής' : 'Select entry';
      arrow.setAttribute('aria-label', arrow.title);
    }
    const view = this.root.querySelector<HTMLButtonElement>('[data-entry-reference-view]');
    if (view) {
      view.disabled = !field.value || field.canViewRelated !== true;
      view.title = field.language === 'EL' ? 'Προβολή επιλεγμένης εγγραφής' : 'View selected entry';
      view.setAttribute('aria-label', view.title);
    }
    for (const [selector, en, el] of [
      ['[data-entry-reference-undo]', 'Undo', 'Αναίρεση'],
      ['[data-entry-reference-redo]', 'Redo', 'Επανάληψη'],
    ] as const) {
      const button = this.root.querySelector<HTMLButtonElement>(selector);
      if (!button) continue;
      button.title = field.language === 'EL' ? el : en;
      button.setAttribute('aria-label', button.title);
    }
    // Preserve the disabled chevron like NG1; hiding it changes the control geometry.
    const title = this.root.querySelector<HTMLElement>('[data-entry-reference-title]');
    if (title) title.textContent = field.label;
    const panel = this.selector;
    if (panel)
      panel.setAttribute(
        'aria-label',
        `${field.language === 'EL' ? 'Επιλογή εγγραφής' : 'Select existing entry'}: ${field.label}`,
      );
    const translated: readonly [string, string][] =
      field.language === 'EL'
        ? [
            ['[data-entry-reference-search]', 'Αναζήτηση εγγραφών…'],
            ['[data-entry-reference-clear-text]', 'Κενό'],
            ['[data-entry-reference-add-text]', 'Προσθήκη'],
            ['[data-entry-reference-browse-text]', 'Αναζήτηση'],
          ]
        : [
            ['[data-entry-reference-search]', 'Search entries…'],
            ['[data-entry-reference-clear-text]', 'Empty'],
            ['[data-entry-reference-add-text]', 'Add new…'],
            ['[data-entry-reference-browse-text]', 'Browse list…'],
          ];
    for (const [selector, value] of translated) {
      const item =
        this.root.querySelector<HTMLElement>(selector) ??
        this.selector?.querySelector<HTMLElement>(selector);
      if (!item) continue;
      if (item instanceof HTMLInputElement) {
        item.placeholder = value;
        item.setAttribute('aria-label', `${value} ${field.label}`);
      } else item.textContent = value;
    }
    const catalogue = this.selector?.querySelector<HTMLElement>(
      '[data-entry-reference-catalogue-status]',
    );
    if (catalogue) {
      catalogue.hidden = !field.relatedCatalogueStatus;
      catalogue.textContent = !field.relatedCatalogueStatus
        ? ''
        : field.relatedCatalogueStatus === 'unauthorized'
          ? field.language === 'EL'
            ? 'Δεν επιτρέπεται η φόρτωση των σχετικών εγγραφών.'
            : 'You are not authorized to browse the reference catalogue.'
          : field.relatedCatalogueStatus === 'unavailable'
            ? field.language === 'EL'
              ? 'Η φόρτωση των σχετικών εγγραφών απέτυχε. Δοκιμάστε την αναζήτηση σε λίστα.'
              : 'Reference catalogue unavailable. Try Browse list.'
            : field.language === 'EL'
              ? 'Εμφανίζεται μέρος των εγγραφών. Χρησιμοποιήστε τη λίστα για όλες.'
              : 'Showing a limited selection. Browse list for more.';
    }
    const canClear = this.canSelect && typeof field.value === 'string' && field.value.length > 0;
    const clear = this.selector?.querySelector<HTMLButtonElement>(
      'footer [data-entry-reference-clear]',
    );
    if (clear) clear.disabled = !canClear;
    const browse = this.selector?.querySelector<HTMLButtonElement>('[data-entry-reference-browse]');
    if (browse) browse.disabled = !this.browseReady;
    const list = this.selector?.querySelector<HTMLElement>('[data-entry-reference-candidate-list]');
    const candidates = field.relatedCandidates ?? [];
    const signature = `${field.language}:${JSON.stringify(candidates)}`;
    if (list && select && list.dataset['candidateSignature'] !== signature) {
      list.dataset['candidateSignature'] = signature;
      list.replaceChildren();
      select.replaceChildren();
      const blank = select.ownerDocument.createElement('option');
      blank.value = '';
      select.append(blank);
      for (const candidate of candidates) {
        const option = select.ownerDocument.createElement('option');
        option.value = candidate.id;
        option.textContent = candidate.name;
        option.disabled = candidate.unavailable;
        select.append(option);
        const button = list.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'manatos-reference-candidate';
        button.setAttribute('role', 'option');
        button.dataset['entryReferenceChoice'] = candidate.id;
        button.disabled = candidate.unavailable;
        if (candidate.unavailableReason) button.title = candidate.unavailableReason;
        for (const icon of candidate.icons) {
          if (!/^[a-z][a-z0-9-]*$/.test(icon)) continue;
          const node = list.ownerDocument.createElement('i');
          node.className = `bi bi-${icon}`;
          node.setAttribute('aria-hidden', 'true');
          button.append(node);
        }
        if (candidate.photoUrl && /^\/(?!\/)[^\s<>"']+$/.test(candidate.photoUrl)) {
          const image = list.ownerDocument.createElement('img');
          image.className = 'manatos-field-reference-photo';
          image.src = candidate.photoUrl;
          image.alt = '';
          image.loading = 'lazy';
          button.append(image);
        }
        const text = list.ownerDocument.createElement('span');
        text.textContent = candidate.name;
        button.append(text);
        if (candidate.unavailableReason) {
          const reason = list.ownerDocument.createElement('small');
          reason.className = 'manatos-reference-unavailable-reason';
          reason.textContent = candidate.unavailableReason;
          button.append(reason);
        }
        list.append(button);
      }
      if (!candidates.length) {
        const empty = list.ownerDocument.createElement('p');
        empty.className = 'manatos-reference-selector-empty';
        empty.textContent =
          field.language === 'EL' ? 'Δεν βρέθηκαν εγγραφές.' : 'No entries available.';
        list.append(empty);
      }
    }
    const empty = list?.querySelector<HTMLElement>('.manatos-reference-selector-empty');
    if (empty)
      empty.textContent =
        field.language === 'EL' ? 'Δεν βρέθηκαν εγγραφές.' : 'No entries available.';
    const none = list?.querySelector<HTMLButtonElement>('[data-entry-reference-clear]');
    if (none) none.disabled = !canClear;
    if (select) {
      select.value = typeof field.value === 'string' ? field.value : '';
      select.disabled = !this.canSelect;
    }
    for (const choice of this.selector?.querySelectorAll<HTMLButtonElement>(
      '[data-entry-reference-choice]',
    ) ?? []) {
      choice.setAttribute(
        'aria-selected',
        String(choice.dataset['entryReferenceChoice'] === field.value),
      );
    }
    if (!this.canSelect) this.toggleSelector(false);
  }

  override dispose(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('input', this.onSearch);
    this.root.removeEventListener('keydown', this.onKeydown);
    this.root.removeEventListener('manatos:reference-select-open', this.onOpen);
    this.toggleSelector(false);
    this.selector?.removeEventListener('click', this.onPortalClick);
    this.selector?.removeEventListener('input', this.onPortalInput);
    this.selector?.removeEventListener('keydown', this.onPortalKeydown);
    this.selector = null;
    super.dispose();
  }
}
