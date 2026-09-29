import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { bounds, centroid, GRID, pointsToPath, rectPoints, snap, WORLD } from "../geometry";
import { contrastText, findLevel } from "../scales";
import { dueState } from "../state";
import type { Floor, ID, Marker, Point, Room, Scale, Selection, Tool } from "../types";

export interface View {
  cx: number;
  cy: number;
  zoom: number;
}

interface Props {
  floor: Floor;
  rooms: Room[];
  markers: Marker[];
  scales: Scale[];
  activeScaleId: ID;
  view: View;
  editing: boolean;
  tool: Tool;
  snapToGrid: boolean;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onPan: (dxWorld: number, dyWorld: number) => void;
  onCreateRoom: (floorId: ID, points: Point[]) => void;
  onCreateMarker: (floorId: ID, x: number, y: number) => void;
  onMoveRoom: (id: ID, dx: number, dy: number) => void;
  onSetVertex: (id: ID, index: number, point: Point) => void;
  onMoveMarker: (id: ID, x: number, y: number) => void;
  onToolDone: () => void;
}

type Drag =
  | { kind: "pan"; lastClient: Point }
  | { kind: "rect"; start: Point; end: Point }
  | { kind: "moveRoom"; id: ID; start: Point; anchor: Point; applied: Point }
  | { kind: "moveMarker"; id: ID }
  | { kind: "vertex"; id: ID; index: number }
  | null;

const CLOSE_DISTANCE = 14;

