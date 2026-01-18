# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **frontend** directory of Manju Flow. See `../CLAUDE.md` for full project documentation including backend, data models, and API routes.

## Development Commands

```bash
pnpm dev      # Start Vite dev server on port 3000
pnpm build    # Production build to dist/
pnpm preview  # Preview production build locally
```

No test or lint commands are configured. Verify changes with `pnpm build`.

## Architecture

### Application Flow
`App.tsx` manages two view modes:
- **DASHBOARD**: Book library with filtering, search, CRUD operations
- **PRODUCTION**: Six-stage workflow (Outline → Script → Art → Animate → Audio → Review)

Editor components are lazy-loaded via `React.lazy()` for code splitting.

### Cross-Module State Sync
When switching between production stages, chapter and scene selection persists via:
- `activeChapterId` / `activeSceneId` state in `App.tsx`
- `initialChapterId` / `initialSceneId` props passed to editors
- `onActiveChapterChange` / `onActiveSceneChange` callbacks for updates

### File Organization
- `api.ts`: All backend API calls with typed responses; includes global signed URL cache
- `types.ts`: TypeScript interfaces for Project, Episode, Scene, Comment, etc.
- `constants.tsx`: STAGE_CONFIG, STATUS_MAP, DEFAULT_SCENE_THUMB
- `components/`: Editor components and shared UI

### Custom Hooks
- `useSceneComments.ts`: Scene comment CRUD with module-specific filtering
- `useFileUrl.ts`: OSS file URL resolution with caching
- `usePanelResize.ts`: Draggable panel width adjustment
- `useScriptEditorReducer.ts`: State reducer for ScriptEditor

### File Uploads
1. Upload via `fileApi.upload()` or `fileApi.uploadWithProgress()` → returns `{ key, url }`
2. Store `key` or `url` in scene/entity field
3. Resolve to signed URL via `fileApi.getSignedUrl()` for display

### Path Alias
`@/*` maps to project root (configured in both `vite.config.ts` and `tsconfig.json`).

## Key Patterns

### Scene Ordering
Scenes use `float64` index for insertion between existing items: `(prev.index + next.index) / 2`

### Auto-Save
Editors implement 5-second debounced auto-save. Scene changes also trigger save on selection switch.

### Toast Notifications
Use centered banner style with success (green) / error (red) color coding. Reuse existing Toast component.

### Editor Structure
Each editor (Script, Storyboard, Animation, Audio) follows similar layout:
- Left panel: Chapter list with tabs
- Center: Scene thumbnail strip
- Right panel: Scene details/editing area

Panels are resizable via drag handles using `usePanelResize` hook.
