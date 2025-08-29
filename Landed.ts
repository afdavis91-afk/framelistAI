import { Qty, normalizeToUnitPrice } from "./Uom";
import { PriceQuote } from "./PriceQuote";

export function estimateDeliveryCost(_vendor: string, _projectZip: string, _qty: Qty): number {
  // placeholder heuristic; wire real provider later
  return 0;
}

export function estimateTax(_projectZip: string, rackSubtotal: number): number {
  // placeholder (0); add jurisdiction logic later
  return 0;
}

export function landedUnitPrice(q: PriceQuote, lineQty: Qty, projectZip?: string): number {
  const rackSubtotal = q.unitPrice * lineQty.value;
  const delivery = projectZip ? estimateDeliveryCost(q.vendor, projectZip, lineQty) : 0;
  const minTopUp = Math.max(0, (q.minQty ?? 0) - lineQty.value) * q.unitPrice;
  const tax = estimateTax(projectZip ?? "", rackSubtotal);
  return normalizeToUnitPrice(rackSubtotal + delivery + minTopUp + tax, lineQty);
}
