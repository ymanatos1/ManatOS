import { Component, OnChanges, SimpleChanges, input, signal, computed } from '@angular/core';
import { formatCtxValue, multilingual } from '@manatos/shared-ui';

import { ApiTrafficHeaders } from '../ApiTrafficHeaders';

type PayloadTab = 'headers' | 'body';

@Component({
  selector: 'manatos-api-traffic-payload-tab',
  standalone: true,
  imports: [ApiTrafficHeaders],
  templateUrl: './ApiTrafficPayloadTab.html',
  styleUrl: './ApiTrafficPayloadTab.css',
})
export class ApiTrafficPayloadTab implements OnChanges {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), [
      'PayloadSections',
      'Headers',
      'Body',
      'HttpHeaderDescriptions',
      'ApiBodyDescription',
    ] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly headers = input.required<Readonly<Record<string, string>>>();
  readonly body = input<unknown>();
  readonly metadata = input.required<readonly { label: string; value: string }[]>();
  readonly identity = input<unknown>(null);

  protected readonly activeTab = signal<PayloadTab>('headers');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['identity'] && !changes['identity'].firstChange) this.activeTab.set('headers');
    if (!this.hasBody() && this.activeTab() === 'body') this.activeTab.set('headers');
  }

  protected selectTab(tab: PayloadTab): void {
    if (tab === 'body' && !this.hasBody()) return;
    this.activeTab.set(tab);
  }

  protected hasBody(): boolean {
    return this.body() !== undefined;
  }

  protected format(value: unknown): string {
    return formatCtxValue(value);
  }
}
