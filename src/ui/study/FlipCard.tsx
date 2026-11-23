import { useDrag } from '@use-gesture/react';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { Rating } from '../../domain/types';
import CardContent from '../components/CardContent';
import { useSettings } from '../settings/settings';
import { strings } from '../strings';
import type { Faces } from './faces';
import { swipeDecision, SWIPE_THRESHOLD_PX } from './swipe';
import { usePrefersReducedMotion } from './useKeyHints';

interface Props {
  faces: Faces;
  mnemonic: string;
  revealed: boolean;
  onFlip(): void;
  onSwipeRate?(rating: Rating): void;
}

function FrontFace({ faces }: Pick<Props, 'faces'>) {
  return <CardContent markdown={faces.front.text} lang={faces.front.lang} />;
}

function BackFace({ faces, mnemonic }: Pick<Props, 'faces' | 'mnemonic'>) {
  return (
    <div className="space-y-3">
      {faces.back.map((part, i) => (
        <div key={i} className={i > 0 ? 'border-t border-slate-200 pt-3 dark:border-slate-700' : ''}>
          <CardContent markdown={part.text} lang={part.lang} />
        </div>
      ))}
      {mnemonic.trim() && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <span className="font-semibold">{strings.study.mnemonic}: </span>
          {mnemonic}
        </p>
      )}
    </div>
  );
}

const faceClass = 'min-h-48 w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900';

export default function FlipCard({ faces, mnemonic, revealed, onFlip, onSwipeRate }: Props) {
  const [{ swipeGestures, flipAnimation }] = useSettings();
  const reduced = usePrefersReducedMotion();
  const animate = flipAnimation && !reduced;
  const [dx, setDx] = useState(0);
  const dragged = useRef(false);

  const bind = useDrag(
    ({ first, tap, active, movement: [mx] }) => {
      if (first) dragged.current = false;
      if (tap) return;
      dragged.current = true;
      if (active) {
        setDx(mx);
        return;
      }
      setDx(0);
      const decision = swipeDecision(mx, revealed);
      if (decision === 'flip') onFlip();
      else if (decision !== null) onSwipeRate?.(decision);
    },
    { enabled: swipeGestures, axis: 'x', filterTaps: true },
  );

  const handleClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onFlip();
  };
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') onFlip();
  };

  const progress = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD_PX);
  const showOverlay = swipeGestures && revealed && dx !== 0;
  const good = dx > 0;
  const style = {
    touchAction: 'pan-y' as const,
    transform: dx !== 0 && !reduced ? `translateX(${dx}px) rotate(${dx / 25}deg)` : undefined,
  };

  return (
    <div
      {...bind()}
      role="button"
      tabIndex={0}
      aria-label={strings.study.flipCard}
      aria-pressed={revealed}
      onClick={handleClick}
      onKeyDown={handleKey}
      style={style}
      className="relative cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {animate ? (
        <div className="[perspective:1200px]">
          <div
            className="grid transition-transform duration-300 [transform-style:preserve-3d]"
            style={{ transform: revealed ? 'rotateY(180deg)' : 'none' }}
          >
            <div aria-hidden={revealed} className={`${faceClass} [backface-visibility:hidden] [grid-area:1/1]`}>
              <FrontFace faces={faces} />
            </div>
            <div
              aria-hidden={!revealed}
              className={`${faceClass} [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]`}
            >
              <BackFace faces={faces} mnemonic={mnemonic} />
            </div>
          </div>
        </div>
      ) : (
        <div className={faceClass}>{revealed ? <BackFace faces={faces} mnemonic={mnemonic} /> : <FrontFace faces={faces} />}</div>
      )}
      {showOverlay && (
        <div
          aria-hidden
          data-testid="swipe-overlay"
          style={{ opacity: progress * 0.6 }}
          className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl text-3xl font-bold text-white ${
            good ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
        >
          {good ? strings.study.swipeGood : strings.study.swipeAgain}
        </div>
      )}
    </div>
  );
}
