import type { Scale, StatusLevel } from "./types";

/**
 * Base colours for the coloured-circle emoji, so a scale can be written as
 * plain text ("🟡 Disarray: …") with no colour codes at all.
 */
const ICON_COLORS: Record<string, string> = {
  "🟢": "#22c55e",
  "🟡": "#eab308",
  "🟠": "#f97316",
  "🔴": "#ef4444",
  "🔵": "#3b82f6",
  "🟣": "#a855f7",
  "🟤": "#a16207",
  "⚫": "#4b5563",
  "⚪": "#cbd5e1",
  "✅": "#22c55e",
  "⚠️": "#eab308",
  "❌": "#ef4444",
};

const FALLBACK_COLOR = "#64748b";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** amount > 0 lightens toward white, < 0 darkens toward black. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amount >= 0) {
    return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  }
  const k = 1 + amount;
  return rgbToHex(r * k, g * k, b * k);
}

/** Readable text colour for a given background. */
export function contrastText(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f1116" : "#ffffff";
}

const HEX_RE = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i;

/**
 * Parses one status level per line. The forgiving format is exactly how you'd
 * write the scale by hand:
 *
 *   🟡 Disarray: Overflowing drawers, doom piles, and partially blocked paths.
 *
 * The description is optional, and an optional `#rrggbb` anywhere on the line
 * overrides the colour derived from the icon. Blank lines and `#`-comments
 * at the start of a line are ignored.
 */
export function parseScale(source: string): StatusLevel[] {
  const levels: StatusLevel[] = [];
  // How many times each base colour has been used, so duplicates can be
  // shaded apart (the two 🟢 steps of a scale should not be identical).
  const seen = new Map<string, number>();

  for (const rawLine of source.split("\n")) {
    let line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;

    let override: string | undefined;
    const hexMatch = line.match(HEX_RE);
    if (hexMatch) {
      override = hexMatch[0];
      line = line.replace(HEX_RE, "").trim();
    }
    if (!line) continue;

    // Leading token is the icon when it is short and not word-like.
    let icon = "";
    const firstSpace = line.search(/\s/);
    const head = firstSpace === -1 ? line : line.slice(0, firstSpace);
    if (head && ![...head].some((ch) => /[a-z0-9]/i.test(ch)) && [...head].length <= 3) {
      icon = head;
      line = firstSpace === -1 ? "" : line.slice(firstSpace).trim();
    }

    const colonAt = line.indexOf(":");
    const label = (colonAt === -1 ? line : line.slice(0, colonAt)).trim();
    const desc = colonAt === -1 ? "" : line.slice(colonAt + 1).trim();
    if (!label && !icon) continue;

    const base = override ?? ICON_COLORS[icon] ?? FALLBACK_COLOR;
    let color = base;
    if (!override) {
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      // First use of a colour is the bright one; later uses step darker, so a
      // scale's two 🟢 (or two 🔴) steps stay distinguishable and the deeper
      // shade reads as the more extreme end of the run.
      if (n > 0) color = shade(base, Math.max(-0.22 * n, -0.55));
    }

    levels.push({
      id: slug(label || icon, levels),
      icon,
      label: label || icon,
      desc,
      color,
    });
  }
  return levels;
}

function slug(text: string, existing: StatusLevel[]): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "level";
  let id = base;
  let n = 2;
  while (existing.some((l) => l.id === id)) id = `${base}-${n++}`;
  return id;
}

export function buildScale(id: string, name: string, source: string): Scale {
  return { id, name, source, levels: parseScale(source) };
}

export const DEFAULT_CLEANLINESS_SOURCE = `🟢 Pristine: Spotless, deep cleaned, organized, and perfectly staged.
🟢 Surface Clutter: Functional room with minor daily mess like mail or clothes.
🟡 Disarray: Overflowing drawers, doom piles, and partially blocked paths.
🟠 Degradation: Pests present, strong odors, and rooms used strictly for storage.
🔴 Hazardous: Severe structural clutter, safety risks, and narrow goat paths.
🔴 Extreme Hoarding: Floor-to-ceiling trash and belongings rendering the space uninhabitable.`;

export const DEFAULT_CONSTRUCTION_SOURCE = `🔴 Deficient: Room intact but broken, worn down, or highly outdated.
🟠 Gutted: Tearing out complete, space out of service with studs exposed.
🟡 Structural: Framing finalized and insulation packed into the open walls.
🔵 Rough-In: Infrastructure inspected and fresh drywall panels hung.
🟢 Functional: Flooring, cabinets, and major fixtures fully installed.
🟢 Complete: Room detailed, deep cleaned, and ready for staging.`;

export function defaultScales(): Scale[] {
  return [
    buildScale("cleanliness", "Cleanliness", DEFAULT_CLEANLINESS_SOURCE),
    buildScale("construction", "Construction", DEFAULT_CONSTRUCTION_SOURCE),
  ];
}

export function findLevel(scale: Scale | undefined, levelId: string | undefined) {
  if (!scale || !levelId) return undefined;
  return scale.levels.find((l) => l.id === levelId);
}
