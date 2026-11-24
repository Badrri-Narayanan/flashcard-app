# Task 20 report: stats, streaks, calibration UI

Implemented domain/stats.ts, domain/calibration.ts, GoalRing (Library header), useDailyProgress hook, Stats page (streak, SVG heatmap, 14-day forecast, deck selector + breakdown, calibration chart with verdicts/overconfidence/card links), SessionSummary streak + goal status, /stats route, strings.

TDD: RED for domain: `npx vitest run tests/domain/stats.test.ts tests/domain/calibration.test.ts` failed (modules missing, 2 files failed). GREEN after implementing (20 tests). UI tests (tests/ui/stats.test.tsx) were written after the UI, passed first run.
Final: `npm test` 37 files / 357 tests pass; `npx tsc -b --noEmit` and `npm run lint` clean.

Existing tests App/exportMenu/library now wrap in SettingsContext.Provider because GoalRing calls useSettings.

Concerns / decisions:
- forecast skips new items (state 0): they are not reviews; otherwise day 0 is inflated by every unseen card. Suspended filtering is done by the caller (items carry no suspended flag).
- Streak / SessionSummary load 366 days of logs by `at` range (needed for streak length); GoalRing loads today only.
- Items of soft-deleted cards are excluded from breakdown only if the card is in the `cards` argument.
- Deck selector scopes breakdown/retention/forecast; streak, heatmap and calibration are global.
- Heatmap level legend shows level numbers; per-cell titles give date, count, level.
