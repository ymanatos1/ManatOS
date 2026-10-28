/**
 * Native credential capability owned by the Auth body.
 * Sensitive values remain in native controls; CTX holds no passwords.
 * Generic modal hosts only forward existing UiSurfaceHandle compatibility calls.
 */
export type NativePopupInputs = ReadonlyMap<string, ReadonlyMap<string, HTMLInputElement>>;

/** Typed compatibility port: no assertions or credential-shape guessing in a generic host. */
export interface PopupCredentialReader {
  readSignInCredentials(tabs: NativePopupInputs): { identity: string; password: string } | null;
  readRegisterCredentials(
    tabs: NativePopupInputs,
  ): { name: string; email: string; password: string; confirmation: string } | null;
  readChangePasswordCredentials(
    tabs: NativePopupInputs,
  ): { currentPassword: string; password: string; confirmation: string } | null;
  readResetPasswordCredentials(
    tabs: NativePopupInputs,
  ): { password: string; confirmation: string } | null;
}
const value = (tabs: NativePopupInputs, tab: string, key: string): string =>
  tabs.get(tab)?.get(key)?.value ?? '';

export const authCredentialReader: PopupCredentialReader = {
  readSignInCredentials(tabs) {
    const identity = value(tabs, 'signin', 'identity').trim();
    const password = value(tabs, 'signin', 'password');
    return identity && password ? { identity, password } : null;
  },
  readRegisterCredentials(tabs) {
    const name = value(tabs, 'email', 'username').trim();
    const email = value(tabs, 'email', 'email').trim();
    const password = value(tabs, 'email', 'password');
    const confirmation = value(tabs, 'email', 'confirmPassword');
    return name && email && password && confirmation
      ? { name, email, password, confirmation }
      : null;
  },
  readChangePasswordCredentials(tabs) {
    const currentPassword = value(tabs, 'change', 'currentPassword');
    const password = value(tabs, 'change', 'password');
    const confirmation = value(tabs, 'change', 'confirmPassword');
    return password && confirmation ? { currentPassword, password, confirmation } : null;
  },
  readResetPasswordCredentials(tabs) {
    const password = value(tabs, 'reset', 'password');
    const confirmation = value(tabs, 'reset', 'confirmPassword');
    return password && confirmation ? { password, confirmation } : null;
  },
};
