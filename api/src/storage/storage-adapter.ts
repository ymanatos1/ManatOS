import type { SysBOPictureValue } from '@manatos/shared';

/**
 * Result returned when the active storage adapter is explicitly flushed.
 */
export interface StorageFlushResult {
  provider: string;

  persistence: string;

  flushed: boolean;

  timestamp: string;

  details?: string;
}

/**
 * Common capabilities expected from a storage adapter.
 *
 * This interface can expand as SQL/PostgreSQL/etc. adapters are added.
 */
export interface StorageAdapter {
  writePicture(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    contentType: SysBOPictureValue['contentType'],
    bytes: Buffer,
    revision: string,
  ): Promise<void>;

  readPicture(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue,
  ): Promise<Buffer | null>;

  deletePicture(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue | null | undefined,
  ): Promise<void>;

  writePictureItem(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    pictureId: string,
    contentType: SysBOPictureValue['contentType'],
    bytes: Buffer,
    revision: string,
  ): Promise<void>;

  readPictureItem(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue,
  ): Promise<Buffer | null>;

  deletePictureItem(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue,
  ): Promise<void>;

  /**
   * Explicitly flush any pending in-memory/storage state to the
   * adapter's durable persistence mechanism where applicable.
   *
   * For a traditional transactional database this may be a no-op
   * because writes are already durable.
   */
  flush(): Promise<StorageFlushResult>;
}
