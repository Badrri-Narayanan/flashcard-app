import { describe, expect, it } from 'vitest';
import { baseRecord } from '../../src/domain/ids';
import { cardsToCsv, decodeCsvBytes, guessMapping, parseCsv, rowsToDrafts } from '../../src/domain/csv';
import type { Card } from '../../src/domain/types';

function mkCard(over: Partial<Card>): Card {
  return {
    ...baseRecord(), deckId: 'd', type: 'basic', front: 'f', back: 'b', distractors: [], mnemonic: '', tags: [],
    langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}

describe('csv', () => {
  it('decodes UTF-8, and falls back to Windows-1252 for Excel files', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('café,日本'))).toEqual({ text: 'café,日本', encoding: 'utf-8' });
    expect(decodeCsvBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x80]))).toEqual({ text: 'café,€', encoding: 'windows-1252' });
  });

  it('reports the row of an unmatched quote instead of merging the rest of the file', () => {
    expect(parseCsv('front,back\nhola,hello\n"cafe,coffee\nuno,one\ndos,two').quoteErrorRow).toBe(3);
    expect(parseCsv('front,back\nhola,hello').quoteErrorRow).toBeNull();
  });

  it('handles BOM and CRLF', () => {
    const r = parseCsv('﻿front,back\r\nhola,hello\r\nadios,bye\r\n');
    expect(r.headers).toEqual(['front', 'back']);
    expect(r.rows).toEqual([['hola', 'hello'], ['adios', 'bye']]);
    expect(r.delimiter).toBe(',');
  });

  it('quoted field with comma and newline', () => {
    const r = parseCsv('front,back\n"x, y","line1\nline2"\n');
    expect(r.rows).toEqual([['x, y', 'line1\nline2']]);
  });

  it('semicolon delimiter detected', () => {
    const r = parseCsv('hola;hello\nadios;bye');
    expect(r.delimiter).toBe(';');
    expect(r.rows).toEqual([['hola', 'hello'], ['adios', 'bye']]);
  });

  it('headerless two-column file maps front/back', () => {
    const r = parseCsv('hola,hello\nadios,bye');
    expect(r.headers).toBeNull();
    expect(r.rows).toHaveLength(2);
    const mapping = guessMapping(r.headers, 2);
    expect(mapping).toEqual(['front', 'back']);
    expect(rowsToDrafts(r.rows, mapping)[0]).toMatchObject({ front: 'hola', back: 'hello', type: 'basic' });
  });

  it('maps headers by name and falls back to basic for unknown types', () => {
    const r = parseCsv('Term,Definition,Tags,Type\nq,a,x;y z,CLOZE\nq2,a2,,weird');
    const mapping = guessMapping(r.headers, 4);
    expect(mapping).toEqual(['front', 'back', 'tags', 'type']);
    const drafts = rowsToDrafts(r.rows, mapping);
    expect(drafts[0]).toMatchObject({ tags: ['x', 'y', 'z'], type: 'cloze' });
    expect(drafts[1]).toMatchObject({ tags: [], type: 'basic' });
  });

  it('cardsToCsv → parseCsv → rowsToDrafts round-trips text, tags and distractors', () => {
    const cards = [
      mkCard({ front: 'a, "b"', back: 'multi\nline', tags: ['t1', 't2'], type: 'mcq', distractors: ['x', 'y'], mnemonic: 'm' }),
      mkCard({ front: 'plain', back: 'ans' }),
    ];
    const csv = cardsToCsv(cards);
    expect(csv.split('\n')[0]).toBe('front,back,tags,type,mnemonic,distractors');
    const parsed = parseCsv(csv);
    const drafts = rowsToDrafts(parsed.rows, guessMapping(parsed.headers, 6));
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      front: 'a, "b"', back: 'multi\nline', tags: ['t1', 't2'], type: 'mcq', distractors: ['x', 'y'], mnemonic: 'm',
    });
    expect(drafts[1]).toMatchObject({ front: 'plain', back: 'ans', tags: [], distractors: [] });
  });
});

describe('csv export safety and escaping', () => {
  it('neutralises spreadsheet formulas on export and restores the text on import', () => {
    const card = mkCard({ front: '=HYPERLINK("http://evil")', back: '+1', mnemonic: '@me', distractors: ['-5', 'ok'], type: 'mcq' });
    const csv = cardsToCsv([card]);
    const [row] = parseCsv(csv).rows;
    expect(row[0].startsWith("'=")).toBe(true);
    expect(row[1]).toBe("'+1");
    expect(row[4]).toBe("'@me");
    const drafts = rowsToDrafts(parseCsv(csv).rows, guessMapping(parseCsv(csv).headers, 6));
    expect(drafts[0]).toMatchObject({ front: card.front, back: '+1', mnemonic: '@me', distractors: ['-5', 'ok'] });
  });

  it('round-trips tags with spaces or semicolons and distractors containing |', () => {
    const card = mkCard({ tags: ['two words', 'a;b', 'plain'], distractors: ['x|y', 'z'], type: 'mcq' });
    const parsed = parseCsv(cardsToCsv([card]));
    const [draft] = rowsToDrafts(parsed.rows, guessMapping(parsed.headers, 6));
    expect(draft).toMatchObject({ tags: ['two words', 'a;b', 'plain'], distractors: ['x|y', 'z'] });
  });
});
