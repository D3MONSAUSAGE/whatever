import { beforeEach } from "vitest";

if (!process.env.PAIRING_CODE_SECRET || process.env.PAIRING_CODE_SECRET.length < 16) {
  process.env.PAIRING_CODE_SECRET = "unit-test-pairing-secret-value";
}

// A long conversion file stays inside microtasks, so the worker never reads
// the parent's reply. Vitest then reports "Timeout calling onTaskUpdate"
// once the file has run for more than 60 seconds. One real timer turn between
// tests lets that reply land.
beforeEach(async () => {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
});
