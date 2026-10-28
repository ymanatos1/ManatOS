import type { SysBOProject } from '../../../../../domain/entities.js';
import type { SysBOMetadata } from '../../../types.js';
import { commonSysBOFields } from '../../../common.js';

/** Two authored business fields; the normal SysBO record retains framework-managed audit values. */
export const sysBOProjectsMetadata: SysBOMetadata<SysBOProject> = {
  key: 'sys-projects',
  name: 'sysProjects',
  subsystem: 'surveillance',
  label: '@EN.platforms.panoptes.surveillance.projects.label.Project' /* Project */,
  pluralLabel: '@EN.platforms.panoptes.surveillance.projects.pluralLabel.Projects' /* Projects */,
  primaryField: 'name',
  fieldDefinition: {
    ...commonSysBOFields,
  },
};
