import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { AppState, ID, Point, Selection, Tool } from './types'
import { emptyState, migrate, reducer, sampleState, dueState, formatDue } from './state'
import { clearState, downloadJSON, loadState, readFileAsText, saveState } from './storage'
import { WORLD, polygonArea, uid } from './geometry'
import { contrastText } from './scales'
import { FloorPanel, type View } from './components/FloorPanel'
import { Inspector } from './components/Inspector'
import { ScaleSettings } from './components/ScaleSettings'

const INITIAL_VIEW: View = { cx: WORLD.width / 2, cy: WORLD.height / 2, zoom: 1 }

/**
 * Frames everything that's been drawn, across all levels at once — the levels
 * share one view, so "fit" means fit the union of their contents.
 */
function fitView(state: AppState): View {
  const xs: number[] = []
  const ys: number[] = []
  for (const room of state.rooms) {
    for (const [x, y] of room.points) {
      xs.push(x)
      ys.push(y)
    }
  }
  for (const marker of state.markers) {
    xs.push(marker.x)
    ys.push(marker.y)
  }
  for (const floor of state.floors) {
    if (!floor.background) continue
    const { x, y, scale, naturalWidth, naturalHeight } = floor.background
    xs.push(x, x + naturalWidth * scale)
    ys.push(y, y + naturalHeight * scale)
  }
  if (xs.length === 0) return INITIAL_VIEW

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  // Panels are roughly 4:3, so compare the content's height against that.
  const width = Math.max(maxX - minX, 60) * 1.12
  const height = Math.max(maxY - minY, 60) * 1.12
  const zoom = Math.min(3, Math.max(0.3, WORLD.width / Math.max(width, height * (4 / 3))))
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, zoom }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, emptyState)
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [selection, setSelection] = useState<Selection>(null)
  const [view, setView] = useState<View>(INITIAL_VIEW)
  const [showScales, setShowScales] = useState(false)
  const [showTasks, setShowTasks] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void loadState().then((saved) => {
      if (cancelled) return
      const next = saved ? migrate(saved) : sampleState()
      dispatch({ type: 'replace', state: next })
      setView(fitView(next))
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced persistence — typing in a notes field shouldn't hammer IndexedDB.
  useEffect(() => {
    if (!ready) return
    const id = window.setTimeout(() => void saveState(state), 400)
    return () => window.clearTimeout(id)
  }, [state, ready])

  useEffect(() => {
    if (!editing) setTool('select')
  }, [editing])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select')) return
      if (e.key === 'Escape') {
        setSelection(null)
        setTool('select')
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        if (selection.kind === 'room' && editing) dispatch({ type: 'removeRoom', id: selection.id })
        if (selection.kind === 'marker') dispatch({ type: 'removeMarker', id: selection.id })
        if (selection.kind !== 'floor') setSelection(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, editing])

  const activeScale = state.scales.find((s) => s.id === state.activeScaleId)

  const onPan = useCallback((dx: number, dy: number) => {
    setView((v) => ({ ...v, cx: v.cx + dx, cy: v.cy + dy }))
  }, [])

  const onCreateRoom = useCallback(
    (floorId: ID, points: Point[]) => {
      if (polygonArea(points) < 100) return
      const id = uid('room')
      const count = state.rooms.filter((r) => r.floorId === floorId).length + 1
      dispatch({
        type: 'addRoom',
        room: {
          id,
          floorId,
          name: `Room ${count}`,
          points,
          status: {},
          notes: '',
          updatedAt: Date.now(),
        },
      })
      setSelection({ kind: 'room', id })
    },
    [state.rooms],
  )

  const onCreateMarker = useCallback((floorId: ID, x: number, y: number) => {
    const id = uid('mk')
    dispatch({
      type: 'addMarker',
      marker: { id, floorId, x, y, icon: '⭐', label: 'New marker', notes: '', updatedAt: Date.now() },
    })
    setSelection({ kind: 'marker', id })
  }, [])

  const onMoveRoom = useCallback((id: ID, dx: number, dy: number) => {
    dispatch({ type: 'nudgeRoom', id, dx, dy })
  }, [])

  const onSetVertex = useCallback(
    (id: ID, index: number, point: Point) => {
      const room = state.rooms.find((r) => r.id === id)
      if (!room) return
      const points = room.points.map((p, i) => (i === index ? point : p))
      dispatch({ type: 'updateRoom', id, patch: { points } })
    },
    [state.rooms],
  )

  const onMoveMarker = useCallback((id: ID, x: number, y: number) => {
    dispatch({ type: 'updateMarker', id, patch: { x, y } })
  }, [])

  const onToolDone = useCallback(() => setTool('select'), [])

  const tasks = useMemo(() => {
    const rank = { overdue: 0, soon: 1, ok: 2, none: 3 }
    return [...state.markers]
      .map((m) => ({ marker: m, due: dueState(m) }))
      .sort((a, b) => rank[a.due] - rank[b.due] || a.marker.label.localeCompare(b.marker.label))
  }, [state.markers])

  const overdueCount = tasks.filter((t) => t.due === 'overdue').length

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const room of state.rooms) {
      const key = room.status[state.activeScaleId] ?? '—'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [state.rooms, state.activeScaleId])

  async function onImport(file: File | undefined) {
    if (!file) return
    try {
      const parsed = JSON.parse(await readFileAsText(file)) as AppState
      if (!parsed.floors || !parsed.scales) throw new Error('Not a House Status export')
      dispatch({ type: 'replace', state: migrate(parsed) })
      setSelection(null)
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`)
    }
  }

  return (
    <div
      className={`app${editing ? ' is-editing' : ''}${selection || showTasks ? ' has-panel' : ''}`}
      onPointerDown={() => setMenuOpen(false)}
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">🏠</span>
          <span className="brand__name">House Status</span>
        </div>

        <div className="segmented" role="tablist" aria-label="Colour rooms by">
          {state.scales.map((scale) => (
            <button
              key={scale.id}
              role="tab"
              aria-selected={scale.id === state.activeScaleId}
              className={`segmented__btn${scale.id === state.activeScaleId ? ' is-active' : ''}`}
              onClick={() => dispatch({ type: 'setActiveScale', scaleId: scale.id })}
            >
              {scale.name}
            </button>
          ))}
        </div>

        <div className="topbar__spacer" />

        <button className={`ghost-btn${showTasks ? ' is-active' : ''}`} onClick={() => setShowTasks((v) => !v)}>
          Tasks{overdueCount > 0 && <span className="badge">{overdueCount}</span>}
        </button>

        <div className="menu-wrap" onPointerDown={(e) => e.stopPropagation()}>
          <button className="ghost-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="More">
            ⋯
          </button>
          {menuOpen && (
            <div className="menu">
              <button onClick={() => { setShowScales(true); setMenuOpen(false) }}>Status scales…</button>
              <button onClick={() => { dispatch({ type: 'addFloor' }); setMenuOpen(false) }}>Add level</button>
              <hr />
              <button onClick={() => { downloadJSON(state, `house-status-${new Date().toISOString().slice(0, 10)}.json`); setMenuOpen(false) }}>
                Export JSON
              </button>
              <button onClick={() => { importRef.current?.click(); setMenuOpen(false) }}>Import JSON…</button>
              <hr />
              <button onClick={() => { dispatch({ type: 'replace', state: sampleState() }); setSelection(null); setMenuOpen(false) }}>
                Load sample house
              </button>
              <button
                className="is-danger"
                onClick={() => {
                  if (confirm('Erase every level, room, marker and note on this device?')) {
                    void clearState()
                    dispatch({ type: 'replace', state: emptyState() })
                    setSelection(null)
                  }
                  setMenuOpen(false)
                }}
              >
                Start over
              </button>
            </div>
          )}
        </div>

        <label className="switch">
          <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
          <span className="switch__track"><span className="switch__thumb" /></span>
          <span className="switch__label">Edit</span>
        </label>
      </header>

      <input
        ref={importRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          void onImport(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {editing && (
        <div className="editbar">
          <div className="tool-group">
            <ToolButton tool="select" current={tool} onSelect={setTool} label="Select / move" icon="➚" />
            <ToolButton tool="rect" current={tool} onSelect={setTool} label="Rectangle room" icon="▭" />
            <ToolButton tool="polygon" current={tool} onSelect={setTool} label="Polygon room" icon="⬠" />
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
            Snap to grid
          </label>
          <button className="ghost-btn" onClick={() => dispatch({ type: 'addFloor' })}>
            + Level
          </button>
          <span className="hint hint--inline">
            {tool === 'polygon'
              ? 'Click to add corners, click the first corner (or press Enter) to close, Esc to cancel.'
              : tool === 'rect'
                ? 'Drag on a level to draw a room.'
                : 'Drag a room to move it, drag its handles to reshape. Click a level’s background to set its floorplan image.'}
          </span>
        </div>
      )}

      <main className="floors">
        {state.floors.map((floor) => (
          <FloorPanel
            key={floor.id}
            floor={floor}
            rooms={state.rooms.filter((r) => r.floorId === floor.id)}
            markers={state.markers.filter((m) => m.floorId === floor.id)}
            scales={state.scales}
            activeScaleId={state.activeScaleId}
            view={view}
            editing={editing}
            tool={tool}
            snapToGrid={snapToGrid}
            selection={selection}
            onSelect={setSelection}
            onPan={onPan}
            onCreateRoom={onCreateRoom}
            onCreateMarker={onCreateMarker}
            onMoveRoom={onMoveRoom}
            onSetVertex={onSetVertex}
            onMoveMarker={onMoveMarker}
            onToolDone={onToolDone}
          />
        ))}
        {state.floors.length === 0 && (
          <div className="empty">
            <p>No levels yet.</p>
            <button className="primary-btn" onClick={() => dispatch({ type: 'addFloor' })}>
              Add a level
            </button>
          </div>
        )}
      </main>

      <div className="viewport-tools">
        <button className="round-btn" onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.3, v.zoom / 1.25) }))} aria-label="Zoom out">
          −
        </button>
        <button className="round-btn" onClick={() => setView(fitView(state))} aria-label="Fit to contents">
          ⤢
        </button>
        <button className="round-btn" onClick={() => setView((v) => ({ ...v, zoom: Math.min(6, v.zoom * 1.25) }))} aria-label="Zoom in">
          +
        </button>
      </div>

      {!editing && (
        <button
          className={`fab${tool === 'marker' ? ' is-armed' : ''}`}
          onClick={() => setTool((t) => (t === 'marker' ? 'select' : 'marker'))}
        >
          {tool === 'marker' ? '✕' : '+'}
          <span className="fab__label">{tool === 'marker' ? 'Tap a level to place' : 'Add marker'}</span>
        </button>
      )}

      <footer className="legend">
        <span className="legend__title">{activeScale?.name}</span>
        {activeScale?.levels.map((level) => (
          <span
            key={level.id}
            className="legend__chip"
            title={level.desc}
            style={{ background: level.color, color: contrastText(level.color) }}
          >
            {level.icon} {level.label}
            <em>{counts.get(level.id) ?? 0}</em>
          </span>
        ))}
        <span className="legend__chip legend__chip--unset">
          Unset<em>{counts.get('—') ?? 0}</em>
        </span>
      </footer>

      {showTasks && (
        <aside className="tasks">
          <header className="inspector__head">
            <h2>Tasks &amp; markers</h2>
            <button className="icon-btn" onClick={() => setShowTasks(false)} aria-label="Close">
              ✕
            </button>
          </header>
          <div className="inspector__body">
            {tasks.length === 0 && <p className="hint">No markers yet. Use the + button to place one.</p>}
            {tasks.map(({ marker, due }) => (
              <button
                key={marker.id}
                className={`task-row task-row--${due}`}
                onClick={() => setSelection({ kind: 'marker', id: marker.id })}
              >
                <span className="task-row__icon">{marker.icon}</span>
                <span className="task-row__text">
                  <strong>{marker.label}</strong>
                  <em>
                    {state.floors.find((f) => f.id === marker.floorId)?.name} · {formatDue(marker)}
                  </em>
                </span>
                {marker.recurrence && (
                  <span
                    className="task-row__done"
                    onClick={(e) => {
                      e.stopPropagation()
                      dispatch({ type: 'markerDone', id: marker.id })
                    }}
                  >
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>
      )}

      <Inspector
        state={state}
        selection={selection}
        editing={editing}
        dispatch={dispatch}
        onClose={() => setSelection(null)}
      />

      {showScales && (
        <ScaleSettings
          scales={state.scales}
          onSave={(scales) => dispatch({ type: 'setScales', scales })}
          onClose={() => setShowScales(false)}
        />
      )}
    </div>
  )
}

function ToolButton({
  tool,
  current,
  onSelect,
  label,
  icon,
}: {
  tool: Tool
  current: Tool
  onSelect: (t: Tool) => void
  label: string
  icon: string
}) {
  return (
    <button
      className={`tool-btn${current === tool ? ' is-active' : ''}`}
      onClick={() => onSelect(tool)}
      title={label}
      aria-label={label}
    >
      <span aria-hidden>{icon}</span>
    </button>
  )
}
