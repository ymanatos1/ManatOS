import { Component, input } from '@angular/core';
import { StorageWizardState } from './StorageWizardState';

/** Database selection and target operations belong exclusively to the Database tab. */
@Component({
  selector: 'manatos-storage-database-operations',
  standalone: true,
  templateUrl: './StorageDatabaseOperations.html',
  styleUrl: './StorageOperations.css',
})
export class StorageDatabaseOperations {
  readonly wizard = input.required<StorageWizardState>();

  async selectExisting(value: string): Promise<void> {
    this.wizard().selectDiscoveredDatabase(value);
    if (value) await this.wizard().operation('database/inspect');
  }
}
