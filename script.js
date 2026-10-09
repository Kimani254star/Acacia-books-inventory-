/* Public home page: single-view navigation, same behaviour as the Support site */
  function hpMore(btn){
    var card=btn.closest('.hp-tier');
    var open=card.classList.toggle('hp-open');
    btn.innerHTML=open?'Show less &#9652;':'Show '+btn.getAttribute('data-n')+' more features &#9662;';
  }
  function hpBillingToggle(){
    var yearly=document.getElementById('hpBilling').checked;
    document.querySelectorAll('#homePage .hp-amt').forEach(function(el){
      var p=yearly?+el.getAttribute('data-year'):+el.getAttribute('data-month');
      el.textContent='KES '+p.toLocaleString('en-US');
      var per=el.parentElement.querySelector('.hp-per');
      if(per) per.textContent=yearly?'/yr':'/mo';
    });
  }
(function(){
  var root=document.getElementById('homePage');
  var slides=root.querySelectorAll('.hp-slide'),si=0;
  setInterval(function(){
    if(root.style.display!=='block'||slides.length<2) return;
    slides[si].classList.remove('active'); si=(si+1)%slides.length; slides[si].classList.add('active');
  },5000);
  var nav=document.getElementById('hpNav'),burger=document.getElementById('hpBurger');
  burger.addEventListener('click',function(){
    var open=nav.classList.toggle('open');
    burger.setAttribute('aria-expanded',open?'true':'false');
  });
  var pages=root.querySelectorAll('.hp-page');
  var valid={top:1,about:1,features:1,process:1,pricing:1,faq:1,contact:1};
  function show(id){
    if(!valid[id]) id='top';
    pages.forEach(function(p){p.classList.toggle('hp-active',p.getAttribute('data-page')===id);});
    root.querySelectorAll('.hp-nav a').forEach(function(a){a.classList.toggle('hp-current',a.getAttribute('href')==='#'+id);});
    nav.classList.remove('open'); burger.setAttribute('aria-expanded','false');
    root.scrollTop=0;
  }
  root.querySelectorAll('a[data-scroll]').forEach(function(a){
    a.addEventListener('click',function(e){ e.preventDefault(); show(a.getAttribute('href').slice(1)); });
  });
  var y=document.getElementById('footerYear'); if(y) y.textContent=new Date().getFullYear();
  show('top');
  window.hpShowPage=show;
})();
function hpShowHome(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('homePage').style.display='block';
  window.hpShowPage&&window.hpShowPage('top');
}
function hpHideHome(){ document.getElementById('homePage').style.display='none'; }
function hpShowLogin(tab){
  hpHideHome();
  document.getElementById('authScreen').style.display='flex';
  switchAuthTab(tab||'login');
}
function hpTheme(){
  if(typeof toggleTheme==='function'){ toggleTheme(); return; }
  var h=document.documentElement;
  if(h.getAttribute('data-theme')==='dark') h.removeAttribute('data-theme'); else h.setAttribute('data-theme','dark');
}
function hpContact(e){
  e.preventDefault();
  var n=document.getElementById('hpName').value.trim(), m=document.getElementById('hpEmail').value.trim(), t=document.getElementById('hpMsg').value.trim();
  var body='From: '+n+' <'+m+'>\n\n'+t;
  window.location.href='mailto:hello@example.com?subject='+encodeURIComponent('Acacia Inventory enquiry')+'&body='+encodeURIComponent(body);
  document.getElementById('contactConfirm').classList.remove('hidden');
  return false;
}

/* Plans uses Tailwind screens, so its home/auth switching is different */
function hpShowHome(){
  authScreen.classList.add('hidden');
  document.getElementById('homePage').style.display='block';
  window.hpShowPage&&window.hpShowPage('top');
}
function hpHideHome(){ document.getElementById('homePage').style.display='none'; }
function hpShowLogin(tab){
  hpHideHome();
  authScreen.classList.remove('hidden');
  switchAuthTab(tab==='register'?'signup':'signin');
}

;
/* ===== acacia-cloud: shared Supabase layer for the Acacia apps (same project as Books) =====
   - Sign in / sign up against the same accounts Books uses (table app_accounts)
   - New companies + users show up in Support (acacia_company_status, app_accounts, acacia_app_usage)
   - Each app's data is saved per company in acacia_app_data and loaded on any device
   Needs acacia_apps_cloud.sql to be run once in Supabase. Offline: falls back to this browser's copy. */
