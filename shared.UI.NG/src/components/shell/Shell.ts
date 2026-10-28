import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, computed } from '@angular/core';
import { type MetadataLanguage } from '@manatos/shared';

@Component({
  selector: 'manatos-shell',
  standalone: true,
  templateUrl: './Shell.html',
  styleUrl: './Shell.css',
})
export class Shell {
  protected readonly multilingual = computed(() => multilingual(this.language(), []));

  readonly language = input<MetadataLanguage>('EN');
  readonly workspaceNavigationCollapsed = input(false);
  readonly workspaceNavigationAvailable = input(true);
  readonly workspaceNavigationCollapsedChange = output<boolean>();

  protected collapseWorkspaceNavigation(): void {
    this.workspaceNavigationCollapsedChange.emit(true);
  }

  protected showWorkspaceNavigation(): void {
    this.workspaceNavigationCollapsedChange.emit(false);
  }
}
