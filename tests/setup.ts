if (!process.env.PAIRING_CODE_SECRET || process.env.PAIRING_CODE_SECRET.length < 16) {
  process.env.PAIRING_CODE_SECRET = "unit-test-pairing-secret-value";
}
