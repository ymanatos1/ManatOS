import { Component, input } from '@angular/core';
import type { ApiTrafficEntry } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-api-traffic-transaction-tab',
  standalone: true,
  templateUrl: './ApiTrafficTransactionTab.html',
  styleUrl: './ApiTrafficTransactionTab.css',
})
export class ApiTrafficTransactionTab {
  readonly transactionId = input.required<string>();
  readonly entries = input.required<readonly ApiTrafficEntry[]>();
}
