import { UI_PREFERENCES_STORAGE_KEY } from '../preferences/ui-preferences.js';
import { UI_CLI_HISTORY_STORAGE_KEY } from './ui-cli-history.js';
import { UiStatePersistence, type UiStateStorage } from './ui-state-persistence.js';
import { UiStateRuntime } from './ui-state-runtime.js';

const UI_TAB_COORDINATION_CHANNEL = 'manatos.ui.tab-coordination.v1';

export function createBrowserUiStateRuntime(): UiStateRuntime {
  const localStorage = browserStorage('localStorage');
  const sessionStorage = browserStorage('sessionStorage');
  const persistence = new UiStatePersistence(localStorage, sessionStorage, createBrowserTabId);
  const runtime = new UiStateRuntime(persistence);

  installBrowserPreferenceSync(runtime, localStorage);
  installBrowserTabCollisionDetection(runtime);

  return runtime;
}

function installBrowserPreferenceSync(runtime: UiStateRuntime, localStorage: UiStateStorage): void {
  const listener = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return;
    if (event.key === UI_PREFERENCES_STORAGE_KEY) runtime.reloadSharedPreferences();
    else if (event.key === UI_CLI_HISTORY_STORAGE_KEY) runtime.cliHistory.reload();
  };

  window.addEventListener('storage', listener);
  runtime.addDisposer(() => window.removeEventListener('storage', listener));
}

function installBrowserTabCollisionDetection(runtime: UiStateRuntime): void {
  if (typeof BroadcastChannel === 'undefined') return;

  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(UI_TAB_COORDINATION_CHANNEL);
  } catch {
    return;
  }
  const probeId = createBrowserTabId();
  let collisionResolved = false;

  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = asRecord(event.data);
    if (!message) return;

    if (
      message['type'] === 'probe' &&
      message['tabId'] === runtime.tabId &&
      message['probeId'] !== probeId
    ) {
      channel.postMessage({
        type: 'collision',
        tabId: runtime.tabId,
        probeId: message['probeId'],
      });
      return;
    }

    if (
      message['type'] === 'collision' &&
      message['probeId'] === probeId &&
      message['tabId'] === runtime.tabId &&
      !collisionResolved
    ) {
      collisionResolved = true;
      runtime.resolveTabIdentityCollision();
    }
  });

  channel.postMessage({ type: 'probe', tabId: runtime.tabId, probeId });
  runtime.addDisposer(() => channel.close());
}

function createBrowserTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the timestamp/random fallback.
  }

  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function browserStorage(name: 'localStorage' | 'sessionStorage'): UiStateStorage {
  try {
    return window[name];
  } catch {
    return unavailableStorage();
  }
}

function unavailableStorage(): UiStateStorage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
