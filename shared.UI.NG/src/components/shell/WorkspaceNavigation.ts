import {
  activeWorkspaceNavigationItemId,
  multilingual,
  workspaceNavigationHref,
} from '@manatos/shared-ui';
import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output, computed } from '@angular/core';

import type { UiNavigationItem } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-workspace-navigation',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './WorkspaceNavigation.html',
  styleUrl: './WorkspaceNavigation.css',
})
export class WorkspaceNavigation {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['WorkspaceNavigation', 'PersonalActions', 'Workspace'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly items = input.required<readonly UiNavigationItem[]>();
  readonly pathname = input('/');
  protected readonly activeId = computed(() =>
    activeWorkspaceNavigationItemId(this.items(), this.pathname()),
  );

  protected readonly linkHref = workspaceNavigationHref;

  readonly itemSelected = output<UiNavigationItem>();
  protected select(item: UiNavigationItem, event: MouseEvent): void {
    // Keep native link behavior for modified clicks and auxiliary buttons.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    this.itemSelected.emit(item);
  }
}