(function (w) {
  'use strict';
  var URL_ = 'https://xglsampckermarjpczdf.supabase.co';
  var KEY_ = 'sb_publishable_x-dPR7pzhvJgag9soW0I8w_yfKTmi6A';
  var H = { apikey: KEY_, Authorization: 'Bearer ' + KEY_, 'Content-Type': 'application/json' };
  var cfg = null, ctx = null, timer = 0, hbTimer = 0;
  var rawSet = Storage.prototype.setItem;
  var low = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  var enc = encodeURIComponent;
  var isCloudId = function (id) { return /^ACC-\d+$/i.test(String(id || '')); };
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  async function req(path, opt) {
    var ctl = w.AbortController ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : null;
    try {
      var r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({ headers: H, signal: ctl ? ctl.signal : undefined }, opt || {}));
      if (t) clearTimeout(t);
      return r;
    } catch (e) { if (t) clearTimeout(t); throw err('offline', 'Cannot reach the Acacia cloud. Check your internet connection.'); }
  }
  async function rpc(name, args) {
    var r = await req('rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      var m = (j && (j.message || j.hint)) || ('HTTP ' + r.status);
      var e = err(/already exists|exists/i.test(m) ? 'exists' : (r.status === 404 ? 'missing' : 'rpc'), m); e.status = r.status; throw e;
    }
    return j;
  }

  /* same hashing as Books: SHA-256 of "salt:password" */
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function newSalt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
  async function hash(pass, salt) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pass))); }
  async function verify(d, pass) {
    d = d || {};
    if (d.passwordHash && d.passwordSalt) return (await hash(pass, d.passwordSalt)) === d.passwordHash;
    return typeof d.password === 'string' && d.password === pass;
  }
  function mapRole(r, d) { return cfg && cfg.mapRole ? cfg.mapRole(r, d) : (/^admin/i.test(String(r || '')) ? 'Administrator' : (r || 'Administrator')); }

  /* deleted / suspended companies are blocked (fails open if the cloud can't be reached) */
  async function gate(cid, login) {
    try { if ((await rpc('acx_account_state', { p_company: low(cid), p_login: low(login) })) === 'deleted') return 'This account was removed by Acacia support.'; } catch (e) {}
    try {
      var r = await req('acacia_company_status?select=status&company_id=eq.' + enc(cid));
      if (r.ok) { var j = await r.json(); var s = j[0] && j[0].status; if (s === 'pending') return 'Your company is waiting for approval by Acacia support. You will be able to sign in as soon as it is approved.'; if (s && s !== 'active') return 'Your company account is "' + s + '". Please contact Acacia support.'; }
    } catch (e) {}
    return null;
  }

  async function signIn(email, pass, company) {
    email = low(email);
    var r = await req('app_accounts?select=login_id,username,company_id,data&login_id=eq.' + enc(email));
    if (!r.ok) throw err('offline', 'Could not read accounts (' + r.status + '). Run acacia_apps_cloud.sql in Supabase.');
    var rows = await r.json(), ok = [], cn = low(company);
    if (cn) rows = rows.filter(function (x) { var d = x.data || {}; return low(d.companyName) === cn || low(x.company_id) === cn || (d.previousCompanyNames || []).map(low).indexOf(cn) > -1; });
    for (var i = 0; i < rows.length; i++) if (await verify(rows[i].data, pass)) ok.push(rows[i]);
    if (!ok.length) return null;
    var row = ok[0];
    if (ok.length > 1) {
      var pick = w.prompt('This login belongs to more than one company:\n' + ok.map(function (x, n) { return (n + 1) + '. ' + ((x.data && x.data.companyName) || x.company_id) + ' (' + x.company_id + ')'; }).join('\n') + '\n\nType the number to open:', '1');
      row = ok[(parseInt(pick, 10) || 1) - 1] || ok[0];
    }
    var msg = await gate(row.company_id, email); if (msg) throw err('blocked', msg);
    var d = row.data || {};
    return { companyId: row.company_id, company: d.companyName || '', name: d.fullName || d.username || email.split('@')[0], email: email, role: mapRole(d.role, d), passwordHash: d.passwordHash, passwordSalt: d.passwordSalt };
  }

  async function register(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    var id = await rpc('acx_register_company', { p_company: o.company, p_name: o.name, p_email: low(o.email), p_hash: h, p_salt: salt, p_app: cfg.app, p_plan: o.plan || '', p_billing: o.billing || 'monthly' });
    var blocked = await gate(id, o.email);
    return { companyId: id, passwordHash: h, passwordSalt: salt, blocked: blocked };
  }

  /* teammates added inside an app (CRM Users & Roles). The app's own role is kept per app; Books sees admin/user */
  var booksRole = function (r) { return /^admin/i.test(String(r || '')) ? 'admin' : 'user'; };
  async function addUser(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    await rpc('acx_add_user', { p_company: o.companyId, p_name: o.name, p_email: low(o.email), p_role: booksRole(o.role), p_hash: h, p_salt: salt, p_app: cfg.app, p_app_role: o.role || '' });
    return { passwordHash: h, passwordSalt: salt };
  }
  function setRole(companyId, email, role) { return rpc('acx_set_user_role', { p_company: companyId, p_email: low(email), p_role: booksRole(role), p_app: cfg.app, p_app_role: role || '' }); }
  function removeUser(companyId, email) { return rpc('acx_remove_user', { p_company: companyId, p_email: low(email) }); }

  /* keep a copy of cloud users in this browser so the app's own session code keeps working (and offline sign-in) */
  function cacheUser(usersKey, u) {
    try {
      var list = JSON.parse(localStorage.getItem(usersKey) || '[]');
      var rec = { companyId: u.companyId, company: u.company, name: u.name, email: low(u.email), role: u.role, passwordHash: u.passwordHash, passwordSalt: u.passwordSalt };
      var i = list.findIndex(function (x) { return low(x.email) === rec.email && x.companyId === rec.companyId; });
      if (i > -1) { list[i] = Object.assign({}, list[i], rec); delete list[i].password; } else list.push(rec);
      rawSet.call(localStorage, usersKey, JSON.stringify(list));
    } catch (e) {}
  }
  function verifyLocal(u, pass) { return verify(u, pass); }

  /* accounts that only ever existed in this browser get a cloud company; their data and teammates move with them.
     'all' is the local users array: it is updated in place (caller saves it). Returns the signed-in user's new record. */
  async function migrate(u, pass, all) {
    var oldId = u.companyId, same = (all || [u]).filter(function (x) { return x.companyId === oldId; });
    var owner = same.find(function (x) { return /^admin/i.test(String(x.role || 'Administrator')) && x.password; }) || u;
    var ownerPass = owner === u ? pass : owner.password;
    var r = await register({ company: owner.company, name: owner.name, email: owner.email, password: ownerPass });
    for (var i = 0; i < same.length; i++) {
      var x = same[i];
      if (x === owner) { x.passwordHash = r.passwordHash; x.passwordSalt = r.passwordSalt; }
      else {
        var pw = x === u ? pass : x.password;
        if (pw) { try { var h = await addUser({ companyId: r.companyId, name: x.name, email: x.email, password: pw, role: x.role || 'Administrator' }); x.passwordHash = h.passwordHash; x.passwordSalt = h.passwordSalt; } catch (e) { continue; } }
        else continue;
      }
      delete x.password; x.companyId = r.companyId;
    }
    var o = cfg.dataKey(oldId), n = cfg.dataKey(r.companyId), v = localStorage.getItem(o);
    if (v != null) { rawSet.call(localStorage, n, v); localStorage.removeItem(o); rawSet.call(localStorage, dirtyKey(r.companyId), '1'); }
    return same.find(function (x) { return low(x.email) === low(u.email) && x.companyId === r.companyId; }) || null;
  }

  /* ---- data sync (one JSON blob per company per app) ---- */
  function tsKey(c) { return 'acx_ts_' + cfg.app + '_' + (c || ctx.companyId); }
  function dirtyKey(c) { return 'acx_dirty_' + cfg.app + '_' + (c || ctx.companyId); }
  async function pullRow(app) {
    var r = await req('acacia_app_data?select=value,updated_at&key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(app));
    if (!r.ok) return null; var j = await r.json(); return j[0] || null;
  }
  async function pushNow() {
    if (!ctx || !isCloudId(ctx.companyId)) return false;
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return false;
    try {
      var r = await req('acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) });
      if (r.ok) { var j = await r.json(); rawSet.call(localStorage, tsKey(), (j[0] && j[0].updated_at) || ''); localStorage.removeItem(dirtyKey()); return true; }
    } catch (e) {}
    return false;
  }
  function schedule() {
    if (!ctx || !isCloudId(ctx.companyId)) return;
    rawSet.call(localStorage, dirtyKey(), '1');
    clearTimeout(timer); timer = setTimeout(pushNow, 2500);
  }
  function flush() {
    if (!ctx || !isCloudId(ctx.companyId) || localStorage.getItem(dirtyKey()) !== '1') return;
    clearTimeout(timer);
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return;
    try {
      fetch(URL_ + '/rest/v1/acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', keepalive: v.length < 60000, headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) }).then(function (r) { if (r.ok) localStorage.removeItem(dirtyKey()); }).catch(function () {});
    } catch (e) {}
  }
  async function pullData() {
    var row = await pullRow(cfg.app);
    var dirty = localStorage.getItem(dirtyKey()) === '1', last = localStorage.getItem(tsKey());
    if (row && !dirty && row.updated_at !== last) { rawSet.call(localStorage, cfg.dataKey(ctx.companyId), row.value); rawSet.call(localStorage, tsKey(), row.updated_at); }
    else if (!row) { if (localStorage.getItem(cfg.dataKey(ctx.companyId)) != null) await pushNow(); }
    else if (dirty) await pushNow();
  }
  /* read-only copies of another app's data (e.g. Expenses reads Payroll) */
  async function pullExtras() {
    var ex = cfg.readFrom || [];
    for (var i = 0; i < ex.length; i++) { try { var row = await pullRow(ex[i].app); if (row) rawSet.call(localStorage, ex[i].dataKey(ctx.companyId), row.value); } catch (e) {} }
  }

  function heartbeat() {
    if (!ctx || !isCloudId(ctx.companyId) || !ctx.email) return;
    var k = 'acx_hb_' + ctx.companyId + '_' + cfg.app + '_' + ctx.email;
    if (Date.now() - Number(localStorage.getItem(k) || 0) < 3e5) return;
    rawSet.call(localStorage, k, String(Date.now()));
    try { fetch(URL_ + '/rest/v1/rpc/acx_heartbeat', { method: 'POST', headers: H, keepalive: true, body: JSON.stringify({ p_company: ctx.companyId, p_app: cfg.app, p_user: ctx.email, p_role: String(ctx.role || '') }) }).catch(function () {}); } catch (e) {}
  }

  /* called when a user enters the app: returns 'ok' | 'local' | 'blocked:<message>' */
  async function start(user) {
    ctx = { companyId: user.companyId, email: low(user.email), role: user.role || '' };
    if (!isCloudId(ctx.companyId)) return 'local';
    var msg = await gate(ctx.companyId, ctx.email); if (msg) return 'blocked:' + msg;
    try { await pullData(); await pullExtras(); } catch (e) {}
    heartbeat(); clearInterval(hbTimer); hbTimer = setInterval(function () { heartbeat(); }, 3e5);
    return 'ok';
  }
  function stop() { flush(); clearInterval(hbTimer); ctx = null; }

  function init(c) {
    cfg = c;
    Storage.prototype.setItem = function (k, v) {
      rawSet.apply(this, arguments);
      try { if (this === w.localStorage && ctx && k === cfg.dataKey(ctx.companyId)) schedule(); } catch (e) {}
    };
    w.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  }

  /* sign-up plan note: reads #regPlan / #regBilling and shows what the company will pay */
  w.acxPlanChanged = function () {
    var s = document.getElementById('regPlan'), b = document.getElementById('regBilling'), n = document.getElementById('regPlanNote');
    if (!s || !n) return;
    var o = s.options[s.selectedIndex], p = Number((o && o.getAttribute('data-price')) || 0), y = !!b && b.value === 'yearly';
    var f = function (x) { return 'KES ' + x.toLocaleString('en-US'); };
    n.textContent = y ? f(p * 10) + ' for the year (2 months free). Billed after Acacia support approves your account.' : f(p) + ' per month. Billed after Acacia support approves your account.';
  };
  setTimeout(function () { try { if (w.acxPlanChanged) w.acxPlanChanged(); } catch (e) {} }, 0);

  w.AcaciaCloud = { init: init, signIn: signIn, register: register, addUser: addUser, setRole: setRole, removeUser: removeUser, cacheUser: cacheUser, verifyLocal: verifyLocal, migrate: migrate, start: start, stop: stop, flush: flush, isCloudId: isCloudId, gate: gate, URL: URL_, KEY: KEY_, rpc: rpc, req: req };
})(window);
;
const SESSION_KEY='acacia_session';
function currentUser(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function initials(n){return (n||'?').split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase()}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}
function toCompanyId(name){ return 'comp_' + String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'_'); }
function switchAuthTab(t){const s=t==='signin';
  tabSignIn.classList.toggle('text-acacia-700',s);tabSignIn.classList.toggle('border-acacia-600',s);
  tabSignIn.classList.toggle('text-slate-500',!s);tabSignIn.classList.toggle('border-transparent',!s);
  tabSignUp.classList.toggle('text-acacia-700',!s);tabSignUp.classList.toggle('border-acacia-600',!s);
  tabSignUp.classList.toggle('text-slate-500',s);tabSignUp.classList.toggle('border-transparent',s);
  signinForm.classList.toggle('hidden',!s);signupForm.classList.toggle('hidden',s);}

