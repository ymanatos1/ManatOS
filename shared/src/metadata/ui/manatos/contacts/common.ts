import { systemCountryCatalog } from '../../../../domain/system-country-catalog.js';

/** Contact-subsystem projections of canonical country data for reusable editors. */
export const telephoneCountryOptions = (() => {
  const byCallingCode = new Map<string, { label: string; value: string; flagSrc?: string }>();
  for (const country of systemCountryCatalog) {
    const existing = byCallingCode.get(country.callingCode);
    if (existing) {
      existing.label = `${existing.label} / ${country.name}`;
      continue;
    }
    byCallingCode.set(country.callingCode, {
      label: country.name,
      value: country.callingCode,
      ...(country.languageFlagSrc ? { flagSrc: country.languageFlagSrc } : {}),
    });
  }
  return [...byCallingCode.values()];
})();

export const addressCountryOptions = systemCountryCatalog.map((country) => ({
  label: country.name,
  value: country.name,
  ...(country.languageFlagSrc ? { flagSrc: country.languageFlagSrc } : {}),
}));
