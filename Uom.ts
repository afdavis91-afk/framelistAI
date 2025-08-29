export type UOM = "EA" | "LF" | "SF" | "BF" | "SHEET" | "PALLET";

export interface Qty {
  value: number;
  uom: UOM;
  packSize?: number; // e.g., 250 nails/box
}

export function normalizeToUnitPrice(totalPrice: number, qty: Qty): number {
  const units = qty.value * (qty.packSize ?? 1);
  if (!isFinite(units) || units <= 0) return NaN;
  return totalPrice / units;
}
