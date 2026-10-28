/** Framework-neutral resource requests. No bearer tokens or cookies enter this contract. */
export interface UiRelatedRecordRequest {
  readonly entityKey: string;
  readonly ids: readonly string[];
}
/** Grouped arrays of Entry-presentation projections from the generic GET API. */
export type UiRelatedRecords = Readonly<
  Record<string, readonly Readonly<Record<string, unknown>>[]>
>;

export type UiSurfaceResourceRequest =
  | Readonly<{ kind: 'sysbo.list'; entityKey: string; query: Readonly<Record<string, string>> }>
  | Readonly<{ kind: 'sysbo.entry'; entityKey: string; recordId: string }>
  | Readonly<{ kind: 'sysbo.entry-draft'; entityKey: string }>
  | Readonly<{ kind: 'sysbo.expression-function'; functionName: string; args: readonly unknown[] }>
  | Readonly<{
      kind: 'sysbo.entry-create';
      entityKey: string;
      record: Readonly<Record<string, unknown>>;
    }>
  | Readonly<{ kind: 'sysbo.references'; targets: readonly UiRelatedRecordRequest[] }>
  | Readonly<{
      kind: 'sysbo.reference-choice';
      sourceEntity: string;
      sourceId: string;
      field: string;
      candidateId: string;
    }>;

export interface UiSurfaceResourcePort {
  request<T>(request: UiSurfaceResourceRequest): Promise<T>;
}
export class UiSurfaceResourceFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UiSurfaceResourceFailure';
  }
}
