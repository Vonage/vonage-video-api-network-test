/**
 * Integration tests for the built dist bundle — public API only.
 *
 * 'network-test-dist' is a webpack alias (defined in karma.conf.dist.mjs) that
 * points to the local dist bundle. karma-webpack bundles it via the CJS branch of
 * the UMD wrapper, so module.exports = { default: NetworkTest, ErrorNames, ... }.
 * Webpack's CJS→ESM interop makes that whole object the default import.
 */
import distExports from 'network-test-dist';

// karma-webpack CJS interop: default import = module.exports = { default: NetworkTest, ErrorNames, ... }
const exports = distExports as any;
// eslint-disable-next-line @typescript-eslint/naming-convention
const NetworkTest = exports.default ?? exports;
// eslint-disable-next-line @typescript-eslint/naming-convention
const ErrorNames = exports.ErrorNames;

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
