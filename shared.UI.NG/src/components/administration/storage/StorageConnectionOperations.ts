import { Component, input } from '@angular/core';
import { StorageWizardState } from './StorageWizardState';

/** Connection target operations; no other tab dispatch. */
@Component({
  selector: 'manatos-storage-connection-operations',
  standalone: true,
  templateUrl: './StorageConnectionOperations.html',
  styleUrl: './StorageOperations.css',
})
export class StorageConnectionOperations {
  readonly wizard = input.required<StorageWizardState>();
}
