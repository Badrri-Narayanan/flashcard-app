import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SettingsContext } from '../../src/ui/settings/settings';
import FlipCard from '../../src/ui/study/FlipCard';
import type { Faces } from '../../src/ui/study/faces';

afterEach(cleanup);

const faces: Faces = {
  front: { text: 'See [the front link](https://example.com/front)', lang: 'en' },
  back: [{ text: 'See [the back link](https://example.com/back)', lang: 'en' }],
};

function renderCard(revealed: boolean, onFlip = vi.fn()) {
  render(
    <SettingsContext.Provider value={[{ ...DEFAULT_SETTINGS, flipAnimation: true }, () => undefined]}>
      <FlipCard faces={faces} mnemonic="" revealed={revealed} onFlip={onFlip} />
    </SettingsContext.Provider>,
  );
  return onFlip;
}

const faceOf = (linkName: string) => screen.getByRole('link', { name: linkName, hidden: true }).closest('[aria-hidden]')!;

describe('animated flip card', () => {
  it('makes the hidden face inert so its links cannot be reached before reveal', () => {
    renderCard(false);
    expect(faceOf('the back link')).toHaveAttribute('inert');
    expect(faceOf('the front link')).not.toHaveAttribute('inert');
    expect(screen.queryByRole('link', { name: 'the back link' })).not.toBeInTheDocument();
  });

  it('moves inert to the front face once revealed', () => {
    renderCard(true);
    expect(faceOf('the front link')).toHaveAttribute('inert');
    expect(faceOf('the back link')).not.toHaveAttribute('inert');
  });

  it('following a link inside the card does not flip it', async () => {
    const onFlip = renderCard(false);
    const link = screen.getByRole('link', { name: 'the front link' });
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.setup().click(link);
    expect(onFlip).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('region', { name: 'Card' }));
    expect(onFlip).toHaveBeenCalledTimes(1);
  });
});
