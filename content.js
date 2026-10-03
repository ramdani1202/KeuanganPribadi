/* =========================================================
   KONTEN BERANDA: Buku PDF
   Semua isi diunggah lewat GitHub (tanpa server):
     content/books.json  -> daftar buku PDF
   Cover & PDF disimpan di content/books/
   ========================================================= */
const CX_BOOKS_URL = 'content/books.json';
const CX_COVER_COLORS = [['#14B8A6','#0A6E64'],['#E9776A','#B23F33'],['#4F81E6','#2846AA'],['#F0AA3C','#C86E1E'],['#8E5CF0','#5032AA']];

let cx = { books:null, loadedAt:0, loading:false, failed:false, user:null, drawn:false };

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
function cxId(v, i, prefix){ const s = String(v == null ? '' : v); return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : prefix + i; }

function cxSanitizeBooks(list){
  if(!Array.isArray(list)) return [];
  const out = [];
  list.slice(0, 60).forEach((b, i) => {
    if(!b || typeof b !== 'object') return;
    const title = cxStr(b.title, 120).trim();
    const file = cxSafeUrl(b.file);
    if(!title || !file || !/\.pdf$/i.test(file.split('?')[0])) return;
    out.push({ id: cxId(b.id, i, 'b'), title, author: cxStr(b.author, 80).trim(), cover: cxSafeUrl(b.cover), file, desc: cxStr(b.desc, 300).trim() });
  });
  return out;
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
    if(cx.user !== currentUser) renderHomeContent(false); // ganti akun -> bar progres baca ikut berganti
    return;
  }
  cx.loading = true;
  if(!cx.loadedAt) renderHomeContent(true);
  try{
    const j = await cxFetchJSON(CX_BOOKS_URL);
    cx.books = cxSanitizeBooks(j && j.books);
    cx.failed = false;
  }catch(_){
    cx.failed = !cx.books;
  }
  cx.loadedAt = Date.now();
  cx.loading = false;
  renderHomeContent(false);
}

/* ---------- Tampilan Beranda ---------- */
const CX_CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function cxReadInfo(id){
  try{
    const v = JSON.parse(localStorage.getItem(`cu_read_${currentUser}_${id}`) || 'null');
    if(v && v.p > 0 && v.n > 0) return v;
  }catch(_){}
  return null;
}

function cxBookCard(b, i){
  const [c1, c2] = CX_COVER_COLORS[i % CX_COVER_COLORS.length];
  const info = cxReadInfo(b.id);
  const pct = info ? Math.min(100, Math.round(info.p / info.n * 100)) : 0;
  const cover = b.cover
    ? `<img src="${escapeHtml(cxHref(b.cover))}" alt="" loading="lazy" onerror="this.remove()">`
    : '';
  return `<div class="cx-book" style="animation-delay:${i*60}ms" onclick="openBook(${i})">
    <div class="cx-cover" style="background:linear-gradient(145deg,${c1},${c2})">
      <span class="cx-cover-t">${escapeHtml(b.title)}</span>${cover}
      <span class="cx-pdf-tag">PDF</span>
    </div>
    <div class="cx-btitle">${escapeHtml(b.title)}</div>
    <div class="cx-bauthor">${b.author ? escapeHtml(b.author) : '&nbsp;'}</div>
    ${info ? `<div class="cx-prog"><i style="width:${pct}%"></i></div><div class="cx-prog-t">Hal. ${info.p} dari ${info.n}</div>` : ''}
  </div>`;
}

