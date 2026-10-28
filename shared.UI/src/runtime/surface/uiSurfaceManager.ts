import type { UiBusyPresentation } from '../ui-busy-runtime.js';
import type { UiPopupLevel } from '../../popups/popup-runtime.js';
import type { UiSurfaceEventListener } from './events.js';
import type { UiSurfaceCloseReason, UiSurfaceOpenOptions } from './invocation.js';

/**
 * Instance-scoped access to a canonical UI #level.
 * It is deliberately not a second store of invocation or result values.
 * Read #control/#data from the event's live level before disposal.
 */
export interface UiSurfaceHandle {
  readonly name: string;
  readonly levelPath: string;
  readonly instanceId: string;
  onEvent(listener: UiSurfaceEventListener<UiPopupLevel>): () => void;
  close(reason?: UiSurfaceCloseReason): void;
  /** The surface controls its own input/busy presentation. */
  setBusy(value: boolean): void;
  /** One transient read; password remains outside inspectable CTX. */
  readSignInCredentials(): { identity: string; password: string } | null;
  readRegisterCredentials(): {
    name: string;
    email: string;
    password: string;
    confirmation: string;
  } | null;
  readResetPasswordCredentials(): { password: string; confirmation: string } | null;
  /** Read authenticated password-change secrets from native inputs only. */
  readChangePasswordCredentials(): {
    currentPassword: string;
    password: string;
    confirmation: string;
  } | null;
  /** True only while this instance's canonical #level still exists. */
  isOpen(): boolean;
  /** Only declared embedded resources can be published. */
  setResource(name: string, value: unknown): void;
  setResourceStatus(
    name: string,
    status: 'idle' | 'loading' | 'ready' | 'error',
    error?: string | null,
  ): void;
}

/** One handler per application/session/window, never a cross-user singleton. */
export interface UiSurfaceManager {
  open(name: string, invocation?: UiSurfaceOpenOptions): UiSurfaceHandle;
  /** The presentation host owns the existing delayed, reference-counted spinner. */
  withBusy<T>(operation: () => Promise<T>, presentation?: UiBusyPresentation): Promise<T>;
}
