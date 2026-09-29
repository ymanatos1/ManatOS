/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  persistedCollectionPictureSource,
  persistedScalarPictureSource,
} from '@manatos/shared/presentation/picture-value';

const browserWindow = window as any;
browserWindow.ManatOS ||= {};

const pendingResourceKey = (picture: any): string | null => {
  if (!picture || picture.pending !== true) return null;
  const identity = String(picture.revision ?? picture.id ?? '');
  return identity.startsWith('pending:') ? `picture:${identity}` : null;
};

export class PictureValuePresentation {
  install(): void {
    const scalarDescriptor = (
      entityKey: unknown,
      identity: unknown,
      fieldKey: unknown,
      picture: any,
    ) => {
      if (!picture) return { label: '∅', icons: [] };
      const resourceKey = pendingResourceKey(picture);
      return {
        label: picture.pending === true ? 'New picture' : 'Existing picture',
        icons: ['bi-image'],
        rawValue: picture,
        ...(resourceKey
          ? { imageResourceKey: resourceKey, fieldKey: String(fieldKey || '') }
          : persistedScalarPictureSource(entityKey, identity, fieldKey, picture)
            ? { imageSrc: persistedScalarPictureSource(entityKey, identity, fieldKey, picture) }
            : {}),
      };
    };

    const collectionDescriptor = (
      entityKey: unknown,
      identity: unknown,
      fieldKey: unknown,
      value: any,
    ) => {
      const pictures = Array.isArray(value) ? value : value == null ? [] : [value];
      return {
        label:
          pictures.length === 0
            ? '∅'
            : `${pictures.length} ${pictures.length === 1 ? 'picture' : 'pictures'} selected`,
        icons: pictures.length === 0 ? [] : ['bi-images'],
        rawValue: value,
        images: pictures.map((picture: any) => {
          const resourceKey = pendingResourceKey(picture);
          const source = persistedCollectionPictureSource(entityKey, identity, fieldKey, picture);
          return {
            label: picture?.pending === true ? 'New picture' : 'Existing picture',
            ...(resourceKey
              ? { imageResourceKey: resourceKey, fieldKey: String(fieldKey || '') }
              : source
                ? { imageSrc: source }
                : {}),
          };
        }),
      };
    };

    browserWindow.ManatOS.pictureValuePresentation = Object.freeze({
      persistedScalarSource: persistedScalarPictureSource,
      persistedCollectionSource: persistedCollectionPictureSource,
      scalarDescriptor,
      collectionDescriptor,
    });
  }
}

export const pictureValuePresentation = new PictureValuePresentation();
