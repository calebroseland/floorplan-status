import type { AppState, Background, Floor, ID, Marker, Point, Room, Scale } from './types'
import { defaultScales, parseScale } from './scales'
import { rectPoints, translate, uid } from './geometry'

export const STATE_VERSION = 1

export type Action =
  | { type: 'replace'; state: AppState }
  | { type: 'setActiveScale'; scaleId: ID }
  | { type: 'setScales'; scales: Scale[] }
  | { type: 'addFloor'; name?: string }
  | { type: 'updateFloor'; id: ID; patch: Partial<Floor> }
  | { type: 'removeFloor'; id: ID }
  | { type: 'moveFloor'; id: ID; direction: -1 | 1 }
  | { type: 'setBackground'; floorId: ID; background?: Background }
  | { type: 'addRoom'; room: Room }
  | { type: 'updateRoom'; id: ID; patch: Partial<Room> }
  | { type: 'nudgeRoom'; id: ID; dx: number; dy: number }
  | { type: 'setRoomStatus'; id: ID; scaleId: ID; levelId: ID | undefined }
  | { type: 'removeRoom'; id: ID }
  | { type: 'addMarker'; marker: Marker }
  | { type: 'updateMarker'; id: ID; patch: Partial<Marker> }
  | { type: 'markerDone'; id: ID }
  | { type: 'removeMarker'; id: ID }

function touch<T extends { updatedAt: number }>(item: T, patch: Partial<T>): T {
  return { ...item, ...patch, updatedAt: Date.now() }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'replace':
      return action.state

    case 'setActiveScale':
      return { ...state, activeScaleId: action.scaleId }

    case 'setScales': {
      const activeStillExists = action.scales.some((s) => s.id === state.activeScaleId)
      return {
        ...state,
        scales: action.scales,
        activeScaleId: activeStillExists ? state.activeScaleId : (action.scales[0]?.id ?? ''),
      }
    }

    case 'addFloor': {
      const floor: Floor = { id: uid('floor'), name: action.name ?? `Level ${state.floors.length + 1}` }
      return { ...state, floors: [...state.floors, floor] }
    }

    case 'updateFloor':
      return {
        ...state,
        floors: state.floors.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)),
      }

    case 'removeFloor':
      return {
        ...state,
        floors: state.floors.filter((f) => f.id !== action.id),
        rooms: state.rooms.filter((r) => r.floorId !== action.id),
        markers: state.markers.filter((m) => m.floorId !== action.id),
      }

    case 'moveFloor': {
      const index = state.floors.findIndex((f) => f.id === action.id)
      const target = index + action.direction
      if (index === -1 || target < 0 || target >= state.floors.length) return state
      const floors = [...state.floors]
      const [moved] = floors.splice(index, 1)
      floors.splice(target, 0, moved)
      return { ...state, floors }
    }

    case 'setBackground':
      return {
        ...state,
        floors: state.floors.map((f) =>
          f.id === action.floorId ? { ...f, background: action.background } : f,
        ),
      }

    case 'addRoom':
      return { ...state, rooms: [...state.rooms, action.room] }

    case 'updateRoom':
      return {
        ...state,
        rooms: state.rooms.map((r) => (r.id === action.id ? touch(r, action.patch) : r)),
      }

    case 'nudgeRoom':
      return {
        ...state,
        rooms: state.rooms.map((r) =>
          r.id === action.id ? touch(r, { points: translate(r.points, action.dx, action.dy) }) : r,
        ),
      }

    case 'setRoomStatus':
      return {
        ...state,
        rooms: state.rooms.map((r) =>
          r.id === action.id
            ? touch(r, { status: { ...r.status, [action.scaleId]: action.levelId } })
            : r,
        ),
      }

    case 'removeRoom':
      return { ...state, rooms: state.rooms.filter((r) => r.id !== action.id) }

    case 'addMarker':
      return { ...state, markers: [...state.markers, action.marker] }

    case 'updateMarker':
      return {
        ...state,
        markers: state.markers.map((m) => (m.id === action.id ? touch(m, action.patch) : m)),
      }

    case 'markerDone':
      return {
        ...state,
        markers: state.markers.map((m) =>
          m.id === action.id && m.recurrence
            ? touch(m, { recurrence: { ...m.recurrence, lastDone: Date.now() } })
            : m,
        ),
      }

    case 'removeMarker':
      return { ...state, markers: state.markers.filter((m) => m.id !== action.id) }

    default:
      return state
  }
}

export function emptyState(): AppState {
  const scales = defaultScales()
  return {
    version: STATE_VERSION,
    floors: [{ id: uid('floor'), name: 'Main Floor' }],
    rooms: [],
    markers: [],
    scales,
    activeScaleId: scales[0].id,
  }
}

function room(floorId: ID, name: string, pts: Point[], clean?: string, build?: string): Room {
  return {
    id: uid('room'),
    floorId,
    name,
    points: pts,
    status: { cleanliness: clean, construction: build },
    notes: '',
    updatedAt: Date.now(),
  }
}

