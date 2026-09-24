import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Not using vitest's `globals: true`, so React Testing Library's own
// automatic cleanup (which relies on detecting Jest-style globals) never
// kicks in — without this, one test's rendered DOM leaks into the next.
afterEach(() => {
  cleanup();
});
