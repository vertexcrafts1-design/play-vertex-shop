(() => {
  'use strict';
  const core = window.VertexCheckout;
  const $ = id => document.getElementById(id);
  const modal = $('loginModal'), confirm = $('checkoutConfirm');
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  let player = '', pendingProduct, opener, busy = false, operation = 0;
  try { player = localStorage.getItem('vertex_player_verified') || ''; } catch {}
  if (!core.validPlayer(player)) player = '';
  function savePlayer(name) { player = name; try { if(name)localStorage.setItem('vertex_player_verified',name);else localStorage.removeItem('vertex_player_verified'); } catch {} syncPlayer(); }
  function syncPlayer() {
    $('loginButton').hidden=Boolean(player); $('accountButton').hidden=!player;
    $('accountButton').textContent=player || 'Spieler wechseln';
    $('profileName').textContent=player || 'Noch kein Spieler';
    $('profileHint').textContent=player ? 'Ausgewählter Empfänger. Wir prüfen den Namen vor jedem Checkout erneut.' : 'Wähle deinen Minecraft-Namen, damit wir den Artikel richtig zuordnen können.';
    $('sideLogin').textContent=player ? 'Spieler wechseln' : 'Spieler wählen';
    $('forgetPlayer').hidden=!player;
  }
  $('forgetPlayer').addEventListener('click',()=>savePlayer(''));
  function status(text,ok=false) { $('loginStatus').textContent=text; $('loginStatus').classList.toggle('verified',ok); }
  function openPlayer(trigger) {
    opener=trigger || document.activeElement; $('loginInput').value=player; status(''); modal.showModal(); $('loginInput').focus();
  }
  modal.addEventListener('close',()=>{operation++; opener?.focus();});
  $('loginCancel').addEventListener('click',()=>{pendingProduct=null;modal.close();});
  modal.addEventListener('cancel',()=>{pendingProduct=null;});
  ['loginButton','accountButton','sideLogin'].forEach(id=>$(id).addEventListener('click',event=>{pendingProduct=null;openPlayer(event.currentTarget);}));
  const messages = {
    player_missing:'Dieser Spieler ist noch nicht bekannt. Spiele einmal auf VertexCraft und prüfe dann deinen Namen erneut.',
    invalid_player:'Bitte gib einen gültigen Spielernamen ein. Bei Bedrock gehört das Präfix dazu.',
    invalid_response:'Der Name konnte nicht eindeutig zugeordnet werden. Bitte prüfe ihn noch einmal.'
  };
  const errorMessage = error => messages[error.message] || 'Die Spielerprüfung ist gerade nicht erreichbar. Bitte versuche es später erneut oder melde dich beim Support.';
  $('playerForm').addEventListener('submit', async event => {
    event.preventDefault(); if(busy)return;
    const name=$('loginInput').value.trim();
    if(!core.validPlayer(name)){status(messages.invalid_player);return;}
    busy=true; const current=++operation; $('loginSave').disabled=true; $('loginSave').textContent='Prüfe …'; status('Spieler wird auf VertexCraft geprüft …');
    try {
      const canonical=await core.verifyPlayer(name);
      if(current!==operation || !modal.open)return;
      savePlayer(canonical); const next=pendingProduct; pendingProduct=null; modal.close(); if(next)showCheckout(next);
    } catch(error) { if(current===operation && modal.open)status(errorMessage(error)); }
    finally {busy=false; $('loginSave').disabled=false; $('loginSave').textContent='Spieler prüfen';}
  });
  function showCheckout(button) {
    if(!player){pendingProduct=button;openPlayer(button);return;}
    pendingProduct=button; opener=button;
    const article=button.closest('article');
    const term=button.dataset.rank ? ' · '+(button.dataset.product.endsWith('30d')?'30 Tage':'Dauerhaft') : '';
    $('confirmProduct').textContent=article.querySelector('h3').textContent+term;
    $('confirmPrice').textContent=article.querySelector('.product-price strong').textContent;
    $('confirmPlayer').textContent=player; $('checkoutStatus').textContent=''; confirm.showModal();
  }
  document.querySelectorAll('.buy-btn').forEach(button=>button.addEventListener('click',()=>showCheckout(button)));
  $('checkoutCancel').addEventListener('click',()=>confirm.close());
  confirm.addEventListener('close',()=>{operation++;pendingProduct=null;opener?.focus();});
  $('checkoutContinue').addEventListener('click', async () => {
    if(busy || !pendingProduct)return;
    busy=true; const current=++operation, button=pendingProduct, name=player;
    $('checkoutContinue').disabled=true; $('checkoutContinue').textContent='Prüfe …'; $('checkoutStatus').textContent='Der Empfänger wird noch einmal geprüft.';
    try {
      const canonical=await core.verifyPlayer(name);
      if(current!==operation || !confirm.open)return;
      const url=core.checkoutUrl(button.dataset.url,canonical,button.dataset.product);
      try {sessionStorage.setItem('vertex_last_player',canonical);}catch{}
      window.location.assign(url);
    } catch(error) { if(current===operation && confirm.open)$('checkoutStatus').textContent=errorMessage(error); }
    finally {busy=false; $('checkoutContinue').disabled=false; $('checkoutContinue').textContent='Zu Stripe';}
  });
  function setTab(name) {
    if(!tabs.some(tab=>tab.dataset.tab===name))name='ranks';
    tabs.forEach(tab=>{const selected=tab.dataset.tab===name;tab.classList.toggle('active',selected);if(selected)tab.setAttribute('aria-current','true');else tab.removeAttribute('aria-current');});
    panels.forEach(panel=>panel.hidden=panel.dataset.panel!==name);
  }
  tabs.forEach(tab=>tab.addEventListener('click',event=>{event.preventDefault();history.pushState({},'','#'+tab.dataset.tab);setTab(tab.dataset.tab);}));
  window.addEventListener('hashchange',()=>setTab(location.hash.slice(1)));
  window.addEventListener('popstate',()=>setTab(location.hash.slice(1)));
  document.querySelectorAll('[data-duration]').forEach(button=>button.addEventListener('click',()=>{
    const duration=button.dataset.duration;
    document.querySelectorAll('[data-duration]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-rank-price]').forEach(item=>item.textContent=item.getAttribute('data-'+duration));
    document.querySelectorAll('[data-rank-term]').forEach(item=>item.textContent=duration==='30d'?'für 30 Tage · einmalig':'dauerhaft · einmalig');
    document.querySelectorAll('[data-rank].buy-btn').forEach(item=>{item.dataset.product=item.dataset.rank+'-'+duration;item.dataset.url=core.links[item.dataset.product];});
  }));
  const params=new URLSearchParams(location.search), message=core.returnMessage(params);
  if(message){$('successBox').textContent=message;$('successBox').hidden=false;params.delete('payment');params.delete('session_id');history.replaceState({},'',location.pathname+(params.size?'?'+params:'')+location.hash);}
  $('year').textContent=new Date().getFullYear(); syncPlayer(); setTab(location.hash.slice(1));
})();