export function FloorPanel(props: Props) {
  const {
    floor,
    rooms,
    markers,
    scales,
    activeScaleId,
    view,
    editing,
    tool,
    snapToGrid,
    selection,
    onSelect,
    onPan,
    onCreateRoom,
    onCreateMarker,
    onMoveRoom,
    onSetVertex,
    onMoveMarker,
    onToolDone,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [draftRect, setDraftRect] = useState<Point[] | null>(null);
  const [poly, setPoly] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Abandon an in-progress polygon whenever the tool or floor changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacting to these is the point; the body only calls setters, so Biome reads the deps as unnecessary.
  useEffect(() => {
    setPoly([]);
    setDraftRect(null);
  }, [tool, editing, floor.id]);

  useEffect(() => {
    if (poly.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPoly([]);
      if (e.key === "Enter" && poly.length >= 3) {
        onCreateRoom(floor.id, poly);
        setPoly([]);
        onToolDone();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [poly, floor.id, onCreateRoom, onToolDone]);

  const viewWidth = WORLD.width / view.zoom;
  const viewHeight = viewWidth * (size.height / Math.max(size.width, 1));
  const viewBox = `${view.cx - viewWidth / 2} ${view.cy - viewHeight / 2} ${viewWidth} ${viewHeight}`;
  const worldPerPixel = viewWidth / Math.max(size.width, 1);

  function toWorld(clientX: number, clientY: number): Point {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const matrix = svg.getScreenCTM();
    if (!matrix) return [0, 0];
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(matrix.inverse());
    return [p.x, p.y];
  }

  function snapped(p: Point): Point {
    return [snap(p[0], snapToGrid), snap(p[1], snapToGrid)];
  }

  function onPointerDown(e: ReactPointerEvent) {
    const target = e.target as Element;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const world = toWorld(e.clientX, e.clientY);
    const roomId = target.getAttribute("data-room") ?? undefined;
    const markerId = target.getAttribute("data-marker") ?? undefined;
    const vertexIndex = target.getAttribute("data-vertex");

    if (!editing && tool === "marker") {
      const [x, y] = world;
      onCreateMarker(floor.id, x, y);
      onToolDone();
      return;
    }

    if (editing && tool === "rect") {
      dragRef.current = { kind: "rect", start: snapped(world), end: snapped(world) };
      setDraftRect(null);
      return;
    }

    if (editing && tool === "polygon") {
      const point = snapped(world);
      if (poly.length >= 3) {
        const [fx, fy] = poly[0];
        if (Math.hypot(point[0] - fx, point[1] - fy) < CLOSE_DISTANCE * worldPerPixel * 2) {
          onCreateRoom(floor.id, poly);
          setPoly([]);
          onToolDone();
          return;
        }
      }
      setPoly((current) => [...current, point]);
      return;
    }

    if (vertexIndex !== null && selection?.kind === "room") {
      dragRef.current = { kind: "vertex", id: selection.id, index: Number(vertexIndex) };
      return;
    }

    if (markerId) {
      onSelect({ kind: "marker", id: markerId });
      if (editing) dragRef.current = { kind: "moveMarker", id: markerId };
      return;
    }

    if (roomId) {
      onSelect({ kind: "room", id: roomId });
      const room = rooms.find((r) => r.id === roomId);
      if (editing && room) {
        const box = bounds(room.points);
        dragRef.current = {
          kind: "moveRoom",
          id: roomId,
          start: world,
          anchor: [box.minX, box.minY],
          applied: [0, 0],
        };
      }
      return;
    }

    onSelect({ kind: "floor", id: floor.id });
    dragRef.current = { kind: "pan", lastClient: [e.clientX, e.clientY] };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    // A pointerup released outside the window never reaches us, which would
    // otherwise leave the drag live and let plain mouse movement keep dragging.
    if (drag && e.pointerType === "mouse" && e.buttons === 0) {
      finishDrag();
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
    if (!drag) {
      if (editing && (tool === "polygon" || tool === "rect")) setHoverPoint(snapped(world));
      return;
    }

    switch (drag.kind) {
      case "pan": {
        const [lx, ly] = drag.lastClient;
        onPan((lx - e.clientX) * worldPerPixel, (ly - e.clientY) * worldPerPixel);
        drag.lastClient = [e.clientX, e.clientY];
        break;
      }
      case "rect": {
        drag.end = snapped(world);
        setDraftRect(rectPoints(drag.start[0], drag.start[1], drag.end[0], drag.end[1]));
        break;
      }
      case "moveRoom": {
        // Snap the room's top-left corner rather than the pointer delta, so a
        // room that starts on the grid stays on it however far you drag.
        const wantX = snap(drag.anchor[0] + world[0] - drag.start[0], snapToGrid);
        const wantY = snap(drag.anchor[1] + world[1] - drag.start[1], snapToGrid);
        const dx = wantX - drag.anchor[0] - drag.applied[0];
        const dy = wantY - drag.anchor[1] - drag.applied[1];
        if (dx === 0 && dy === 0) break;
        drag.applied = [drag.applied[0] + dx, drag.applied[1] + dy];
        onMoveRoom(drag.id, dx, dy);
        break;
      }
      case "moveMarker": {
        const [x, y] = snapped(world);
        onMoveMarker(drag.id, x, y);
        break;
      }
      case "vertex": {
        onSetVertex(drag.id, drag.index, snapped(world));
        break;
      }
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    finishDrag();
  }

  function finishDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind === "rect") {
      // Read the extent from the drag ref, not from React state: the pointerup
      // can land before the last pointermove has re-rendered.
      const points = rectPoints(drag.start[0], drag.start[1], drag.end[0], drag.end[1]);
      setDraftRect(null);
      if (Math.abs(drag.end[0] - drag.start[0]) > 8 && Math.abs(drag.end[1] - drag.start[1]) > 8) {
        onCreateRoom(floor.id, points);
        onToolDone();
      }
    }
  }

  function onDoubleClick() {
    if (editing && tool === "polygon" && poly.length >= 3) {
      onCreateRoom(floor.id, poly);
      setPoly([]);
      onToolDone();
    }
  }

  const activeScale = scales.find((s) => s.id === activeScaleId);
  const accentScales = scales.filter((s) => s.id !== activeScaleId);
  const selectedRoom =
    selection?.kind === "room" ? rooms.find((r) => r.id === selection.id) : undefined;
  const crosshair = editing && (tool === "rect" || tool === "polygon");
  // Markers, handles and labels are sized in screen pixels, converted to world
  // units, so they stay legible at every zoom level.
  const px = worldPerPixel;
  const markerRadius = 15 * px;

  return (
    <section
      className={`floor-panel${selection?.kind === "floor" && selection.id === floor.id ? " is-active" : ""}`}
    >
      <header className="floor-panel__title">
        <span>{floor.name}</span>
        <span className="floor-panel__count">
          {rooms.length} rooms · {markers.length} markers
        </span>
      </header>
      <div className="floor-panel__canvas" ref={wrapRef}>
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className={crosshair ? "is-crosshair" : tool === "marker" ? "is-placing" : ""}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          <defs>
            <pattern
              id={`grid-${floor.id}`}
              width={GRID}
              height={GRID}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
            </pattern>
            <pattern
              id={`unset-${floor.id}`}
              width="10"
              height="10"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="10" height="10" fill="#39414f" />
              <line x1="0" y1="0" x2="0" y2="10" stroke="#4b5563" strokeWidth="4" />
            </pattern>
          </defs>

          <rect
            x={view.cx - viewWidth / 2}
            y={view.cy - viewHeight / 2}
            width={viewWidth}
            height={viewHeight}
            fill={`url(#grid-${floor.id})`}
          />

          {floor.background && (
            <image
              href={floor.background.src}
              x={floor.background.x}
              y={floor.background.y}
              width={floor.background.naturalWidth * floor.background.scale}
              height={floor.background.naturalHeight * floor.background.scale}
              opacity={floor.background.opacity}
              preserveAspectRatio="none"
              style={{ pointerEvents: "none" }}
            />
          )}

          {rooms.map((room) => {
            const level = findLevel(activeScale, room.status[activeScaleId]);
            const fill = level?.color ?? `url(#unset-${floor.id})`;
            const accents = accentScales
              .map((scale) => findLevel(scale, room.status[scale.id]))
              .filter(Boolean);
            const accent = accents[0];
            const isSelected = selection?.kind === "room" && selection.id === room.id;
            const [cx, cy] = centroid(room.points);
            const textColor = level ? contrastText(level.color) : "#e8ecf4";
            return (
              <g key={room.id} className="room">
                <polygon
                  data-room={room.id}
                  points={pointsToPath(room.points)}
                  fill={fill}
                  fillOpacity={level ? 0.82 : 1}
                  stroke={isSelected ? "#ffffff" : accent ? accent.color : "rgba(255,255,255,0.35)"}
                  strokeWidth={(isSelected ? 3 : accent ? 4.5 : 1.2) * px}
                  strokeLinejoin="round"
                />
                {accent && (
                  // Inner hairline keeps the accent readable against the fill.
                  <polygon
                    points={pointsToPath(room.points)}
                    fill="none"
                    stroke="rgba(10,12,16,0.55)"
                    strokeWidth={1.2 * px}
                    style={{ pointerEvents: "none" }}
                  />
                )}
                <text
                  x={cx}
                  y={cy - 3 * px}
                  className="room__name"
                  textAnchor="middle"
                  fill={textColor}
                  fontSize={15 * px}
                  strokeWidth={3 * px}
                  style={{ pointerEvents: "none" }}
                >
                  {room.name}
                </text>
                <text
                  x={cx}
                  y={cy + 14 * px}
                  className="room__chips"
                  textAnchor="middle"
                  fill={textColor}
                  fontSize={11.5 * px}
                  strokeWidth={2.5 * px}
                  style={{ pointerEvents: "none" }}
                >
                  {level ? `${level.icon} ${level.label}` : "— unset —"}
                </text>
                {accent && (
                  <text
                    x={cx}
                    y={cy + 28 * px}
                    className="room__chips room__chips--accent"
                    textAnchor="middle"
                    fill={textColor}
                    fontSize={10.5 * px}
                    strokeWidth={2.5 * px}
                    style={{ pointerEvents: "none" }}
                  >
                    {accent.icon} {accent.label}
                  </text>
                )}
                {room.notes.trim() && (
                  <text
                    x={cx}
                    y={cy - 22 * px}
                    textAnchor="middle"
                    fontSize={12 * px}
                    style={{ pointerEvents: "none" }}
                  >
                    📝
                  </text>
                )}
              </g>
            );
          })}

          {selectedRoom &&
            editing &&
            tool === "select" &&
            selectedRoom.points.map(([x, y], index) => (
              <circle
                key={index}
                data-vertex={index}
                cx={x}
                cy={y}
                r={7 * px}
                className="vertex-handle"
                strokeWidth={2 * px}
              />
            ))}

          {draftRect && (
            <polygon
              points={pointsToPath(draftRect)}
              className="draft"
              strokeWidth={2.5 * px}
              strokeDasharray={`${8 * px} ${6 * px}`}
            />
          )}

          {poly.length > 0 && (
            <g className="draft-poly">
              <polyline
                points={pointsToPath(hoverPoint ? [...poly, hoverPoint] : poly)}
                fill="rgba(96,165,250,0.15)"
                stroke="#60a5fa"
                strokeWidth={2.5 * px}
                strokeDasharray={`${8 * px} ${6 * px}`}
              />
              {poly.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={5 * px} fill={i === 0 ? "#f8fafc" : "#60a5fa"} />
              ))}
            </g>
          )}

          {markers.map((marker) => {
            const due = dueState(marker);
            const isSelected = selection?.kind === "marker" && selection.id === marker.id;
            return (
              <g key={marker.id} className={`marker marker--${due}`}>
                <circle
                  data-marker={marker.id}
                  cx={marker.x}
                  cy={marker.y}
                  r={markerRadius}
                  className="marker__disc"
                  stroke={isSelected ? "#ffffff" : undefined}
                  strokeWidth={(due === "overdue" ? 3.5 : 2.5) * px}
                />
                <text
                  x={marker.x}
                  y={marker.y + markerRadius * 0.35}
                  textAnchor="middle"
                  fontSize={markerRadius * 1.1}
                  style={{ pointerEvents: "none" }}
                >
                  {marker.icon}
                </text>
                {due === "overdue" && (
                  <circle
                    cx={marker.x + markerRadius * 0.78}
                    cy={marker.y - markerRadius * 0.78}
                    r={markerRadius * 0.34}
                    fill="#ef4444"
                    stroke="#0f1116"
                    strokeWidth={1.5 * px}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