/** A small worked example so a fresh install isn't a blank page. */
export function sampleState(): AppState {
  const scales = defaultScales()
  const upstairs: Floor = { id: 'floor_upper', name: 'Upstairs' }
  const main: Floor = { id: 'floor_main', name: 'Main Floor' }
  const basement: Floor = { id: 'floor_base', name: 'Basement' }

  const rooms: Room[] = [
    room(main.id, 'Living Room', rectPoints(100, 100, 450, 375), 'surface-clutter', 'complete'),
    room(main.id, 'Kitchen', rectPoints(450, 100, 700, 300), 'disarray', 'functional'),
    room(main.id, 'Dining', rectPoints(450, 300, 700, 475), 'pristine', 'complete'),
    room(main.id, 'Entry', rectPoints(100, 375, 300, 475), 'surface-clutter', 'complete'),
    room(main.id, 'Half Bath', rectPoints(300, 375, 450, 475), 'pristine', 'deficient'),

    room(upstairs.id, 'Primary Bed', rectPoints(100, 100, 400, 325), 'surface-clutter', 'complete'),
    room(upstairs.id, 'Primary Bath', rectPoints(400, 100, 600, 250), 'disarray', 'rough-in'),
    room(upstairs.id, 'Kids Room', rectPoints(100, 325, 350, 500), 'degradation', 'complete'),
    room(upstairs.id, 'Office', rectPoints(350, 325, 600, 500), 'disarray', 'structural'),

    room(basement.id, 'Rec Room', rectPoints(100, 100, 500, 350), 'hazardous', 'gutted'),
    room(basement.id, 'Storage', rectPoints(500, 100, 700, 350), 'extreme-hoarding', 'deficient'),
    room(basement.id, 'Laundry', rectPoints(100, 350, 350, 500), 'disarray', 'functional'),
  ]

  const markers: Marker[] = [
    {
      id: uid('mk'),
      floorId: main.id,
      x: 640,
      y: 160,
      icon: '🍽️',
      label: 'Dishwasher',
      notes: 'Run after dinner, unload in the morning.',
      recurrence: { everyDays: 1, lastDone: Date.now() - 36 * 3600_000 },
      updatedAt: Date.now(),
    },
    {
      id: uid('mk'),
      floorId: main.id,
      x: 160,
      y: 430,
      icon: '🐕',
      label: 'Feed the dog',
      notes: '1 scoop, 7am and 6pm.',
      recurrence: { everyDays: 1, lastDone: Date.now() - 2 * 3600_000 },
      updatedAt: Date.now(),
    },
    {
      id: uid('mk'),
      floorId: basement.id,
      x: 200,
      y: 430,
      icon: '🧺',
      label: 'Dryer vent',
      notes: 'Lint trap and duct clean-out.',
      recurrence: { everyDays: 90, lastDone: Date.now() - 120 * 86400_000 },
      updatedAt: Date.now(),
    },
    {
      id: uid('mk'),
      floorId: upstairs.id,
      x: 500,
      y: 175,
      icon: '🔧',
      label: 'Order vanity',
      notes: 'Blocking the rough-in inspection sign-off.',
      updatedAt: Date.now(),
    },
  ]

  return {
    version: STATE_VERSION,
    floors: [upstairs, main, basement],
    rooms,
    markers,
    scales,
    activeScaleId: 'cleanliness',
  }
}

const DAY = 86_400_000

export function dueAt(marker: Marker): number | undefined {
  if (!marker.recurrence || !marker.recurrence.everyDays) return undefined
  return marker.recurrence.lastDone + marker.recurrence.everyDays * DAY
}

export type DueState = 'none' | 'ok' | 'soon' | 'overdue'

export function dueState(marker: Marker, now = Date.now()): DueState {
  const due = dueAt(marker)
  if (due === undefined) return 'none'
  if (now >= due) return 'overdue'
  const window = marker.recurrence!.everyDays * DAY
  return due - now < Math.min(window * 0.2, DAY) ? 'soon' : 'ok'
}

export function formatDue(marker: Marker, now = Date.now()): string {
  const due = dueAt(marker)
  if (due === undefined) return 'One-off'
  const delta = due - now
  const days = Math.round(Math.abs(delta) / DAY)
  const hours = Math.round(Math.abs(delta) / 3600_000)
  const amount = Math.abs(delta) < DAY ? `${hours}h` : `${days}d`
  return delta >= 0 ? `Due in ${amount}` : `Overdue by ${amount}`
}

export function migrate(loaded: AppState): AppState {
  const state: AppState = { ...emptyState(), ...loaded }
  // Scale text is the source of truth; re-parse on load so an edit to the
  // parser (or a hand-edited export) always takes effect.
  state.scales = state.scales.map((s) => ({ ...s, levels: parseScale(s.source ?? '') }))
  if (!state.scales.some((s) => s.id === state.activeScaleId)) {
    state.activeScaleId = state.scales[0]?.id ?? ''
  }
  return state
}