function renderHomeContent(loadingOnly){
  const booksEl = document.getElementById('cx-books');
  if(!booksEl) return;
  cx.user = (typeof currentUser !== 'undefined') ? currentUser : null;

  // simpan posisi geser baris supaya tidak melompat ke awal saat digambar ulang
  const keep = Array.from(document.querySelectorAll('#cx-books .cx-row')).map(r => r.scrollLeft);
  const restore = () => document.querySelectorAll('#cx-books .cx-row').forEach((r, i) => { if(keep[i]) r.scrollLeft = keep[i]; });
  booksEl.classList.toggle('cx-noanim', cx.drawn);

  if(loadingOnly){
    const sk = '<div class="cx-skel"></div>';
    booksEl.innerHTML = `<div class="cx-head"><small>&nbsp;</small><h2>Buku PDF</h2></div><div class="cx-row">${sk}${sk}</div>`;
    return;
  }

  if(cx.failed){
    booksEl.innerHTML = `<div class="cx-note">Buku belum bisa dimuat. Periksa koneksi internet, lalu <button onclick="loadHomeContent(true)">coba lagi</button>.</div>`;
    cx.drawn = true;
    return;
  }

  if(cx.books && cx.books.length){
    booksEl.innerHTML = `<div class="cx-head row"><div><small>${cx.books.length} buku · baca langsung</small><h2>Buku PDF</h2></div><span class="cx-swipe">Geser ${CX_CHEV}</span></div>
      <div class="cx-row books">${cx.books.map((b, i) => cxBookCard(b, i)).join('')}</div>`;
  } else {
    booksEl.innerHTML = '';
  }
  cx.drawn = true;
  restore();
}

/* ---------- Overlay (pembaca) + tombol Kembali Android ---------- */
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
  if(id === 'reader-view') readerCleanup();
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

/* ---------- Pembaca PDF (pdf.js, disertakan di folder lib/) ---------- */
let pdfjs = null;
let rd = null;
const RD_ZOOMS = [1, 1.5, 2, 3, 4];
const RD_MIN = 1, RD_MAX = 4;

async function getPdfJs(){
  if(pdfjs) return pdfjs;
  const mod = await import('./lib/pdf.min.mjs');
  mod.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', document.baseURI).href;
  pdfjs = mod;
  return mod;
}

async function cxFetchBytes(url, onProgress){
  const resp = await fetch(cxHref(url));
  if(!resp.ok) throw new Error('HTTP ' + resp.status);
  const total = Number(resp.headers.get('Content-Length')) || 0;
  if(!resp.body || !resp.body.getReader) return new Uint8Array(await resp.arrayBuffer());
  const reader = resp.body.getReader();
  const chunks = []; let got = 0;
  for(;;){
    const { done, value } = await reader.read();
    if(done) break;
    chunks.push(value); got += value.length;
    onProgress(total ? Math.min(1, got / total) : null, got);
  }
  const out = new Uint8Array(got); let off = 0;
  for(const c of chunks){ out.set(c, off); off += c.length; }
  return out;
}

function rdSetStatus(html){
  document.getElementById('rd-status').innerHTML = html || '';
  document.getElementById('rd-status').style.display = html ? 'flex' : 'none';
}

function openBook(i){
  const b = cx.books && cx.books[i];
  if(!b) return;
  rd = { book:b, idx:i, doc:null, n:0, zoom:1, ratio:1.414, rendered:new Map(), io:null, cur:1, saveT:null, token:Symbol(), pendingPage:1 };
  document.getElementById('rd-title').textContent = b.title;
  document.getElementById('rd-sub').textContent = b.author || 'Memuat…';
  document.getElementById('rd-pages').innerHTML = '';
  document.getElementById('rd-bar').style.width = '0%';
  document.getElementById('rd-zoom-label').textContent = '100%';
  document.getElementById('rd-pill').classList.remove('show');
  ovOpen('reader-view');
  rdLoad();
}

