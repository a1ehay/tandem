# Frontend guidance

- Keep the client framework-free: use browser APIs, vanilla JavaScript ES modules, and the existing CSS/HTML approach. Do not add dependencies or a bundler unless a task explicitly calls for it.
- Put client modules under `src/client/` and keep imports relative. `app.js` is the browser entry point; `build.mjs` copies the static files and module tree into `dist/`.
- Keep responsibilities separated: persistence/domain selectors in `state.js`, shared presentation/date helpers in `utils.js`, page templates in `views.js`, modal/forms in `forms.js`, whiteboard geometry in `board-geometry.js`, and local media behavior in `room.js`.
- Preserve existing UI flows, accessibility labels/data attributes used by delegated handlers, and localStorage key/version migration behavior.
- Run the root build (`node build.mjs`) after frontend changes. When behavior changes, smoke-check affected screens and interactions; do not check in generated `dist/` output.
