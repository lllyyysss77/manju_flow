# Repository Guidelines

## Environment Variables
- Any change that adds, removes, or renames an environment variable must update the relevant `.env.example` in the same change.
- Backend environment variables live in `backend/.env.example`; frontend environment variables should be documented in the frontend env example if one is added later.
- If the variable affects deployment or runtime behavior, also update the README/config documentation in the same change.
