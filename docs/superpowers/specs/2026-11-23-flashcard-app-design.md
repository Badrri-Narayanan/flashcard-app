# Flashcard Learning App — Design

Date: 2026-11-23
Status: Approved by user 2026-11-23 (with added Appearance & preferences settings, §5.11)

## 1. Intent

A general-purpose, user-friendly flashcard app for learning anything: tech topics, vocabulary, classroom material. It serves self-learners and teachers making decks for a class. It runs in the browser on desktop and mobile, is local-first (all data in the browser), and lets users move their data in and out freely via import/export. It goes beyond flipping cards with features that improve actual learning (spaced repetition, varied study modes, confidence calibration, trouble-card detection).

## 2. Goals, non-goals, anti-goals

**Goals (v1)**
- Fully functional offline, browser-only app; installable on phones (PWA).
- Flexible organisation: nested folders containing decks, levels named by the user.
- Rich card types and study modes (listed below).
- Import/export: JSON backup, CSV, bulk paste, share-as-link.
- Very easy to use: obvious primary actions, works with touch and keyboard, readable on small screens.

**Non-goals (v1)**
- No backend, accounts, or cloud sync. (Design leaves a seam for it — see §6.)
- No real-time collaboration, no multi-user classroom management.
- No Anki `.apkg` import (possible later).
- No AI-generated cards.

**Anti-goals** (failures even if it "works")
- Data loss: a user losing decks because browser storage was cleared with no backup path or warning.
- Clutter: feature count making the main flows (create card, study) hard to find.
- Mobile as an afterthought: anything that only works well with a mouse.

## 3. Constraints

- Browser only, offline-capable. Data in IndexedDB.
- Must work on current mobile Safari and Chrome, and desktop Chrome/Firefox/Safari/Edge.
- Share links must work with no server, so deck data travels in the URL fragment (`#`), compressed.
- Speech features depend on Web Speech API availability; degrade gracefully (hide controls) when missing. Speech recognition is unavailable in Firefox and limited elsewhere.

## 4. Approaches considered

| Option | Trade-off | Decision |
|---|---|---|
| **A. React + TypeScript + Vite PWA**, Dexie (IndexedDB), ts-fsrs | Build step, but mature ecosystem for gestures, rich text, code/math rendering, DnD; types keep a ~15-feature app sane; a storage interface keeps a future backend cheap | **Chosen by user** |
| B. SvelteKit (static adapter) + TS | Smaller bundle, simpler reactivity; fewer ready-made components, more hand-rolling | Rejected |
| C. Single-file vanilla JS | Zero build, easy to hand around; becomes unmaintainable at this feature scope | Rejected |

## 5. Features (v1 scope)

### 5.1 Organisation
- **Library tree:** Folders (nestable to any depth) contain Folders and Decks. Decks contain Cards.
- Users name things freely ("Project", "Unit 3", "Week 2"). No fixed level names.
- Each item has a name, optional description, colour/emoji, and tags (cards can have tags too).
- Move, rename, duplicate, delete (with undo toast). Drag-and-drop on desktop; "Move to…" picker on mobile.
- Search across all cards (front/back/tags) and filter by tag.
- Study a folder = study all decks beneath it.

### 5.2 Card types
1. **Basic:** front/back.
2. **Reversible:** basic card that also generates the back→front direction (tracked as a separate review item).
3. **Cloze:** text with `{{c1::answer}}` or `{{answer}}` blanks. Each cloze number becomes its own review item.
4. **Multiple choice (authored):** question, correct answer, explicit distractors.

Content for card sides is **Markdown** with:
- fenced code blocks with syntax highlighting,
- math via KaTeX (`$…$`, `$$…$$`),
- images (pasted, dropped, or picked; stored as Blobs in IndexedDB; resized client-side to a sane max dimension),
- per-side language tag (e.g. `fr-FR`) used for read-aloud.

Card editor: side-by-side (desktop) or stacked (mobile) edit + live preview, "Save & add another" as the fast path.

### 5.3 Study modes
- **Learn (spaced repetition):** FSRS scheduling via `ts-fsrs`. Rate Again / Hard / Good / Easy. Daily new-card limit and review limit per deck (sensible defaults, editable). Shows due counts on decks/folders.
- **Quiz:** multiple choice. Uses authored distractors for MC cards. For other cards, distractors are drawn from other cards' backs in the same deck/folder (needs ≥4 cards; otherwise mode is disabled with an explanation).
- **Type-the-answer:** user types the answer. Comparison is lenient: case/whitespace/punctuation-insensitive and accent-tolerant, with a "close enough" diff shown and an "I was right" override.
- **Match game:** timed grid of 6–8 term/definition tiles; tap pairs to clear; best time saved per deck.
- **Cram / preview:** flip through cards without affecting scheduling.

Only Learn mode updates the spaced-repetition schedule. Other modes record activity (for streaks/heatmap) and per-card correctness stats, but do not change scheduling.

