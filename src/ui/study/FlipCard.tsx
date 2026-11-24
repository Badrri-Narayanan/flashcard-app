import { useDrag } from '@use-gesture/react';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import CardContent from '../components/CardContent';
import { useSettings } from '../settings/settings';
import PronounceButton from '../speech/PronounceButton';
import SpeakButton from '../speech/SpeakButton';
import { strings } from '../strings';
import type { Faces } from './faces';
import { swipeDecision, SWIPE_THRESHOLD_PX } from './swipe';
import { usePrefersReducedMotion } from './useKeyHints';

interface Props {
  faces: Faces;
  mnemonic: string;
  revealed: boolean;
  onFlip(): void;
  /** Swipe left = next card, swipe right = previous card. */
  onSwipe?(direction: 'next' | 'prev'): void;
  /** Which way the card slid in from, for the entrance animation. */
  enter?: CardEnter;
  /** Small label above the card, e.g. that it was skipped earlier. */
  badge?: string;
}

/** `shown` is false for the face hidden by the flip: it keeps its text but holds no reachable controls. */
function SpokenPart({ text, lang, pronounce, shown }: { text: string; lang: string; pronounce: boolean; shown: boolean }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CardContent markdown={text} lang={lang} />
        </div>
        {shown && <SpeakButton text={text} lang={lang} />}
      </div>
      {shown && pronounce && <PronounceButton target={text} lang={lang} />}
    </>
  );
}

function FrontFace({ faces, shown }: Pick<Props, 'faces'> & { shown: boolean }) {
  return <SpokenPart text={faces.front.text} lang={faces.front.lang} pronounce={false} shown={shown} />;
}

function BackFace({ faces, mnemonic, shown }: Pick<Props, 'faces' | 'mnemonic'> & { shown: boolean }) {
  return (
    <div className="space-y-3">
      {faces.back.map((part, i) => (
        <div key={i} className={i > 0 ? 'border-t border-slate-200 pt-3 dark:border-slate-700' : ''}>
          <SpokenPart text={part.text} lang={part.lang} pronounce shown={shown} />
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

/**
 * One side of the animated card. The hidden side stays mounted for the 3D flip, so it is made `inert` (set as an
 * attribute because React 18 does not know the prop): links inside it cannot be focused or clicked before reveal.
 */
function AnimatedFace({ hidden, className, live, children }: { hidden: boolean; className: string; live?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.toggleAttribute('inert', hidden);
  }, [hidden]);
  return (
    <div ref={ref} aria-hidden={hidden} aria-live={live ? 'polite' : undefined} className={className}>
      {children}
    </div>
  );
}

const faceClass =
  'min-h-56 w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-md dark:border-slate-700 dark:bg-slate-900';

export type CardEnter = 'next' | 'prev' | null;

/** Springy ease: the card overshoots a touch and settles, like a real card being turned over. */
const FLIP_EASE = 'cubic-bezier(0.34, 1.3, 0.64, 1)';

export default function FlipCard({ faces, mnemonic, revealed, onFlip, onSwipe, enter = null, badge }: Props) {
  const [{ swipeGestures, flipAnimation }] = useSettings();
  const reduced = usePrefersReducedMotion();
  const animate = flipAnimation && !reduced;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragged = useRef(false);

  const bind = useDrag(
    ({ first, tap, active, movement: [mx] }) => {
      if (first) dragged.current = false;
      if (tap) return;
      dragged.current = true;
      if (active) {
        setDragging(true);
        setDx(mx);
        return;
      }
      setDragging(false);
      setDx(0);
      const decision = swipeDecision(mx);
      if (decision) onSwipe?.(decision);
    },
    { enabled: swipeGestures, axis: 'x', filterTaps: true },
  );

  const handleClick = (e: MouseEvent) => {
    // A link inside the card is followed, not treated as a tap on the card.
    if (e.target instanceof Element && e.target.closest('a')) return;
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onFlip();
  };

  const progress = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD_PX);
  const showHint = swipeGestures && !!onSwipe && dx !== 0;
  const style = {
    touchAction: 'pan-y' as const,
    transform: dx !== 0 && !reduced ? `translateX(${dx}px) rotate(${dx / 20}deg)` : undefined,
    transition: dragging || reduced ? 'none' : 'transform 250ms ease-out',
  };
  const enterClass = animate && enter ? (enter === 'next' ? 'animate-card-in-next' : 'animate-card-in-prev') : '';

  return (
    <div className="relative">
      {badge && (
        <p className="mb-2 text-center">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
            {badge}
          </span>
        </p>
      )}
      <div className={enterClass}>
        <div
          {...bind()}
          role="region"
          aria-label={strings.study.card}
          onClick={handleClick}
          style={style}
          className="relative cursor-pointer select-none"
        >
          {animate ? (
            <div className="[perspective:1400px]">
              <div
                className="grid [transform-style:preserve-3d]"
                style={{
                  transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: `transform 650ms ${FLIP_EASE}`,
                }}
              >
                <AnimatedFace hidden={revealed} className={`${faceClass} [backface-visibility:hidden] [grid-area:1/1]`}>
                  <FrontFace faces={faces} shown={!revealed} />
                </AnimatedFace>
                <AnimatedFace
                  hidden={!revealed}
                  live
                  className={`${faceClass} [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]`}
                >
                  <BackFace faces={faces} mnemonic={mnemonic} shown={revealed} />
                </AnimatedFace>
              </div>
            </div>
          ) : (
            <div aria-live="polite" className={faceClass}>
              {revealed ? <BackFace faces={faces} mnemonic={mnemonic} shown /> : <FrontFace faces={faces} shown />}
            </div>
          )}
          {showHint && (
            <div
              aria-hidden
              data-testid="swipe-hint"
              style={{ opacity: progress }}
              className={`pointer-events-none absolute top-3 rounded-full bg-slate-900/80 px-3 py-1 text-sm font-semibold text-white ${
                dx < 0 ? 'end-3' : 'start-3'
              }`}
            >
              {dx < 0 ? `${strings.study.swipeNext} →` : `← ${strings.study.swipePrev}`}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={onFlip}
          aria-label={strings.study.flipCard}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-5 text-sm font-medium shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <span aria-hidden className={`inline-block ${animate ? 'transition-transform duration-500' : ''} ${revealed ? 'rotate-180' : ''}`}>
            ↻
          </span>
          {strings.study.flip}
        </button>
      </div>
    </div>
  );
}
