# Cloudflare Worker guidance

- Keep the Worker dependency-light and compatible with the Cloudflare Workers runtime; use Web APIs available in that runtime.
- `worker.js` routes `/api/livekit/token`, returns JSON API errors for other `/api/*` paths, and delegates non-API requests to the `ASSETS` binding.
- Treat the LiveKit token endpoint's path, request validation, response shape, CORS behavior, and configured secrets as an API contract. Change them only when explicitly required and update documentation with any contract change.
- Read credentials only from runtime environment bindings. Never put keys, secrets, or room codes in source, static assets, or committed examples.
- Validate Worker changes with module syntax checks and request-level checks for success, invalid input/configuration, CORS preflight, and unknown API paths where applicable.
