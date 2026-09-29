import { type ReactNode, useRef } from "react";
import { WORLD } from "../geometry";
import { contrastText, findLevel } from "../scales";
import type { Action } from "../state";
import { dueState, formatDue } from "../state";
import { imageSize, readFileAsDataURL } from "../storage";
import type { AppState, Floor, Marker, Room, Selection } from "../types";

const QUICK_ICONS = [
  "🧺",
  "🍽️",
  "🗑️",
  "🧹",
  "🐕",
  "🐈",
  "🐟",
  "🌱",
  "🔧",
  "🪛",
  "🔌",
  "💡",
  "🚿",
  "🚽",
  "❄️",
  "🔥",
  "🧴",
  "📦",
  "⭐",
  "🛏️",
  "🧯",
  "🪟",
  "🧊",
  "📬",
];

interface Props {
  state: AppState;
  selection: Selection;
  editing: boolean;
  dispatch: (action: Action) => void;
  onClose: () => void;
}

export function Inspector({ state, selection, editing, dispatch, onClose }: Props) {
  if (!selection) return null;

  if (selection.kind === "room") {
    const room = state.rooms.find((r) => r.id === selection.id);
    if (!room) return null;
    return (
      <Panel title="Room" onClose={onClose}>
        <RoomBody
          state={state}
          room={room}
          editing={editing}
          dispatch={dispatch}
          onClose={onClose}
        />
      </Panel>
    );
  }

  if (selection.kind === "marker") {
    const marker = state.markers.find((m) => m.id === selection.id);
    if (!marker) return null;
    return (
      <Panel title="Marker" onClose={onClose}>
        <MarkerBody marker={marker} dispatch={dispatch} onClose={onClose} />
      </Panel>
    );
  }

  const floor = state.floors.find((f) => f.id === selection.id);
  if (!floor || !editing) return null;
  return (
    <Panel title="Level" onClose={onClose}>
      <FloorBody state={state} floor={floor} dispatch={dispatch} onClose={onClose} />
    </Panel>
  );
}

function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="inspector">
      <header className="inspector__head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="inspector__body">{children}</div>
    </aside>
  );
}

function RoomBody({
  state,
  room,
  editing,
  dispatch,
  onClose,
}: {
  state: AppState;
  room: Room;
  editing: boolean;
  dispatch: (a: Action) => void;
  onClose: () => void;
}) {
  return (
    <>
      <label className="field">
        <span>Name</span>
        <input
          value={room.name}
          placeholder="Untitled room"
          onChange={(e) =>
            dispatch({ type: "updateRoom", id: room.id, patch: { name: e.target.value } })
          }
        />
      </label>

      {state.scales.map((scale) => {
        const current = findLevel(scale, room.status[scale.id]);
        return (
          <div className="field" key={scale.id}>
            <span>{scale.name}</span>
            <div className="status-grid">
              {scale.levels.map((level) => {
                const active = current?.id === level.id;
                return (
                  <button
                    key={level.id}
                    className={`status-chip${active ? " is-active" : ""}`}
                    title={level.desc}
                    style={
                      active
                        ? {
                            background: level.color,
                            color: contrastText(level.color),
                            borderColor: level.color,
                          }
                        : { borderColor: level.color, color: "#dbe2ef" }
                    }
                    onClick={() =>
                      dispatch({
                        type: "setRoomStatus",
                        id: room.id,
                        scaleId: scale.id,
                        levelId: active ? undefined : level.id,
                      })
                    }
                  >
                    <span className="status-chip__icon">{level.icon}</span>
                    {level.label}
                  </button>
                );
              })}
            </div>
            {current?.desc && <p className="hint">{current.desc}</p>}
          </div>
        );
      })}

      <label className="field">
        <span>Notes &amp; instructions</span>
        <textarea
          rows={4}
          value={room.notes}
          placeholder="e.g. Sort the mail pile before Sunday. Don't move the paint cans."
          onChange={(e) =>
            dispatch({ type: "updateRoom", id: room.id, patch: { notes: e.target.value } })
          }
        />
      </label>

      <p className="hint">Updated {new Date(room.updatedAt).toLocaleString()}</p>

      {editing && (
        <button
          className="danger-btn"
          onClick={() => {
            dispatch({ type: "removeRoom", id: room.id });
            onClose();
          }}
        >
          Delete room
        </button>
      )}
    </>
  );
}

