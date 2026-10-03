/* =========================================================
   KONTEN BERANDA: Video YouTube
   Daftar video Anda unggah lewat GitHub (tanpa server):
     videos.json  -> daftar link video YouTube (di root repo)
   Thumbnail otomatis dari YouTube. Video hanya tampil
   (diputar) saat perangkat online.
   ========================================================= */
// daftar video dicari di root dulu, lalu di folder content/ (nama file harus videos.json)
const CX_URLS = ['videos.json', 'content/videos.json', 'vidio.json', 'content/vidio.json'];
const CX_COVER_COLORS = [['#14B8A6','#0A6E64'],['#E9776A','#B23F33'],['#4F81E6','#2846AA'],['#F0AA3C','#C86E1E'],['#8E5CF0','#5032AA']];

let cx = { tab:'all', libTab:'all', detail:null, libOpen:false, rateOpen:false, videos:null, loadedAt:0, loading:false, failed:false, user:null, drawn:false };

/* ---------- Pembersih data JSON (jangan percaya isi file mentah) ---------- */
function cxStr(v, max){ return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max); }
function cxSafeUrl(u){
  if(typeof u !== 'string') return '';
  u = u.trim();
  if(!u || u.length > 300) return '';
  if(/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
  if(/^[A-Za-z0-9_\-.\/ %()]+$/.test(u) && !u.includes('..') && !u.startsWith('/')) return u;
  return '';
}
function cxHref(u){ try{ return encodeURI(decodeURI(u)); }catch(_){ return encodeURI(u); } } // aman untuk atribut src/href

/* Ambil ID video dari berbagai bentuk link YouTube (atau ID 11 karakter langsung) */
function cxYtId(u){
  if(typeof u !== 'string') return '';
  u = u.trim();
  if(/^[A-Za-z0-9_-]{11}$/.test(u)) return u;
  let url;
  try{ url = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); }catch(_){ return ''; }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id = '';
  if(host === 'youtu.be') id = url.pathname.split('/')[1] || '';
  else if(host === 'youtube.com' || host === 'youtube-nocookie.com'){
    if(url.pathname === '/watch') id = url.searchParams.get('v') || '';
    else { const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/); if(m) id = m[2]; }
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}

function cxMetaCache(id){
  try{ const c = JSON.parse(localStorage.getItem('cu_ytm_' + id) || 'null'); if(c && typeof c === 'object') return c; }catch(_){}
  return null;
}
function cxSanitize(list){
  if(!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  list.slice(0, 80).forEach((v) => {
    if(!v || typeof v !== 'object') return;
    const id = cxYtId(v.url || v.link || v.id);
    if(!id || seen.has(id)) return;
    seen.add(id);
    const m = cxMetaCache(id) || {};
    out.push({
      id,
      title: cxStr(v.title, 120).trim() || cxStr(m.t, 120),
      author: cxStr(v.author || v.channel, 80).trim() || cxStr(m.a, 80),
      category: cxStr(v.category, 24).trim(),
      desc: cxStr(v.desc, 600).trim(),
      thumb: cxSafeUrl(v.thumb || v.thumbnail)
    });
  });
  return out;
}
const cxTitle = (v) => v.title || 'YouTube video';

/* Judul/channel otomatis dari YouTube bila tidak ditulis di JSON (best effort, saat online) */
async function cxFillMeta(){
  if(!cx.videos || !navigator.onLine) return;
  let changed = false;
  for(const v of cx.videos.slice(0, 30)){
    if(v.title && v.author) continue;
    try{
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + v.id));
      if(!r.ok) continue;
      const j = await r.json();
      const t = cxStr(j.title, 120).trim(), a = cxStr(j.author_name, 80).trim();
      if(!v.title && t){ v.title = t; changed = true; }
      if(!v.author && a){ v.author = a; changed = true; }
      try{ localStorage.setItem('cu_ytm_' + v.id, JSON.stringify({ t, a })); }catch(_){}
    }catch(_){}
  }
  if(changed) cxRefreshOpen();
}

