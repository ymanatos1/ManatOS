import type { SysBOPost } from '../../../../../domain/entities.js';
import type { SysBOMetadata } from '../../../types.js';
import { commonSysBOFields } from '../../../common.js';

/** Two authored business fields; the normal SysBO record retains framework-managed audit values. */
export const sysBOPostsMetadata: SysBOMetadata<SysBOPost> = {
  key: 'sys-posts',
  name: 'sysPosts',
  subsystem: 'surveillance',
  label: '@EN.platforms.panoptes.surveillance.posts.label.Post' /* Post */,
  pluralLabel: '@EN.platforms.panoptes.surveillance.posts.pluralLabel.Posts' /* Posts */,
  primaryField: 'name',
  fieldDefinition: {
    ...commonSysBOFields,
  },
};
