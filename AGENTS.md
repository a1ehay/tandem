# Tandem repository guidance

## Project map

- `frontend/` contains the static vanilla JavaScript application and its assets.
- `cloudflare/` contains the Cloudflare Worker and LiveKit token helpers.
- `backend/` contains the independent Java/Spring Boot HTTP API.
- `database/` contains the independent Java/Flyway PostgreSQL migration runner.
- `build.mjs` copies the frontend into `dist/`; `wrangler.jsonc` deploys the Worker and static assets.

## General rules

- Keep the frontend, Cloudflare Worker, Java backend, and Flyway migration runner independently runnable and buildable. Do not couple backend services into the static-site build.
- Preserve the demo's current behavior and localStorage compatibility unless the task explicitly asks for product changes. Keep the existing storage keys and migration path intact.
- Keep generated output (`dist/`) and local credentials out of source changes. Never commit secrets or real user data.
- Prefer small, focused changes that follow the existing module boundaries. Update the relevant README when commands, routes, configuration, or project layout change.
- Before finishing code changes, run the checks relevant to the touched area and report any checks that could not be run.
