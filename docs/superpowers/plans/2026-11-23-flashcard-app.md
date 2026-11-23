# Flashcard Learning App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first, installable (PWA) flashcard app for mobile and desktop with nested folders, rich cards, spaced repetition, five study modes, import/export/share, printables, speech, progress, calibration, trouble-card detection and appearance settings.

**Architecture:** React SPA with hash routing. All persistence goes through a `Repository` interface implemented with Dexie (IndexedDB). All learning logic lives in pure TypeScript modules under `src/domain/` (unit-tested with Vitest); UI under `src/ui/` consumes them via hooks.

**Tech Stack:** Vite, React 18, TypeScript (strict), React Router 6 (`createHashRouter`), Tailwind CSS, Dexie 4 + `dexie-react-hooks`, `ts-fsrs`, `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-highlight`, `papaparse`, `lz-string`, `vite-plugin-pwa`, `@use-gesture/react`, `@fontsource/*`, Vitest + `fake-indexeddb` + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-flashcard-app-design.md`

## Global Constraints

- No backend, no network calls at runtime (fonts and all assets bundled; works offline).
- Hash routing only; share links are `#/share/<lz-string compressed payload>`. Vite `base: './'`.
- Every persisted record has `id` (UUID via `crypto.randomUUID()`), `createdAt`, `updatedAt` (epoch ms), `deletedAt: number | null`. Queries exclude soft-deleted records.
- UI must never import `src/data/db.ts` directly — only via `src/data/repo.ts` (the `Repository` instance) and hooks.
- All user-facing UI strings live in `src/ui/strings.ts`. CSS uses logical properties (`ms-`, `me-`, `ps-`, `pe-` Tailwind utilities). Rendered card sides use `dir="auto"`.
- Defaults: new cards/day 20, reviews/day 200, trouble threshold 6 lapses, daily goal 20, backup reminder after 14 days, day starts at 04:00 local, images resized to max 1600px.
- Only Learn mode changes FSRS scheduling; other modes only write `ReviewLog`s.
- Scale target: 20k cards, 500 images; no full-table scans on hot paths (due counts use the `[deckId+due]` index).
- Mobile-first: every action reachable by touch at 375px width; every study action also has a keyboard shortcut.
- Commit messages use `feat:`, `fix:`, `chore:`, `test:` prefixes and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Import of hostile or malformed files** (truncated JSON, wrong `schemaVersion`, CSV with BOM/quotes/mixed line endings, a 50 MB file) — expect a clear error message and zero partial writes. Test added in Task 13 (`rejects malformed JSON without writing`) and Task 14 (`handles BOM and CRLF`).
2. **Corrupted or truncated share links** (link cut off by a chat app) — expect a friendly "This link is incomplete" screen, never a crash. Test added in Task 15 (`decodeShare returns error for truncated payload`).
3. **Storage quota exceeded / private mode where IndexedDB fails** — expect a visible banner explaining data can't be saved, and export still working. Test added in Task 4 (`repository surfaces QuotaExceededError as StorageFullError`) and Task 24 banner check.
4. **Empty and tiny decks across all study modes** (0 cards, 1 card, all suspended, <4 cards for Quiz/Match) — expect an explanatory empty state, not a blank screen or infinite loop. Tests added in Task 10 (`buildLearnQueue on empty deck`) and Task 17 (`Quiz disabled under 4 cards`).
5. **Editing a card mid-study or deleting a deck that's currently being studied** — the session skips missing items instead of crashing. Test added in Task 11 (`session skips item whose card was deleted`).

---

## File Structure

```
index.html, vite.config.ts, tailwind.config.ts, tsconfig.json, playwright.config.ts
src/
  main.tsx                     app bootstrap, router, providers
  domain/                      pure TS, no React, no Dexie
    types.ts                   all record & value types
    ids.ts                     newId(), now(), baseRecord()
    cloze.ts                   cloze parsing/rendering
    variants.ts                card → review variants, reconcile on edit
    day.ts                     study-day boundary helpers
    scheduler.ts               ts-fsrs wrapper
    queue.ts                   Learn queue building (limits, interleave)
    matcher.ts                 lenient answer matching
    distractors.ts             quiz option generation
    bulkPaste.ts               paste → card drafts
    csv.ts                     CSV parse/map/export
    backup.ts                  JSON export/import format + merge plan
    share.ts                   share-link encode/decode
    leech.ts                   trouble-card detection
    calibration.ts             confidence calibration stats
    stats.ts                   streaks, heatmap, forecast, deck stats
    search.ts                  in-memory search index
    tree.ts                    folder tree building & descendant decks
  data/
    db.ts                      Dexie schema
    repository.ts              Repository interface
    dexieRepository.ts         implementation
    repo.ts                    singleton instance
    media.ts                   image resize + store
    seed.ts                    sample decks
  ui/
    strings.ts, settings/…, layout/…, library/…, editor/…, study/…, import/…, share/…, print/…, stats/…, components/…
tests/
  domain/*.test.ts, data/*.test.ts, ui/*.test.tsx, e2e/*.spec.ts
```

---

