const API='https://vertexcraft-api.vertexcrafts1.workers.dev';
const tabs=[...document.querySelectorAll('[data-tab]')];
const panels=[...document.querySelectorAll('[data-panel]')];
const loginModal=document.getElementById('loginModal');
const loginInput=document.getElementById('loginInput');
const loginButton=document.getElementById('loginButton');
const accountButton=document.getElementById('accountButton');
const sideLogin=document.getElementById('sideLogin');
const profileName=document.getElementById('profileName');
const profileHint=document.getElementById('profileHint');
const loginSave=document.getElementById('loginSave');
const buyButtons=[...document.querySelectorAll('.buy-btn[data-url]')];
let player=localStorage.getItem('vertex_player_verified')||'';

const statsLink=document.createElement('a');statsLink.href='https://web.play-vertex.com/stats.html';statsLink.textContent='Ranglisten';document.querySelector('.head-links')?.insertBefore(statsLink,loginButton);
const note=document.querySelector('.login-note');if(note)note.textContent='Dein Spielername wird live mit VertexCraft abgeglichen. Nur Accounts, die bereits mindestens einmal auf dem Server waren, können sich anmelden. Stripe fragt den Namen aktuell zusätzlich im Checkout ab.';

function setTab(name){tabs.forEach(t=>t.classList.toggle('active',t.dataset.tab===name));panels.forEach(p=>p.classList.toggle('active',p.dataset.panel===name));window.scrollTo({top:document.querySelector('.categorybar').offsetTop-80,behavior:'smooth'})}
tabs.forEach(t=>t.addEventListener('click',()=>setTab(t.dataset.tab)));
function validPlayer(name){return /^[A-Za-z0-9_]{1,32}$/.test(name.trim())}
function status(text,ok=false){let el=document.getElementById('loginStatus');if(!el){el=document.createElement('p');el.id='loginStatus';el.className='login-status';loginInput.insertAdjacentElement('afterend',el)}el.textContent=text;el.classList.toggle('verified',ok)}
function openLogin(){loginInput.value=player;status('');loginModal.classList.add('open');setTimeout(()=>loginInput.focus(),50)}
function closeLogin(){loginModal.classList.remove('open')}
function syncLogin(){const logged=validPlayer(player);loginButton.style.display=logged?'none':'inline-block';accountButton.style.display=logged?'inline-block':'none';if(logged){accountButton.textContent='👤 '+player;profileName.textContent=player;profileHint.textContent='Spieler auf VertexCraft bestätigt. Du kannst jetzt einkaufen.';sideLogin.textContent='Spieler wechseln';}else{profileName.textContent='Nicht angemeldet';profileHint.textContent='Nur Spieler, die bereits auf VertexCraft waren, können sich anmelden und einkaufen.';sideLogin.textContent='Jetzt anmelden';}buyButtons.forEach(b=>{b.classList.toggle('locked',!logged);b.textContent=logged?'Kaufen':'🔒 Login';});}
async function verifyPlayer(name){const r=await fetch(`${API}/api/public/exists?name=${encodeURIComponent(name)}`,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('api_failed');const d=await r.json();return d}
async function doLogin(){const value=loginInput.value.trim();if(!validPlayer(value)){status('Bitte einen gültigen Minecraft-Spielernamen eingeben.');return;}loginSave.disabled=true;loginSave.textContent='Prüfe …';status('Spieler wird auf VertexCraft geprüft …');try{const result=await verifyPlayer(value);if(!result.exists){status('Dieser Spieler war noch nie auf VertexCraft. Ein Shop-Login ist deshalb nicht möglich.');return;}player=result.name||value;localStorage.setItem('vertex_player_verified',player);status('Spieler bestätigt ✓',true);syncLogin();setTimeout(closeLogin,500);}catch(e){status('Die Spielerprüfung ist gerade nicht erreichbar. Prüfe, ob VertexPublicStatsWeb und die öffentliche Worker-Route aktiv sind.');}finally{loginSave.disabled=false;loginSave.textContent='Anmelden';}}
loginButton.addEventListener('click',openLogin);accountButton.addEventListener('click',openLogin);sideLogin.addEventListener('click',openLogin);document.getElementById('loginCancel').addEventListener('click',closeLogin);loginSave.addEventListener('click',doLogin);loginModal.addEventListener('click',e=>{if(e.target===loginModal)closeLogin()});loginInput.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
buyButtons.forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();if(!validPlayer(player)){openLogin();return;}sessionStorage.setItem('vertex_last_player',player);window.location.href=btn.dataset.url;}));
document.querySelectorAll('[data-copy]').forEach(btn=>btn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(btn.dataset.copy);const old=btn.textContent;btn.textContent='IP kopiert ✓';setTimeout(()=>btn.textContent=old,1600)}catch{}}));
const params=new URLSearchParams(location.search);if(params.get('payment')==='success'){const box=document.getElementById('successBox');const session=params.get('session_id');box.innerHTML='✓ Zahlung abgeschlossen. Willkommen zurück'+(player?' <strong>'+player+'</strong>':'')+'.'+(session?' Bestell-ID: <code>'+session.slice(0,18)+'…</code>':'');box.classList.add('show');history.replaceState({},'',location.pathname);}
syncLogin();