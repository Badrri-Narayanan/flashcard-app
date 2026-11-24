import { useEffect } from 'react';
import { useMatches } from 'react-router-dom';
import { strings } from '../strings';

export interface RouteHandle {
  title: string;
}

const hasTitle = (handle: unknown): handle is RouteHandle =>
  typeof handle === 'object' && handle !== null && typeof (handle as RouteHandle).title === 'string';

/** Sets `document.title` from the deepest matched route's `handle.title`. */
export function useRouteTitle(): void {
  const matches = useMatches();
  const page = [...matches].reverse().find((m) => hasTitle(m.handle))?.handle as RouteHandle | undefined;
  const title = page ? strings.app.pageTitle(page.title) : strings.app.title;
  useEffect(() => {
    document.title = title;
  }, [title]);
}
