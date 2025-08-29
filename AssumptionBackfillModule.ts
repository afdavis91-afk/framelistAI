import { TakeoffLineItem, TakeoffFlag, WallType, JoistSystem, RoofFraming, SheathingSystem, ConstructionStandards, ProjectDocument } from "../../types/construction";
import { inferLevelFromSheet } from "../../utils/levels";

export interface AssumptionBackfillContext {
  wallTypes: WallType[];
  joistSystems: JoistSystem[];
  roofFraming: RoofFraming[];
  sheathingSystems: SheathingSystem[];
  standards: ConstructionStandards;
  // Optional: structural drawing analysis for structural-only backfill
  drawingAnalysis?: any;
  documents?: ProjectDocument[];
}

export interface AssumptionBackfillResult {
  assumedItems: TakeoffLineItem[];
  flags: TakeoffFlag[];
  confidenceDelta?: number;
}

// Utility: normalize category from item
function getCategoryFromItem(item: any): string {
  try {
    const scope = String(item?.context?.scope || "").toLowerCase();
    const spec = String(item?.material?.spec || "").toLowerCase();
    const size = String(item?.material?.size || "").toLowerCase();
    const conn = String(item?.material?.connectorType || "").toLowerCase();
    const header = String(item?.material?.headerType || "").toLowerCase();
    const text = [scope, spec, size, conn, header].join(" ");

    if (text.includes("stud")) return "stud";
    if (text.includes("plate")) return "plate";
    if (text.includes("joist")) return "joist";
    if (text.includes("rafter")) return "rafter";
    if (text.includes("beam") || text.includes("header")) return "beam";
    if (text.includes("sheathing") || text.includes("osb") || text.includes("plywood")) return "sheathing";
    if (
      text.includes("hanger") || text.includes("connector") || text.includes("strap") ||
      text.includes("tie") || text.includes("anchor") || text.includes("bolt") ||
      text.includes("hold-down") || text.includes("holddown") || text.includes("hd") || text.includes("simpson")
    ) return "connector";
    return "other";
  } catch {
    return "other";
  }
}

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

// Normalize a height that may be inches or feet. Heuristic: >30 assumed inches.
function feetFromMaybeInches(h: any): { val: number; normalized: boolean; fromInches?: number } {
  const num = Number(h);
  if (!Number.isFinite(num) || num <= 0) return { val: 8, normalized: false };
  if (num > 30) return { val: +(num / 12).toFixed(2), normalized: true, fromInches: num };
  return { val: num, normalized: false };
}

