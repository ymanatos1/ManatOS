import {
  Component,
  inject,
  ElementRef,
  HostListener,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { EntryContext } from '../../entry/EntryContext';
import { pictureEditorPolicy } from '@manatos/shared-ui';
import { resolveMetadataText } from '@manatos/shared';

/** Scalar picture thumbnail owns Choose and Delete; EntryContext owns the mutation. */
@Component({
  selector: 'manatos-picture-field',
  standalone: true,
  imports: [FieldControlShell],
  templateUrl: './PictureField.html',
})
export class PictureField extends EntryFieldRendererBase implements OnDestroy {
  private readonly entry = inject(EntryContext);
  protected readonly selectionError = signal('');
  protected readonly pickerOpening = signal(false);
  private focusRelease: ReturnType<typeof setTimeout> | null = null;
  private launchFrame: number | null = null;
  private launchTask: ReturnType<typeof setTimeout> | null = null;
  private nativePickerOpen = false;

  @HostListener('window:focus')
  protected pickerFocusReturned(): void {
    if (!this.pickerOpening() || !this.nativePickerOpen) return;
    if (this.focusRelease) clearTimeout(this.focusRelease);
    // The change event may arrive just after native focus returns.
    this.focusRelease = setTimeout(() => {
      this.nativePickerOpen = false;
      this.pickerOpening.set(false);
    }, 250);
  }

  ngOnDestroy(): void {
    if (this.focusRelease) clearTimeout(this.focusRelease);
    if (this.launchFrame !== null) cancelAnimationFrame(this.launchFrame);
    if (this.launchTask !== null) clearTimeout(this.launchTask);
  }
  private readonly picker = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  protected source(): string | null {
    return this.entry.pictureSource(this.field().value) ?? this.field().imageUrl ?? null;
  }
  protected historyVisible(): boolean {
    // Show both controls after the first accepted edit, including deletion or replacement.
    // Keep them visible even if Undo has restored the original thumbnail.
    return (this.entry.fieldHistory(this.field().field)?.changes.length ?? 0) > 0;
  }
  protected undo(): void {
    void this.entry.undoField(this.field().field);
  }
  protected redo(): void {
    void this.entry.redoField(this.field().field);
  }
  protected undoReady(): boolean {
    return this.entry.canUndo(this.field().field);
  }
  protected redoReady(): boolean {
    return this.entry.canRedo(this.field().field);
  }
  protected helpText(): string {
    const policy = pictureEditorPolicy(this.field().entityKey, this.field().field);
    return resolveMetadataText('@CM.PictureHelp', this.field().language)
      .replace('{maxMb}', String(Math.round(policy.maxSourceBytes / 1_000_000)))
      .replace('{size}', String(policy.outputSize));
  }
  protected choose(): void {
    if (this.field().readOnly || this.pickerOpening()) return;
    const input = this.picker()?.nativeElement;
    if (!input) return;
    this.selectionError.set('');
    this.pickerOpening.set(true);
    this.nativePickerOpen = false;
    if (this.focusRelease) clearTimeout(this.focusRelease);
    // Yield a paint so the loading indicator is visible before the native dialog.
    // Keep the launch close to the user's click to preserve browser user activation.
    this.launchFrame = requestAnimationFrame(() => {
      this.launchFrame = null;
      this.launchTask = setTimeout(() => {
        this.launchTask = null;
        if (!this.pickerOpening() || !input.isConnected) return;
        this.nativePickerOpen = true;
        try {
          input.value = '';
          input.click();
        } catch (error) {
          this.cancelPicker();
          this.selectionError.set(error instanceof Error ? error.message : String(error));
        }
      }, 0);
    });
    // The picker may not fire a cancel event in all browsers.
    this.focusRelease = setTimeout(() => this.cancelPicker(), 15000);
  }
  protected cancelPicker(): void {
    this.pickerOpening.set(false);
    this.nativePickerOpen = false;
    if (this.launchFrame !== null) cancelAnimationFrame(this.launchFrame);
    if (this.launchTask !== null) clearTimeout(this.launchTask);
    this.launchFrame = null;
    this.launchTask = null;
    if (this.focusRelease) clearTimeout(this.focusRelease);
    this.focusRelease = null;
  }
  protected picked(event: Event): void {
    this.cancelPicker();
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    this.selectionError.set('');
    try {
      this.entry.openPictureEditor(this.field().field, files.slice(0, 1), false);
    } catch (error) {
      this.selectionError.set(error instanceof Error ? error.message : String(error));
    }
  }
  protected remove(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.field().readOnly) void this.entry.removePicture(this.field().field);
  }
}
