/* =========================================================
   CATATAN UANG — app.js
   Semua data disimpan di localStorage browser.
   Struktur penyimpanan:
   - "cu_users"        -> { username: { passHash, createdAt } }
   - "cu_data_<user>"  -> { incomeType, banks:[], ewallets:[], balances:{bank:{}, ewallet:{}, cash:0}, transactions:[] }
   - "cu_session"      -> username yang sedang login
   ========================================================= */

const LS_USERS = 'cu_users';
const LS_SESSION = 'cu_session';
const dataKey = (u) => `cu_data_${u}`;

/* ---------- Katalog logo bank & e-wallet ---------- */
const BANK_CATALOG = [
  { key:'seabank',  name:'SeaBank',  logo:'icons/banks/seabank.png' },
  { key:'bca',      name:'BCA',      logo:'icons/banks/bca.png' },
  { key:'bri',      name:'BRI',      logo:'icons/banks/bri.png' },
  { key:'bni',      name:'BNI',      logo:'icons/banks/bni.png' },
  { key:'mandiri',  name:'Mandiri',  logo:'icons/banks/mandiri.png' },
  { key:'jago',     name:'Jago',     logo:'icons/banks/jago.png' },
  { key:'neobank',  name:'Neobank',  logo:'icons/banks/neobank.png' },
  { key:'krombank', name:'KromBank', logo:'icons/banks/krombank.png' }
];
const EWALLET_CATALOG = [
  { key:'gopay',      name:'GoPay',      logo:'icons/ewallets/gopay.png' },
  { key:'dana',       name:'DANA',       logo:'icons/ewallets/dana.png' },
  { key:'ovo',        name:'OVO',        logo:'icons/ewallets/ovo.png' },
  { key:'shopeepay',  name:'ShopeePay',  logo:'icons/ewallets/shopeepay.png' }
];
/* ---------- Buka aplikasi bank / e-wallet dari ikon (Android) ----------
   ok:1 = nama paket sudah dicocokkan dengan halaman Google Play-nya.
   Tanpa ok = nama paket dari pengetahuan umum (belum dicek), jadi kalau aplikasinya
   tidak terbuka, yang muncul pencarian Google Play. Betulkan 'pkg' di sini bila perlu. */
const APP_PACKAGES = {
  seabank:   { pkg:'id.co.bankbkemobile.digitalbank', ok:1 },
  krombank:  { pkg:'com.krom.android', ok:1 },
  neobank:   { pkg:'com.bnc.finance', ok:1 },
  gopay:     { pkg:'com.gojek.gopay', ok:1 },
  ovo:       { pkg:'ovo.id', ok:1 },
  bca:       { pkg:'com.bca' },
  bni:       { pkg:'src.com.bni' },
  bri:       { pkg:'id.co.bri.brimo' },
  mandiri:   { pkg:'id.bmri.livin' },
  jago:      { pkg:'com.jago.digitalBanking' },
  dana:      { pkg:'id.dana' },
  shopeepay: { pkg:'com.shopee.id' }
};
/* Di APK Android (Capacitor) ada plugin native "AppOpener" -> aplikasi langsung terbuka */
function nativeAppOpener(){
  const c = window.Capacitor;
  if(!c || (typeof c.isNativePlatform === 'function' && !c.isNativePlatform())) return null;
  if(c.Plugins && c.Plugins.AppOpener) return c.Plugins.AppOpener;
  if(typeof c.registerPlugin === 'function'){ try{ return c.registerPlugin('AppOpener'); }catch(_){} }
  return null;
}

/* Plugin native "FileSaver" (APK): menyimpan file ke folder Download lewat MediaStore */
function nativeFileSaver(){
  const c = window.Capacitor;
  if(!c || (typeof c.isNativePlatform === 'function' && !c.isNativePlatform())) return null;
  if(c.Plugins && c.Plugins.FileSaver) return c.Plugins.FileSaver;
  if(typeof c.registerPlugin === 'function'){ try{ return c.registerPlugin('FileSaver'); }catch(_){} }
  return null;
}
function safeFileName(s){ return String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,40) || 'akun'; }

function openExternalApp(key, name){
  const app = APP_PACKAGES[key];
  if(!app) return;
  const opener = nativeAppOpener();
  if(opener){
    showToast('Membuka ' + (name || 'aplikasi') + '…');
    opener.open({ package: app.pkg }).catch(() => openExternalAppWeb(app, key, name));
    return;
  }
  openExternalAppWeb(app, key, name);
}