/* ---------- Ambil data ---------- */
async function cxFetchJSON(url){
  const r = await fetch(url, { cache: 'no-cache' });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function loadHomeContent(force){
  if(cx.loading) return;
  if(!force && cx.loadedAt && Date.now() - cx.loadedAt < 60000){
    if(cx.user !== currentUser) renderHomeContent(false); // ganti akun -> progres tonton ikut berganti
    return;
  }
  cx.loading = true;
  if(!cx.loadedAt) renderHomeContent(true);
  let ok = false;
  for(const u of CX_URLS){
    try{
      const j = await cxFetchJSON(u);
      cx.videos = cxSanitize(j && j.videos);
      cx.failed = false; ok = true;
      break;
    }catch(_){}
  }
  if(!ok) cx.failed = !cx.videos;
  cx.loadedAt = Date.now();
  cx.loading = false;
  renderHomeContent(false);
  cxFillMeta();
}

/* ---------- Tampilan Beranda ---------- */
const CX_CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CX_SEARCH = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2.2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const CX_BM = (on) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}"><path d="M6.5 4.5h11a1 1 0 011 1V20l-6.5-4-6.5 4V5.5a1 1 0 011-1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
const CX_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>';
const CX_STAR = (on) => `<svg width="30" height="30" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const CX_TABS = [['all','All'],['fav','My List'],['unread','Unwatched']];
const CX_LIB_TABS = [['all','All'],['fav','My List'],['reading','Watching'],['unread','Unwatched'],['done','Finished']];

/* ----- Progres tonton (per akun) ----- */
function cxWatch(id){
  try{
    const v = JSON.parse(localStorage.getItem(`cu_watch_${currentUser}_${id}`) || 'null');
    if(v && v.t >= 3 && v.d > 0) return v;
  }catch(_){}
  return null;
}
const cxDone = (info) => !!info && (info.done || info.t >= info.d - 8);
const cxPct = (info) => info ? Math.max(1, Math.min(100, Math.round(info.t / info.d * 100))) : 0;
function cxFmt(s){
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}

/* ----- My List (per akun) ----- */
function cxFavs(){
  try{ const a = JSON.parse(localStorage.getItem(`cu_fav_${currentUser}`) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; }
  catch(_){ return []; }
}
function cxIsFav(id){ return cxFavs().includes(id); }
function cxToggleFav(ev, id){
  if(ev && ev.stopPropagation) ev.stopPropagation();
  const f = cxFavs(), k = f.indexOf(id);
  if(k === -1) f.push(id); else f.splice(k, 1);
  try{ localStorage.setItem(`cu_fav_${currentUser}`, JSON.stringify(f)); }catch(_){}
  if(typeof showToast === 'function') showToast(k === -1 ? 'Added to My List' : 'Removed from My List');
  cxRefreshOpen();
}

/* ----- Rating bintang (per akun) ----- */
function cxRates(){
  try{ const o = JSON.parse(localStorage.getItem(`cu_rate_${currentUser}`) || '{}'); return o && typeof o === 'object' ? o : {}; }
  catch(_){ return {}; }
}
const cxRate = (id) => { const n = Number(cxRates()[id]); return n >= 1 && n <= 5 ? n : 0; };
function cxSetRate(id, n){
  const o = cxRates();
  if(o[id] === n) delete o[id]; else o[id] = n;
  try{ localStorage.setItem(`cu_rate_${currentUser}`, JSON.stringify(o)); }catch(_){}
  cxRefreshOpen();
}
const cxStars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

function cxMatch(v, tab){
  const info = cxWatch(v.id);
  if(tab === 'fav') return cxIsFav(v.id);
  if(tab === 'unread') return !info;
  if(tab === 'reading') return !!info && !cxDone(info);
  if(tab === 'done') return cxDone(info);
  return true;
}
function cxFiltered(tab, q){
  q = (q || '').trim().toLowerCase();
  const out = [];
  (cx.videos || []).forEach((v, i) => {
    if(!cxMatch(v, tab)) return;
    if(q && !(`${v.title} ${v.author} ${v.category}`.toLowerCase().includes(q))) return;
    out.push({ v, i });
  });
  return out;
}

/* ----- Potongan tampilan ----- */
function cxThumbErr(img){
  if(!img.dataset.f && !img.dataset.custom){
    img.dataset.f = '1';
    img.src = `https://i.ytimg.com/vi/${img.dataset.id}/hqdefault.jpg`;
    img.classList.add('hq'); // hqdefault punya bar hitam atas-bawah; diperbesar sedikit supaya tertutup
  } else img.remove();
}
function cxThumbSrc(v){ return v.thumb ? cxHref(v.thumb) : `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`; }
function cxCover(v, i, cls){
  const [c1, c2] = CX_COVER_COLORS[i % CX_COVER_COLORS.length];
  return `<div class="${cls}" style="background:linear-gradient(145deg,${c1},${c2})"><span class="bk-cov-fb">${escapeHtml(cxTitle(v))}</span><img src="${escapeHtml(cxThumbSrc(v))}" data-id="${v.id}"${v.thumb ? ' data-custom="1"' : ''} alt="" loading="lazy" referrerpolicy="no-referrer" onerror="cxThumbErr(this)"><i class="bk-pl"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></i></div>`;
}
function cxRing(pct){
  const c = 94.25;
  return `<svg class="bk-ring" width="40" height="40" viewBox="0 0 38 38"><circle cx="19" cy="19" r="15" fill="rgba(5,20,19,.45)" stroke="rgba(255,255,255,.28)" stroke-width="3.5"/><circle cx="19" cy="19" r="15" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(2)}" transform="rotate(-90 19 19)"/><text x="19" y="22.6" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="800" font-family="inherit">${pct}</text></svg>`;
}
function cxStatus(info){
  if(!info) return 'Unwatched';
  return cxDone(info) ? 'Finished' : `${cxFmt(info.t)} / ${cxFmt(info.d)}`;
}

