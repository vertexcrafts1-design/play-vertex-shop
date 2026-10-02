const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shop-v3.js'), 'utf8');
const corePath = path.join(root, 'checkout-core.js');
const core = fs.existsSync(corePath) ? require(corePath) : {
  validPlayer: vm.runInNewContext('(' + source.match(/^function validPlayer[^\n]+/m)[0] + ')'),
  returnMessage: () => source.includes('✓ Zahlung abgeschlossen.') ? 'Zahlung abgeschlossen.' : ''
};
test('Floodgate Bedrock names retain their prefix', () => {
  assert.equal(core.validPlayer('.Gamefly'), true);
  assert.equal(core.validPlayer('.Bedrock_Player'), true);
});
test('player names reject whitespace, injection and oversized names', () => {
  for (const name of ['', '<script>', '../admin', 'Two Players', 'A'.repeat(33)]) assert.equal(core.validPlayer(name), false, name);
  assert.equal(core.validPlayer('Gamefly03h'), true);
});
test('a return parameter cannot establish a successful payment', () => {
  assert.doesNotMatch(core.returnMessage(new URLSearchParams('payment=success&session_id=cs_live_fake')), /Zahlung abgeschlossen|Zahlung bestätigt/);
});
test('the checkout preflight rejects a missing or unreachable player', async () => {
  assert.equal(typeof core.verifyPlayer, 'function');
  await assert.rejects(core.verifyPlayer('Missing', async () => ({ok:true,json:async()=>({exists:false})})), /player_missing/);
  await assert.rejects(core.verifyPlayer('Player', async () => ({ok:false})), /api_unavailable/);
  await assert.rejects(core.verifyPlayer('Player', async () => {throw new Error('offline');}));
});
test('canonical attribution must match the player being checked', async () => {
  assert.equal(typeof core.verifyPlayer, 'function');
  let checked;
  const result = await core.verifyPlayer('.Gamefly', async url => {checked=new URL(url).searchParams.get('name');return {ok:true,json:async()=>({exists:true,name:'.Gamefly'})};});
  assert.equal(checked,'.Gamefly'); assert.equal(result,'.Gamefly');
  await assert.rejects(core.verifyPlayer('OnePlayer', async () => ({ok:true,json:async()=>({exists:true,name:'AnotherPlayer'})})), /invalid_response/);
});
test('only listed Stripe links can be used for checkout', () => {
  assert.equal(typeof core.checkoutUrl, 'function');
  const allowed = 'https://buy.stripe.com/fZueV5dOtbp8eiUa9IdMI0k';
  assert.ok(core.checkoutUrl(allowed,'Gamefly03h','bronze-30d').startsWith(allowed));
  for (const url of ['javascript:alert(1)', 'https://buy.stripe.com.evil.example/a', 'https://buy.stripe.com/unknown']) assert.throws(()=>core.checkoutUrl(url,'Player','bronze-30d'));
});
