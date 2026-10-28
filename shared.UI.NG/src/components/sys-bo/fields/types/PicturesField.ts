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

/** Collection thumbnail UI owns order and remove intent, never the binary ledger. */
@Component({
  selector: 'manatos-pictures-field',
  standalone: true,
  imports: [FieldControlShell],
  templateUrl: './PicturesField.html',
})
export class PicturesField extends EntryFieldRendererBase implements OnDestroy {
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
  protected pictures(): readonly Readonly<Record<string, unknown>>[] {
    const value = this.field().value;
    return Array.isArray(value)
      ? value.filter(
          (picture): picture is Readonly<Record<string, unknown>> =>
            picture !== null && typeof picture === 'object' && !Array.isArray(picture),
        )
      : [];
  }
  protected source(picture: Readonly<Record<string, unknown>>): string | null {
    const pending = this.entry.pictureSource(picture);
    if (pending) return pending;
    if (!picture.id || picture.pending || !this.entry.level()?.data.current?.id) return null;
    const recordId = String(this.entry.level()?.data.current?.id);
    return `/_manatos/auth/resources/pictures/${encodeURIComponent(this.field().entityKey)}/${encodeURIComponent(recordId)}/${encodeURIComponent(this.field().field)}/${encodeURIComponent(String(picture.id))}?revision=${encodeURIComponent(String(picture.revision ?? ''))}`;
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
      this.entry.openPictureEditor(this.field().field, files, true);
    } catch (error) {
      this.selectionError.set(error instanceof Error ? error.message : String(error));
    }
  }
  protected remove(index: number): void {
    void this.entry.removePicture(this.field().field, index);
  }
  protected move(from: number, delta: number): void {
    void this.entry.movePicture(this.field().field, from, from + delta);
  }
  protected dragStart(event: DragEvent, index: number): void {
    if (this.field().readOnly || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.effectAllowed = 'move';
  }
  protected drop(event: DragEvent, to: number): void {
    event.preventDefault();
    if (this.field().readOnly) return;
    const from = Number(event.dataTransfer?.getData('text/plain'));
    if (Number.isInteger(from)) void this.entry.movePicture(this.field().field, from, to);
  }
}