/* Sidepanel toggle functions */
function toggleAcaciaNotebook(){ document.getElementById('acaciaNotebookPanel')?.classList.toggle('hidden'); }
function toggleWebinarPanel(){ document.getElementById('webinarPanel')?.classList.toggle('hidden'); }
function toggleCommPanel(){ document.getElementById('commPanel')?.classList.toggle('hidden'); }
function toggleSupportPopup(){ document.getElementById('supportPopup')?.classList.toggle('hidden'); }

const sb = window.supabase.createClient(window.__SUPA_URL__, window.__SUPA_KEY__);

AcaciaCloud.init({app:'inventory', dataKey:function(c){ return 'acx_inventory_local_' + c; }});
const enc = encodeURIComponent;

async function accountExists(email){
  try{ const r = await AcaciaCloud.req('app_accounts?select=login_id&login_id=eq.' + enc(String(email).toLowerCase())); if(!r.ok) return false; return (await r.json()).length > 0; }catch(e){ return false; }
}
function authErr(el, msg){ el.textContent = msg; el.classList.remove('hidden'); }

async function doSignIn(e){
  e.preventDefault();
  siError.classList.add('hidden');
  const company=(siCompany.value||'').trim();
  const email=(siEmail.value||'').trim().toLowerCase();
  const pass=siPass.value;
  if(!company||!email||!pass){ authErr(siError,'Please enter your company name, email and password.'); return; }
  let u=null;
  try{ u = await AcaciaCloud.signIn(email, pass, company); }
  catch(err){ authErr(siError, err.code==='blocked' ? err.message : 'Could not reach Acacia. Check your internet connection and try again.'); return; }
  if(!u){ authErr(siError,'That email and password combination was not found.'); return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email:u.email, name:u.name, companyId:u.companyId, companyName:u.company }));
  boot();
}

async function doSignUp(e){
  e.preventDefault();
  suError.classList.add('hidden');
  const company=(suCompany.value||'').trim();
  const email=(suEmail.value||'').trim().toLowerCase();
  const pass=suPass.value;
  if(!company||!email){ authErr(suError,'Company name and email are required.'); return; }
  if(!pass||pass.length<6){ authErr(suError,'Password must be at least 6 characters.'); return; }
  const fullName=((suFirst.value||'')+' '+(suLast.value||'')).trim()||email;
  let r;
  try{ r = await AcaciaCloud.register({company, name:fullName, email, password:pass, plan:(document.getElementById('regPlan')||{}).value||'', billing:(document.getElementById('regBilling')||{}).value||'monthly'}); }
  catch(err){ authErr(suError, err.code==='exists' ? 'This company already has an account with that email - use Sign In instead.' : (err.code==='offline' ? 'Could not reach Acacia. Check your internet connection and try again.' : (err.message||'Could not create the account.'))); return; }
  if(r.blocked){ authErr(suError,'Account created. ' + r.blocked); return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email, name:fullName, companyId:r.companyId, companyName:company }));
  boot();
}

function signOut(){AcaciaCloud.stop();localStorage.removeItem(SESSION_KEY);location.reload()}
function toggleApps(){appsMenu.classList.toggle('hidden')}
document.addEventListener('click',e=>{if(!e.target.closest('#appsMenu')&&!e.target.closest('button[onclick*=toggleApps]')) appsMenu?.classList.add('hidden')});

function currentCompanyId(){ const u=currentUser(); return u?.companyId || 'default_company'; }

/* Acacia ERP's real per-company cloud sync (the "companySync" layer in
   acacia-books.html) keeps one row per (company_id, key) in a table called
   `company_state`, where `value` is the exact JSON text that used to live in
   localStorage under that key. Reading/writing that same table, with the
   same key names the main app actually uses, is what makes this Stock hub
   identical to — and live-synced with — the one in Acacia ERP. Stock is
   special: the main app keeps it as one row PER WAREHOUSE, under keys like
   "inventory_Main Warehouse", not a single "inventory" row — so it's handled
   separately below (see pullStock/pushStockFor) rather than through this
   generic list.  */
const MODULES = [
  { id:'stock',       label:'Stock',            key:'inventory'        }, // special-cased, see pullStock()
  { id:'movement',    label:'Movement',         key:'movements'        },
  { id:'priceList',   label:'Price List',       key:'priceList'        },
  { id:'amendments',  label:'Amendments',       key:'amendments'       },
  { id:'bundleItems', label:'Bundle Items',     key:'bundles'          },
  { id:'bulkAdj',     label:'Bulk Adjustments', key:'bulkConsignments' },
  { id:'packages',    label:'Packages',         key:'orders'           }, // Packages tab derives its list from Sales "orders"
  { id:'shipments',   label:'Shipments',        key:'shipments'        },
];