## Milestone 1 — Foundation

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/index.css`, `src/ui/App.tsx`, `tests/setup.ts`, `tests/ui/App.test.tsx`, `.gitignore`, `README.md`

**Interfaces:**
- Produces: `npm run dev | build | test | test:e2e | lint`; Vitest configured with `jsdom`, `fake-indexeddb/auto` in `tests/setup.ts`.

- [ ] **Step 1:** `git init`, scaffold with `npm create vite@latest . -- --template react-ts`, install all stack deps listed in the header, configure Tailwind (`darkMode: 'class'`), Vitest (`environment: 'jsdom'`, `setupFiles: ['tests/setup.ts']`), `base: './'`.
- [ ] **Step 2: Write failing test** `tests/ui/App.test.tsx`: `renders app shell` — render `<App/>`, expect `getByRole('navigation')` to exist.
- [ ] **Step 3:** Run `npm test` → FAIL.
- [ ] **Step 4:** Implement `App` returning a `<nav>` placeholder.
- [ ] **Step 5:** Run `npm test` → PASS; `npm run build` → succeeds.
- [ ] **Step 6:** Commit `chore: scaffold vite react ts app`.

### Task 2: Domain types and ids

**Files:**
- Create: `src/domain/types.ts`, `src/domain/ids.ts`, `tests/domain/ids.test.ts`

**Interfaces:**
- Produces (exact):
```ts
type Id = string;
interface BaseRecord { id: Id; createdAt: number; updatedAt: number; deletedAt: number | null }
interface Folder extends BaseRecord { parentId: Id | null; name: string; description: string; color: string; emoji: string; order: number }
interface DeckSettings { newPerDay: number; reviewsPerDay: number; confidencePrompt: boolean; langFront: string; langBack: string }
interface Deck extends BaseRecord { folderId: Id | null; name: string; description: string; color: string; emoji: string; order: number; settings: DeckSettings; sourceId: Id | null; matchBestMs: number | null }
type CardType = 'basic' | 'reversible' | 'cloze' | 'mcq';
interface Card extends BaseRecord { deckId: Id; type: CardType; front: string; back: string; distractors: string[]; mnemonic: string; tags: string[]; langFront: string | null; langBack: string | null; suspended: boolean; trouble: boolean }
type Variant = 'fwd' | 'rev' | `c${number}`;
interface ReviewItem extends BaseRecord { cardId: Id; deckId: Id; variant: Variant; due: number; stability: number; difficulty: number; elapsedDays: number; scheduledDays: number; reps: number; lapses: number; state: 0|1|2|3; lastReview: number | null }
type StudyMode = 'learn' | 'quiz' | 'type' | 'match' | 'cram';
type Rating = 1|2|3|4; // Again Hard Good Easy
type Confidence = 'unsure' | 'think' | 'sure';
interface ReviewLog extends BaseRecord { reviewItemId: Id; cardId: Id; deckId: Id; mode: StudyMode; rating: Rating | null; correct: boolean; confidence: Confidence | null; durationMs: number; at: number; dayKey: string }
interface Media extends BaseRecord { blob: Blob; mime: string; width: number; height: number }
interface AppSettings { /* see Task 6 */ }
const DEFAULT_DECK_SETTINGS: DeckSettings = { newPerDay: 20, reviewsPerDay: 200, confidencePrompt: true, langFront: 'en-US', langBack: 'en-US' };
```
- `newId(): Id`, `now(): number`, `baseRecord(): BaseRecord`, `touch<T extends BaseRecord>(r: T): T` (returns copy with new `updatedAt`).

- [ ] **Step 1: Test** `baseRecord has uuid and equal timestamps`; `touch bumps updatedAt only` (use `vi.setSystemTime`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat: add domain types`.

### Task 3: Cloze parsing and card variants

**Files:**
- Create: `src/domain/cloze.ts`, `src/domain/variants.ts`, `tests/domain/cloze.test.ts`, `tests/domain/variants.test.ts`

**Interfaces:**
- `parseClozeNumbers(text: string): number[]` — sorted unique. Supports `{{c2::ans}}`, `{{c2::ans::hint}}`, and bare `{{ans}}` (bare blanks are numbered in order after the highest explicit number).
- `renderCloze(text: string, n: number, reveal: boolean): string` — returns Markdown; active blank shown as `**[…]**` (or `**[hint]**`) when hidden, `**ans**` when revealed; other blanks shown as plain answers.
- `variantsFor(card: Pick<Card,'type'|'front'>): Variant[]` — basic/mcq → `['fwd']`, reversible → `['fwd','rev']`, cloze → `c<n>` per number (`['c1']` fallback if none).
- `reconcileVariants(existing: ReviewItem[], card: Card, prevType: CardType): { keep: ReviewItem[]; remove: ReviewItem[]; add: Variant[] }` — if type changed, all existing go to `remove`.

