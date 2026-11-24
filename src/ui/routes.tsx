import type { RouteObject } from 'react-router-dom';
import AppShell from './layout/AppShell';
import LibraryPage from './library/LibraryPage';
import CardEditor from './editor/CardEditor';
import DeckPage from './editor/DeckPage';
import StudyHome from './study/StudyHome';
import StudyPage from './study/StudyPage';
import TroublePage from './trouble/TroublePage';
import ImportPage from './import/ImportPage';
import StatsPage from './stats/StatsPage';
import SharePreviewPage from './share/SharePreviewPage';
import PrintPage from './print/PrintPage';
import SettingsPage from './settings/SettingsPage';
import ComingSoonPage from './pages/ComingSoonPage';
import RouteError from './layout/RouteError';
import type { RouteHandle } from './layout/useRouteTitle';
import { strings } from './strings';

const p = strings.pages;
const title = (page: string): RouteHandle => ({ title: page });

/** Later tasks add their routes here, before the catch-all. */
export const routes: RouteObject[] = [
  { path: '/print/:deckId/:layout?', element: <PrintPage />, errorElement: <RouteError />, handle: title(p.print) },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        // Pathless so a failing page is replaced inside the shell, keeping the nav and storage banner.
        errorElement: <RouteError />,
        children: [
          { path: '/', element: <LibraryPage />, handle: title(p.library) },
          { path: '/folder/:id', element: <LibraryPage />, handle: title(p.folder) },
          { path: '/deck/:id', element: <DeckPage />, handle: title(p.deck) },
          { path: '/deck/:id/edit/:cardId?', element: <CardEditor />, handle: title(p.editCard) },
          { path: '/study', element: <StudyHome />, handle: title(p.study) },
          { path: '/study/:scope/:id/:mode', element: <StudyPage />, handle: title(p.study) },
          { path: '/trouble', element: <TroublePage />, handle: title(p.trouble) },
          { path: '/import', element: <ImportPage />, handle: title(p.import) },
          { path: '/stats', element: <StatsPage />, handle: title(p.stats) },
          { path: '/share/*', element: <SharePreviewPage />, handle: title(p.share) },
          { path: '/settings', element: <SettingsPage />, handle: title(p.settings) },
          { path: '*', element: <ComingSoonPage />, handle: title(p.comingSoon) },
        ],
      },
    ],
  },
];
