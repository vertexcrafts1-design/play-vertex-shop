// Read-only source regression harness. All APIs and DOM objects are mocked.
// This checks actual shop-v3.js handlers, not native dialog focus or rendering.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const shopRoot = process.argv[2] || path.resolve(__dirname, '..');
const real = require(path.join(shopRoot, 'checkout-core.js'));
const html = fs.readFileSync(path.join(shopRoot, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(shopRoot, 'shop-v3.js'), 'utf8');

function harness(stored, api) {
  const els = new Map();
  const storage = new Map([['vertex_player_verified', stored]]);
  const calls = [], redirects = [];
  class Element {
    constructor(id) {
      this.id = id;
      this.listeners = {};
      this.dataset = {};
      this.open = false;
      this.hidden = false;
      this.textContent = '';
      this.classList = { toggle() {}, add() {}, remove() {} };
    }
    addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); }
    async fire(type) {
      for (const handler of this.listeners[type] ?? []) {
        await handler({ currentTarget: this, preventDefault() {} });
      }
    }
    focus() {}
    setAttribute() {}
    removeAttribute() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
    closest() {
      return { querySelector: query => ({ textContent: query === 'h3' ? 'Bronze' : '4,99 €' }) };
    }
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) els.set(id, new Element(id));
  const buy = new Element('buy');
  buy.dataset = { rank: 'bronze', product: 'bronze-30d', url: real.links['bronze-30d'] };
  const document = {
    getElementById: id => els.get(id),
    querySelectorAll: query => query === '.buy-btn' ? [buy] : [],
    activeElement: buy
  };
  const localStorage = {
    getItem: key => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  const location = { search: '', hash: '', pathname: '/', assign: url => redirects.push(url) };
  const core = {
    ...real,
    verifyPlayer: name => real.verifyPlayer(name, async (url, options) => {
      calls.push({ url, options });
      return api(url);
    })
  };
  const window = { VertexCheckout: core, location, addEventListener() {} };
  vm.runInNewContext(source, {
    window, document, localStorage, sessionStorage: { setItem() {} },
    location, history: {}, URLSearchParams, Date
  });
  return { els, buy, calls, redirects, storage };
}

(async () => {
  for (const mode of ['missing', 'offline', 'canonical_mismatch', 'valid_bedrock']) {
    const name = mode === 'valid_bedrock' ? '.Gamefly' : 'MissingPlayer';
    const h = harness(name, async () => {
      if (mode === 'offline') throw new Error('offline');
      return { ok: true, json: async () => ({
        exists: mode !== 'missing',
        name: mode === 'canonical_mismatch' ? 'OtherPlayer' : name
      }) };
    });
    await h.buy.fire('click');
    assert.equal(h.els.get('checkoutConfirm').open, true);
    assert.equal(h.calls.length, 0);
    await h.els.get('checkoutContinue').fire('click');
    assert.equal(h.calls.length, 1);
    assert.equal(new URL(h.calls[0].url).searchParams.get('name'), name);
    if (mode === 'valid_bedrock') {
      assert.equal(h.redirects.length, 1);
      assert.equal(new URL(h.redirects[0]).searchParams.get('client_reference_id'), 'vertex_.Gamefly');
    } else {
      assert.equal(h.redirects.length, 0);
      assert.ok(h.els.get('checkoutStatus').textContent);
    }
    console.log('PASS actual checkout handler:', mode);
  }
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const h = harness('KnownPlayer', async () => pending);
  await h.buy.fire('click');
  const running = h.els.get('checkoutContinue').fire('click');
  await h.els.get('checkoutCancel').fire('click');
  resolve({ ok: true, json: async () => ({ exists: true, name: 'KnownPlayer' }) });
  await running;
  assert.equal(h.redirects.length, 0);
  console.log('PASS cancelled checkout cannot redirect when preflight later succeeds');
  const forget = harness('KnownPlayer', async () => ({
    ok: true, json: async () => ({ exists: true, name: 'KnownPlayer' })
  }));
  await forget.els.get('forgetPlayer').fire('click');
  assert.equal(forget.storage.has('vertex_player_verified'), false);
  assert.equal(forget.els.get('profileName').textContent, 'Noch kein Spieler');
  console.log('PASS forget control removes stored recipient');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