- [ ] **Step 1: Tests:**
  - `parseClozeNumbers('{{c1::a}} {{c3::b}} {{c1::c}}')` → `[1,3]`
  - `parseClozeNumbers('{{x}} and {{y}}')` → `[1,2]`; `'{{c2::a}} {{b}}'` → `[2,3]`
  - `renderCloze('Capital of {{c1::France}} is {{c2::Paris::city}}', 2, false)` → `'Capital of France is **[city]**'`
  - `variantsFor({type:'reversible', front:''})` → `['fwd','rev']`
  - `reconcileVariants` with items c1,c2 and new text containing c2,c3 → keep [c2], remove [c1], add ['c3']
  - type change basic→cloze → all removed, add from new
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: cloze parsing and variant reconciliation`.

### Task 4: Dexie database and repository

**Files:**
- Create: `src/data/db.ts`, `src/data/repository.ts`, `src/data/dexieRepository.ts`, `src/data/repo.ts`, `tests/data/repository.test.ts`

**Interfaces:**
- Dexie schema v1:
  `folders: 'id, parentId, deletedAt'`, `decks: 'id, folderId, sourceId, deletedAt'`, `cards: 'id, deckId, *tags, trouble, deletedAt, updatedAt'`, `reviewItems: 'id, cardId, deckId, [deckId+due], state, deletedAt'`, `reviewLogs: 'id, reviewItemId, cardId, deckId, dayKey, at'`, `media: 'id'`, `kv: 'key'`.
- `class StorageFullError extends Error`.
- `interface Repository` (all async):
  - folders: `listFolders(): Promise<Folder[]>`, `saveFolder(f: Folder)`, `deleteFolder(id, opts:{cascade: true})` (soft-deletes subtree, its decks, cards, items), `restoreFolder(id)`.
  - decks: `listDecks()`, `getDeck(id)`, `saveDeck(d)`, `deleteDeck(id)`, `restoreDeck(id)`, `duplicateDeck(id): Promise<Deck>`, `moveDeck(id, folderId|null)`.
  - cards: `listCards(deckId)`, `getCard(id)`, `saveCard(card: Card): Promise<void>` (**must** call `reconcileVariants` and create/soft-delete `ReviewItem`s in the same transaction), `saveCards(cards: Card[])` (bulk, one transaction), `deleteCards(ids)`, `restoreCards(ids)`.
  - review: `getDueItems(deckIds: Id[], until: number, limit: number): Promise<ReviewItem[]>` (via `[deckId+due]` where `state !== 0`), `getNewItems(deckIds, limit)` (state 0), `countDue(deckId, until): Promise<{due:number; new:number}>`, `saveReview(item: ReviewItem | null, log: ReviewLog)` (one transaction), `listLogs(range?: {from:number; to:number}, deckIds?: Id[])`.
  - media: `putMedia(m: Media)`, `getMedia(id)`.
  - kv: `getKV<T>(key): Promise<T|undefined>`, `setKV(key, value)`.
  - bulk: `transaction<T>(fn: () => Promise<T>): Promise<T>` (rw on all tables; used by import).
  - Every write wraps Dexie `QuotaExceededError` into `StorageFullError`.
- `repo.ts`: `export const repo: Repository = new DexieRepository(db)`.

- [ ] **Step 1: Tests** (fresh DB per test via `db.delete(); db.open()`):
  - `saveCard reversible creates fwd and rev items with state 0`
  - `editing cloze from c1,c2 to c2,c3 keeps c2 progress, soft-deletes c1, adds c3`
  - `deleteFolder cascades soft-delete to nested folders, decks, cards; restoreFolder undoes`
  - `countDue uses due <= until and excludes suspended cards and deleted items`
  - `repository surfaces QuotaExceededError as StorageFullError` (stub `db.cards.put` to reject with `new DOMException('', 'QuotaExceededError')`)
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: dexie repository`.

Note: suspended cards — `saveCard` sets the card's items' `due` to `Number.MAX_SAFE_INTEGER` when `suspended`, and restores to `lastReview`-derived due (or `now()`) when unsuspended; this keeps index-based queries correct.

### Task 5: Folder tree, search index

**Files:**
- Create: `src/domain/tree.ts`, `src/domain/search.ts`, tests for both.

**Interfaces:**
- `interface TreeNode { kind: 'folder' | 'deck'; id: Id; name: string; emoji: string; color: string; children: TreeNode[] }`
- `buildTree(folders: Folder[], decks: Deck[]): TreeNode[]` — sorted by `order` then name; orphans (missing parent) go to root.
- `descendantDeckIds(folderId: Id, folders: Folder[], decks: Deck[]): Id[]`
- `wouldCreateCycle(folderId: Id, newParentId: Id | null, folders: Folder[]): boolean`
- `class SearchIndex { constructor(cards: Card[]); search(q: string, opts?: {tag?: string; limit?: number}): Card[] }` — case/diacritic-insensitive token AND match over front, back, tags; Markdown syntax stripped.

- [ ] **Step 1: Tests:** nested 3-level tree built correctly; `descendantDeckIds` returns decks at all depths; `wouldCreateCycle(a, child-of-a)` → true; search `'cafe'` finds `'Café'`; tag filter; limit.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat: folder tree and search`.

### Task 6: Settings model, theming, fonts

**Files:**
- Create: `src/ui/settings/settings.ts`, `src/ui/settings/SettingsProvider.tsx`, `src/ui/settings/applySettings.ts`, `src/ui/strings.ts`, `tests/ui/settings.test.tsx`

**Interfaces:**
```ts
interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  accent: 'indigo' | 'teal' | 'rose' | 'amber' | 'emerald' | 'violet';
  font: 'system' | 'serif' | 'rounded' | 'hyperlegible' | 'opendyslexic';
  monoFont: 'system-mono' | 'jetbrains' | 'fira';
  cardTextSize: 'S' | 'M' | 'L' | 'XL';
  density: 'compact' | 'comfortable';
  reduceMotion: 'system' | 'on' | 'off';
  flipAnimation: boolean;
  dailyGoal: number;            // 20
  dayStartHour: number;         // 4
  swipeGestures: boolean;       // true
  autoReadAloud: boolean;       // false
  confidencePromptDefault: boolean; // true
  showKeyboardHints: boolean;   // true
  lastBackupAt: number | null;
}
const DEFAULT_SETTINGS: AppSettings;
function useSettings(): [AppSettings, (patch: Partial<AppSettings>) => void];
function applySettings(s: AppSettings, root: HTMLElement, prefersDark: boolean): void;
```
- Stored in `kv` under `'settings'`. `applySettings` toggles `dark` class, sets CSS vars `--accent-*`, `--font-ui`, `--font-mono`, `--card-scale` (S .9, M 1, L 1.2, XL 1.45), `data-density`, `data-reduce-motion`.
- Fonts via `@fontsource/atkinson-hyperlegible`, `@fontsource/nunito` (rounded), `@fontsource/merriweather` (serif), `@fontsource/jetbrains-mono`, `@fontsource/fira-code`; OpenDyslexic woff2 bundled in `src/assets/fonts/`.

- [ ] **Step 1: Tests:** `applySettings dark sets class`; `system theme follows prefersDark`; `font hyperlegible sets --font-ui containing 'Atkinson Hyperlegible'`; `cardTextSize XL sets --card-scale 1.45`; `useSettings patch persists to kv and survives remount`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat: settings and theming`.

