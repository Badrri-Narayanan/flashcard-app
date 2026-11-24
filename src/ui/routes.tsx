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

/** Later tasks add their routes here, before the catch-all. */
export const routes: RouteObject[] = [
  { path: '/print/:deckId/:layout?', element: <PrintPage /> },
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <LibraryPage /> },
      { path: '/folder/:id', element: <LibraryPage /> },
      { path: '/deck/:id', element: <DeckPage /> },
      { path: '/deck/:id/edit/:cardId?', element: <CardEditor /> },
      { path: '/study', element: <StudyHome /> },
      { path: '/study/:scope/:id/:mode', element: <StudyPage /> },
      { path: '/trouble', element: <TroublePage /> },
      { path: '/import', element: <ImportPage /> },
      { path: '/stats', element: <StatsPage /> },
      { path: '/share/*', element: <SharePreviewPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <ComingSoonPage /> },
    ],
  },
];