function openExternalAppWeb(app, key, name){
  if(!/Android/i.test(navigator.userAgent)){
    showToast('Buka aplikasi hanya bisa di HP Android');
    return;
  }
  // Jika aplikasi tidak bisa dibuka/belum terpasang -> halaman Google Play (atau pencarian)
  const fallback = app.ok
    ? `https://play.google.com/store/apps/details?id=${app.pkg}`
    : `https://play.google.com/store/search?q=${encodeURIComponent(name || key)}&c=apps`;
  showToast('Membuka ' + (name || 'aplikasi') + '…');
  window.location.href =
    `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${app.pkg};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

function catalogFor(kind){ return kind === 'bank' ? BANK_CATALOG : EWALLET_CATALOG; }
function catalogItem(kind, key){ return catalogFor(kind).find(c => c.key === key); }

let currentUser = null;
let currentData = null;
let obSelectedIncomeType = null;
let txType = null; // 'in' | 'out'
let txSelectedSource = null; // {type:'bank'|'ewallet'|'cash', name:string}
let historyFilterMode = 'all';

/* ---------- Utilities ---------- */
function simpleHash(str){
  let hash = 0;
  for(let i=0;i<str.length;i++){
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}
/* Sandi: PBKDF2-SHA256 + salt acak (butuh https/localhost). Akun lama yang
   masih memakai simpleHash otomatis di-upgrade saat login berikutnya. */
const PBKDF2_ITER = 100000;
function hasSubtle(){ return !!(window.crypto && window.crypto.subtle && window.TextEncoder); }
function bytesToB64(buf){
  let bin = ''; const b = new Uint8Array(buf);
  for(let i=0;i<b.length;i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}
function b64ToBytes(str){
  const bin = atob(str); const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pbkdf2B64(pass, saltB64, iter){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:b64ToBytes(saltB64), iterations:iter, hash:'SHA-256' }, key, 256);
  return bytesToB64(bits);
}
async function makePassRecord(pass){
  if(!hasSubtle()) return { passHash: simpleHash(pass) };
  const salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
  return { algo:'pbkdf2', salt, iter:PBKDF2_ITER, passHash: await pbkdf2B64(pass, salt, PBKDF2_ITER) };
}
// -> { ok:boolean, upgraded: record|null }
async function verifyPass(rec, pass){
  if(rec.algo === 'pbkdf2'){
    if(!hasSubtle()) return { ok:false, upgraded:null, unsupported:true };
    const h = await pbkdf2B64(pass, rec.salt, rec.iter);
    return { ok: h === rec.passHash, upgraded:null };
  }
  if(rec.passHash !== simpleHash(pass)) return { ok:false, upgraded:null };
  let upgraded = null;
  if(hasSubtle()){
    const fresh = await makePassRecord(pass);
    upgraded = Object.assign({}, rec, fresh);
  }
  return { ok:true, upgraded };
}

/* ---------- Input nominal dengan titik ribuan (1.000.000) ---------- */
function formatMoneyString(str, allowNeg){
  str = String(str == null ? '' : str);
  const neg = !!allowNeg && str.trim().startsWith('-');
  const digits = str.replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,15);
  if(!digits) return neg ? '-' : '';
  return (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function parseMoney(str){
  const s = String(str == null ? '' : str);
  const digits = s.replace(/\D/g,'').slice(0,15);
  if(!digits) return 0;
  const n = Number(digits);
  return s.trim().startsWith('-') ? -n : n;
}
function moneyVal(n){ n = Number(n) || 0; return n === 0 ? '' : formatMoneyString(String(Math.trunc(n)), true); }

document.addEventListener('input', (e) => {
  const el = e.target;
  if(!el || !el.classList || !el.classList.contains('money-input')) return;
  const allowNeg = el.getAttribute('data-neg') === '1';
  const before = el.value;
  const caret = el.selectionStart == null ? before.length : el.selectionStart;
  const digitsBefore = (before.slice(0, caret).match(/\d/g) || []).length;
  const out = formatMoneyString(before, allowNeg);
  if(out === before) return;
  el.value = out;
  let pos = 0, seen = 0;
  if(digitsBefore === 0){ pos = (out.startsWith('-') && caret > 0) ? 1 : 0; }
  else { while(pos < out.length && seen < digitsBefore){ if(/\d/.test(out[pos])) seen++; pos++; } }
  try{ el.setSelectionRange(pos, pos); }catch(_){}
});

function fmtRupiah(n){
  n = Math.round(Number(n)||0);
  return 'Rp' + n.toLocaleString('id-ID');
}
function todayKey(d = new Date()){
  // Tanggal LOKAL (WIB dst.), bukan UTC, supaya "hari ini" ganti tepat tengah malam
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
}
function goTo(screenId){
  // Kalau ada transisi yang masih berjalan, selesaikan dulu secara instan
  // supaya klik cepat berturut-turut (mis. ganti tab dgn cepat) tidak bikin
  // dua layar sama-sama "active" secara bersamaan.
  if(window._screenTransitionCleanup){
    window._screenTransitionCleanup();
    window._screenTransitionCleanup = null;
  }

  const current = document.querySelector('.screen.active');
  const next = document.getElementById(screenId);
  if(!next || current === next) return;
  const tc = document.querySelector('meta[name="theme-color"]');
  if(tc) tc.setAttribute('content', ['screen-login','screen-register','screen-ob-income'].includes(screenId) ? '#0B0706' : '#0D9488');

  if(!current){
    next.classList.add('active');
    return;
  }

  // arah animasi: tabbar (home/history/wallets/settings) pakai crossfade halus,
  // alur onboarding/login pakai slide maju yang terasa "melangkah"
  const tabScreens = ['screen-home','screen-history','screen-wallets','screen-settings'];
  const isTabSwitch = tabScreens.includes(current.id) && tabScreens.includes(screenId);

  current.classList.add(isTabSwitch ? 'leaving-fade' : 'leaving-slide');
  next.classList.add('active', isTabSwitch ? 'entering-fade' : 'entering-slide');

  const cleanup = () => {
    current.classList.remove('active','leaving-fade','leaving-slide');
    next.classList.remove('entering-fade','entering-slide');
    next.removeEventListener('animationend', cleanup);
    clearTimeout(fallbackTimer);
    if(window._screenTransitionCleanup === cleanup) window._screenTransitionCleanup = null;
  };
  next.addEventListener('animationend', cleanup);
  // fallback kalau animationend tidak fire (mis. tab background)
  const fallbackTimer = setTimeout(cleanup, 400);
  window._screenTransitionCleanup = cleanup;
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---------- Modal open/close terpusat (biar transisi slide-up konsisten) ---------- */
function openModal(id){
  const el = document.getElementById(id);
  el.style.display = 'flex';
  // paksa reflow dulu sebelum tambah class 'active', supaya transisi CSS kepicu (bukan langsung lompat ke state akhir)
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('active')));
}
function closeModal(id){
  const el = document.getElementById(id);
  el.classList.remove('active');
  setTimeout(() => { if(!el.classList.contains('active')) el.style.display = ''; }, 320);
}

/* ---------- Storage helpers ---------- */
function getUsers(){
  try{ return JSON.parse(localStorage.getItem(LS_USERS)) || {}; }catch(e){ return {}; }
}
function saveUsers(u){ localStorage.setItem(LS_USERS, JSON.stringify(u)); }

function getUserData(username){
  try{
    const raw = localStorage.getItem(dataKey(username));
    if(!raw) return null;
    return migrateWalletsIfNeeded(JSON.parse(raw));
  }catch(e){ return null; }
}
function saveUserData(username, data){
  localStorage.setItem(dataKey(username), JSON.stringify(data));
}
function defaultUserData(){
  return {
    incomeType: null,
    profilePhoto: null, // data URL JPEG hasil crop/resize
    // banks/ewallets: [{id, key, name, logo}] -- id unik per item ditambahkan (boleh duplikat key, mis. 2x BCA)
    banks: [],
    ewallets: [],
    balances: { bank:{}, ewallet:{}, cash:0 }, // keyed by item.id
    transactions: [] // {id, type:'in'|'out', amount, name, source:{type,id,name}, date(ISO), category?}
  };
}

/* Migrasi data lama: banks/ewallets dulu berupa array string nama,
   dan balances.bank/ewallet keyed by nama. Versi baru pakai object
   {id,key,name,logo} + balances keyed by id, supaya bisa duplikat
   (mis. 2 rekening BCA) dan bisa tampilkan logo. */
function migrateWalletsIfNeeded(data){
  if(!data) return data;
  let changed = false;

  const migrateList = (list, balancesObj, kind) => {
    const newList = [];
    const newBalances = {};
    (list||[]).forEach(item => {
      if(typeof item === 'string'){
        changed = true;
        const id = uid();
        const found = catalogFor(kind).find(c => c.name.toLowerCase() === item.toLowerCase());
        newList.push({ id, key: found ? found.key : null, name: item, logo: found ? found.logo : null });
        newBalances[id] = (balancesObj && balancesObj[item]) || 0;
      } else if(item && item.id){
        newList.push(item);
        newBalances[item.id] = (balancesObj && balancesObj[item.id]) || 0;
      }
    });
    return { newList, newBalances };
  };

  if((data.banks||[]).some(b => typeof b === 'string')){
    const { newList, newBalances } = migrateList(data.banks, data.balances && data.balances.bank, 'bank');
    data.banks = newList;
    data.balances.bank = newBalances;
  }
  if((data.ewallets||[]).some(b => typeof b === 'string')){
    const { newList, newBalances } = migrateList(data.ewallets, data.balances && data.balances.ewallet, 'ewallet');
    data.ewallets = newList;
    data.balances.ewallet = newBalances;
  }

  // Transaksi lama menyimpan source.name sebagai kunci saldo; sinkronkan source.id kalau belum ada
  if(changed && Array.isArray(data.transactions)){
    data.transactions.forEach(t => {
      if(t.source && !t.source.id && t.source.type !== 'cash'){
        const list = t.source.type === 'bank' ? data.banks : data.ewallets;
        const match = list.find(w => w.name === t.source.name);
        if(match) t.source.id = match.id;
      }
    });
  }

  return data;
}

/* =========================================================
   AUTH
   ========================================================= */
let authBusy = false;
const BAD_NAMES = ['__proto__','constructor','prototype'];
async function handleRegister(){
  if(authBusy) return;
  const username = document.getElementById('reg-username').value.trim();
  const p1 = document.getElementById('reg-password').value;
  const p2 = document.getElementById('reg-password2').value;

  if(!username){ showToast('Nama akun tidak boleh kosong'); return; }
  if(username.length > 30 || BAD_NAMES.includes(username)){ showToast('Nama akun tidak valid'); return; }
  if(p1.length < 4){ showToast('Sandi minimal 4 karakter'); return; }
  if(p1 !== p2){ showToast('Sandi tidak cocok'); return; }

  const users = getUsers();
  if(users[username]){ showToast('Nama akun sudah dipakai, pilih nama lain'); return; }

  authBusy = true;
  let passRec;
  try{ passRec = await makePassRecord(p1); }
  catch(e){ authBusy = false; showToast('Gagal membuat akun, coba lagi'); return; }
  authBusy = false;

  users[username] = Object.assign({}, passRec, { createdAt: new Date().toISOString() });
  saveUsers(users);
  saveUserData(username, defaultUserData());

  currentUser = username;
  currentData = getUserData(username);
  localStorage.setItem(LS_SESSION, username);

  // clear fields
  document.getElementById('reg-username').value = '';
  document.getElementById('reg-password').value = '';
  document.getElementById('reg-password2').value = '';

  showToast('Akun dibuat! Yuk lengkapi datamu');
  goTo('screen-ob-income');
}

async function handleLogin(){
  if(authBusy) return;
  const username = document.getElementById('login-username').value.trim();
  const pass = document.getElementById('login-password').value;

  if(!username || !pass){ showToast('Isi nama akun dan sandi'); return; }

  const users = getUsers();
  const rec = users[username];
  if(!rec){ showToast('Akun tidak ditemukan'); return; }
  if(BAD_NAMES.includes(username) || !Object.prototype.hasOwnProperty.call(users, username)){ showToast('Akun tidak ditemukan'); return; }

  authBusy = true;
  let res;
  try{ res = await verifyPass(rec, pass); }
  catch(e){ authBusy = false; showToast('Gagal memeriksa sandi, coba lagi'); return; }
  authBusy = false;
  if(res.unsupported){ showToast('Buka lewat https agar sandi bisa diperiksa'); return; }
  if(!res.ok){ showToast('Sandi salah'); return; }
  if(res.upgraded){ users[username] = res.upgraded; saveUsers(users); }

  currentUser = username;
  currentData = getUserData(username) || defaultUserData();
  localStorage.setItem(LS_SESSION, username);

  document.getElementById('login-password').value = '';

  // Kalau onboarding belum selesai (belum ada incomeType), arahkan ke onboarding
  if(!currentData.incomeType){
    goTo('screen-ob-income');
  } else {
    enterApp();
  }
}

function handleLogout(){
  localStorage.removeItem(LS_SESSION);
  currentUser = null;
  currentData = null;
  document.getElementById('login-username').value = '';
  goTo('screen-login');
}

function confirmReset(){
  if(confirm('Yakin hapus semua data akun ini? Tindakan ini tidak bisa dibatalkan.')){
    localStorage.removeItem(dataKey(currentUser));
    currentData = defaultUserData();
    saveUserData(currentUser, currentData);
    showToast('Data akun sudah direset');
    goTo('screen-ob-income');
  }
}

/* =========================================================
   ONBOARDING
   ========================================================= */
function selectIncomeType(type, el){
  obSelectedIncomeType = type;
  document.querySelectorAll('#screen-ob-income .au-opt').forEach(o=>{ o.classList.remove('selected'); o.setAttribute('aria-pressed','false'); });
  el.classList.add('selected');
  el.setAttribute('aria-pressed','true');
}

function walletRowHTML(item, i, removeFn){
  const logoHTML = item.logo
    ? `<img src="${item.logo}" class="wlogo" alt="">`
    : `<span class="wlogo wlogo-fallback">${escapeHtml((item.name||'?').charAt(0).toUpperCase())}</span>`;
  return `<div class="row-item" style="animation-delay:${i*40}ms">
      ${logoHTML}
      <span class="rname">${escapeHtml(item.name)}</span>
      <button class="rdel" onclick="${removeFn}(${i})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>`;
}

function renderOBBankList(){
  const wrap = document.getElementById('ob-bank-list');
  wrap.innerHTML = currentData.banks.map((b,i) => walletRowHTML(b, i, 'removeBankOB')).join('');
}
function removeBankOB(i){
  const item = currentData.banks[i];
  if(item) delete currentData.balances.bank[item.id];
  currentData.banks.splice(i,1);
  renderOBBankList();
}

function renderOBEwalletList(){
  const wrap = document.getElementById('ob-ewallet-list');
  wrap.innerHTML = currentData.ewallets.map((b,i) => walletRowHTML(b, i, 'removeEwalletOB')).join('');
}
function removeEwalletOB(i){
  const item = currentData.ewallets[i];
  if(item) delete currentData.balances.ewallet[item.id];
  currentData.ewallets.splice(i,1);
  renderOBEwalletList();
}

/* ---------- Pilih logo bank/e-wallet (dipakai di onboarding & tab Dompet) ---------- */
let pickerContext = null; // 'ob-bank' | 'ob-ewallet' | 'wallets'

function openWalletPicker(context){
  pickerContext = context;
  const kind = (context === 'ob-ewallet' || context === 'wallets-ewallet') ? 'ewallet' : 'bank';
  const title = kind === 'bank' ? 'Pilih bank' : 'Pilih e-wallet';
  const grid = catalogFor(kind).map((c,idx) => `
    <div class="pay-tile t${idx % 5}" style="animation-delay:${idx*35}ms" onclick="pickWalletFromCatalog('${kind}','${c.key}')">
      <img src="${escapeHtml(c.logo)}" class="sicon-logo" alt="">
      <span class="pname">${escapeHtml(c.name)}</span>
    </div>`).join('');

  const body = document.getElementById('wallet-picker-body');
  body.innerHTML = `
    <h3 class="modal-title">${title}</h3>
    <p class="modal-sub">Boleh pilih yang sama lebih dari sekali (mis. 2 rekening berbeda).</p>
    <div class="pay-grid logos">${grid}</div>
  `;
  openModal('wallet-picker-modal');
}
function closeWalletPicker(){
  closeModal('wallet-picker-modal');
}

