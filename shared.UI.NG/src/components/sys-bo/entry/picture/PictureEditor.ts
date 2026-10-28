import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { PictureEditorPolicy, PreparedPicture } from '@manatos/shared-ui';

type Tool = 'move' | 'crop';
type CropMode = 'proportional' | 'free';
type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

/** Reusable browser canvas editor. All image pixels/bytes remain private, never semantic CTX. */
@Component({
  selector: 'manatos-picture-editor',
  standalone: true,
  templateUrl: './PictureEditor.html',
})
export class PictureEditor implements AfterViewInit, OnDestroy {
  readonly file = input.required<File>();
  readonly policy = input.required<PictureEditorPolicy>();
  readonly language = input<'EN' | 'EL'>('EN');
  readonly tool = signal<Tool>('move');
  readonly cropMode = signal<CropMode>('proportional');
  readonly zoom = signal(1);
  readonly error = signal('');
  readonly ready = signal(false);
  readonly edited = signal(false);
  readonly canvasHeight = computed(() =>
    Math.max(100, Math.round(560 / this.policy().cropAspectRatio)),
  );
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private image: HTMLImageElement | null = null;
  private imageUrl: string | null = null;
  private scale = 1;
  private minScale = 1;
  private origin: Point = { x: 0, y: 0 };
  private crop: Rect | null = null;
  private gesture: {
    kind: 'move' | 'crop' | 'crop-rect';
    start: Point;
    original: Point | null;
  } | null = null;
  private generation = 0;
  private alive = true;
  private initialized = false;
  private loadFrame: number | null = null;
  private loadTask: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const file = this.file();
      if (this.initialized) this.scheduleLoad(file);
    });
  }
  ngAfterViewInit(): void {
    this.initialized = true;
    this.scheduleLoad(this.file());
  }
  ngOnDestroy(): void {
    this.alive = false;
    this.generation++;
    if (this.loadFrame !== null) cancelAnimationFrame(this.loadFrame);
    if (this.loadTask !== null) clearTimeout(this.loadTask);
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.image = null;
  }
  protected toolLabel(tool: Tool): string {
    return this.language() === 'EL'
      ? tool === 'move'
        ? 'Μετακίνηση'
        : 'Περιοχή περικοπής'
      : tool === 'move'
        ? 'Move'
        : 'Crop area';
  }
  protected chooseTool(next: Tool): void {
    this.tool.set(next);
    this.paint();
  }
  protected chooseCropMode(next: CropMode): void {
    if (!this.policy().cropModes.includes(next)) return;
    this.cropMode.set(next);
    this.crop = null;
    this.edited.set(true);
    this.paint();
  }
  /** Show the popup and its loading state before starting image decode. */
  private scheduleLoad(file: File): void {
    const generation = ++this.generation;
    this.ready.set(false);
    this.error.set('');
    this.image = null;
    this.paint(); // Never show the preceding image while a batch item is loading.
    if (this.loadFrame !== null) cancelAnimationFrame(this.loadFrame);
    if (this.loadTask !== null) clearTimeout(this.loadTask);
    this.loadFrame = requestAnimationFrame(() => {
      this.loadFrame = null;
      this.loadTask = setTimeout(() => {
        this.loadTask = null;
        if (this.alive && generation === this.generation) void this.load(file, generation);
      }, 0);
    });
  }
  private async load(file: File, generation: number): Promise<void> {
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    const url = URL.createObjectURL(file);
    this.imageUrl = url;
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!this.alive || generation !== this.generation) return;
      const canvas = this.canvas()?.nativeElement;
      if (!canvas || !image.naturalWidth || !image.naturalHeight)
        throw new Error('Invalid picture.');
      this.image = image;
      this.minScale = Math.max(
        canvas.width / image.naturalWidth,
        canvas.height / image.naturalHeight,
      );
      this.scale = this.minScale;
      this.zoom.set(1);
      this.origin = {
        x: (canvas.width - image.naturalWidth * this.scale) / 2,
        y: (canvas.height - image.naturalHeight * this.scale) / 2,
      };
      this.crop = null;
      this.cropMode.set(this.policy().cropModes[0] ?? 'proportional');
      this.tool.set('move');
      this.edited.set(false);
      this.ready.set(true);
      this.paint();
    } catch {
      if (generation === this.generation)
        this.error.set(
          this.language() === 'EL'
            ? 'Η φωτογραφία δεν μπορεί να ανοιχτεί.'
            : 'Unable to open picture.',
        );
    }
  }
  /** Keep the decoded image covering the entire preview during move and zoom. */
  private constrainOrigin(): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas || !this.image) return;
    const width = this.image.naturalWidth * this.scale;
    const height = this.image.naturalHeight * this.scale;
    this.origin = {
      x: Math.max(canvas.width - width, Math.min(0, this.origin.x)),
      y: Math.max(canvas.height - height, Math.min(0, this.origin.y)),
    };
  }
  protected changeZoom(event: Event): void {
    const input = event.target as HTMLInputElement;
    const factor = Math.max(1, Math.min(3, Number(input.value)));
    if (!this.image || !this.canvas()) return;
    const canvas = this.canvas()!.nativeElement;
    const mid = { x: canvas.width / 2, y: canvas.height / 2 };
    const next = this.minScale * factor;
    const ratio = next / this.scale;
    this.origin = {
      x: mid.x + (this.origin.x - mid.x) * ratio,
      y: mid.y + (this.origin.y - mid.y) * ratio,
    };
    this.scale = next;
    this.constrainOrigin();
    this.zoom.set(factor);
    this.edited.set(true);
    this.paint();
  }
  private point(event: PointerEvent): Point {
    const el = this.canvas()!.nativeElement;
    const bounds = el.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * el.width) / bounds.width,
      y: ((event.clientY - bounds.top) * el.height) / bounds.height,
    };
  }
  protected down(event: PointerEvent): void {
    if (!this.image || !this.ready() || !this.canvas()) return;
    const start = this.point(event);
    const crop = this.crop;
    const insideCrop =
      this.tool() === 'crop' &&
      crop &&
      start.x >= crop.x &&
      start.x <= crop.x + crop.width &&
      start.y >= crop.y &&
      start.y <= crop.y + crop.height;
    const kind = insideCrop ? 'crop-rect' : this.tool();
    this.edited.set(true);
    this.gesture = {
      kind,
      start,
      original:
        kind === 'move'
          ? { ...this.origin }
          : kind === 'crop-rect'
            ? { x: crop!.x, y: crop!.y }
            : null,
    };
    this.canvas()!.nativeElement.setPointerCapture(event.pointerId);
    if (kind === 'crop') this.crop = { x: start.x, y: start.y, width: 0, height: 0 };
    this.paint();
  }
  protected move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || !this.canvas()) return;
    const now = this.point(event);
    if (gesture.kind === 'move' && gesture.original) {
      this.origin = {
        x: gesture.original.x + now.x - gesture.start.x,
        y: gesture.original.y + now.y - gesture.start.y,
      };
      this.constrainOrigin();
    } else if (gesture.kind === 'crop-rect' && gesture.original && this.crop) {
      const canvas = this.canvas()!.nativeElement;
      this.crop = {
        ...this.crop,
        x: Math.max(
          0,
          Math.min(canvas.width - this.crop.width, gesture.original.x + now.x - gesture.start.x),
        ),
        y: Math.max(
          0,
          Math.min(canvas.height - this.crop.height, gesture.original.y + now.y - gesture.start.y),
        ),
      };
    } else {
      const canvas = this.canvas()!.nativeElement;
      const ratio = this.policy().cropAspectRatio;
      let width = now.x - gesture.start.x;
      let height = now.y - gesture.start.y;
      if (this.cropMode() === 'proportional') {
        const absWidth = Math.min(Math.abs(width), Math.abs(height) * ratio);
        width = Math.sign(width || 1) * absWidth;
        height = (Math.sign(height || 1) * absWidth) / ratio;
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
  }
  protected up(event: PointerEvent): void {
    if (this.gesture) this.move(event);
    this.gesture = null;
    if (this.crop && (this.crop.width < 3 || this.crop.height < 3)) this.crop = null;
    if (this.canvas()?.nativeElement.hasPointerCapture(event.pointerId))
      this.canvas()!.nativeElement.releasePointerCapture(event.pointerId);
    this.paint();
  }
  private paint(): void {
    const canvas = this.canvas()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.image)
      ctx.drawImage(
        this.image,
        this.origin.x,
        this.origin.y,
        this.image.naturalWidth * this.scale,
        this.image.naturalHeight * this.scale,
      );
    if (this.crop && this.crop.width > 0 && this.crop.height > 0) {
      ctx.fillStyle = 'rgba(12, 22, 36, .42)';
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(this.crop.x, this.crop.y, this.crop.width, this.crop.height);
      ctx.fill('evenodd');
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(this.crop.x, this.crop.y, this.crop.width, this.crop.height);
    }
  }
  /** Resample from the original decoded image, never from the low-res preview. */
  async prepare(): Promise<PreparedPicture> {
    const image = this.image;
    const stage = this.canvas()?.nativeElement;
    if (!image || !stage || !this.ready()) throw new Error('Picture editor is not ready.');
    const bounds = this.crop ?? { x: 0, y: 0, width: stage.width, height: stage.height };
    const left = Math.max(0, (bounds.x - this.origin.x) / this.scale);
    const top = Math.max(0, (bounds.y - this.origin.y) / this.scale);
    const width = Math.min(image.naturalWidth - left, bounds.width / this.scale);
    const height = Math.min(image.naturalHeight - top, bounds.height / this.scale);
    if (width <= 0 || height <= 0) throw new Error('Crop region is outside the source picture.');
    const size = this.policy().outputSize;
    const aspect =
      this.cropMode() === 'free' && this.crop
        ? bounds.width / bounds.height
        : this.policy().cropAspectRatio;
    const output = document.createElement('canvas');
    if (aspect >= 1) {
      output.width = size;
      output.height = Math.max(1, Math.round(size / aspect));
    } else {
      output.height = size;
      output.width = Math.max(1, Math.round(size * aspect));
    }
    const context = output.getContext('2d');
    if (!context) throw new Error('Unable to prepare picture.');
    if (this.policy().outputContentType === 'image/jpeg') {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, output.width, output.height);
    }
    context.drawImage(image, left, top, width, height, 0, 0, output.width, output.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      output.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Image encoding failed.'))),
        this.policy().outputContentType,
        this.policy().outputQuality,
      ),
    );
    if (blob.type !== this.policy().outputContentType)
      throw new Error('Requested image format unavailable.');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Unable to read cropped image.'));
      reader.readAsDataURL(blob);
    });
    const dataBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return { contentType: blob.type, dataBase64, size: blob.size };
  }
}
