/**
 * Canonical system country reference data.
 *
 * Countries and international calling codes are standards/reference data, not
 * tenant-owned business data. They therefore live in shared system code rather
 * than an administrator-maintained database entity. UI metadata can project the
 * same catalogue differently (country name for postal addresses, calling code
 * for telephone numbers) without duplicating the source of truth.
 */
export interface SystemCountry {
  code: string;
  name: string;
  callingCode: string;
  /** Optional language flag currently shipped by ManatOS. */
  languageFlagSrc?: string;
}

export const systemCountryCatalog: readonly SystemCountry[] = [
  { code: 'GR', name: 'Greece', callingCode: '+30', languageFlagSrc: '/assets/flags/el.svg' },
  { code: 'CY', name: 'Cyprus', callingCode: '+357' },
  { code: 'AL', name: 'Albania', callingCode: '+355' },
  { code: 'AT', name: 'Austria', callingCode: '+43' },
  { code: 'BE', name: 'Belgium', callingCode: '+32' },
  { code: 'BG', name: 'Bulgaria', callingCode: '+359' },
  { code: 'HR', name: 'Croatia', callingCode: '+385' },
  { code: 'CZ', name: 'Czechia', callingCode: '+420' },
  { code: 'DK', name: 'Denmark', callingCode: '+45' },
  { code: 'FI', name: 'Finland', callingCode: '+358' },
  { code: 'FR', name: 'France', callingCode: '+33' },
  { code: 'DE', name: 'Germany', callingCode: '+49' },
  { code: 'HU', name: 'Hungary', callingCode: '+36' },
  { code: 'IE', name: 'Ireland', callingCode: '+353' },
  { code: 'IT', name: 'Italy', callingCode: '+39' },
  { code: 'LU', name: 'Luxembourg', callingCode: '+352' },
  { code: 'MT', name: 'Malta', callingCode: '+356' },
  { code: 'NL', name: 'Netherlands', callingCode: '+31' },
  { code: 'NO', name: 'Norway', callingCode: '+47' },
  { code: 'PL', name: 'Poland', callingCode: '+48' },
  { code: 'PT', name: 'Portugal', callingCode: '+351' },
  { code: 'RO', name: 'Romania', callingCode: '+40' },
  { code: 'RS', name: 'Serbia', callingCode: '+381' },
  { code: 'SK', name: 'Slovakia', callingCode: '+421' },
  { code: 'SI', name: 'Slovenia', callingCode: '+386' },
  { code: 'ES', name: 'Spain', callingCode: '+34' },
  { code: 'SE', name: 'Sweden', callingCode: '+46' },
  { code: 'CH', name: 'Switzerland', callingCode: '+41' },
  { code: 'GB', name: 'United Kingdom', callingCode: '+44', languageFlagSrc: '/assets/flags/en.svg' },
  { code: 'US', name: 'United States', callingCode: '+1' },
  { code: 'CA', name: 'Canada', callingCode: '+1' },
  { code: 'AU', name: 'Australia', callingCode: '+61' },
  { code: 'BR', name: 'Brazil', callingCode: '+55' },
  { code: 'CN', name: 'China', callingCode: '+86' },
  { code: 'EG', name: 'Egypt', callingCode: '+20' },
  { code: 'IN', name: 'India', callingCode: '+91' },
  { code: 'IL', name: 'Israel', callingCode: '+972' },
  { code: 'JP', name: 'Japan', callingCode: '+81' },
  { code: 'ZA', name: 'South Africa', callingCode: '+27' },
  { code: 'TR', name: 'Turkey', callingCode: '+90' },
  { code: 'AE', name: 'United Arab Emirates', callingCode: '+971' },
] as const;
