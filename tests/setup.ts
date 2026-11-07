import { beforeEach } from "vitest";

if (!process.env.PAIRING_CODE_SECRET || process.env.PAIRING_CODE_SECRET.length < 16) {
  process.env.PAIRING_CODE_SECRET = "unit-test-pairing-secret-value";
}

// Captured before any test calls vi.useFakeTimers(). Vitest's worker reports
// results with an RPC that times out after 60s of not being read. A conversion
// file can stay inside microtasks longer than that, and the timeout then fires
// as an unhandled error after every test has passed.
const realSetImmediate = setImmediate;

beforeEach(async () => {
  await new Promise((resolve) => {
    realSetImmediate(resolve);
  });
});
