import type { Point, Room } from './types'

/** The shared coordinate space every floor is drawn in. */
export const WORLD = { width: 1000, height: 750 }
export const GRID = 25

export function snap(value: number, enabled: boolean, size = GRID): number {
  return enabled ? Math.round(value / size) * size : Math.round(value * 10) / 10
}

export function pointsToPath(points: Point[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}

export function bounds(points: Point[]) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/** Area-weighted centre, so labels sit inside L-shaped rooms rather than in the notch. */
export function centroid(points: Point[]): Point {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  area /= 2
  if (Math.abs(area) < 1e-6) {
    const b = bounds(points)
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
  }
  return [cx / (6 * area), cy / (6 * area)]
}

export function polygonArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    area += x0 * y1 - x1 * y0
  }
  return Math.abs(area / 2)
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]
}

export function translate(points: Point[], dx: number, dy: number): Point[] {
  return points.map(([x, y]) => [x + dx, y + dy] as Point)
}

/** Rooms drawn later sit on top, so hit-test back to front. */
export function roomAt(rooms: Room[], floorId: string, x: number, y: number): Room | undefined {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const room = rooms[i]
    if (room.floorId !== floorId) continue
    if (pointInPolygon([x, y], room.points)) return room
  }
  return undefined
}

export function pointInPolygon([x, y]: Point, points: Point[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}
