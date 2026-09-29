export type ID = string;

/** One step on a status scale, e.g. "🟡 Disarray: Overflowing drawers…" */
export interface StatusLevel {
  id: ID;
  icon: string;
  label: string;
  desc: string;
  /** Resolved fill colour. Derived from the icon unless overridden with a #hex. */
  color: string;
}

export interface Scale {
  id: ID;
  name: string;
  /** Raw textarea contents; the levels below are parsed from this. */
  source: string;
  levels: StatusLevel[];
}

export interface Background {
  /** data: URL of the uploaded floorplan image. */
  src: string;
  /** World-space placement of the image's top-left corner. */
  x: number;
  y: number;
  /** World units per image pixel. */
  scale: number;
  opacity: number;
  naturalWidth: number;
  naturalHeight: number;
}

export interface Floor {
  id: ID;
  name: string;
  background?: Background;
}

export type Point = [number, number];

export interface Room {
  id: ID;
  floorId: ID;
  name: string;
  points: Point[];
  /** scaleId -> statusLevelId */
  status: Record<ID, ID | undefined>;
  notes: string;
  updatedAt: number;
}

export interface Recurrence {
  /** Repeat interval in days. 0 / undefined means one-off. */
  everyDays: number;
  /** Epoch ms of the last completion, or 0 if never done. */
  lastDone: number;
}

export interface Marker {
  id: ID;
  floorId: ID;
  x: number;
  y: number;
  icon: string;
  label: string;
  notes: string;
  recurrence?: Recurrence;
  updatedAt: number;
}

export interface AppState {
  version: number;
  floors: Floor[];
  rooms: Room[];
  markers: Marker[];
  scales: Scale[];
  /** Which scale drives the room fill; the other scales show as edge accents. */
  activeScaleId: ID;
}

export type Tool = "select" | "rect" | "polygon" | "marker";

export type Selection =
  | { kind: "room"; id: ID }
  | { kind: "marker"; id: ID }
  | { kind: "floor"; id: ID }
  | null;
