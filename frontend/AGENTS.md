# Repository Guidelines

## Project Structure & Modules
- `components/`: React feature modules (e.g., `ScriptEditor.tsx`, `StoryboardEditor.tsx`, media editors) plus shared UI pieces. Keep new UI in this folder and co-locate styles with components.
- `App.tsx`, `index.tsx`: App shell and React entry. Route or layout changes start here.
- `api.ts`, `types.ts`, `constants.tsx`: Shared types, API helpers, and enums/config used across editors.
- `dist/`: Build output (generated). Do not edit manually.
- `vite.config.ts`, `tsconfig.json`: Tooling config; update thoughtfully.

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server with HMR.
- `npm run build`: Production bundle to `dist/`.
- `npm run preview`: Serve the built output locally to verify prod build.

## Coding Style & Naming
- Language: TypeScript + React functional components.
- Indent with 2 spaces; keep imports grouped (libs, shared utils, local files).
- Components and React hooks: `PascalCase`; files typically `PascalCase.tsx` for components, `camelCase.ts` for utilities.
- Prefer descriptive prop names; avoid anonymous `any`.
- Use small, purposeful comments only where logic is non-obvious.

## Testing Guidelines
- No dedicated test suite is present. When adding tests, co-locate with the feature or add a `tests/` directory and document the runner.
- Manually verify key flows: chapter/scene creation, edits, drag-resize panels, and build via `npm run build`.

## Commit & Pull Request Guidelines
- Commits: Use clear, imperative subjects (e.g., `Add chapter insertion hover affordance`, `Fix panel resize drag bounds`). Keep related changes together.
- PRs should include: summary of changes, key UI screenshots/gifs, affected flows, and any known limitations. Link to issues/tasks when available.

## UX & Interaction Notes
- Left/right panels are resizable via drag handles; ensure new UI respects dynamic widths.
- Chapter/scene lists use hover-only insertion affordances and inline title editing; preserve these patterns when extending navigation.
- Default to collapsed/concise UI on navigation lists; avoid persistent overlays.

## Security & Config
- No backend secrets in this repo. If adding API keys or endpoints, use environment variables (`.env`) and keep `.env` out of version control.
- Check changes into config files (`vite.config.ts`, `tsconfig.json`) only when necessary and document rationale in PRs. 
