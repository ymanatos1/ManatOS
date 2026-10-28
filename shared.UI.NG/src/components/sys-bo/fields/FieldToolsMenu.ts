import { Component, ElementRef, OnDestroy, effect, inject, input, viewChild } from '@angular/core';
import { UiFieldToolsView, type UiEntryFieldPresentation } from '@manatos/shared-ui';
import { EntryContext } from '../entry/EntryContext';
import { UiTransientMenuCoordinator } from '../../../runtime/surfaces/TransientMenu';

/** NG1 lifecycle adapter for the shared FieldTools button, menu and interactions.
 * No Angular-specific FieldTools markup or styles. */
@Component({
  selector: 'manatos-field-tools-menu',
  standalone: true,
  templateUrl: './FieldToolsMenu.html',
})
export class FieldToolsMenu implements OnDestroy {
  private readonly entry = inject(EntryContext);
  private readonly overlays = inject(UiTransientMenuCoordinator);
  private readonly host = viewChild<ElementRef<HTMLElement>>('toolsHost');
  readonly field = input.required<UiEntryFieldPresentation>();
  private view: UiFieldToolsView | null = null;

  constructor() {
    effect(() => {
      const host = this.host()?.nativeElement;
      const field = this.field();
      const inspectAllowed = this.entry.inspectorAllowed();
      const open = this.entry.openToolsField() === field.field;
      if (!host) return;
      this.view ??= new UiFieldToolsView(host, {
        mountOverlay: (menu, anchor, dismiss) => this.overlays.mount(menu, anchor, dismiss),
        perform: (id) => void this.run(id),
        toggle: () => this.entry.toggleTools(this.field().field),
        dismissed: () => this.entry.dismissTools(),
      });
      this.view.update(field, inspectAllowed);
      this.view.setOpen(open);
    });
  }

  private async run(id: string): Promise<void> {
    const field = this.field();
    if (!this.view?.allows(id)) return;
    this.entry.dismissTools();
    if (id === 'select') {
      if (field.relatedEntityKey) this.entry.browseReferences(field.field, field.relatedEntityKey);
      return;
    }
    if (id === 'view') {
      if (field.relatedEntityKey && typeof field.value === 'string')
        this.entry.viewRelatedEntry(field.relatedEntityKey, field.value);
      return;
    }
    if (id === 'add') {
      if (field.relatedEntityKey) this.entry.createReference(field.field, field.relatedEntityKey);
      return;
    }
    if (id === 'inspect-ctx') {
      if (this.entry.inspectorAllowed()) this.entry.inspectField(field.field);
      return;
    }
    const text = await this.entry.performFieldTool(field.field, id);
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard permissions are not part of the Field's semantic state.
    }
  }

  ngOnDestroy(): void {
    this.view?.dispose();
    this.view = null;
  }
}
