const { chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8000/shop/';
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  let failed = 0;
  async function test(name, run) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {await run(page,context);console.log('PASS '+name);} catch (e) {failed++;console.log('FAIL '+name+': '+e.message);} finally {await context.close();}
  }
  await test('a return URL alone cannot confirm payment', async page => {
    await page.goto(origin+'?payment=success');
    assert.equal(/Zahlung abgeschlossen|Zahlung bestätigt/.test(await page.locator('body').innerText()),false);
  });
  await test('Bedrock purchase attribution is checked with the existing player API', async page => {
    let checked = '';
    await page.route('**/api/public/exists?*', async route => {
      checked = new URL(route.request().url()).searchParams.get('name');
      await route.fulfill({json:{exists:true,name:'.Gamefly'}});
    });
    await page.goto(origin);
    await page.locator('#loginButton').click();
    await page.locator('#loginInput').fill('.Gamefly');
    await page.locator('#loginSave').click();
    await page.waitForTimeout(800);
    assert.equal(checked,'.Gamefly');
    assert.match(await page.locator('#profileName').innerText(),/\.Gamefly/);
  });
  await test('a forged local player record cannot skip the server check before payment', async (page,context) => {
    await context.addInitScript(()=>localStorage.setItem('vertex_player_verified','MissingPlayer'));
    let payments = 0, checks = 0;
    await page.route('**/api/public/exists?*',route=>{checks++;return route.fulfill({json:{exists:false}});});
    await page.route('https://buy.stripe.com/**',route=>{payments++;return route.fulfill({body:'Payment must not open'});});
    await page.goto(origin);
    await page.locator('.buy-btn').first().click();
    await page.locator('#checkoutContinue').click();
    await page.locator('#checkoutStatus').filter({hasText:'noch nicht bekannt'}).waitFor();
    assert.equal(checks,1);
    assert.equal(payments,0);
    assert.ok(page.url().startsWith(origin));
  });
  await test('a category link opens the requested products', async page => {
    await page.goto(origin+'#ranks');
    assert.ok(await page.locator('[data-panel="ranks"]').isVisible());
  });
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