### Task 7: App shell, routing, library UI

**Files:**
- Create: `src/ui/layout/AppShell.tsx` (bottom tabs <768px, sidebar ≥768px), `src/ui/routes.tsx`, `src/ui/library/LibraryPage.tsx`, `src/ui/library/TreeView.tsx`, `src/ui/library/FolderDialog.tsx`, `src/ui/library/DeckDialog.tsx`, `src/ui/library/MovePicker.tsx`, `src/ui/components/UndoToast.tsx`, `src/ui/hooks/useLibrary.ts`, `tests/ui/library.test.tsx`

**Interfaces:**
- Routes: `#/` (library), `#/folder/:id`, `#/deck/:id`, `#/deck/:id/edit/:cardId?`, `#/study/:scope/:id/:mode` (`scope` = `deck|folder`), `#/stats`, `#/trouble`, `#/settings`, `#/import`, `#/share/:payload`, `#/print/:deckId/:layout`.
- `useLibrary(): { tree: TreeNode[]; folders: Folder[]; decks: Deck[]; dueCounts: Record<Id,{due:number;new:number}> }` via `useLiveQuery`; folder counts are sums of descendants.
- Delete shows `UndoToast` for 8 s calling `restoreFolder/restoreDeck`.
- Desktop drag-and-drop with native HTML5 DnD on tree rows (reject cycles via `wouldCreateCycle`); mobile uses `MovePicker`.
- Library header has a global search box (`SearchIndex` built lazily from all non-deleted cards on first focus) with tag filter; results link to the card in its deck editor.
- First-launch empty state with four actions: Create deck, Paste a list, Import a file, Try a sample deck.

- [ ] **Step 1: Tests:** `create folder then deck inside it appears nested`; `delete deck then Undo restores it`; `empty library shows four onboarding actions`; `moving folder into its own child is rejected`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat: library tree ui`.

### Task 8: Card rendering, media, card editor

**Files:**
- Create: `src/ui/components/CardContent.tsx`, `src/data/media.ts`, `src/ui/editor/CardEditor.tsx`, `src/ui/editor/DeckPage.tsx` (card list, search box, tag filter), `tests/ui/cardContent.test.tsx`, `tests/ui/editor.test.tsx`, `tests/data/media.test.ts`

**Interfaces:**
- `<CardContent markdown: string; lang?: string | null />` — react-markdown with GFM, math (KaTeX), highlight; resolves `![alt](media:<id>)` via `useMediaUrl(id)` (object URL, revoked on unmount); wraps in `<div dir="auto" lang={lang}>`; font size `calc(1rem * var(--card-scale))`.
- `resizeImage(file: Blob, maxDim = 1600): Promise<{blob: Blob; width: number; height: number}>` (canvas; skips if already smaller); `storeImage(file: Blob): Promise<string /* 'media:<id>' */>`.
- Editor: type selector (Basic / Two-way / Fill-in-blank / Multiple choice), front/back fields with live preview (side-by-side ≥768px, stacked + Preview tab below), distractor list for mcq, mnemonic field, tags, per-side language select, image paste/drop/pick inserts Markdown. Buttons: **Save & add another** (primary, `Ctrl/Cmd+Enter`), Save, Cancel. Changing type on an existing card with progress shows confirm dialog with `strings.editor.typeChangeWarning`.

- [ ] **Step 1: Tests:** `CardContent renders code block with hljs class`; `renders $x^2$ via katex`; `media: link resolves to blob: URL`; `Save & add another clears fields and keeps type and tags`; `cloze type with no blanks shows validation message`; `mcq requires at least 1 distractor`; `resizeImage downsizes 3000x2000 to 1600x1067` (mock canvas).
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat: card editor and markdown rendering`.

---

## Milestone 2 — Learn mode

### Task 9: Study day and scheduler

**Files:**
- Create: `src/domain/day.ts`, `src/domain/scheduler.ts`, tests.

**Interfaces:**
- `dayKey(at: number, dayStartHour: number): string` — `'YYYY-MM-DD'` of local date after subtracting `dayStartHour` hours.
- `endOfStudyDay(at: number, dayStartHour: number): number`
- `newReviewItem(cardId: Id, deckId: Id, variant: Variant): ReviewItem` (state 0, due = now)
- `rate(item: ReviewItem, rating: Rating, at: number): ReviewItem` — wraps `ts-fsrs` `fsrs().next(...)` with default params, `enable_fuzz: true`.
- `previewIntervals(item: ReviewItem, at: number): Record<Rating, string>` — human labels like `'<1m'`, `'10m'`, `'3d'`, `'2mo'`.

- [ ] **Step 1: Tests:** `dayKey at 02:00 with start 4 returns previous date`; `dayKey at 05:00 returns same date`; `rate Good on new item moves state off 0 and due > at`; `rate Again increments lapses only for review-state items`; `previewIntervals Easy >= Good >= Hard`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: fsrs scheduler and study day`.

### Task 10: Learn queue

**Files:**
- Create: `src/domain/queue.ts`, `tests/domain/queue.test.ts`

**Interfaces:**
- `interface DeckBudget { deckId: Id; newLeft: number; reviewsLeft: number }` — computed as setting minus today's learn logs for that deck.
- `buildLearnQueue(input: { due: ReviewItem[]; fresh: ReviewItem[]; budgets: DeckBudget[]; seed: number }): ReviewItem[]` — per deck take up to `reviewsLeft` due (oldest due first) and `newLeft` new; interleave decks round-robin; place one new card after every 4 reviews; deterministic for a given seed.
- `requeue(queue: ReviewItem[], item: ReviewItem, at: number): ReviewItem[]` — learning/relearning items due within the session (≤ 20 min) are reinserted by due time.

- [ ] **Step 1: Tests:** `respects per-deck new limit`; `folder study interleaves decks`; `buildLearnQueue on empty deck returns []`; `requeue inserts Again item later in queue`; `deterministic with seed`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: learn queue`.

