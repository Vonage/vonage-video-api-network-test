/**
 * Integration tests for the built ESM dist bundle — public API only.
 *
 * 'network-test-dist' is a webpack alias (defined in karma.conf.dist.esm.mjs) that
 * points to the ESM bundle (dist/index.mjs). webpack-karma processes the .mjs file
 * as an ES module and preserves named exports, so standard import syntax works here.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
import NetworkTest, { ErrorNames } from 'network-test-dist';

describe('ESM dist bundle public API', () => {
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
      new (NetworkTest as any)(null, validCredentials);
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(error.name).toBe(ErrorNames.MISSING_OPENTOK_INSTANCE);
  });

  it('throws MissingSessionCredentialsError when credentials are missing', () => {
    let error: any = null;
    try {
      new (NetworkTest as any)(fakeOT, null);
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(error.name).toBe(ErrorNames.MISSING_SESSON_CREDENTIALS);
  });

  it('throws IncompleteSessionCredentialsError when credentials are incomplete', () => {
    let error: any = null;
    try {
      new (NetworkTest as any)(fakeOT, { applicationId: 'a' });
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(error.name).toBe(ErrorNames.INCOMPLETE_SESSON_CREDENTIALS);
  });
});
