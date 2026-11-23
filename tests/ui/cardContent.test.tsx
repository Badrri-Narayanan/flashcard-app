import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import CardContent from '../../src/ui/components/CardContent';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CardContent', () => {
  it('renders code block with hljs class', () => {
    const { container } = render(<CardContent markdown={'```js\nconst a = 1;\n```'} />);
    const code = container.querySelector('code.hljs');
    expect(code).toBeInTheDocument();
    expect(code).toHaveClass('language-js');
    expect(code!.querySelector('[class*="hljs-"]')).toBeInTheDocument();
  });

  it('renders $x^2$ via katex', () => {
    const { container } = render(<CardContent markdown="Square: $x^2$" />);
    expect(container.querySelector('.katex')).toBeInTheDocument();
  });

  it('wraps in dir=auto with the given lang', () => {
    const { container } = render(<CardContent markdown="hola" lang="es-ES" />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute('dir', 'auto');
    expect(root).toHaveAttribute('lang', 'es-ES');
  });

  it('media: link resolves to blob: URL and is revoked on unmount', async () => {
    const m = { ...baseRecord(), blob: new Blob(['x'], { type: 'image/png' }), mime: 'image/png', width: 1, height: 1 };
    await repo.putMedia(m);
    const create = vi.fn(() => 'blob:test-url');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true, writable: true });

    const { unmount } = render(<CardContent markdown={`![pic](media:${m.id})`} />);
    const img = await screen.findByAltText('pic');
    expect(img).toHaveAttribute('src', 'blob:test-url');
    unmount();
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:test-url'));
  });

  it('does not render javascript: links as live hrefs', () => {
    render(<CardContent markdown="[x](javascript:alert(1))" />);
    const a = screen.getByText('x').closest('a');
    expect(a?.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
  });
});