function pickWalletFromCatalog(kind, key){
  const cat = catalogItem(kind, key);
  if(!cat) return;
  const item = { id: uid(), key: cat.key, name: cat.name, logo: cat.logo };

  if(kind === 'bank'){
    currentData.banks.push(item);
    currentData.balances.bank[item.id] = 0;
  } else {
    currentData.ewallets.push(item);
    currentData.balances.ewallet[item.id] = 0;
  }

  if(pickerContext === 'wallets-bank' || pickerContext === 'wallets-ewallet'){
    // Dompet sudah tersimpan (saldo 0). Modal tetap terbuka dan langsung
    // berubah jadi form isi saldo awal; kalau di-Batal, saldo tetap 0.
    saveUserData(currentUser, currentData);
    refreshWallets();
    refreshHome();
    openBalanceModal(kind, item.id, true);
    return;
  }

  closeWalletPicker();
  if(pickerContext === 'ob-bank') renderOBBankList();
  else if(pickerContext === 'ob-ewallet') renderOBEwalletList();
}

function renderOBBalanceBank(){
  const wrap = document.getElementById('ob-balance-bank-list');
  wrap.innerHTML = '';
  if(currentData.banks.length === 0){
    wrap.innerHTML = '<p class="sub">Kamu tidak menambahkan rekening bank.</p>';
    return;
  }
  currentData.banks.forEach(b => {
    const field = document.createElement('div');
    field.className = 'field';
    const logoHTML = b.logo ? `<img src="${b.logo}" class="wlogo-sm" alt="">` : '';
    field.innerHTML = `<label style="display:flex; align-items:center; gap:8px;">${logoHTML}${escapeHtml(b.name)}</label>
      <div class="amount-input-wrap" style="margin-bottom:0;">
        <span class="rp">Rp</span>
        <input type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-id="${b.id}" class="ob-bank-balance-input money-input" value="${moneyVal(currentData.balances.bank[b.id])}">
      </div>`;
    wrap.appendChild(field);
  });
}
function renderOBBalanceEwallet(){
  const wrap = document.getElementById('ob-balance-ewallet-list');
  wrap.innerHTML = '';
  if(currentData.ewallets.length === 0){
    wrap.innerHTML = '<p class="sub">Kamu tidak menambahkan e-wallet.</p>';
    return;
  }
  currentData.ewallets.forEach(b => {
    const field = document.createElement('div');
    field.className = 'field';
    const logoHTML = b.logo ? `<img src="${b.logo}" class="wlogo-sm" alt="">` : '';
    field.innerHTML = `<label style="display:flex; align-items:center; gap:8px;">${logoHTML}${escapeHtml(b.name)}</label>
      <div class="amount-input-wrap" style="margin-bottom:0;">
        <span class="rp">Rp</span>
        <input type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-id="${b.id}" class="ob-ewallet-balance-input money-input" value="${moneyVal(currentData.balances.ewallet[b.id])}">
      </div>`;
    wrap.appendChild(field);
  });
}

function collectOBBankBalances(){
  document.querySelectorAll('.ob-bank-balance-input').forEach(inp => {
    const id = inp.getAttribute('data-id');
    if(!currentData.banks.some(b => b.id === id)) return;
    currentData.balances.bank[id] = parseMoney(inp.value);
  });
}
function collectOBEwalletBalances(){
  document.querySelectorAll('.ob-ewallet-balance-input').forEach(inp => {
    const id = inp.getAttribute('data-id');
    if(!currentData.ewallets.some(b => b.id === id)) return;
    currentData.balances.ewallet[id] = parseMoney(inp.value);
  });
}

function finishOnboarding(){
  collectOBEwalletBalances();
  const cashVal = parseMoney(document.getElementById('ob-cash-input').value);
  currentData.balances.cash = cashVal;
  currentData.incomeType = obSelectedIncomeType || 'gaji';
  saveUserData(currentUser, currentData);
  showToast('Data awal tersimpan!');
  enterApp();
}

/* Hook navigation transitions to prep data for next onboarding screen */
const _origGoTo = goTo;
let _curScreen = null;
goTo = function(screenId){
  // Simpan angka yang sudah diketik sebelum pindah (termasuk saat tombol Kembali)
  if(currentData){
    if(_curScreen === 'screen-ob-balance-bank') collectOBBankBalances();
    if(_curScreen === 'screen-ob-balance-ewallet') collectOBEwalletBalances();
  }
  _curScreen = screenId;
  _origGoTo(screenId);
  if(screenId === 'screen-ob-banks') renderOBBankList();
  if(screenId === 'screen-ob-ewallet') renderOBEwalletList();
  if(screenId === 'screen-ob-balance-bank'){ renderOBBalanceBank(); }
  if(screenId === 'screen-ob-balance-ewallet'){ renderOBBalanceEwallet(); }
};

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* =========================================================
   APP ENTRY / HOME
   ========================================================= */
function enterApp(){
  goTo('screen-home');
  refreshHome();
}

function switchTab(tab){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const map = { home:'screen-home', history:'screen-history', wallets:'screen-wallets', settings:'screen-settings' };
  goTo(map[tab]);
  // set active state on the matching tab in the now-active screen
  const btns = document.querySelectorAll(`#${map[tab]} .tabbar .tab-btn`);
  const order = ['home','history','wallets','settings'];
  btns.forEach((b, i) => { if(order[i] === tab) b.classList.add('active'); });

  if(tab === 'home') refreshHome();
  if(tab === 'history') refreshHistory();
  if(tab === 'wallets') refreshWallets();
  if(tab === 'settings') refreshSettings();
}

function totalBalance(){
  let t = currentData.balances.cash || 0;
  currentData.banks.forEach(b => t += Number(currentData.balances.bank[b.id])||0);
  currentData.ewallets.forEach(b => t += Number(currentData.balances.ewallet[b.id])||0);
  return t;
}

function todayTx(){
  const tk = todayKey();
  return currentData.transactions.filter(t => todayKey(new Date(t.date)) === tk);
}

/* Update teks angka dengan animasi "pop" -- cuma jalan kalau nilainya
   benar-benar berubah, supaya tidak animasi terus tiap refresh biasa */
function setAmountText(id, text){
  const el = document.getElementById(id);
  if(!el) return;
  if(el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('pop');
  void el.offsetWidth; // force reflow biar animasi bisa retrigger
  el.classList.add('pop');
}

const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;

function avatarInitial(){ return (currentUser || '?').trim().charAt(0).toUpperCase() || '?'; }
function applyAvatar(el){
  if(!el) return;
  const ph = currentData && currentData.profilePhoto;
  if(ph && PHOTO_RE.test(ph)){
    el.style.backgroundImage = `url("${ph}")`;
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = avatarInitial();
  }
}
function refreshAvatars(){
  applyAvatar(document.getElementById('home-avatar'));
  applyAvatar(document.getElementById('set-avatar'));
  applyAvatar(document.getElementById('w-avatar'));
  const del = document.getElementById('btn-del-photo');
  if(del) del.style.display = (currentData && currentData.profilePhoto) ? '' : 'none';
}

/* ---------- Foto profil ---------- */
function pickProfilePhoto(){ document.getElementById('photo-input').click(); }
function handlePhotoFile(event){
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if(!file) return;
  if(!/^image\//.test(file.type)){ showToast('Pilih file gambar'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try{
      const size = 320;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      currentData.profilePhoto = c.toDataURL('image/jpeg', 0.85);
      saveUserData(currentUser, currentData);
      refreshAvatars();
      showToast('Foto profil diperbarui');
    }catch(e){
      showToast('Gagal memproses foto');
    }
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); showToast('Foto tidak bisa dibaca'); };
  img.src = url;
}
function removeProfilePhoto(){
  currentData.profilePhoto = null;
  saveUserData(currentUser, currentData);
  refreshAvatars();
  showToast('Foto profil dihapus');
}

/* ---------- Grafik Beranda ---------- */
const DAY_ABBR = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const MON_ABBR = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
let homeRange = 'week';
let homeSel = null;
let _chart = { bk:[], max:1, H:150, MIN:8 };

function fmtShortRp(n){
  n = Math.round(n);
  const trim = (v) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v*10)/10)).replace('.', ',');
  if(n >= 999500) return 'Rp' + trim(n/1e6) + 'jt';
  if(n >= 1000) return 'Rp' + trim(n/1e3) + 'rb';
  return 'Rp' + n;
}

function chartBuckets(range){
  const now = new Date();
  const out = [];
  if(range === 'week'){
    for(let i = 6; i >= 0; i--){
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      out.push({ key: todayKey(d), label: DAY_ABBR[d.getDay()], in:0, out:0 });
    }
  } else {
    for(let i = 5; i >= 0; i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: todayKey(d).slice(0,7), label: MON_ABBR[d.getMonth()], in:0, out:0 });
    }
  }
  const idx = {};
  out.forEach((b, i) => idx[b.key] = i);
  currentData.transactions.forEach(t => {
    const full = todayKey(new Date(t.date));
    const k = range === 'week' ? full : full.slice(0,7);
    if(k in idx) out[idx[k]][t.type] += t.amount;
  });
  return out;
}

function chartTipHTML(i){
  const b = _chart.bk[i];
  const last = _chart.bk.length - 1;
  const cls = i === 0 ? ' l' : (i === last ? ' r' : '');
  const hi = b.in ? Math.max(_chart.MIN, Math.round(b.in/_chart.max*_chart.H)) : _chart.MIN;
  const ho = b.out ? Math.max(_chart.MIN, Math.round(b.out/_chart.max*_chart.H)) : _chart.MIN;
  const body = (!b.in && !b.out)
    ? 'Belum ada transaksi'
    : `<i class="tdot in"></i>${fmtShortRp(b.in)}<span class="tip-sep">|</span><i class="tdot out"></i>${fmtShortRp(b.out)}`;
  return `<div class="ch-tip${cls}" style="bottom:${Math.max(hi, ho) + 12}px">${body}</div>`;
}

function renderHomeChart(){
  const wrap = document.getElementById('home-chart');
  if(!wrap) return;
  const bk = chartBuckets(homeRange);
  const max = Math.max(1, ...bk.map(b => Math.max(b.in, b.out)));
  _chart = { bk, max, H:150, MIN:8 };
  if(homeSel == null || homeSel >= bk.length) homeSel = bk.length - 1;
  wrap.className = 'chart-area' + (homeRange === 'month' ? ' month' : '');
  wrap.innerHTML = bk.map((b, i) => {
    const hi = b.in ? Math.max(_chart.MIN, Math.round(b.in/max*_chart.H)) : _chart.MIN;
    const ho = b.out ? Math.max(_chart.MIN, Math.round(b.out/max*_chart.H)) : _chart.MIN;
    const sel = i === homeSel;
    return `<div class="ch-col${sel ? ' sel' : ''}" onclick="selectChartCol(${i})">
      <div class="ch-bars" style="height:${_chart.H}px">
        ${sel ? chartTipHTML(i) : ''}
        <span class="ch-bar in" style="height:${hi}px; animation-delay:${i*45}ms"></span>
        <span class="ch-bar out" style="height:${ho}px; animation-delay:${i*45 + 25}ms"></span>
      </div>
      <span class="ch-lbl">${b.label}</span>
    </div>`;
  }).join('');
}

