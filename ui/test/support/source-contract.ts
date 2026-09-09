/**
 * Canonicalize source text for presentation/architecture contracts that care
 * about token structure rather than formatter-selected line breaks/indentation.
 *
 * Keep literal value/identifier assertions separate when whitespace itself is
 * part of the UI contract.
 */
export const sourceWithoutWhitespace = (value: string): string => value.replace(/\s+/g, '');