function cxContinueCard(v, i, k){
  const info = cxWatch(v.id);
  return `<div class="bk-cc" style="animation-delay:${k*60}ms" onclick="showVideo(${i})">
    ${cxCover(v, i, 'bk-cc-cov')}
    <div class="bk-shade"></div>
    ${cxRing(cxPct(info))}
    <div class="bk-cc-t"><b>${escapeHtml(cxTitle(v))}</b><small>${v.author ? escapeHtml(v.author) : 'YouTube'}</small></div>
  </div>`;
}

function cxListRow(v, i, k){
  const info = cxWatch(v.id), fav = cxIsFav(v.id), rate = cxRate(v.id);
  return `<div class="bk-item" style="animation-delay:${k*45}ms" onclick="showVideo(${i})">
    ${cxCover(v, i, 'bk-thumb')}
    <div class="bk-info">
      <div class="bk-t">${escapeHtml(cxTitle(v))}</div>
      <div class="bk-a">${v.author ? escapeHtml(v.author) : 'YouTube'}</div>
      ${rate ? `<div class="bk-stars">${cxStars(rate)}</div>` : ''}
      <div class="bk-meta"><span>${cxStatus(info)}</span>${v.category ? `<span class="bk-chip">${escapeHtml(v.category)}</span>` : ''}</div>
      ${info && !cxDone(info) ? `<div class="bk-mini"><i style="width:${cxPct(info)}%"></i></div>` : ''}
    </div>
    <button class="bk-bm${fav ? ' on' : ''}" onclick="cxToggleFav(event,'${v.id}')" aria-label="My List">${CX_BM(fav)}</button>
  </div>`;
}

function cxSetTab(t){ cx.tab = t; renderHomeContent(false); }