function MarkerBody({
  marker,
  dispatch,
  onClose,
}: {
  marker: Marker;
  dispatch: (a: Action) => void;
  onClose: () => void;
}) {
  const recurring = !!marker.recurrence?.everyDays;
  const due = dueState(marker);
  return (
    <>
      <label className="field">
        <span>Label</span>
        <input
          value={marker.label}
          placeholder="Feed the cat"
          onChange={(e) =>
            dispatch({ type: "updateMarker", id: marker.id, patch: { label: e.target.value } })
          }
        />
      </label>

      <div className="field">
        <span>Icon</span>
        <div className="icon-grid">
          {QUICK_ICONS.map((icon) => (
            <button
              key={icon}
              className={`icon-choice${marker.icon === icon ? " is-active" : ""}`}
              onClick={() => dispatch({ type: "updateMarker", id: marker.id, patch: { icon } })}
            >
              {icon}
            </button>
          ))}
        </div>
        <input
          className="icon-custom"
          value={marker.icon}
          maxLength={3}
          aria-label="Custom icon"
          onChange={(e) =>
            dispatch({ type: "updateMarker", id: marker.id, patch: { icon: e.target.value } })
          }
        />
      </div>

      <div className="field">
        <span>Repeat</span>
        <div className="row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) =>
                dispatch({
                  type: "updateMarker",
                  id: marker.id,
                  patch: {
                    recurrence: e.target.checked
                      ? { everyDays: marker.recurrence?.everyDays || 7, lastDone: Date.now() }
                      : undefined,
                  },
                })
              }
            />
            Recurring
          </label>
          {recurring && (
            <>
              <span className="muted">every</span>
              <input
                className="num"
                type="number"
                min={1}
                value={marker.recurrence!.everyDays}
                onChange={(e) =>
                  dispatch({
                    type: "updateMarker",
                    id: marker.id,
                    patch: {
                      recurrence: {
                        everyDays: Math.max(1, Number(e.target.value) || 1),
                        lastDone: marker.recurrence!.lastDone,
                      },
                    },
                  })
                }
              />
              <span className="muted">days</span>
            </>
          )}
        </div>
        {recurring && (
          <div className="row">
            <span className={`due-badge due-badge--${due}`}>{formatDue(marker)}</span>
            <button
              className="ghost-btn"
              onClick={() => dispatch({ type: "markerDone", id: marker.id })}
            >
              Mark done now
            </button>
          </div>
        )}
      </div>

      <label className="field">
        <span>Notes &amp; instructions</span>
        <textarea
          rows={4}
          value={marker.notes}
          placeholder="1 scoop of dry food, fresh water."
          onChange={(e) =>
            dispatch({ type: "updateMarker", id: marker.id, patch: { notes: e.target.value } })
          }
        />
      </label>

      <button
        className="danger-btn"
        onClick={() => {
          dispatch({ type: "removeMarker", id: marker.id });
          onClose();
        }}
      >
        Delete marker
      </button>
    </>
  );
}

function FloorBody({
  state,
  floor,
  dispatch,
  onClose,
}: {
  state: AppState;
  floor: Floor;
  dispatch: (a: Action) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = floor.background;

  async function onPick(file: File | undefined) {
    if (!file) return;
    const src = await readFileAsDataURL(file);
    const { width, height } = await imageSize(src);
    // Fit the image inside the world box on import so it lands somewhere visible.
    const scale = Math.min((WORLD.width * 0.9) / width, (WORLD.height * 0.9) / height);
    dispatch({
      type: "setBackground",
      floorId: floor.id,
      background: {
        src,
        x: (WORLD.width - width * scale) / 2,
        y: (WORLD.height - height * scale) / 2,
        scale,
        opacity: 0.75,
        naturalWidth: width,
        naturalHeight: height,
      },
    });
  }

  function patchBg(patch: Partial<NonNullable<Floor["background"]>>) {
    if (!bg) return;
    dispatch({ type: "setBackground", floorId: floor.id, background: { ...bg, ...patch } });
  }

  const index = state.floors.findIndex((f) => f.id === floor.id);

  return (
    <>
      <label className="field">
        <span>Level name</span>
        <input
          value={floor.name}
          onChange={(e) =>
            dispatch({ type: "updateFloor", id: floor.id, patch: { name: e.target.value } })
          }
        />
      </label>

      <div className="field">
        <span>Order</span>
        <div className="row">
          <button
            className="ghost-btn"
            disabled={index <= 0}
            onClick={() => dispatch({ type: "moveFloor", id: floor.id, direction: -1 })}
          >
            ↑ Move up
          </button>
          <button
            className="ghost-btn"
            disabled={index >= state.floors.length - 1}
            onClick={() => dispatch({ type: "moveFloor", id: floor.id, direction: 1 })}
          >
            ↓ Move down
          </button>
        </div>
      </div>

      <div className="field">
        <span>Floorplan image</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void onPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="row">
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
            {bg ? "Replace image" : "Upload image"}
          </button>
          {bg && (
            <button
              className="ghost-btn"
              onClick={() => dispatch({ type: "setBackground", floorId: floor.id })}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {bg && (
        <>
          <Slider
            label="Scale"
            value={bg.scale}
            min={0.05}
            max={3}
            step={0.01}
            onChange={(scale) => patchBg({ scale })}
          />
          <Slider
            label="Opacity"
            value={bg.opacity}
            min={0.05}
            max={1}
            step={0.05}
            onChange={(opacity) => patchBg({ opacity })}
          />
          <Slider
            label="Offset X"
            value={bg.x}
            min={-500}
            max={1500}
            step={5}
            onChange={(x) => patchBg({ x })}
          />
          <Slider
            label="Offset Y"
            value={bg.y}
            min={-500}
            max={1500}
            step={5}
            onChange={(y) => patchBg({ y })}
          />
        </>
      )}

      {state.floors.length > 1 && (
        <button
          className="danger-btn"
          onClick={() => {
            if (confirm(`Delete "${floor.name}" and everything on it?`)) {
              dispatch({ type: "removeFloor", id: floor.id });
              onClose();
            }
          }}
        >
          Delete level
        </button>
      )}
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>
        {label} <em className="muted">{value.toFixed(2)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
