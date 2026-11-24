import type { HeatCell, HeatLevel } from '../../domain/stats';
import { strings } from '../strings';

const SIZE = 12;
const GAP = 3;
const STEP = SIZE + GAP;
const LEVELS: HeatLevel[] = [0, 1, 2, 3, 4];

const FILL: Record<HeatLevel, string> = {
  0: 'fill-slate-200 dark:fill-slate-800',
  1: 'fill-accent-500/25',
  2: 'fill-accent-500/50',
  3: 'fill-accent-500/75',
  4: 'fill-accent-700 dark:fill-accent-500',
};

/** Weekday with Monday = 0, matching the ISO weeks used for streak freezes. */
function weekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export default function Heatmap({ cells }: { cells: HeatCell[] }) {
  const lead = cells.length > 0 ? weekday(cells[0].dayKey) : 0;
  const columns = Math.ceil((cells.length + lead) / 7);
  const width = columns * STEP;
  const height = 7 * STEP;
  return (
    <div>
      <div className="overflow-x-auto pb-2" tabIndex={0} role="group" aria-label={strings.stats.heatmapLabel}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-none">
          {cells.map((cell, i) => {
            const slot = i + lead;
            return (
              <rect
                key={cell.dayKey}
                x={Math.floor(slot / 7) * STEP}
                y={(slot % 7) * STEP}
                width={SIZE}
                height={SIZE}
                rx={2}
                className={FILL[cell.level]}
              >
                <title>{strings.stats.heatCell(cell.dayKey, cell.count, cell.level)}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span>{strings.stats.legendLess}</span>
        {LEVELS.map((level) => (
          <span key={level} className="flex items-center gap-1">
            <svg width={SIZE} height={SIZE} aria-hidden>
              <rect width={SIZE} height={SIZE} rx={2} className={FILL[level]} />
            </svg>
            <span>{level}</span>
          </span>
        ))}
        <span>{strings.stats.legendMore}</span>
      </div>
    </div>
  );
}
