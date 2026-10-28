import type { SysBOGuard } from '../../../../../domain/entities.js';
import type { SysBOMetadata } from '../../../types.js';
import { commonSysBOFields } from '../../../common.js';

/** Two authored business fields; the normal SysBO record retains framework-managed audit values. */
export const sysBOGuardsMetadata: SysBOMetadata<SysBOGuard> = {
  key: 'sys-guards',
  name: 'sysGuards',
  subsystem: 'surveillance',
  label: '@EN.platforms.panoptes.surveillance.guards.label.Guard' /* Guard */,
  pluralLabel: '@EN.platforms.panoptes.surveillance.guards.pluralLabel.Guards' /* Guards */,
  primaryField: 'name',
  fieldDefinition: {
    ...commonSysBOFields,
  },
};
