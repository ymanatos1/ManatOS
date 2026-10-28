import type {
  ContextTreeRuntime,
  ManatOSRuntimeRootContext,
  MetadataLanguage,
} from '@manatos/shared';
import {
  UiHostLevelRuntime,
  createUiSurfaceInvocation,
  createUiSemanticLayoutNode,
  type PictureEditorPolicy,
  type PreparedPicture,
  type UiLanguageDefinition,
} from '@manatos/shared-ui';
import { acquireEjsModal, type EjsModalLease } from '../../../runtime/modal-host.js';
import { PopupTitle, type MountedPopupTitle } from '../../surfaces/PopupTitle.js';
import { renderNativeComponent } from '../../native-template.js';

type Rect = { x: number; y: number; width: number; height: number };
type EditorLevel = {
  control: {
    host: 'popup';
    kind: string;
    instanceId: string;
    invocation: ReturnType<typeof createUiSurfaceInvocation>;
  };
  state: { currentIndex: number; busy: boolean; error: string | null };
  layout: {
    editor: ReturnType<typeof createUiSemanticLayoutNode>;
    actions: ReturnType<typeof createUiSemanticLayoutNode>;
  };
  data: { field: string; totalFiles: number };
};
let pictureSequence = 0;

/** Owns one nested #level, image decoding, canvas operations and batch confirmation. */
export class PictureEditorPopup {
  private backdrop: HTMLDivElement | null = null;
  private dialog: HTMLElement | null = null;
  private title: MountedPopupTitle | null = null;
  private lease: EjsModalLease | null = null;
  private surface: UiHostLevelRuntime<EditorLevel> | null = null;
  private readonly prepared: Array<PreparedPicture | null>;
  private readonly previews: string[];
  private index = 0;
  private busy = false;
  private loaded = false;
  private edited = false;
  private image: HTMLImageElement | null = null;
  private frame = 0;
  private generation = 0;
  private imageScale = 1;
  private minScale = 1;
  private offset = { x: 0, y: 0 };
  private crop: Rect | null = null;
  private mode: 'move' | 'crop' = 'move';
  private cropMode: 'proportional' | 'free' = 'proportional';
  private gesture: {
    kind: 'move' | 'crop' | 'crop-rect';
    start: { x: number; y: number };
    offset: { x: number; y: number };
  } | null = null;
  private readonly canvasWidth = 560;
  private readonly canvasHeight: number;

  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    private readonly parentLevelPath: string,
    private readonly field: string,
    private readonly files: readonly File[],
    private readonly collection: boolean,
    private readonly policy: PictureEditorPolicy,
    private language: MetadataLanguage,
    private readonly onAccept: (prepared: readonly PreparedPicture[]) => Promise<void>,
    private readonly onClose: () => void,
    private readonly foreground: () => boolean,
    private readonly debuggerRequested: (path: string) => void,
    private readonly debuggerAllowed: () => boolean,
    private readonly debuggerDockWidth: () => number | null,
    private readonly languages: () => readonly UiLanguageDefinition[],
    private readonly changeLanguage: (language: string) => void,
    private readonly fontScale: () => number,
  ) {
    this.prepared = files.map(() => null);
    this.previews = files.map((file) => URL.createObjectURL(file));
    this.canvasHeight = Math.round(
      this.canvasWidth / Math.max(0.3, Math.min(3, policy.cropAspectRatio)),
    );
  }

  open(): void {
    if (this.backdrop || !this.files.length) return;
    try {
      this.surface = new UiHostLevelRuntime<EditorLevel>(
        this.context,
        {
          host: 'popup',
          kind: 'picture-editor',
          instanceId: `ejs-picture-editor-${++pictureSequence}`,
          invocation: createUiSurfaceInvocation({ params: { field: this.field } }),
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
          data: { field: this.field, totalFiles: this.files.length },
        }),
        undefined,
        this.parentLevelPath,
      );
      const backdrop = document.createElement('div');
      backdrop.className = 'ejs-picture-editor-backdrop';
      const dialog = document.createElement('section');
      dialog.className = 'ejs-picture-editor-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('tabindex', '-1');
      dialog.dataset.uiLevelPath = this.surface.levelPath;
      dialog.innerHTML = renderNativeComponent(
        'PictureEditorPopup',
        {},
        {
          Editor: renderNativeComponent('PictureEditor', {
            CanvasWidth: this.canvasWidth,
            CanvasHeight: this.canvasHeight,
          }),
        },
      );
      backdrop.append(dialog);
      document.body.append(backdrop);
      this.backdrop = backdrop;
      this.dialog = dialog;
      this.title = PopupTitle.mount(dialog, {
        title: this.titleModel(),
        language: () => this.language,
        languages: this.languages(),
        selectLanguage: this.changeLanguage,
        showLanguageSelection: true,
        showClose: true,
        showFontScale: true,
        initialFontScalePercent: this.fontScale(),
        showDebugger: true,
        debuggerRequested: () => {
          if (this.debuggerAllowed() && this.surface)
            this.debuggerRequested(this.surface.levelPath);
        },
        flowDebuggerRequested: () => {},
        closeRequested: () => this.cancel(),
      });
      this.lease = acquireEjsModal(document, () => this.dialog, this.foreground);
      backdrop.addEventListener('click', this.onBackdrop);
      dialog.addEventListener('click', this.onClick);
      dialog.addEventListener('input', this.onInput);
      const canvas = this.canvas();
      canvas?.addEventListener('pointerdown', this.onDown);
      canvas?.addEventListener('pointermove', this.onMove);
      canvas?.addEventListener('pointerup', this.onUp);
      canvas?.addEventListener('pointercancel', this.onUp);
      document.addEventListener('keydown', this.onKeydown, true);
      this.refreshLanguage(this.language);
      this.refreshDebuggerControls();
      this.refresh();
      dialog.focus();
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        setTimeout(() => {
          if (this.dialog) void this.loadCurrent();
        }, 0);
      });
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private titleModel() {
    return {
      icon: 'bi-image',
      title: this.language === 'EL' ? 'Επιλογή εικόνας' : 'Choose photo',
      subtitle: this.language === 'EL' ? 'Επεξεργασία εικόνας' : 'Picture editor',
    };
  }
  refreshLanguage(next: MetadataLanguage): void {
    this.language = next;
    this.title?.updateTitle(this.titleModel());
    this.title?.updateLanguage();
    const set = (selector: string, en: string, el: string) => {
      const node = this.dialog?.querySelector<HTMLElement>(selector);
      if (node) node.textContent = this.language === 'EL' ? el : en;
    };
    set('[data-picture-move-text]', 'Move', 'Μετακίνηση');
    set('[data-picture-crop-text]', 'Crop area', 'Περιοχή περικοπής');
    set(
      '[data-picture-help]',
      'Move or zoom the picture, or select Crop area and drag over the portion to keep.',
      'Μετακινήστε ή μεγεθύνετε την εικόνα. Επιλέξτε περιοχή περικοπής σύροντας πάνω στην εικόνα.',
    );
    set('[data-picture-loading-text]', 'Preparing image…', 'Προετοιμασία εικόνας…');
    set('[data-picture-cancel]', 'Cancel', 'Άκυρον');
    set('[data-picture-cropmode="free"]', 'Free', 'Ελεύθερη');
    set('[data-picture-cropmode="proportional"]', 'Proportional', 'Αναλογική');
    this.refresh();
  }
  refreshDebuggerControls(): void {
    this.title?.updateDebugger(this.debuggerAllowed(), this.foreground());
    if (!this.backdrop || !this.dialog) return;
    const width = this.foreground() ? this.debuggerDockWidth() : null;
    this.backdrop.style.paddingRight = width && width > 0 ? `${width + 16}px` : '';
    if (this.foreground()) this.dialog.removeAttribute('aria-modal');
    else this.dialog.setAttribute('aria-modal', 'true');
  }
  private canvas(): HTMLCanvasElement | null {
    return this.dialog?.querySelector<HTMLCanvasElement>('[data-picture-canvas]') ?? null;
  }
  private markError(message: string): void {
    this.surface?.set('state.error', message || null);
    const error = this.dialog?.querySelector<HTMLElement>('[data-picture-error]');
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
  }
  private refresh(): void {
    const dialog = this.dialog;
    if (!dialog) return;
    const canvas = this.canvas();
    if (canvas) canvas.dataset.pictureMode = this.mode;
    const status = dialog.querySelector<HTMLElement>('[data-picture-loading]');
    if (status) status.hidden = this.loaded || !!this.surface?.level.state.error;
    for (const button of dialog.querySelectorAll<HTMLButtonElement>(
      '[data-picture-tool], [data-picture-cropmode]',
    )) {
      const tool = button.dataset.pictureTool;
      const mode = button.dataset.pictureCropmode;
      button.hidden =
        mode !== undefined && !this.policy.cropModes.includes(mode as 'free' | 'proportional');
      button.disabled = !this.loaded || this.busy;
      button.classList.toggle('active', tool === this.mode || mode === this.cropMode);
    }
    const zoom = dialog.querySelector<HTMLInputElement>('[data-picture-zoom]');
    if (zoom) zoom.disabled = !this.loaded || this.busy;
    const apply = dialog.querySelector<HTMLButtonElement>('[data-picture-apply]');
    if (apply) apply.disabled = !this.loaded || this.busy;
    const cancel = dialog.querySelector<HTMLButtonElement>('[data-picture-cancel]');
    if (cancel) cancel.disabled = this.busy;
    const label = dialog.querySelector<HTMLElement>('[data-picture-apply-text]');
    if (label)
      label.textContent =
        this.index + 1 < this.files.length
          ? this.language === 'EL'
            ? 'Επόμενη φωτογραφία'
            : 'Next picture'
          : this.language === 'EL'
            ? 'Χρήση φωτογραφίας'
            : 'Use photo';
    const batch = dialog.querySelector<HTMLElement>('[data-picture-batch]');
    if (batch) {
      batch.hidden = !this.collection || this.files.length <= 1;
      batch.replaceChildren();
      if (!batch.hidden)
        this.files.forEach((file, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.pictureBatch = String(index);
          button.className = index === this.index ? 'active' : '';
          button.disabled = this.busy;
          const image = document.createElement('img');
          image.src = this.previews[index]!;
          image.alt = '';
          const name = document.createElement('span');
          name.textContent = file.name;
          button.append(image, name);
          batch.append(button);
        });
    }
  }
  private async loadCurrent(): Promise<void> {
    const generation = ++this.generation;
    this.loaded = false;
    this.image = null;
    this.edited = false;
    this.mode = 'move';
    this.crop = null;
    this.gesture = null;
    const canvas = this.canvas();
    if (canvas) canvas.dataset.pictureDragging = 'false';
    this.markError('');
    this.paint();
    this.refresh();
    try {
      const image = new Image();
      image.src = this.previews[this.index]!;
      await image.decode();
      if (generation !== this.generation || !this.dialog) return;
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Invalid picture.');
      this.image = image;
      const canvas = this.canvas()!;
      this.minScale = Math.max(
        canvas.width / image.naturalWidth,
        canvas.height / image.naturalHeight,
      );
      this.imageScale = this.minScale;
      this.offset = {
        x: (canvas.width - image.naturalWidth * this.imageScale) / 2,
        y: (canvas.height - image.naturalHeight * this.imageScale) / 2,
      };
      this.cropMode = this.policy.cropModes[0] ?? 'proportional';
      this.loaded = true;
      this.paint();
      this.refresh();
    } catch (error) {
      if (generation === this.generation) {
        this.markError(error instanceof Error ? error.message : String(error));
        this.refresh();
      }
    }
  }
  private clampOrigin(): void {
    const canvas = this.canvas(),
      image = this.image;
    if (!canvas || !image) return;
    this.offset.x = Math.max(
      canvas.width - image.naturalWidth * this.imageScale,
      Math.min(0, this.offset.x),
    );
    this.offset.y = Math.max(
      canvas.height - image.naturalHeight * this.imageScale,
      Math.min(0, this.offset.y),
    );
  }
  private paint(): void {
    const canvas = this.canvas(),
      ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.image)
      ctx.drawImage(
        this.image,
        this.offset.x,
        this.offset.y,
        this.image.naturalWidth * this.imageScale,
        this.image.naturalHeight * this.imageScale,
      );
    if (this.crop && this.crop.width > 0 && this.crop.height > 0) {
      ctx.fillStyle = 'rgba(12,22,36,.42)';
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(this.crop.x, this.crop.y, this.crop.width, this.crop.height);
      ctx.fill('evenodd');
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(this.crop.x, this.crop.y, this.crop.width, this.crop.height);
    }
  }
  private point(event: PointerEvent): { x: number; y: number } {
    const canvas = this.canvas()!,
      bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * canvas.width) / bounds.width,
      y: ((event.clientY - bounds.top) * canvas.height) / bounds.height,
    };
  }
  private readonly onDown = (event: PointerEvent): void => {
    if (!this.loaded || !this.canvas()) return;
    const point = this.point(event);
    const c = this.crop;
    const inside =
      this.mode === 'crop' &&
      c &&
      point.x >= c.x &&
      point.x <= c.x + c.width &&
      point.y >= c.y &&
      point.y <= c.y + c.height;
    this.gesture = {
      kind: inside ? 'crop-rect' : this.mode,
      start: point,
      offset: inside && c ? { x: c.x, y: c.y } : { ...this.offset },
    };
    if (this.mode === 'crop' && !inside)
      this.crop = { x: point.x, y: point.y, width: 0, height: 0 };
    this.edited = true;
    const canvas = this.canvas();
    if (canvas) {
      canvas.dataset.pictureDragging = String(this.mode === 'move');
      canvas.setPointerCapture(event.pointerId);
    }
  };
  private readonly onMove = (event: PointerEvent): void => {
    const gesture = this.gesture,
      canvas = this.canvas();
    if (!gesture || !canvas) return;
    const now = this.point(event);
    if (gesture.kind === 'move') {
      this.offset = {
        x: gesture.offset.x + now.x - gesture.start.x,
        y: gesture.offset.y + now.y - gesture.start.y,
      };
      this.clampOrigin();
    } else if (gesture.kind === 'crop-rect' && this.crop) {
      this.crop = {
        ...this.crop,
        x: Math.max(
          0,
          Math.min(canvas.width - this.crop.width, gesture.offset.x + now.x - gesture.start.x),
        ),
        y: Math.max(
          0,
          Math.min(canvas.height - this.crop.height, gesture.offset.y + now.y - gesture.start.y),
        ),
      };
    } else {
      let width = now.x - gesture.start.x,
        height = now.y - gesture.start.y;
      if (this.cropMode === 'proportional') {
        const abs = Math.min(Math.abs(width), Math.abs(height) * this.policy.cropAspectRatio);
        width = Math.sign(width || 1) * abs;
        height = (Math.sign(height || 1) * abs) / this.policy.cropAspectRatio;
      }
      const x = Math.max(0, Math.min(canvas.width, gesture.start.x + width));
      const y = Math.max(0, Math.min(canvas.height, gesture.start.y + height));
      this.crop = {
        x: Math.min(x, gesture.start.x),
        y: Math.min(y, gesture.start.y),
        width: Math.abs(x - gesture.start.x),
        height: Math.abs(y - gesture.start.y),
      };
    }
    this.paint();
  };
  private readonly onUp = (event: PointerEvent): void => {
    this.onMove(event);
    const canvas = this.canvas();
    this.gesture = null;
    if (canvas) canvas.dataset.pictureDragging = 'false';
    if (this.crop && (this.crop.width < 3 || this.crop.height < 3)) this.crop = null;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    this.paint();
  };
  private readonly onInput = (event: Event): void => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) ||
      target.dataset.pictureZoom === undefined ||
      !this.image
    )
      return;
    const factor = Math.max(1, Math.min(3, Number(target.value)));
    const canvas = this.canvas()!,
      mid = { x: canvas.width / 2, y: canvas.height / 2 };
    const next = this.minScale * factor,
      ratio = next / this.imageScale;
    this.offset = {
      x: mid.x + (this.offset.x - mid.x) * ratio,
      y: mid.y + (this.offset.y - mid.y) * ratio,
    };
    this.imageScale = next;
    this.clampOrigin();
    this.edited = true;
    this.paint();
  };
  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || this.busy) return;
    if (target.closest('[data-picture-cancel]')) {
      this.cancel();
      return;
    }
    if (target.closest('[data-picture-apply]')) {
      void this.apply();
      return;
    }
    const tool = target.closest<HTMLButtonElement>('[data-picture-tool]');
    if (tool && this.loaded) {
      this.mode = tool.dataset.pictureTool === 'crop' ? 'crop' : 'move';
      this.refresh();
      this.paint();
    }
    const crop = target.closest<HTMLButtonElement>('[data-picture-cropmode]');
    if (crop && this.loaded && !crop.hidden) {
      this.cropMode = crop.dataset.pictureCropmode === 'free' ? 'free' : 'proportional';
      this.crop = null;
      this.edited = true;
      this.paint();
      this.refresh();
    }
    const batch = target.closest<HTMLButtonElement>('[data-picture-batch]');
    if (batch) {
      const next = Number(batch.dataset.pictureBatch);
      if (Number.isInteger(next) && next !== this.index && next >= 0 && next < this.files.length)
        void this.switchFile(next);
    }
  };
  private readonly onBackdrop = (event: MouseEvent): void => {
    if (event.target === event.currentTarget && this.lease?.isTopmost()) this.cancel();
  };
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.lease?.isTopmost()) return;
    if (this.foreground() && this.dialog && !this.dialog.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  };
  private cancel(): void {
    if (!this.busy) this.onClose();
  }
  private async readOriginal(file: File): Promise<PreparedPicture> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Unable to read picture.'));
      reader.readAsDataURL(file);
    });
    const split = dataUrl.indexOf(',');
    if (split < 0) throw new Error('Invalid image data.');
    return { contentType: file.type, dataBase64: dataUrl.slice(split + 1), size: file.size };
  }
  private async prepareCurrent(): Promise<void> {
    if (!this.loaded || !this.image) throw new Error('Picture not ready.');
    if (!this.prepared[this.index] || this.edited)
      this.prepared[this.index] =
        this.collection && !this.edited
          ? await this.readOriginal(this.files[this.index]!)
          : await this.prepare();
  }
  private async switchFile(index: number): Promise<void> {
    this.setBusy(true);
    try {
      await this.prepareCurrent();
      this.index = index;
      this.surface?.set('state.currentIndex', index);
      await this.loadCurrent();
    } catch (error) {
      this.markError(error instanceof Error ? error.message : String(error));
    } finally {
      this.setBusy(false);
    }
  }
  private setBusy(value: boolean): void {
    this.busy = value;
    this.surface?.set('state.busy', value);
    this.refresh();
  }
  private async apply(): Promise<void> {
    if (this.busy || !this.loaded) return;
    this.setBusy(true);
    this.markError('');
    try {
      await this.prepareCurrent();
      if (this.index + 1 < this.files.length) {
        this.index++;
        this.surface?.set('state.currentIndex', this.index);
        await this.loadCurrent();
      } else {
        const pictures: PreparedPicture[] = [];
        for (let i = 0; i < this.files.length; i++)
          pictures.push(this.prepared[i] ?? (await this.readOriginal(this.files[i]!)));
        await this.onAccept(pictures);
        this.onClose();
      }
    } catch (error) {
      this.markError(error instanceof Error ? error.message : String(error));
    } finally {
      this.setBusy(false);
    }
  }
  private async prepare(): Promise<PreparedPicture> {
    const image = this.image,
      canvas = this.canvas();
    if (!image || !canvas) throw new Error('Picture not ready.');
    const bounds = this.crop ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const x = Math.max(0, (bounds.x - this.offset.x) / this.imageScale);
    const y = Math.max(0, (bounds.y - this.offset.y) / this.imageScale);
    const width = Math.min(image.naturalWidth - x, bounds.width / this.imageScale);
    const height = Math.min(image.naturalHeight - y, bounds.height / this.imageScale);
    if (width <= 0 || height <= 0) throw new Error('Crop outside source.');
    const aspect =
      this.crop && this.cropMode === 'free'
        ? bounds.width / bounds.height
        : this.policy.cropAspectRatio;
    const output = document.createElement('canvas');
    if (aspect >= 1) {
      output.width = this.policy.outputSize;
      output.height = Math.max(1, Math.round(output.width / aspect));
    } else {
      output.height = this.policy.outputSize;
      output.width = Math.max(1, Math.round(output.height * aspect));
    }
    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    if (this.policy.outputContentType === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, output.width, output.height);
    }
    ctx.drawImage(image, x, y, width, height, 0, 0, output.width, output.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      output.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Image encoding failed.'))),
        this.policy.outputContentType,
        this.policy.outputQuality,
      ),
    );
    if (blob.type !== this.policy.outputContentType)
      throw new Error('Requested image format unavailable.');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Cannot read prepared image.'));
      reader.readAsDataURL(blob);
    });
    return {
      contentType: blob.type,
      dataBase64: data.slice(data.indexOf(',') + 1),
      size: blob.size,
    };
  }
  dispose(): void {
    ++this.generation;
    if (this.frame) cancelAnimationFrame(this.frame);
    document.removeEventListener('keydown', this.onKeydown, true);
    this.backdrop?.removeEventListener('click', this.onBackdrop);
    this.dialog?.removeEventListener('click', this.onClick);
    this.dialog?.removeEventListener('input', this.onInput);
    const canvas = this.canvas();
    canvas?.removeEventListener('pointerdown', this.onDown);
    canvas?.removeEventListener('pointermove', this.onMove);
    canvas?.removeEventListener('pointerup', this.onUp);
    canvas?.removeEventListener('pointercancel', this.onUp);
    this.title?.dispose();
    this.title = null;
    this.lease?.release();
    this.lease = null;
    this.backdrop?.remove();
    this.backdrop = null;
    this.dialog = null;
    this.surface?.dispose();
    this.surface = null;
    this.previews.forEach((url) => URL.revokeObjectURL(url));
    this.previews.length = 0;
  }
}
