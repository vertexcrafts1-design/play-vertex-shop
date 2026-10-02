(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.VertexCheckout = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const API = 'https://vertexcraft-api.vertexcrafts1.workers.dev';
  const links = Object.freeze({
    'bronze-30d':'https://buy.stripe.com/fZueV5dOtbp8eiUa9IdMI0k',
    'gold-30d':'https://buy.stripe.com/5kQfZ98u978S1w81DcdMI0l',
    'diamond-30d':'https://buy.stripe.com/bJe9ALfWB0KucaMa9IdMI0m',
    'bronze-permanent':'https://buy.stripe.com/bJe6oz4dT2SC8YA6XwdMI0n',
    'gold-permanent':'https://buy.stripe.com/fZu4grdOtctcfmY6XwdMI0o',
    'diamond-permanent':'https://buy.stripe.com/28E5kv7q5fFo2AcepYdMI0p',
    'crystals-1000':'https://buy.stripe.com/bJe4grbGl3WG5Mo3LkdMI0f',
    'crystals-2500':'https://buy.stripe.com/5kQ00b39P9h01w80z8dMI0g',
    'crystals-5000':'https://buy.stripe.com/eVqbITbGl3WGeiU0z8dMI0h',
    'crystals-10000':'https://buy.stripe.com/aFa4gr11Hctcgr2fu2dMI0i',
    'battlepass-premium':'https://buy.stripe.com/bJe00b8u9bp8deQ5TsdMI0j'
  });
  function validPlayer(name) {
    return typeof name === 'string' && name.length <= 32 && /^\.?[A-Za-z0-9_]{1,32}$/.test(name);
  }
  async function verifyPlayer(name, fetcher = fetch) {
    if (!validPlayer(name)) throw new Error('invalid_player');
    const response = await fetcher(`${API}/api/public/exists?name=${encodeURIComponent(name)}`, {
      headers:{Accept:'application/json'}, credentials:'omit', cache:'no-store',
      referrerPolicy:'no-referrer', signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('api_unavailable');
    const result = await response.json();
    if (result.exists !== true) throw new Error('player_missing');
    const canonical = typeof result.name === 'string' ? result.name : name;
    if (!validPlayer(canonical) || canonical.toLowerCase() !== name.toLowerCase()) throw new Error('invalid_response');
    return canonical;
  }
  function checkoutUrl(link, player, product) {
    if (!validPlayer(player) || !Object.hasOwn(links,product) || links[product] !== link) throw new Error('invalid_checkout');
    const url = new URL(link);
    // An attribution hint; the required Stripe custom field remains authoritative.
    url.searchParams.set('client_reference_id', `vertex_${player}`);
    url.searchParams.set('locale','de');
    return url.href;
  }
  function returnMessage(params) {
    return params.get('payment') === 'success'
      ? 'Willkommen zurück vom Checkout. Deinen Zahlungsstatus findest du bei Stripe und in der Bestätigungs-E-Mail. Die automatische Auslieferung startet nach der Bestätigung durch Stripe.'
      : '';
  }
  return Object.freeze({validPlayer,verifyPlayer,checkoutUrl,returnMessage,links});
});