function renderHomeContent(loadingOnly){
  const el = document.getElementById('cx-books');
  if(!el) return;
  cx.user = (typeof currentUser !== 'undefined') ? currentUser : null;

  // simpan posisi geser baris supaya tidak melompat ke awal saat digambar ulang
  const keep = Array.from(document.querySelectorAll('#cx-books .cx-row')).map(r => r.scrollLeft);
  const restore = () => document.querySelectorAll('#cx-books .cx-row').forEach((r, i) => { if(keep[i]) r.scrollLeft = keep[i]; });
  el.classList.toggle('cx-noanim', cx.drawn);

  if(loadingOnly){
    const sk = '<div class="cx-skel"></div>';
    el.innerHTML = `<div class="bk-top"><div><small>&nbsp;</small><h2>Videos</h2></div></div>${sk}${sk}${sk}`;
    return;
  }

  if(cx.failed){
    el.innerHTML = `<div class="cx-note">Videos couldn't be loaded. Check your internet connection, then <button onclick="loadHomeContent(true)">try again</button>.</div>`;
    cx.drawn = true;
    return;
  }

  if(!(cx.videos && cx.videos.length)){ el.innerHTML = ''; cx.drawn = true; return; }

  const watching = cxFiltered('reading');
  const all = cxFiltered(cx.tab);
  const shown = all.slice(0, 5);

  let html = `<div class="bk-top"><div><small>What would you like to watch today?</small><h2>Videos</h2></div>
    <button class="bk-iconbtn" onclick="openLibrary()" aria-label="Search">${CX_SEARCH}</button></div>`;

  if(watching.length){
    html += `<div class="bk-sec">Continue Watching</div>
      <div class="cx-row">${watching.map(({ v, i }, k) => cxContinueCard(v, i, k)).join('')}</div>`;
  }

  html += `<div class="bk-sec-row"><div class="bk-sec">For You</div><button class="bk-more" onclick="openLibrary()">See all ${CX_CHEV}</button></div>
    <div class="bk-tabs">${CX_TABS.map(([k, l]) => `<button class="bk-tab${cx.tab === k ? ' on' : ''}" onclick="cxSetTab('${k}')">${l}</button>`).join('')}</div>`;

  if(shown.length){
    html += `<div class="bk-list">${shown.map(({ v, i }, k) => cxListRow(v, i, k)).join('')}</div>`;
    if(all.length > shown.length) html += `<button class="bk-all" onclick="openLibrary()">See all ${all.length} videos</button>`;
  } else {
    html += `<div class="cx-note">${cx.tab === 'fav' ? 'Your list is empty. Tap the bookmark icon on any video.' : 'No videos here yet.'}</div>`;
  }

  el.innerHTML = html;
  cx.drawn = true;
  restore();
}

/* ---------- Library (cari + grid) ---------- */
function openLibrary(){
  if(cx.libOpen) return;
  cx.libOpen = true;
  document.getElementById('lib-q').value = '';
  cx.libTab = 'all';
  cxLibRender();
  ovOpen('lib-view');
}
function cxLibSetTab(t){ cx.libTab = t; cxLibRender(); }
function cxLibRender(){
  const chips = document.getElementById('lib-chips');
  const grid = document.getElementById('lib-grid');
  if(!chips || !grid) return;
  chips.innerHTML = CX_LIB_TABS.map(([k, l]) => `<button class="bk-chipbtn${cx.libTab === k ? ' on' : ''}" onclick="cxLibSetTab('${k}')">${l}</button>`).join('');
  const list = cxFiltered(cx.libTab, document.getElementById('lib-q').value);
  if(!list.length){ grid.innerHTML = '<div class="bk-empty">No videos found.</div>'; return; }
  grid.innerHTML = list.map(({ v, i }, k) => {
    const info = cxWatch(v.id), fav = cxIsFav(v.id);
    return `<div class="bk-g" style="animation-delay:${Math.min(k, 10) * 40}ms" onclick="showVideo(${i})">
      ${cxCover(v, i, 'bk-gcov')}
      <div class="bk-shade"></div>
      ${info && !cxDone(info) ? cxRing(cxPct(info)) : ''}
      ${fav ? `<span class="bk-gfav">${CX_BM(true)}</span>` : ''}
      <div class="bk-gt">${escapeHtml(cxTitle(v))}</div>
    </div>`;
  }).join('');
}

/* ---------- Detail video ---------- */
function showVideo(i){
  const v = cx.videos && cx.videos[i];
  if(!v) return;
  cx.detail = i;
  cx.rateOpen = false;
  renderVideoDetail(i);
  document.getElementById('bk-scroll').scrollTop = 0;
  if(!document.getElementById('book-view').classList.contains('active')) ovOpen('book-view');
}

