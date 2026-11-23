import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom has no pointer capture; use-gesture calls it on pointerdown.
Object.assign(HTMLElement.prototype, {
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  hasPointerCapture: () => false,
});
