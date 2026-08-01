# House Status

A one-page floorplan dashboard for a household: draw (or upload) your floorplan,
outline each room, and colour every room by two independent status scales —
how clean it is, and how far along a renovation is. Add markers for appliances,
chores and pets that need doing on a schedule.

Everything runs in the browser. State and uploaded floorplan images live in
IndexedDB on the device; there is no account, no server, and no network call.

## Running it

```bash
npm install && npm run dev
```

Build a static bundle with `npm run build` — the `dist/` folder is plain files
and can be served from anywhere (it uses relative asset paths, so a subpath
works too). `npm run preview` serves the build on your LAN.

### Docker

```bash
docker compose up -d --build
```

Serves the built PWA on <http://localhost:8088> from a single nginx image with
no runtime state. On Proxmox VE, run the same image in an LXC or VM, or just
copy `dist/` onto any existing web server.

## Using it

**Normal mode** (the default) is for the daily loop:

- Tap a room to open it — set its status on each scale, add notes and
  instructions, see when it last changed.
- Tap a marker to update it, adjust its repeat interval, or mark it done.
- **+ Add marker** places a new marker without leaving normal mode: press it,
  then tap anywhere on any level.
- The **Cleanliness / Construction** toggle picks which scale fills the rooms;
  the other scale is drawn as the room's border colour, so both are visible at
  once. Every room also prints both labels.
- **Tasks** lists every marker, overdue first, with a one-tap done button.

**Edit mode** (the switch, top right) is for building the plan:

- ▭ drag a rectangle, ⬠ click polygon corners and click the first corner (or
  press Enter) to close, Esc to cancel.
- ➚ select: drag a room to move it, drag its corner handles to reshape, drag a
  marker to reposition it. Delete removes the selection.
- Click a level's empty background to open its settings: rename, reorder, and
  upload a floorplan image to trace over (with scale, offset and opacity).
- **+ Level** adds a floor. All levels stay visible at once and share one
  pan/zoom, so they line up with each other.

## Status scales

The two default scales are the ones from the spec. Edit them under **⋯ → Status
scales**, one level per line:

```
🟡 Disarray: Overflowing drawers, doom piles, and partially blocked paths.
```

The colour comes from the icon (🟢 🟡 🟠 🔴 🔵 🟣 🟤 ⚪ ⚫). If a scale uses the
same icon twice, the later one is drawn a shade deeper so the steps stay
distinguishable. Put a hex code like `#3b82f6` anywhere on the line to set the
colour by hand. Add or remove whole scales too — rooms carry a status per scale,
and the first scale is the default fill.

A level's id is derived from its label, so renaming `Disarray` to `Chaos`
detaches rooms that were set to it; changing only the description or icon is
safe.

## Data

- Stored in IndexedDB under the origin serving the app. Different origins
  (`localhost:5273` vs. `house.lan`) are different databases.
- **⋯ → Export JSON** writes the whole house — levels, rooms, markers, scales,
  and the embedded floorplan images — to one file. Import replaces the current
  state, which is also how you move a plan to another device or share it with
  the family.
- **Start over** erases the local database.

## Layout

```
src/
  App.tsx                  layout, modes, keyboard, export/import
  state.ts                 reducer, sample house, due-date maths
  scales.ts                scale text parser and colour derivation
  storage.ts               IndexedDB, file reads, JSON download
  geometry.ts              world coordinates, polygons, hit testing
  components/
    FloorPanel.tsx         one level: SVG canvas, drawing and pointer handling
    Inspector.tsx          room / marker / level side panel
    ScaleSettings.tsx      the scale editor
```

All levels render into a shared world coordinate space (1000 × 750 units) and
share one view (`{cx, cy, zoom}`), which is what makes them pan and zoom
together.

## Not built yet

- Sync between devices — the export/import round trip is the current answer.
  A Home Assistant add-on that persists the same JSON blob server-side is the
  intended next step; the state shape is already a single serialisable object.
- Undo/redo.
- Rotating or skewing an uploaded floorplan image (scale and offset only).
