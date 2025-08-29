import { PricingComparison } from "./types";
import { categorizeMaterial } from "./catalog";

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function parseSize(spec: string): string | null {
  const m = spec.match(/(\d+\s*x\s*\d+)/i);
  return m ? m[1].replace(/\s+/g, "").toLowerCase() : null;
}

function humanizeCategory(cat?: string): string {
  switch ((cat || "").toLowerCase()) {
    case "studs": return "Stud";
    case "plates": return "Plate";
    case "headers": return "Header";
    case "sheathing": return "Sheathing";
    case "blocking": return "Blocking";
    case "fasteners": return "Fasteners";
    case "connectors": return "Connector";
    default: return "Dimensional Lumber";
  }
}

export function makeComparisonTitle(c: PricingComparison): string {
  const snap = c.originalLineItem;
  const spec = snap?.material?.spec || c.materialSpec || "";
  const size = snap?.material?.size || parseSize(spec);
  const grade = snap?.material?.grade || "";
  const category = snap?.category || categorizeMaterial(c.lineItemId, { spec, grade });

  const isGeneric = /dimensional\s*lumber/i.test(spec);

  if (isGeneric) {
    const parts: string[] = [];
    if (size) parts.push(size.toUpperCase());
    const catWord = humanizeCategory(category);
    if (catWord && catWord !== "Dimensional Lumber") parts.push(catWord);
    if (grade && !/dimensional\s*lumber/i.test(grade)) parts.push(grade.toUpperCase());
    const label = parts.join(" ").trim();
    return label.length > 0 ? label : "Dimensional Lumber";
  }

  // If spec already descriptive, use it with grade if useful
  const base = spec.trim();
  if (grade && !base.toLowerCase().includes(grade.toLowerCase())) {
    return `${base} ${grade}`.trim();
  }
  return base.length > 0 ? base : "Dimensional Lumber";
}