async function rdLoad(){
  const my = rd; if(!my) return;
  rdSetStatus('<div class="rd-spin"></div><div class="rd-stxt" id="rd-stxt">Memuat buku…</div>');
  try{
    const [lib, bytes] = await Promise.all([
      getPdfJs(),
      cxFetchBytes(my.book.file, (p, got) => {
        const t = document.getElementById('rd-stxt');
        if(t && rd === my) t.textContent = p != null ? `Memuat buku… ${Math.round(p*100)}%` : `Memuat buku… ${(got/1048576).toFixed(1)} MB`;
      })
    ]);
    if(rd !== my) return;
    const task = lib.getDocument({
      data: bytes, isEvalSupported: false,
      wasmUrl: new URL('lib/wasm/', document.baseURI).href
    });
    my.doc = await task.promise;
    if(rd !== my){ my.doc.destroy(); return; }
    my.n = my.doc.numPages;
    const first = await my.doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    my.ratio = vp.height / vp.width;
    const saved = cxReadInfo(my.book.id);
    my.pendingPage = saved ? Math.min(saved.p, my.n) : 1;
    rdBuild();
    rdSetStatus('');
  }catch(e){
    if(rd !== my) return;
    console.error(e);
    rdSetStatus(`<div class="rd-err">Buku tidak bisa dibuka.<br><small>Periksa koneksi internet atau nama file PDF-nya.</small></div><button class="rd-retry" onclick="rdLoad()">Coba lagi</button>`);
  }
}

function rdPageWidth(){
  const sc = document.getElementById('rd-scroll');
  return Math.max(200, Math.floor((sc.clientWidth - 24) * rd.zoom));
}

function rdBuild(){
  const wrap = document.getElementById('rd-pages');
  const w = rdPageWidth();
  let html = '';
  for(let p = 1; p <= rd.n; p++) html += `<div class="rd-page" data-p="${p}" style="width:${w}px;height:${Math.round(w*rd.ratio)}px"><span class="rd-pn">${p}</span></div>`;
  wrap.innerHTML = html;
  document.getElementById('rd-sub').textContent = `Hal. ${rd.pendingPage} dari ${rd.n}`;

  const sc = document.getElementById('rd-scroll');
  if(rd.io) rd.io.disconnect();
  rd.io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      const p = Number(en.target.dataset.p);
      if(en.isIntersecting) rdRenderPage(p);
      else rdUnrenderPage(p);
    });
  }, { root: sc, rootMargin: '700px 0px' });
  wrap.querySelectorAll('.rd-page').forEach(el => rd.io.observe(el));

  const target = wrap.querySelector(`.rd-page[data-p="${rd.pendingPage}"]`);
  if(target) sc.scrollTop = target.offsetTop - 12;
  document.getElementById('rd-pill').classList.add('show');
  rdOnScroll();
}

