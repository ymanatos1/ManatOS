import { Component, OnChanges, computed, input, signal } from '@angular/core';
import type { ApiDiagnosticContextSnapshot } from '@manatos/shared';
import { createApiTrafficContextRuntime } from '@manatos/shared-ui';

import { CtxTree } from '../../ctxViewer/CtxTree';

@Component({
  selector: 'manatos-api-traffic-context-tab',
  standalone: true,
  imports: [CtxTree],
  templateUrl: './ApiTrafficContextTab.html',
  styleUrl: './ApiTrafficContextTab.css',
})
export class ApiTrafficContextTab implements OnChanges {
  readonly language = input<'EN' | 'EL'>('EN');
  readonly value = input.required<ApiDiagnosticContextSnapshot>();
  readonly expandAllInitially = input(false);

  protected readonly selectedPath = signal('ctx');
  protected readonly source = computed(() => createApiTrafficContextRuntime(this.value()));

  ngOnChanges(): void {
    this.selectedPath.set('ctx');
  }
}