**Interaction:** swipe right = Good, left = Again, tap = flip, with on-screen buttons as well for all four ratings. Keyboard: Space flip, 1–4 rate, plus shortcuts shown in a `?` overlay.

### 5.4 Confidence calibration
- Optional per-deck setting (on by default in Learn mode): before flipping, the user taps a confidence level (Unsure / Think so / Sure).
- After rating, record (confidence, correct?).
- Stats page shows a calibration chart: for each confidence level, the actual % correct, highlighting overconfidence (said "Sure" but often wrong) and the cards where it happens most.

### 5.5 Trouble-card (leech) detector
- A card is flagged as "trouble" after N lapses (default 6) in Learn mode, or a low success rate after enough attempts in other modes.
- Trouble cards get a badge and appear in a "Trouble cards" view with suggested fixes: split the card, add a memory hook (dedicated optional "mnemonic" field shown after flip), add an image, or rephrase. The user can also suspend the card.

### 5.6 Read aloud & pronunciation
- Speaker button reads a side aloud via `speechSynthesis` using that side's language tag; optional auto-read on reveal.
- Microphone button (when `SpeechRecognition` is available): user speaks, the transcript is compared with the target text using the same lenient matcher, and a match/near-match result is shown. Hidden where unsupported.

### 5.7 Import / export
- **JSON (full fidelity):** export the whole library, a folder, or a deck, including images (base64) and optionally review history. Import merges or adds as a copy, and reports a summary. Versioned format (`schemaVersion`).
- **CSV:** export a deck (front, back, tags, type, extra columns). Import with a column-mapping step and preview; handles quoted fields, UTF-8, comma/semicolon/tab delimiters.
- **Bulk paste:** textarea; user picks or auto-detects the separator between term and definition (` - `, tab, `:`, `,`, or custom) and between cards (newline, blank line). Live preview of the parsed cards before creating them.
- **Share as link:** deck JSON (without images over a size budget and without review history) compressed (`lz-string`) into the URL fragment. Opening the link shows a preview with "Add to my library". If the deck is too large for a reasonable URL, the app warns and suggests a JSON file instead.
- **Backup nudge:** the app requests persistent storage (`navigator.storage.persist`), and shows a gentle reminder to export a backup if none has been made in 14 days and the library is non-trivial.

### 5.8 Printables (teachers)
- Print view for a deck, using a print stylesheet so the browser's print/save-as-PDF does the work:
  - **Cut-out cards:** grid of cards, fronts on one page and mirrored backs on the next for double-sided printing.
  - **Worksheet:** numbered questions with blank lines; optional answer key on a separate page.
  - **Quiz sheet:** auto-generated multiple-choice questions plus an answer key.

### 5.9 Progress
- Daily goal (cards reviewed, default 20), streak counter (a day counts if the goal is met; one "freeze" per week to forgive a missed day — builder may simplify to plain streaks).
- Calendar heatmap of review counts per day (last 12 months).
- Per-deck stats: cards by state (new/learning/review/suspended), retention %, upcoming review forecast (next 14 days).

### 5.10 General UX
- Mobile-first responsive layout: bottom tab bar on mobile (Library, Study, Stats, Settings); sidebar on desktop.
- Light/dark/system theme.
- Empty states that teach (e.g. first launch offers "Create a deck", "Paste a list", "Import a file", "Try a sample deck").
- A few bundled sample decks (one tech, one vocabulary, one general knowledge) so the app is explorable immediately.
- Accessible: semantic HTML, focus management, labelled buttons, sufficient contrast, reduced-motion respected.
- PWA: installable, offline via service worker (`vite-plugin-pwa`), update prompt when a new version is available.

### 5.11 Appearance & preferences (Settings page)
- **Theme:** light / dark / system, plus a choice of accent colour (≈6 presets).
- **Font:** interface/card font family (system sans, a serif, a rounded/friendly font, and a dyslexia-friendly option such as Atkinson Hyperlegible or OpenDyslexic; fonts bundled locally for offline use), and a separate monospace choice for code.
- **Text size:** card text scale (S / M / L / XL) independent of UI scale.
- **Density & motion:** compact/comfortable layout; reduce animations (defaults to OS setting); card flip animation on/off.
- **Study preferences:** default daily goal, day start hour, swipe gestures on/off, auto-read aloud, confidence prompt default, show keyboard hints.
- **Data:** export/import shortcuts, storage usage, persistent-storage status, last backup date, "reset app" (with typed confirmation).
- All preferences are stored locally and applied via CSS custom properties, so changes preview instantly.

## 6. Architecture

