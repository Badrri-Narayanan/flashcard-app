import { describe, expect, it } from 'vitest';
import { parseClozeNumbers, renderCloze } from '../../src/domain/cloze';

describe('parseClozeNumbers', () => {
  it('returns sorted unique explicit numbers', () => {
    expect(parseClozeNumbers('{{c1::a}} {{c3::b}} {{c1::c}}')).toEqual([1, 3]);
  });
  it('numbers bare blanks in order from 1', () => {
    expect(parseClozeNumbers('{{x}} and {{y}}')).toEqual([1, 2]);
  });
  it('numbers bare blanks after the highest explicit number', () => {
    expect(parseClozeNumbers('{{c2::a}} {{b}}')).toEqual([2, 3]);
  });
  it('supports hints', () => {
    expect(parseClozeNumbers('{{c2::ans::hint}}')).toEqual([2]);
  });
  it('treats c0 and non-numeric cX as bare blanks', () => {
    expect(parseClozeNumbers('{{c0::x}} {{cX::y}}')).toEqual([1, 2]);
  });
  it('tokenizes blanks whose answer spans a newline', () => {
    expect(parseClozeNumbers('{{c1::line1\nline2}}')).toEqual([1]);
  });
  it('returns empty for text without blanks', () => {
    expect(parseClozeNumbers('plain')).toEqual([]);
  });
});

describe('renderCloze', () => {
  const text = 'Capital of {{c1::France}} is {{c2::Paris::city}}';
  it('hides the active blank with its hint', () => {
    expect(renderCloze(text, 2, false)).toBe('Capital of France is **[city]**');
  });
  it('reveals the active blank in bold', () => {
    expect(renderCloze(text, 2, true)).toBe('Capital of France is **Paris**');
  });
  it('uses an ellipsis when there is no hint', () => {
    expect(renderCloze(text, 1, false)).toBe('Capital of **[…]** is Paris');
  });
  it('falls back to an ellipsis for an empty hint', () => {
    expect(renderCloze('{{c1::a::}}', 1, false)).toBe('**[…]**');
  });
  it('hides all occurrences of the same number together', () => {
    expect(renderCloze('{{c1::a}} {{c1::b}}', 1, false)).toBe('**[…]** **[…]**');
  });
  it('renders bare blanks using their assigned numbers', () => {
    expect(renderCloze('{{c2::a}} {{b}}', 3, false)).toBe('a **[…]**');
  });
  it('treats c0 as a bare blank with literal text', () => {
    expect(renderCloze('{{c0::x}}', 1, true)).toBe('**c0::x**');
  });
});