function renderVideoDetail(i){
  const v = cx.videos[i];
  const info = cxWatch(v.id), done = cxDone(info), pct = cxPct(info), fav = cxIsFav(v.id), rate = cxRate(v.id);
  const bgUrl = v.thumb ? cxHref(v.thumb) : `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  const cta = !info ? 'Watch Now' : (done ? 'Watch Again' : 'Continue Watching');
  const share = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="6.5" cy="12" r="2.4" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6" r="2.4" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="18" r="2.4" stroke="currentColor" stroke-width="2"/><path d="M8.6 10.8l6.8-3.6M8.6 13.2l6.8 3.6" stroke="currentColor" stroke-width="2"/></svg>`;
  const star = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${rate ? 'currentColor' : 'none'}"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const others = cxFiltered('all').filter(x => x.i !== i).slice(0, 4);

  document.getElementById('bk-scroll').innerHTML = `
    <div class="bk-hero"><div class="bk-hero-bg" style="background-image:url('${escapeHtml(bgUrl)}')"></div>
      <div class="bk-hero-in">
        ${cxCover(v, i, 'bk-hcov')}
        <div class="bk-hinfo">
          <h1>${escapeHtml(cxTitle(v))}</h1>
          <p>${v.author ? escapeHtml(v.author) : 'YouTube'}</p>
          <div class="bk-hchips"><span>YouTube</span>${v.category ? `<span>${escapeHtml(v.category)}</span>` : ''}${done ? '<span>Finished</span>' : ''}</div>
        </div>
      </div>
      <button class="bk-cta" onclick="openVideo(${i})">${CX_PLAY}<span>${cta}</span></button>
      ${info ? `<div class="bk-hprog"><i style="width:${pct}%"></i></div><div class="bk-hprog-t"><span>${cxStatus(info)} · ${pct}%</span><button onclick="cxRestart(${i})">Restart</button></div>` : ''}
    </div>
    <div class="bk-bodywrap">
      ${v.desc ? `<p class="bk-desc">${escapeHtml(v.desc)}</p>` : ''}
      <div class="bk-acts">
        <button class="bk-act${fav ? ' on' : ''}" onclick="cxToggleFav(event,'${v.id}')">${CX_BM(fav)}<span>My List</span></button>
        <button class="bk-act${rate || cx.rateOpen ? ' on' : ''}" onclick="cxToggleRate()">${star}<span>${rate ? 'Rated ' + rate + '/5' : 'Rate'}</span></button>
        <button class="bk-act" onclick="cxShare(${i})">${share}<span>Share</span></button>
      </div>
      ${cx.rateOpen ? `<div class="bk-rate">${[1,2,3,4,5].map(n => `<button class="${n <= rate ? 'on' : ''}" onclick="cxSetRate('${v.id}',${n})" aria-label="${n} star">${CX_STAR(n <= rate)}</button>`).join('')}</div>` : ''}
      ${others.length ? `<div class="bk-sec" style="margin-top:18px">Trending</div><div class="bk-list">${others.map(({ v: ov, i: oi }, k) => cxListRow(ov, oi, k)).join('')}</div>` : ''}
    </div>`;
}
function cxToggleRate(){ cx.rateOpen = !cx.rateOpen; if(cx.detail != null) renderVideoDetail(cx.detail); }

function cxRestart(i){
  const v = cx.videos && cx.videos[i];
  if(!v || !cxWatch(v.id)) return;
  try{ localStorage.removeItem(`cu_watch_${currentUser}_${v.id}`); }catch(_){}
  if(typeof showToast === 'function') showToast('Progress reset');
  cxRefreshOpen();
}
async function cxShare(i){
  const v = cx.videos && cx.videos[i];
  if(!v) return;
  const url = 'https://youtu.be/' + v.id;
  try{
    if(navigator.share) await navigator.share({ title: cxTitle(v), text: cxTitle(v), url });
    else { await navigator.clipboard.writeText(url); showToast('Link copied'); }
  }catch(_){}
}

