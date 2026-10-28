import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, computed } from '@angular/core';

@Component({
  selector: 'manatos-ctx-toolbar',
  standalone: true,
  templateUrl: './CtxToolbar.html',
  styleUrl: './CtxToolbar.css',
})
export class CtxToolbar {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), [
      'CtxViewerControls',
      'PreviousCtxSelection',
      'NextCtxSelection',
      'CopyCtxJson',
      'WatchCtxValue',
      'SelectedNodeProperties',
      'FindCtxVariable',
      'OpenCtxCli',
      'OpenCtxViewTab',
      'CtxSize',
      'CtxSizeDescription',
    ] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly canBack = input(false);
  readonly canForward = input(false);
  readonly watched = input(false);
  readonly propertiesOpen = input(false);
  readonly findOpen = input(false);
  readonly cliOpen = input(false);
  readonly stats = input('');

  readonly back = output<void>();
  readonly forward = output<void>();
  readonly copy = output<void>();
  readonly watch = output<void>();
  readonly properties = output<void>();
  readonly find = output<void>();
  readonly cli = output<void>();
  readonly openView = output<void>();
}
