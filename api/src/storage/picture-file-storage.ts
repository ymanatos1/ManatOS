import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { operationContext, type SysBOPictureValue } from '@manatos/shared';

const extensions: Record<SysBOPictureValue['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export class PictureFileStorage {
  constructor(private readonly rootDirectory: string) {}

  async write(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    contentType: SysBOPictureValue['contentType'],
    bytes: Buffer,
    revision: string,
  ): Promise<void> {
    await operationContext.run('Write picture file', async (scope) => {
      scope.addContext({ entityKey, recordId, fieldKey, contentType, byteLength: bytes.length });
      const directory = join(this.rootDirectory, safe(entityKey), safe(recordId));
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, fileName(fieldKey, contentType, revision)), bytes);
    });
  }

  async read(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue,
  ): Promise<Buffer | null> {
    return operationContext.run('Read picture file', async (scope) => {
      scope.addContext({ entityKey, recordId, fieldKey });
      try {
        return await readFile(
          join(
            this.rootDirectory,
            safe(entityKey),
            safe(recordId),
            fileName(fieldKey, picture.contentType, picture.revision),
          ),
        );
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') return null;
        throw error;
      }
    });
  }

  async writeItem(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    pictureId: string,
    contentType: SysBOPictureValue['contentType'],
    bytes: Buffer,
    revision: string,
  ): Promise<void> {
    await operationContext.run('Write picture collection item', async (scope) => {
      scope.addContext({
        entityKey,
        recordId,
        fieldKey,
        pictureId,
        contentType,
        byteLength: bytes.length,
      });
      const directory = join(this.rootDirectory, safe(entityKey), safe(recordId), safe(fieldKey));
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, itemFileName(pictureId, contentType, revision)), bytes);
    });
  }

  async readItem(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue,
  ): Promise<Buffer | null> {
    if (!picture.id) return null;
    return operationContext.run('Read picture collection item', async (scope) => {
      scope.addContext({ entityKey, recordId, fieldKey, pictureId: picture.id });
      try {
        return await readFile(
          join(
            this.rootDirectory,
            safe(entityKey),
            safe(recordId),
            safe(fieldKey),
            itemFileName(picture.id!, picture.contentType, picture.revision),
          ),
        );
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') return null;
        throw error;
      }
    });
  }

  async deleteItem(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue,
  ): Promise<void> {
    if (!picture.id) return;
    await operationContext.run('Delete picture collection item', async (scope) => {
      scope.addContext({ entityKey, recordId, fieldKey, pictureId: picture.id });
      await rm(
        join(
          this.rootDirectory,
          safe(entityKey),
          safe(recordId),
          safe(fieldKey),
          itemFileName(picture.id!, picture.contentType, picture.revision),
        ),
        { force: true },
      );
    });
  }

  async delete(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue | null | undefined,
  ): Promise<void> {
    if (!picture) return;
    await operationContext.run('Delete picture file', async (scope) => {
      scope.addContext({ entityKey, recordId, fieldKey });
      await rm(
        join(
          this.rootDirectory,
          safe(entityKey),
          safe(recordId),
          fileName(fieldKey, picture.contentType, picture.revision),
        ),
        { force: true },
      );
    });
  }
}

function itemFileName(
  pictureId: string,
  contentType: SysBOPictureValue['contentType'],
  revision: string,
): string {
  return `${safe(pictureId)}-${safe(revision)}.${extensions[contentType]}`;
}

function fileName(
  fieldKey: string,
  contentType: SysBOPictureValue['contentType'],
  revision: string,
): string {
  return `${safe(fieldKey)}-${safe(revision)}.${extensions[contentType]}`;
}

function safe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