/* segarkan semua tampilan video yang sedang terbuka */
function cxRefreshOpen(){
  if(typeof currentData !== 'undefined' && currentData) renderHomeContent(false);
  if(cx.detail != null && cx.videos && cx.videos[cx.detail] && document.getElementById('book-view').classList.contains('show')) renderVideoDetail(cx.detail);
  if(cx.libOpen) cxLibRender();
}

/* ---------- Overlay + tombol Kembali Android ---------- */
const ovStack = [];
let ovHistoryOk = true;
function ovOpen(id){
  const el = document.getElementById(id);
  el.classList.add('show');
  void el.offsetWidth;
  el.classList.add('active');
  ovStack.push(id);
  try{ history.pushState({ ov:id }, ''); }catch(_){ ovHistoryOk = false; }
}
function ovHide(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('active');
  setTimeout(() => { if(!el.classList.contains('active')) el.classList.remove('show'); }, 380);
  if(id === 'player-view') plCleanup();
  if(id === 'book-view') cx.detail = null;
  if(id === 'lib-view') cx.libOpen = false;
}
function ovClose(id){
  const i = ovStack.lastIndexOf(id);
  if(i === -1){ ovHide(id); return; }
  if(ovHistoryOk && i === ovStack.length - 1){ history.back(); return; }
  ovStack.splice(i, 1);
  ovHide(id);
}
window.addEventListener('popstate', () => {
  const top = ovStack.pop();
  if(top) ovHide(top);
});

/* ---------- Pemutar YouTube (hanya saat online) ---------- */
let pl = null;       // sesi pemutar yang sedang terbuka
let ytApiP = null;

function ytApi(){
  if(window.YT && window.YT.Player) return Promise.resolve();
  if(ytApiP) return ytApiP;
  ytApiP = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try{ if(prev) prev(); }catch(_){} res(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { ytApiP = null; s.remove(); rej(new Error('yt-api')); };
    document.head.appendChild(s);
    setTimeout(() => { if(!(window.YT && window.YT.Player)){ ytApiP = null; rej(new Error('yt-timeout')); } }, 10000);
  });
  return ytApiP;
}