export async function backfillAssumptions(
  items: TakeoffLineItem[],
  ctx: AssumptionBackfillContext
): Promise<AssumptionBackfillResult> {
  const assumedItems: TakeoffLineItem[] = [];
  const flags: TakeoffFlag[] = [];

  const present = new Set<string>();
  items.forEach((it) => present.add(getCategoryFromItem(it)));

  const spacingDefault = ctx.standards.studSpacingDefault || 16;
  const plateHeightDefault = (ctx.wallTypes?.[0]?.typicalPlateHeight || 8) as number;

  // Helper: add structural-only assumptions from S-series walls in drawing analysis
  const tryStructuralOnlyFromWalls = () => {
    try {
      const da: any = (ctx as any).drawingAnalysis;
      if (!da || !Array.isArray(da.pages)) return;
      const structuralPages = da.pages.filter((p: any) => String(p.discipline || "").toLowerCase() === "structural" || String(p.title || "").toLowerCase().includes("framing"));
      if (structuralPages.length === 0) return;

      let createdSheathing = 0;
      let createdPlates = 0;

      for (const page of structuralPages) {
        const sheetId = page.sheetId || "";
        const level = inferLevelFromSheet(sheetId, page.title || "");
        for (const entity of (page.entities || [])) {
          if (entity.type !== "wall") continue;
          const props = entity.properties || {};
          const L = Number(props.length || 0); // assume feet if provided
          const rawH = (props.height != null ? props.height : plateHeightDefault);
          const Hn = feetFromMaybeInches(rawH);
          const H = Hn.val;
          if (!Number.isFinite(L) || L <= 0) continue;

          // Sheathing backfill if missing overall or sparse
          if (!present.has("sheathing") || sheathingItems.length === 0) {
            const area = Math.round(L * H * 100) / 100;
            const sheathing: TakeoffLineItem = {
              itemId: `SHEATHING_WALL_S_${entity.id}`,
              uom: "SF",
              qty: area,
              material: {
                spec: "7/16 in OSB",
                grade: "Exposure 1",
                edgeSpacing: "6 in",
                fieldSpacing: "12 in",
                nailingPattern: "8d @ 6/12",
              },
              context: { scope: "sheathing", wallType: entity.id, level, sheetRef: sheetId, viewRef: page.title || "Plan", bbox: [0,0,0,0], sourceNotes: [] },
              assumptions: [
                `Derived from S-wall centerline length ${L} ft`,
                `Wall height ${H} ft (typical)`,
                ...(Hn.normalized ? [`Interpreted wall height from inches to feet (${Hn.fromInches} in → ${H} ft)`] : []),
                "No opening subtracts (unknown openings)",
              ],
              confidence: clamp01(0.4 - (H < 6 || H > 20 ? 0.05 : 0)),
              evidenceRefs: [{ documentId: da.documentId, pageNumber: page.pageNumber, coordinates: entity.evidenceBox, description: "S-wall centerline extent" }],
            } as any;
            assumedItems.push(sheathing);
            createdSheathing++;
            if (Hn.normalized) {
              flags.push({ type: "ASSUMPTION" as any, message: `Normalized wall height from ${Hn.fromInches} in to ${H} ft on sheet ${sheetId}`, severity: "low", sheets: [sheetId], resolved: true });
            }
          }

          // Plates backfill if plates generally missing
          if (!present.has("plate") || plateItems.length === 0) {
            const isExterior = Boolean(entity.properties?.exterior);
            const bottomPlate: TakeoffLineItem = {
              itemId: `PLATE_BOTTOM_S_${entity.id}`,
              uom: "LF",
              qty: Math.round(L * 1.1 * 100) / 100,
              material: { spec: (ctx.wallTypes?.[0]?.studSize || "2x4"), grade: "No.2", treatment: isExterior ? "PT" : "" },
              context: { scope: "plate", wallType: entity.id, level, sheetRef: sheetId, viewRef: page.title || "Plan", bbox: [0,0,0,0], sourceNotes: [] },
              assumptions: [
                `Derived from S-wall length ${L} ft`,
                isExterior ? "Location: exterior (PT plate)" : "Location: interior (SPF)",
                "Bottom plate LF = wall length (+10% splice)",
              ],
              confidence: clamp01(0.45),
              evidenceRefs: [{ documentId: da.documentId, pageNumber: page.pageNumber, coordinates: entity.evidenceBox, description: "S-wall plate extent" }],
            } as any;

            const topPlates: TakeoffLineItem = {
              itemId: `PLATE_TOP_S_${entity.id}`,
              uom: "LF",
              qty: Math.round(L * 2 * 1.1 * 100) / 100,
              material: { spec: (ctx.wallTypes?.[0]?.studSize || "2x4"), grade: "No.2" },
              context: { scope: "plate", wallType: entity.id, level, sheetRef: sheetId, viewRef: page.title || "Plan", bbox: [0,0,0,0], sourceNotes: [] },
              assumptions: [
                `Derived from S-wall length ${L} ft`,
                "Top plates = 2 × wall length (+10% splice)",
              ],
              confidence: clamp01(0.45),
              evidenceRefs: [{ documentId: da.documentId, pageNumber: page.pageNumber, coordinates: entity.evidenceBox, description: "S-wall plate extent" }],
            } as any;

            assumedItems.push(bottomPlate, topPlates);
            createdPlates += 2;
          }
        }
      }

      if (createdSheathing > 0) {
        flags.push({ type: "ASSUMPTION" as any, message: `Backfilled ${createdSheathing} wall sheathing items from S-series`, severity: "low", sheets: [], resolved: false });
      }
      if (createdPlates > 0) {
        flags.push({ type: "ASSUMPTION" as any, message: `Backfilled ${createdPlates} plates from S-series walls`, severity: "low", sheets: [], resolved: false });
      }
    } catch {}
  };

  // Helper: derive wall length from a stud item
  const deriveWallLength = (stud: TakeoffLineItem): number => {
    const qty = Number(stud.qty) || 0;
    const wt = ctx.wallTypes?.find(w => w.id && String(stud.context?.wallType || "").includes(String(w.id))) || ctx.wallTypes?.[0];
    const spacing = Number(wt?.studSpacing || spacingDefault);
    if (qty <= 0 || spacing <= 0) return 0;
    // Approx: remove two end studs
    return Math.max(0, (qty - 2) * (spacing / 12)); // feet
  };

  // Gather studs and plates
  const studItems = items.filter(i => getCategoryFromItem(i) === "stud");
  const plateItems = items.filter(i => getCategoryFromItem(i) === "plate");
  const sheathingItems = items.filter(i => getCategoryFromItem(i) === "sheathing");
  const joistItems = items.filter(i => getCategoryFromItem(i) === "joist");
  const rafterItems = items.filter(i => getCategoryFromItem(i) === "rafter");
  const connectorItems = items.filter(i => getCategoryFromItem(i) === "connector");

  // 1) Plates backfill if studs present but no plates
  if (!present.has("plate") && studItems.length > 0) {
    let created = 0;
    for (const stud of studItems) {
      const L = deriveWallLength(stud);
      if (L <= 0) continue;
      const bottomPlate: TakeoffLineItem = {
        itemId: `PLATE_BOTTOM_${stud.itemId}`,
        uom: "LF",
        qty: Math.round(L * 1.1 * 100) / 100, // +10% splice
        material: {
          spec: ctx.wallTypes?.[0]?.studSize || "2x4",
          grade: "No.2",
          treatment: stud.context?.scope?.toLowerCase().includes("exterior") ? "PT" : "",
        },
        context: { ...stud.context, scope: "plate" },
        assumptions: [
          `Derived wall length from studs @ ${(ctx.wallTypes?.[0]?.studSpacing || spacingDefault)}\" o.c.`,
          "Bottom plate LF = wall length (+10% splice)",
        ],
        confidence: clamp01(0.45),
        evidenceRefs: [],
      } as any;

      const topPlates: TakeoffLineItem = {
        itemId: `PLATE_TOP_${stud.itemId}`,
        uom: "LF",
        qty: Math.round(L * 2 * 1.1 * 100) / 100, // two top plates +10%
        material: {
          spec: ctx.wallTypes?.[0]?.studSize || "2x4",
          grade: "No.2",
        },
        context: { ...stud.context, scope: "plate" },
        assumptions: [
          `Derived wall length from studs @ ${(ctx.wallTypes?.[0]?.studSpacing || spacingDefault)}\" o.c.`,
          "Top plates = 2 × wall length (+10% splice)",
        ],
        confidence: clamp01(0.45),
        evidenceRefs: [],
      } as any;

      assumedItems.push(bottomPlate, topPlates);
      created += 2;
    }
    if (created > 0) {
      flags.push({
        type: "ASSUMPTION" as any,
        message: `Backfilled ${created} plate items from stud walls using code-minimum rules`,
        severity: "low",
        sheets: [],
        resolved: false,
      });
    }
  }

  // 2) Wall sheathing backfill if studs present but no sheathing
  if (!present.has("sheathing") && studItems.length > 0) {
    let created = 0;
    for (const stud of studItems) {
      const L = deriveWallLength(stud);
      if (L <= 0) continue;
      const rawH = (ctx.wallTypes?.[0]?.typicalPlateHeight ?? plateHeightDefault);
      const Hn = feetFromMaybeInches(rawH);
      const H = Hn.val; // feet
      const area = Math.round(L * H * 100) / 100;
      const wallKey = String(stud.context?.wallType || stud.context?.level || "GEN").replace(/[^A-Za-z0-9_-]/g, "");
      const sheathing: TakeoffLineItem = {
        itemId: `SHEATHING_WALL_OSB_716_${wallKey}`,
        uom: "SF",
        qty: area,
        material: {
          spec: "7/16 in OSB",
          grade: "Exposure 1",
          edgeSpacing: "6 in",
          fieldSpacing: "12 in",
          nailingPattern: "8d @ 6/12",
        },
        context: { ...stud.context, scope: "sheathing" },
        assumptions: [
          `Wall height ${H} ft default`,
          ...(Hn.normalized ? [`Interpreted wall height from inches to feet (${Hn.fromInches} in → ${H} ft)`] : []),
          "No opening subtracts (unknown openings)",
          "Sheet 4x8 equivalent; nailing 8d @ 6/12",
        ],
        confidence: clamp01(0.4 - (H < 6 || H > 20 ? 0.05 : 0)),
        evidenceRefs: [],
      } as any;
      assumedItems.push(sheathing);
      created++;
      if (Hn.normalized) {
        const sheet = String(stud.context?.sheetRef || "");
        flags.push({ type: "ASSUMPTION" as any, message: `Normalized wall height from ${Hn.fromInches} in to ${H} ft${sheet ? ` on sheet ${sheet}` : ""}`, severity: "low", sheets: sheet ? [sheet] : [], resolved: true });
      }
    }
    if (created > 0) {
      flags.push({
        type: "ASSUMPTION" as any,
        message: `Backfilled ${created} wall sheathing items using default height and nailing`,
        severity: "low",
        sheets: [],
        resolved: false,
      });
    }
  }

  // 3) Anchor bolts from plates (if connectors missing)
  if (!present.has("connector") && (present.has("plate") || (!present.has("plate") && studItems.length > 0))) {
    // try to use plate items if exist; else use derived plates from studs already created above
    const candidatePlates = [...plateItems, ...assumedItems.filter(i => getCategoryFromItem(i) === "plate")];
    let bolts = 0;
    candidatePlates.forEach((pl) => {
      if (pl.uom === "LF") {
        const L = Number(pl.qty) || 0;
        if (L > 0) bolts += Math.ceil(L / 6) + 2; // +2 for ends
      }
    });
    if (bolts > 0) {
      const anchors: TakeoffLineItem = {
        itemId: `ANCHOR_BOLT_ASSUMED_${Date.now()}`,
        uom: "EA",
        qty: bolts,
        material: {
          spec: "1/2 in anchor bolt",
          grade: "galvanized",
          anchorSpec: "1/2\" @ 6'-0\" o.c., 12\" from corners",
        },
        context: { scope: "connector", wallType: "", level: "UNKNOWN", sheetRef: "", viewRef: "Plan", bbox: [0,0,0,0], sourceNotes: [] },
        assumptions: ["Anchor spacing 6 ft, 12 in from ends"],
        confidence: clamp01(0.35),
        evidenceRefs: [],
      } as any;
      assumedItems.push(anchors);
      flags.push({
        type: "ASSUMPTION" as any,
        message: `Backfilled ${bolts} anchor bolts from plate lengths (6 ft o.c.)`,
        severity: "low",
        sheets: [],
        resolved: false,
      });
    }
  }

  // 4) Joist hangers from joists
  if (joistItems.length > 0 && !connectorItems.some(i => String(i.material?.hangerType || "").length > 0)) {
    let created = 0;
    joistItems.forEach((j) => {
      const count = Math.max(0, Math.round((Number(j.qty) || 0) * 2));
      if (count === 0) return;
      const hangers: TakeoffLineItem = {
        itemId: `HANGER_FOR_${j.itemId}`,
        uom: "EA",
        qty: count,
        material: {
          spec: "joist_hanger",
          grade: "galvanized_steel",
          hangerType: "joist_hanger",
          hangerSize: j.material?.size,
        },
        context: { ...j.context, scope: "connector" },
        assumptions: ["Two hangers per joist end"],
        confidence: clamp01(0.4),
        evidenceRefs: [],
      } as any;
      assumedItems.push(hangers);
      created += count;
    });
    if (created > 0) {
      flags.push({
        type: "ASSUMPTION" as any,
        message: `Backfilled ${created} joist hangers at two per joist`,
        severity: "low",
        sheets: [],
        resolved: false,
      });
    }
  }

  // 5) Blocking from joists
  if (joistItems.length > 0 && !items.some(i => String(i.context?.scope || "").toLowerCase().includes("blocking"))) {
    let lf = 0;
    joistItems.forEach((j) => {
      const spacing = Number(j.material?.joistSpacing || 16);
      const rows = Math.ceil(spacing / 48);
      const joistCount = Number(j.qty) || 0;
      const depth = Number(j.material?.width || j.material?.height || 14.5);
      lf += Math.max(0, (joistCount - 1) * rows * (depth / 12));
    });
    if (lf > 0) {
      const blocking: TakeoffLineItem = {
        itemId: `BLOCKING_ASSUMED_${Date.now()}`,
        uom: "LF",
        qty: Math.round(lf * 100) / 100,
        material: {
          spec: ctx.wallTypes?.[0]?.studSize || "2x10",
          grade: "No.2",
          blockingPurpose: "structural",
        },
        context: { scope: "blocking", wallType: "", level: "UNKNOWN", sheetRef: "", viewRef: "Plan", bbox: [0,0,0,0], sourceNotes: [] },
        assumptions: ["Blocking rows every 4 ft based on joist spacing"],
        confidence: clamp01(0.4),
        evidenceRefs: [],
      } as any;
      assumedItems.push(blocking);
      flags.push({
        type: "ASSUMPTION" as any,
        message: `Backfilled ${Math.round(lf)} LF blocking based on joist spacing`,
        severity: "low",
        sheets: [],
        resolved: false,
      });
    }
  }

  // Structural-only S-series backfill using geometric walls
  tryStructuralOnlyFromWalls();

  // 6) Hurricane ties from rafters
  if (rafterItems.length > 0 && !connectorItems.some(i => (i.material?.spec || "").toLowerCase().includes("hurricane"))) {
    let ties = 0;
    rafterItems.forEach((r) => { ties += Number(r.qty) || 0; });
    if (ties > 0) {
      const ht: TakeoffLineItem = {
        itemId: `HURRICANE_TIES_ASSUMED_${Date.now()}`,
        uom: "EA",
        qty: ties,
        material: { spec: "hurricane_tie", grade: "galvanized_steel" },
        context: { scope: "connector", wallType: "", level: "UNKNOWN", sheetRef: "", viewRef: "Plan", bbox: [0,0,0,0], sourceNotes: [] },
        assumptions: ["One hurricane tie per rafter"],
        confidence: clamp01(0.35),
        evidenceRefs: [],
      } as any;
      assumedItems.push(ht);
      flags.push({ type: "ASSUMPTION" as any, message: `Backfilled ${ties} hurricane ties (1 per rafter)`, severity: "low", sheets: [], resolved: false });
    }
  }

  return { assumedItems, flags, confidenceDelta: 0 };
}
