import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SettingsContext } from '../../src/ui/settings/settings';
import App from '../../src/ui/App';

describe('App', () => {
  it('renders app shell', () => {
    render(<SettingsContext.Provider value={[DEFAULT_SETTINGS, () => undefined]}><App /></SettingsContext.Provider>);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
