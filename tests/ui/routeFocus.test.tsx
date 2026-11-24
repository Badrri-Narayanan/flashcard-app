import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { DEFAULT_SETTINGS, SettingsContext } from '../../src/ui/settings/settings';
import { routes } from '../../src/ui/routes';

afterEach(cleanup);
beforeEach(async () => {
  await db.delete();
  await db.open();
  document.title = 'Flashcards';
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SettingsContext.Provider value={[DEFAULT_SETTINGS, () => undefined]}>
      <RouterProvider router={router} />
    </SettingsContext.Provider>,
  );
  return router;
}

describe('route changes', () => {
  it('set a page title per route', async () => {
    const router = renderAt('/');
    await waitFor(() => expect(document.title).toBe('Library · Flashcards'));
    await router.navigate('/stats');
    await waitFor(() => expect(document.title).toBe('Stats · Flashcards'));
    await router.navigate('/study');
    await waitFor(() => expect(document.title).toBe('Study · Flashcards'));
  });

  it('move focus to the main region after navigating with the nav', async () => {
    const user = userEvent.setup();
    renderAt('/');
    const settings = await screen.findByRole('link', { name: 'Settings' });
    await user.click(settings);
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')));
    expect(document.title).toBe('Settings · Flashcards');
  });

  it('do not steal focus on the first load', async () => {
    renderAt('/settings');
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    expect(document.activeElement).not.toBe(screen.getByRole('main'));
  });
});