const PL_ICON_OFF = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none"><path d="M2.5 9a15 15 0 0119 0M5.5 12.5a10.5 10.5 0 0113 0M8.7 16a5.5 5.5 0 016.6 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="19.5" r="1.3" fill="currentColor"/><path d="M3.5 3.5l17 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
function plStatus(kind, msg){
  const el = document.getElementById('pl-status');
  if(!el) return;
  if(pl) pl.mode = kind;
  if(!kind){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  if(kind === 'loading') el.innerHTML = '<div class="pl-spin"></div><div class="pl-stxt">Loading player…</div>';
  else if(kind === 'offline') el.innerHTML = `${PL_ICON_OFF}<div class="pl-err">You're offline<small>Connect to the internet to watch videos from YouTube.</small></div><button class="pl-btn" onclick="plStart()">Try again</button>`;
  else el.innerHTML = `<div class="pl-err">${escapeHtml(msg || "This video can't be played here")}<small>You can still watch it on YouTube.</small></div><div class="pl-btns"><button class="pl-btn" onclick="plStart()">Try again</button><button class="pl-btn alt" onclick="plOpenYT()">Open in YouTube</button></div>`;
}

function openVideo(i){
  const v = cx.videos && cx.videos[i];
  if(!v) return;
  if(pl) plCleanup();
  pl = { i, v, player:null, timer:0, mode:'', ended:false };
  document.getElementById('pl-title').textContent = cxTitle(v);
  document.getElementById('pl-sub').textContent = v.author || 'YouTube';
  document.getElementById('pl-info').innerHTML =
    `<h1>${escapeHtml(cxTitle(v))}</h1><p class="pl-by">${v.author ? escapeHtml(v.author) : 'YouTube'}${v.category ? ` <span class="bk-chip">${escapeHtml(v.category)}</span>` : ''}</p>` +
    (v.desc ? `<p class="pl-desc">${escapeHtml(v.desc)}</p>` : '') +
    `<button class="pl-btn alt" onclick="plOpenYT()">Open in YouTube</button>`;
  document.getElementById('pl-holder').innerHTML = '';
  ovOpen('player-view');
  plStart();
}

async function plStart(){
  const my = pl;
  if(!my) return;
  const holder = document.getElementById('pl-holder');
  holder.innerHTML = '';
  if(my.player){ try{ my.player.destroy(); }catch(_){} my.player = null; }
  clearInterval(my.timer);
  plStatus('loading');
  if(!navigator.onLine){ plStatus('offline'); return; }
  try{ await ytApi(); }
  catch(_){
    if(pl !== my) return;
    if(!navigator.onLine){ plStatus('offline'); return; }
    plFallback(my); // API diblokir/lambat -> pemutar biasa (tanpa catatan progres)
    return;
  }
  if(pl !== my) return;
  const info = cxWatch(my.v.id);
  const start = info && !cxDone(info) ? Math.floor(info.t) : 0;
  holder.innerHTML = '<div id="pl-yt"></div>';
  try{
    my.player = new YT.Player('pl-yt', {
      videoId: my.v.id,
      host: 'https://www.youtube-nocookie.com',
      playerVars: { autoplay:1, playsinline:1, rel:0, modestbranding:1, start, origin: location.origin },
      events: {
        onReady: () => { if(pl === my) plStatus(''); },
        onStateChange: (e) => plState(my, e.data),
        onError: (e) => {
          if(pl !== my) return;
          const c = e && e.data;
          plStatus('error', (c === 101 || c === 150 || c === 153) ? "The owner doesn't allow this video to play in other apps" : (c === 100 ? 'This video is unavailable' : "This video can't be played"));
        }
      }
    });
  }catch(_){ plFallback(my); }
}

function plFallback(my){
  if(pl !== my) return;
  const src = `https://www.youtube-nocookie.com/embed/${my.v.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
  document.getElementById('pl-holder').innerHTML = `<iframe src="${src}" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  plStatus('');
}

function plState(my, st){
  if(pl !== my) return;
  plStatus('');
  if(st === 1){            // sedang diputar -> simpan progres tiap 4 detik
    clearInterval(my.timer);
    my.timer = setInterval(() => plSave(my), 4000);
  } else {
    clearInterval(my.timer);
    if(st === 0){ my.ended = true; }
    plSave(my);
  }
}
function plSave(my){
  if(!my || !my.player || !my.player.getCurrentTime) return;
  try{
    const d = my.player.getDuration(), t = my.ended ? d : my.player.getCurrentTime();
    if(!(d > 0) || !(t >= 3)) return;
    localStorage.setItem(`cu_watch_${currentUser}_${my.v.id}`, JSON.stringify({ t: Math.floor(t), d: Math.floor(d), done: my.ended || t >= d - 8 }));
  }catch(_){}
}
function plOpenYT(){
  if(!pl) return;
  const t = pl.player && pl.player.getCurrentTime ? Math.floor(pl.player.getCurrentTime() || 0) : 0;
  window.open(`https://www.youtube.com/watch?v=${pl.v.id}${t > 3 ? '&t=' + t + 's' : ''}`, '_blank', 'noopener');
}
function plCleanup(){
  const my = pl;
  if(!my) return;
  plSave(my);
  clearInterval(my.timer);
  try{ if(my.player) my.player.destroy(); }catch(_){}
  pl = null;
  setTimeout(() => { if(!pl){ const h = document.getElementById('pl-holder'); if(h) h.innerHTML = ''; } }, 420);
  cxRefreshOpen(); // perbarui progres di Beranda, detail, dan library
}

// koneksi kembali -> pemutar yang sedang menunggu internet langsung dimuat
window.addEventListener('online', () => { if(pl && pl.mode === 'offline') plStart(); });
// aplikasi disembunyikan / tab ditutup -> simpan progres terakhir
document.addEventListener('visibilitychange', () => { if(document.hidden && pl) plSave(pl); });

if(typeof currentUser !== 'undefined' && currentUser) loadHomeContent();
