# Agent notes — House Status

A single-page floorplan dashboard. Everything runs in the browser: no account,
no server, no network call. State and uploaded floorplan images live in
IndexedDB on the device.

## Commands

`mise` is the task entry point and pins the toolchain. `mise run setup` once,
then:

| Purpose | Command |
|---|---|
| Dev server | `mise run dev` (always port 5273; fails if taken) |
| Production build | `mise run build` |
| Serve the build on the LAN | `mise run preview` |
| Lint | `mise run lint` |
| Format and apply safe fixes | `mise run format` |
| Typecheck | `mise run typecheck` |
| Tests | `mise run test`, `mise run test:watch` |
| The gate | `mise run check` (lint, typecheck, test) |

`mise run check` is what the pre-commit hook and CI both run. The `package.json`
scripts still work (`npm run dev`, `npm run build`, `npm run preview`) and the
mise tasks delegate to them, so there is one definition of each command.

## Stack

Vite 8, React 19, TypeScript 7, Biome 2 for lint and format, Vitest 5. No
router, no state library, no CSS framework: the app is one `App.tsx` with a
`useReducer` store in `src/state.ts` and three components. Keep it that way
unless there is a reason not to.

## Constraints

**Do not change the IndexedDB contract.** `src/storage.ts` opens database
`house-status` version 1, object store `state`, key `app`. Those names are
load-bearing for every existing user's saved floorplan; renaming one silently
loses their data. The same goes for the service worker's cache name in
`public/sw.js`.

Asset paths are relative (`base: './'` in `vite.config.ts`) so the build serves
from any subpath — a static host, the Docker image, or a Home Assistant ingress
panel. Do not make them absolute.

## Conventions

- Conventional Commits, enforced by `.githooks/commit-msg`. One logical change
  per commit.
- Biome owns formatting. Do not hand-format; run `mise run format`.
- `biome.json` must stay comment-free. Biome accepts JSON only, and a comment
  makes it silently fall back to defaults rather than reporting an error.
- Two lint rules are relaxed deliberately. `noArrayIndexKey` is off for
  `FloorPanel.tsx`, where a vertex is identified by its position in the polygon
  and `data-vertex` uses that index for hit-testing. One
  `useExhaustiveDependencies` report is suppressed inline on the effect that
  abandons an in-progress polygon, whose dependencies are the point of the
  effect.
- The remaining `noNonNullAssertion` and `useOptionalChain` reports are
  warnings, not errors. Biome's suggested fixes for them are marked unsafe and
  are wrong here: `marker.recurrence?.everyDays * DAY` does not typecheck.
