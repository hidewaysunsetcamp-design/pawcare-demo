/* PAWCARE core（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

const D = window.PAWCARE_DATA;
const APP_VERSION = '1.11.0';
const STORAGE_KEY = 'pawcare.v1';

/* ============================================================
 * ユーティリティ
 * ============================================================ */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function pad(n) { return String(n).padStart(2, '0'); }
/* 'YYYY-MM-DDTHH:mm'（端末のローカル時刻）で保存する */
function toLocalInput(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function nowLocal() { return toLocalInput(new Date()); }
function todayStr() { return nowLocal().slice(0, 10); }
function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
}
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDateHeading(dateStr) {
  const d = parseLocal(dateStr);
  if (!d) return dateStr;
  let label = (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEK[d.getDay()] + '）';
  if (dateStr === todayStr()) label = '今日 ' + label;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (dateStr === toLocalInput(y).slice(0, 10)) label = '昨日 ' + label;
  if (d.getFullYear() !== new Date().getFullYear()) label = d.getFullYear() + '年' + label;
  return label;
}
function fmtDateTime(s) {
  const d = parseLocal(s);
  if (!d) return s || '';
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmtShort(s) {
  const d = parseLocal(s);
  if (!d) return s || '';
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function ageText(birthday) {
  const b = parseLocal(birthday);
  if (!b) return '';
  const n = new Date();
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) months -= 1;
  if (months < 0) return '';
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return m + 'か月';
  return y + '歳' + (m ? m + 'か月' : '');
}
function speciesOf(id) { return D.SPECIES.find((s) => s.id === id) || D.SPECIES[D.SPECIES.length - 1]; }
function categoryOf(id) { return D.CATEGORIES.find((c) => c.id === id) || D.CATEGORIES[D.CATEGORIES.length - 1]; }
function sexLabel(id) { const s = D.SEXES.find((x) => x.id === id); return s ? s.label : ''; }
function optionsHtml(list, selected, placeholder) {
  let html = placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '';
  list.forEach((item) => {
    const value = typeof item === 'string' ? item : item.id;
    const label = typeof item === 'string' ? item : item.label;
    html += '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  });
  return html;
}

/* ============================================================
 * データ保存（localStorage）
 * ============================================================ */
function emptyDb() {
  return {
    version: 1,
    pets: [],
    logs: [],
    memos: [],
    reminders: [],
    foods: [],
    visits: [],
    care: [],
    settings: { activePetId: null, hospital: { name: '', phone: '', note: '' }, night: { name: '', phone: '', note: '' }, owner: { name: '', phone: '' }, backupContact: { name: '', relation: '', phone: '' }, lastBackupAt: null }
  };
}
let db = emptyDb();
let storageOk = true;

function normalizeDb(raw) {
  const base = emptyDb();
  if (!raw || typeof raw !== 'object') return base;
  base.pets = Array.isArray(raw.pets) ? raw.pets.filter((p) => p && p.id && p.name) : [];
  const petIds = new Set(base.pets.map((p) => p.id));
  base.logs = Array.isArray(raw.logs) ? raw.logs.filter((l) => l && l.id && petIds.has(l.petId) && l.datetime) : [];
  base.memos = Array.isArray(raw.memos) ? raw.memos.filter((m) => m && m.id && m.text) : [];
  base.foods = Array.isArray(raw.foods) ? raw.foods.filter((f) => f && f.id && petIds.has(f.petId) && f.name) : [];
  base.reminders = Array.isArray(raw.reminders) ? raw.reminders.filter((r) => r && r.id && petIds.has(r.petId) && r.dueAt) : [];
  const s = raw.settings || {};
  base.settings.activePetId = petIds.has(s.activePetId) ? s.activePetId : (base.pets[0] ? base.pets[0].id : null);
  base.settings.hospital = Object.assign(base.settings.hospital, s.hospital || {});
  base.settings.night = Object.assign(base.settings.night, s.night || {});
  base.settings.owner = Object.assign(base.settings.owner, s.owner || {});
  base.settings.backupContact = Object.assign(base.settings.backupContact, s.backupContact || {});
  if (raw.game && Array.isArray(raw.game.medals)) base.game = { medals: raw.game.medals.filter((x) => typeof x === 'string').slice(0, 50), lv: Math.max(1, +raw.game.lv || 1) };
  base.care = Array.isArray(raw.care) ? raw.care.filter((c) => c && c.id && petIds.has(c.petId) && c.date) : [];
  base.visits = Array.isArray(raw.visits) ? raw.visits.filter((v) => v && v.id && petIds.has(v.petId) && v.date) : [];
  base.settings.lastBackupAt = s.lastBackupAt || null;
  return base;
}

function loadDb() {
  try {
    const testKey = STORAGE_KEY + '.test';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
  } catch (e) {
    storageOk = false;
    showBanner('この端末・ブラウザの設定ではデータを保存できません（プライベートブラウズ等）。入力内容はページを閉じると消えます。', 'error');
    return;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    db = normalizeDb(JSON.parse(raw));
  } catch (e) {
    /* 壊れたデータは消さずに退避しておく */
    try { localStorage.setItem(STORAGE_KEY + '.corrupt.' + Date.now(), raw); } catch (e2) { /* 容量不足時は退避できない */ }
    db = emptyDb();
    showBanner('保存データを読み込めませんでした。元のデータは端末内に退避しました。バックアップから復元できます。', 'error');
  }
}

function persist() {
  if (!storageOk) return true; /* 保存不可モード：メモリ上のみで動作 */
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
    showBanner(quota
      ? '端末の保存容量が不足しているため保存できませんでした。不要な記録を削除するか、バックアップを書き出してください。'
      : '保存中にエラーが発生しました（' + esc(e && e.message) + '）。', 'error');
    return false;
  }
}

/* 変更をまとめて実行し、保存に失敗したら元に戻す */
function commit(mutator) {
  const before = JSON.stringify(db);
  mutator();
  if (!persist()) {
    db = JSON.parse(before);
    toast('保存できませんでした');
    return false;
  }
  return true;
}

function getPet(id) { return db.pets.find((p) => p.id === id) || null; }
function activePet() {
  let p = getPet(db.settings.activePetId);
  if (!p && db.pets.length) { p = db.pets[0]; db.settings.activePetId = p.id; }
  return p;
}
function logsSorted(list) {
  return list.slice().sort((a, b) => (a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : 0));
}

/* ============================================================
 * 画面共通部品
 * ============================================================ */
const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet');
const $sheetTitle = document.getElementById('sheetTitle');
const $sheetBody = document.getElementById('sheetBody');
const $toast = document.getElementById('toast');
const $banner = document.getElementById('storageBanner');

function showBanner(msg, type) {
  $banner.innerHTML = '<span>' + msg + '</span><button type="button" class="icon-btn" data-action="closeBanner" aria-label="閉じる">✕</button>';
  $banner.className = 'storage-banner ' + (type || '');
  $banner.hidden = false;
}

let toastTimer = null;
let toastActions = [];
function toast(msg, actions) {
  toastActions = actions || [];
  let html = '<span>' + esc(msg) + '</span>';
  toastActions.forEach((a, i) => { html += '<button type="button" data-toast-action="' + i + '">' + esc(a.label) + '</button>'; });
  $toast.innerHTML = html;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, toastActions.length ? 6000 : 2800);
}

function openSheet(title, html, onReady) {
  $sheetTitle.textContent = title;
  $sheetBody.innerHTML = html;
  $sheet.hidden = false;
  document.body.classList.add('no-scroll');
  if (onReady) onReady($sheetBody);
}
function closeSheet() {
  $sheet.hidden = true;
  $sheetBody.innerHTML = '';
  document.body.classList.remove('no-scroll');
}

function petChips(selectedId, action) {
  if (db.pets.length < 2) return '';
  return '<div class="chips scroll-x" role="tablist">' + db.pets.map((p) =>
    '<button type="button" class="chip' + (p.id === selectedId ? ' active' : '') + '" data-action="' + action + '" data-id="' + esc(p.id) + '">' +
    speciesOf(p.species).emoji + ' ' + esc(p.name) + '</button>').join('') + '</div>';
}

function logItemHtml(l, showPet) {
  const c = categoryOf(l.category);
  const pet = getPet(l.petId);
  let detail = '';
  if (l.category === 'weight' && l.value) detail += '<span class="log-value">' + esc(l.value) + ' kg</span>';
  if (l.ingest && ingestSummary(l)) detail += '<span class="log-memo">' + esc(ingestSummary(l)) + '</span>';
  if (l.memo) detail += '<span class="log-memo">' + esc(l.memo) + '</span>';
  return '<li><button type="button" class="log-item" data-action="editLog" data-id="' + esc(l.id) + '">' +
    '<span class="log-time">' + esc(l.datetime.slice(11, 16)) + '</span>' +
    '<span class="log-dot" style="--c:' + c.color + '" aria-hidden="true">' + c.emoji + '</span>' +
    '<span class="log-main"><span class="log-cat">' + esc(c.label) +
    (showPet && pet ? '<small class="log-pet">' + esc(pet.name) + '</small>' : '') + '</span>' + detail + '</span>' +
    '<span class="chev" aria-hidden="true">›</span></button></li>';
}

function groupedLogsHtml(logs, showPet) {
  if (!logs.length) return '<p class="empty">記録はまだありません。</p>';
  let html = '';
  let current = null;
  logsSorted(logs).forEach((l) => {
    const day = l.datetime.slice(0, 10);
    if (day !== current) {
      if (current !== null) html += '</ul>';
      html += '<h3 class="day-head">' + esc(fmtDateHeading(day)) + '</h3><ul class="log-list">';
      current = day;
    }
    html += logItemHtml(l, showPet);
  });
  return html + '</ul>';
}

function recentLogs(petId, hours) {
  const since = toLocalInput(new Date(Date.now() - hours * 3600 * 1000));
  return logsSorted(db.logs.filter((l) => l.petId === petId && l.datetime >= since));
}

const localNotice = '<p class="notice-small">🔒 データはこの端末のブラウザ内にのみ保存されます。他の端末とは自動で同期されません。定期的に「設定」からバックアップしてください。</p>';

/* ============================================================
 * ルーティング
 * ============================================================ */
const VIEWS = ['home', 'logs', 'interview', 'pets', 'emergency', 'settings', 'reminders', 'nutrition', 'card', 'visits', 'book', 'game', 'plans', 'guide', 'avatar'];
let currentView = 'home';
function go(view) {
  if (location.hash !== '#/' + view) location.hash = '#/' + view;
  else render();
}
function viewFromHash() {
  const v = (location.hash || '').replace(/^#\/?/, '');
  if (v.indexOf('view/') === 0) return 'view';
  if (v.indexOf('card/') === 0) return 'cardview';
  if (v.indexOf('import/') === 0) return 'import';
  return VIEWS.indexOf(v) >= 0 ? v : 'home';
}
function render() {
  /* デモ用リンク（#/demo）：まだデータがない端末ではサンプルデータを入れてホームを開く */
  if ((location.hash || '').replace(/^#\/?/, '') === 'demo') {
    history.replaceState(null, '', location.pathname + location.search + '#/home');
    if (!db.pets.length) { loadSample(); return; }
  }
  currentView = viewFromHash();
  document.querySelectorAll('.bottom-nav [data-nav]').forEach((b) => {
    const on = b.dataset.nav === currentView;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.body.dataset.view = currentView;
  const navView = ['reminders', 'nutrition', 'card', 'visits', 'import', 'book', 'game', 'plans', 'guide', 'avatar'].indexOf(currentView) >= 0 ? 'home' : currentView;
  document.querySelectorAll('.bottom-nav [data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === navView));
  const fn = { home: renderHome, logs: renderLogs, interview: renderInterview, pets: renderPets, emergency: renderEmergency, settings: renderSettings, reminders: renderReminders, nutrition: renderNutrition, view: renderSharedView, card: renderCard, cardview: renderCardView, visits: renderVisits, import: renderImport, book: renderBook, game: renderGame, plans: renderPlans, guide: renderGuide, avatar: renderAvatar }[currentView];
  $app.innerHTML = fn();
  window.scrollTo(0, 0);
  if (['view', 'cardview'].indexOf(currentView) < 0) checkGameNews();
}
function rerender() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}
