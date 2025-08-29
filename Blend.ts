export function blend(a: number | undefined, b: number | undefined, wa = 0.4, wb = 0.6) {
  const av = a ?? NaN, bv = b ?? NaN;
  if (isFinite(av) && isFinite(bv)) return (wa * av + wb * bv) / Math.max(1e-6, wa + wb);
  if (isFinite(av)) return av;
  if (isFinite(bv)) return bv;
  return NaN;
}
