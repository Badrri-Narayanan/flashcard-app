# Flashcards

Local-first flashcard PWA (React, TypeScript, Dexie, FSRS). No backend; works offline.

## Scripts

- `npm run dev` - start the dev server
- `npm run build` - type-check and build
- `npm test` - run unit tests (Vitest)
- `npm run test:e2e` - run Playwright tests
- `npm run lint` - run ESLint

## Testing

- `npm test` - unit and component tests (Vitest).
- `npm run test:e2e` - end-to-end smoke and accessibility tests (Playwright). It builds the app and serves it with `vite preview` on port 4173; the "Mobile Safari" (iPhone 13, WebKit) and "Desktop Chrome" projects both run.
- Prerequisite for e2e, once per machine: `npx playwright install` (downloads Chromium and WebKit).
