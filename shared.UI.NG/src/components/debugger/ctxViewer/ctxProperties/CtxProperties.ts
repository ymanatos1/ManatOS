import {
  Component,
  OnChanges,
  SimpleChanges,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import { formatCtxPath, projectCtxNodeProperties, multilingual } from '@manatos/shared-ui';

import { CtxPropertiesMain } from './CtxPropertiesMain';
import { CtxPropertiesProps } from './CtxPropertiesProps';
import { CtxPropertiesAttrs } from './CtxPropertiesAttrs';
import { CtxPropertiesSubscribers } from './CtxPropertiesSubscribers';

type CtxPropertiesTab = 'main' | 'properties' | 'attributes' | 'subscribers';

@Component({
  selector: 'manatos-ctx-properties',
  standalone: true,
  imports: [CtxPropertiesMain, CtxPropertiesProps, CtxPropertiesAttrs, CtxPropertiesSubscribers],
  templateUrl: './CtxProperties.html',
  styleUrl: './CtxProperties.css',
  host: {
    'data-debug-resizable-panel': 'ctx-properties',
    '[attr.data-debug-preferred-height]': 'preferredHeight()',
    '[style.height.px]': 'preferredHeight()',
  },
})
export class CtxProperties implements OnChanges {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), [
      'CtxNodeProperties',
      'CloseProperties',
      'CtxPropertySections',
      'MainNodeInformation',
      'SemanticNodeProperties',
      'SemanticNodeAttributes',
      'CtxRuntimeSubscribers',
      'Properties',
      'Attributes',
      'Subscribers',
      'DragResize',
    ] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly context = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly path = input.required<string>();
  readonly revision = input.required<number>();
  readonly heightPreference = input<number | null>(null);
  readonly closeRequested = output<void>();
  readonly navigate = output<string>();

  protected readonly activeTab = signal<CtxPropertiesTab>('main');
  protected readonly preferredHeight = computed(() => this.resolveHeight(this.heightPreference()));

  protected readonly projection = computed(() => {
    this.revision();
    return projectCtxNodeProperties(this.context(), this.path());
  });
  protected readonly displayPath = computed(() => formatCtxPath(this.path()));

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['path'] && !changes['path'].firstChange) this.activeTab.set('main');
  }

  protected selectTab(tab: CtxPropertiesTab): void {
    this.activeTab.set(tab);
  }

  private resolveHeight(value: number | null): number {
    return value === null ? 190 : Math.max(110, Math.min(420, Math.round(value)));
  }
}
