import { multilingual } from '@manatos/shared-ui';
import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'manatos-api-traffic-headers',
  standalone: true,
  templateUrl: './ApiTrafficHeaders.html',
  styleUrl: './ApiTrafficHeaders.css',
})
export class ApiTrafficHeaders {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['HttpHeaders', 'Name', 'Value', 'NoHeaders'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly headers = input.required<Readonly<Record<string, string>>>();

  protected readonly rows = computed(() =>
    Object.entries(this.headers()).sort(([left], [right]) => left.localeCompare(right)),
  );
}
