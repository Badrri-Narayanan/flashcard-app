import type { RouteObject } from 'react-router-dom';
import AppShell from './layout/AppShell';
import LibraryPage from './library/LibraryPage';
import ComingSoonPage from './pages/ComingSoonPage';

/** Later tasks add their routes here, before the catch-all. */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <LibraryPage /> },
      { path: '/folder/:id', element: <LibraryPage /> },
      { path: '*', element: <ComingSoonPage /> },
    ],
  },
];
