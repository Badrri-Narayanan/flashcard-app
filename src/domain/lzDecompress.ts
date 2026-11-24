const URI_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
const URI_VALUE = new Map([...URI_ALPHABET].map((ch, i) => [ch, i]));
const BITS_PER_CHAR = 6;

/**
 * lz-string's `decompressFromEncodedURIComponent`, ported so it can stop as soon as the output passes `maxChars`.
 * A hostile share link can otherwise expand to gigabytes. Returns null for an over-long or damaged input, and
 * otherwise exactly what lz-string returns.
 */
export function decompressUriCapped(input: string, maxChars: number): string | null {
  if (input === '') return null;
  const text = input.replace(/ /g, '+');
  const length = text.length;
  const reset = 1 << (BITS_PER_CHAR - 1);
  const valueAt = (i: number) => URI_VALUE.get(text.charAt(i)) ?? 0;
  let val = valueAt(0);
  let position = reset;
  let index = 1;

  const readBits = (count: number): number => {
    let bits = 0;
    const max = 2 ** count;
    for (let power = 1; power !== max; power *= 2) {
      const bit = val & position;
      position >>= 1;
      if (position === 0) {
        position = reset;
        val = valueAt(index++);
      }
      if (bit > 0) bits += power;
    }
    return bits;
  };

  const dictionary: string[] = [];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;

  const first = readBits(2);
  if (first === 2) return '';
  if (first === 3) return null;
  const c = String.fromCharCode(readBits(first === 0 ? 8 : 16));
  dictionary[3] = c;
  let w = c;
  const result = [c];
  let total = c.length;

  for (;;) {
    if (index > length) return '';
    let code = readBits(numBits);
    if (code === 0 || code === 1) {
      dictionary[dictSize++] = String.fromCharCode(readBits(code === 0 ? 8 : 16));
      code = dictSize - 1;
      enlargeIn--;
    } else if (code === 2) {
      return result.join('');
    }
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }

    let entry: string;
    if (dictionary[code]) entry = dictionary[code];
    else if (code === dictSize) entry = w + w.charAt(0);
    else return null;

    total += entry.length;
    if (total > maxChars) return null;
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  }
}