const store = {};      // module id -> array of rows
const stockKeys = {};  // sku/index -> which "inventory_<warehouse>" row it came from (for edit/delete)
let active = MODULES[0].id;
let warehouseList = [];

function setSync(status, tone){
  syncStatus.textContent = status;
  const dot = syncDot; dot.className = 'inline-block w-2 h-2 rounded-full ' +
    ({ok:'bg-emerald-500',busy:'bg-amber-400 animate-pulse',err:'bg-red-500',idle:'bg-slate-300'}[tone]||'bg-slate-300');
}
function parseVal(v){
  if(v==null) return [];
  if(Array.isArray(v)) return v;
  if(typeof v==='object') return v;
  try{ const p=JSON.parse(v); return p; }catch{ return []; }
}

async function pullStock(){
  const c=currentCompanyId();
  try{
    const { data, error } = await sb.from('company_state').select('key,value').eq('company_id', c).like('key','inventory\\_%');
    if(error) throw error;
    const rows=[];
    (data||[]).forEach(row=>{
      const warehouse = row.key.replace(/^inventory_/, '');
      const items = parseVal(row.value);
      (Array.isArray(items)?items:[]).forEach((it,i)=>{
        rows.push(Object.assign({}, it, { warehouse }));
        stockKeys[rows.length-1] = { key: row.key, index: i };
      });
    });
    store.stock = rows;
  }catch(e){ console.warn('pullStock failed', e); store.stock = []; }
}
async function pushStockFor(warehouse, items){
  const c=currentCompanyId();
  const { error } = await sb.from('company_state').upsert(
    { company_id: c, key: 'inventory_'+warehouse, value: JSON.stringify(items), updated_at: new Date().toISOString() },
    { onConflict: 'company_id,key' }
  );
  if(error){ setSync('save error','err'); alert('Save failed: '+error.message); return false; }
  return true;
}
async function pullWarehouses(){
  const c=currentCompanyId();
  try{
    const { data } = await sb.from('company_state').select('value').eq('company_id', c).eq('key','warehouses').maybeSingle();
    const list = parseVal(data?.value);
    warehouseList = Array.isArray(list) ? list.map(w=>w.name||w).filter(Boolean) : [];
  }catch(e){ warehouseList = []; }
}

async function pullOne(m){
  if(m.id==='stock') return pullStock();
  const c=currentCompanyId();
  try {
    const { data, error } = await sb.from('company_state').select('value').eq('company_id', c).eq('key', m.key).maybeSingle();
    if(error) throw error;
    const val = parseVal(data?.value);
    store[m.id] = Array.isArray(val) ? val : [];
  } catch(e) {
    console.warn(`Failed pulling key ${m.key}:`, e);
    store[m.id] = [];
  }
}
async function pullAll(){
  setSync('syncing…','busy');
  try{
    await pullWarehouses();
    await Promise.all(MODULES.map(pullOne));
    setSync('synced · '+(currentUser()?.companyName||'workspace'),'ok');
    renderView();
  }catch(e){ console.warn(e); setSync('sync error','err'); }
}
async function pushOne(m){
  if(m.id==='stock') return true; // stock pushes per-warehouse — see pushStockFor()
  setSync('saving…','busy');
  const c=currentCompanyId();
  const { error } = await sb.from('company_state').upsert(
    { company_id: c, key: m.key, value: JSON.stringify(store[m.id]||[]), updated_at: new Date().toISOString() },
    { onConflict: 'company_id,key' }
  );
  if(error){ setSync('save error','err'); alert('Save failed: '+error.message); return false }
  setSync('synced · '+(currentUser()?.companyName||'workspace'),'ok'); return true;
}

function renderNav(){
  navList.innerHTML = MODULES.map(m=>`<button onclick="go('${m.id}')" class="nav-btn w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 ${m.id===active?'active':''}">${m.label}</button>`).join('')
    + `<div class="text-[10px] font-bold uppercase text-slate-400 px-2 pt-4 pb-1">Settings</div><button onclick="go('appearance')" class="nav-btn w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 ${active==='appearance'?'active':''}">🎨 Appearance</button>`;
}
function go(id){ active=id; renderNav(); renderView(); }

function collectColumns(rows){
  const seen=new Set(); rows.forEach(r=>r && typeof r==='object' && Object.keys(r).forEach(k=>seen.add(k)));
  return Array.from(seen).slice(0,10);
}
function cellText(v){
  if(v==null) return '';
  if(typeof v==='object') return JSON.stringify(v);
  return String(v);
}
const REORDER_LEVEL = 10; // matches Acacia ERP's Low Stock report threshold

