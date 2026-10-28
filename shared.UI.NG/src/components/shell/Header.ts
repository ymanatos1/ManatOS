import { Component, effect, input, output, signal, computed } from '@angular/core';

import { MANATOS_UI_BRANDING, multilingual } from '@manatos/shared-ui';
import { type MetadataLanguage } from '@manatos/shared';
import { HeaderStatus, type UiHeaderApiStatus } from './HeaderStatus';

@Component({
  selector: 'manatos-header',
  standalone: true,
  imports: [HeaderStatus],
  templateUrl: './Header.html',
  styleUrl: './Header.css',
})
export class Header {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['ManatOsHome'] as const),
  );

  readonly versionLabel = input.required<string>();
  readonly statusLabel = input.required<string>();
  readonly apiStatus = input<UiHeaderApiStatus | null>(null);
  readonly apiFailureCount = input(0);

  // Authentication state is supplied by the application.
  // Header presents this state; it does not own or modify it.
  readonly signedIn = input<boolean>(false);
  readonly language = input<MetadataLanguage>('EN');

  readonly accountName = input('Account');
  readonly accountRole = input('');
  readonly accountOpen = input(false);
  readonly accountPhotoUrl = input<string | null>(null);
  protected readonly photoUnavailable = signal(false);

  constructor() {
    effect(() => {
      this.accountPhotoUrl();
      this.photoUnavailable.set(false);
    });
  }

  // Authentication controls report user intentions to the host.
  // The host is responsible for opening the appropriate UI.
  readonly loginRequested = output<void>();
  readonly registerRequested = output<void>();
  readonly notificationsRequested = output<void>();
  readonly accountRequested = output<void>();
  readonly signOutRequested = output<void>();
  readonly changePasswordRequested = output<void>();

  protected readonly branding = MANATOS_UI_BRANDING;

  protected requestLogin(): void {
    this.loginRequested.emit();
  }

  protected requestRegister(): void {
    this.registerRequested.emit();
  }

  protected requestNotifications(): void {
    this.notificationsRequested.emit();
  }

  protected requestAccount(event: MouseEvent): void {
    event.stopPropagation();
    this.accountRequested.emit();
  }

  protected requestChangePassword(): void {
    this.changePasswordRequested.emit();
  }

  protected requestSignOut(): void {
    this.signOutRequested.emit();
  }

  protected photoFailed(): void {
    this.photoUnavailable.set(true);
  }
}
