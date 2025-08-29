// levels.ts
export type CanonicalLevel =
  | "FOUNDATION"
  | "GROUND FLOOR"
  | "SECOND FLOOR"
  | "ROOF"
  | "UNKNOWN";

/** Optional hints to improve scoring context. */
export interface LevelContext {
  /** If the text comes from a sheet title (e.g., "A2.1 – First Floor Plan"), boost its score. */
  isSheetTitle?: boolean;
  /** If the text comes from a sheet ID (e.g., "A2.1", "S1.2"), modest boost. */
  isSheetId?: boolean;
  /** If the text is from drawing callouts/sections index, small boost. */
  isIndexOrLegend?: boolean;
}

/** Utility: normalize whitespace and case */
function prep(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

/** A weighted rule: regex + target + base weight. */
type Rule = { re: RegExp; lvl: Exclude<CanonicalLevel, "UNKNOWN">; weight: number };

/** Rules ordered by general "priority class," but scoring decides the winner. */
const RULES: Rule[] = [
  // ===== FOUNDATION / BELOW GRADE ===== (strong signals)
  { re: /\bF\.?F\.?E\.?\s*\+?0'?[-\s]?0?[""]?\b/i, lvl: "FOUNDATION", weight: 7 }, // FFE +0'-0"
  { re: /\bT\.?O\.?S\.?\b(?!.*(steel|beam))/i, lvl: "FOUNDATION", weight: 7 },    // TOS (not steel/beam)
  { re: /\b(SOG|slab[-\s]?on[-\s]?grade|slabon ?grade)\b/i, lvl: "FOUNDATION", weight: 6 },
  { re: /\b(B\.?O\.?F\.?|T\.?O\.?F\.?)\b/i, lvl: "FOUNDATION", weight: 6 },       // BOF / TOF
  { re: /\b(basement|bsmt|bsmnt|cellar|crawl\s*space|crawlspace)\b/i, lvl: "FOUNDATION", weight: 5 },
  { re: /\b(podium\s*slab|transfer\s*slab)\b/i, lvl: "FOUNDATION", weight: 5 },
  { re: /\b(P0|B0)\b/i, lvl: "FOUNDATION", weight: 5 },
  { re: /\bP\d+\b/i, lvl: "FOUNDATION", weight: 4 },                              // P1, P2, ...
  { re: /\bB\d+\b/i, lvl: "FOUNDATION", weight: 4 },                              // B1, B2, ...
  { re: /\b(foundation|footing|mud\s*sil?l|sill\s*plate|fnd)\b/i, lvl: "FOUNDATION", weight: 4 },
  { re: /\b(Foundation\s*Plan|S\d+\.\d+.*Foundation)\b/i, lvl: "FOUNDATION", weight: 6 }, // title cue

  // ===== GROUND / FIRST FLOOR =====
  { re: /\b(First|1st|Main)\s*(Floor|Flr|Level|Lvl)\b/i, lvl: "GROUND FLOOR", weight: 6 },
  { re: /\b(Ground|G)\s*(Floor|Level|Lvl)\b/i, lvl: "GROUND FLOOR", weight: 6 },
  { re: /\b(L(?:evel)?\s*0*1|L1|^01$)\b/i, lvl: "GROUND FLOOR", weight: 5 },
  { re: /\b1\s*[/\-]?\s*F\b/i, lvl: "GROUND FLOOR", weight: 4 },
  { re: /\bA\d+\.\d+\s*[–\-]\s*(First|1st)\s*Floor\s*Plan\b/i, lvl: "GROUND FLOOR", weight: 7 },

  // ===== SECOND / UPPER FLOOR =====
  { re: /\b(Second|2nd|Upper)\s*(Floor|Flr|Level|Lvl)\b/i, lvl: "SECOND FLOOR", weight: 6 },
  { re: /\b(L(?:evel)?\s*0*2|L2|^02$)\b/i, lvl: "SECOND FLOOR", weight: 5 },
  { re: /\b2\s*[/\-]?\s*F\b/i, lvl: "SECOND FLOOR", weight: 4 },
  { re: /\bA\d+\.\d+\s*[–\-]\s*(Second|2nd)\s*Floor\s*Plan\b/i, lvl: "SECOND FLOOR", weight: 7 },

  // Any higher numbered storeys → treat as "upper floors" (SECOND FLOOR bucket)
  { re: /\bL(?:evel)?\s*0*[3-9]\b/i, lvl: "SECOND FLOOR", weight: 4 },                 // Level 3, L04…
  { re: /\b(\d{1,2})(st|nd|rd|th)\s*(Floor|Level|Lvl|Flr)\b/i, lvl: "SECOND FLOOR", weight: 4 }, // 3rd Floor
  { re: /\b(Storey|Story)\s*\d+\b/i, lvl: "SECOND FLOOR", weight: 4 },

  // ===== ROOF / ATTIC =====
  { re: /\b(Roof\s*Plan|Roof\s*Level)\b/i, lvl: "ROOF", weight: 7 },
  { re: /\b(Ridge|Roof\s*Ridge|Eave[s]?)\b/i, lvl: "ROOF", weight: 5 },
  { re: /\bT\.?O\.?P\.?\b/i, lvl: "ROOF", weight: 5 },                                 // Top of Plate
  { re: /\bT\.?O\.?W\.?\b/i, lvl: "ROOF", weight: 5 },                                 // Top of Wall
  { re: /\b(rafter(s)?|truss(es)?|lookout\s*rafters?)\b/i, lvl: "ROOF", weight: 4 },
  { re: /\b(Attic|Unfinished\s*Attic|Loft|Penthouse|Roof\s*Terrace|RT)\b/i, lvl: "ROOF", weight: 4 },

  // ===== SPECIAL USE (group with foundation for takeoff) =====
  { re: /\b(Garage|Parking)\s*(Level|Floor)?\b/i, lvl: "FOUNDATION", weight: 3 },
];

/** Context multipliers. Sheet titles are strongest, then sheet IDs, then legend/index. */
const CTX_MULT = (ctx?: LevelContext) => {
  if (!ctx) return 1;
  let m = 1;
  if (ctx.isSheetTitle) m += 0.75;     // +75%
  if (ctx.isSheetId) m += 0.35;        // +35%
  if (ctx.isIndexOrLegend) m += 0.25;  // +25%
  return m;
};

type Scored = { lvl: CanonicalLevel; score: number; hits: number };

/** Score-based normalizer. Returns best level and details if needed. */
export function normalizeLevelScored(
  input?: string | null,
  ctx?: LevelContext
): { level: CanonicalLevel; score: number } {
  if (!input) return { level: "UNKNOWN", score: 0 };
  const s = prep(String(input));
  const mult = CTX_MULT(ctx);
  const tally = new Map<CanonicalLevel, Scored>();

  // Match all rules; accumulate weighted score
  for (const { re, lvl, weight } of RULES) {
    if (re.test(s)) {
      const cur = tally.get(lvl) || { lvl, score: 0, hits: 0 };
      // Slight bonus for multiple distinct rule hits in same bucket
      const perHit = weight * mult;
      cur.score += perHit;
      cur.hits += 1;
      tally.set(lvl, cur);
    }
  }

  // Direct tokens / placeholders
  if (/^l1$/i.test(s) || /^01$/i.test(s) || /^\bg\b$/i.test(s)) {
    const cur = tally.get("GROUND FLOOR") || { lvl: "GROUND FLOOR", score: 0, hits: 0 };
    cur.score += 5 * mult;
    cur.hits += 1;
    tally.set("GROUND FLOOR", cur);
  }
  if (/^l2$/i.test(s) || /^02$/i.test(s)) {
    const cur = tally.get("SECOND FLOOR") || { lvl: "SECOND FLOOR", score: 0, hits: 0 };
    cur.score += 5 * mult;
    cur.hits += 1;
    tally.set("SECOND FLOOR", cur);
  }
  if (/^b\d+$/i.test(s) || /^p\d+$/i.test(s)) {
    const cur = tally.get("FOUNDATION") || { lvl: "FOUNDATION", score: 0, hits: 0 };
    cur.score += 4 * mult;
    cur.hits += 1;
    tally.set("FOUNDATION", cur);
  }

  // If nothing matched, UNKNOWN (honor NA/None/Unknown explicitly)
  if (/unknown|^n\/?a$|^na$|none/i.test(s)) {
    return { level: "UNKNOWN", score: 0 };
  }

  if (tally.size === 0) return { level: "UNKNOWN", score: 0 };

  // Pick best by score; deterministic tie-break by preference order
  const preference: CanonicalLevel[] = ["FOUNDATION", "GROUND FLOOR", "SECOND FLOOR", "ROOF"];
  let best: Scored | null = null;
  for (const v of Array.from(tally.values())) {
    if (!best || v.score > best.score) best = v;
    else if (v.score === best.score) {
      // tie-break: more hits wins; then preference order
      if (v.hits > best.hits) best = v;
      else if (v.hits === best.hits) {
        if (preference.indexOf(v.lvl) < preference.indexOf(best.lvl)) best = v;
      }
    }
  }
  return { level: (best?.lvl ?? "UNKNOWN") as CanonicalLevel, score: best?.score ?? 0 };
}

/** Backward-compatible normalizer (uses scoring internally). */
export function normalizeLevel(input?: string | null): CanonicalLevel {
  return normalizeLevelScored(input).level;
}

/** Infers level from sheet id + title, with context boosting. */
export function inferLevelFromSheet(
  sheetId?: string | null,
  title?: string | null
): CanonicalLevel {
  // Score each component with appropriate context, then combine.
  const id = prep(sheetId || "");
  const ttl = prep(title || "");

  const idScore = id ? normalizeLevelScored(id, { isSheetId: true }).score : 0;
  const idLevel = id ? normalizeLevel(id) : "UNKNOWN";

  const titleScored = ttl ? normalizeLevelScored(ttl, { isSheetTitle: true }).level : "UNKNOWN";
  const titleScore = ttl ? normalizeLevelScored(ttl, { isSheetTitle: true }).score : 0;

  // Prefer title if stronger; otherwise fallback to best of both
  if (titleScore > idScore) return titleScored;
  if (idScore > 0) return idLevel;

  // As a final try, combine haystack and treat as legend/index
  const hay = [id, ttl].join(" ").trim();
  return normalizeLevelScored(hay, { isIndexOrLegend: true }).level;
}

/** Utility for analytics */
export function summarizeLevels(
  levels: string[]
): Array<{ level: CanonicalLevel; count: number }> {
  const counts = new Map<CanonicalLevel, number>();
  for (const l of levels) {
    const k = normalizeLevel(l);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([level, count]) => ({ level, count }));
}
