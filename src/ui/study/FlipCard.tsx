import { useDrag } from '@use-gesture/react';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { Rating } from '../../domain/types';
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
  onSwipeRate?(rating: Rating): void;
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
  const showOverlay = swipeGestures && revealed && dx !== 0;
  const good = dx > 0;
  const style = {
    touchAction: 'pan-y' as const,
    transform: dx !== 0 && !reduced ? `translateX(${dx}px) rotate(${dx / 25}deg)` : undefined,
  };

  return (
    <div className="relative">
      <button type="button" onClick={onFlip} className="sr-only focus:not-sr-only focus:mb-2 focus:rounded focus:bg-slate-200 focus:px-2 focus:py-1 focus:text-sm dark:focus:bg-slate-800">
        {strings.study.flipCard}
      </button>
    <div
      {...bind()}
      role="region"
      aria-label={strings.study.card}
      onClick={handleClick}
      style={style}
      className="relative cursor-pointer select-none"
    >
      {animate ? (
        <div className="[perspective:1200px]">
          <div
            className="grid transition-transform duration-300 [transform-style:preserve-3d]"
            style={{ transform: revealed ? 'rotateY(180deg)' : 'none' }}
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
        <div aria-live="polite" className={faceClass}>{revealed ? <BackFace faces={faces} mnemonic={mnemonic} shown /> : <FrontFace faces={faces} shown />}</div>
      )}
      {showOverlay && (
        <div
          aria-hidden
          data-testid="swipe-overlay"
          style={{ opacity: progress * 0.6 }}
          className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl text-3xl font-bold text-white ${
            good ? 'bg-emerald-700' : 'bg-rose-700'
          }`}
        >
          {good ? strings.study.swipeGood : strings.study.swipeAgain}
        </div>
      )}
    </div>
    </div>
  );
}