function selectChartCol(i){
  homeSel = i;
  document.querySelectorAll('#home-chart .ch-col').forEach((c, idx) => {
    c.classList.toggle('sel', idx === i);
    const old = c.querySelector('.ch-tip');
    if(old) old.remove();
    if(idx === i) c.querySelector('.ch-bars').insertAdjacentHTML('afterbegin', chartTipHTML(idx));
  });
}

function toggleRangeMenu(e){
  if(e) e.stopPropagation();
  document.getElementById('range-wrap').classList.toggle('open');
}
function setHomeRange(r){
  homeRange = r;
  homeSel = null;
  document.getElementById('range-label').textContent = r === 'week' ? 'Mingguan' : 'Bulanan';
  document.getElementById('range-opt-week').classList.toggle('sel', r === 'week');
  document.getElementById('range-opt-month').classList.toggle('sel', r === 'month');
  document.getElementById('range-wrap').classList.remove('open');
  renderHomeChart();
}
document.addEventListener('click', (e) => {
  const w = document.getElementById('range-wrap');
  if(w && !(e.target && e.target.closest && e.target.closest('#range-wrap'))) w.classList.remove('open');
});

function refreshHome(){
  setAmountText('home-total-balance', fmtRupiah(totalBalance()));
  const tx = todayTx();
  const inTotal = tx.filter(t=>t.type==='in').reduce((s,t)=>s+t.amount,0);
  const outTotal = tx.filter(t=>t.type==='out').reduce((s,t)=>s+t.amount,0);
  setAmountText('total-in', fmtRupiah(inTotal));
  setAmountText('total-out', fmtRupiah(outTotal));
  document.getElementById('home-name').textContent = currentUser || '-';
  refreshAvatars();
  renderHomeChart();
  if(typeof loadHomeContent === 'function') loadHomeContent();
}

/* =========================================================
   TRANSACTION MODAL
   ========================================================= */
function sourceIconSVG(type){
  if(type === 'bank') return `<svg class="sicon" viewBox="0 0 24 24" fill="none"><path d="M3 10.5L12 4l9 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="4.5" y="10.5" width="15" height="8.5" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 20.5h19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  if(type === 'ewallet') return `<svg class="sicon" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="5.5" width="19" height="14" rx="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 10h19" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="15" r="1.3" fill="currentColor"/></svg>`;
  return `<svg class="sicon" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6.5" width="19" height="11" rx="3" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>`;
}

const CHECK_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function lastSourceKey(type){ return `cu_lastsrc_${currentUser}_${type}`; }

function openTxModal(type){
  txType = type;
  txSelectedSource = null;
  const body = document.getElementById('tx-modal-body');
  body.className = 'tx-body' + (type === 'out' ? ' out' : '');

  // Build source list
  let sources = [];
  currentData.banks.forEach(b => sources.push({type:'bank', id:b.id, name:b.name, logo:b.logo, bal: currentData.balances.bank[b.id]||0}));
  currentData.ewallets.forEach(b => sources.push({type:'ewallet', id:b.id, name:b.name, logo:b.logo, bal: currentData.balances.ewallet[b.id]||0}));
  sources.push({type:'cash', name:'Cash', bal: currentData.balances.cash||0});

  const title = type === 'in' ? 'Catat pemasukan' : 'Catat pengeluaran';
  const sub = type === 'in' ? 'Uang masuk lewat mana?' : 'Bayar pakai apa?';

  let tiles = '<div class="pay-grid" id="tx-source-grid">';
  sources.forEach((s, idx) => {
    const iconHTML = s.logo ? `<img src="${escapeHtml(s.logo)}" class="sicon-logo" alt="">` : sourceIconSVG(s.type);
    tiles += `<div class="pay-tile t${idx % 5}" style="animation-delay:${idx*45}ms" data-idx="${idx}" onclick="selectTxSource(${idx})">
      <span class="pay-check">${CHECK_SVG}</span>
      ${iconHTML}
      <span class="pname">${escapeHtml(s.name)}</span>
      <span class="pbal">${fmtRupiah(s.bal)}</span>
    </div>`;
  });
  tiles += '</div>';

  window._txSources = sources;

  const nameLabel = type === 'in' ? 'Nama pemasukan' : 'Nama pengeluaran';
  const namePh = type === 'in' ? 'cth. Gaji, Jualan' : 'cth. Makan siang';
  const closeSVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const pencilSVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  body.innerHTML = `
    <h3 class="modal-title">${title}</h3>
    <p class="modal-sub">${sub}</p>
    ${tiles}
    <div class="sec-label">Detail</div>
    <div class="row-card" style="animation-delay:150ms">
      <div class="row-ico">${pencilSVG}</div>
      <div class="row-body">
        <small>${nameLabel}</small>
        <input type="text" id="tx-name" placeholder="${namePh}" autocomplete="off" maxlength="100">
      </div>
      <span class="row-check">${CHECK_SVG}</span>
    </div>
    <div class="row-card" style="animation-delay:200ms; margin-bottom:16px;">
      <div class="row-ico">Rp</div>
      <div class="row-body">
        <small>Nominal</small>
        <input type="text" id="tx-amount" class="money-input" inputmode="numeric" autocomplete="off" placeholder="0" enterkeyhint="done" onkeydown="if(event.key==='Enter') submitTx()">
      </div>
      <span class="row-check">${CHECK_SVG}</span>
    </div>
    <div class="action-row">
      <button class="btn-circle" onclick="closeTxModal()" aria-label="Batal">${closeSVG}</button>
      <button class="btn-pill" onclick="submitTx()">${type === 'in' ? 'Simpan pemasukan' : 'Catat pengeluaran'}</button>
    </div>
  `;
  openModal('tx-modal');

  // Ingat sumber dana yang terakhir dipakai untuk jenis transaksi ini
  try{
    const last = localStorage.getItem(lastSourceKey(type));
    if(last){
      const idx = sources.findIndex(s => (s.type + ':' + (s.id || '')) === last);
      if(idx !== -1) selectTxSource(idx);
    }
  }catch(_){}
}

function selectTxSource(idx){
  txSelectedSource = window._txSources[idx];
  document.querySelectorAll('#tx-source-grid .pay-tile').forEach(el=>el.classList.remove('selected'));
  const tile = document.querySelector(`#tx-source-grid .pay-tile[data-idx="${idx}"]`);
  if(tile) tile.classList.add('selected');
}

function closeTxModal(){
  closeModal('tx-modal');
}
document.getElementById('tx-modal').addEventListener('click', (e)=>{
  if(e.target.id === 'tx-modal') closeTxModal();
});
document.getElementById('wallet-picker-modal').addEventListener('click', (e)=>{
  if(e.target.id === 'wallet-picker-modal') closeWalletPicker();
});

function sourceBalance(src){
  if(src.type === 'cash') return Number(currentData.balances.cash) || 0;
  const m = src.type === 'bank' ? currentData.balances.bank : currentData.balances.ewallet;
  return Number(m[src.id]) || 0;
}
function adjustBalance(src, delta){
  if(src.type === 'cash'){ currentData.balances.cash = (Number(currentData.balances.cash)||0) + delta; return; }
  const list = src.type === 'bank' ? currentData.banks : currentData.ewallets;
  if(!src.id || !list.some(w => w.id === src.id)) return; // dompet sudah dihapus
  const m = src.type === 'bank' ? currentData.balances.bank : currentData.balances.ewallet;
  m[src.id] = (Number(m[src.id])||0) + delta;
}

function submitTx(){
  const name = document.getElementById('tx-name').value.trim();
  const amount = parseMoney(document.getElementById('tx-amount').value);

  if(!txSelectedSource){ showToast('Pilih sumber dana dulu'); return; }
  if(!name){ showToast('Isi nama transaksi'); return; }
  if(!amount || amount <= 0){ showToast('Isi nominal yang benar'); return; }

  if(txType === 'out' && sourceBalance(txSelectedSource) - amount < 0){
    const ok = confirm(`Saldo ${txSelectedSource.name} (${fmtRupiah(sourceBalance(txSelectedSource))}) tidak cukup untuk pengeluaran ini. Tetap catat? Saldonya akan jadi minus.`);
    if(!ok) return;
  }

  adjustBalance(txSelectedSource, txType === 'in' ? amount : -amount);
  try{ localStorage.setItem(lastSourceKey(txType), txSelectedSource.type + ':' + (txSelectedSource.id || '')); }catch(_){}

  currentData.transactions.unshift({
    id: uid(),
    type: txType,
    amount: amount,
    name: name,
    source: { type: txSelectedSource.type, id: txSelectedSource.id, name: txSelectedSource.name },
    date: new Date().toISOString()
  });

  saveUserData(currentUser, currentData);
  closeTxModal();
  showToast(txType === 'in' ? 'Pemasukan tersimpan' : 'Dibeli — pengeluaran tercatat');
  refreshHome();
}

/* =========================================================
   HISTORY
   ========================================================= */
function filterHistory(mode, el){
  historyFilterMode = mode;
  document.querySelectorAll('.hist-filter .chip').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  refreshHistory();
}