- **Stack:** React 18 + TypeScript + Vite; React Router; Dexie for IndexedDB; `ts-fsrs`; `react-markdown` + `rehype-katex` + a syntax highlighter; `lz-string`; `papaparse` for CSV; `vite-plugin-pwa`. Styling: Tailwind CSS. Lightweight state: React state + Dexie live queries (`dexie-react-hooks`); no global store library unless needed.
- **Storage seam:** all persistence goes through a `Repository` interface (folders, decks, cards, reviews, media, settings). v1 has a single `DexieRepository` implementation. A future backend adds a sync layer or alternate implementation without touching UI code. Every record gets `id` (UUID), `createdAt`, `updatedAt`, and a soft-delete `deletedAt` field to make later sync feasible.
- **Data model (sketch):**
  - `Folder { id, parentId|null, name, description, color, emoji, order }`
  - `Deck { id, folderId|null, name, description, color, emoji, settings{newPerDay, reviewsPerDay, confidencePrompt, ttsLangFront, ttsLangBack}, order }`
  - `Card { id, deckId, type, front, back, extra{distractors?, mnemonic?}, tags[], langFront?, langBack?, suspended }`
  - `ReviewItem { id, cardId, variant (e.g. "fwd","rev","c1"), fsrs state fields, lapses }`: one card can yield several review items.
  - `ReviewLog { id, reviewItemId, mode, rating|correct, confidence?, durationMs, at }`
  - `Media { id, blob, mime, width, height }`, referenced from Markdown as `media:<id>`.
  - `Settings`, `Stats` (derived from logs; optional cached daily aggregates).
- **Domain logic is pure TypeScript modules** (scheduler wrapper, cloze parser, answer matcher, bulk-paste parser, CSV mapper, share-link codec, distractor picker, leech detector, calibration stats), so they're unit-testable without the UI.

## 6a. Resolved details

- **Routing & hosting:** hash-based routing (`#/library/...`). Share links live inside the hash route (`#/share/<compressed>`), so the app works on any static host (GitHub Pages, Netlify, a sub-path, or a local server) with no rewrite rules. Vite `base: './'`.
- **Import merge semantics:** IDs survive export and share links. On import, records whose IDs already exist trigger a choice per import: **Update existing** (incoming content replaces local content only when its `updatedAt` is newer; local review history and schedule are always kept) or **Add as copy** (all IDs regenerated). A deck imported from a share link records `sourceId` so re-opening an updated link offers "Update". Review history is imported only from full JSON backups, and only for review items that don't exist locally.
- **Editing cards vs. study progress:** review items are derived from card content on save. Variants that still exist keep their progress (cloze matched by number, `fwd`/`rev` by name). Variants that disappear are soft-deleted (logs kept for stats). New variants start as new. Changing a card's type resets its review items, after a confirmation that warns about losing progress.
- **Scale target:** design for ~20k cards and ~500 images (~200 MB) per library without degradation. Due counts are computed via indexed Dexie queries (index on `deckId+due`). Search is an in-memory index built lazily. JSON export is assembled deck-by-deck into a `Blob` from parts (not one giant string). Images are resized to max 1600px on insert.
- **Interface language:** English UI in v1, but all UI strings live in one module so translation can be added later; layout uses CSS logical properties. Card content supports any language and script, including right-to-left (`dir="auto"` on rendered sides).
- **Day boundary:** a study day starts at 4:00 local time (configurable in Settings). Streaks, the heatmap and daily limits all use it.
- **Studying a folder:** each deck's own new/review limits apply. The session draws from all decks beneath the folder, interleaved, up to the sum of those limits.
- **Release order (milestones, all within v1):** (1) foundation: data model, repository, library tree, card editor, Markdown/code/math/images; (2) Learn mode with FSRS, gestures, keyboard; (3) import/export: JSON, CSV, bulk paste, share link; (4) other study modes: Quiz, Type, Match, Cram; (5) progress, confidence calibration, trouble cards; (6) read-aloud/pronunciation, printables, PWA/offline, sample decks, polish. If time runs short, milestone 6's printables and pronunciation are the first to slip.

## 7. Testing

- Unit tests (Vitest) for all pure domain modules listed above.
- Component tests (React Testing Library) for key flows: create deck → add cards → study session → ratings persisted.
- A small end-to-end smoke suite (Playwright) on a mobile viewport and a desktop viewport: create, study, export JSON, import JSON round-trip, share-link round-trip.

## 8. Decided by the user
- Version 1 is UI only, browser/local-first, no backend.
- Broad audience: tech learners, vocabulary learners, teachers.
- Flexible organisation (projects / topics / lessons).
- Works on mobile and desktop; very user-friendly.
- All seven creative features in v1 (share link, extra study modes, read-aloud/pronunciation, trouble cards, confidence calibration, printables, progress).
- Approach A (React + TS + Vite PWA).

## 9. Calls made by Claude (open to correction)
- Folders nest to any depth rather than fixed Project/Topic/Lesson levels.
- FSRS as the scheduling algorithm.
- Tailwind for styling; Dexie for storage.
- Only Learn mode affects scheduling.
- Share links omit review history and large images.
- Defaults: 20 new cards/day, 6 lapses = trouble, daily goal 20, backup reminder after 14 days.

## 10. Left to the builder
- Exact visual design, component library choices within the stack, icon set.
- Exact print layout dimensions.
- Sample deck content.
- Folder structure inside `src/`.
