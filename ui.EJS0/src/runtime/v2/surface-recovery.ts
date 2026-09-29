/* eslint-disable @typescript-eslint/no-explicit-any */

export interface UiSurfaceRecoveryProvider {
  readonly id: string;
  matches(level: any): boolean;
  capture?(level: any): unknown | null;
  recoveryUrl?(level: any): string | null;
  matchesRecoveryTarget?(storedLevel: any, liveLevel: any): boolean;
  resumeMissing?(context: {
    recoveryPackage: any;
    level: any;
    levelIndex: number;
    continueRecoveryAt: (levelIndex: number, resumeUrl: string) => void;
    recoveryFailure: (message: string, level: any, cause?: unknown) => Error;
  }): Promise<boolean> | boolean;
}

export class UiSurfaceRecoveryRegistry {
  readonly #providers: UiSurfaceRecoveryProvider[] = [];

  register(provider: UiSurfaceRecoveryProvider): void {
    if (!provider || typeof provider.matches !== 'function') return;
    const existing = this.#providers.findIndex((candidate) => candidate.id === provider.id);
    if (existing >= 0) this.#providers.splice(existing, 1);
    this.#providers.push(provider);
  }

  providerFor(level: any): UiSurfaceRecoveryProvider | null {
    for (let index = this.#providers.length - 1; index >= 0; index -= 1) {
      const provider = this.#providers[index];
      if (provider?.matches(level)) return provider;
    }
    return null;
  }

  capture(level: any): unknown | null {
    return this.providerFor(level)?.capture?.(level) ?? null;
  }

  matchesRecoveryTarget(storedLevel: any, liveLevel: any): boolean {
    const provider = this.providerFor(storedLevel);
    return provider?.matchesRecoveryTarget?.(storedLevel, liveLevel) === true;
  }

  recoveryUrl(level: any): string | null {
    const value = this.providerFor(level)?.recoveryUrl?.(level);
    return typeof value === 'string' && value ? value : null;
  }

  async resumeMissing(
    context: Parameters<NonNullable<UiSurfaceRecoveryProvider['resumeMissing']>>[0],
  ): Promise<boolean> {
    return (await this.providerFor(context.level)?.resumeMissing?.(context)) === true;
  }
}
