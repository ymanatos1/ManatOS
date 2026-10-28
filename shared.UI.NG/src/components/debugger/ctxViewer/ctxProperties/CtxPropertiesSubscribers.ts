import { multilingual } from '@manatos/shared-ui';
import { Component, computed, input, signal } from '@angular/core';
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

@Component({
  selector: 'manatos-ctx-properties-subscribers',
  standalone: true,
  templateUrl: './CtxPropertiesSubscribers.html',
  styleUrl: './CtxPropertiesSubscribers.css',
})
export class CtxPropertiesSubscribers {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['CtxSubscriberRegistrations', 'NoRegistrations'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly subscribers = input.required<readonly CtxSubscriberProjection[]>();

  protected readonly categories = CATEGORIES;
  protected readonly selectedCategory = signal<CtxSubscriberMatch>('direct');
  protected readonly activeCategory = computed<CtxSubscriberMatch>(() => this.selectedCategory());
  protected readonly visibleSubscribers = computed(() =>
    this.subscribers().filter((subscriber) => subscriber.match === this.activeCategory()),
  );

  protected count(category: CtxSubscriberMatch): number {
    return this.subscribers().filter((subscriber) => subscriber.match === category).length;
  }

  protected selectCategory(category: CtxSubscriberMatch): void {
    this.selectedCategory.set(category);
  }
}
