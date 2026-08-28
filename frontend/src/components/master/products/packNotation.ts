export type PackConversion = { uom_code: string; multiplier: string };

export type ParsedPackNotation = {
  packsPerOuter: number;
  baseUnitsPerPack: number;
  unitSuffix?: string;
};

const POSITIVE_DECIMAL = '(\\d+(?:\\.\\d{1,6})?)';

/**
 * Parse the familiar Indian pharma packing shorthand.
 *
 * `1*10` means one marketed pack containing ten base units.
 * `10*10` means ten marketed packs of ten base units in an outer box.
 * A suffix such as `1*100 ml` is accepted as a visual cross-check against
 * the selected base unit, but the selected canonical unit remains authority.
 */
export const parsePackNotation = (value: string): ParsedPackNotation | null => {
  const normalized = value.trim().replace(/[xX×]/g, '*');
  if (!normalized) return null;
  const match = normalized.match(new RegExp(`^${POSITIVE_DECIMAL}(?:\\s*\\*\\s*${POSITIVE_DECIMAL})?\\s*([A-Za-z]+)?$`));
  if (!match) return null;

  const hasOuterPack = match[2] !== undefined;
  const first = Number(match[1]);
  const second = hasOuterPack ? Number(match[2]) : first;
  if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0) return null;

  return {
    packsPerOuter: hasOuterPack ? first : 1,
    baseUnitsPerPack: second,
    unitSuffix: match[3]?.toLocaleUpperCase(),
  };
};

export const packConversionsFromNotation = (
  parsed: ParsedPackNotation,
  saleUomCode: string,
  boxUomCode?: string,
): PackConversion[] => {
  if (!saleUomCode) return [];
  const total = parsed.packsPerOuter * parsed.baseUnitsPerPack;
  if (saleUomCode === boxUomCode) {
    return [{ uom_code: saleUomCode, multiplier: String(total) }];
  }

  const rows: PackConversion[] = [
    { uom_code: saleUomCode, multiplier: String(parsed.baseUnitsPerPack) },
  ];
  if (parsed.packsPerOuter > 1 && boxUomCode) {
    rows.push({ uom_code: boxUomCode, multiplier: String(total) });
  }
  return rows;
};

export const notationFromPackConversions = (
  conversions: PackConversion[],
  saleUomCode: string,
  boxUomCode?: string,
): string => {
  const sale = conversions.find(row => row.uom_code === saleUomCode);
  if (!sale) return '';
  const baseUnitsPerPack = Number(sale.multiplier);
  if (!Number.isFinite(baseUnitsPerPack) || baseUnitsPerPack <= 0) return '';
  const box = boxUomCode && saleUomCode !== boxUomCode
    ? conversions.find(row => row.uom_code === boxUomCode)
    : undefined;
  const boxMultiplier = Number(box?.multiplier);
  const packsPerOuter = box && Number.isFinite(boxMultiplier) && boxMultiplier > 0
    ? boxMultiplier / baseUnitsPerPack
    : 1;
  if (!Number.isFinite(packsPerOuter) || packsPerOuter <= 0) return '';
  return `${packsPerOuter}*${baseUnitsPerPack}`;
};

export type ParsedStrength = {
  strengthValue: string;
  strengthUnitCode: string;
  basisQuantity: string;
  basisUnitCode: string;
};

/** Auto-fill only a single, fully typed strength such as `500 mg` or `250 mg/5 ml`. */
export const parseSingleStrength = (
  value: string,
  baseUomCode: string,
  units: Array<{ code: string; symbol: string; name: string }>,
): ParsedStrength | null => {
  const match = value.trim().match(/^(\d+(?:\.\d{1,6})?)\s*([A-Za-z]+)(?:\s*(?:\/|per)\s*(\d+(?:\.\d{1,6})?)\s*([A-Za-z]+))?$/i);
  if (!match) return null;
  const findUnit = (token: string) => units.find(unit => (
    unit.code.toLocaleLowerCase() === token.toLocaleLowerCase()
    || unit.symbol.toLocaleLowerCase() === token.toLocaleLowerCase()
    || unit.name.toLocaleLowerCase() === token.toLocaleLowerCase()
  ));
  const strengthUnit = findUnit(match[2]);
  const basisUnit = match[4] ? findUnit(match[4]) : units.find(unit => unit.code === baseUomCode);
  if (!strengthUnit || !basisUnit) return null;
  return {
    strengthValue: match[1],
    strengthUnitCode: strengthUnit.code,
    basisQuantity: match[3] ?? '1',
    basisUnitCode: basisUnit.code,
  };
};
