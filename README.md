# Flashcards

A free, local-first flashcard app for learning anything: programming, languages, exam prep, or a deck a teacher builds for a class. It runs entirely in your browser, works offline, and installs like an app on your phone or computer.

**Use it now: https://badrri-narayanan.github.io/flashcard-app/**

There is no account and no server. Your cards stay in your browser's storage on your device; export a backup to move them or keep them safe.

## Features

- **Organise your way** — nest folders (projects, topics, lessons) and decks, each with its own emoji and colour.
- **Rich cards** — basic, two-way and fill-in-the-blank (cloze) cards with Markdown, code highlighting, maths (KaTeX), images and memory hooks.
- **Learn with spaced repetition** — the FSRS scheduler shows each card just before you would forget it. Flip the card back and forth as often as you like, then rate it Again / Hard / Good / Easy.
- **More ways to study** — Cram (no scheduling), multiple-choice Quiz, Type the answer, and a timed Match game.
- **Trouble cards** — cards you keep missing are flagged, with suggestions to fix them.
- **Stats** — streak, daily goal, review heatmap, retention, forecast and a confidence check.
- **Import and export** — paste a list, import a CSV/TSV spreadsheet or a JSON backup, export to JSON or CSV, or share a deck as a link.
- **Printables** — print cut-out cards, a worksheet or a quiz.
- **Read aloud and pronunciation practice** using your browser's speech features.
- **Make it yours** — light/dark theme, accent colour, fonts (including Atkinson Hyperlegible and OpenDyslexic), card text size, and flip-animation / reduced-motion settings.

## Studying

| Action | Keyboard | Touch |
| --- | --- | --- |
| Flip the card (either way) | `Space` | Tap the card or the **Flip** button |
| Next card (skip for now) | `→` | Swipe left |
| Previous card | `←` | Swipe right |
| Rate (Learn) | `1` `2` `3` `4` | Rating buttons |
| Undo last rating | `Z` | **Undo** |
| Read the visible side aloud | `S` | Speaker button |
| All shortcuts | `?` | — |

A card you skip is remembered: it comes back later in the session with a "Skipped earlier" tag. Going back in Learn after rating a card shows that card again and undoes its rating so you can re-rate it.

## Your data

- Everything is stored locally in IndexedDB in the browser you use. Clearing site data deletes it.
- Use **Settings → Back up now** (or **Export** in the Library) regularly; the app reminds you if it has been a while.
- Install the app (browser menu → *Install* / *Add to Home Screen*) for offline use and so the browser is less likely to clear storage.

## Development

Requires Node 20.19+ (CI uses Node 24).

```bash
npm install
npm run dev        # dev server
npm run build      # type-check and production build
npm test           # unit and component tests (Vitest)
npm run test:e2e   # end-to-end and accessibility tests (Playwright)
npm run lint       # ESLint
```

End-to-end tests build the app and serve it with `vite preview` on port 4173, running on "Mobile Safari" (iPhone 13, WebKit) and "Desktop Chrome". Once per machine, run `npx playwright install` to download the browsers.

Built with React 18, TypeScript, Vite, Tailwind CSS, Dexie (IndexedDB), ts-fsrs and vite-plugin-pwa.

## Deployment

Every push to `main` runs [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml): it installs dependencies, runs the unit tests, builds, and publishes `dist/` to GitHub Pages. The app uses relative asset paths and hash routing, so it works under the project URL with no extra configuration. Pages must be set to **Settings → Pages → Source: GitHub Actions** (already done for this repo).