function renderViewBase(){
  const m = MODULES.find(x=>x.id===active);
  if(m.id==='stock') return renderStockView();

  const rows = store[m.id] || [];
  const cols = collectColumns(rows);

  let grandTotal = 0;
  try {
    rows.forEach(r => {
      if (r && typeof r === 'object') {
        const valStr = r.price || r.amount || r.quantity || r.value || r.total || '';
        const parsed = parseFloat(valStr);
        if (!isNaN(parsed)) grandTotal += parsed;
      }
    });
  } catch(e) { console.warn(e); }

  view.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight text-slate-900">Welcome, ${escapeHtml(currentUser()?.companyName || 'your workspace')}</h2>
        <p class="text-sm text-slate-500">Workspace: ${escapeHtml(currentUser()?.companyName || 'Acacia ERP')}</p>
      </div>
      <div class="flex gap-2">
        <button onclick="exportCsv()" class="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white shadow-sm hover:bg-slate-50 transition-all">Export CSV</button>
        <button onclick="addRow()" class="px-4 py-2 text-sm bg-acacia-600 hover:bg-acacia-700 text-white rounded-lg shadow-sm font-semibold transition-all">+ New Record</button>
      </div>
    </div>

    <!-- Dashboard Style Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-sm font-semibold text-slate-500 uppercase tracking-wider">${m.label} Overview</span>
        <span class="text-2xl font-bold text-slate-800 mt-2">${rows.length} Active Item${rows.length===1?'':'s'}</span>
      </div>
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-sm font-semibold text-slate-500 uppercase tracking-wider">Estimated Volume/Value</span>
        <span class="text-2xl font-bold text-acacia-700 mt-2">KES ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
      </div>
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-sm font-semibold text-slate-500 uppercase tracking-wider">Synced with Acacia ERP</span>
        <span class="text-sm font-mono text-slate-600 mt-2 bg-slate-50 p-1.5 rounded border border-slate-100 truncate">company_state.${m.key}</span>
      </div>
    </div>

    <!-- Data Table -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h3 class="font-bold text-slate-700 text-sm tracking-wide uppercase">${m.label}</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wider font-semibold text-slate-600">
            <tr>${cols.length?cols.map(c=>`<th class="px-4 py-3">${escapeHtml(c)}</th>`).join(''):'<th class="px-4 py-3">Value</th>'}<th class="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows.length===0?`<tr><td colspan="${(cols.length||1)+1}" class="text-center text-slate-400 py-12 bg-slate-50/30">No ${m.label.toLowerCase()} records yet. Add one with <b>+ New Record</b> above, or create one in Acacia ERP and hit <b>↻ Sync</b>.</td></tr>`:
            rows.map((r,i)=>`<tr class="hover:bg-slate-50/80 transition-colors align-middle">
              ${cols.length?cols.map(c=>`<td class="px-4 py-3 max-w-xs truncate font-medium text-slate-700">${escapeHtml(cellText(r?.[c]))}</td>`).join(''):`<td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(cellText(r))}</td>`}
              <td class="px-4 py-3 text-right"><button onclick="delRow(${i})" class="text-red-500 hover:text-red-700 font-semibold text-xs tracking-wide uppercase transition-colors">Delete</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ---------------- Stock: dedicated view, matches Acacia ERP's per-warehouse
   inventory_<warehouse> records exactly (name, sku, qty, buyPrice, sellPrice,
   warehouse) instead of a generic key/value table. ---------------- */
function renderStockView(){
  const rows = store.stock || [];
  const low = rows.filter(r=>{ const q=parseFloat(r.qty); return !isNaN(q) && q<=REORDER_LEVEL; });
  const value = rows.reduce((sum,r)=> sum + (parseFloat(r.qty)||0) * (parseFloat(r.sellPrice)||0), 0);
  const whOptions = (warehouseList.length?warehouseList:[...new Set(rows.map(r=>r.warehouse).filter(Boolean))])
    .map(w=>`<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');

  view.innerHTML = `
    <div class="mb-6 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-3xl font-bold tracking-tight text-slate-900">Welcome, ${escapeHtml(currentUser()?.companyName || 'your workspace')}</h2>
        <p class="text-sm text-slate-500">Stock, live-synced with Acacia ERP's Inventory Hub</p>
      </div>
      <div class="flex gap-2">
        <button onclick="exportCsv()" class="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white shadow-sm hover:bg-slate-50 transition-all">Export CSV</button>
        <button onclick="toggleStockForm()" class="px-4 py-2 text-sm bg-acacia-600 hover:bg-acacia-700 text-white rounded-lg shadow-sm font-semibold transition-all">+ Add Item</button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-sm font-semibold text-slate-500 uppercase tracking-wider">Stock Overview</span>
        <span class="text-2xl font-bold text-slate-800 mt-2">${rows.length} Item${rows.length===1?'':'s'}</span>
      </div>
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-sm font-semibold text-slate-500 uppercase tracking-wider">Estimated Sell Value</span>
        <span class="text-2xl font-bold text-acacia-700 mt-2">KES ${value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
      </div>
      <div class="bg-white p-5 rounded-xl border ${low.length?'border-amber-300 bg-amber-50':'border-slate-200'} shadow-sm flex flex-col justify-between">
        <span class="text-sm font-semibold ${low.length?'text-amber-700':'text-slate-500'} uppercase tracking-wider">Low Stock (≤ ${REORDER_LEVEL})</span>
        <span class="text-2xl font-bold ${low.length?'text-amber-700':'text-slate-800'} mt-2">${low.length} Item${low.length===1?'':'s'}</span>
      </div>
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-sm font-semibold text-slate-500 uppercase tracking-wider">Synced with Acacia ERP</span>
        <span class="text-sm font-mono text-slate-600 mt-2 bg-slate-50 p-1.5 rounded border border-slate-100 truncate">company_state.inventory_*</span>
      </div>
    </div>

    <div id="stockFormCard" class="hidden bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
      <h3 class="font-bold text-slate-700 text-sm tracking-wide uppercase mb-3">Add Item</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input id="sfName" placeholder="Item Name" class="h-10 px-3 rounded-lg border border-slate-300 text-sm"/>
        <input id="sfSku" placeholder="SKU / Code" class="h-10 px-3 rounded-lg border border-slate-300 text-sm"/>
        <input id="sfQty" type="number" placeholder="Quantity" class="h-10 px-3 rounded-lg border border-slate-300 text-sm"/>
        <input id="sfBuy" type="number" placeholder="Buy Price" class="h-10 px-3 rounded-lg border border-slate-300 text-sm"/>
        <input id="sfSell" type="number" placeholder="Sell Price" class="h-10 px-3 rounded-lg border border-slate-300 text-sm"/>
        <div class="flex gap-2">
          <select id="sfWarehouse" class="h-10 px-3 rounded-lg border border-slate-300 text-sm flex-1">
            <option value="">Select Warehouse</option>${whOptions}
          </select>
        </div>
      </div>
      <div class="mt-3 flex gap-2">
        <button onclick="saveStockItem()" class="px-4 py-2 text-sm bg-acacia-600 hover:bg-acacia-700 text-white rounded-lg font-semibold">Save Item</button>
        <button onclick="toggleStockForm()" class="px-4 py-2 text-sm border border-slate-200 rounded-lg">Cancel</button>
      </div>
      <p class="text-[11px] text-slate-500 mt-2">Warehouse list comes from Acacia ERP's Settings → Warehouses. If it's empty, add a warehouse in Acacia ERP first, then hit ↻ Sync.</p>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h3 class="font-bold text-slate-700 text-sm tracking-wide uppercase">Stock — All Warehouses</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wider font-semibold text-slate-600">
            <tr><th class="px-4 py-3">Product</th><th class="px-4 py-3">SKU</th><th class="px-4 py-3">Warehouse</th><th class="px-4 py-3">Qty</th><th class="px-4 py-3">Buy Price</th><th class="px-4 py-3">Sell Price</th><th class="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows.length===0?`<tr><td colspan="7" class="text-center text-slate-400 py-12 bg-slate-50/30">No stock yet. Add an item above, or add one in Acacia ERP and hit <b>↻ Sync</b>.</td></tr>`:
            rows.map((r,i)=>{ const q=parseFloat(r.qty); const isLow = !isNaN(q) && q<=REORDER_LEVEL;
              return `<tr class="hover:bg-slate-50/80 transition-colors align-middle ${isLow?'bg-amber-50/60':''}">
              <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(cellText(r.name))}</td>
              <td class="px-4 py-3 text-slate-500">${escapeHtml(cellText(r.sku))}</td>
              <td class="px-4 py-3 text-slate-500">${escapeHtml(cellText(r.warehouse))}</td>
              <td class="px-4 py-3 ${isLow?'text-amber-700 font-bold':'text-slate-700'}">${escapeHtml(cellText(r.qty))}${isLow?' ⚠️':''}</td>
              <td class="px-4 py-3 text-slate-500">${escapeHtml(cellText(r.buyPrice))}</td>
              <td class="px-4 py-3 text-slate-500">${escapeHtml(cellText(r.sellPrice))}</td>
              <td class="px-4 py-3 text-right"><button onclick="delStockItem(${i})" class="text-red-500 hover:text-red-700 font-semibold text-xs tracking-wide uppercase transition-colors">Delete</button></td>
            </tr>`; }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}
function toggleStockForm(){ document.getElementById('stockFormCard')?.classList.toggle('hidden'); }
async function saveStockItem(){
  const warehouse = sfWarehouse.value;
  if(!warehouse){ alert('Select a warehouse.'); return; }
  const name = sfName.value.trim();
  const qty = parseFloat(sfQty.value);
  if(!name || isNaN(qty)){ alert('Item name and quantity are required.'); return; }
  const item = { name, sku: sfSku.value.trim(), qty, buyPrice: parseFloat(sfBuy.value)||0, sellPrice: parseFloat(sfSell.value)||0, active:true, history:[] };

  setSync('saving…','busy');
  const key='inventory_'+warehouse;
  let existing=[];
  try{
    const c=currentCompanyId();
    const { data } = await sb.from('company_state').select('value').eq('company_id',c).eq('key',key).maybeSingle();
    existing = parseVal(data?.value); if(!Array.isArray(existing)) existing=[];
  }catch(e){}
  existing.push(item);
  if(await pushStockFor(warehouse, existing)){
    setSync('synced · '+(currentUser()?.companyName||'workspace'),'ok');
    await pullStock(); toggleStockForm(); renderStockView();
  }
}
async function delStockItem(i){
  if(!confirm('Delete this stock item from Acacia ERP?')) return;
  const row = store.stock[i];
  const loc = stockKeys[i];
  if(!loc){ await pullStock(); renderStockView(); return; }
  setSync('saving…','busy');
  const c=currentCompanyId();
  try{
    const { data } = await sb.from('company_state').select('value').eq('company_id',c).eq('key',loc.key).maybeSingle();
    let items = parseVal(data?.value); if(!Array.isArray(items)) items=[];
    items.splice(loc.index,1);
    await pushStockFor(row.warehouse, items);
  }catch(e){ console.warn(e); }
  await pullStock(); renderStockView();
}

async function addRow(){
  if(OPFORMS[active]){ document.getElementById('opForm')?.scrollIntoView({behavior:'smooth'}); return; }
  const m = MODULES.find(x=>x.id===active);
  const rows = store[m.id] || [];
  const template = rows.find(r=>r && typeof r==='object');
  const keys = template ? Object.keys(template) : (prompt('New record — comma-separated field names:','name,quantity,price')||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!keys.length) return;
  const rec = {};
  for(const k of keys){ const v = prompt(k+':'); if(v===null) return; rec[k]=v; }
  store[m.id] = [...rows, rec];
  if(await pushOne(m)) renderView(); else await pullOne(m).then(renderView);
}
async function delRow(i){
  if(!confirm('Delete this record from Acacia ERP?')) return;
  const m = MODULES.find(x=>x.id===active);
  store[m.id].splice(i,1);
  if(await pushOne(m)) renderView(); else await pullOne(m).then(renderView);
}
function exportCsv(){
  const m=MODULES.find(x=>x.id===active); const rows=store[m.id]||[]; const cols=collectColumns(rows);
  const csv=[cols.join(','),...rows.map(r=>cols.map(c=>JSON.stringify(cellText(r?.[c]))).join(','))].join('\n');
  const a=document.createElement('a');a.href='data:text/csv,'+encodeURIComponent(csv);a.download=m.key+'.csv';a.click();
}

const MAIL_DATA_PREFIX = 'acacia_data_';
function openMail(){ mmStatus.textContent=''; mmTo.value=''; mmSubject.value=''; mmBody.value=''; mailModal.classList.remove('hidden'); }
function closeMail(){ mailModal.classList.add('hidden'); }
function loadMailbox(email){
  try{ return JSON.parse(localStorage.getItem(MAIL_DATA_PREFIX+email)) || {mails:[],events:[],aiChat:[]}; }
  catch{ return {mails:[],events:[],aiChat:[]}; }
}
function saveMailbox(email, box){
  localStorage.setItem(MAIL_DATA_PREFIX+email, JSON.stringify(box));
  try{ sb.from('app_state').upsert({ key: MAIL_DATA_PREFIX+email, value: box, updated_at:new Date().toISOString() }, { onConflict:'key' }); }catch(e){}
}
async function sendMailFromApp(e){
  e.preventDefault();
  const u = currentUser();
  if(!u){ mmStatus.textContent='Sign in first.'; return; }
  const to = mmTo.value.trim().toLowerCase();
  const subject = mmSubject.value.trim();
  const bodyText = mmBody.value.trim();
  if(!to||!subject||!bodyText) return;
  mmStatus.textContent = 'Verifying recipient…';
  const recipient = (await accountExists(to)) ? { email: to } : null;
  if(!recipient){
    mmStatus.textContent = '❌ No Acacia account uses that email. The message was not sent.';
    return;
  }
  const bodyHtml = escapeHtml(bodyText).replace(/\n/g,'<br>');
  const now = Date.now();
  const mailId = 'm'+now;

  const inbox = loadMailbox(recipient.email);
  inbox.mails = inbox.mails || [];
  inbox.mails.unshift({
    id: mailId,
    from: u.name || u.email,
    email: u.email,
    to: recipient.email,
    subject, preview: bodyText.slice(0,90), body: bodyHtml,
    time: now, read: false, starred: false, folder: 'inbox'
  });
  saveMailbox(recipient.email, inbox);

  const sent = loadMailbox(u.email);
  sent.mails = sent.mails || [];
  sent.mails.unshift({
    id: mailId+'_s',
    from: u.name || u.email,
    email: recipient.email,
    to: recipient.email,
    subject, preview: bodyText.slice(0,90), body: bodyHtml,
    time: now, read: true, starred: false, folder: 'sent'
  });
  saveMailbox(u.email, sent);

  mmStatus.textContent = '✅ Sent to '+recipient.email+' — will appear in their Acacia Mail inbox.';
  setTimeout(closeMail, 1200);
}

function boot(){
  let u=currentUser();
  if(u && !AcaciaCloud.isCloudId(u.companyId)){ localStorage.removeItem(SESSION_KEY); u=null; }
  if(u){ AcaciaCloud.start({companyId:u.companyId, email:u.email, role:'admin'}).then(function(r){ if(String(r).indexOf('blocked:')===0){ alert(String(r).slice(8)); signOut(); } }).catch(function(){}); }
  if(!u){hpShowHome();app.classList.add('hidden');app.classList.remove('flex');return}
  hpHideHome();authScreen.classList.add('hidden');app.classList.remove('hidden');app.classList.add('flex');
  userAvatar.textContent=initials(u.companyName||u.name||u.email);userAvatar.title=(u.companyName||'')+' · '+(u.email||'');
  
  // Display right sidebar once logged in
  document.getElementById('rightSidebar')?.classList.remove('hidden');
  
  renderNav(); renderView(); pullAll();
}
boot();


/* ---------------- Operation forms (match the Books Inventory tabs: Movement, Amendments, Price List, Shipments) ---------------- */
const OPFORMS = { movement:'New Stock Transfer Order', amendments:'New Item Stock Adjustment', priceList:'Item Pricing Details', shipments:'Add Shipment', bundleItems:'Composite Item Details', bulkAdj:'Bulk Adjustment' };
function renderView(){
  if(active==='appearance'){ view.innerHTML = '<div class="mb-4"><h2 class="text-2xl font-bold text-slate-800">🎨 Appearance</h2><p class="text-sm text-slate-500">Sidebar colour, text colour, font and font size.</p></div><div data-acacia-appearance></div>'; return; }
  renderViewBase();
  if(OPFORMS[active]) view.firstElementChild?.insertAdjacentHTML('afterend', opFormHTML(active));
  if(active==='bulkAdj') baLoadLog();
}
function whNames(){
  const set=new Set((warehouseList||[]).map(w=>typeof w==='object'?(w.name||w.id):w));
  (store.stock||[]).forEach(r=>r.warehouse&&set.add(r.warehouse));
  return [...set].filter(Boolean);
}
const _inp='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm';
const fld=(l,h)=>`<div><label class="block text-xs font-semibold text-slate-500 mb-1">${l}</label>${h}</div>`;
const selWh=(id,fn)=>`<select id="${id}" class="${_inp}" ${fn?`onchange="${fn}"`:''}><option value="">Select warehouse</option>${whNames().map(w=>`<option>${escapeHtml(w)}</option>`).join('')}</select>`;
function itemOpts(wh){
  const rows=(store.stock||[]).filter(r=>!wh||r.warehouse===wh);
  return '<option value="">Select item</option>'+rows.map(r=>`<option value="${escapeHtml(r.sku||r.name)}">${escapeHtml(r.name)}${r.sku?' ('+escapeHtml(r.sku)+')':''}</option>`).join('');
}
function refreshItems(whId,itemId){ document.getElementById(itemId).innerHTML=itemOpts(document.getElementById(whId).value); }
function opFormHTML(id){
  const date=new Date().toISOString().slice(0,10), btn=(f,t)=>`<button onclick="${f}" class="px-4 py-2 text-sm bg-acacia-600 hover:bg-acacia-700 text-white rounded-lg font-semibold">${t}</button>`;
  let body='';
  if(id==='movement') body=`${fld('Item',`<select id="mvItem" class="${_inp}">${itemOpts('')}</select>`)}${fld('From warehouse',selWh('mvFrom'))}${fld('To warehouse',selWh('mvTo'))}${fld('Quantity',`<input id="mvQty" type="number" min="0" class="${_inp}">`)}${fld('Transfer date',`<input id="mvDate" type="date" value="${date}" class="${_inp}">`)}<div class="flex items-end">${btn('doTransfer()','Save Transfer')}</div>`;
  if(id==='amendments') body=`${fld('Warehouse',selWh('amWh',"refreshItems('amWh','amItem')"))}${fld('Item',`<select id="amItem" class="${_inp}">${itemOpts('')}</select>`)}${fld('Adjustment type',`<input id="amType" list="amTypes" class="${_inp}" placeholder="e.g. Damage"><datalist id="amTypes"><option>Damage</option><option>Loss</option><option>Found</option><option>Correction</option><option>Return</option></datalist>`)}${fld('Quantity (+/-)',`<input id="amQty" type="number" class="${_inp}">`)}${fld('Reason',`<input id="amReason" class="${_inp}">`)}<div class="flex items-end">${btn('doAdjust()','Apply Adjustment')}</div>`;
  if(id==='priceList') body=`${fld('Warehouse',selWh('plWh',"refreshItems('plWh','plItem')"))}${fld('Item',`<select id="plItem" class="${_inp}">${itemOpts('')}</select>`)}${fld('New selling price',`<input id="plSell" type="number" class="${_inp}">`)}${fld('New cost price',`<input id="plCost" type="number" class="${_inp}">`)}${fld('Tax rate',`<input id="plTax" class="${_inp}" placeholder="e.g. 16%">`)}${fld('Effective date',`<input id="plDate" type="date" value="${date}" class="${_inp}">`)}<div class="flex items-end">${btn('doPrice()','Update Price')}</div>`;
  if(id==='shipments'){ const n='SHP-'+String((store.shipments||[]).length+1).padStart(4,'0');
    body=`${fld('Shipment no.',`<input id="shNo" value="${n}" class="${_inp}">`)}${fld('Customer',`<input id="shCust" class="${_inp}">`)}${fld('Item',`<input id="shItem" class="${_inp}">`)}${fld('Date',`<input id="shDate" type="date" value="${date}" class="${_inp}">`)}${fld('Origin',`<input id="shOrg" class="${_inp}">`)}${fld('Destination',`<input id="shDest" class="${_inp}">`)}${fld('Carrier',`<input id="shCar" class="${_inp}">`)}${fld('Tracking no.',`<input id="shTrk" class="${_inp}">`)}<div class="flex items-end">${btn('doShipment()','Add Shipment')}</div>`; }
  if(id==='bundleItems'){
    const comp=n=>`<div class="grid grid-cols-3 gap-2 md:col-span-3">${selWh('bnWh'+n,`refreshItems('bnWh${n}','bnItem${n}')`)}<select id="bnItem${n}" class="${_inp}">${itemOpts('')}</select><input id="bnUsed${n}" type="number" min="0" placeholder="Qty used per bundle" class="${_inp}"></div>`;
    body=`${fld('Bundle name',`<input id="bnName" class="${_inp}">`)}${fld('Destination warehouse',selWh('bnTo'))}${fld('Quantity to build',`<input id="bnQty" type="number" min="1" class="${_inp}">`)}${fld('Buy price',`<input id="bnBuy" type="number" class="${_inp}">`)}${fld('Sell price',`<input id="bnSell" type="number" class="${_inp}">`)}${fld('Sell VAT',`<input id="bnSellVat" class="${_inp}" placeholder="e.g. 16%">`)}<div class="md:col-span-3 text-xs font-semibold text-slate-500 uppercase">Associated component items</div>${comp(1)}${comp(2)}${comp(3)}<div>${btn('doBundle()','Create Bundle')}</div>`; }
  if(id==='bulkAdj') body=`${fld('Warehouse',selWh('baWh','baRows()'))}${fld('Date',`<input id="baDate" type="date" value="${date}" class="${_inp}">`)}<div class="flex items-end gap-2">${btn('doBulkAdj(false)','Apply All')}<button onclick="doBulkAdj(true)" class="px-4 py-2 text-sm border border-slate-200 rounded-lg">Save Draft</button></div><div class="md:col-span-3 overflow-x-auto"><table class="w-full text-sm"><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-2">Product</th><th>SKU</th><th>Current qty</th><th>Adjustment (+/-)</th><th>Reason</th></tr></thead><tbody id="baBody"><tr><td colspan="5" class="py-4 text-slate-400">Select a warehouse to load its products.</td></tr></tbody></table></div><div id="baLog" class="md:col-span-3"></div>`;
  return `<div id="opForm" class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6"><h3 class="font-bold text-slate-700 text-sm uppercase tracking-wide mb-4">${OPFORMS[id]}</h3><div class="grid grid-cols-1 md:grid-cols-3 gap-4">${body}</div></div>`;
}
const gv=id=>document.getElementById(id).value;
async function loadWh(w){
  const { data } = await sb.from('company_state').select('value').eq('company_id',currentCompanyId()).eq('key','inventory_'+w).maybeSingle();
  const a=parseVal(data?.value); return Array.isArray(a)?a:[];
}
const findIt=(items,k)=>items.find(x=>x.sku===k||x.name===k);
async function logRow(modId,rec,unshift){
  const m=MODULES.find(x=>x.id===modId); store[modId]=store[modId]||[];
  unshift?store[modId].unshift(rec):store[modId].push(rec);
  return pushOne(m);
}
async function doTransfer(){
  const k=gv('mvItem'),from=gv('mvFrom'),to=gv('mvTo'),q=parseFloat(gv('mvQty')),d=gv('mvDate');
  if(!k||!from||!to||isNaN(q)||!d) return alert('Please fill in all transfer fields.');
  if(from===to) return alert('From and To warehouses cannot be the same.');
  const src=await loadWh(from), it=findIt(src,k);
  if(!it||it.qty<q) return alert('Insufficient quantity in source warehouse.');
  it.qty-=q; const dst=await loadWh(to), t=findIt(dst,k);
  t?t.qty+=q:dst.push({...it,qty:q});
  if(!(await pushStockFor(from,src))||!(await pushStockFor(to,dst))) return;
  await logRow('movement',{item:it.name,from,to,quantity:q,date:d});
  await pullStock(); renderView(); alert('Stock transferred successfully.');
}
async function doAdjust(){
  const w=gv('amWh'),k=gv('amItem'),t=gv('amType').trim(),q=parseFloat(gv('amQty')),r=gv('amReason').trim();
  if(!w) return alert('Select a warehouse.');
  if(!k||!t||isNaN(q)||!r) return alert('Fill all fields correctly.');
  const items=await loadWh(w), it=findIt(items,k);
  if(!it) return alert('Item not found in inventory.');
  if(it.qty+q<0) return alert('Adjustment would make stock negative. Current qty: '+it.qty);
  it.qty+=q; if(!(await pushStockFor(w,items))) return;
  await logRow('amendments',{warehouse:w,sku:it.sku,item:it.name,adjustmentType:t,quantity:q,reason:r,date:new Date().toISOString()},true);
  await pullStock(); renderView(); alert('Adjustment applied successfully!');
}
async function doPrice(){
  const w=gv('plWh'),k=gv('plItem'),sp=parseFloat(gv('plSell')),cp=parseFloat(gv('plCost')),d=gv('plDate'),tax=gv('plTax');
  if(!w) return alert('Select a warehouse.');
  if(!k||isNaN(sp)||isNaN(cp)||!d) return alert('Fill all fields.');
  const items=await loadWh(w), it=findIt(items,k);
  const old={oldSellingPrice:it?.sellPrice||0,oldCostPrice:it?.buyPrice||0};
  if(it){ it.sellPrice=sp; it.buyPrice=cp; if(tax) it.sellVat=tax; if(!(await pushStockFor(w,items))) return; }
  store.priceList=(store.priceList||[]).filter(x=>!(x.warehouse===w&&x.item===k));
  await logRow('priceList',{warehouse:w,item:k,sellingPrice:sp,costPrice:cp,...old,taxRate:tax,effectiveDate:d});
  await pullStock(); renderView(); alert('Price updated for "'+k+'" in '+w+'.');
}
async function doShipment(){
  const rec={id:crypto.randomUUID(),shipmentNo:gv('shNo'),customer:gv('shCust').trim(),item:gv('shItem').trim(),date:gv('shDate'),origin:gv('shOrg').trim(),destination:gv('shDest').trim(),carrier:gv('shCar').trim(),trackingNo:gv('shTrk').trim()};
  if(!(rec.customer&&rec.date&&rec.item&&rec.origin&&rec.destination)) return alert('Please fill all required shipment fields.');
  if(await logRow('shipments',rec)){ renderView(); alert('✅ Shipment added successfully.'); }
}

