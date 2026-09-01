import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Vitest doesn't auto-cleanup between tests the way Jest + RTL's jest environment does —
// without this, elements from one test's render() leak into the next test's queries.
afterEach(cleanup);

// jsdom has no ResizeObserver; Radix's Switch (via @radix-ui/react-use-size) needs one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