function txIconSVG(type){
  if(type === 'in') return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function refreshHistory(){
  const list = document.getElementById('history-list');
  let txs = currentData.transactions.slice();
  if(historyFilterMode !== 'all') txs = txs.filter(t => t.type === historyFilterMode);

  const sumIn = currentData.transactions.filter(t=>t.type==='in').reduce((s,t)=>s+t.amount,0);
  const sumOut = currentData.transactions.filter(t=>t.type==='out').reduce((s,t)=>s+t.amount,0);
  document.getElementById('hist-sum-in').textContent = fmtRupiah(sumIn);
  document.getElementById('hist-sum-out').textContent = fmtRupiah(sumOut);

  if(txs.length === 0){
    list.innerHTML = `<div class="empty-state">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M3 3v6h6M3 9a9 9 0 1 1 2.6 6.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <p>Belum ada transaksi tercatat</p>
    </div>`;
    return;
  }

  list.innerHTML = txs.map((t, i) => {
    const d = new Date(t.date);
    const dateStr = d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    const delay = Math.min(i, 12) * 30;
    return `<div class="hist-item" style="animation-delay:${delay}ms">
      <div class="hist-icon ${t.type}">${txIconSVG(t.type)}</div>
      <div class="hist-info">
        <div class="hist-name">${escapeHtml(t.name)}</div>
        <div class="hist-meta">${dateStr}, ${timeStr} · ${escapeHtml(t.source.name)}</div>
      </div>
      <div class="hist-amt ${t.type}">${t.type==='in'?'+':'-'}${fmtRupiah(t.amount)}</div>
      <button class="hist-del" onclick="deleteTx('${t.id}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>`;
  }).join('');
}

function deleteTx(id){
  const idx = currentData.transactions.findIndex(t=>t.id===id);
  if(idx === -1) return;
  const t = currentData.transactions[idx];
  // revert balance
  const sign = t.type === 'in' ? -1 : 1;
  adjustBalance(t.source, sign * t.amount);

  currentData.transactions.splice(idx,1);
  saveUserData(currentUser, currentData);
  refreshHistory();
  refreshHome();
  showToast('Transaksi dihapus');
}

/* =========================================================
   WALLETS TAB
   ========================================================= */
const MORE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>';

function walletListRow(kind, b, i){
  const bal = (kind === 'bank' ? currentData.balances.bank : currentData.balances.ewallet)[b.id] || 0;
  const canOpen = !!(b.key && APP_PACKAGES[b.key]);
  let logoHTML = b.logo
    ? `<img src="${escapeHtml(b.logo)}" class="wlogo" alt="">`
    : `<span class="wlogo wlogo-fallback">${escapeHtml((b.name||'?').charAt(0).toUpperCase())}</span>`;
  if(canOpen) logoHTML = `<button class="wopen" aria-label="Buka aplikasi ${escapeHtml(b.name)}" title="Buka aplikasi ${escapeHtml(b.name)}">${logoHTML}</button>`;
  const row = document.createElement('div');
  row.className = 'row-item';
  row.style.animationDelay = (i*40) + 'ms';
  row.innerHTML = `${logoHTML}<span class="rname">${escapeHtml(b.name)}</span>
    <span class="rbal">${fmtRupiah(bal)}</span>
    <button class="rmore" aria-label="Menu ${escapeHtml(b.name)}" title="Ubah saldo / hapus">${MORE_SVG}</button>`;
  row.querySelector('.rmore').onclick = () => openWalletMenu(kind, b.id);
  const openBtn = row.querySelector('.wopen');
  if(openBtn) openBtn.onclick = (e) => { e.stopPropagation(); openExternalApp(b.key, b.name); };
  return row;
}

/* ---------- Tumpukan kartu dompet: pilih dengan menggeser ---------- */
const W_CASH_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 10v4M17.5 10v4"/></svg>';
let wSel = 0, wMain = null, wDet = null, wSyncing = false;

function walletItems(){
  const out = [];
  currentData.banks.forEach(b => out.push({ kind:'bank', id:b.id, key:b.key, name:b.name, logo:b.logo, bal:Number(currentData.balances.bank[b.id])||0, label:'Rekening bank' }));
  currentData.ewallets.forEach(b => out.push({ kind:'ewallet', id:b.id, key:b.key, name:b.name, logo:b.logo, bal:Number(currentData.balances.ewallet[b.id])||0, label:'E-wallet' }));
  out.push({ kind:'cash', id:'cash', name:'Cash di tangan', logo:null, bal:Number(currentData.balances.cash)||0, label:'Uang tunai' });
  return out;
}

function wcHTML(it){
  const logo = it.kind === 'cash' ? `<span class="wc-logo cash">${W_CASH_SVG}</span>`
    : it.logo ? `<span class="wc-logo"><img src="${escapeHtml(it.logo)}" alt="" draggable="false"></span>`
    : `<span class="wc-logo">${escapeHtml((it.name||'?').charAt(0).toUpperCase())}</span>`;
  const bal = fmtRupiah(it.bal);
  return `<div class="wc-tint"></div>
    <div class="wc-in">
      <div class="wc-bal${bal.length > 12 ? ' sm' : ''}">${bal}</div>
      <div class="wc-foot"><div class="wc-txt"><b>${escapeHtml(it.name)}</b><small>${it.label}</small></div>${logo}</div>
    </div>
    <div class="wc-cover"></div>`;
}

/* posisi tiap kartu sebagai fungsi jarak d dari kartu depan (kontinu, jadi gerakannya halus) */
const wClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function wMainT(d, W){
  if(d <= -1) return { x:-W*1.15, y:8, r:-12, s:1, o:0, z:0, cover:0, tint:0, org:'0% 100%' };
  if(d < 0){
    const t = -d;
    return { x:-W*1.15*t, y:8*t, r:-12*t, s:1, o:1 - Math.max(0, (t - .55) / .45), z:200, cover:0, tint:0, org:'0% 100%' };
  }
  const l = Math.min(d, 3);
  return { x:11*l, y:-19*l, r:-4.2*l, s:1 - .045*l, o:d <= 2 ? 1 : Math.max(0, 3 - d), z:100 - Math.round(d*10), cover:Math.min(1, d*1.25), tint:0, org:'0% 100%' };
}
function wDetT(d){
  const a = Math.abs(d);
  const ang = 17*Math.min(a, 1) + 13*wClamp(a - 1, 0, 1);
  const o = a <= 2 ? 1 : Math.max(0, 3 - a);
  if(d >= 0) return { x:12*Math.min(a, 2), y:-4*Math.min(a, 2), r:-ang, s:1 - .035*Math.min(a, 3), o, z:100 - Math.round(a*10), cover:0, tint:Math.min(1, a*1.1), org:'0% 100%' };
  return { x:10*Math.min(a, 2), y:6*Math.min(a, 2), r:ang, s:1 - .035*Math.min(a, 3), o, z:100 - Math.round(a*10), cover:0, tint:Math.min(1, a*1.1), org:'0% 0%' };
}

function makeStack(el, variant, onChange){
  const S = { el, variant, items:[], pos:0, W:0, H:0, cards:[], raf:0, drag:null, lastIdx:-1 };
  const detail = variant === 'detail';

  S.render = (items, idx) => {
    S.items = items;
    el.innerHTML = items.map(it => `<div class="wc">${wcHTML(it)}</div>`).join('');
    S.cards = Array.from(el.children).map(c => ({ el:c, cover:c.querySelector('.wc-cover'), tint:c.querySelector('.wc-tint') }));
    S.pos = wClamp(idx, 0, Math.max(0, items.length - 1));
    S.lastIdx = Math.round(S.pos);
    S.layout();
  };
  S.layout = () => {
    if(!S.cards.length) return;
    if(detail){
      const sw = el.clientWidth || 360, sh = el.clientHeight || 420;
      S.W = Math.min(sw * 0.96, 420); S.H = Math.min(S.W / 1.5, sh * 0.62);
      S.left = sw - S.W + sw * 0.03; S.top = Math.max(sh * 0.5 - S.H / 2, 0);
    } else {
      S.W = (el.clientWidth || 280) + 26; S.H = Math.round(S.W * 0.6);
      S.left = 0; S.top = 44;
      el.style.height = (S.H + S.top + 6) + 'px';
    }
    S.cards.forEach(c => { c.el.style.width = S.W + 'px'; c.el.style.height = S.H + 'px'; c.el.style.left = S.left + 'px'; c.el.style.top = S.top + 'px'; });
    S.apply();
  };
  S.apply = () => {
    S.cards.forEach((c, i) => {
      const d = i - S.pos;
      const t = detail ? wDetT(d) : wMainT(d, S.W);
      c.el.style.transformOrigin = t.org;
      c.el.style.transform = `translate3d(${t.x.toFixed(2)}px,${t.y.toFixed(2)}px,0) rotate(${t.r.toFixed(2)}deg) scale(${t.s.toFixed(3)})`;
      c.el.style.opacity = t.o.toFixed(3);
      c.el.style.zIndex = t.z;
      c.el.style.pointerEvents = t.o < .05 ? 'none' : '';
      c.cover.style.opacity = t.cover.toFixed(3);
      c.tint.style.opacity = t.tint.toFixed(3);
    });
    const idx = Math.round(S.pos);
    if(idx !== S.lastIdx){ S.lastIdx = idx; onChange(idx, false, S); }
  };
  S.animateTo = (target, dur) => {
    cancelAnimationFrame(S.raf);
    target = wClamp(Math.round(target), 0, Math.max(0, S.items.length - 1));
    const from = S.pos, delta = target - from;
    if(Math.abs(delta) < 0.001){ S.pos = target; S.apply(); onChange(target, true, S); return; }
    const total = dur || Math.min(560, 280 + Math.abs(delta) * 130), t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / total);
      const e = 1 - Math.pow(1 - p, 3);        // easeOutCubic
      S.pos = from + delta * e;
      S.apply();
      if(p < 1) S.raf = requestAnimationFrame(step);
      else { S.pos = target; S.apply(); onChange(target, true, S); }
    };
    S.raf = requestAnimationFrame(step);
  };
  S.setIndex = (i, instant) => {
    i = wClamp(i, 0, Math.max(0, S.items.length - 1));
    if(instant){ cancelAnimationFrame(S.raf); S.pos = i; S.lastIdx = i; S.apply(); } else S.animateTo(i);
  };

  /* ---- geser dengan jari (halus, ada momentum) ---- */
  const unit = () => (detail ? Math.max(120, S.H * 0.7) : S.W * 0.62);
  el.addEventListener('pointerdown', (e) => {
    if(S.items.length < 1 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelAnimationFrame(S.raf);
    S.drag = { x:e.clientX, y:e.clientY, p0:S.pos, t:performance.now(), lx:e.clientX, ly:e.clientY, lt:performance.now(), v:0, moved:false, locked:false, target:e.target, id:e.pointerId };
  });
  el.addEventListener('pointermove', (e) => {
    const g = S.drag; if(!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if(!g.locked){
      if(Math.hypot(dx, dy) < 7) return;
      if(!detail && Math.abs(dy) > Math.abs(dx)){ S.drag = null; return; }      // geser vertikal = gulir halaman
      g.locked = true; g.moved = true;
      try{ el.setPointerCapture(e.pointerId); }catch(_){}
    }
    const along = detail ? (Math.abs(dx) > Math.abs(dy) ? -dx : -dy) : -dx;
    const now = performance.now();
    const raw = g.p0 + along / unit();
    const n = S.items.length - 1;
    S.pos = raw < 0 ? raw * 0.3 : (raw > n ? n + (raw - n) * 0.3 : raw);        // tarikan karet di ujung
    const prevAlong = detail ? (Math.abs(g.lx - g.x) > Math.abs(g.ly - g.y) ? -(g.lx - g.x) : -(g.ly - g.y)) : -(g.lx - g.x);
    const dt = Math.max(1, now - g.lt);
    g.v = 0.8 * ((along - prevAlong) / unit() / dt) + 0.2 * g.v;                 // kartu per ms
    g.lx = e.clientX; g.ly = e.clientY; g.lt = now;
    S.apply();
    e.preventDefault();
  }, { passive:false });
  const end = (e, cancelled) => {
    const g = S.drag; if(!g || (e && e.pointerId !== g.id)) return;
    S.drag = null;
    if(g.locked){
      try{ el.releasePointerCapture(g.id); }catch(_){}
      const fresh = performance.now() - g.lt < 90;
      const proj = S.pos + (fresh ? g.v * 170 : 0);
      S.animateTo(cancelled ? S.pos : proj);
      return;
    }
    if(cancelled) return;
    // ketuk (tanpa geser)
    const cardEl = g.target && g.target.closest ? g.target.closest('.wc') : null;
    const i = cardEl ? S.cards.findIndex(c => c.el === cardEl) : -1;
    if(i < 0) return;
    if(i === Math.round(S.pos)){ if(!detail) openWalletDetail(); }
    else S.animateTo(i);
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
  return S;
}

function wOnChange(idx, settled, src){
  wSel = idx;
  if(!wSyncing){
    wSyncing = true;
    const other = src === wMain ? wDet : wMain;
    if(other && other.items.length) other.setIndex(idx, true);
    wSyncing = false;
  }
  wRenderTx();
  wUpdateActions();
}

function wRenderTx(){
  const wrap = document.getElementById('w-tx');
  if(!wrap || !currentData) return;
  const it = walletItems()[wSel];
  if(!it){ wrap.innerHTML = ''; return; }
  const txs = currentData.transactions
    .filter(t => t.source && t.source.type === it.kind && (it.kind === 'cash' || t.source.id === it.id))
    .sort((x, y) => new Date(y.date) - new Date(x.date)).slice(0, 4);
  if(!txs.length){ wrap.innerHTML = '<div class="w-empty">Belum ada transaksi di dompet ini</div>'; return; }
  wrap.innerHTML = txs.map((t, k) => {
    const d = new Date(t.date);
    const ds = d.toLocaleDateString('id-ID', { day:'numeric', month:'short' });
    const ts = d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    return `<div class="w-tx" style="animation-delay:${k*40}ms">
      <div class="w-tx-ico">${txIconSVG(t.type)}</div>
      <div class="w-tx-info"><b>${escapeHtml(t.name)}</b><small>${ts}</small></div>
      <div class="w-tx-amt"><b>${t.type === 'in' ? '+' : '-'} ${fmtRupiah(t.amount)}</b><small>${ds}</small></div>
    </div>`;
  }).join('');
}

function wUpdateActions(){
  const it = walletItems()[wSel]; if(!it) return;
  const canOpen = !!(it.key && APP_PACKAGES[it.key]), canDel = it.kind !== 'cash';
  const set = (id, on) => { const b = document.getElementById(id); if(b) b.disabled = !on; };
  set('wa-open', canOpen); set('wa-del', canDel); set('wd-open', canOpen); set('wd-del', canDel);
  const ty = document.getElementById('wd-type'); if(ty) ty.textContent = it.label;
  const ow = document.getElementById('wd-owner'); if(ow) ow.textContent = currentUser || '-';
}

function wAction(kind){
  const it = walletItems()[wSel]; if(!it) return;
  if(kind === 'edit') openBalanceModal(it.kind, it.id);
  else if(kind === 'open'){
    if(it.key && APP_PACKAGES[it.key]) openExternalApp(it.key, it.name);
    else showToast('Dompet ini tidak punya aplikasi untuk dibuka');
  } else if(kind === 'del'){
    if(it.kind !== 'cash') confirmDeleteWallet(it.kind, it.id);
  }
}

function openWalletDetail(){
  const detailEl = document.getElementById('wallet-detail');
  if(!wDet) wDet = makeStack(document.getElementById('wd-stack'), 'detail', wOnChange);
  wDet.render(walletItems(), wSel);
  wUpdateActions();
  if(!detailEl.classList.contains('active')) ovOpen('wallet-detail');
  requestAnimationFrame(() => { wDet.layout(); });
  setTimeout(() => wDet.layout(), 420);
}
function wdNext(){
  if(!wDet || !wDet.items.length) return;
  const n = wDet.items.length;
  wDet.animateTo(Math.round(wDet.pos) + 1 >= n ? 0 : Math.round(wDet.pos) + 1);
}

function refreshWallets(){
  const items = walletItems();
  wSel = wClamp(wSel, 0, items.length - 1);
  document.getElementById('w-total').textContent = fmtRupiah(totalBalance());
  applyAvatar(document.getElementById('w-avatar'));
  if(!wMain) wMain = makeStack(document.getElementById('w-stack'), 'main', wOnChange);
  wMain.render(items, wSel);
  if(wDet && document.getElementById('wallet-detail').classList.contains('show')){ wDet.render(items, wSel); wDet.layout(); }
  wRenderTx();
  wUpdateActions();
  requestAnimationFrame(() => wMain.layout());
}
window.addEventListener('resize', () => { if(wMain) wMain.layout(); if(wDet) wDet.layout(); });

/* Satu tombol ⋮ per dompet -> sheet berisi "Ubah saldo" dan "Hapus" */
function openWalletMenu(kind, id){
  const list = kind === 'bank' ? currentData.banks : currentData.ewallets;
  const item = list.find(w => w.id === id);
  if(!item) return;
  const bal = (kind === 'bank' ? currentData.balances.bank : currentData.balances.ewallet)[id] || 0;
  window._menuTarget = { kind, id };

  const logoHTML = item.logo
    ? `<img src="${escapeHtml(item.logo)}" class="wlogo" alt="">`
    : `<span class="wlogo wlogo-fallback">${escapeHtml((item.name||'?').charAt(0).toUpperCase())}</span>`;
  const pencil = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const trash = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const label = kind === 'bank' ? 'bank' : 'e-wallet';

  document.getElementById('wallet-picker-body').innerHTML = `
    <div class="menu-head">
      ${logoHTML}
      <div><h3 class="modal-title">${escapeHtml(item.name)}</h3><p class="modal-sub">${fmtRupiah(bal)}</p></div>
    </div>
    <button class="menu-item" style="animation-delay:40ms" onclick="walletMenuEdit()">
      <span class="mi-ico">${pencil}</span>
      <span><span class="mi-title">Ubah saldo</span><span class="mi-sub">Isi atau koreksi saldo ${label} ini</span></span>
    </button>
    <button class="menu-item danger" style="animation-delay:90ms" onclick="walletMenuDelete()">
      <span class="mi-ico">${trash}</span>
      <span><span class="mi-title">Hapus ${label}</span><span class="mi-sub">Riwayat lama tetap tersimpan</span></span>
    </button>`;
  openModal('wallet-picker-modal');
}
function walletMenuEdit(){
  const t = window._menuTarget; if(!t) return;
  openBalanceModal(t.kind, t.id);
}
function walletMenuDelete(){
  const t = window._menuTarget; if(!t) return;
  closeWalletPicker();
  confirmDeleteWallet(t.kind, t.id);
}

/* ---------- Ubah / isi saldo (bank, e-wallet, cash) ---------- */
function openBalanceModal(kind, id, isNew){
  let name, logoHTML = '', current;
  if(kind === 'cash'){
    name = 'Cash di tangan';
    current = currentData.balances.cash || 0;
  } else {
    const list = kind === 'bank' ? currentData.banks : currentData.ewallets;
    const item = list.find(w => w.id === id);
    if(!item) return;
    name = item.name;
    if(item.logo) logoHTML = `<img src="${escapeHtml(item.logo)}" class="wlogo" alt="">`;
    current = (kind === 'bank' ? currentData.balances.bank : currentData.balances.ewallet)[id] || 0;
  }
  window._balTarget = { kind, id };

  const title = isNew ? `${escapeHtml(name)} ditambahkan` : 'Ubah saldo';
  const sub = isNew ? 'Isi saldo awalnya sekarang (boleh dikosongkan).' : 'Masukkan saldo yang benar saat ini.';

  document.getElementById('wallet-picker-body').innerHTML = `
    <h3 class="modal-title">${title}</h3>
    <p class="modal-sub">${sub}</p>
    <div class="row-card" style="margin-bottom:14px;">
      <div class="row-ico">${logoHTML || 'Rp'}</div>
      <div class="row-body">
        <small>${escapeHtml(name)}</small>
        <input type="text" id="bal-input" class="money-input" data-neg="1" inputmode="numeric" autocomplete="off" placeholder="0" value="${moneyVal(current)}" onkeydown="if(event.key==='Enter') saveBalance()">
      </div>
    </div>
    <button class="btn-pill" style="width:100%;" onclick="saveBalance()">Simpan saldo</button>
  `;
  openModal('wallet-picker-modal');
  setTimeout(() => { const i = document.getElementById('bal-input'); if(i){ i.focus(); i.select(); } }, 350);
}

function saveBalance(){
  const t = window._balTarget;
  if(!t) return;
  const raw = document.getElementById('bal-input').value;
  const val = raw.trim() === '' ? 0 : parseMoney(raw);

  if(t.kind === 'cash') currentData.balances.cash = val;
  else if(t.kind === 'bank') currentData.balances.bank[t.id] = val;
  else currentData.balances.ewallet[t.id] = val;

  saveUserData(currentUser, currentData);
  closeWalletPicker();
  refreshWallets();
  refreshHome();
  showToast('Saldo disimpan');
}

/* Hapus bank/e-wallet. Kalau masih ada transaksi yang tercatat lewat
   sumber ini, transaksi itu tetap disimpan di riwayat (histori tidak
   dihapus) tapi kehilangan tautan ke walletnya -- source.name tetap
   tampil apa adanya di riwayat lama, hanya wallet & saldonya yang hilang. */
function confirmDeleteWallet(kind, id){
  const list = kind === 'bank' ? currentData.banks : currentData.ewallets;
  const item = list.find(w => w.id === id);
  if(!item) return;

  const balances = kind === 'bank' ? currentData.balances.bank : currentData.balances.ewallet;
  const bal = balances[id] || 0;
  const balWarn = bal !== 0 ? ` Saldo saat ini ${fmtRupiah(bal)} akan ikut hilang dari total.` : '';

  if(!confirm(`Hapus ${item.name}?${balWarn} Riwayat transaksi lama tetap tersimpan.`)) return;

  const idx = list.findIndex(w => w.id === id);
  if(idx > -1) list.splice(idx, 1);
  delete balances[id];

  saveUserData(currentUser, currentData);
  refreshWallets();
  refreshHome();
  showToast(`${item.name} dihapus`);
}

/* Tombol + di tab Dompet: tanya bank atau e-wallet dulu, lalu buka picker logo */
function openAddWalletModal(){
  const names = (kind) => catalogFor(kind).slice(0,3).map(c => c.name).join(', ') + ', dll.';
  document.getElementById('wallet-picker-body').innerHTML = `
    <h3 class="modal-title">Tambah dompet</h3>
    <p class="modal-sub">Mau tambah apa?</p>
    <div class="pay-grid two" style="margin-bottom:12px;">
      <div class="pay-tile big t0" style="animation-delay:0ms" onclick="openWalletPicker('wallets-bank')">
        ${sourceIconSVG('bank')}
        <span class="pname">Bank</span>
        <span class="pdesc">${escapeHtml(names('bank'))}</span>
      </div>
      <div class="pay-tile big t1" style="animation-delay:60ms" onclick="openWalletPicker('wallets-ewallet')">
        ${sourceIconSVG('ewallet')}
        <span class="pname">E-wallet</span>
        <span class="pdesc">${escapeHtml(names('ewallet'))}</span>
      </div>
    </div>`;
  openModal('wallet-picker-modal');
}

/* =========================================================
   SETTINGS TAB
   ========================================================= */
function refreshSettings(){
  document.getElementById('set-username').textContent = currentUser;
  document.getElementById('set-name-big').textContent = currentUser;
  refreshAvatars();
  const labels = { gaji:'Gaji', usaha:'Usaha', keduanya:'Gaji & usaha' };
  const incEl = document.getElementById('set-incometype');
  incEl.textContent = labels[currentData.incomeType] || '-';
  const incRow = incEl.parentElement;
  incRow.classList.add('tap');
  incRow.onclick = openIncomeTypeModal;
  const n = currentData.transactions.length;
  document.getElementById('set-txcount').textContent = n;
  const sub = document.getElementById('set-profile-sub');
  if(sub) sub.textContent = n + ' transaksi tercatat';
  const bd = document.getElementById('set-build');
  if(bd) bd.textContent = (typeof APP_BUILD !== 'undefined' && APP_BUILD) ? 'build ' + APP_BUILD : '';
}

function openIncomeTypeModal(){
  const ico = {
    gaji:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="1.9"/><path d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7M3 13h18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    usaha:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    keduanya:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/><path d="M12 7v10M8.5 10h7M8.5 14h7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
  };
  const opts = [['gaji','Gaji','Bulanan atau harian'],['usaha','Usaha','Jualan atau bisnis sendiri'],['keduanya','Gaji & usaha','Dua-duanya']];
  document.getElementById('wallet-picker-body').innerHTML = `
    <h3 class="modal-title">Jenis penghasilan</h3>
    <p class="modal-sub">Pilih yang paling sesuai. Bisa diganti lagi kapan saja.</p>` +
    opts.map(([k,label,desc],i) => `
    <button class="menu-item${currentData.incomeType===k?' selected':''}" style="animation-delay:${i*45}ms" onclick="setIncomeType('${k}')">
      <span class="mi-ico">${ico[k]}</span>
      <span><span class="mi-title">${label}</span><span class="mi-sub">${desc}</span></span>
      <span class="mi-check">${CHECK_SVG}</span>
    </button>`).join('');
  openModal('wallet-picker-modal');
}
function setIncomeType(type){
  if(!['gaji','usaha','keduanya'].includes(type)) return;
  currentData.incomeType = type;
  saveUserData(currentUser, currentData);
  closeWalletPicker();
  refreshSettings();
  showToast('Jenis penghasilan diperbarui');
}

/* =========================================================
   PDF RECEIPT
   ========================================================= */
function printReceipt(){
  if(!window.jspdf || !window.jspdf.jsPDF){
    showToast('Library PDF belum termuat. Sambungkan internet sekali, lalu coba lagi.');
    return;
  }
  const { jsPDF } = window.jspdf;
  // Tinggi struk dihitung dari isi: header ~28mm + 8,6mm per transaksi + footer ~44mm
  const n = currentData.transactions.length;
  const pageH = Math.max(100, Math.ceil(28 + (n ? n*8.6 : 5) + 44));
  const doc = new jsPDF({ unit:'mm', format:[80, pageH] });

  let y = 10;
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.text('MONEYPRI', 40, y, { align:'center' }); y += 5;
  doc.setFontSize(8);
  doc.setFont('courier','normal');
  doc.text(`Akun: ${currentUser}`, 40, y, { align:'center' }); y += 4;
  doc.text(new Date().toLocaleString('id-ID'), 40, y, { align:'center' }); y += 4;
  doc.text('--------------------------------', 40, y, { align:'center' }); y += 5;

  const txs = currentData.transactions.slice().reverse();
  if(!txs.length){ doc.text('Belum ada transaksi', 40, y, { align:'center' }); y += 5; }
  let sumIn = 0, sumOut = 0;

  txs.forEach(t => {
    if(t.type==='in') sumIn += t.amount; else sumOut += t.amount;
    const d = new Date(t.date);
    const dateStr = d.toLocaleDateString('id-ID', {day:'2-digit',month:'2-digit',year:'2-digit'}) + ' ' + d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    doc.setFontSize(7.5);
    doc.text(dateStr + '  ' + (t.source.name||''), 5, y); y += 3.6;
    doc.setFontSize(8.5);
    const sign = t.type === 'in' ? '+' : '-';
    const nameLine = t.name.length > 20 ? t.name.slice(0,20)+'..' : t.name;
    doc.text(nameLine, 5, y);
    doc.text(sign + t.amount.toLocaleString('id-ID'), 75, y, { align:'right' });
    y += 5;
  });

  doc.text('--------------------------------', 40, y, { align:'center' }); y += 5;
  doc.setFont('courier','bold');
  doc.setFontSize(9);
  doc.text('TOTAL MASUK', 5, y); doc.text(sumIn.toLocaleString('id-ID'), 75, y, {align:'right'}); y += 5;
  doc.text('TOTAL KELUAR', 5, y); doc.text(sumOut.toLocaleString('id-ID'), 75, y, {align:'right'}); y += 5;
  doc.text('SALDO AKHIR', 5, y); doc.text(totalBalance().toLocaleString('id-ID'), 75, y, {align:'right'}); y += 8;

  doc.setFont('courier','normal');
  doc.setFontSize(7.5);
  doc.text('Terima kasih sudah mencatat', 40, y, {align:'center'}); y += 4;
  doc.text('keuanganmu dengan rapi :)', 40, y, {align:'center'});

  try{
    doc.save(`struk-${currentUser}-${todayKey()}.pdf`);
    showToast('Struk PDF diunduh');
  }catch(e){
    showToast('Gagal membuat struk PDF');
  }
}

/* =========================================================
   AUTO-UPDATE (Service Worker)
   Tujuan: begitu ada versi baru ter-deploy di GitHub Pages, app
   mendeteksinya sendiri tanpa kamu perlu naikkan nomor versi apa
   pun secara manual — dan tanpa user perlu clear cache Chrome.

   Cara kerja sekarang: sw.js pakai strategi network-first untuk
   semua file inti (index.html, app.js, manifest.json) dengan
   cache:'no-store', jadi begitu user online, file yang dipakai
   SELALU versi terbaru langsung dari server — bukan dari cache.
   Cache di sw.js cuma dipakai sebagai fallback offline.
   Jadi kamu tinggal upload ulang file ke GitHub Pages, dan versi
   baru langsung kepakai di request berikutnya. Tidak perlu ubah
   apa pun di sw.js setiap deploy.
   ========================================================= */
function showAuthInfo(){
  showToast('Datamu tersimpan di perangkat ini saja. Buat backup berkala di Pengaturan.');
}

function toggleAuthPass(id, btn){
  const inp = document.getElementById(id);
  if(!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if(btn) btn.classList.toggle('on', show);
}

function setUpdateBtnState(mode){
  const btn = document.getElementById('update-check-btn');
  if(!btn) return;
  btn.classList.remove('spinning','has-update');
  if(mode === 'checking') btn.classList.add('spinning');
  if(mode === 'available') btn.classList.add('has-update');
}

function initServiceWorker(){
  if(!('serviceWorker' in navigator)) return;

  const versionLabel = document.getElementById('app-version-label');
  if(versionLabel) versionLabel.textContent = 'Auto-update aktif' + (APP_BUILD ? ' · build ' + APP_BUILD : '');

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

/* ---------- Pembaruan otomatis ----------
   Setiap rilis punya "build" (meta app-build di index.html). Saat aplikasi dibuka
   atau dibuka kembali dari latar belakang, build yang sedang jalan dibandingkan
   dengan build terbaru di server. Kalau beda, cache dibersihkan lalu halaman
   dimuat ulang dari server -- jadi APK tidak tertahan di versi lama. */
const APP_BUILD = (document.querySelector('meta[name="app-build"]') || {}).content || '';
let lastBuildCheck = 0;

async function fetchLatestBuild(){
  const r = await fetch('index.html?cb=' + Date.now(), { cache: 'no-store' });
  if(!r.ok) throw new Error('http ' + r.status);
  const t = await r.text();
  const m = t.match(/<meta name="app-build" content="([^"]+)"/);
  return m ? m[1] : '';
}

async function hardRefresh(){
  try{ localStorage.setItem('cu_refresh_ts', String(Date.now())); }catch(_){}
  try{
    if('serviceWorker' in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if(window.caches){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  }catch(_){}
  const u = new URL(location.href);
  u.searchParams.set('r', Date.now());
  location.replace(u.toString());
}

function showUpdateBanner(){
  if(document.getElementById('update-banner')) return;
  const b = document.createElement('div');
  b.id = 'update-banner';
  b.style.cssText = 'position:fixed;left:16px;right:16px;top:calc(12px + env(safe-area-inset-top));z-index:9998;background:#0B2B29;color:#fff;border-radius:16px;padding:10px 10px 10px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 14px 30px -10px rgba(0,0,0,.5);font-family:inherit;font-size:14px;font-weight:700;';
  b.innerHTML = '<span style="flex:1">Versi baru tersedia</span>' +
    '<button id="update-banner-go" style="border:0;border-radius:999px;padding:9px 16px;background:#14B8A6;color:#fff;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer">Perbarui</button>' +
    '<button id="update-banner-x" aria-label="Tutup" style="border:0;background:none;color:#fff;opacity:.7;font-size:18px;padding:4px 8px;cursor:pointer">✕</button>';
  document.body.appendChild(b);
  document.getElementById('update-banner-go').onclick = () => { b.remove(); hardRefresh(); };
  document.getElementById('update-banner-x').onclick = () => b.remove();
}

// mode: 'start' (otomatis saat dibuka) | 'resume' (kembali dari latar belakang) | 'manual' (tombol)
async function checkForNewBuild(mode){
  lastBuildCheck = Date.now();
  if(!navigator.onLine) return 'offline';
  let latest;
  try{ latest = await fetchLatestBuild(); }catch(_){ return 'error'; }
  if(!latest || !APP_BUILD || latest === APP_BUILD) return 'same';
  const recent = Date.now() - Number(localStorage.getItem('cu_refresh_ts') || 0) < 180000;
  if(mode !== 'manual' && recent) return 'same';   // cegah muat ulang berulang
  if(mode === 'resume'){ showUpdateBanner(); return 'new'; }
  await hardRefresh();
  return 'new';
}

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && Date.now() - lastBuildCheck > 45000) checkForNewBuild('resume');
});
window.addEventListener('online', () => checkForNewBuild('resume'));

// Tombol ↻ manual: cek build terbaru, kalau berbeda langsung perbarui.
async function manualCheckUpdate(){
  setUpdateBtnState('checking');
  showToast('Mengecek pembaruan…');
  const res = await checkForNewBuild('manual');
  if(res === 'new') return;                       // sedang memuat ulang
  setUpdateBtnState('');
  if(res === 'same') showToast('Sudah versi terbaru');
  else if(res === 'offline') showToast('Tidak ada koneksi internet');
  else showToast('Gagal mengecek pembaruan');
}

/* =========================================================
   BACKUP MANUAL (Export / Import)
   Data disimpan di localStorage browser, jadi akan ikut hilang
   kalau app di-uninstall dari HP. Fitur ini memungkinkan user
   men-download seluruh datanya jadi file .json, dan memulihkannya
   lagi nanti (misal setelah reinstall / ganti HP).
   ========================================================= */
async function exportBackup(){
  if(!currentUser || !currentData){ showToast('Belum ada akun yang login'); return; }

  const users = getUsers();
  const backup = {
    app: 'MoneyPri',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    username: currentUser,
    userRecord: users[currentUser],
    data: currentData
  };
  const json = JSON.stringify(backup, null, 2);
  const fileName = `backup-moneypri-${safeFileName(currentUser)}-${todayKey()}.json`;

  // 1) APK Android: simpan langsung ke folder Download (hanya klaim berhasil kalau benar-benar tertulis)
  const saver = nativeFileSaver();
  if(saver){
    try{
      await saver.save({ name: fileName, data: json, mime: 'application/json' });
      showToast('Tersimpan di folder Download: ' + fileName);
      return;
    }catch(_){ /* APK lama tanpa plugin / gagal tulis -> coba cara berikutnya */ }
  }

  // 2) HP (PWA / WebView): buka menu bagikan agar pengguna memilih tempat simpan (Files, Drive, WhatsApp, dll.)
  let file = null;
  try{ file = new File([json], fileName, { type: 'application/json' }); }catch(_){}
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(isMobile && file && navigator.canShare && navigator.canShare({ files: [file] })){
    try{
      await navigator.share({ files: [file], title: 'Backup MoneyPri' });
      showToast('Pilih tujuan di menu untuk menyimpan backup');
      return;
    }catch(e){
      if(e && e.name === 'AbortError'){ showToast('Backup dibatalkan'); return; }
    }
  }

  // 3) Peramban biasa: unduh lewat tautan. URL baru dilepas setelah jeda supaya unduhan sempat dimulai.
  try{
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 30000);
    showToast('Unduhan dimulai. Cek folder Download atau notifikasi unduhan');
  }catch(_){
    showToast('Gagal menyimpan backup di perangkat ini');
  }
}

function triggerImportBackup(){
  document.getElementById('import-file-input').click();
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const num = (v, d=0) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && isFinite(Number(v)) ? Number(v) : d;
const cleanStr = (v, max) => String(v == null ? '' : v).slice(0, max);

function sanitizeBalanceMap(obj){
  const out = {};
  if(!obj || typeof obj !== 'object') return out;
  Object.keys(obj).forEach(k => {
    if(BAD_NAMES.includes(k)) return;
    out[k] = num(obj[k], 0);
  });
  return out;
}
function sanitizeWalletList(list, kind){
  const out = [];
  (Array.isArray(list) ? list : []).forEach(item => {
    if(typeof item === 'string'){ out.push(cleanStr(item, 40)); return; } // format lama, dimigrasi saat dimuat
    if(!item || typeof item !== 'object' || !SAFE_ID.test(String(item.id))) return;
    const cat = catalogItem(kind, item.key);
    out.push({ id:String(item.id), key: cat ? cat.key : null, name: cleanStr(item.name, 40) || (cat ? cat.name : 'Tanpa nama'), logo: cat ? cat.logo : null });
  });
  return out;
}
// Mengembalikan data bersih, atau null kalau strukturnya tidak masuk akal
function sanitizeBackupData(d){
  if(!d || typeof d !== 'object') return null;
  const banks = sanitizeWalletList(d.banks, 'bank');
  const ewallets = sanitizeWalletList(d.ewallets, 'ewallet');
  const bal = d.balances || {};
  const txs = [];
  (Array.isArray(d.transactions) ? d.transactions : []).forEach(t => {
    if(!t || typeof t !== 'object') return;
    if(t.type !== 'in' && t.type !== 'out') return;
    const amount = num(t.amount, 0);
    const when = new Date(t.date);
    if(amount <= 0 || isNaN(when.getTime())) return;
    const src = t.source && typeof t.source === 'object' ? t.source : {};
    const stype = ['bank','ewallet','cash'].includes(src.type) ? src.type : 'cash';
    txs.push({
      id: SAFE_ID.test(String(t.id)) ? String(t.id) : uid(),
      type: t.type,
      amount,
      name: cleanStr(t.name, 100),
      source: { type:stype, id: SAFE_ID.test(String(src.id)) ? String(src.id) : undefined, name: cleanStr(src.name, 40) },
      date: when.toISOString()
    });
  });
  return {
    incomeType: ['gaji','usaha','keduanya'].includes(d.incomeType) ? d.incomeType : null,
    profilePhoto: (typeof d.profilePhoto === 'string' && d.profilePhoto.length < 500000 && PHOTO_RE.test(d.profilePhoto)) ? d.profilePhoto : null,
    banks, ewallets,
    balances: { cash: num(bal.cash, 0), bank: sanitizeBalanceMap(bal.bank), ewallet: sanitizeBalanceMap(bal.ewallet) },
    transactions: txs
  };
}
function sanitizeUserRecord(r){
  if(!r || typeof r !== 'object' || typeof r.passHash !== 'string') return null;
  const out = { passHash: cleanStr(r.passHash, 200), createdAt: cleanStr(r.createdAt, 40) };
  if(r.algo === 'pbkdf2'){
    const iter = num(r.iter, 0);
    if(typeof r.salt !== 'string' || iter < 1000 || iter > 1000000) return null;
    out.algo = 'pbkdf2'; out.salt = cleanStr(r.salt, 100); out.iter = iter;
  }
  return out;
}

function handleImportFile(event){
  const file = event.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    let backup;
    try{
      backup = JSON.parse(e.target.result);
    }catch(err){
      showToast('File backup tidak valid');
      event.target.value = '';
      return;
    }

    const cleanData = backup ? sanitizeBackupData(backup.data) : null;
    const cleanUsername = backup && typeof backup.username === 'string' ? backup.username.trim() : '';
    if(!cleanData || !cleanUsername || cleanUsername.length > 30 || BAD_NAMES.includes(cleanUsername)){
      showToast('File backup tidak valid');
      event.target.value = '';
      return;
    }
    const cleanRecord = sanitizeUserRecord(backup.userRecord);

    const targetUsername = cleanUsername;
    const users = getUsers();
    const alreadyExists = !!users[targetUsername];

    const doImport = () => {
      if(cleanRecord){
        users[targetUsername] = cleanRecord;
        saveUsers(users);
      } else if(!users[targetUsername]){
        showToast('Backup tidak berisi sandi yang valid');
        event.target.value = '';
        return;
      }
      saveUserData(targetUsername, cleanData);
      showToast(`Backup akun "${targetUsername}" berhasil dipulihkan`);
      event.target.value = '';

      // Kalau akun yang dipulihkan adalah akun yang sedang login, refresh tampilan
      if(currentUser === targetUsername){
        currentData = getUserData(targetUsername);
        refreshHome(); refreshWallets(); refreshSettings();
      }
    };

    if(alreadyExists){
      const ok = confirm(`Akun "${targetUsername}" sudah ada di perangkat ini. Timpa dengan data dari file backup?`);
      if(!ok){ event.target.value = ''; return; }
    }
    doImport();
  };
  reader.onerror = () => {
    showToast('Gagal membaca file backup');
    event.target.value = '';
  };
  reader.readAsText(file);
}


function hideSplash(){
  const s = document.getElementById('splash');
  if(!s || s.dataset.done) return;
  s.dataset.done = '1';
  s.classList.add('hide');
  setTimeout(() => { if(s.parentNode) s.parentNode.removeChild(s); }, 500);
}

(function init(){
  // Tidak ada layar yang tampil sampai kita tahu tujuannya (login atau beranda),
  // jadi layar login tidak sempat berkedip sebelum pindah ke menu.
  try{
    initServiceWorker();
    const session = localStorage.getItem(LS_SESSION);
    const data = session ? getUserData(session) : null;
    if(session && data){
      currentUser = session;
      currentData = data;
      if(!currentData.incomeType) goTo('screen-ob-income');
      else enterApp();
    } else {
      goTo('screen-login');
    }
  }catch(e){
    goTo('screen-login');
  }
  // buka splash setelah layar tujuan tergambar dan pengecekan versi selesai
  // (kalau ada versi baru, halaman dimuat ulang sementara splash tetap tampil)
  (async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const minWait = Math.max(0, 600 - (window.performance && performance.now ? performance.now() : 0));
    const check = Promise.race([checkForNewBuild('start'), new Promise(r => setTimeout(() => r('timeout'), 1800))]);
    await new Promise(r => setTimeout(r, minWait));
    const res = await check;
    if(res !== 'new') hideSplash();
  })();
})();

// pengaman: kalau karena apa pun belum ada layar yang aktif, tampilkan login
setTimeout(() => {
  if(!document.querySelector('.screen.active')) goTo('screen-login');
  hideSplash();
}, 5000);
