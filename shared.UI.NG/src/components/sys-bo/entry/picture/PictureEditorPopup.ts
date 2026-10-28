import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  createUiSurfaceInvocation,
  UiHostLevelRuntime,
  pictureEditorPolicy,
  type PreparedPicture,
  type PictureEditorPolicy,
} from '@manatos/shared-ui';
import { createUiSemanticLayoutNode, type UiSemanticLayoutNode } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { uiModalHost, type UiModalLease } from '../../../../runtime/modal-host';
import { PopupTitle } from '../../../surfaces/PopupTitle';
import { EntryContext } from '../EntryContext';
import { NgUiSurfaceManager } from '../../../../runtime/surfaces/uiSurfaceManager';
import { PictureEditor } from './PictureEditor';

interface PictureEditorLevel {
  readonly control: {
    host: 'popup';
    kind: 'picture-editor';
    instanceId: string;
    invocation: ReturnType<typeof createUiSurfaceInvocation>;
  };
  readonly state: { currentIndex: number; busy: boolean; error: string | null };
  readonly layout: { editor: UiSemanticLayoutNode; actions: UiSemanticLayoutNode };
  readonly data: { field: string; totalFiles: number };
}

let nextPictureEditorInstance = 0;
/** Owns exactly one nested popup UIS #level and one PictureEditor composite. */
@Component({
  selector: 'manatos-picture-editor-popup',
  standalone: true,
  imports: [PopupTitle, PictureEditor],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './PictureEditorPopup.html',
  styleUrl: './PictureEditorPopup.css',
})
export class PictureEditorPopup implements AfterViewInit, OnDestroy {
  readonly request = input.required<{
    field: string;
    files: readonly File[];
    collection: boolean;
  }>();
  readonly language = input<MetadataLanguage>('EN');
  private readonly entry = inject(EntryContext);
  protected readonly surfaces = inject(NgUiSurfaceManager);
  protected popupOptions() {
    this.surfaces.popupPresentationRevision();
    return this.surfaces.popupPresentation();
  }
  protected setLanguage(value: string): void {
    this.surfaces.requestPopupLanguage(value);
  }
  protected readonly editor = viewChild(PictureEditor);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  protected readonly index = signal(0);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly fontScale = signal(100);
  private readonly prepared: Array<PreparedPicture | null> = [];
  protected readonly imagePreparing = computed(() => this.editor()?.ready() !== true);
  protected readonly previews = signal<readonly string[]>([]);
  private surface: UiHostLevelRuntime<PictureEditorLevel> | null = null;
  private lease: UiModalLease | null = null;
  protected readonly debuggerForeground = computed(
    () => this.popupOptions()?.debuggerForeground === true,
  );
  protected readonly debuggerDocked = computed(() => this.popupOptions()?.debuggerDocked === true);
  protected readonly debuggerDockWidth = computed(
    () => this.popupOptions()?.debuggerDockWidth ?? 0,
  );
  protected readonly title = computed(() => ({
    icon: 'bi-image',
    title: this.language() === 'EL' ? 'Επιλογή εικόνας' : 'Choose photo',
    subtitle: this.language() === 'EL' ? 'Επεξεργασία εικόνας' : 'Picture editor',
  }));
  protected readonly policy = computed<PictureEditorPolicy>(() =>
    pictureEditorPolicy(
      this.entry.level()?.control.invocation.params['entityKey'] as string,
      this.request().field,
    ),
  );
  protected currentFile(): File {
    return this.request().files[this.index()]!;
  }
  protected count(): number {
    return this.request().files.length;
  }
  protected isPrepared(index: number): boolean {
    return this.prepared[index] != null;
  }
  ngAfterViewInit(): void {
    const owner = this.entry.contextTree;
    const parent = this.entry.levelPath;
    if (!owner || !parent) throw new Error('Picture Editor requires an active parent Entry.');
    const instanceId = `picture-editor-${++nextPictureEditorInstance}`;
    this.surface = new UiHostLevelRuntime<PictureEditorLevel>(
      owner,
      {
        host: 'popup',
        kind: 'picture-editor',
        instanceId,
        invocation: createUiSurfaceInvocation({ params: { field: this.request().field } }),
      },
      () => ({
        state: { currentIndex: 0, busy: false, error: null },
        layout: {
          editor: createUiSemanticLayoutNode(
            'picture-editor',
            'editor',
            'PictureEditor',
            '[data-picture-editor]',
          ),
          actions: createUiSemanticLayoutNode(
            'picture-actions',
            'actions',
            'PictureEditorActions',
            '[data-picture-editor-actions]',
          ),
        },
        data: { field: this.request().field, totalFiles: this.count() },
      }),
      undefined,
      parent,
    );
    this.fontScale.set(this.surfaces.popupPresentation()?.initialFontScalePercent ?? 100);
    this.prepared.push(...this.request().files.map(() => null));
    this.previews.set(this.request().files.map((file) => URL.createObjectURL(file)));
    this.lease = uiModalHost.acquire(
      document,
      () => this.dialog()?.nativeElement ?? null,
      () => this.surfaces.popupPresentation()?.debuggerForeground === true,
    );
    const dialog = this.dialog()?.nativeElement;
    const firstControl = dialog?.querySelector<HTMLButtonElement>(
      '.manatos-picture-editor-toolbar button:not([disabled])',
    );
    if (firstControl?.getClientRects().length) firstControl.focus({ preventScroll: true });
    else dialog?.focus();
  }
  private sync(): void {
    this.surface?.set('state.currentIndex', this.index());
    this.surface?.set('state.busy', this.busy());
    this.surface?.set('state.error', this.error() || null);
  }
  protected inspect(): void {
    if (!this.surface) return;
    if (this.popupOptions()?.debuggerAllowed)
      this.surfaces.requestPopupDebugger(this.surface.levelPath);
  }
  protected close(): void {
    if (!this.busy()) this.entry.closePictureEditor();
  }
  protected backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.lease?.isTopmost()) this.close();
  }
  protected escape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.lease?.isTopmost()) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }
  /** EJS0 preserves original bytes for unedited items in multi-picture batches. */
  private async readOriginal(file: File): Promise<PreparedPicture> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Unable to read original picture.'));
      reader.readAsDataURL(file);
    });
    const comma = dataUrl.indexOf(',');
    if (comma < 0) throw new Error('Invalid original picture content.');
    return { contentType: file.type, dataBase64: dataUrl.slice(comma + 1), size: file.size };
  }
  /** One staged picture per source; revisiting an unedited file retains its prepared version. */
  private async stageCurrent(): Promise<void> {
    const editor = this.editor();
    if (!editor?.ready()) throw new Error('Picture editor is not ready.');
    const position = this.index();
    if (!this.prepared[position] || editor.edited()) {
      this.prepared[position] =
        this.request().collection && !editor.edited()
          ? await this.readOriginal(this.currentFile())
          : await editor.prepare();
    }
  }

  protected async chooseBatchFile(position: number): Promise<void> {
    if (
      !this.request().collection ||
      this.busy() ||
      position === this.index() ||
      position < 0 ||
      position >= this.count()
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.sync();
    try {
      await this.stageCurrent();
      this.index.set(position);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to prepare picture.');
    } finally {
      this.busy.set(false);
      this.sync();
    }
  }

  protected async apply(): Promise<void> {
    if (this.busy() || !this.editor()?.ready()) return;
    this.busy.set(true);
    this.error.set('');
    this.sync();
    try {
      await this.stageCurrent();
      if (this.index() + 1 < this.count()) {
        this.index.update((i) => i + 1);
      } else {
        const complete: PreparedPicture[] = [];
        for (let i = 0; i < this.count(); i++) {
          complete.push(this.prepared[i] ?? (await this.readOriginal(this.request().files[i]!)));
        }
        await this.entry.acceptPictureEdit(
          this.request().field,
          complete,
          this.request().collection,
        );
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Picture editing failed.');
    } finally {
      this.busy.set(false);
      this.sync();
    }
  }
  ngOnDestroy(): void {
    this.lease?.release();
    this.lease = null;
    this.surface?.dispose();
    this.surface = null;
    for (const url of this.previews()) URL.revokeObjectURL(url);
    this.previews.set([]);
    this.prepared.length = 0;
  }
}
