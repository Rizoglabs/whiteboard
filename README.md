# Whiteboard

Original whiteboard app foundation — React + TypeScript + Vite, Canvas 2D,
local-first. No Excalidraw, no collaboration, no auth, no AI, no backend.

## Architecture (separated concerns)

| Layer | Location | Responsibility |
|---|---|---|
| Geometry | `src/core/geometry.ts` | Pure 2D math: rects, points, resize handles |
| Camera | `src/core/camera.ts` | World ↔ screen transforms, zoom-at-cursor, pan |
| Scene model | `src/core/scene.ts` | Immutable document: shapes + z-order |
| History | `src/core/history.ts` | Undo/redo through document actions |
| Persistence | `src/core/persistence.ts` | IndexedDB save/load (single `main` document) |
| Renderer | `src/render/renderer.ts` | Stateless Canvas 2D drawing (grid, shapes, selection) |
| Interaction | `src/interaction/controller.ts` | Pointer state machine (framework-agnostic) |
| UI | `src/ui/` | React shell: toolbar, canvas view, status bar |

## Features

- Rectangle: create (drag), select (click / shift-click / marquee), drag-move,
  8-handle resize, delete (Del key or toolbar)
- Undo/redo via document actions (Ctrl+Z / Ctrl+Shift+Z)
- Pan (Pan tool, Space+drag, middle-drag) and zoom (wheel, toolbar)
- Autosave to IndexedDB (debounced) + restore on refresh
- Responsive layout: toolbar wraps, canvas fills, ≥40px touch targets,
  `touch-action: none` for pointer drawing on mobile

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (geometry, camera, history, persistence) |
| `npm run build` | Production build to `dist/` |

## Verification (2026-10-13)

- typecheck: PASS (`tsc --noEmit`, exit 0)
- lint: PASS (`eslint .`, exit 0)
- unit tests: 37/37 PASS (geometry 19, camera 7, history 7, persistence 4)
- build: PASS (`vite build`, exit 0)
- smoke: `vite preview` serves HTTP 200 with correct title
