import { MANATOS_COMPANY, resolvePlatform } from '@manatos/shared/domain/company-platform';
import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';

export interface UiPlatformIdentity {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  description: string;
}

export interface UiPlatformState {
  readonly current: UiPlatformIdentity | null;
  readonly available: readonly UiPlatformIdentity[];
}

function toUiPlatformIdentity(
  platform: ReturnType<typeof resolvePlatform>,
  language: MetadataLanguage,
): UiPlatformIdentity {
  return {
    id: platform.id,
    name: resolveMetadataText(platform.name, language),
    shortName: resolveMetadataText(platform.shortName, language),
    description: resolveMetadataText(platform.description ?? platform.name, language),
    icon: platform.icon || 'bi-boxes',
  };
}

export function resolveUiPlatformIdentity(
  platformId?: string | null,
  language: MetadataLanguage = 'EN',
): UiPlatformIdentity | null {
  if (platformId === null) return null;

  return toUiPlatformIdentity(resolvePlatform(MANATOS_COMPANY, platformId), language);
}

export function getUiPlatforms(language: MetadataLanguage = 'EN'): readonly UiPlatformIdentity[] {
  return MANATOS_COMPANY.platforms
    .filter((platform) => platform.enabled)
    .map((platform) => toUiPlatformIdentity(platform, language));
}

export function createUiPlatformState(
  platformId?: string | null,
  language: MetadataLanguage = 'EN',
): UiPlatformState {
  return {
    current: resolveUiPlatformIdentity(platformId, language),
    available: getUiPlatforms(language),
  };
}
