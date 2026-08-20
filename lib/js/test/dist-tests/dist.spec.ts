/**
 * Integration tests for the built dist bundle — public API only.
 *
 * 'network-test-dist' is a webpack alias (defined in karma.conf.dist.mjs) that
 * points to the local dist bundle (UMD format). We use require() to load it
 * because the UMD wrapper's `typeof exports` check conflicts with webpack 5's
 * ESM-style module wrapping when loaded via `import`.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/naming-convention
const distExports = require('network-test-dist');

// UMD bundle's module.exports = { default: NetworkTest, ErrorNames, ... }
// eslint-disable-next-line @typescript-eslint/naming-convention
const NetworkTest = distExports.default ?? distExports;
// eslint-disable-next-line @typescript-eslint/naming-convention
const ErrorNames = distExports.ErrorNames;

describe('dist bundle public API', () => {
  const validCredentials = { applicationId: 'a', sessionId: 'b', token: 'c' };
  const fakeOT = { initSession: () => {} };

  it('exports NetworkTest as a callable constructor', () => {
    expect(typeof NetworkTest).toBe('function');
  });

  it('exports ErrorNames with the expected public values', () => {
    expect(ErrorNames).toBeDefined();
    expect(ErrorNames.MISSING_OPENTOK_INSTANCE).toBe('MissingOpenTokInstanceError');
    expect(ErrorNames.MISSING_SESSON_CREDENTIALS).toBe('MissingSessionCredentialsError');
    expect(ErrorNames.INCOMPLETE_SESSON_CREDENTIALS).toBe('IncompleteSessionCredentialsError');
  });

  it('throws MissingOpenTokInstanceError when OT instance is missing', () => {
    let error: any = null;
    try {
      new NetworkTest(null, validCredentials);
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(error.name).toBe(ErrorNames.MISSING_OPENTOK_INSTANCE);
  });

  it('throws MissingSessionCredentialsError when credentials are missing', () => {
    let error: any = null;
    try {
      new NetworkTest(fakeOT, null);
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(error.name).toBe(ErrorNames.MISSING_SESSON_CREDENTIALS);
  });

  it('throws IncompleteSessionCredentialsError when credentials are incomplete', () => {
    let error: any = null;
    try {
      new NetworkTest(fakeOT, { applicationId: 'a' });
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(error.name).toBe(ErrorNames.INCOMPLETE_SESSON_CREDENTIALS);
  });
});
