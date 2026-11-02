# Go backend guidance

- Keep this service independent from the frontend build and Cloudflare Worker.
- Use the Go standard library by default. Add third-party packages only when a task requires them.
- Keep startup configuration explicit through environment variables, validate it before listening, and retain graceful shutdown behavior.
- Keep HTTP routing and response behavior in `internal/httpserver`; keep environment parsing in `internal/config`; keep `cmd/tandem-api` focused on process startup and shutdown.
- Do not add real credentials to `.env.example`; document variable names and safe defaults only.
- From `backend/`, run `go test ./...` and `go vet ./...` after Go changes. For HTTP behavior changes, exercise the affected route and method/status responses.
