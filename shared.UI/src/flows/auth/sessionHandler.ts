import type { RuntimeUserIdentity } from '@manatos/shared';

/** Flow-to-application notification. The host projects canonical authenticated state. */
export interface SessionHandler {
  signedIn(user: RuntimeUserIdentity): Promise<void>;
}
