import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { strings } from '../strings';
import ComingSoonPage from '../pages/ComingSoonPage';
import CramMode from './CramMode';
import LearnMode from './LearnMode';
import MatchGame from './MatchGame';
import QuizMode from './QuizMode';
import TypeMode from './TypeMode';
import { useStudyScope } from './useStudyScope';

export default function StudyPage() {
  const { scope, id, mode } = useParams();
  const resolved = useStudyScope(scope, id);
  const deckIds = useMemo(() => (resolved.status === 'ready' ? resolved.deckIds : []), [resolved]);

  if (mode !== 'learn' && mode !== 'cram' && mode !== 'quiz' && mode !== 'type' && mode !== 'match') {
    return <ComingSoonPage />;
  }
  if (resolved.status === 'loading') return <p className="p-8 text-center">{strings.common.loading}</p>;
  if (resolved.status === 'missing') {
    return (
      <section className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
        <p>{strings.study.scopeNotFound}</p>
        <Link to="/study" className="underline">{strings.study.back}</Link>
      </section>
    );
  }
  const base = `/study/${scope}/${id}`;
  if (mode === 'type') return <TypeMode key={base} deckIds={deckIds} backTo={resolved.backTo} learnHref={`${base}/learn`} />;
  if (mode === 'match') return <MatchGame key={base} deckIds={deckIds} backTo={resolved.backTo} trackBest={scope === 'deck'} />;
  if (mode === 'quiz') return <QuizMode key={base} deckIds={deckIds} backTo={resolved.backTo} learnHref={`${base}/learn`} />;
  return mode === 'learn' ? (
    <LearnMode key={base} deckIds={deckIds} backTo={resolved.backTo} cramHref={`${base}/cram`} />
  ) : (
    <CramMode key={base} deckIds={deckIds} backTo={resolved.backTo} />
  );
}