### Task 11: Study session UI (Learn + Cram)

**Files:**
- Create: `src/ui/study/StudyPage.tsx` (resolves scope + mode), `src/ui/study/useLearnSession.ts`, `src/ui/study/FlipCard.tsx`, `src/ui/study/RatingBar.tsx`, `src/ui/study/ConfidencePrompt.tsx`, `src/ui/study/SessionSummary.tsx`, `src/ui/study/KeyboardHelp.tsx`, `src/ui/study/CramMode.tsx`, `tests/ui/learn.test.tsx`

**Interfaces:**
- `useLearnSession(deckIds: Id[]): { current: {item: ReviewItem; card: Card} | null; revealed: boolean; reveal(): void; setConfidence(c: Confidence): void; answer(r: Rating): Promise<void>; undo(): Promise<void>; progress: {done:number; remaining:number} ; finished: boolean }`. `answer` calls `rate`, `repo.saveReview`, `requeue`, then `checkTrouble` (Task 19 – leave a call to `onAfterLearnReview(card)` hook that Task 19 fills; in this task it's a no-op export from `src/domain/leech.ts` stub).
- `FlipCard`: tap/click/Space to flip; with `swipeGestures` on, drag right ≥ 80px = Good (3), left = Again (1), with tinted overlay feedback; respects `flipAnimation` and reduce-motion.
- Keys: Space flip, `1`–`4` rate, `z` undo, `s` speak (Task 22), `?` help overlay.
- Cloze cards render via `renderCloze(front, n, revealed)`; reversible `rev` swaps sides; mnemonic shown after flip if present.
- Confidence prompt shown before flip when the deck setting is on; flip still allowed without choosing (confidence recorded as `null`).
- Cram mode: shuffled cards, flip, Next/Prev, "Got it / Again" buttons write `ReviewLog { mode:'cram' }` with `rating:null`; no scheduling change.
- Summary: cards studied, accuracy, time, streak status, "Study more" if new cards remain beyond limit.

- [ ] **Step 1: Tests:** `pressing 3 after reveal persists log and advances`; `swipe left rates Again`; `undo restores previous item state`; `session skips item whose card was deleted` (delete card mid-session → next item shown, no throw); `cram does not change ReviewItem.due`; `nothing due shows "All caught up" with next due time`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: learn and cram study modes`.

---

## Milestone 3 — Import / export / share

### Task 12: Bulk paste

**Files:**
- Create: `src/domain/bulkPaste.ts`, `src/ui/import/BulkPasteDialog.tsx`, tests.

**Interfaces:**
- `type TermSep = ' - ' | '\t' | ':' | ',' | ';' | { custom: string }`; `type CardSep = 'newline' | 'blankline'`.
- `detectSeparators(text: string): { term: TermSep; card: CardSep }` — picks the term separator present in the most non-empty lines (priority tab > ` - ` > `:` > `;` > `,` on ties); `blankline` if text contains `\n\s*\n` and some blocks span multiple lines.
- `parseBulk(text: string, opts: {term: TermSep; card: CardSep}): { drafts: {front: string; back: string}[]; skipped: number[] /* 1-based line numbers with no separator */ }` — splits on **first** occurrence of separator only; trims.
- Dialog: textarea, separator selects (prefilled by detect), card type (basic/reversible), live preview table with skipped-line warnings, "Create N cards" → `repo.saveCards`.

- [ ] **Step 1: Tests:** `detects tab`; `detects ' - '`; `'a - b - c'` → front `a`, back `b - c`; blankline mode keeps multi-line backs; lines without separator reported in `skipped`; Windows `\r\n` handled.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: bulk paste import`.

### Task 13: JSON backup format and merge

**Files:**
- Create: `src/domain/backup.ts`, `src/data/backupIO.ts`, `tests/domain/backup.test.ts`, `tests/data/backupIO.test.ts`

**Interfaces:**
```ts
const SCHEMA_VERSION = 1;
interface BackupFile { app: 'flashcards'; schemaVersion: number; exportedAt: number; scope: 'library'|'folder'|'deck';
  folders: Folder[]; decks: Deck[]; cards: Card[]; reviewItems?: ReviewItem[]; reviewLogs?: ReviewLog[];
  media: { id: Id; mime: string; width: number; height: number; dataBase64: string }[] }
function validateBackup(raw: unknown): { ok: true; file: BackupFile } | { ok: false; error: string };
type MergeMode = 'update' | 'copy';
interface MergePlan { put: { folders: Folder[]; decks: Deck[]; cards: Card[]; reviewItems: ReviewItem[]; reviewLogs: ReviewLog[]; media: Media[] }; summary: { added: number; updated: number; skipped: number } }
function planImport(file: BackupFile, existing: { ids: Set<Id>; updatedAt: Map<Id, number> }, mode: MergeMode, targetFolderId: Id | null): MergePlan;
```
- `update`: incoming record replaces local only if its `updatedAt` is newer; review items/logs imported only if their id doesn't exist locally. `copy`: remap every id (including `media:<id>` references inside card text, `cardId`, `deckId`, `parentId`, `folderId`) consistently.
- `backupIO.ts`: `exportBackup(scope, id|null, opts:{includeHistory: boolean}): Promise<Blob>` — builds the Blob from string parts deck-by-deck (no single giant string); `readBackupFile(file: File): Promise<BackupFile>` (size limit 300 MB → error); `applyImport(plan): Promise<void>` inside `repo.transaction` (all-or-nothing). On success with scope `library`, set `settings.lastBackupAt`.

- [ ] **Step 1: Tests:** `round-trip export→import into empty db reproduces records and media bytes`; `update mode keeps local newer card`; `update mode never overwrites local review items`; `copy mode remaps ids and media refs consistently`; `rejects malformed JSON without writing` (truncated text → error, table counts unchanged); `rejects schemaVersion 99 with 'made by a newer version' message`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: json backup and merge import`.

### Task 14: CSV import/export

**Files:**
- Create: `src/domain/csv.ts`, `src/ui/import/CsvImportDialog.tsx`, tests.

**Interfaces:**
- `type CsvField = 'front' | 'back' | 'tags' | 'type' | 'mnemonic' | 'distractors' | 'ignore'`
- `parseCsv(text: string): { headers: string[] | null; rows: string[][]; delimiter: ',' | ';' | '\t' }` (papaparse, auto-delimiter, strips BOM, header detection: first row has `front`/`back`/`term`/`definition`/`question`/`answer` case-insensitive).
- `guessMapping(headers: string[] | null, columnCount: number): CsvField[]` — default col0 front, col1 back.
- `rowsToDrafts(rows: string[][], mapping: CsvField[]): Partial<Card>[]` — tags split on `;` or spaces; distractors split on `|`; unknown `type` → `basic`.
- `cardsToCsv(cards: Card[]): string` — headers `front,back,tags,type,mnemonic,distractors`, RFC 4180 quoting.
- Dialog: file picker or drop, mapping selects per column, 10-row preview, target deck (existing or new).

- [ ] **Step 1: Tests:** `handles BOM and CRLF`; `quoted field with comma and newline`; `semicolon delimiter detected`; `headerless two-column file maps front/back`; `cardsToCsv → parseCsv → rowsToDrafts round-trips text, tags and distractors`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: csv import and export`.

### Task 15: Share links

**Files:**
- Create: `src/domain/share.ts`, `src/ui/share/ShareDialog.tsx`, `src/ui/share/SharePreviewPage.tsx`, tests.

**Interfaces:**
- `interface SharePayload { v: 1; deck: Pick<Deck,'id'|'name'|'description'|'emoji'|'color'|'settings'|'updatedAt'>; cards: Pick<Card,'id'|'type'|'front'|'back'|'distractors'|'mnemonic'|'tags'|'langFront'|'langBack'|'updatedAt'>[]; media: BackupFile['media'] }`
- `encodeShare(p: SharePayload): string` — `lz-string` `compressToEncodedURIComponent(JSON.stringify(p))`.
- `decodeShare(s: string): { ok: true; payload: SharePayload } | { ok: false; reason: 'truncated' | 'invalid' }`.
- `buildSharePayload(deck, cards, mediaLookup, budgetBytes = 1_500_000): { payload: SharePayload; droppedImages: number }` — includes images while total encoded length stays under budget.
- `SHARE_URL_WARN = 8_000`, `SHARE_URL_MAX = 2_000_000` chars. Dialog: shows link, Copy button, native `navigator.share` when available, QR code (`qrcode` package, only when URL ≤ 2,900 chars), warnings above `SHARE_URL_WARN` ("may not work in some chat apps"), and above `SHARE_URL_MAX` offers JSON download instead.
- Preview page: deck name, card count, first 5 cards rendered; if a local deck has `sourceId === payload.deck.id` → buttons "Update my copy" / "Add as new copy"; else "Add to my library" with folder picker. Import goes through `planImport` (converting payload to a `BackupFile`) and sets new deck's `sourceId = payload.deck.id`.

- [ ] **Step 1: Tests:** `encode→decode round-trip`; `decodeShare returns error for truncated payload` (`s.slice(0, s.length/2)` → `ok:false`); `buildSharePayload drops images over budget and reports count`; `re-opening link offers Update when sourceId matches`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: share decks via link`.

### Task 16: Import hub & export menu

**Files:**
- Create: `src/ui/import/ImportPage.tsx`, `src/ui/library/ExportMenu.tsx`, `tests/ui/importPage.test.tsx`

**Interfaces:**
- Import page with three tiles: Paste a list (Task 12), Spreadsheet/CSV (Task 14), Backup file/JSON (Task 13, with Update vs Copy radio and summary result). Also accepts dropping a file anywhere on the page (routes by extension `.json`/`.csv`/`.tsv`/`.txt`).
- Export menu on folder/deck/library: JSON (with "include study history" checkbox), CSV (deck only), Share link (deck only), Print (deck only, Task 21). Filenames: `flashcards-<slug>-YYYY-MM-DD.json|csv`.

- [ ] **Step 1: Tests:** `dropping .csv opens CSV dialog`; `JSON import shows summary 'Added 12, updated 0, skipped 0'`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: import hub and export menu`.

---

## Milestone 4 — More study modes

### Task 17: Distractors and Quiz mode

**Files:**
- Create: `src/domain/distractors.ts`, `src/ui/study/QuizMode.tsx`, tests.

**Interfaces:**
- `pickOptions(card: Card, pool: Card[], rng: () => number, count = 4): { options: string[]; correctIndex: number } | null` — mcq: correct + authored distractors (up to count-1, top up from pool if fewer); others: correct = `back` (or cloze answer for cloze), distractors = other cards' backs, preferring same-tag cards and similar length (±50%), excluding duplicates (normalized) of the correct answer. Returns `null` if fewer than 2 distinct options.
- `canQuiz(cards: Card[]): boolean` — ≥ 4 non-suspended cards.
- Quiz: 10 questions (or fewer if deck smaller), tap/1–4 keys, immediate correct/incorrect feedback, results screen with missed cards and "Study these in Learn" link. Writes `ReviewLog{mode:'quiz', correct}`.

- [ ] **Step 1: Tests:** `options contain correct answer exactly once`; `no duplicate options after normalization`; `prefers same-tag distractors`; `Quiz disabled under 4 cards` (UI shows explanation); `deterministic with seeded rng`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: quiz mode`.

### Task 18: Answer matcher, Type mode, Match game

**Files:**
- Create: `src/domain/matcher.ts`, `src/ui/study/TypeMode.tsx`, `src/ui/study/MatchGame.tsx`, tests.

**Interfaces:**
- `normalizeAnswer(s: string): string` — strip Markdown, lowercase, NFD + remove diacritics, collapse whitespace, remove punctuation, drop leading articles (`a`, `an`, `the`).
- `matchAnswer(input: string, target: string): { verdict: 'exact' | 'close' | 'wrong'; diff: {text: string; op: 'eq'|'ins'|'del'}[] }` — `exact` if normalized equal (or equal to any `/`-separated alternative in target); `close` if Levenshtein ≤ max(1, floor(len/6)); diff is char-level on normalized strings.
- Type mode: input field (autofocus, `autocapitalize="off"`), Enter to check, shows diff, "I was right" override flips to correct. Writes `ReviewLog{mode:'type'}`.
- Match game: 6 pairs on <768px, 8 on desktop; tiles shuffled; tap two to match; wrong pair shakes (+1s penalty); timer; best time stored in `deck.matchBestMs`. Writes one `ReviewLog{mode:'match'}` per pair.

- [ ] **Step 1: Tests:** `'The Café' vs 'cafe'` → exact; `'recieve' vs 'receive'` → close; `'cat' vs 'dog'` → wrong; `alternatives 'color / colour'`; `Match game clears tiles on correct pair and records best time`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: type-answer and match modes`.

---

## Milestone 5 — Progress, calibration, trouble cards

### Task 19: Trouble-card detector

**Files:**
- Modify: `src/domain/leech.ts` (replace stub), `src/ui/study/useLearnSession.ts` (hook already calls it)
- Create: `src/ui/trouble/TroublePage.tsx`, tests.

**Interfaces:**
- `TROUBLE_LAPSES = 6`; `isTrouble(item: ReviewItem, recentLogs: ReviewLog[]): boolean` — true if `item.lapses >= 6`, or ≥ 8 non-learn logs with success rate < 40%.
- `onAfterLearnReview(card, item, logs)` sets `card.trouble = true` via `repo.saveCard` when newly trouble (shows toast "This card keeps tripping you up — Fix it?").
- `suggestFixes(card: Card): ('split'|'mnemonic'|'image'|'rephrase')[]` — `split` if back > 120 chars or contains a list/`,`-separated ≥3 items; `mnemonic` if empty; `image` if no `media:`; `rephrase` always.
- Trouble page: list with badge, suggestions as buttons (open editor focused on the relevant field), Suspend, "Mark as fixed" (clears flag, resets lapses to 0).

- [ ] **Step 1: Tests:** `6 lapses flags trouble`; `low quiz accuracy flags trouble`; `suggestFixes long back suggests split`; `mark as fixed clears flag`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: trouble card detection`.

### Task 20: Stats, streaks, calibration UI

**Files:**
- Create: `src/domain/stats.ts`, `src/domain/calibration.ts`, `src/ui/stats/StatsPage.tsx`, `src/ui/stats/Heatmap.tsx`, `src/ui/stats/CalibrationChart.tsx`, `src/ui/stats/DeckStats.tsx`, `src/ui/components/GoalRing.tsx`, tests.

**Interfaces:**
- `dailyCounts(logs: ReviewLog[]): Map<string /*dayKey*/, number>`
- `streak(counts: Map<string, number>, today: string, goal: number): { current: number; best: number; freezeUsedThisWeek: boolean }` — a day counts if count ≥ goal; one missed day per ISO week is forgiven (freeze); today not yet met doesn't break the streak.
- `heatmap(counts, today): { dayKey: string; count: number; level: 0|1|2|3|4 }[]` — 365 days; levels by quartile of non-zero counts.
- `forecast(items: ReviewItem[], from: number, days = 14, dayStartHour: number): number[]`
- `deckBreakdown(items: ReviewItem[], cards: Card[]): { new: number; learning: number; review: number; suspended: number; retention: number /*% Good+ on review-state learn logs, last 30 days*/ }`
- `calibration(logs: ReviewLog[]): { level: Confidence; n: number; accuracy: number }[]` plus `overconfidentCards(logs, top = 10): Id[]` (most "sure" + wrong).
- UI: goal ring on Library header; Stats page with streak, heatmap (SVG, horizontally scrollable on mobile, accessible `<title>` per cell), 14-day forecast bars, deck selector with breakdown, calibration bars (expected vs actual) with plain-language verdict ("When you're Sure, you're right 72% of the time").

- [ ] **Step 1: Tests:** `streak forgives one missed day per week`; `streak not broken by unmet today`; `heatmap returns 365 cells`; `forecast buckets by study day`; `calibration accuracy per level`; `retention only counts learn logs`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: progress stats and calibration`.

---

## Milestone 6 — Speech, printables, PWA, polish

### Task 21: Printables

**Files:**
- Create: `src/ui/print/PrintPage.tsx`, `src/ui/print/print.css`, `tests/ui/print.test.tsx`

**Interfaces:**
- `#/print/:deckId/:layout` with `layout = 'cards' | 'worksheet' | 'quiz'`; toolbar (hidden in print) with layout switch, "Include answer key", cards-per-page (8 or 12 for `cards`), and Print button calling `window.print()`.
- `cards`: front pages then back pages with columns mirrored per row for long-edge duplex; dashed cut lines; `@page { size: A4; margin: 10mm }` with a Letter toggle.
- `worksheet`: numbered fronts with answer lines; optional answer key page.
- `quiz`: uses `pickOptions` (seeded by deck id for reproducibility) to make MC questions; answer key page.
- Cloze cards print with the blank hidden on fronts.

- [ ] **Step 1: Tests:** `cards layout mirrors back row order`; `quiz layout answer key matches correctIndex`; `answer key hidden when toggle off`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: printable cards, worksheets, quizzes`.

### Task 22: Read aloud & pronunciation

**Files:**
- Create: `src/ui/speech/speech.ts`, `src/ui/speech/SpeakButton.tsx`, `src/ui/speech/PronounceButton.tsx`, tests.

**Interfaces:**
- `canSpeak(): boolean`, `canListen(): boolean` (checks `window.SpeechRecognition || webkitSpeechRecognition`).
- `speak(markdown: string, lang: string): void` — strips Markdown, code blocks become "code", cancels any current utterance, picks a voice matching `lang` prefix.
- `listenOnce(lang: string, timeoutMs = 6000): Promise<string>`.
- `SpeakButton` / `PronounceButton` render nothing when unsupported. Pronounce compares via `matchAnswer` and shows exact/close/wrong with the transcript. `autoReadAloud` speaks the revealed side. Card side language: `card.langFront ?? deck.settings.langFront`.

- [ ] **Step 1: Tests (mock speechSynthesis/SpeechRecognition):** `speak strips markdown and sets lang`; `buttons hidden when unsupported`; `pronounce close match shows 'Almost'`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: read aloud and pronunciation check`.

### Task 23: Settings page & deck settings

**Files:**
- Create: `src/ui/settings/SettingsPage.tsx`, `src/ui/library/DeckSettingsDialog.tsx`, tests.

**Interfaces:**
- Settings page sections: Appearance (theme, accent swatches, font with live sample text, mono font, card text size with live sample card, density, reduce motion, flip animation), Study (daily goal, day start hour 0–23, swipe gestures, auto read aloud, confidence prompt default, keyboard hints), Data (storage used via `navigator.storage.estimate()`, persistent status + "Keep my data safe" button calling `navigator.storage.persist()`, last backup date, Export library, Import, Reset app requiring the typed word `RESET`), About (version).
- Deck settings dialog: new/day, reviews/day, confidence prompt, front/back language (list from `speechSynthesis.getVoices()` langs plus common fallbacks).

- [ ] **Step 1: Tests:** `changing font updates sample immediately`; `reset requires typing RESET`; `deck new/day change affects queue size`.
- [ ] **Step 2–4.** **Step 5:** Commit `feat: settings page`.

### Task 24: PWA, offline, storage safety, sample decks

**Files:**
- Modify: `vite.config.ts` (add `VitePWA({ registerType: 'prompt', manifest: {...}, workbox: { globPatterns: ['**/*.{js,css,html,woff2,svg,png}'] } })`)
- Create: `public/icons/*` (192, 512, maskable), `src/ui/components/UpdatePrompt.tsx`, `src/ui/components/StorageBanner.tsx`, `src/ui/components/BackupReminder.tsx`, `src/data/seed.ts`, tests.

**Interfaces:**
- `UpdatePrompt` uses `useRegisterSW` → "New version available — Reload".
- On first launch call `navigator.storage.persist()`.
- `StorageBanner` shows when a `StorageFullError` or IndexedDB open failure is caught (global error context), with an "Export backup" action.
- `BackupReminder`: shows if library has ≥ 50 cards and `lastBackupAt` is null or > 14 days ago; dismiss snoozes 7 days (kv `backupSnoozeUntil`).
- `seedSampleDecks(): Promise<void>` — creates folder "Samples" with three decks: "JavaScript Basics" (10 cards incl. code blocks and 2 cloze), "Spanish Starter" (15 reversible cards, langBack `es-ES`), "World Capitals" (15 basic + 3 mcq). Idempotent (fixed ids).

- [ ] **Step 1: Tests:** `seedSampleDecks is idempotent`; `backup reminder shows at 50 cards with no backup`; `storage banner appears on StorageFullError`.
- [ ] **Step 2–4.** Then `npm run build && npx vite preview` and confirm Lighthouse-style installability manually (manifest + SW registered in DevTools Application tab). **Step 5:** Commit `feat: pwa offline support, sample decks, storage safety`.

### Task 25: End-to-end smoke tests & polish

**Files:**
- Create: `playwright.config.ts` (projects: `Mobile Safari`-like `iPhone 13` WebKit, `Desktop Chrome`), `tests/e2e/core.spec.ts`

- [ ] **Step 1: E2E tests:**
  - `create folder → deck → 3 cards via bulk paste → Learn session rate all Good → summary shows 3`
  - `export JSON → reset app → import JSON → deck and cards restored`
  - `share link → open in new context → Add to library → cards present`
  - `settings: switch to dark + Hyperlegible persists after reload`
  - `offline: after first load, set context offline, reload, library still renders`
- [ ] **Step 2:** `npm run test:e2e` → fix failures until PASS on both projects.
- [ ] **Step 3:** Accessibility pass: run `@axe-core/playwright` on Library, Study, Settings; fix serious/critical violations.
- [ ] **Step 4:** Commit `test: e2e smoke suite and a11y fixes`.