async function doBundle(){
  const g=id=>document.getElementById(id).value;
  const b={name:g('bnName').trim(),toWarehouse:g('bnTo'),qty:parseFloat(g('bnQty'))||0,buyPrice:parseFloat(g('bnBuy'))||0,sellPrice:parseFloat(g('bnSell'))||0,sellVAT:g('bnSellVat'),date:new Date().toISOString(),
    items:[1,2,3].map(n=>({warehouse:g('bnWh'+n),item:g('bnItem'+n),qtyUsed:parseFloat(g('bnUsed'+n))||0})).filter(x=>x.item)};
  if(!b.name||!b.toWarehouse||!b.qty||!b.items.length) return alert('Fill required fields');
  const cache={};
  for(const c of b.items){
    cache[c.warehouse]=cache[c.warehouse]||await loadWh(c.warehouse);
    const it=findIt(cache[c.warehouse],c.item);
    if(!it||it.qty<c.qtyUsed*b.qty) return alert('Not enough stock of '+c.item+' in '+c.warehouse+' for '+b.qty+' bundle(s).');
  }
  for(const c of b.items){ findIt(cache[c.warehouse],c.item).qty-=c.qtyUsed*b.qty; }
  const dst=cache[b.toWarehouse]||await loadWh(b.toWarehouse); cache[b.toWarehouse]=dst;
  dst.push({name:b.name,sku:'BUNDLE-'+Date.now(),qty:b.qty,buyPrice:b.buyPrice,sellPrice:b.sellPrice,sellVat:b.sellVAT,isBundle:true});
  for(const w of Object.keys(cache)) if(!(await pushStockFor(w,cache[w]))) return;
  await logRow('bundleItems',b);
  await pullStock(); renderView(); alert('Bundle created.');
}
function baRows(){
  const w=document.getElementById('baWh').value, rows=(store.stock||[]).filter(r=>r.warehouse===w);
  document.getElementById('baBody').innerHTML=rows.map((r,i)=>`<tr class="border-t border-slate-100" data-key="${escapeHtml(r.sku||r.name)}"><td class="py-2">${escapeHtml(r.name)}</td><td>${escapeHtml(r.sku||'')}</td><td>${r.qty}</td><td><input type="number" class="baAdj w-28 border border-slate-200 rounded px-2 py-1"></td><td><input class="baWhy w-full border border-slate-200 rounded px-2 py-1"></td></tr>`).join('')||'<tr><td colspan="5" class="py-4 text-slate-400">No products in this warehouse.</td></tr>';
}
async function doBulkAdj(draft){
  const w=document.getElementById('baWh').value; if(!w) return alert('Select a warehouse');
  const d=document.getElementById('baDate').value, trs=[...document.querySelectorAll('#baBody tr[data-key]')];
  const items=await loadWh(w), key='bulkAdjustments_'+w; let log=[];
  try{ const { data } = await sb.from('company_state').select('value').eq('company_id',currentCompanyId()).eq('key',key).maybeSingle(); log=parseVal(data?.value); if(!Array.isArray(log)) log=[]; }catch(e){}
  let n=0;
  trs.forEach(tr=>{
    const a=parseFloat(tr.querySelector('.baAdj').value||0); if(!a) return;
    const it=findIt(items,tr.dataset.key); if(it&&!draft) it.qty=(parseFloat(it.qty)||0)+a;
    log.push({id:'BA-'+Date.now()+'-'+n,warehouse:w,itemId:tr.dataset.key,item:it?it.name:tr.dataset.key,adjustment:a,reason:tr.querySelector('.baWhy').value||'',status:draft?'Draft':'Applied',date:d,createdAt:new Date().toISOString()}); n++;
  });
  if(!n) return alert('Enter at least one adjustment');
  if(!draft && !(await pushStockFor(w,items))) return;
  const { error } = await sb.from('company_state').upsert({company_id:currentCompanyId(),key,value:JSON.stringify(log),updated_at:new Date().toISOString()},{onConflict:'company_id,key'});
  if(error) return alert('Save failed: '+error.message);
  await pullStock(); renderView(); document.getElementById('baWh').value=w; baRows(); alert(draft?'Draft saved.':'Bulk adjustments applied.');
}
async function baLoadLog(){
  const el=document.getElementById('baLog'); if(!el) return;
  try{
    const { data } = await sb.from('company_state').select('key,value').eq('company_id',currentCompanyId()).like('key','bulkAdjustments\\_%');
    const rows=(data||[]).flatMap(r=>{const a=parseVal(r.value);return Array.isArray(a)?a:[]}).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,50);
    el.innerHTML=`<h4 class="font-bold text-slate-700 text-sm uppercase tracking-wide mt-4 mb-2">Bulk Adjustment Log</h4><table class="w-full text-sm"><thead class="text-left text-xs uppercase text-slate-500"><tr><th>Date</th><th>Warehouse</th><th>Product</th><th>Change</th><th>Reason</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr class="border-t border-slate-100"><td class="py-1">${escapeHtml(r.date)}</td><td>${escapeHtml(r.warehouse)}</td><td>${escapeHtml(r.item)}</td><td>${r.adjustment>0?'+':''}${r.adjustment}</td><td>${escapeHtml(r.reason)}</td><td>${escapeHtml(r.status)}</td></tr>`).join('')||'<tr><td colspan="6" class="py-3 text-slate-400">No bulk adjustments yet.</td></tr>'}</tbody></table>`;
  }catch(e){}
}
