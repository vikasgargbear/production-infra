const TRAILING_PACK = /(?:^|\s)(\d+(?:\.\d+)?\s*[*x×]\s*\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?\s*[*x×]\s*\d+(?:\.\d+)?))?\s*$/i;

const normalizePack = (value: string) => value.replace(/[x×]/gi, '*').replace(/\s+/g, '');
const normalizeImportedNameSpacing = (value: string) => (
  value.replace(/\)(?=\d+(?:[-.]\d+)?(?:\s|$))/g, ') ')
);

/**
 * Imported MARG masters sometimes carry the pack suffix inside the visible
 * name. Keep the stored draft identity unchanged, but present the suffix in a
 * separate column until reviewed canonical pack conversions replace it.
 */
export const productPackDisplay = (productName: string, canonicalPacking: string | null) => {
  if (canonicalPacking) return { name: productName, pack: canonicalPacking, importedHint: false };
  const match = productName.trim().match(TRAILING_PACK);
  if (!match || match.index === undefined) return { name: productName, pack: null, importedHint: false };
  const first = normalizePack(match[1]);
  const second = match[2] ? normalizePack(match[2]) : null;
  if (second && second !== first) {
    const secondStart = productName.lastIndexOf(match[2]);
    return { name: productName.slice(0, secondStart).trim(), pack: second, importedHint: true };
  }
  const name = normalizeImportedNameSpacing(productName.slice(0, match.index).trim());
  return name ? { name, pack: first, importedHint: true } : { name: productName, pack: null, importedHint: false };
};
