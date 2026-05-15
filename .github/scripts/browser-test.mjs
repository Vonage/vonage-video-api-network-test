import { chromium } from 'playwright';

const bundle = process.env.BUNDLE;
const browser = await chromium.launch();
const page = await browser.newPage();

page.on('pageerror', err => { console.error('Page error:', err.message); });

await page.addScriptTag({ path: bundle });

const result = await page.evaluate(() => {
  const bundle = window.OpenTokNetworkConnectivity;
  const NT = bundle?.default ?? bundle;
  if (typeof NT !== 'function') return 'not-a-constructor:' + typeof NT;

  // Test 1: null OT instance → MissingOpenTokInstanceError
  try {
    new NT(null, { applicationId: 'a', sessionId: 'b', token: 'c' });
    return 'test1:should-have-thrown';
  } catch (e) {
    if (e.name !== 'MissingOpenTokInstanceError') return 'test1:wrong-error:' + e.name;
  }

  // Test 2: null credentials → MissingSessionCredentialsError
  const fakeOT = { initSession: () => {} };
  try {
    new NT(fakeOT, null);
    return 'test2:should-have-thrown';
  } catch (e) {
    if (e.name !== 'MissingSessionCredentialsError') return 'test2:wrong-error:' + e.name;
  }

  return 'pass';
});

await browser.close();

if (result !== 'pass') {
  console.error('❌ Browser test failed:', result);
  process.exit(1);
}
console.log('✅ Browser test passed — NetworkTest constructor validation works in real Chromium');