async function rdRenderPage(p){
  const my = rd; if(!my || !my.doc) return;
  if(my.rendered.has(p)) return;
  const slot = { canvas:null, task:null, zoom:my.zoom };
  my.rendered.set(p, slot);
  try{
    const page = await my.doc.getPage(p);
    if(rd !== my || my.rendered.get(p) !== slot) return;
    const el = document.querySelector(`#rd-pages .rd-page[data-p="${p}"]`);
    if(!el) return;
    const cssW = rdPageWidth();
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let scale = (cssW / base.width) * dpr;
    const maxPx = 12e6;
    if(base.width * base.height * scale * scale > maxPx) scale = Math.sqrt(maxPx / (base.width * base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    canvas.style.width = cssW + 'px';
    canvas.style.height = Math.round(cssW * base.height / base.width) + 'px';
    slot.canvas = canvas;
    slot.task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    await slot.task.promise;
    if(rd !== my || my.rendered.get(p) !== slot) return;
    el.style.height = canvas.style.height;
    el.appendChild(canvas);
    requestAnimationFrame(() => canvas.classList.add('in'));
  }catch(e){
    if(e && e.name === 'RenderingCancelledException') return;
    if(my.rendered.get(p) === slot) my.rendered.delete(p);
  }
}

function rdUnrenderPage(p){
  if(!rd) return;
  const slot = rd.rendered.get(p);
  if(!slot) return;
  try{ if(slot.task) slot.task.cancel(); }catch(_){}
  if(slot.canvas){ slot.canvas.width = 0; slot.canvas.remove(); }
  rd.rendered.delete(p);
}

let rdScrollRaf = 0;
function rdOnScroll(){
  if(!rd || !rd.n) return;
  if(rdScrollRaf) return;
  rdScrollRaf = requestAnimationFrame(() => {
    rdScrollRaf = 0;
    if(!rd || !rd.n) return;
    const sc = document.getElementById('rd-scroll');
    const line = sc.scrollTop + sc.clientHeight * 0.35;
    const pages = document.querySelectorAll('#rd-pages .rd-page');
    let cur = 1;
    for(let i = 0; i < pages.length; i++){
      if(pages[i].offsetTop <= line) cur = i + 1; else break;
    }
    rd.cur = cur;
    document.getElementById('rd-sub').textContent = `Hal. ${cur} dari ${rd.n}`;
    document.getElementById('rd-pill-t').textContent = `${cur} / ${rd.n}`;
    const max = sc.scrollHeight - sc.clientHeight;
    document.getElementById('rd-bar').style.width = (max > 0 ? Math.min(100, sc.scrollTop / max * 100) : 0) + '%';
    clearTimeout(rd.saveT);
    const snap = rd;
    rd.saveT = setTimeout(() => rdSaveProgress(snap), 500);
  });
}

function rdSaveProgress(r){
  r = r || rd;
  if(!r || !r.n || !r.book) return;
  try{ localStorage.setItem(`cu_read_${currentUser}_${r.book.id}`, JSON.stringify({ p:r.cur, n:r.n })); }catch(_){}
}

function rdRenderVisible(){
  if(!rd || !rd.n) return;
  const sc = document.getElementById('rd-scroll');
  const top = sc.scrollTop - 700, bot = sc.scrollTop + sc.clientHeight + 700;
  document.querySelectorAll('#rd-pages .rd-page').forEach(el => {
    const t = el.offsetTop, b = t + el.offsetHeight;
    if(b >= top && t <= bot) rdRenderPage(Number(el.dataset.p));
  });
}

/* Ubah zoom (kontinu 100%-400%) dengan titik fokus (cx,cy) = posisi di layar
   yang harus tetap berada di bawah jari / tengah layar. */
function rdSetZoom(newZ, cx, cy, force){
  if(!rd || !rd.n) return;
  newZ = Math.max(RD_MIN, Math.min(RD_MAX, newZ));
  const label = document.getElementById('rd-zoom-label');
  if(!force && Math.abs(newZ - rd.zoom) < 0.01){ label.textContent = Math.round(rd.zoom * 100) + '%'; return; }
  const sc = document.getElementById('rd-scroll');
  const pages = Array.from(document.querySelectorAll('#rd-pages .rd-page'));
  if(!pages.length) return;
  if(cx == null) cx = sc.clientWidth / 2;
  if(cy == null) cy = sc.clientHeight / 2;

  // titik fokus dicatat relatif terhadap halaman di bawahnya (tahan terhadap jarak antar halaman)
  const y = sc.scrollTop + cy;
  let ap = pages[0];
  for(const p of pages){ if(p.offsetTop <= y) ap = p; else break; }
  const fy = (y - ap.offsetTop) / Math.max(1, ap.offsetHeight);
  const fx = (sc.scrollLeft + cx - ap.offsetLeft) / Math.max(1, ap.offsetWidth);

  rd.zoom = newZ;
  label.textContent = Math.round(newZ * 100) + '%';
  Array.from(rd.rendered.keys()).forEach(rdUnrenderPage);
  const w = rdPageWidth(), h = Math.round(w * rd.ratio);
  pages.forEach(el => { el.style.width = w + 'px'; el.style.height = h + 'px'; });

  sc.scrollTop = ap.offsetTop + fy * ap.offsetHeight - cy;
  sc.scrollLeft = ap.offsetLeft + fx * ap.offsetWidth - cx;
  rdRenderVisible();
  rdOnScroll();
}

function rdZoom(dir){
  if(!rd || !rd.n) return;
  const cur = rd.zoom;
  const next = dir > 0
    ? (RD_ZOOMS.find(z => z > cur + 0.02) || RD_MAX)
    : ([...RD_ZOOMS].reverse().find(z => z < cur - 0.02) || RD_MIN);
  rdSetZoom(next);
}
function rdZoomReset(){ rdSetZoom(1); }

function rdScrollToPage(p){
  if(!rd || !rd.n) return;
  p = Math.max(1, Math.min(rd.n, p));
  const el = document.querySelector(`#rd-pages .rd-page[data-p="${p}"]`);
  if(el) document.getElementById('rd-scroll').scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
}
function rdPage(dir){ if(rd) rdScrollToPage(rd.cur + dir); }
function rdAskPage(){
  if(!rd || !rd.n) return;
  const v = parseInt(prompt(`Ke halaman berapa? (1-${rd.n})`, String(rd.cur)), 10);
  if(v) rdScrollToPage(v);
}

function readerCleanup(){
  const r = rd;
  if(!r) return;
  rdSaveProgress(r);
  const pill = document.getElementById('rd-pill'); if(pill) pill.classList.remove('show');
  clearTimeout(r.saveT);
  if(r.io) r.io.disconnect();
  Array.from(r.rendered.keys()).forEach(p => { const s = r.rendered.get(p); try{ if(s.task) s.task.cancel(); }catch(_){} if(s.canvas){ s.canvas.width = 0; } });
  r.rendered.clear();
  try{ if(r.doc) r.doc.destroy(); }catch(_){}
  rd = null;
  setTimeout(() => { if(!rd){ document.getElementById('rd-pages').innerHTML = ''; } }, 420);
  if(typeof currentData !== 'undefined' && currentData) renderHomeContent(false); // perbarui bar progres di kartu buku
}

(function(){
  const sc = document.getElementById('rd-scroll');
  if(!sc) return;
  sc.addEventListener('scroll', rdOnScroll, { passive:true });

  /* ---- Gestur: cubit untuk zoom, ketuk 2x untuk zoom cepat, geser ke segala arah ---- */
  const pagesEl = () => document.getElementById('rd-pages');
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let pinch = null, tapStart = null, lastTap = { t:0, x:0, y:0 };

  sc.addEventListener('touchstart', (e) => {
    if(!rd || !rd.n) return;
    if(e.touches.length === 2){
      const r = sc.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      pinch = { d0: dist(e.touches), z0: rd.zoom, cx, cy, k: 1 };
      const pg = pagesEl();
      pg.style.transformOrigin = `${sc.scrollLeft + cx}px ${sc.scrollTop + cy}px`;
      pg.style.willChange = 'transform';
      tapStart = null;
    } else if(e.touches.length === 1){
      tapStart = { x:e.touches[0].clientX, y:e.touches[0].clientY, t:Date.now() };
    } else { tapStart = null; }
  }, { passive:true });

  sc.addEventListener('touchmove', (e) => {
    if(!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const k = Math.max(RD_MIN / pinch.z0, Math.min(RD_MAX / pinch.z0, dist(e.touches) / pinch.d0));
    pinch.k = k;
    pagesEl().style.transform = `scale(${k})`;
  }, { passive:false });

  const endPinch = (e) => {
    if(!pinch || e.touches.length >= 2) return;
    const p = pinch; pinch = null;
    const pg = pagesEl();
    pg.style.transform = ''; pg.style.transformOrigin = ''; pg.style.willChange = '';
    rdSetZoom(p.z0 * p.k, p.cx, p.cy);
  };
  sc.addEventListener('touchend', (e) => {
    if(pinch){ endPinch(e); return; }
    if(!rd || !rd.n || e.touches.length || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0], now = Date.now();
    if(!tapStart || Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > 12 || now - tapStart.t > 300){ lastTap.t = 0; return; }
    if(now - lastTap.t < 320 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 40){
      lastTap.t = 0;
      const r = sc.getBoundingClientRect();
      rdSetZoom(rd.zoom > 1.2 ? 1 : 2.5, t.clientX - r.left, t.clientY - r.top);
    } else {
      lastTap = { t:now, x:t.clientX, y:t.clientY };
    }
  }, { passive:true });
  sc.addEventListener('touchcancel', endPinch, { passive:true });

  // putar layar / ubah ukuran -> susun ulang lebar halaman
  let rzT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => { if(rd && rd.n) rdSetZoom(rd.zoom, null, null, true); }, 200);
  });
})();
if(typeof currentUser !== 'undefined' && currentUser) loadHomeContent();
