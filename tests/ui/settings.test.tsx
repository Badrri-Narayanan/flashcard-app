import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { applySettings } from '../../src/ui/settings/applySettings';
import { DEFAULT_SETTINGS, useSettings } from '../../src/ui/settings/settings';
import { SettingsProvider } from '../../src/ui/settings/SettingsProvider';

afterEach(cleanup);

beforeEach(async () => {
  await db.delete();
  await db.open();
  document.documentElement.removeAttribute('style');
  document.documentElement.className = '';
});

describe('applySettings', () => {
  it('dark sets class', () => {
    const root = document.createElement('div');
    applySettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, root, false);
    expect(root.classList.contains('dark')).toBe(true);
    applySettings({ ...DEFAULT_SETTINGS, theme: 'light' }, root, true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('system theme follows prefersDark', () => {
    const root = document.createElement('div');
    applySettings({ ...DEFAULT_SETTINGS, theme: 'system' }, root, true);
    expect(root.classList.contains('dark')).toBe(true);
    applySettings({ ...DEFAULT_SETTINGS, theme: 'system' }, root, false);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('font hyperlegible sets --font-ui containing Atkinson Hyperlegible', () => {
    const root = document.createElement('div');
    applySettings({ ...DEFAULT_SETTINGS, font: 'hyperlegible' }, root, false);
    expect(root.style.getPropertyValue('--font-ui')).toContain('Atkinson Hyperlegible');
  });

  it('cardTextSize XL sets --card-scale 1.45', () => {
    const root = document.createElement('div');
    applySettings({ ...DEFAULT_SETTINGS, cardTextSize: 'XL' }, root, false);
    expect(root.style.getPropertyValue('--card-scale')).toBe('1.45');
  });

  it('sets density, reduce-motion and accent attributes', () => {
    const root = document.createElement('div');
    applySettings({ ...DEFAULT_SETTINGS, density: 'compact', reduceMotion: 'system', accent: 'rose' }, root, false);
    expect(root.dataset.density).toBe('compact');
    expect(root.dataset.reduceMotion).toBe('system');
    expect(root.dataset.accent).toBe('rose');
  });
});

function Probe() {
  const [s, update] = useSettings();
  return (
    <button onClick={() => update({ dailyGoal: 55, theme: 'dark' })}>
      goal:{s.dailyGoal}
    </button>
  );
}

describe('useSettings', () => {
  it('patch persists to kv and survives remount', async () => {
    const user = userEvent.setup();
    const first = render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('goal:20');
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('goal:55');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await waitFor(async () => {
      expect(((await repo.getKV('settings')) as { dailyGoal: number }).dailyGoal).toBe(55);
    });
    first.unmount();

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    expect(await screen.findByText('goal:55')).toBeInTheDocument();
  });

  it('a patch before load finishes keeps stored values', async () => {
    await repo.setKV('settings', { theme: 'dark' });
    render(
      <SettingsProvider>
        <Probe30 />
      </SettingsProvider>,
    );
    await waitFor(async () => {
      expect(await repo.getKV('settings')).toMatchObject({ theme: 'dark', dailyGoal: 30 });
    });
    expect(screen.getByRole('button')).toHaveTextContent('goal:30');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

function Probe30() {
  const [s, update] = useSettings();
  // Runs on mount, i.e. synchronously before the async kv load resolves.
  useEffect(() => update({ dailyGoal: 30 }), [update]);
  return <button>goal:{s.dailyGoal}</button>;
}
