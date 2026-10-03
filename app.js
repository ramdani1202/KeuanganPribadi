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
  document.querySelectorAll('#screen-ob-income .source-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
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
  const logoHTML = b.logo
    ? `<img src="${escapeHtml(b.logo)}" class="wlogo" alt="">`
    : `<span class="wlogo wlogo-fallback">${escapeHtml((b.name||'?').charAt(0).toUpperCase())}</span>`;
  const row = document.createElement('div');
  row.className = 'row-item';
  row.style.animationDelay = (i*40) + 'ms';
  row.innerHTML = `${logoHTML}<span class="rname">${escapeHtml(b.name)}</span>
    <span class="rbal">${fmtRupiah(bal)}</span>
    <button class="rmore" aria-label="Menu ${escapeHtml(b.name)}" title="Ubah saldo / hapus">${MORE_SVG}</button>`;
  row.querySelector('.rmore').onclick = () => openWalletMenu(kind, b.id);
  return row;
}

function refreshWallets(){
  const bankWrap = document.getElementById('wallet-bank-list');
  bankWrap.innerHTML = '';
  if(currentData.banks.length === 0){
    bankWrap.innerHTML = '<p class="sub">Belum ada rekening bank.</p>';
  }
  currentData.banks.forEach((b, i) => bankWrap.appendChild(walletListRow('bank', b, i)));

  const ewWrap = document.getElementById('wallet-ewallet-list');
  ewWrap.innerHTML = '';
  if(currentData.ewallets.length === 0){
    ewWrap.innerHTML = '<p class="sub">Belum ada e-wallet.</p>';
  }
  currentData.ewallets.forEach((b, i) => ewWrap.appendChild(walletListRow('ewallet', b, i)));

  document.getElementById('wallet-cash-display').textContent = fmtRupiah(currentData.balances.cash||0);
}

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
  incEl.textContent = (labels[currentData.incomeType] || '-') + '  ›';
  const incRow = incEl.parentElement;
  incRow.style.cursor = 'pointer';
  incRow.onclick = openIncomeTypeModal;
  document.getElementById('set-txcount').textContent = currentData.transactions.length;
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
  if(versionLabel) versionLabel.textContent = 'Auto-update aktif';

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

// Tombol ↻ manual: karena file inti (index.html/app.js) sudah
// network-first, cara paling pasti untuk "cek update sekarang" adalah
// muat ulang halaman langsung dari server.
function manualCheckUpdate(){
  setUpdateBtnState('checking');
  showToast('Mengecek pembaruan…');
  setTimeout(() => {
    window.location.reload();
  }, 400);
}

/* =========================================================
   BACKUP MANUAL (Export / Import)
   Data disimpan di localStorage browser, jadi akan ikut hilang
   kalau app di-uninstall dari HP. Fitur ini memungkinkan user
   men-download seluruh datanya jadi file .json, dan memulihkannya
   lagi nanti (misal setelah reinstall / ganti HP).
   ========================================================= */
function exportBackup(){
  if(!currentUser || !currentData){ showToast('Belum ada akun yang login'); return; }

  const users = getUsers();
  const userRecord = users[currentUser];

  const backup = {
    app: 'MoneyPri',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    username: currentUser,
    userRecord: userRecord,
    data: currentData
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-moneypri-${currentUser}-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Backup berhasil diunduh');
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


(function init(){
  initServiceWorker();
  const session = localStorage.getItem(LS_SESSION);
  if(session){
    const data = getUserData(session);
    if(data){
      currentUser = session;
      currentData = data;
      if(!currentData.incomeType){
        goTo('screen-ob-income');
      } else {
        enterApp();
      }
      return;
    }
  }
  goTo('screen-login');
})();
