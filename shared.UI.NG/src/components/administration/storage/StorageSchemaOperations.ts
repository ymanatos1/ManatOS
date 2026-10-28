import { Component, input } from '@angular/core';
import { StorageWizardState } from './StorageWizardState';

/** Schema inspection and preparation are explicit, target-verified operations. */
@Component({
  selector: 'manatos-storage-schema-operations',
  standalone: true,
  templateUrl: './StorageSchemaOperations.html',
  styleUrl: './StorageOperations.css',
})
export class StorageSchemaOperations {
  readonly wizard = input.required<StorageWizardState>();
}
