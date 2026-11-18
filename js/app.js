/* PAWCARE アプリ本体（依存ライブラリなし・静的ホスティング用） */
'use strict';

(function () {
  const D = window.PAWCARE_DATA;
  const APP_VERSION = '1.5.0';
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
  const VIEWS = ['home', 'logs', 'interview', 'pets', 'emergency', 'settings', 'reminders', 'nutrition', 'card', 'visits'];
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
    currentView = viewFromHash();
    document.querySelectorAll('.bottom-nav [data-nav]').forEach((b) => {
      const on = b.dataset.nav === currentView;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.body.dataset.view = currentView;
    const navView = ['reminders', 'nutrition', 'card', 'visits', 'import'].indexOf(currentView) >= 0 ? 'home' : currentView;
    document.querySelectorAll('.bottom-nav [data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === navView));
    const fn = { home: renderHome, logs: renderLogs, interview: renderInterview, pets: renderPets, emergency: renderEmergency, settings: renderSettings, reminders: renderReminders, nutrition: renderNutrition, view: renderSharedView, card: renderCard, cardview: renderCardView, visits: renderVisits, import: renderImport }[currentView];
    $app.innerHTML = fn();
    window.scrollTo(0, 0);
  }
  function rerender() {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  /* ============================================================
   * ホーム
   * ============================================================ */
  function renderHome() {
    const pet = activePet();
    let html = '';
    html += '<button type="button" class="emergency-card" data-nav="emergency">' +
      '<span class="em-ico" aria-hidden="true">🚨</span><span><strong>緊急時の案内</strong><small>呼吸が苦しい・けいれん・大量出血などはすぐ病院へ</small></span><span class="chev" aria-hidden="true">›</span></button>';

    if (!pet) {
      html += '<section class="card welcome"><h1>PAWCAREへようこそ</h1>' +
        '<p>毎日の健康記録をつけておくと、体調が悪いときに動物病院へ正確に伝えられます。まずはペットを登録しましょう。</p>' +
        '<button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button>' +
        '<button type="button" class="btn ghost block" data-action="loadSample">サンプルデータで試してみる</button></section>';
      return html + localNotice;
    }

    html += petChips(pet.id, 'selectPet');
    const sp = speciesOf(pet.species);
    html += '<section class="card pet-hero"><span class="pet-avatar" aria-hidden="true">' + sp.emoji + '</span><div><h1>' + esc(pet.name) + '</h1><p class="muted">' +
      esc([pet.breed || sp.label, ageText(pet.birthday), pet.weight ? pet.weight + 'kg' : ''].filter(Boolean).join('・')) + '</p></div><button type="button" class="btn ghost small hero-card-btn" data-nav="card">🪪 もしもカード</button></section>';

    html += preparednessHtml(pet);
    html += '<section class="card"><h2>ワンタップで記録</h2><p class="muted small">押すと今の時刻で記録されます。時刻やメモはあとから修正できます。</p><div class="quick-grid">';
    (D.QUICK[pet.species] || D.QUICK.other).map(categoryOf).forEach((c) => {
      html += '<button type="button" class="quick-btn" data-action="quick" data-cat="' + c.id + '" style="--c:' + c.color + '"><span aria-hidden="true">' + c.emoji + '</span>' + esc(c.label) + '<small class="qs">' + esc(quickStatText(pet.id, c.id)) + '</small></button>';
    });
    html += '</div><button type="button" class="btn ghost block" data-action="newLog">日時・メモを入力して記録</button></section>';

    html += homeRemindersHtml(pet);

    const today = db.logs.filter((l) => l.petId === pet.id && l.datetime.slice(0, 10) === todayStr());
    html += '<section class="card"><div class="row-between"><h2>今日の記録</h2><span><button type="button" class="link" data-action="handoff">👪 引き継ぐ</button>　<button type="button" class="link" data-nav="logs">すべて見る</button></span></div>';
    html += today.length ? '<ul class="log-list">' + logsSorted(today).map((l) => logItemHtml(l, false)).join('') + '</ul>' : '<p class="empty">今日の記録はまだありません。</p>';
    html += '</section>';

    html += '<button type="button" class="card action-card" data-nav="nutrition"><span aria-hidden="true">🍚</span><span><strong>ごはんチェック</strong><small>カロリーの目安・おやつの割合・危険な食材を確認</small></span><span class="chev" aria-hidden="true">›</span></button>';
    html += '<button type="button" class="card action-card" data-nav="interview"><span aria-hidden="true">🩺</span><span><strong>体調が気になるとき</strong><small>症状を順番に入力して、獣医師に伝える問診メモを作成</small></span><span class="chev" aria-hidden="true">›</span></button>';
    html += '<button type="button" class="card action-card" data-nav="visits"><span aria-hidden="true">🏥</span><span><strong>受診の記録</strong><small>先生に言われたこと・処方・次回の予定を残す</small></span><span class="chev" aria-hidden="true">›</span></button>';
    return html + localNotice;
  }

  /* もしもの準備：元気なうちに済ませておくと、いざという時に迷わない */
  function preparednessHtml(pet) {
    const backupFresh = db.settings.lastBackupAt && (Date.now() - new Date(db.settings.lastBackupAt).getTime()) < 30 * 86400000;
    const items = [
      { done: !!db.settings.hospital.phone, label: 'かかりつけ病院の電話番号', btn: '<button type="button" class="btn ghost small" data-action="editHospital">登録</button>' },
      { done: !!db.settings.night.phone, label: '夜間・救急の病院の電話番号', btn: '<button type="button" class="btn ghost small" data-action="editHospital" data-kind="night">登録</button>' },
      { done: !!pet.weight, label: pet.name + 'の体重（薬の量や電話で必ず聞かれます）', btn: '<button type="button" class="btn ghost small" data-action="editPet" data-id="' + esc(pet.id) + '">登録</button>' },
      { done: cardDone(pet), label: 'もしもカード（持病・アレルギー・薬を「内容」か「なし」で）', btn: '<button type="button" class="btn ghost small" data-nav="card">入力</button>' },
      { done: !!backupFresh, label: 'データのバックアップ（30日以内）', btn: '<button type="button" class="btn ghost small" data-action="exportJson">保存</button>' }
    ];
    const n = items.filter((i) => i.done).length;
    if (n === items.length) return '';
    return '<section class="card prep"><div class="row-between"><h2>🧰 もしもの準備</h2><span class="tag">' + n + ' / ' + items.length + '</span></div>' +
      '<p class="muted small">元気なうちに済ませておくと、いざという時に迷わずに済みます。</p><ul class="prep-list">' +
      items.map((i) => '<li class="' + (i.done ? 'done' : '') + '"><span aria-hidden="true">' + (i.done ? '✅' : '⬜') + '</span><span class="prep-label">' + esc(i.label) + '</span>' + (i.done ? '' : i.btn) + '</li>').join('') + '</ul></section>';
  }

  /* ============================================================
   * 健康記録
   * ============================================================ */
  const logFilter = { petId: 'all', date: '', category: 'all' };
  function filteredLogs() {
    return db.logs.filter((l) =>
      (logFilter.petId === 'all' || l.petId === logFilter.petId) &&
      (!logFilter.date || l.datetime.slice(0, 10) === logFilter.date) &&
      (logFilter.category === 'all' || l.category === logFilter.category));
  }
  function renderLogs() {
    if (!db.pets.length) {
      return '<h1 class="page-title">健康記録</h1><section class="card"><p>記録をつけるには、まずペットを登録してください。</p><button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button></section>';
    }
    if (logFilter.petId !== 'all' && !getPet(logFilter.petId)) logFilter.petId = 'all';
    const list = filteredLogs();
    let html = '<div class="row-between"><h1 class="page-title">健康記録</h1><button type="button" class="btn primary small" data-action="newLog">＋ 記録</button></div>';
    html += '<section class="card filters"><div class="filter-grid">' +
      '<label>ペット<select data-filter="petId"><option value="all">すべて</option>' + optionsHtml(db.pets.map((p) => ({ id: p.id, label: p.name })), logFilter.petId) + '</select></label>' +
      '<label>カテゴリ<select data-filter="category"><option value="all">すべて</option>' + optionsHtml(D.CATEGORIES, logFilter.category) + '</select></label>' +
      '<label class="span2">日付<input type="date" data-filter="date" value="' + esc(logFilter.date) + '"></label>' +
      '</div>';
    if (logFilter.petId !== 'all' || logFilter.date || logFilter.category !== 'all') {
      html += '<button type="button" class="link" data-action="clearFilter">絞り込みを解除</button>';
    }
    html += '<p class="muted small">' + list.length + '件</p></section>';
    html += groupedLogsHtml(list, logFilter.petId === 'all' && db.pets.length > 1);
    if (list.length) {
      html += '<button type="button" class="btn ghost block" data-action="exportCsv">表示中の記録をCSVで書き出す</button>';
    }
    return html;
  }

  function logFormHtml(log) {
    const isNew = !log.id;
    let html = '<form data-form="log" novalidate>';
    html += '<input type="hidden" name="id" value="' + esc(log.id || '') + '">';
    html += '<label>ペット<select name="petId" required>' + optionsHtml(db.pets.map((p) => ({ id: p.id, label: p.name })), log.petId) + '</select></label>';
    html += '<fieldset><legend>カテゴリ</legend><div class="cat-picker">';
    D.CATEGORIES.forEach((c) => {
      html += '<label class="cat-opt" style="--c:' + c.color + '"><input type="radio" name="category" value="' + c.id + '"' + (c.id === log.category ? ' checked' : '') + '><span>' + c.emoji + ' ' + esc(c.label) + '</span></label>';
    });
    html += '</div></fieldset>';
    html += '<label>日時<input type="datetime-local" name="datetime" required value="' + esc(log.datetime) + '"></label>';
    html += '<label class="weight-field"' + (log.category === 'weight' ? '' : ' hidden') + '>体重（kg）<input type="number" name="value" inputmode="decimal" step="0.01" min="0" max="200" value="' + esc(log.value || '') + '"></label>';
    html += '<label>メモ<textarea name="memo" rows="3" maxlength="1000" placeholder="例：半分残した／黄色い液体を少量">' + esc(log.memo || '') + '</textarea></label>';
    html += '<p class="form-error" hidden></p>';
    html += '<div class="form-actions"><button type="submit" class="btn primary block">' + (isNew ? '記録する' : '変更を保存') + '</button>';
    if (!isNew) html += '<button type="button" class="btn danger-ghost block" data-action="deleteLog" data-id="' + esc(log.id) + '">この記録を削除</button>';
    html += '</div></form>';
    return html;
  }
  function openLogForm(preset) {
    const pet = activePet();
    const log = Object.assign({ petId: pet ? pet.id : '', category: 'food', datetime: nowLocal(), memo: '', value: '' }, preset || {});
    openSheet(log.id ? '記録を編集' : '記録を追加', logFormHtml(log));
  }
  function saveLogForm(form) {
    const f = new FormData(form);
    const id = f.get('id');
    const data = {
      petId: f.get('petId'),
      category: f.get('category'),
      datetime: String(f.get('datetime') || '').slice(0, 16),
      memo: String(f.get('memo') || '').trim(),
      value: ''
    };
    const err = form.querySelector('.form-error');
    if (!getPet(data.petId)) return showFormError(err, 'ペットを選んでください。');
    if (!data.category) return showFormError(err, 'カテゴリを選んでください。');
    if (!parseLocal(data.datetime)) return showFormError(err, '日時を正しく入力してください。');
    if (data.category === 'weight') {
      const w = parseFloat(f.get('value'));
      if (!(w > 0 && w < 200)) return showFormError(err, '体重を数値（kg）で入力してください。');
      data.value = String(Math.round(w * 100) / 100);
    }
    const ok = commit(() => {
      if (id) {
        const l = db.logs.find((x) => x.id === id);
        if (l) Object.assign(l, data, { updatedAt: new Date().toISOString() });
      } else {
        db.logs.push(Object.assign({ id: uid(), createdAt: new Date().toISOString() }, data));
      }
      if (data.category === 'weight') {
        /* 体重記録が最新ならプロフィールの体重も更新 */
        const pet = getPet(data.petId);
        const latest = logsSorted(db.logs.filter((l) => l.petId === data.petId && l.category === 'weight'))[0];
        if (pet && latest) pet.weight = latest.value;
      }
    });
    if (!ok) return;
    closeSheet();
    toast(id ? '記録を更新しました' : '記録しました');
    rerender();
  }
  function showFormError(el, msg) { el.textContent = msg; el.hidden = false; el.scrollIntoView({ block: 'nearest' }); }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv(logs) {
    const rows = [['日時', 'ペット', 'カテゴリ', '体重(kg)', 'メモ']];
    logsSorted(logs).reverse().forEach((l) => {
      const p = getPet(l.petId);
      rows.push([fmtDateTime(l.datetime), p ? p.name : '', categoryOf(l.category).label, l.value || '', l.memo || '']);
    });
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    download('pawcare-records-' + todayStr() + '.csv', csv, 'text/csv;charset=utf-8');
  }

  function download(filename, content, mime) {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('ファイルを書き出しました');
      return true;
    } catch (e) {
      toast('書き出しに失敗しました：' + (e && e.message));
      return false;
    }
  }

  /* ============================================================
   * ペット管理
   * ============================================================ */
  function renderPets() {
    let html = '<div class="row-between"><h1 class="page-title">ペット</h1><button type="button" class="btn primary small" data-action="newPet">＋ 追加</button></div>';
    if (!db.pets.length) {
      return html + '<section class="card"><p class="empty">まだペットが登録されていません。</p><button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button></section>';
    }
    db.pets.forEach((p) => {
      const sp = speciesOf(p.species);
      const count = db.logs.filter((l) => l.petId === p.id).length;
      html += '<section class="card pet-card' + (p.id === db.settings.activePetId ? ' is-active' : '') + '">' +
        '<div class="pet-card-head"><span class="pet-avatar" aria-hidden="true">' + sp.emoji + '</span><div><h2>' + esc(p.name) + '</h2>' +
        '<p class="muted">' + esc(sp.label + (p.breed ? '・' + p.breed : '')) + '</p></div></div>' +
        '<dl class="pet-dl">' +
        '<dt>生年月日</dt><dd>' + (p.birthday ? esc(p.birthday.replace(/-/g, '/')) + '（' + esc(ageText(p.birthday)) + '）' : '未登録') + '</dd>' +
        '<dt>性別</dt><dd>' + esc(sexLabel(p.sex) || '未登録') + '</dd>' +
        '<dt>体重</dt><dd>' + (p.weight ? esc(p.weight) + ' kg' : '未登録') + '</dd>' +
        '<dt>記録数</dt><dd>' + count + '件</dd>' +
        (p.memo ? '<dt>メモ</dt><dd class="pre">' + esc(p.memo) + '</dd>' : '') +
        '</dl><div class="btn-row">' +
        (p.id === db.settings.activePetId ? '<span class="badge">ホームに表示中</span>' : '<button type="button" class="btn ghost small" data-action="selectPet" data-id="' + esc(p.id) + '">ホームに表示</button>') +
        '<button type="button" class="btn ghost small" data-action="editPet" data-id="' + esc(p.id) + '">編集</button>' +
        '<button type="button" class="btn ghost small" data-action="openShare" data-id="' + esc(p.id) + '">病院に共有</button>' +
        '<button type="button" class="btn danger-ghost small" data-action="deletePet" data-id="' + esc(p.id) + '">削除</button></div></section>';
    });
    return html;
  }

  function breedSelectHtml(species, breed) {
    const list = D.BREEDS[species] || D.BREEDS.other;
    const known = !breed || list.indexOf(breed) >= 0;
    const selected = known ? breed : 'その他';
    return '<label>品種<select name="breedSelect" data-change="breed">' + optionsHtml(list, selected, '選択してください') + '</select></label>' +
      '<label class="breed-other"' + (selected === 'その他' ? '' : ' hidden') + '>品種（自由入力）<input name="breedOther" maxlength="40" value="' + esc(known ? '' : breed) + '" placeholder="例：トイ・プードル×チワワ"></label>';
  }
  function petFormHtml(p) {
    let html = '<form data-form="pet" novalidate><input type="hidden" name="id" value="' + esc(p.id || '') + '">';
    html += '<label>名前<span class="req">必須</span><input name="name" required maxlength="30" value="' + esc(p.name || '') + '" placeholder="例：ポチ" autocomplete="off"></label>';
    const sp0 = p.species || 'dog';
    html += '<fieldset><legend>動物の種類</legend><div class="species-big">' + ['dog', 'cat'].map((id) =>
      '<button type="button" class="species-btn' + (sp0 === id ? ' active' : '') + '" data-action="pickSpecies" data-value="' + id + '">' + speciesOf(id).emoji + ' ' + speciesOf(id).label + '</button>').join('') + '</div>' +
      '<label class="small muted">その他の動物<select name="species" data-change="species">' + optionsHtml(D.SPECIES, sp0) + '</select></label></fieldset>';
    html += '<div class="breed-wrap">' + breedSelectHtml(p.species || 'dog', p.breed || '') + '</div>';
    html += '<div class="two-col"><label>生年月日<input type="date" name="birthday" max="' + todayStr() + '" value="' + esc(p.birthday || '') + '"></label>';
    html += '<label>性別<select name="sex">' + optionsHtml(D.SEXES, p.sex || '', '選択') + '</select></label></div>';
    html += '<label>体重（kg）<input type="number" name="weight" inputmode="decimal" step="0.01" min="0" max="200" value="' + esc(p.weight || '') + '" placeholder="例：5.2"></label>';
    html += '<label>補足メモ<textarea name="memo" rows="3" maxlength="1000" placeholder="持病・アレルギー・服用中の薬など">' + esc(p.memo || '') + '</textarea></label>';
    html += '<p class="form-error" hidden></p><div class="form-actions"><button type="submit" class="btn primary block">' + (p.id ? '保存する' : '登録する') + '</button></div></form>';
    return html;
  }
  function openPetForm(p) {
    openSheet(p && p.id ? 'ペット情報を編集' : 'ペットを登録', petFormHtml(p || {}));
  }
  function savePetForm(form) {
    const f = new FormData(form);
    const id = f.get('id');
    const err = form.querySelector('.form-error');
    const name = String(f.get('name') || '').trim();
    if (!name) return showFormError(err, '名前を入力してください。');
    let breed = f.get('breedSelect') || '';
    if (breed === 'その他') breed = String(f.get('breedOther') || '').trim() || 'その他';
    const wRaw = String(f.get('weight') || '').trim();
    let weight = '';
    if (wRaw) {
      const w = parseFloat(wRaw);
      if (!(w > 0 && w < 200)) return showFormError(err, '体重は0〜200kgの数値で入力してください。');
      weight = String(Math.round(w * 100) / 100);
    }
    const birthday = String(f.get('birthday') || '');
    if (birthday && birthday > todayStr()) return showFormError(err, '生年月日が未来の日付になっています。');
    const data = { name: name, species: f.get('species') || 'other', breed: breed, birthday: birthday, sex: f.get('sex') || '', weight: weight, memo: String(f.get('memo') || '').trim() };
    let newId = null;
    const ok = commit(() => {
      if (id) {
        const p = getPet(id);
        if (p) Object.assign(p, data, { updatedAt: new Date().toISOString() });
      } else {
        newId = uid();
        db.pets.push(Object.assign({ id: newId, createdAt: new Date().toISOString() }, data));
        db.settings.activePetId = newId;
      }
    });
    if (!ok) return;
    closeSheet();
    toast(id ? '保存しました' : name + 'を登録しました');
    if (newId && currentView !== 'pets') go('home'); else rerender();
  }

  /* ============================================================
   * 症状問診
   * ============================================================ */
  const STEP_TITLES = ['はじめに', 'どの子ですか？', 'どんな症状ですか？', 'いつからですか？', '頻度・続いている時間', '食欲と水分', '元気・意識の状態', '呼吸の状態', '補足情報', '問診メモ'];
  let iv = null;
  function newInterview() {
    const pet = activePet();
    return {
      step: 0,
      a: { petId: pet ? pet.id : '', symptoms: [], symptomOther: '', onset: '', onsetDetail: '', frequency: '', duration: '', appetite: '', water: '', energy: '', breathing: '', notes: '', includeLogs: true },
      savedId: null
    };
  }
  function interviewDanger(a) {
    return D.DANGER_ANSWERS.indexOf(a.energy) >= 0 || D.DANGER_ANSWERS.indexOf(a.breathing) >= 0 ||
      a.symptoms.some((s) => D.DANGER_SYMPTOMS.indexOf(s) >= 0);
  }
  function dangerBox(compact) {
    const h = db.settings.hospital;
    return '<div class="alert danger" role="alert"><strong>⚠️ 問診を待たずに、今すぐ動物病院へ連絡してください。</strong>' +
      (compact ? '' : '<p>入力内容に、「すぐ動物病院へ連絡すべき様子」の一覧と同じ項目があります。</p>') +
      '<div class="btn-row">' + (h.phone ? '<a class="btn danger small" href="tel:' + esc(h.phone.replace(/[^\d+]/g, '')) + '">📞 ' + esc(h.name || 'かかりつけ') + 'に電話</a>' : '') +
      '<button type="button" class="btn danger-ghost small" data-nav="emergency">緊急時の案内を開く</button></div></div>';
  }
  function choiceList(name, list, value) {
    return '<div class="choice-list">' + list.map((o) =>
      '<label class="choice"><input type="radio" name="' + name + '" value="' + esc(o) + '"' + (o === value ? ' checked' : '') + ' data-iv="' + name + '"><span>' + esc(o) + '</span></label>').join('') + '</div>';
  }

  function renderInterview() {
    if (!db.pets.length) {
      return '<h1 class="page-title">症状問診</h1><section class="card"><p>問診メモを作成するには、まずペットを登録してください。</p><button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button></section>' +
        '<section class="card">' + dangerSignsHtml() + '</section>';
    }
    if (!iv) iv = newInterview();
    if (!getPet(iv.a.petId)) iv.a.petId = db.pets[0].id;
    const a = iv.a;
    const last = STEP_TITLES.length - 1;
    let html = '<h1 class="page-title">症状問診</h1>';
    if (iv.step > 0 && iv.step < last) {
      html += '<div class="progress" aria-label="進捗"><div style="width:' + Math.round(iv.step / (last - 1) * 100) + '%"></div></div><p class="muted small">ステップ ' + iv.step + ' / ' + (last - 1) + '</p>';
    }
    html += '<section class="card"><h2>' + esc(STEP_TITLES[iv.step]) + '</h2>';
    switch (iv.step) {
      case 0:
        html += '<p>症状を順番に入力すると、動物病院に伝えるための<strong>問診メモ</strong>を作成します。</p>' +
          '<p class="muted small">※このアプリは病気の診断や緊急度の判定は行いません。判断は必ず獣医師に相談してください。</p>' +
          dangerSignsHtml() +
          '<div class="form-actions"><button type="button" class="btn danger block" data-nav="emergency">当てはまる → 緊急時の案内へ</button>' +
          '<button type="button" class="btn primary block" data-action="ivNext">当てはまらない → 問診を始める</button></div>';
        break;
      case 1:
        html += '<div class="choice-list">' + db.pets.map((p) =>
          '<label class="choice"><input type="radio" name="petId" value="' + esc(p.id) + '"' + (p.id === a.petId ? ' checked' : '') + ' data-iv="petId"><span>' + speciesOf(p.species).emoji + ' ' + esc(p.name) + '</span></label>').join('') + '</div>';
        break;
      case 2:
        html += '<p class="muted small">当てはまるものをすべて選んでください。</p><div class="chips wrap">' + D.SYMPTOMS.map((s) =>
          '<button type="button" class="chip' + (a.symptoms.indexOf(s) >= 0 ? ' active' : '') + '" aria-pressed="' + (a.symptoms.indexOf(s) >= 0) + '" data-action="ivSymptom" data-value="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>' +
          '<label>その他の症状・様子<textarea rows="2" data-iv="symptomOther" maxlength="500" placeholder="例：右の後ろ足を上げて歩く">' + esc(a.symptomOther) + '</textarea></label>';
        break;
      case 3:
        html += choiceList('onset', D.ONSET, a.onset) + '<label>詳しい日時・きっかけ（任意）<input data-iv="onsetDetail" maxlength="200" value="' + esc(a.onsetDetail) + '" placeholder="例：今朝7時ごろ、散歩の後から"></label>';
        break;
      case 4:
        {
          const cwI = countsWithLast(db.logs.filter((l) => l.petId === a.petId && l.datetime.slice(0, 10) === todayStr()));
          const refs = ['vomit', 'regurgitate', 'stool', 'urine', 'ingest'].filter((k) => cwI[k]).map((k) => categoryOf(k).label + cwI[k].n + '回（最後 ' + cwI[k].last.slice(11, 16) + '）');
          if (refs.length) html += '<p class="ref-note">記録では今日 ' + esc(refs.join('・')) + '</p>';
        }
        html += '<p class="muted small">症状が出た回数</p>' + choiceList('frequency', D.FREQUENCY, a.frequency) +
          '<label>1回あたりの継続時間・様子（任意）<input data-iv="duration" maxlength="200" value="' + esc(a.duration) + '" placeholder="例：嘔吐は1回数秒、震えは5分ほど"></label>';
        break;
      case 5:
        html += '<p class="sub">食欲</p>' + choiceList('appetite', D.APPETITE, a.appetite) + '<p class="sub">水分摂取</p>' + choiceList('water', D.WATER, a.water);
        break;
      case 6:
        html += choiceList('energy', D.ENERGY, a.energy);
        break;
      case 7:
        html += choiceList('breathing', D.BREATHING, a.breathing);
        break;
      case 8:
        html += '<label>補足情報（任意）<textarea rows="4" data-iv="notes" maxlength="1500" placeholder="例：昨日新しいおやつを食べた／持病で服薬中／吐いたものの写真あり">' + esc(a.notes) + '</textarea></label>' +
          '<label class="check"><input type="checkbox" data-iv="includeLogs"' + (a.includeLogs ? ' checked' : '') + '> 直近24時間の健康記録をメモに含める</label>';
        break;
      default: {
        const text = buildMemo(a);
        const pp = getPet(a.petId);
        html += '<p class="muted small">内容を確認し、電話や受付で獣医師に伝える際に使ってください。</p>' +
          (pp ? '<p class="sub">電話で読み上げるメモ（短い版）</p><pre class="memo phone-script">' + esc(phoneScript(pp, a)) + '</pre>' : '') +
          '<p class="sub">問診メモ（詳しい版）</p>' +
          '<pre class="memo" id="memoText">' + esc(text) + '</pre>' +
          '<div class="form-actions"><button type="button" class="btn primary block" data-action="copyMemo">メモをコピー</button>' +
          (navigator.share ? '<button type="button" class="btn ghost block" data-action="shareMemo">LINE・メールなどで共有</button>' : '') +
          (iv.savedId ? '<p class="ok-text">✓ 保存済み（緊急時の案内からも確認できます）</p>' : '<button type="button" class="btn ghost block" data-action="saveMemo">この端末に保存</button>') +
          '<button type="button" class="btn ghost block" data-action="shareInterview">病院への共有リンク・QRコードを作る</button>' +
          '<button type="button" class="btn ghost block" data-action="ivRestart">新しく問診をやり直す</button></div>' +
          '<p class="disclaimer">このメモは飼い主様の入力内容を整理したものであり、診断ではありません。受診の要否や緊急度は動物病院にご相談ください。</p>';
      }
    }
    if (iv.step > 1 && a.symptoms.some((x) => D.CAUTION_SYMPTOMS.indexOf(x) >= 0)) {
      html = html.replace('<section class="card">', '<div class="alert warn">有害なものを食べた可能性がある場合や、出血が止まらない場合は、問診を待たずに動物病院へ連絡してください。</div><section class="card">');
    }
    if (iv.step > 0 && iv.step < last && interviewDanger(a)) html = html.replace('<section class="card">', dangerBox(true) + '<section class="card">');
    if (iv.step === last && interviewDanger(a)) html = html.replace('<section class="card">', dangerBox(false) + '<section class="card">');
    if (iv.step > 0 && iv.step < last) {
      html += '<div class="wizard-nav"><button type="button" class="btn ghost" data-action="ivBack">戻る</button>' +
        '<button type="button" class="btn primary" data-action="ivNext">' + (iv.step === last - 1 ? 'メモを作成' : '次へ') + '</button></div>';
    }
    html += '</section>';
    if (iv.step === 0 && db.memos.length) {
      html += '<section class="card"><h2>保存した問診メモ</h2><ul class="memo-list">' + db.memos.slice().reverse().slice(0, 10).map((m) =>
        '<li><button type="button" class="log-item" data-action="viewMemo" data-id="' + esc(m.id) + '"><span class="log-main"><span class="log-cat">' + esc(m.petName || '') + '</span><span class="log-memo">' + esc(fmtDateTime(m.createdAt)) + '　' + esc(m.summary || '') + '</span></span><span class="chev" aria-hidden="true">›</span></button></li>').join('') + '</ul></section>';
    }
    return html;
  }

  function dangerSignsHtml() {
    return '<div class="alert danger"><strong>次のような様子があれば、問診を待たずにすぐ動物病院へ連絡してください</strong><ul>' +
      D.DANGER_SIGNS.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul><p class="small">※この一覧は一般的な目安で、獣医師による監修を準備中です。迷ったら動物病院に電話で相談してください。</p></div>';
  }

  function petSummaryLines(p) {
    const sp = speciesOf(p.species);
    const parts = [sp.label + (p.breed ? '（' + p.breed + '）' : '')];
    if (p.sex) parts.push(sexLabel(p.sex));
    if (p.birthday) parts.push(ageText(p.birthday) + '（' + p.birthday.replace(/-/g, '/') + '生）');
    if (p.weight) parts.push('体重 ' + p.weight + 'kg');
    const lines = ['名前：' + p.name, parts.join(' / ')];
    if (p.memo) lines.push('持病・メモ：' + p.memo.replace(/\n/g, ' '));
    return lines;
  }
  /* 電話で病院に伝えるときに、そのまま読み上げられる短い文 */
  function phoneScript(pet, answers) {
    const sp = speciesOf(pet.species);
    const L = [];
    const basic = [sp.label + (pet.breed && ['ミックス', '不明', 'その他'].indexOf(pet.breed) < 0 ? '（' + pet.breed + '）' : ''), pet.birthday ? ageText(pet.birthday) : '', sexLabel(pet.sex), pet.weight ? '体重' + pet.weight + 'kg' : ''].filter(Boolean).join('、');
    L.push(pet.name + 'です。' + basic + 'です。');
    const hasCard = pet.conditions || pet.conditionsNone || pet.allergies || pet.allergiesNone || pet.medsNone || activeMeds(pet).length;
    if (hasCard) {
      const parts = [];
      if (pet.conditionsNone) parts.push('持病はなし'); else if (pet.conditions) parts.push('持病は' + pet.conditions.replace(/\n/g, ' '));
      if (pet.allergiesNone) parts.push('アレルギーはなし'); else if (pet.allergies) parts.push('アレルギーは' + pet.allergies.replace(/\n/g, ' '));
      const meds = activeMeds(pet);
      if (meds.length) parts.push('飲んでいる薬は' + meds.map((m) => m.name).join('、')); else if (pet.medsNone) parts.push('飲んでいる薬はなし');
      if (parts.length) L.push(parts.join('、') + 'です。');
    } else if (pet.memo) L.push('持病・メモ：' + pet.memo.replace(/\n/g, ' ') + '。');
    recentLogs(pet.id, 24).filter((l) => l.category === 'ingest').reverse().forEach((l) => { const t = ingestPhoneLine(l); if (t) L.splice(1, 0, t); });
    let a = answers;
    if (!a) {
      const m = latestMemoFor(pet.id);
      if (m && m.answers && m.createdAt >= toLocalInput(new Date(Date.now() - 48 * 3600 * 1000))) a = m.answers;
    }
    if (a) {
      const sy = (a.symptoms || []).join('、') + (a.symptomOther ? (a.symptoms && a.symptoms.length ? '、' : '') + a.symptomOther : '');
      if (sy) L.push(sy + 'が' + (a.onset ? a.onset + 'から' : '') + 'あります' + (a.frequency ? '（' + a.frequency + '）' : '') + '。');
      if (a.appetite || a.water) L.push('食欲は' + (a.appetite || '未確認') + '、水は' + (a.water || '未確認') + 'です。');
      if (a.energy || a.breathing) L.push('元気は' + (a.energy || '未確認') + '、呼吸は' + (a.breathing || '未確認') + 'です。');
    }
    const logs = recentLogs(pet.id, 24);
    const cw = countsWithLast(logs);
    const keys = KEY_CATS.filter((k) => cw[k]);
    if (keys.length) L.push('この24時間の記録は、' + keys.map((k) => categoryOf(k).label + cw[k].n + '回').join('、') + 'です。');
    ['ingest', 'vomit', 'regurgitate', 'stool', 'urine'].filter((k) => cw[k]).forEach((k) => {
      const t = cw[k].last;
      L.push('最後の' + categoryOf(k).label + 'は' + (t.slice(0, 10) === todayStr() ? '今日' : fmtShort(t).split(' ')[0]) + Number(t.slice(11, 13)) + '時' + t.slice(14, 16) + '分（約' + agoText(t) + '）です。');
    });
    const keysCount = keys.length;
    if (!a && !keysCount) L.push('（症状は問診メモを作ると、ここに入ります）');
    return L.join('\n');
  }

  function buildMemo(a) {
    const p = getPet(a.petId);
    const L = [];
    L.push('【PAWCARE 問診メモ】');
    L.push('作成：' + fmtDateTime(nowLocal()));
    L.push('※飼い主が入力した情報の整理です（診断ではありません）');
    L.push('');
    L.push('■ ペット');
    if (p) petSummaryLines(p).forEach((x) => L.push(x));
    L.push('');
    L.push('■ 症状');
    L.push('主な症状：' + (a.symptoms.length ? a.symptoms.join('、') : '（未選択）'));
    if (a.symptomOther) L.push('様子：' + a.symptomOther);
    L.push('始まり：' + (a.onset || '未回答') + (a.onsetDetail ? '（' + a.onsetDetail + '）' : ''));
    L.push('頻度：' + (a.frequency || '未回答') + (a.duration ? '／継続時間・様子：' + a.duration : ''));
    L.push('食欲：' + (a.appetite || '未回答') + '　飲水：' + (a.water || '未回答'));
    L.push('元気・意識：' + (a.energy || '未回答'));
    L.push('呼吸：' + (a.breathing || '未回答'));
    if (a.notes) { L.push(''); L.push('■ 補足'); L.push(a.notes); }
    if (a.includeLogs && p) {
      const logs = recentLogs(p.id, 24).reverse();
      L.push('');
      L.push('■ 直近24時間の記録');
      if (!logs.length) L.push('（記録なし）');
      logs.forEach((l) => {
        L.push(fmtShort(l.datetime) + ' ' + categoryOf(l.category).label + (l.value ? ' ' + l.value + 'kg' : '') + (l.memo ? '：' + l.memo.replace(/\n/g, ' ') : ''));
      });
    }
    return L.join('\n');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast('コピーしました');
        return;
      }
    } catch (e) { /* フォールバックへ */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    toast(ok ? 'コピーしました' : 'コピーできませんでした。メモを長押しして選択してください');
  }
  async function shareText(title, text) {
    try {
      await navigator.share({ title: title, text: text });
    } catch (e) {
      if (e && e.name !== 'AbortError') copyText(text);
    }
  }

  /* ============================================================
   * 緊急時の案内
   * ============================================================ */
  function renderEmergency() {
    const h = db.settings.hospital;
    const pet = activePet();
    let html = '<h1 class="page-title emergency-title">🚨 緊急時の案内</h1>';
    html += dangerSignsHtml();

    html += '<section class="card"><h2>📞 動物病院へ連絡する</h2>';
    if (h.phone) {
      html += '<a class="btn danger block big" href="tel:' + esc(h.phone.replace(/[^\d+]/g, '')) + '">' + esc(h.name || 'かかりつけの動物病院') + 'に電話する<small>' + esc(h.phone) + '</small></a>';
      if (h.note) html += '<p class="muted small pre">' + esc(h.note) + '</p>';
    } else {
      html += '<p>かかりつけの動物病院を登録しておくと、ここからすぐに電話できます。</p><button type="button" class="btn ghost block" data-action="editHospital">かかりつけ病院を登録する</button>';
    }
    const nt = db.settings.night;
    if (nt.phone) {
      html += '<a class="btn danger-ghost block big night-call" href="tel:' + esc(nt.phone.replace(/[^\d+]/g, '')) + '">🌙 ' + esc(nt.name || '夜間・救急の動物病院') + 'に電話する<small>' + esc(nt.phone) + '</small></a>';
      if (nt.note) html += '<p class="muted small pre">' + esc(nt.note) + '</p>';
    } else {
      html += '<button type="button" class="btn ghost block" data-action="editHospital" data-kind="night">🌙 夜間・救急の病院を登録する</button>';
    }
    html += '<p class="muted small">診療時間外や受け入れ可否は病院ごとに異なります。<strong>向かう前に必ず電話で確認してください。</strong></p>' +
      (pet ? '<button type="button" class="btn ghost block" data-nav="card">🪪 もしもカードを見せる（持病・アレルギー・薬）</button>' : '') + '</section>';

    html += '<section class="card"><h2>🗺️ 近くの動物病院を探す</h2><p class="muted small">地図アプリで検索します。表示される営業時間などは最新でない場合があります。</p>' +
      '<div class="form-actions"><a class="btn ghost block" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent('動物病院') + '">近くの動物病院（Googleマップ）</a>' +
      '<a class="btn ghost block" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent('夜間救急 動物病院') + '">夜間・救急の動物病院を探す</a></div></section>';

    html += '<section class="card"><h2>📝 電話で伝えること</h2><ul class="check-list">' +
      '<li>ペットの名前・種類・年齢・体重</li><li>どんな症状が、いつから、何回あったか</li><li>呼吸・意識・歩き方の様子</li><li>食べた可能性のあるもの（パッケージがあれば手元に）</li><li>持病・服用中の薬</li></ul>';
    if (pet) {
      html += '<p class="sub">電話で読み上げるメモ</p><pre class="memo phone-script">' + esc(phoneScript(pet)) + '</pre>' +
        '<button type="button" class="btn ghost block" data-action="copyPhoneScript">読み上げメモをコピー</button>';
    }
    const latest = db.memos.length ? db.memos[db.memos.length - 1] : null;
    if (latest) {
      html += '<p class="sub">最新の問診メモ（' + esc(fmtDateTime(latest.createdAt)) + '）</p><pre class="memo">' + esc(latest.text) + '</pre>' +
        '<button type="button" class="btn primary block" data-action="copyLatestMemo">問診メモをコピー</button>';
    }
    html += '<button type="button" class="btn ghost block" data-action="startInterview">問診メモを作成する</button></section>';
    if (pet) {
      html += '<section class="card"><h2>🔗 病院に情報を見せる</h2><p class="muted small">プロフィール・問診メモ・最近の記録をまとめたリンクとQRコードを作ります。受付で見せたり、LINEやメールで送ったりできます。</p>' +
        '<button type="button" class="btn primary block" data-action="openShare" data-id="' + esc(pet.id) + '">共有リンク・QRコードを作る</button></section>';
    }

    if (pet) {
      html += petChips(pet.id, 'selectPet');
      const logs = recentLogs(pet.id, 24);
      html += '<section class="card"><h2>📋 ' + esc(pet.name) + 'の直近24時間の記録</h2><p class="muted small">' + esc(petSummaryLines(pet).slice(1).join(' / ')) + '</p>';
      html += logs.length ? '<ul class="log-list">' + logs.map((l) => logItemHtml(l, false).replace('<span class="log-time">' + esc(l.datetime.slice(11, 16)), '<span class="log-time">' + esc(fmtShort(l.datetime)))).join('') + '</ul>' : '<p class="empty">直近24時間の記録はありません。</p>';
      html += '</section>';
    }
    return html;
  }

  /* ============================================================
   * 設定・データ管理
   * ============================================================ */
  function renderSettings() {
    const h = db.settings.hospital;
    let html = '<h1 class="page-title">設定・データ管理</h1>';
    html += '<section class="card notice"><h2>🔒 データの保存について</h2><p>記録はこの端末のブラウザ内（ローカルストレージ）にのみ保存されます。</p><ul>' +
      '<li>他のスマホやパソコンとは<strong>自動で同期されません</strong>。</li>' +
      '<li>ブラウザの履歴・サイトデータを消去すると記録も消えます。</li>' +
      '<li>iPhoneでは、ホーム画面に追加したアプリとSafariでは保存場所が別になります。</li></ul>' +
      '<p class="muted small">最終バックアップ：' + (db.settings.lastBackupAt ? esc(fmtDateTime(toLocalInput(new Date(db.settings.lastBackupAt)))) : 'まだありません') + '</p>' +
      (storageOk ? '' : '<p class="error-text">現在このブラウザでは保存できない状態です。</p>') + '</section>';

    html += '<section class="card"><h2>🏥 かかりつけの動物病院</h2>' +
      (h.name || h.phone ? '<p><strong>' + esc(h.name || '名称未登録') + '</strong><br>' + esc(h.phone || '電話番号未登録') + '</p>' + (h.note ? '<p class="muted small pre">' + esc(h.note) + '</p>' : '') : '<p class="muted">未登録です。</p>') +
      '<button type="button" class="btn ghost block" data-action="editHospital">' + (h.name || h.phone ? '編集する' : '登録する') + '</button></section>';
    const nt = db.settings.night;
    html += '<section class="card"><h2>🌙 夜間・救急の動物病院</h2><p class="muted small">かかりつけが閉まっている時間に連絡する病院です。元気なうちに調べて登録しておくと安心です。</p>' +
      (nt.name || nt.phone ? '<p><strong>' + esc(nt.name || '名称未登録') + '</strong><br>' + esc(nt.phone || '電話番号未登録') + '</p>' + (nt.note ? '<p class="muted small pre">' + esc(nt.note) + '</p>' : '') : '<p class="muted">未登録です。</p>') +
      '<button type="button" class="btn ghost block" data-action="editHospital" data-kind="night">' + (nt.name || nt.phone ? '編集する' : '登録する') + '</button></section>';

    html += '<section class="card"><h2>🪪 もしもカード・受診の記録</h2><div class="form-actions"><button type="button" class="btn ghost block" data-nav="card">もしもカード</button><button type="button" class="btn ghost block" data-nav="visits">受診の記録</button></div></section>';
    html += '<section class="card"><h2>⏰ 予定・リマインダー</h2><p class="muted small">ワクチン・服薬・予防薬などの予定を管理し、スマホのカレンダーに登録して通知を受け取れます。</p><button type="button" class="btn ghost block" data-nav="reminders">予定を管理する</button></section>';
    html += '<section class="card"><h2>💾 バックアップ</h2><p class="muted small">すべてのデータ（ペット・記録・問診メモ・設定）を1つのファイルに書き出します。機種変更時はこのファイルを読み込んでください。</p>' +
      '<div class="form-actions"><button type="button" class="btn primary block" data-action="exportJson">バックアップを書き出す（JSON）</button>' +
      '<label class="btn ghost block file-btn">バックアップから復元<input type="file" accept="application/json,.json" data-action-change="importJson"></label>' +
      '<button type="button" class="btn ghost block" data-action="exportAllCsv"' + (db.logs.length ? '' : ' disabled') + '>すべての記録をCSVで書き出す</button></div></section>';

    html += '<section class="card"><h2>📤 外部に送られるデータ</h2><p class="muted small">PAWCAREにはサーバーがなく、通常の記録は端末の外に送られません。次の操作をしたときだけ、外部のサービスに情報が渡ります。</p><ul class="small">' +
      '<li><strong>病院への共有リンク</strong>：選んだ情報がリンク自体に入ります。LINE・メールで送ると、その送信履歴にも残ります。</li>' +
      '<li><strong>Googleカレンダーに追加</strong>：ペット名・予定名・メモがGoogleに送られます。</li>' +
      '<li><strong>近くの動物病院を探す</strong>：Googleマップで検索します（検索語は「動物病院」などの固定の言葉だけです）。</li>' +
      '<li><strong>電話・共有ボタン</strong>：スマホの電話アプリや共有先のアプリに渡ります。</li></ul></section>';
    html += '<section class="card"><h2>📱 ホーム画面に追加</h2><p class="muted small">iPhone（Safari）：共有ボタン →「ホーム画面に追加」<br>Android（Chrome）：右上メニュー →「ホーム画面に追加」または「アプリをインストール」</p></section>';

    html += '<section class="card"><h2>このアプリについて</h2><p class="small">PAWCARE デモ版 v' + APP_VERSION + '</p><p class="muted small">本アプリは健康記録と情報整理のためのツールです。病気の診断、治療方針の決定、緊急度の判定は行いません。体調に不安があるときは動物病院にご相談ください。</p>' +
      '<p class="muted small">ペット ' + db.pets.length + '頭／記録 ' + db.logs.length + '件／問診メモ ' + db.memos.length + '件／予定 ' + db.reminders.length + '件</p>' +
      '<button type="button" class="btn danger-ghost block" data-action="wipe">すべてのデータを削除</button></section>';
    return html;
  }

  function hospitalFormHtml(kind) {
    const h = kind === 'night' ? db.settings.night : db.settings.hospital;
    return '<form data-form="hospital"><input type="hidden" name="kind" value="' + (kind === 'night' ? 'night' : 'hospital') + '">' +
      (kind === 'night' ? '<p class="muted small">「近くの動物病院を探す」の夜間・救急の検索で見つけた病院を登録できます。受け入れ条件は病院ごとに違うので、事前に電話で確認しておくと安心です。</p>' : '') +
      '<label>病院名<input name="name" maxlength="60" value="' + esc(h.name) + '" placeholder="例：〇〇動物病院"></label>' +
      '<label>電話番号<input name="phone" type="tel" inputmode="tel" maxlength="20" value="' + esc(h.phone) + '" placeholder="例：03-1234-5678"></label>' +
      '<label>メモ（診療時間・夜間の連絡先など）<textarea name="note" rows="3" maxlength="500">' + esc(h.note) + '</textarea></label>' +
      '<p class="muted small">診療時間は変わることがあります。受診前に病院へご確認ください。</p>' +
      '<p class="form-error" hidden></p><div class="form-actions"><button type="submit" class="btn primary block">保存する</button></div></form>';
  }

  function exportJson() {
    const payload = { app: 'PAWCARE', format: 1, exportedAt: new Date().toISOString(), data: db };
    if (download('pawcare-backup-' + todayStr() + '.json', JSON.stringify(payload, null, 2), 'application/json')) {
      commit(() => { db.settings.lastBackupAt = new Date().toISOString(); });
      rerender();
    }
  }
  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { toast('ファイルの形式が正しくありません'); return; }
      const data = parsed && parsed.app === 'PAWCARE' ? parsed.data : parsed;
      const next = normalizeDb(data);
      if (!next.pets.length && !next.logs.length && !next.reminders.length) { toast('復元できるデータが見つかりませんでした'); return; }
      if (!confirm('ペット' + next.pets.length + '頭・記録' + next.logs.length + '件を復元します。\n現在の端末内のデータは置き換えられます。よろしいですか？')) return;
      const before = db;
      db = next;
      if (!persist()) { db = before; toast('復元に失敗しました'); return; }
      iv = null;
      toast('バックアップを復元しました');
      go('home');
    };
    reader.onerror = () => toast('ファイルを読み込めませんでした');
    reader.readAsText(file);
  }

  function loadSample() {
    const petId = uid(), cat = uid();
    const d = new Date();
    const at = (daysAgo, hm) => { const x = new Date(d); x.setDate(x.getDate() - daysAgo); const [hh, mm] = hm.split(':'); x.setHours(+hh, +mm, 0, 0); return toLocalInput(x); };
    const nowHm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    const todayAt = (hm) => (hm <= nowHm ? at(0, hm) : at(1, hm));
    commit(() => {
      db.pets.push({ id: petId, name: 'こむぎ', species: 'dog', breed: '柴犬', birthday: (d.getFullYear() - 4) + '-04-12', sex: 'female_spayed', weight: '8.4', memo: '鶏肉アレルギーあり', createdAt: new Date().toISOString(), allergies: '鶏肉', conditionsNone: true, medsNone: true, life: { housing: 'mostly_indoor', cohabit: '猫1匹（ミント）', recentChanges: '先週からおやつを変えた' } });
      db.foods.push({ id: uid(), petId: petId, name: 'いつものドライフード（ラム）', type: 'complete', grams: '120', kcal: '360', protein: '24', fat: '12', moisture: '10' });
      db.pets.push({ id: cat, name: 'ミント', species: 'cat', breed: 'スコティッシュ・フォールド', birthday: (d.getFullYear() - 2) + '-09-03', sex: 'male_neutered', weight: '4.1', memo: '', createdAt: new Date().toISOString() });
      const add = (pid, category, datetime, memo, value) => db.logs.push({ id: uid(), petId: pid, category, datetime, memo: memo || '', value: value || '', createdAt: new Date().toISOString() });
      add(petId, 'food', todayAt('08:00'), 'いつもの量を完食');
      add(petId, 'regurgitate', todayAt('09:15'), '少量・未消化のフード');
      add(petId, 'water', todayAt('12:00'), '');
      add(petId, 'walk', todayAt('14:00'), '30分');
      add(petId, 'medicine', todayAt('18:30'), '整腸剤');
      add(petId, 'stool', at(1, '07:40'), '普通の硬さ');
      add(petId, 'weight', at(3, '20:00'), '', '8.4');
      add(cat, 'food', todayAt('07:30'), '');
      add(cat, 'urine', todayAt('10:10'), '');
      db.settings.activePetId = petId;
    });
    toast('サンプルデータを追加しました（設定から削除できます）');
    rerender();
  }

  /* ============================================================
   * 予定・リマインダー
   * ============================================================ */
  function reminderTypeOf(id) { return D.REMINDER_TYPES.find((t) => t.id === id) || D.REMINDER_TYPES[D.REMINDER_TYPES.length - 1]; }
  function repeatLabel(id) { const r = D.REPEATS.find((x) => x.id === id); return r ? r.label : ''; }
  /* anchorDay：毎月・毎年のくり返しで元の日付（例：31日）を保つ。2月末→3/31 */
  function addInterval(dateStr, repeat, anchorDay) {
    const d = parseLocal(dateStr);
    if (!d) return dateStr;
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly' || repeat === 'yearly') {
      const day = anchorDay || d.getDate();
      d.setDate(1);
      if (repeat === 'monthly') d.setMonth(d.getMonth() + 1); else d.setFullYear(d.getFullYear() + 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
    }
    return toLocalInput(d);
  }
  function reminderStatus(r) {
    if (r.done) return 'done';
    const now = nowLocal();
    if (r.dueAt < now) return 'overdue';
    if (r.dueAt.slice(0, 10) === todayStr()) return 'today';
    return 'upcoming';
  }
  function reminderItemHtml(r, showPet) {
    const t = reminderTypeOf(r.type);
    const st = reminderStatus(r);
    const pet = getPet(r.petId);
    const badge = st === 'overdue' ? '<span class="tag">予定日を過ぎています</span>' : st === 'today' ? '<span class="tag warn">今日</span>' : st === 'done' ? '<span class="tag">完了</span>' : '';
    return '<li class="rem-item rem-' + st + '"><button type="button" class="log-item" data-action="editReminder" data-id="' + esc(r.id) + '">' +
      '<span class="log-dot" style="--c:#1f7a68" aria-hidden="true">' + t.emoji + '</span>' +
      '<span class="log-main"><span class="log-cat">' + esc(r.title || t.label) + ' ' + badge + '</span>' +
      '<span class="log-memo">' + esc(fmtDateTime(r.dueAt)) + (r.repeat !== 'none' ? '・' + esc(repeatLabel(r.repeat)) : '') + (showPet && pet ? '・' + esc(pet.name) : '') + '</span></span>' +
      '<span class="chev" aria-hidden="true">›</span></button>' +
      (r.done ? '' : '<div class="rem-actions"><button type="button" class="btn primary small" data-action="doneReminder" data-id="' + esc(r.id) + '">✓ 完了</button>' +
        '<button type="button" class="btn ghost small" data-action="calendarReminder" data-id="' + esc(r.id) + '">📅 カレンダーに登録</button></div>') + '</li>';
  }
  function sortedReminders(list) {
    return list.slice().sort((a, b) => (a.done - b.done) || (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));
  }
  function homeRemindersHtml(pet) {
    const list = sortedReminders(db.reminders.filter((r) => r.petId === pet.id && !r.done));
    const due = list.filter((r) => reminderStatus(r) !== 'upcoming');
    let html = '<section class="card"><div class="row-between"><h2>⏰ 予定' + (due.length ? ' <span class="tag warn">' + due.length + '</span>' : '') + '</h2><button type="button" class="link" data-nav="reminders">すべて見る</button></div>';
    if (!list.length) {
      html += '<p class="muted small">ワクチン・服薬・予防薬などの予定を登録すると、ここに表示されます。</p><button type="button" class="btn ghost block" data-action="newReminder">＋ 予定を追加</button>';
    } else {
      html += '<ul class="log-list">' + list.slice(0, 3).map((r) => reminderItemHtml(r, false)).join('') + '</ul>';
    }
    return html + '</section>';
  }
  function renderReminders() {
    let html = '<div class="row-between"><h1 class="page-title">予定・リマインダー</h1><button type="button" class="btn primary small" data-action="newReminder">＋ 予定</button></div>';
    if (!db.pets.length) return html + '<section class="card"><p>予定を登録するには、まずペットを登録してください。</p><button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button></section>';
    html += '<p class="notice-small">🔔 通知はスマホのカレンダーから届きます。予定ごとに「カレンダーに登録」を押してください（アプリを閉じていても通知されます）。</p>';
    const multi = db.pets.length > 1;
    const active = sortedReminders(db.reminders.filter((r) => !r.done));
    const done = sortedReminders(db.reminders.filter((r) => r.done)).reverse();
    html += '<section class="card"><h2>これからの予定</h2>' + (active.length ? '<ul class="log-list">' + active.map((r) => reminderItemHtml(r, multi)).join('') + '</ul>' : '<p class="empty">予定はありません。</p>') + '</section>';
    if (done.length) html += '<section class="card"><h2>完了した予定</h2><ul class="log-list">' + done.slice(0, 20).map((r) => reminderItemHtml(r, multi)).join('') + '</ul></section>';
    return html;
  }
  function reminderFormHtml(r) {
    const t = reminderTypeOf(r.type);
    return '<form data-form="reminder" novalidate><input type="hidden" name="id" value="' + esc(r.id || '') + '">' +
      '<label>ペット<select name="petId">' + optionsHtml(db.pets.map((p) => ({ id: p.id, label: p.name })), r.petId) + '</select></label>' +
      '<label>種類<select name="type">' + optionsHtml(D.REMINDER_TYPES.map((x) => ({ id: x.id, label: x.emoji + ' ' + x.label })), r.type) + '</select></label>' +
      '<label>タイトル（任意）<input name="title" maxlength="40" value="' + esc(r.title || '') + '" placeholder="例：' + esc(t.label) + '"></label>' +
      '<label>日時<input type="datetime-local" name="dueAt" required value="' + esc(r.dueAt) + '"></label>' +
      '<label>くり返し<select name="repeat">' + optionsHtml(D.REPEATS, r.repeat) + '</select></label>' +
      '<label>くり返しの終わりの日（任意）<input type="date" name="endAt" value="' + esc(r.endAt || '') + '"></label>' +
      (r.hint ? '<p class="alert warn small">' + esc(r.hint) + '</p>' : '') +
      '<label>メモ<textarea name="memo" rows="2" maxlength="500" placeholder="例：病院で指示された内容をそのまま記入">' + esc(r.memo || '') + '</textarea></label>' +
      '<p class="muted small">「服薬」の予定を完了にすると、健康記録に服薬が自動で記録されます。</p>' +
      '<p class="form-error" hidden></p><div class="form-actions"><button type="submit" class="btn primary block">' + (r.id ? '保存する' : '追加する') + '</button>' +
      (r.id ? '<button type="button" class="btn ghost block" data-action="calendarReminder" data-id="' + esc(r.id) + '">📅 カレンダーに登録</button><button type="button" class="btn danger-ghost block" data-action="deleteReminder" data-id="' + esc(r.id) + '">この予定を削除</button>' : '') +
      '</div></form>';
  }
  function openReminderForm(r) {
    const pet = activePet();
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    const data = Object.assign({ petId: pet ? pet.id : '', type: 'vaccine', title: '', dueAt: toLocalInput(d), repeat: 'none', memo: '' }, r || {});
    openSheet(data.id ? '予定を編集' : '予定を追加', reminderFormHtml(data));
  }
  function saveReminderForm(form) {
    const f = new FormData(form);
    const id = f.get('id');
    const err = form.querySelector('.form-error');
    const data = { petId: f.get('petId'), type: f.get('type') || 'other', title: String(f.get('title') || '').trim(), dueAt: String(f.get('dueAt') || '').slice(0, 16), repeat: f.get('repeat') || 'none', memo: String(f.get('memo') || '').trim(), endAt: /^\d{4}-\d{2}-\d{2}$/.test(String(f.get('endAt'))) ? String(f.get('endAt')) : '' };
    data.anchorDay = +data.dueAt.slice(8, 10) || null;
    if (!getPet(data.petId)) return showFormError(err, 'ペットを選んでください。');
    if (!parseLocal(data.dueAt)) return showFormError(err, '日時を入力してください。');
    let saved = null;
    const ok = commit(() => {
      if (id) {
        saved = db.reminders.find((x) => x.id === id);
        if (saved) Object.assign(saved, data, { done: false, updatedAt: new Date().toISOString() });
      } else {
        saved = Object.assign({ id: uid(), done: false, createdAt: new Date().toISOString() }, data);
        db.reminders.push(saved);
      }
    });
    if (!ok) return;
    closeSheet();
    rerender();
    toast(id ? '予定を保存しました' : '予定を追加しました', saved ? [{ label: '📅 カレンダーに登録', fn: () => addToCalendar(saved) }] : []);
  }
  function doneReminder(id) {
    const r = db.reminders.find((x) => x.id === id);
    if (!r) return;
    const t = reminderTypeOf(r.type);
    const ok = commit(() => {
      r.lastDoneAt = nowLocal();
      if (r.repeat === 'none') r.done = true;
      else {
        const anchor = r.anchorDay || +r.dueAt.slice(8, 10);
        r.anchorDay = anchor;
        let next = addInterval(r.dueAt, r.repeat, anchor);
        let guard = 0;
        while (next <= nowLocal() && guard++ < 1000) next = addInterval(next, r.repeat, anchor);
        if (r.endAt && next.slice(0, 10) > r.endAt) r.done = true;
        else r.dueAt = next;
      }
      if (r.type === 'medicine') db.logs.push({ id: uid(), petId: r.petId, category: 'medicine', datetime: nowLocal(), memo: r.title || r.memo || '', value: '', createdAt: new Date().toISOString() });
    });
    if (!ok) return;
    closeSheet();
    rerender();
    toast((r.title || t.label) + 'を完了しました' + (r.type === 'medicine' ? '（服薬を記録）' : '') + (r.done ? '' : '／次回 ' + fmtShort(r.dueAt)),
      r.type === 'checkup' ? [{ label: '受診の記録をつける', fn: () => { db.settings.activePetId = r.petId; openSheet('受診の記録', visitFormHtml({ date: todayStr(), hospital: 'regular' })); } }] : []);
  }

  /* カレンダー連携（.ics と Googleカレンダー） */
  function icsDate(s) { return s.replace(/[-:]/g, '').slice(0, 13) + '00'; }
  /* RFC 5545：1行75オクテットを超えたら折り返す（UTF-8の文字の途中では切らない） */
  function icsFold(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const out = [];
    let cur = '', size = 0, limit = 75;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (size + n > limit) { out.push(cur); cur = ''; size = 0; limit = 74; }
      cur += ch; size += n;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  const RRULE = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };
  function reminderTexts(r) {
    const pet = getPet(r.petId);
    const t = reminderTypeOf(r.type);
    return { title: (pet ? pet.name + '：' : '') + (r.title || t.label), details: (r.memo ? r.memo + '\n' : '') + 'PAWCAREで登録した予定です。' };
  }
  function buildIcs(r) {
    const tx = reminderTexts(r);
    const end = toLocalInput(new Date(parseLocal(r.dueAt).getTime() + 30 * 60000));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PAWCARE//Reminder//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + r.id + '@pawcare', 'DTSTAMP:' + stamp, 'DTSTART:' + icsDate(r.dueAt), 'DTEND:' + icsDate(end),
      'SUMMARY:' + icsEscape(tx.title), 'DESCRIPTION:' + icsEscape(tx.details)];
    if (RRULE[r.repeat]) lines.push('RRULE:' + RRULE[r.repeat] + (r.endAt ? ';UNTIL=' + r.endAt.replace(/-/g, '') + 'T235959' : ''));
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(tx.title), 'TRIGGER:PT0M', 'END:VALARM');
    if (r.type === 'vaccine' || r.type === 'checkup') lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('明日：' + tx.title), 'TRIGGER:-P1D', 'END:VALARM');
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }
  function googleCalendarUrl(r) {
    const tx = reminderTexts(r);
    const end = toLocalInput(new Date(parseLocal(r.dueAt).getTime() + 30 * 60000));
    let tz = 'Asia/Tokyo';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* 既定値 */ }
    let url = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(tx.title) +
      '&dates=' + icsDate(r.dueAt) + '/' + icsDate(end) + '&ctz=' + encodeURIComponent(tz) + '&details=' + encodeURIComponent(tx.details);
    if (RRULE[r.repeat]) url += '&recur=' + encodeURIComponent('RRULE:' + RRULE[r.repeat] + (r.endAt ? ';UNTIL=' + r.endAt.replace(/-/g, '') + 'T235959' : ''));
    return url;
  }
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function addToCalendar(r) {
    openSheet('カレンダーに登録', '<p>「' + esc(reminderTexts(r).title) + '」をスマホのカレンダーに登録します。時刻になるとカレンダーから通知が届きます。</p>' +
      '<div class="form-actions"><button type="button" class="btn primary block" data-action="downloadIcs" data-id="' + esc(r.id) + '">' + (isIOS() ? 'iPhoneのカレンダーに追加' : 'カレンダーファイル（.ics）で追加') + '</button>' +
      '<a class="btn ghost block" target="_blank" rel="noopener" href="' + esc(googleCalendarUrl(r)) + '">Googleカレンダーに追加</a></div>' +
      '<p class="muted small">Googleカレンダーを選ぶと、ペット名・予定名・メモがGoogleに送信されます。</p>' +
      '<p class="muted small">予定の日時を変更した場合は、カレンダー側の予定も手動で更新してください。</p>');
  }
  function downloadIcs(r) {
    const ics = buildIcs(r);
    if (isIOS()) {
      /* iOS Safari は text/calendar を開くと「カレンダーに追加」画面になる */
      location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
      return;
    }
    download('pawcare-' + r.id + '.ics', ics, 'text/calendar;charset=utf-8');
  }

  /* ============================================================
   * 病院への共有（リンク・QRコード）
   * データはURLの「#」以降に入れるため、PAWCAREやGitHubのサーバーには送信されない
   * ============================================================ */
  const QR_MAX = 1800;
  function b64urlEncode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function encodePayload(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (window.CompressionStream) {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
        return 'z' + b64urlEncode(new Uint8Array(await new Response(stream).arrayBuffer()));
      } catch (e) { /* 非圧縮にフォールバック */ }
    }
    return 'j' + b64urlEncode(bytes);
  }
  async function decodePayload(s) {
    const kind = s.charAt(0);
    let bytes = b64urlDecode(s.slice(1));
    if (kind === 'z') {
      if (!window.DecompressionStream) throw new Error('unsupported');
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (kind !== 'j') throw new Error('format');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function qrSvg(text) {
    if (!window.PawQR || text.length > QR_MAX) return '';
    const qr = new window.PawQR.QRCode(-1, window.PawQR.L);
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount(), q = 4, size = n + q * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    return '<svg class="qr" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="共有リンクのQRコード" shape-rendering="crispEdges"><rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  function latestMemoFor(petId) {
    const list = db.memos.filter((m) => m.petId === petId);
    return list.length ? list[list.length - 1] : null;
  }
  let pendingShareMemo = null;
  function openShareSheet(petId, memoText) {
    if (!db.pets.length) return openPetForm({});
    pendingShareMemo = memoText || null;
    const pid = getPet(petId) ? petId : activePet().id;
    const latest = latestMemoFor(pid);
    const memoLabel = memoText ? '今作成した問診メモ' : latest ? '最新の問診メモ（' + fmtDateTime(latest.createdAt) + '）' : '';
    openSheet('病院に情報を見せる', '<form data-form="share">' +
      '<label>ペット<select name="petId" data-change="sharePet">' + optionsHtml(db.pets.map((p) => ({ id: p.id, label: p.name })), pid) + '</select></label>' +
      '<label class="check share-memo"' + (memoLabel ? '' : ' hidden') + '><input type="checkbox" name="memo" checked> <span>' + esc(memoLabel) + 'を含める</span></label>' +
      '<label>健康記録<select name="range">' + optionsHtml(D.SHARE_RANGES, '3') + '</select></label>' +
      '<label class="check"><input type="checkbox" name="cardInfo" checked> <span>もしもカードの内容（持病・アレルギー・服用中の薬）を含める</span></label>' +
      '<label class="check"><input type="checkbox" name="lifeFood" checked> <span>暮らし（室内・同居動物・最近の変化）と食べているもの</span></label>' +
      '<label class="check"><input type="checkbox" name="prevVisit" checked> <span>前回の受診（30日以内）を含める</span></label>' +
      '<label>リンクの有効期間（目安）<select name="expiry">' + optionsHtml(D.SHARE_EXPIRY, '3') + '</select></label>' +
      '<div class="alert warn"><strong>共有する前にご確認ください</strong><ul><li>リンクを知っている人は誰でも内容を見られます。病院以外には送らないでください。</li><li>データはリンクの中に入っていて、PAWCAREのサーバーには保存されません。</li><li>リンク自体に情報が入っているため、LINE・メール等で送るとその送信履歴や相手の端末の閲覧履歴にも情報が残ります。</li><li>有効期限は画面表示の目安です。期限後もリンク内のデータは消えず、技術的には読み取れます。送ったリンクは取り消せません。</li></ul></div>' +
      '<div class="form-actions"><button type="submit" class="btn primary block">リンクとQRコードを作る</button></div></form>');
  }
  async function createShare(form) {
    const f = new FormData(form);
    const pet = getPet(f.get('petId'));
    if (!pet) return;
    const days = +f.get('range') || 0;
    const hours = (+f.get('expiry') || 3) * 24;
    let memo = '';
    let q = null;
    if (f.get('memo') && !form.querySelector('.share-memo').hidden) {
      const own = pendingShareMemo && pet.id === (iv && iv.a.petId);
      const lm = latestMemoFor(pet.id) || {};
      memo = (own ? pendingShareMemo : lm.text) || '';
      const a = own ? iv.a : lm.answers;
      if (a) q = { sy: a.symptoms || [], so: a.symptomOther || '', on: a.onset || '', od: a.onsetDetail || '', fr: a.frequency || '', du: a.duration || '', ap: a.appetite || '', wa: a.water || '', en: a.energy || '', br: a.breathing || '' };
    }
    const logs = days ? recentLogs(pet.id, days * 24).slice(0, 120).map((l) => [l.datetime, l.category, l.value || '', ((l.ingest ? ingestSummary(l) + (l.memo ? '／' : '') : '') + (l.memo || '')).slice(0, 200)]) : [];
    let cardText = '';
    if (f.get('cardInfo')) {
      const c = cardData(pet);
      cardText = ['持病：' + c.conditions.text, 'アレルギー：' + c.allergies.text, '薬：' + c.meds.text].join('\n');
    }
    const lf = f.get('lifeFood') ? { l: lifeText(pet), f: foodsText(pet) } : null;
    let pv = null;
    if (f.get('prevVisit')) {
      const since = toLocalInput(new Date(Date.now() - 30 * 86400000)).slice(0, 10);
      const v = db.visits.filter((x) => x.petId === pet.id && x.date >= since).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      if (v) pv = { d: v.date, h: visitHospitalName(v), r: v.reason, s: v.vetSaid, m: (v.meds || []).map((m) => m.name + (m.days ? ' ' + m.days + '日分' : '')) };
    }
    const payload = {
      v: 1, c: nowLocal(), x: Date.now() + hours * 3600000,
      p: { n: pet.name, s: pet.species, b: pet.breed, bd: pet.birthday, sx: pet.sex, w: pet.weight, m: cardText },
      memo: memo, q: q, pv: pv, lf: lf, d: days, l: logs
    };
    const data = await encodePayload(payload);
    const url = location.origin + location.pathname + '#/view/' + data;
    const qr = qrSvg(url);
    $sheetTitle.textContent = '共有リンクができました';
    $sheetBody.innerHTML = '<div class="share-result">' +
      (qr ? '<div class="qr-wrap">' + qr + '<p class="muted small">病院の受付でこのQRコードを読み取ってもらえます。</p></div>' : '<p class="alert warn">記録が多いためQRコードは作れません。下のボタンからリンクを送ってください（記録の期間を短くするとQRコードを作れます）。</p>') +
      '<label>共有リンク<input class="share-url" readonly value="' + esc(url) + '"></label>' +
      '<div class="form-actions"><button type="button" class="btn primary block" data-action="copyShareUrl">リンクをコピー</button>' +
      (navigator.share ? '<button type="button" class="btn ghost block" data-action="shareShareUrl">LINE・メールで送る</button>' : '') +
      '<a class="btn ghost block" href="' + esc(url) + '" target="_blank" rel="noopener">病院側の表示を確認する</a></div>' +
      '<p class="muted small">有効期限の目安：' + esc(fmtDateTime(toLocalInput(new Date(payload.x)))) + 'まで</p></div>';
  }

  let sharedCache = { key: null, data: null, error: null };
  function renderSharedView() {
    const key = location.hash.replace(/^#\/view\//, '');
    if (sharedCache.key !== key) {
      sharedCache = { key: key, data: null, error: null };
      decodePayload(key).then((d) => { sharedCache.data = sanitizeShared(d); if (!sharedCache.data) throw new Error('format'); }).catch((e) => { sharedCache.error = e; }).then(() => { if (currentView === 'view') render(); });
      return '<p class="loading">読み込み中…</p>';
    }
    if (sharedCache.error) {
      return '<section class="card"><h1>共有された情報を表示できません</h1><p>' + (sharedCache.error.message === 'unsupported' ? 'このブラウザは古いため表示できません。最新のChromeまたはSafariで開いてください。' : 'リンクが途中で切れている可能性があります。送ってくれた方に、もう一度リンクを送ってもらってください。') + '</p></section>';
    }
    const s = sharedCache.data;
    if (!s) return '<p class="loading">読み込み中…</p>';
    if (Date.now() > s.x) {
      return '<section class="card"><h1>このリンクは有効期限が切れています</h1><p class="muted">飼い主様に、PAWCAREから新しい共有リンクを作成してもらってください。</p></section>';
    }
    const p = s.p || {};
    const pet = { name: p.n, species: p.s, breed: p.b, birthday: p.bd, sex: p.sx, weight: p.w, memo: p.m };
    let html = '<section class="card shared-head"><p class="tag">受診用サマリー</p><h1>' + speciesOf(pet.species).emoji + ' ' + esc(pet.name) + '</h1>' +
      '<p class="muted small">作成：' + esc(fmtDateTime(s.c)) + '／表示期限：' + esc(fmtDateTime(toLocalInput(new Date(s.x)))) + '</p>' +
      '<p class="disclaimer">飼い主が PAWCARE に入力した情報です。診断や医学的な判断を含むものではなく、内容の正確性は PAWCARE では確認していません。</p></section>';
    html += keyPointsHtml(s, pet);
    html += '<section class="card"><h2>ペット情報</h2><dl class="pet-dl">' +
      '<dt>種類</dt><dd>' + esc(speciesOf(pet.species).label + (pet.breed ? '・' + pet.breed : '')) + '</dd>' +
      '<dt>年齢</dt><dd>' + (pet.birthday ? esc(ageText(pet.birthday)) + '（' + esc(pet.birthday.replace(/-/g, '/')) + '生）' : '未登録') + '</dd>' +
      '<dt>性別</dt><dd>' + esc(sexLabel(pet.sex) || '未登録') + '</dd>' +
      '<dt>体重</dt><dd>' + (pet.weight ? esc(pet.weight) + ' kg' : '未登録') + '</dd>' +
      (pet.memo ? '<dt>メモ</dt><dd class="pre">' + esc(pet.memo) + '</dd>' : '') + '</dl></section>';
    if (s.memo) html += '<section class="card"><h2>問診メモ</h2><pre class="memo">' + esc(s.memo) + '</pre></section>';
    if (s.d) {
      const logs = (s.l || []).map((a, i) => ({ id: 's' + i, petId: '', datetime: a[0], category: a[1], value: a[2], memo: a[3] }));
      html += '<section class="card"><h2>健康記録（直近' + (s.d === 1 ? '24時間' : s.d + '日間') + '）</h2>' + sharedLogsHtml(logs) + '</section>';
    }
    html += '<div class="form-actions no-print"><button type="button" class="btn ghost block" data-action="printView">印刷する</button></div>';
    return html;
  }
  /* 受診用サマリーの1画面目：獣医師が30秒で読める要点 */
  function keyPointsHtml(s, pet) {
    const rows = [];
    const sp = speciesOf(pet.species);
    rows.push(['動物', [sp.label + (pet.breed ? '（' + pet.breed + '）' : ''), pet.birthday ? ageText(pet.birthday) : '', sexLabel(pet.sex), pet.weight ? pet.weight + 'kg' : ''].filter(Boolean).join('・')]);
    const q = s.q;
    if (q) {
      const sy = q.sy.join('、') + (q.so ? (q.sy.length ? '／' : '') + q.so : '');
      if (sy) rows.push(['主な症状', sy]);
      if (q.on) rows.push(['いつから', q.on + (q.od ? '（' + q.od + '）' : '')]);
      if (q.fr) rows.push(['回数', q.fr + (q.du ? '（' + q.du + '）' : '')]);
      if (q.ap || q.wa) rows.push(['食欲・飲水', (q.ap || '未回答') + '／' + (q.wa || '未回答')]);
      if (q.en || q.br) rows.push(['元気・呼吸', (q.en || '未回答') + '／' + (q.br || '未回答')]);
    }
    if (s.d && s.l.length) {
      const since = toLocalInput(new Date(Date.now() - 24 * 3600 * 1000));
      const cw = countsWithLast(s.l.filter((a) => a[0] >= since).map((a) => ({ datetime: a[0], category: a[1] })));
      const keys = ['ingest', 'vomit', 'regurgitate', 'stool', 'urine', 'food', 'water'].filter((k) => cw[k]);
      const firstAbn = s.l.filter((a) => ['vomit', 'regurgitate', 'ingest'].indexOf(a[1]) >= 0 || (a[1] === 'stool' && /下痢|軟便|血/.test(a[3]))).sort((x, y) => (x[0] < y[0] ? -1 : 1))[0];
      if (firstAbn) rows.push(['最初の症状', fmtShort(firstAbn[0]) + ' ' + categoryOf(firstAbn[1]).label + '（共有した期間内）']);
      if (keys.length) rows.push(['24時間の記録', keys.map((k) => categoryOf(k).label + ' ' + cw[k].n + '回（最後 ' + fmtShort(cw[k].last) + '）').join('・')]);
      const ws = s.l.filter((a) => a[1] === 'weight' && a[2]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
      if (ws.length >= 2) rows.push(['体重の変化', ws[0][2] + 'kg（' + fmtShort(ws[0][0]).split(' ')[0] + '）→ ' + ws[ws.length - 1][2] + 'kg（' + fmtShort(ws[ws.length - 1][0]).split(' ')[0] + '）']);
    }
    if (pet.memo) rows.push(['持病・アレルギー・薬', pet.memo]);
    if (s.lf && s.lf.f) rows.push(['食べているもの', s.lf.f]);
    if (s.lf && s.lf.l) rows.push(['暮らし', s.lf.l]);
    if (s.pv && s.pv.d) rows.push(['前回の受診', fmtShort(s.pv.d + 'T00:00').split(' ')[0] + ' ' + s.pv.h + (s.pv.r ? '／理由：' + s.pv.r : '') + (s.pv.s ? '／先生に言われたこと：' + s.pv.s : '') + (s.pv.m.length ? '／処方：' + s.pv.m.join('、') : '') + '（飼い主の記録）']);
    return '<section class="card key-points"><h2>要点</h2><dl class="kp-dl">' + rows.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl>' +
      (q ? '' : '<p class="muted small">問診メモが含まれていないため、症状の要点は表示していません。</p>') + '</section>';
  }

  /* リンクの中身は第三者が改ざんできるため、型と値を検証してから使う */
  function sanitizeShared(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const str = (v, max) => (typeof v === 'string' ? v.slice(0, max || 2000) : '');
    const num = (v) => (/^\d{1,3}(\.\d{1,2})?$/.test(String(v)) ? String(v) : '');
    const dt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const p = raw.p && typeof raw.p === 'object' ? raw.p : {};
    const bd = str(p.bd, 10);
    const logs = Array.isArray(raw.l) ? raw.l.filter((a) => Array.isArray(a) && dt.test(String(a[0]))).slice(0, 500) : [];
    return {
      c: dt.test(String(raw.c)) ? raw.c : '',
      x: Number.isFinite(raw.x) ? raw.x : 0,
      p: { n: str(p.n, 60) || '（名前なし）', s: str(p.s, 20), b: str(p.b, 60), bd: /^\d{4}-\d{2}-\d{2}$/.test(bd) ? bd : '', sx: str(p.sx, 20), w: num(p.w), m: str(p.m, 1000) },
      memo: str(raw.memo, 6000),
      q: raw.q && typeof raw.q === 'object' ? {
        sy: Array.isArray(raw.q.sy) ? raw.q.sy.filter((x) => typeof x === 'string').slice(0, 30).map((x) => x.slice(0, 40)) : [],
        so: str(raw.q.so, 500), on: str(raw.q.on, 40), od: str(raw.q.od, 200), fr: str(raw.q.fr, 40), du: str(raw.q.du, 200),
        ap: str(raw.q.ap, 40), wa: str(raw.q.wa, 40), en: str(raw.q.en, 60), br: str(raw.q.br, 60)
      } : null,
      lf: raw.lf && typeof raw.lf === 'object' ? { l: str(raw.lf.l, 400), f: str(raw.lf.f, 600) } : null,
      pv: raw.pv && typeof raw.pv === 'object' ? { d: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.pv.d)) ? raw.pv.d : '', h: str(raw.pv.h, 60), r: str(raw.pv.r, 200), s: str(raw.pv.s, 1000), m: Array.isArray(raw.pv.m) ? raw.pv.m.filter((x) => typeof x === 'string').slice(0, 20).map((x) => x.slice(0, 80)) : [] } : null,
      d: [1, 3, 7, 30].indexOf(+raw.d) >= 0 ? +raw.d : 0,
      l: logs.map((a) => [String(a[0]), str(a[1], 20), num(a[2]), str(a[3], 200)])
    };
  }
  /* 獣医師が一目で分かるよう、日ごとに「嘔吐 2回・ごはん 3回」の形で要約する */
  function dailySummaryHtml(logs) {
    const days = {};
    logs.forEach((l) => {
      const d = l.datetime.slice(0, 10);
      const day = days[d] || (days[d] = {});
      const e = day[l.category] || (day[l.category] = { n: 0, w: '' });
      e.n += 1;
      if (l.value) e.w = l.value;
    });
    const order = ['ingest', 'vomit', 'regurgitate', 'stool', 'urine', 'food', 'water', 'medicine', 'weight', 'walk', 'other'];
    return '<ul class="day-summary">' + Object.keys(days).sort().reverse().map((d) => {
      const parts = order.filter((c) => days[d][c]).map((c) => {
        const e = days[d][c];
        const cat = categoryOf(c);
        return '<span class="ds-item' + (['ingest', 'vomit'].indexOf(c) >= 0 ? ' ds-alert' : '') + '">' + cat.emoji + ' ' + esc(cat.label) + ' ' + (c === 'weight' && e.w ? esc(e.w) + 'kg' : e.n + '回') + '</span>';
      });
      return '<li><strong>' + esc(fmtDateHeading(d)) + '</strong><div>' + parts.join('') + '</div></li>';
    }).join('') + '</ul>';
  }
  function sharedLogsHtml(logs) {
    if (!logs.length) return '<p class="empty">この期間の記録はありません。</p>';
    return dailySummaryHtml(logs) + '<details class="ds-details"><summary>すべての記録（時刻・メモ）を見る</summary>' + sharedTableHtml(logs) + '</details>';
  }
  function sharedTableHtml(logs) {
    let html = '<table class="shared-table"><thead><tr><th>日時</th><th>内容</th><th>メモ</th></tr></thead><tbody>';
    logsSorted(logs).forEach((l) => {
      const c = categoryOf(l.category);
      html += '<tr><td>' + esc(fmtShort(l.datetime)) + '</td><td>' + c.emoji + ' ' + esc(c.label) + (l.value ? ' ' + esc(l.value) + 'kg' : '') + '</td><td>' + esc(l.memo) + '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  /* ============================================================
   * ごはんチェック（栄養の目安。AIなし・無料版）
   * 一般的な基準での計算だけを行い、診断・治療・療法食の指示はしない
   * ============================================================ */
  const NU = D.NUTRITION;
  function monthsOld(pet) {
    const b = parseLocal(pet.birthday);
    if (!b) return null;
    const n = new Date();
    return (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth()) - (n.getDate() < b.getDate() ? 1 : 0);
  }
  function foodTypeLabel(id) { const t = NU.foodTypes.find((x) => x.id === id); return t ? t.label : ''; }
  function foodKcal(f) { return f.kcal && f.grams ? (+f.kcal) * (+f.grams) / 100 : 0; }
  function round(n, d) { const m = Math.pow(10, d || 0); return Math.round(n * m) / m; }

  function nutritionAnalysis(pet) {
    const nu = pet.nutri || {};
    if (pet.species !== 'dog' && pet.species !== 'cat') return { stop: '今のところ、ごはんチェックは犬・猫のみに対応しています。' };
    if (nu.restricted) return { stop: '療法食を食べている子や、持病で食事の指示を受けている子は、このチェックの対象外です。かかりつけの先生の指示に従ってください。' };
    if (nu.pregnant) return { stop: '妊娠中・授乳中は必要な栄養とカロリーが大きく変わるため、このチェックの対象外です。かかりつけの先生に相談してください。' };
    const foods = db.foods.filter((f) => f.petId === pet.id);
    const months = monthsOld(pet);
    const growth = months !== null && months < 12;
    const res = { foods: foods, growth: growth, findings: [], suggestions: [], need: null, total: 0 };
    if (!foods.length) return res;
    const sum = (types) => foods.filter((f) => types.indexOf(f.type) >= 0).reduce((a, f) => a + foodKcal(f), 0);
    res.total = sum(['complete', 'general', 'treat', 'homemade']);
    const complete = sum(['complete']);
    const extras = sum(['treat', 'homemade']);
    const homemade = sum(['homemade']);
    const missingKcal = foods.filter((f) => !f.kcal || !f.grams);
    if (missingKcal.length) res.findings.push({ level: 'info', text: 'カロリーか量が未入力の食品があります（' + missingKcal.map((f) => f.name).join('、') + '）。合計にはふくまれていません。' });

    if (pet.weight && !growth) {
      const rer = 70 * Math.pow(+pet.weight, 0.75);
      const intact = pet.sex === 'male' || pet.sex === 'female';
      const factor = NU.factor[pet.species][intact ? 'intact' : 'neutered'];
      res.need = Math.round(rer * factor);
      if (res.total) {
        const r = res.total / res.need;
        if (r < 0.8) res.findings.push({ level: 'warn', text: '1日の合計 約' + Math.round(res.total) + 'kcal は、目安（約' + res.need + 'kcal）より少なめです。体重が減っていないか記録で確認し、気になるときは先生に相談してください。' });
        else if (r > 1.2) res.findings.push({ level: 'warn', text: '1日の合計 約' + Math.round(res.total) + 'kcal は、目安（約' + res.need + 'kcal）より多めです。体重が増えていないか記録で確認し、量を変えるときは先生に相談してください。' });
        else res.findings.push({ level: 'ok', text: '1日の合計 約' + Math.round(res.total) + 'kcal で、目安（約' + res.need + 'kcal）の範囲です。' });
      }
    } else if (growth) {
      res.findings.push({ level: 'info', text: '1歳未満の成長期は必要なカロリーが大きく変わるため、量の目安は表示しません。フードの給与量表と先生の指示を目安にしてください。' });
    } else {
      res.findings.push({ level: 'info', text: 'ペット情報に体重を登録すると、1日の目安カロリーを計算できます。' });
    }

    if (!foods.some((f) => f.type === 'complete')) {
      res.findings.push({ level: 'warn', text: '「総合栄養食」が入っていません。一般食・おやつ・手作りだけでは、栄養が偏るおそれがあります。' });
      res.suggestions.push('主食に、年齢に合った「総合栄養食」（パッケージにそう書かれたフード）を使う');
    } else if (res.total && complete / res.total < 0.9) {
      res.findings.push({ level: 'info', text: '総合栄養食以外が1日のカロリーの約' + Math.round((1 - complete / res.total) * 100) + '%をしめています。' });
    }
    if (res.total && extras / res.total > NU.treatLimit) {
      res.findings.push({ level: 'warn', text: 'おやつ・人の食べ物が1日のカロリーの約' + Math.round(extras / res.total * 100) + '%です。一般的な目安は10%までです。' });
    }
    if (res.total && homemade / res.total >= 0.5) {
      res.findings.push({ level: 'warn', text: '手作り・人の食べ物が中心の食事は、カルシウムなどのミネラルやビタミンが不足しやすいとされます' + (pet.species === 'cat' ? '（猫は必須のタウリンも不足しやすい）' : '') + '。サプリメントで補う前に、先生にレシピを見てもらってください。' });
    }

    const prof = NU.aafco[pet.species][growth ? 'growth' : 'adult'];
    let proteinLow = false;
    foods.filter((f) => f.type === 'complete' && f.moisture !== '' && f.moisture != null && +f.moisture < 100).forEach((f) => {
      const dm = 100 - (+f.moisture);
      [['protein', '粗たんぱく質'], ['fat', '粗脂肪']].forEach(([k, label]) => {
        if (f[k] === '' || f[k] == null) return;
        const v = round(+f[k] / dm * 100, 1);
        if (v < prof[k]) {
          if (k === 'protein') proteinLow = true;
          res.findings.push({ level: 'warn', text: f.name + 'の' + label + '（水分を除いた量 ' + v + '%）が、AAFCOの' + (growth ? '成長期' : '成犬・成猫') + '向けの最低値（' + prof[k] + '%）を下回って見えます。表示の読み取り違いがないか確認し、主食として合っているか先生に相談してください。' });
        } else {
          res.findings.push({ level: 'ok', text: f.name + 'の' + label + 'は、水分を除いて ' + v + '%（AAFCOの最低値 ' + prof[k] + '% 以上）です。' });
        }
      });
    });
    const allergyChicken = /鶏/.test(pet.memo || '') && /アレルギー/.test(pet.memo || '');
    if (proteinLow) {
      res.suggestions.push(allergyChicken
        ? 'たんぱく質を足す食品は、補足メモに鶏肉アレルギーの記載があるため、先生にたんぱく源を相談する'
        : '味付けをしない、加熱した鶏むね肉やささみ（皮と骨を除く）' + (pet.species === 'cat' ? '、骨を除いた加熱した白身魚' : '') + 'を少量トッピングする（おやつと合わせて1日のカロリーの10%以内）');
    }
    if (/アレルギー/.test(pet.memo || '')) res.findings.push({ level: 'info', text: '補足メモにアレルギーの記載があります。新しい食材を足す前に、先生に確認してください。' });
    return res;
  }

  function renderNutrition() {
    let html = '<h1 class="page-title">🍚 ごはんチェック</h1>';
    const pet = activePet();
    if (!pet) return html + '<section class="card"><p>ペットを登録すると使えます。</p><button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button></section>';
    html += petChips(pet.id, 'selectPet');
    html += '<p class="notice-small">パッケージの成分表示とあげている量から、一般的な基準での目安を計算します。診断や治療ではありません。</p>';
    const nu = pet.nutri || {};
    html += '<section class="card"><h2>' + esc(pet.name) + 'について</h2>' +
      '<label class="check"><input type="checkbox" data-nutri="restricted"' + (nu.restricted ? ' checked' : '') + '> 療法食を食べている、または持病で食事の指示を受けている</label>' +
      '<label class="check"><input type="checkbox" data-nutri="pregnant"' + (nu.pregnant ? ' checked' : '') + '> 妊娠中・授乳中</label></section>';
    const a = nutritionAnalysis(pet);
    if (a.stop) return html + '<div class="alert warn">' + esc(a.stop) + '</div>' + toxicCheckHtml(pet);

    html += '<section class="card"><div class="row-between"><h2>あげているもの（1日分）</h2><button type="button" class="btn primary small" data-action="newFood">＋ 追加</button></div>';
    html += a.foods.length ? '<ul class="log-list">' + a.foods.map((f) =>
      '<li><button type="button" class="log-item" data-action="editFood" data-id="' + esc(f.id) + '"><span class="log-main"><span class="log-cat">' + esc(f.name) + '</span><span class="log-memo">' + esc(foodTypeLabel(f.type)) + '・' + (f.grams ? esc(f.grams) + 'g' : '量未入力') + (foodKcal(f) ? '・約' + Math.round(foodKcal(f)) + 'kcal' : '') + '</span></span><span class="chev" aria-hidden="true">›</span></button></li>').join('') + '</ul>'
      : '<p class="empty">まだ登録されていません。主食のフード、トッピング、おやつを1日分ずつ登録してください。</p>';
    html += '</section>';

    if (a.foods.length) {
      html += '<section class="card"><h2>チェック結果</h2>' + (a.need ? '<p class="nu-need">1日の目安：<strong>約' + a.need + 'kcal</strong><small>体重' + esc(pet.weight) + 'kgからの計算。個体差があります</small></p>' : '') +
        '<ul class="nu-findings">' + a.findings.map((x) => '<li class="nu-' + x.level + '"><span aria-hidden="true">' + (x.level === 'ok' ? '✅' : x.level === 'warn' ? '⚠️' : 'ℹ️') + '</span><span>' + esc(x.text) + '</span></li>').join('') + '</ul>';
      if (a.suggestions.length) {
        html += '<p class="sub">補える食品のタイプ</p><ul class="nu-sugg">' + a.suggestions.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
          '<p class="muted small">新しい食品は少量から始め、体調の変化があればやめて先生に相談してください。</p>';
      }
      html += '<p class="disclaimer">計算の根拠：1日の目安は「70×体重(kg)の0.75乗」に一般的な係数（犬1.6〜1.8・猫1.2〜1.4）をかけた値。成分はAAFCOの栄養基準（水分を除いた量での最低値）、おやつは1日のカロリーの10%までという一般的な目安です。表示の成分値は最低保証値のため、実際の量とは異なります。</p></section>';
    }
    return html + toxicCheckHtml(pet);
  }

  function toxicCheckHtml(pet) {
    return '<section class="card"><h2>⚠️ 人の食べ物チェック</h2><p class="muted small">食べてしまった・あげようとしているものを入力すると、特に危険とされる食材に当てはまるかを確認します。</p>' +
      '<div class="toxic-row"><input id="toxicInput" maxlength="100" placeholder="例：ぶどう、玉ねぎ入りハンバーグ"><button type="button" class="btn primary small" data-action="toxicCheck">確認</button></div><div id="toxicResult"></div></section>';
  }
  function toxicCheck() {
    const pet = activePet();
    const input = document.getElementById('toxicInput');
    const out = document.getElementById('toxicResult');
    if (!input || !out) return;
    const text = input.value.trim();
    if (!text) { out.innerHTML = ''; return; }
    const sp = pet ? pet.species : 'dog';
    const hits = NU.toxic.filter((t) => (t.both || t[sp]) && t.k.some((k) => text.indexOf(k) >= 0));
    if (hits.length) {
      const h = db.settings.hospital, nt = db.settings.night;
      out.innerHTML = '<div class="alert danger"><strong>' + esc(hits.map((x) => x.name).join('、')) + 'は、' + (sp === 'cat' ? '猫' : '犬') + 'にとって特に危険とされる食材です。</strong><p>食べた・飲み込んだ可能性がある場合は、様子を見ずに今すぐ動物病院へ電話してください。何を・どれくらい・いつ食べたかを伝えられるようにしておきましょう。</p><div class="btn-row">' +
        (h.phone ? '<a class="btn danger small" href="tel:' + esc(h.phone.replace(/[^\d+]/g, '')) + '">📞 ' + esc(h.name || 'かかりつけ') + '</a>' : '') +
        (nt.phone ? '<a class="btn danger-ghost small" href="tel:' + esc(nt.phone.replace(/[^\d+]/g, '')) + '">🌙 ' + esc(nt.name || '夜間・救急') + '</a>' : '') +
        '<button type="button" class="btn danger-ghost small" data-nav="emergency">緊急時の案内</button></div>' +
        '<button type="button" class="btn danger block" data-action="recordIngest">食べてしまった → 誤食として記録して電話する</button></div>';
    } else {
      out.innerHTML = '<div class="alert warn">登録されている「特に危険な食材」には当てはまりませんでした。ただし、<strong>安全だという意味ではありません</strong>。味付け・量・体質によって体調を崩すことがあります。食べたあとに様子がおかしいときや不安なときは、動物病院に相談してください。</div>';
    }
  }

  function foodFormHtml(f) {
    return '<form data-form="food" novalidate><input type="hidden" name="id" value="' + esc(f.id || '') + '">' +
      '<label>名前<input name="name" maxlength="40" required value="' + esc(f.name || '') + '" placeholder="例：いつものドライフード"></label>' +
      '<label>種類<select name="type">' + optionsHtml(NU.foodTypes, f.type || 'complete') + '</select></label>' +
      '<label>1日にあげる量（g）<input name="grams" type="number" inputmode="decimal" step="0.1" min="0" max="5000" value="' + esc(f.grams || '') + '"></label>' +
      '<label>カロリー（100gあたり kcal）<input name="kcal" type="number" inputmode="decimal" step="0.1" min="0" max="1000" value="' + esc(f.kcal || '') + '" placeholder="パッケージの「代謝エネルギー」"></label>' +
      '<p class="sub">成分表示（パッケージの「保証成分」）</p><div class="two-col">' +
      '<label>粗たんぱく質（%）<input name="protein" type="number" inputmode="decimal" step="0.1" min="0" max="100" value="' + esc(f.protein == null ? '' : f.protein) + '"></label>' +
      '<label>粗脂肪（%）<input name="fat" type="number" inputmode="decimal" step="0.1" min="0" max="100" value="' + esc(f.fat == null ? '' : f.fat) + '"></label>' +
      '<label>水分（%）<input name="moisture" type="number" inputmode="decimal" step="0.1" min="0" max="99" value="' + esc(f.moisture == null ? '' : f.moisture) + '"></label></div>' +
      '<p class="muted small">「1kgあたり」の表示は10で割ると100gあたりになります。成分が分からない食品は空欄でかまいません。</p>' +
      '<p class="form-error" hidden></p><div class="form-actions"><button type="submit" class="btn primary block">' + (f.id ? '保存する' : '追加する') + '</button>' +
      (f.id ? '<button type="button" class="btn danger-ghost block" data-action="deleteFood" data-id="' + esc(f.id) + '">削除</button>' : '') + '</div></form>';
  }
  function saveFoodForm(form) {
    const fd = new FormData(form);
    const err = form.querySelector('.form-error');
    const pet = activePet();
    const name = String(fd.get('name') || '').trim();
    if (!pet) return;
    if (!name) return showFormError(err, '名前を入力してください。');
    const num = (k, max) => { const v = String(fd.get(k) || '').trim(); if (!v) return ''; const n = parseFloat(v); return n >= 0 && n <= max ? String(round(n, 1)) : null; };
    const data = { name: name, type: fd.get('type') || 'complete', grams: num('grams', 5000), kcal: num('kcal', 1000), protein: num('protein', 100), fat: num('fat', 100), moisture: num('moisture', 99) };
    if (Object.values(data).some((v) => v === null)) return showFormError(err, '数値の範囲を確認してください。');
    const id = fd.get('id');
    if (commit(() => {
      if (id) { const f = db.foods.find((x) => x.id === id); if (f) Object.assign(f, data); }
      else db.foods.push(Object.assign({ id: uid(), petId: pet.id }, data));
    })) { closeSheet(); toast('保存しました'); rerender(); }
  }

  /* ============================================================
   * v1.5 共通：時間の表記と、記録の回数・最後の時刻
   * ============================================================ */
  function agoText(dt) {
    const d = parseLocal(dt);
    if (!d) return '';
    const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (min < 60) return min + '分前';
    if (min < 1440) return Math.floor(min / 60) + '時間前';
    return Math.floor(min / 1440) + '日前';
  }
  function lastLog(petId, cat) {
    return logsSorted(db.logs.filter((l) => l.petId === petId && l.category === cat))[0] || null;
  }
  function quickStatText(petId, cat) {
    const last = lastLog(petId, cat);
    if (cat === 'weight') return last && last.value ? '最後 ' + last.value + 'kg（' + agoText(last.datetime) + '）' : '—';
    const weekAgo = toLocalInput(new Date(Date.now() - 7 * 86400000));
    if (!last || last.datetime < weekAgo) return '—';
    const today = db.logs.filter((l) => l.petId === petId && l.category === cat && l.datetime.slice(0, 10) === todayStr()).length;
    return '今日 ' + today + '回・最後 ' + agoText(last.datetime);
  }
  function updateQuickStats() {
    if (currentView !== 'home') return;
    const pet = activePet();
    if (!pet) return;
    document.querySelectorAll('.quick-btn[data-cat] .qs').forEach((el) => { el.textContent = quickStatText(pet.id, el.parentNode.dataset.cat); });
  }
  setInterval(updateQuickStats, 60000);

  /* 電話メモ・要点に使う「24時間の回数と最後の時刻」 */
  const KEY_CATS = ['ingest', 'vomit', 'regurgitate', 'stool', 'urine', 'food', 'water', 'medicine'];
  function countsWithLast(logs) {
    const out = {};
    logs.forEach((l) => {
      const e = out[l.category] || (out[l.category] = { n: 0, last: '' });
      e.n += 1;
      if (l.datetime > e.last) e.last = l.datetime;
    });
    return out;
  }

  /* ============================================================
   * #1 もしもカード（ペット版の緊急時カード）
   * ============================================================ */
  function activeMeds(pet) {
    const today = todayStr();
    const own = (pet.meds || []).filter((m) => !m.to || m.to >= today).map((m) => ({ name: m.name, how: m.how, src: '' }));
    const fromVisits = [];
    db.visits.filter((v) => v.petId === pet.id).forEach((v) => (v.meds || []).forEach((m) => {
      if (!m.days) return;
      const end = parseLocal(v.date); if (!end) return;
      end.setDate(end.getDate() + (+m.days) - 1);
      if (toLocalInput(end).slice(0, 10) >= today) fromVisits.push({ name: m.name, how: m.how, src: '受診記録から' });
    }));
    return own.concat(fromVisits);
  }
  const LIFE_HOUSING = [{ id: 'indoor', label: '室内のみ' }, { id: 'mostly_indoor', label: '主に室内（散歩・外出あり）' }, { id: 'outdoor', label: '屋外・庭が中心' }, { id: 'both', label: '室内と屋外を自由に行き来' }];
  function lifeText(pet) {
    const l = pet.life || {};
    const h = LIFE_HOUSING.find((x) => x.id === l.housing);
    return [h ? h.label : '', l.cohabit ? '同居：' + l.cohabit : '', l.recentChanges ? '最近の変化：' + l.recentChanges : ''].filter(Boolean).join('／');
  }
  function foodsText(pet) {
    return db.foods.filter((f) => f.petId === pet.id).map((f) => f.name + '（' + (NU.foodTypes.find((x) => x.id === f.type) || { label: '' }).label.replace(/（.*）/, '') + (f.grams ? '・' + f.grams + 'g/日' : '') + '）').join('、');
  }
  function cardField(value, none) {
    if (none) return { state: 'none', text: 'なし' };
    if (value && String(value).trim()) return { state: 'set', text: String(value).trim() };
    return { state: 'empty', text: '未入力' };
  }
  function cardData(pet) {
    const sp = speciesOf(pet.species);
    const lastW = lastLog(pet.id, 'weight');
    const meds = activeMeds(pet);
    const s = db.settings;
    return {
      name: pet.name,
      rows: [
        ['種類', sp.label + (pet.breed ? '・' + pet.breed : '')],
        ['年齢', pet.birthday ? ageText(pet.birthday) + '（' + pet.birthday.replace(/-/g, '/') + '生）' : ''],
        ['性別', sexLabel(pet.sex)],
        ['体重', pet.weight ? pet.weight + 'kg' + (lastW && lastW.value === pet.weight ? '（' + fmtShort(lastW.datetime).split(' ')[0] + '）' : '') : '']
      ],
      conditions: cardField(pet.conditions, pet.conditionsNone),
      allergies: cardField(pet.allergies, pet.allergiesNone),
      meds: pet.medsNone && !meds.length ? { state: 'none', text: 'なし' } : meds.length ? { state: 'set', text: meds.map((m) => m.name + (m.how ? '（' + m.how + '）' : '') + (m.src ? '［' + m.src + '］' : '')).join('／') } : { state: 'empty', text: '未入力' },
      life: lifeText(pet),
      microchip: pet.microchip || '',
      insurance: [pet.insurer, pet.policyNo].filter(Boolean).join(' ／ '),
      contacts: [
        ['かかりつけ', s.hospital.name, s.hospital.phone],
        ['夜間・救急', s.night.name, s.night.phone],
        ['飼い主', s.owner.name, s.owner.phone],
        ['予備の連絡先', s.backupContact.name + (s.backupContact.relation ? '（' + s.backupContact.relation + '）' : ''), s.backupContact.phone]
      ].filter((c) => c[1] || c[2])
    };
  }
  function cardHtml(c, opts) {
    const telLink = (p) => (p ? '<a class="card-tel" href="tel:' + esc(p.replace(/[^\d+]/g, '')) + '">📞 ' + esc(p) + '</a>' : '');
    const field = (label, f) => '<dt>' + esc(label) + '</dt><dd class="cf-' + f.state + '">' + esc(f.text) + '</dd>';
    return '<section class="card moshimo"><div class="moshimo-head"><span>🪪 もしもカード</span><strong>' + esc(c.name) + '</strong></div><dl class="kp-dl">' +
      c.rows.filter((r) => r[1]).map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') +
      field('持病・手術', c.conditions) + field('アレルギー', c.allergies) + field('服用中の薬', c.meds) +
      (c.life ? '<dt>暮らし</dt><dd>' + esc(c.life) + '</dd>' : '') +
      (c.microchip ? '<dt>マイクロチップ</dt><dd>' + esc(c.microchip) + '</dd>' : '') +
      (c.insurance ? '<dt>保険</dt><dd>' + esc(c.insurance) + '</dd>' : '') +
      c.contacts.map((x) => '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1] || '') + ' ' + telLink(x[2]) + '</dd>').join('') +
      '</dl><p class="disclaimer">飼い主が入力した情報です。獣医師の確認を受けたものではありません。' + (opts && opts.created ? '（作成 ' + esc(fmtDateTime(opts.created)) + '）' : '') + '</p></section>';
  }
  function renderCard() {
    const pet = activePet();
    let html = '<h1 class="page-title">🪪 もしもカード</h1>';
    if (!pet) return html + '<section class="card"><button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button></section>';
    html += petChips(pet.id, 'selectPet');
    if (pet.memo && !pet.conditions && !pet.allergies && !pet.conditionsNone && !pet.allergiesNone) {
      html += '<div class="alert warn">今の補足メモ：「' + esc(pet.memo) + '」<br>持病・アレルギー・薬の情報があれば、「編集」で下の欄に移してください。</div>';
    }
    html += cardHtml(cardData(pet), { created: nowLocal() });
    html += '<div class="form-actions no-print"><button type="button" class="btn primary block" data-action="editCard">編集</button>' +
      '<button type="button" class="btn ghost block" data-action="cardImage">画像として保存</button>' +
      '<p class="muted small">写真アプリの「お気に入り」に入れておくと、電波がないときでもすぐ見せられます。</p>' +
      '<button type="button" class="btn ghost block" data-action="printView">印刷</button>' +
      '<button type="button" class="btn ghost block" data-action="sendCard">家族・預け先に送る</button></div>';
    return html;
  }
  function cardFormHtml(pet) {
    const s = db.settings;
    const meds = (pet.meds || []);
    const medRow = (m, i) => '<div class="med-row"><input name="med_name_' + i + '" maxlength="60" placeholder="薬の名前" value="' + esc(m.name || '') + '"><input name="med_how_' + i + '" maxlength="100" placeholder="先生に言われた飲ませ方" value="' + esc(m.how || '') + '"><div class="two-col"><label class="small">開始<input type="date" name="med_from_' + i + '" value="' + esc(m.from || '') + '"></label><label class="small">終了（空欄＝続く）<input type="date" name="med_to_' + i + '" value="' + esc(m.to || '') + '"></label></div></div>';
    return '<form data-form="card" novalidate>' +
      '<label>持病・これまでの大きな病気・手術<textarea name="conditions" rows="2" maxlength="300">' + esc(pet.conditions || '') + '</textarea></label>' +
      '<label class="check"><input type="checkbox" name="conditionsNone"' + (pet.conditionsNone ? ' checked' : '') + '> なし</label>' +
      '<label>アレルギー<textarea name="allergies" rows="2" maxlength="200">' + esc(pet.allergies || '') + '</textarea></label>' +
      '<label class="check"><input type="checkbox" name="allergiesNone"' + (pet.allergiesNone ? ' checked' : '') + '> なし</label>' +
      '<p class="sub">服用中の薬</p><div class="med-rows">' + (meds.length ? meds : [{}]).map(medRow).join('') + '</div>' +
      '<button type="button" class="btn ghost small" data-action="addMedRow">＋ 薬を追加</button>' +
      '<label class="check"><input type="checkbox" name="medsNone"' + (pet.medsNone ? ' checked' : '') + '> なし</label>' +
      '<p class="sub">暮らし（病院に伝えると役立つこと）</p>' +
      '<label>住んでいるところ<select name="housing">' + optionsHtml(LIFE_HOUSING, (pet.life || {}).housing || '', '選択') + '</select></label>' +
      '<label>一緒に暮らす動物<input name="cohabit" maxlength="100" value="' + esc((pet.life || {}).cohabit || '') + '" placeholder="例：猫1匹、なし"></label>' +
      '<label>最近の変化<input name="recentChanges" maxlength="200" value="' + esc((pet.life || {}).recentChanges || '') + '" placeholder="例：先週フードを変えた、引っ越し、来客が多い"></label>' +
      '<label>マイクロチップ番号（15桁）<input name="microchip" inputmode="numeric" maxlength="15" value="' + esc(pet.microchip || '') + '"></label>' +
      '<div class="two-col"><label>保険会社<input name="insurer" maxlength="60" value="' + esc(pet.insurer || '') + '"></label><label>証券番号<input name="policyNo" maxlength="40" value="' + esc(pet.policyNo || '') + '"></label></div>' +
      '<p class="sub">連絡先（すべてのペット共通）</p>' +
      '<div class="two-col"><label>飼い主の名前<input name="ownerName" maxlength="40" value="' + esc(s.owner.name) + '"></label><label>飼い主の電話<input name="ownerPhone" type="tel" maxlength="20" value="' + esc(s.owner.phone) + '"></label></div>' +
      '<div class="two-col"><label>予備の連絡先（名前）<input name="bkName" maxlength="40" value="' + esc(s.backupContact.name) + '"></label><label>続柄など<input name="bkRelation" maxlength="20" value="' + esc(s.backupContact.relation) + '"></label></div>' +
      '<label>予備の連絡先（電話）<input name="bkPhone" type="tel" maxlength="20" value="' + esc(s.backupContact.phone) + '"></label>' +
      '<p class="form-error" hidden></p><div class="form-actions"><button type="submit" class="btn primary block">保存する</button></div></form>';
  }
  function saveCardForm(form) {
    const f = new FormData(form);
    const err = form.querySelector('.form-error');
    const pet = activePet();
    if (!pet) return;
    const chip = String(f.get('microchip') || '').trim();
    if (chip && !/^\d{15}$/.test(chip)) return showFormError(err, 'マイクロチップ番号は数字15桁で入力してください。');
    const phoneOk = (p) => !p || /^[\d+\-() ]{3,20}$/.test(p);
    const op = String(f.get('ownerPhone') || '').trim(), bp = String(f.get('bkPhone') || '').trim();
    if (!phoneOk(op) || !phoneOk(bp)) return showFormError(err, '電話番号は数字とハイフンで入力してください。');
    const meds = [];
    for (let i = 0; i < 30; i++) {
      if (!form.querySelector('[name=med_name_' + i + ']')) break;
      const name = String(f.get('med_name_' + i) || '').trim();
      if (!name) continue;
      meds.push({ id: uid(), name: name.slice(0, 60), how: String(f.get('med_how_' + i) || '').trim().slice(0, 100), from: String(f.get('med_from_' + i) || ''), to: String(f.get('med_to_' + i) || '') });
    }
    const t = (k, max) => String(f.get(k) || '').trim().slice(0, max);
    if (commit(() => {
      Object.assign(pet, {
        conditions: t('conditions', 300), conditionsNone: !!f.get('conditionsNone'),
        allergies: t('allergies', 200), allergiesNone: !!f.get('allergiesNone'),
        meds: meds, medsNone: !!f.get('medsNone'), microchip: chip, insurer: t('insurer', 60), policyNo: t('policyNo', 40),
        life: { housing: LIFE_HOUSING.some((x) => x.id === f.get('housing')) ? f.get('housing') : '', cohabit: t('cohabit', 100), recentChanges: t('recentChanges', 200) }
      });
      db.settings.owner = { name: t('ownerName', 40), phone: op };
      db.settings.backupContact = { name: t('bkName', 40), relation: t('bkRelation', 20), phone: bp };
    })) { closeSheet(); toast('もしもカードを保存しました'); rerender(); }
  }
  function cardDone(pet) {
    const has = (v, n) => n || (v && String(v).trim());
    return !!(has(pet.conditions, pet.conditionsNone) && has(pet.allergies, pet.allergiesNone) && (pet.medsNone || activeMeds(pet).length));
  }
  /* カードを画像にする（canvasに描いてPNG） */
  async function cardImage() {
    const pet = activePet();
    if (!pet) return;
    const c = cardData(pet);
    const lines = [['🪪 もしもカード', ''], [c.name, '']];
    c.rows.filter((r) => r[1]).forEach((r) => lines.push([r[0], r[1]]));
    lines.push(['持病・手術', c.conditions.text], ['アレルギー', c.allergies.text], ['服用中の薬', c.meds.text]);
    if (c.microchip) lines.push(['マイクロチップ', c.microchip]);
    if (c.insurance) lines.push(['保険', c.insurance]);
    c.contacts.forEach((x) => lines.push([x[0], (x[1] || '') + ' ' + (x[2] || '')]));
    const W = 1080, pad = 60, lh = 54;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const font = (size, bold) => (bold ? 'bold ' : '') + size + 'px "Hiragino Sans","Noto Sans JP",sans-serif';
    const wrap = (text, maxW) => {
      ctx.font = font(34);
      const out = []; let cur = '';
      for (const ch of String(text)) { if (ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch; }
      if (cur) out.push(cur);
      return out.length ? out : [''];
    };
    const body = [];
    lines.slice(2).forEach((l) => body.push([l[0], wrap(l[1], W - pad * 2 - 260)]));
    const H = 220 + body.reduce((a, b) => a + b[1].length * lh + 12, 0) + 120;
    cv.width = W; cv.height = H;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f7a68'; ctx.fillRect(0, 0, W, 150);
    ctx.fillStyle = '#ffffff'; ctx.font = font(34, true); ctx.fillText('もしもカード（PAWCARE）', pad, 62);
    ctx.font = font(52, true); ctx.fillText(c.name, pad, 125);
    let y = 210;
    body.forEach(([label, ls]) => {
      ctx.fillStyle = '#64746f'; ctx.font = font(30, true); ctx.fillText(label, pad, y);
      ctx.fillStyle = '#1d2b28'; ctx.font = font(34);
      ls.forEach((t, i) => ctx.fillText(t, pad + 260, y + i * lh));
      y += ls.length * lh + 12;
    });
    ctx.fillStyle = '#64746f'; ctx.font = font(24);
    ctx.fillText('飼い主が入力した情報です。獣医師の確認を受けたものではありません。 ' + fmtDateTime(nowLocal()), pad, H - 50);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) { toast('画像を作れませんでした'); return; }
    const file = new File([blob], 'pawcare-card-' + pet.name + '.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'もしもカード' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('画像を保存しました');
  }
  function cardPayloadOf(pet) {
    const c = cardData(pet);
    return { v: 1, t: 'card', c: nowLocal(), name: c.name, rows: c.rows.filter((r) => r[1]), cd: c.conditions, al: c.allergies, md: c.meds, lf: c.life, mc: c.microchip, ins: c.insurance, ct: c.contacts };
  }
  function openSendCard() {
    const pet = activePet();
    if (!pet) return;
    openSheet('もしもカードを送る', '<form data-form="sendcard"><label>リンクの有効期間（目安）<select name="expiry"><option value="7">7日間</option><option value="30">30日間</option></select></label>' +
      '<div class="alert warn"><ul><li>リンクを知っている人は誰でも内容を見られます。家族や預け先以外には送らないでください。</li><li>データはリンクの中に入っていて、PAWCAREのサーバーには保存されません。送ったリンクは取り消せません。</li></ul></div>' +
      '<div class="form-actions"><button type="submit" class="btn primary block">リンクを作る</button></div></form>');
  }
  async function createCardLink(form) {
    const pet = activePet();
    const days = +new FormData(form).get('expiry') || 7;
    const payload = Object.assign(cardPayloadOf(pet), { x: Date.now() + days * 86400000, pet: petExport(pet) });
    const url = location.origin + location.pathname + '#/card/' + await encodePayload(payload);
    showLinkResult('もしもカードのリンクができました', url, pet.name + 'のもしもカード');
  }
  function showLinkResult(title, url, shareTitle) {
    $sheetTitle.textContent = title;
    $sheetBody.innerHTML = '<label>リンク<input class="share-url" readonly value="' + esc(url) + '"></label><div class="form-actions"><button type="button" class="btn primary block" data-action="copyShareUrl">リンクをコピー</button>' +
      (navigator.share ? '<button type="button" class="btn ghost block" data-action="shareLinkAs" data-title="' + esc(shareTitle) + '">LINE・メールで送る</button>' : '') + '</div>';
  }
  function petExport(pet) {
    return { id: pet.id, name: pet.name, species: pet.species, breed: pet.breed, birthday: pet.birthday, sex: pet.sex, weight: pet.weight,
      conditions: pet.conditions || '', conditionsNone: !!pet.conditionsNone, allergies: pet.allergies || '', allergiesNone: !!pet.allergiesNone,
      meds: (pet.meds || []).map((m) => ({ name: m.name, how: m.how, from: m.from, to: m.to })), medsNone: !!pet.medsNone };
  }

  /* 受け取ったリンクの検証（改ざんを前提に型と長さを確認） */
  const S = {
    str: (v, max) => (typeof v === 'string' ? v.slice(0, max || 2000) : ''),
    dt: (v) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(v)) ? String(v) : ''),
    date: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : ''),
    num: (v) => (/^\d{1,3}(\.\d{1,2})?$/.test(String(v)) ? String(v) : ''),
    field: (f) => (f && typeof f === 'object' && ['set', 'none', 'empty'].indexOf(f.state) >= 0 ? { state: f.state, text: S.str(f.text, 600) } : { state: 'empty', text: '未入力' }),
    pet: (p) => {
      p = p && typeof p === 'object' ? p : {};
      return { id: S.str(p.id, 40).replace(/[^\w-]/g, ''), name: S.str(p.name, 30) || '（名前なし）', species: D.SPECIES.some((x) => x.id === p.species) ? p.species : 'other', breed: S.str(p.breed, 60), birthday: S.date(p.birthday), sex: D.SEXES.some((x) => x.id === p.sex) ? p.sex : '', weight: S.num(p.weight),
        conditions: S.str(p.conditions, 300), conditionsNone: p.conditionsNone === true, allergies: S.str(p.allergies, 200), allergiesNone: p.allergiesNone === true,
        meds: Array.isArray(p.meds) ? p.meds.slice(0, 20).map((m) => ({ id: uid(), name: S.str(m && m.name, 60), how: S.str(m && m.how, 100), from: S.date(m && m.from), to: S.date(m && m.to) })).filter((m) => m.name) : [], medsNone: p.medsNone === true };
    }
  };
  function sanitizeCard(raw) {
    if (!raw || typeof raw !== 'object' || raw.t !== 'card') return null;
    return {
      c: S.dt(raw.c), x: Number.isFinite(raw.x) ? raw.x : 0, name: S.str(raw.name, 30) || '（名前なし）',
      rows: Array.isArray(raw.rows) ? raw.rows.slice(0, 6).filter((r) => Array.isArray(r)).map((r) => [S.str(r[0], 20), S.str(r[1], 80)]) : [],
      conditions: S.field(raw.cd), allergies: S.field(raw.al), meds: S.field(raw.md), life: S.str(raw.lf, 400), microchip: S.str(raw.mc, 15).replace(/\D/g, ''), insurance: S.str(raw.ins, 110),
      contacts: Array.isArray(raw.ct) ? raw.ct.slice(0, 4).filter((r) => Array.isArray(r)).map((r) => [S.str(r[0], 20), S.str(r[1], 70), S.str(r[2], 20).replace(/[^\d+\-() ]/g, '')]) : [],
      pet: S.pet(raw.pet)
    };
  }
  let linkCache = { key: null, data: null, error: null };
  function decodeRouteData(prefix, sanitizer) {
    const key = location.hash.replace(prefix, '');
    if (linkCache.key !== key) {
      linkCache = { key: key, data: null, error: null };
      decodePayload(key).then((d) => { linkCache.data = sanitizer(d); if (!linkCache.data) throw new Error('format'); })
        .catch((e) => { linkCache.error = e; }).then(() => render());
      return { loading: true };
    }
    return linkCache;
  }
  function linkErrorHtml(e) {
    return '<section class="card"><h1>リンクを表示できません</h1><p>' + (e && e.message === 'unsupported' ? 'このブラウザは古いため表示できません。最新のChromeまたはSafariで開いてください。' : 'リンクが途中で切れている可能性があります。送ってくれた方に、もう一度送ってもらってください。') + '</p></section>';
  }
  function renderCardView() {
    const st = decodeRouteData(/^#\/card\//, sanitizeCard);
    if (st.loading) return '<p class="loading">読み込み中…</p>';
    if (st.error) return linkErrorHtml(st.error);
    const c = st.data;
    if (Date.now() > c.x) return '<section class="card"><h1>このリンクは有効期限が切れています</h1><p class="muted">送ってくれた方に、新しいリンクを作ってもらってください。</p></section>';
    return cardHtml(c, { created: c.c }) + '<div class="form-actions"><button type="button" class="btn ghost block" data-action="importCardPet">この端末のPAWCAREにプロフィールを取り込む</button></div>';
  }
  function importPetProfile(p) {
    if (getPet(p.id)) { toast(p.name + 'はすでに登録されています'); return; }
    const pet = Object.assign({ createdAt: new Date().toISOString(), memo: '' }, p, { id: p.id || uid() });
    if (commit(() => { db.pets.push(pet); db.settings.activePetId = pet.id; })) { toast(pet.name + 'を追加しました'); go('home'); }
  }

  /* ============================================================
   * #3 誤食メモ（何を・量・いつ・包装）と、確認→記録→電話
   * ============================================================ */
  const INGEST_AMOUNT = [['little', 'ひとかけら・少し'], ['half', '半分くらい'], ['all', '全部'], ['unknown', '分からない']];
  const INGEST_WHEN = [['now', 'たった今'], ['30m', '30分以内'], ['1h', '1時間以内'], ['time', '時刻を入力'], ['unknown', '分からない']];
  function ingestSummary(l) {
    const g = l.ingest || {};
    const parts = [];
    if (g.what) parts.push('何を：' + g.what + (g.product ? '（' + g.product + '）' : ''));
    const am = INGEST_AMOUNT.find((a) => a[0] === g.amount);
    if (am || g.amountNote) parts.push('量：' + (am ? am[1] : '') + (g.amountNote ? '（' + g.amountNote + '）' : ''));
    if (g.when === 'time' && g.ateAt) parts.push('時刻：' + fmtShort(g.ateAt));
    else { const w = INGEST_WHEN.find((a) => a[0] === g.when); if (w && g.when !== 'time') parts.push('時刻：' + w[1] + '（記録 ' + l.datetime.slice(11, 16) + '）'); }
    if (g.packageKept) parts.push('包装あり');
    return parts.join('／');
  }
  function ingestPhoneLine(l) {
    const g = l.ingest || {};
    if (!g.what && !g.amount) return '';
    const at = g.when === 'time' && g.ateAt ? g.ateAt : l.datetime;
    const am = INGEST_AMOUNT.find((a) => a[0] === g.amount);
    let s = Number(at.slice(11, 13)) + '時' + at.slice(14, 16) + '分ごろ（約' + agoText(at) + '）、';
    s += (g.what || '何か') + (g.product ? '（' + g.product + '）' : '') + 'を' + (am && g.amount !== 'unknown' ? am[1] : '') + (g.amountNote ? '（' + g.amountNote + '）' : '') + '食べた可能性があります。';
    if (g.packageKept) s += '包装は手元にあります。';
    return s;
  }
  function toxicHitNames(text, species) {
    if (!text) return [];
    return NU.toxic.filter((t) => (t.both || t[species]) && t.k.some((k) => text.indexOf(k) >= 0)).map((t) => t.name);
  }
  function callButtonsHtml() {
    const h = db.settings.hospital, nt = db.settings.night;
    return '<div class="btn-row">' + (h.phone ? '<a class="btn danger small" href="tel:' + esc(h.phone.replace(/[^\d+]/g, '')) + '">📞 ' + esc(h.name || 'かかりつけ') + 'に電話</a>' : '') +
      (nt.phone ? '<a class="btn danger-ghost small" href="tel:' + esc(nt.phone.replace(/[^\d+]/g, '')) + '">🌙 ' + esc(nt.name || '夜間・救急') + 'に電話</a>' : '') +
      '<button type="button" class="btn danger-ghost small" data-nav="emergency">緊急時の案内を開く</button></div>';
  }
  function openIngestSheet(log) {
    const g = log.ingest || {};
    const radios = (name, list, val) => '<div class="choice-list cols2">' + list.map((a) => '<label class="choice"><input type="radio" name="' + name + '" value="' + a[0] + '"' + (val === a[0] ? ' checked' : '') + '><span>' + esc(a[1]) + '</span></label>').join('') + '</div>';
    openSheet('誤食の疑いを記録しました', '<div class="alert danger"><strong>有害なものを食べた可能性がある場合は、様子を見ずに今すぐ動物病院へ連絡してください。</strong><p>何を・どれくらい・いつ食べたかを伝えられるよう、パッケージや残りがあれば手元に置いてください。</p>' + callButtonsHtml() + '</div>' +
      '<form data-form="ingest" novalidate><input type="hidden" name="id" value="' + esc(log.id) + '"><p class="sub">電話の前に、分かる範囲で（あとからでも入力できます）</p>' +
      '<label>何を<input name="what" maxlength="100" value="' + esc(g.what || '') + '" placeholder="例：ぶどう、保冷剤、薬のシート" data-ingest-check></label>' +
      '<label>商品名・成分表示（分かれば）<input name="product" maxlength="100" value="' + esc(g.product || '') + '" data-ingest-check></label>' +
      '<div id="ingestToxic"></div>' +
      '<p class="sub">量</p>' + radios('amount', INGEST_AMOUNT, g.amount) + '<label>量のメモ<input name="amountNote" maxlength="50" value="' + esc(g.amountNote || '') + '" placeholder="例：3粒、1/4枚"></label>' +
      '<p class="sub">いつ</p>' + radios('when', INGEST_WHEN, g.when) +
      '<label class="ingest-time"' + (g.when === 'time' ? '' : ' hidden') + '>食べた時刻<input type="datetime-local" name="ateAt" value="' + esc(g.ateAt || '') + '"></label>' +
      '<label class="check"><input type="checkbox" name="packageKept"' + (g.packageKept ? ' checked' : '') + '> 包装・残りを手元に置いた</label>' +
      '<div class="form-actions"><button type="submit" class="btn primary block">保存して電話用メモを作る</button></div></form>');
    updateIngestToxic();
  }
  function updateIngestToxic() {
    const box = document.getElementById('ingestToxic');
    if (!box) return;
    const form = box.closest('form');
    const text = form.querySelector('[name=what]').value + ' ' + form.querySelector('[name=product]').value;
    const pet = activePet();
    const hits = toxicHitNames(text, pet ? pet.species : 'dog');
    box.innerHTML = text.trim() ? '<div class="alert ' + (hits.length ? 'danger' : 'warn') + ' small">' + (hits.length ? 'PAWCAREの一覧では「' + esc(hits.join('、')) + '」に当たります。' : '') + '一覧にないものでも安全という意味ではありません。病院に連絡してください。</div>' : '';
  }
  function saveIngestForm(form) {
    const f = new FormData(form);
    const log = db.logs.find((l) => l.id === f.get('id'));
    if (!log) return;
    const ingest = {
      what: String(f.get('what') || '').trim().slice(0, 100), product: String(f.get('product') || '').trim().slice(0, 100),
      amount: String(f.get('amount') || ''), amountNote: String(f.get('amountNote') || '').trim().slice(0, 50),
      when: String(f.get('when') || ''), ateAt: f.get('when') === 'time' ? String(f.get('ateAt') || '').slice(0, 16) : '', packageKept: !!f.get('packageKept')
    };
    if (!commit(() => { log.ingest = ingest; })) return;
    const line = ingestPhoneLine(log);
    const pet = getPet(log.petId);
    $sheetTitle.textContent = '電話で読み上げるメモ';
    $sheetBody.innerHTML = '<div class="alert danger"><strong>今すぐ動物病院へ電話してください。</strong>' + callButtonsHtml() + '</div><pre class="memo phone-script">' + esc(pet ? phoneScript(pet) : line) + '</pre>' +
      '<div class="form-actions"><button type="button" class="btn primary block" data-action="copyPhoneScript">読み上げメモをコピー</button></div>';
    rerender();
  }
  function recordIngestFrom(text) {
    const pet = activePet();
    if (!pet) return;
    const log = { id: uid(), petId: pet.id, category: 'ingest', datetime: nowLocal(), memo: '', value: '', createdAt: new Date().toISOString(), ingest: { what: text.slice(0, 100), product: '', amount: '', amountNote: '', when: '', ateAt: '', packageKept: false } };
    if (commit(() => { db.logs.push(log); })) openIngestSheet(log);
  }

  /* ============================================================
   * #4 受診の記録と、処方からの服薬予定
   * ============================================================ */
  function renderVisits() {
    const pet = activePet();
    let html = '<div class="row-between"><h1 class="page-title">🏥 受診の記録</h1>' + (pet ? '<button type="button" class="btn primary small" data-action="newVisit">＋ 記録</button>' : '') + '</div>';
    if (!pet) return html + '<section class="card"><button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button></section>';
    html += petChips(pet.id, 'selectPet');
    html += '<p class="notice-small">先生から聞いたことを、聞いたとおりに残すメモです。分からないことは病院に確認してください。</p>';
    const list = db.visits.filter((v) => v.petId === pet.id).sort((a, b) => (a.date < b.date ? 1 : -1));
    html += '<section class="card">' + (list.length ? '<ul class="log-list">' + list.map((v) =>
      '<li><button type="button" class="log-item" data-action="editVisit" data-id="' + esc(v.id) + '"><span class="log-main"><span class="log-cat">' + esc(v.date.replace(/-/g, '/')) + ' ' + esc(visitHospitalName(v)) + '</span><span class="log-memo">' + esc(v.reason || '理由未入力') + (v.meds && v.meds.length ? '・処方 ' + v.meds.length + '件' : '') + '</span></span><span class="chev" aria-hidden="true">›</span></button></li>').join('') + '</ul>'
      : '<p class="empty">まだ受診の記録はありません。</p>') + '</section>';
    return html;
  }
  function visitHospitalName(v) {
    if (v.hospital === 'regular') return db.settings.hospital.name || 'かかりつけ';
    if (v.hospital === 'night') return db.settings.night.name || '夜間・救急';
    return v.hospitalName || 'その他の病院';
  }
  function visitFormHtml(v) {
    const s = db.settings;
    const medRow = (m, i) => '<div class="med-row"><input name="vm_name_' + i + '" maxlength="60" placeholder="薬の名前" value="' + esc(m.name || '') + '"><input name="vm_how_' + i + '" maxlength="100" placeholder="飲ませ方（言われたとおりに）" value="' + esc(m.how || '') + '"><label class="small">日数<input name="vm_days_' + i + '" type="number" inputmode="numeric" min="1" max="365" value="' + esc(m.days || '') + '"></label>' +
      (v.id && m.name ? '<button type="button" class="btn ghost small" data-action="medReminder" data-visit="' + esc(v.id) + '" data-idx="' + i + '">服薬の予定を作る</button>' : '') + '</div>';
    return '<form data-form="visit" novalidate><input type="hidden" name="id" value="' + esc(v.id || '') + '">' +
      '<p class="muted small">先生から聞いたことを、聞いたとおりに残すメモです。分からないことは病院に確認してください。</p>' +
      '<label>日付<input type="date" name="date" value="' + esc(v.date || todayStr()) + '" max="' + todayStr() + '"></label>' +
      '<label>病院<select name="hospital"><option value="regular"' + (v.hospital === 'regular' ? ' selected' : '') + '>' + esc(s.hospital.name || 'かかりつけ') + '</option><option value="night"' + (v.hospital === 'night' ? ' selected' : '') + '>' + esc(s.night.name || '夜間・救急') + '</option><option value="other"' + (v.hospital === 'other' ? ' selected' : '') + '>その他</option></select></label>' +
      '<label>病院名（その他のとき）<input name="hospitalName" maxlength="60" value="' + esc(v.hospitalName || '') + '"></label>' +
      '<label>受診した理由<input name="reason" maxlength="200" value="' + esc(v.reason || '') + '" placeholder="例：嘔吐が続いた"></label>' +
      '<label>先生に言われたこと<textarea name="vetSaid" rows="3" maxlength="1000" placeholder="例：7日分の薬を1日2回。吐いたら電話">' + esc(v.vetSaid || '') + '</textarea></label>' +
      '<p class="sub">処方された薬</p><div class="med-rows">' + ((v.meds && v.meds.length) ? v.meds : [{}]).map(medRow).join('') + '</div>' +
      '<button type="button" class="btn ghost small" data-action="addVisitMedRow">＋ 薬を追加</button>' +
      '<label>次に来るよう言われた日<input type="date" name="nextDate" value="' + esc(v.nextDate || '') + '"></label>' +
      (v.id && v.nextDate ? '<button type="button" class="btn ghost small" data-action="nextVisitReminder" data-id="' + esc(v.id) + '">次回の予定を作る</button>' : '') +
      '<label>支払った金額（円・任意）<input name="cost" type="number" inputmode="numeric" min="0" max="10000000" value="' + esc(v.cost || '') + '"></label>' +
      '<p class="form-error" hidden></p><div class="form-actions"><button type="submit" class="btn primary block">' + (v.id ? '保存する' : '記録する') + '</button>' +
      (v.id ? '<button type="button" class="btn danger-ghost block" data-action="deleteVisit" data-id="' + esc(v.id) + '">この記録を削除</button>' : '') + '</div></form>';
  }
  function saveVisitForm(form) {
    const f = new FormData(form);
    const err = form.querySelector('.form-error');
    const pet = activePet();
    const date = String(f.get('date') || '');
    if (!parseLocal(date)) return showFormError(err, '日付を入力してください。');
    const meds = [];
    for (let i = 0; i < 30; i++) {
      if (!form.querySelector('[name=vm_name_' + i + ']')) break;
      const name = String(f.get('vm_name_' + i) || '').trim();
      if (!name) continue;
      const days = parseInt(f.get('vm_days_' + i), 10);
      meds.push({ id: uid(), name: name.slice(0, 60), how: String(f.get('vm_how_' + i) || '').trim().slice(0, 100), days: days > 0 && days <= 365 ? days : '' });
    }
    const cost = parseInt(f.get('cost'), 10);
    const data = { date: date, hospital: f.get('hospital') || 'regular', hospitalName: String(f.get('hospitalName') || '').trim().slice(0, 60), reason: String(f.get('reason') || '').trim().slice(0, 200),
      vetSaid: String(f.get('vetSaid') || '').trim().slice(0, 1000), meds: meds, nextDate: String(f.get('nextDate') || ''), cost: cost >= 0 ? cost : '', updatedAt: new Date().toISOString() };
    const id = f.get('id');
    let saved = null;
    if (commit(() => {
      if (id) { saved = db.visits.find((x) => x.id === id); if (saved) Object.assign(saved, data); }
      else { saved = Object.assign({ id: uid(), petId: pet.id, createdAt: new Date().toISOString() }, data); db.visits.push(saved); }
    })) {
      rerender();
      openSheet('受診の記録', visitFormHtml(saved));
      toast('保存しました。薬の「服薬の予定を作る」で予定にできます');
    }
  }
  function medReminderFromVisit(visitId, idx) {
    const v = db.visits.find((x) => x.id === visitId);
    if (!v || !v.meds[idx]) return;
    const m = v.meds[idx];
    let endAt = '';
    if (m.days) { const e = parseLocal(v.date); e.setDate(e.getDate() + (+m.days) - 1); endAt = toLocalInput(e).slice(0, 10); }
    openReminderForm({ petId: v.petId, type: 'medicine', title: m.name, memo: m.how, repeat: 'daily', dueAt: '', endAt: endAt, hint: '1日に複数回のときは、時刻ごとに作ってください。時刻は先生に言われたとおりに入れてください。' });
  }

  /* ============================================================
   * #5 家族・預け先への引き継ぎ（テキスト＋取り込みリンク）
   * ============================================================ */
  function openHandoff() {
    const pet = activePet();
    if (!pet) return;
    openSheet(pet.name + 'の引き継ぎ', '<form data-form="handoff">' +
      '<label>期間<select name="range"><option value="today">今日</option><option value="24" selected>直近24時間</option><option value="72">直近3日</option></select></label>' +
      '<label class="check"><input type="checkbox" name="counts" checked> 記録の回数と最後の時刻</label>' +
      '<label class="check"><input type="checkbox" name="plans" checked> これから24時間の予定（服薬など）</label>' +
      '<label class="check"><input type="checkbox" name="card"> もしもカードのリンク</label>' +
      '<label class="check"><input type="checkbox" name="importLink" checked> 記録を相手のPAWCAREに取り込むリンク</label>' +
      '<label>伝えたいこと<textarea name="note" rows="3" maxlength="300" placeholder="例：夜もう一度吐いたら○○病院に電話して"></textarea></label>' +
      '<div class="alert warn small">自動では同期されません。相手が記録したものは、相手から引き継ぎを送ってもらってください。リンクを知っている人は誰でも読め、取り消せません。</div>' +
      '<div class="form-actions"><button type="submit" class="btn primary block">引き継ぎ文を作る</button></div></form>');
  }
  async function createHandoff(form) {
    const f = new FormData(form);
    const pet = activePet();
    const range = f.get('range');
    const since = range === 'today' ? todayStr() + 'T00:00' : toLocalInput(new Date(Date.now() - (+range) * 3600000));
    const logs = logsSorted(db.logs.filter((l) => l.petId === pet.id && l.datetime >= since));
    const L = ['【' + pet.name + 'の引き継ぎ ' + fmtShort(nowLocal()) + '】'];
    if (f.get('counts')) {
      const cw = countsWithLast(logs);
      const keys = KEY_CATS.concat(['walk', 'weight', 'other']).filter((k) => cw[k]);
      L.push(keys.length ? '・' + keys.map((k) => categoryOf(k).label + ' ' + cw[k].n + '回（最後 ' + cw[k].last.slice(11, 16) + '）').join('・') : '・この期間の記録はありません');
    }
    if (f.get('plans')) {
      const until = toLocalInput(new Date(Date.now() + 24 * 3600000));
      const plans = sortedReminders(db.reminders.filter((r) => r.petId === pet.id && !r.done && r.dueAt <= until));
      if (plans.length) L.push('・これからの予定：' + plans.map((r) => fmtShort(r.dueAt) + ' ' + (r.title || reminderTypeOf(r.type).label)).join('、'));
    }
    const note = String(f.get('note') || '').trim().slice(0, 300);
    if (note) L.push('・伝えたいこと：' + note);
    const base = location.origin + location.pathname;
    if (f.get('card')) L.push('・もしもカード：' + base + '#/card/' + await encodePayload(Object.assign(cardPayloadOf(pet), { x: Date.now() + 7 * 86400000, pet: petExport(pet) })));
    if (f.get('importLink')) {
      const payload = { v: 1, t: 'handoff', c: nowLocal(), x: Date.now() + 3 * 86400000, from: db.settings.owner.name || '', pet: petExport(pet),
        logs: logs.slice(0, 120).map((l) => ({ id: l.id, datetime: l.datetime, category: l.category, value: l.value || '', memo: (l.memo || '').slice(0, 200), ingest: l.ingest || null })) };
      L.push('・取り込みリンク：' + base + '#/import/' + await encodePayload(payload));
    }
    const text = L.join('\n');
    $sheetTitle.textContent = '引き継ぎ文ができました';
    $sheetBody.innerHTML = '<pre class="memo handoff-text">' + esc(text) + '</pre><div class="form-actions"><button type="button" class="btn primary block" data-action="copyHandoff">コピー</button>' +
      (navigator.share ? '<button type="button" class="btn ghost block" data-action="shareHandoff">LINE・メールで送る</button>' : '') + '</div>';
  }
  function sanitizeHandoff(raw) {
    if (!raw || typeof raw !== 'object' || raw.t !== 'handoff') return null;
    const cats = D.CATEGORIES.map((c) => c.id);
    const logs = Array.isArray(raw.logs) ? raw.logs.slice(0, 500).filter((l) => l && typeof l === 'object' && S.dt(l.datetime) && cats.indexOf(l.category) >= 0).map((l) => {
      const g = l.ingest && typeof l.ingest === 'object' ? l.ingest : null;
      return { id: S.str(l.id, 40).replace(/[^\w-]/g, '') || uid(), datetime: S.dt(l.datetime), category: l.category, value: S.num(l.value), memo: S.str(l.memo, 200),
        ingest: g ? { what: S.str(g.what, 100), product: S.str(g.product, 100), amount: ['little', 'half', 'all', 'unknown'].indexOf(g.amount) >= 0 ? g.amount : '', amountNote: S.str(g.amountNote, 50),
          when: ['now', '30m', '1h', 'time', 'unknown'].indexOf(g.when) >= 0 ? g.when : '', ateAt: S.dt(g.ateAt), packageKept: g.packageKept === true } : null };
    }) : [];
    return { c: S.dt(raw.c), x: Number.isFinite(raw.x) ? raw.x : 0, from: S.str(raw.from, 40), pet: S.pet(raw.pet), logs: logs };
  }
  function renderImport() {
    const st = decodeRouteData(/^#\/import\//, sanitizeHandoff);
    if (st.loading) return '<p class="loading">読み込み中…</p>';
    if (st.error) return linkErrorHtml(st.error);
    const h = st.data;
    if (Date.now() > h.x) return '<section class="card"><h1>このリンクは有効期限が切れています</h1><p class="muted">送ってくれた方に、新しい引き継ぎを送ってもらってください。</p></section>';
    const sorted = logsSorted(h.logs);
    const range = sorted.length ? fmtShort(sorted[sorted.length - 1].datetime) + '〜' + fmtShort(sorted[0].datetime) : '';
    let html = '<section class="card import-head"><p class="tag">家族からの引き継ぎ</p><h1>' + esc(h.from ? h.from + 'さんから：' : '') + esc(h.pet.name) + 'の記録 ' + h.logs.length + '件</h1><p class="muted small">' + esc(range) + '</p></section>';
    html += '<section class="card">' + groupedLogsHtml(h.logs.map((l) => Object.assign({}, l, { petId: '' })), false).replace(/data-action="editLog"/g, 'data-action="noop"') + '</section>';
    const same = getPet(h.pet.id);
    html += '<section class="card"><h2>この端末のPAWCAREに取り込む</h2>' +
      (same ? '<p class="small">この端末の「' + esc(same.name) + '」に記録を追加します。</p><button type="button" class="btn primary block" data-action="doImport" data-target="' + esc(same.id) + '">取り込む</button>'
        : '<button type="button" class="btn primary block" data-action="doImport" data-target="new">新しいペットとして追加</button>' +
          (db.pets.length ? '<label>既存のペットに取り込む<select id="importTarget">' + optionsHtml(db.pets.map((p) => ({ id: p.id, label: p.name })), '') + '</select></label><button type="button" class="btn ghost block" data-action="doImport" data-target="select">選んだペットに取り込む</button>' : '')) +
      '<p class="muted small">すでにある記録は消したり上書きしたりしません。同じ記録は二重に追加しません。自動では同期されません。</p></section>';
    return html;
  }
  function doImport(target) {
    const h = linkCache.data;
    if (!h || !h.logs) return;
    let petId = target;
    let newPet = null;
    if (target === 'new') { newPet = Object.assign({ createdAt: new Date().toISOString(), memo: '' }, h.pet, { id: getPet(h.pet.id) ? uid() : (h.pet.id || uid()) }); petId = newPet.id; }
    else if (target === 'select') { const sel = document.getElementById('importTarget'); petId = sel && sel.value; }
    if (!newPet && !getPet(petId)) { toast('取り込み先のペットを選んでください'); return; }
    const batch = uid();
    const existing = new Set(db.logs.map((l) => l.id));
    let added = 0, dup = 0;
    if (!commit(() => {
      if (newPet) db.pets.push(newPet);
      h.logs.forEach((l) => {
        if (existing.has(l.id)) { dup += 1; return; }
        const rec = { id: l.id, petId: petId, category: l.category, datetime: l.datetime, value: l.value, memo: l.memo, createdAt: new Date().toISOString(), importBatch: batch };
        if (l.ingest) rec.ingest = l.ingest;
        db.logs.push(rec); added += 1;
      });
      db.settings.activePetId = petId;
    })) return;
    go('home');
    toast(added + '件追加・' + dup + '件はすでにありました', added ? [{ label: '取り消す', fn: () => { if (commit(() => { db.logs = db.logs.filter((l) => l.importBatch !== batch); if (newPet) db.pets = db.pets.filter((p) => p.id !== newPet.id); })) { toast('取り込みを取り消しました'); rerender(); } } }] : []);
  }

  /* ============================================================
   * イベント処理
   * ============================================================ */
  const actions = {
    closeBanner: () => { $banner.hidden = true; },
    newPet: () => openPetForm({}),
    editPet: (el) => openPetForm(getPet(el.dataset.id)),
    deletePet: (el) => {
      const p = getPet(el.dataset.id);
      if (!p) return;
      const n = db.logs.filter((l) => l.petId === p.id).length;
      if (!confirm(p.name + 'を削除しますか？\n健康記録' + n + '件と予定も一緒に削除されます。この操作は取り消せません。')) return;
      if (commit(() => {
        db.pets = db.pets.filter((x) => x.id !== p.id);
        db.logs = db.logs.filter((l) => l.petId !== p.id);
        db.reminders = db.reminders.filter((r) => r.petId !== p.id);
        db.foods = db.foods.filter((f) => f.petId !== p.id);
        db.visits = db.visits.filter((v) => v.petId !== p.id);
        if (db.settings.activePetId === p.id) db.settings.activePetId = db.pets[0] ? db.pets[0].id : null;
      })) { toast('削除しました'); rerender(); }
    },
    selectPet: (el) => { if (commit(() => { db.settings.activePetId = el.dataset.id; })) rerender(); },
    quick: (el) => {
      const pet = activePet();
      if (!pet) return openPetForm({});
      const cat = el.dataset.cat;
      if (cat === 'weight') return openLogForm({ category: 'weight', value: pet.weight || '' });
      const log = { id: uid(), petId: pet.id, category: cat, datetime: nowLocal(), memo: '', value: '', createdAt: new Date().toISOString() };
      if (!commit(() => { db.logs.push(log); })) return;
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* 非対応 */ } }
      rerender();
      if (cat === 'ingest') {
        openIngestSheet(log);
        return;
      }
      if (cat === 'ingest_old') {
        const h = db.settings.hospital;
        openSheet('誤食の疑いを記録しました', '<div class="alert danger"><strong>有害なものを食べた可能性がある場合は、様子を見ずに今すぐ動物病院へ連絡してください。</strong><p>何を・どれくらい・いつ食べたかを伝えられるよう、パッケージや残りがあれば手元に置いてください。</p>' +
          '<div class="btn-row">' + (h.phone ? '<a class="btn danger small" href="tel:' + esc(h.phone.replace(/[^\d+]/g, '')) + '">📞 ' + esc(h.name || 'かかりつけ') + 'に電話</a>' : '') +
          '<button type="button" class="btn danger-ghost small" data-nav="emergency">緊急時の案内を開く</button></div></div>' +
          '<button type="button" class="btn ghost block" data-action="editLog" data-id="' + esc(log.id) + '">何を食べたかメモする</button>');
        return;
      }
      toast(log.datetime.slice(11, 16) + ' ' + categoryOf(cat).label + 'を記録', [
        { label: 'メモ・時刻', fn: () => openLogForm(db.logs.find((l) => l.id === log.id)) },
        { label: '取消', fn: () => { if (commit(() => { db.logs = db.logs.filter((l) => l.id !== log.id); })) { toast('取り消しました'); rerender(); } } }
      ]);
    },
    newLog: () => {
      if (!db.pets.length) return openPetForm({});
      openLogForm(logFilter.petId !== 'all' && currentView === 'logs' ? { petId: logFilter.petId } : {});
    },
    editLog: (el) => { const l = db.logs.find((x) => x.id === el.dataset.id); if (!l) return; if (l.category === 'ingest' && !el.dataset.basic) openIngestSheet(l); else openLogForm(Object.assign({}, l)); },
    editCard: () => { const p = activePet(); if (p) openSheet('もしもカードを編集', cardFormHtml(p)); },
    cardImage: () => { cardImage(); },
    sendCard: () => openSendCard(),
    importCardPet: () => { if (linkCache.data && linkCache.data.pet) importPetProfile(linkCache.data.pet); },
    addMedRow: (el) => { const box = el.form.querySelector('.med-rows'); const i = box.children.length; box.insertAdjacentHTML('beforeend', '<div class="med-row"><input name="med_name_' + i + '" maxlength="60" placeholder="薬の名前"><input name="med_how_' + i + '" maxlength="100" placeholder="先生に言われた飲ませ方"><div class="two-col"><label class="small">開始<input type="date" name="med_from_' + i + '"></label><label class="small">終了（空欄＝続く）<input type="date" name="med_to_' + i + '"></label></div></div>'); },
    addVisitMedRow: (el) => { const box = el.form.querySelector('.med-rows'); const i = box.children.length; box.insertAdjacentHTML('beforeend', '<div class="med-row"><input name="vm_name_' + i + '" maxlength="60" placeholder="薬の名前"><input name="vm_how_' + i + '" maxlength="100" placeholder="飲ませ方（言われたとおりに）"><label class="small">日数<input name="vm_days_' + i + '" type="number" inputmode="numeric" min="1" max="365"></label></div>'); },
    newVisit: () => openSheet('受診の記録', visitFormHtml({ date: todayStr(), hospital: 'regular' })),
    editVisit: (el) => { const v = db.visits.find((x) => x.id === el.dataset.id); if (v) openSheet('受診の記録', visitFormHtml(v)); },
    deleteVisit: (el) => { if (!confirm('この受診の記録を削除しますか？')) return; if (commit(() => { db.visits = db.visits.filter((v) => v.id !== el.dataset.id); })) { closeSheet(); rerender(); } },
    medReminder: (el) => medReminderFromVisit(el.dataset.visit, +el.dataset.idx),
    nextVisitReminder: (el) => { const v = db.visits.find((x) => x.id === el.dataset.id); if (v && v.nextDate) openReminderForm({ petId: v.petId, type: 'checkup', title: '次回の受診', dueAt: v.nextDate + 'T09:00', repeat: 'none', memo: v.reason ? '前回：' + v.reason : '', hint: '時刻は病院の予約に合わせて変更してください。' }); },
    handoff: () => openHandoff(),
    copyHandoff: () => { const t = $sheetBody.querySelector('.handoff-text'); if (t) copyText(t.textContent); },
    shareHandoff: () => { const t = $sheetBody.querySelector('.handoff-text'); if (t) shareText('PAWCARE 引き継ぎ', t.textContent); },
    shareLinkAs: (el) => { const i = $sheetBody.querySelector('.share-url'); if (i) shareText(el.dataset.title || 'PAWCARE', i.value); },
    doImport: (el) => doImport(el.dataset.target),
    recordIngest: () => { const i = document.getElementById('toxicInput'); recordIngestFrom(i ? i.value.trim() : ''); },
    editLogBasic: (el) => { const l = db.logs.find((x) => x.id === el.dataset.id); if (l) openLogForm(Object.assign({}, l)); },
    deleteLog: (el) => {
      if (!confirm('この記録を削除しますか？')) return;
      if (commit(() => { db.logs = db.logs.filter((l) => l.id !== el.dataset.id); })) { closeSheet(); toast('削除しました'); rerender(); }
    },
    clearFilter: () => { logFilter.petId = 'all'; logFilter.date = ''; logFilter.category = 'all'; rerender(); },
    exportCsv: () => exportCsv(filteredLogs()),
    exportAllCsv: () => exportCsv(db.logs),
    exportJson: exportJson,
    editHospital: (el) => openSheet(el.dataset.kind === 'night' ? '夜間・救急の動物病院' : 'かかりつけの動物病院', hospitalFormHtml(el.dataset.kind)),
    copyPhoneScript: () => { const p = activePet(); if (p) copyText(phoneScript(p)); },
    loadSample: loadSample,
    wipe: () => {
      if (!confirm('すべてのペット・記録・問診メモ・設定を削除します。\n先にバックアップを書き出すことをおすすめします。続けますか？')) return;
      if (!confirm('本当に削除しますか？この操作は取り消せません。')) return;
      db = emptyDb();
      iv = null;
      persist();
      toast('すべてのデータを削除しました');
      go('home');
    },
    startInterview: () => { iv = newInterview(); iv.step = 1; go('interview'); },
    ivNext: () => {
      if (iv.step === 2 && !iv.a.symptoms.length && !iv.a.symptomOther.trim()) { toast('症状を1つ以上選ぶか、様子を入力してください'); return; }
      iv.step = Math.min(iv.step + 1, STEP_TITLES.length - 1);
      render();
    },
    ivBack: () => { iv.step = Math.max(iv.step - 1, 0); render(); },
    ivRestart: () => { iv = newInterview(); render(); },
    ivSymptom: (el) => {
      const v = el.dataset.value;
      const i = iv.a.symptoms.indexOf(v);
      if (i >= 0) iv.a.symptoms.splice(i, 1); else iv.a.symptoms.push(v);
      rerender();
    },
    copyMemo: () => copyText(buildMemo(iv.a)),
    shareMemo: () => shareText('PAWCARE 問診メモ', buildMemo(iv.a)),
    saveMemo: () => {
      const p = getPet(iv.a.petId);
      const memo = { id: uid(), petId: iv.a.petId, petName: p ? p.name : '', createdAt: nowLocal(), summary: iv.a.symptoms.join('、') || iv.a.symptomOther.slice(0, 30), text: buildMemo(iv.a), answers: Object.assign({}, iv.a, { symptoms: iv.a.symptoms.slice() }) };
      if (commit(() => { db.memos.push(memo); if (db.memos.length > 50) db.memos.shift(); })) { iv.savedId = memo.id; toast('問診メモを保存しました'); rerender(); }
    },
    viewMemo: (el) => {
      const m = db.memos.find((x) => x.id === el.dataset.id);
      if (!m) return;
      openSheet('問診メモ', '<pre class="memo">' + esc(m.text) + '</pre><div class="form-actions"><button type="button" class="btn primary block" data-action="copySavedMemo" data-id="' + esc(m.id) + '">コピー</button>' +
        '<button type="button" class="btn danger-ghost block" data-action="deleteMemo" data-id="' + esc(m.id) + '">このメモを削除</button></div>');
    },
    copySavedMemo: (el) => { const m = db.memos.find((x) => x.id === el.dataset.id); if (m) copyText(m.text); },
    copyLatestMemo: () => { const m = db.memos[db.memos.length - 1]; if (m) copyText(m.text); },
    newFood: () => openSheet('食品を追加', foodFormHtml({})),
    editFood: (el) => { const f = db.foods.find((x) => x.id === el.dataset.id); if (f) openSheet('食品を編集', foodFormHtml(f)); },
    deleteFood: (el) => { if (!confirm('この食品を削除しますか？')) return; if (commit(() => { db.foods = db.foods.filter((f) => f.id !== el.dataset.id); })) { closeSheet(); rerender(); } },
    toxicCheck: () => toxicCheck(),
    pickSpecies: (el) => {
      const form = el.closest('form');
      const sel = form.querySelector('select[name=species]');
      sel.value = el.dataset.value;
      form.querySelectorAll('.species-btn').forEach((b) => b.classList.toggle('active', b === el));
      form.querySelector('.breed-wrap').innerHTML = breedSelectHtml(el.value || el.dataset.value, '');
    },
    newReminder: () => openReminderForm({}),
    editReminder: (el) => { const r = db.reminders.find((x) => x.id === el.dataset.id); if (r) openReminderForm(Object.assign({}, r)); },
    deleteReminder: (el) => {
      if (!confirm('この予定を削除しますか？\n（カレンダーに登録済みの予定は、カレンダー側で削除してください）')) return;
      if (commit(() => { db.reminders = db.reminders.filter((r) => r.id !== el.dataset.id); })) { closeSheet(); toast('予定を削除しました'); rerender(); }
    },
    doneReminder: (el) => doneReminder(el.dataset.id),
    calendarReminder: (el) => { const r = db.reminders.find((x) => x.id === el.dataset.id); if (r) addToCalendar(r); },
    downloadIcs: (el) => { const r = db.reminders.find((x) => x.id === el.dataset.id); if (r) downloadIcs(r); },
    openShare: (el) => openShareSheet(el.dataset.id),
    shareInterview: () => openShareSheet(iv.a.petId, buildMemo(iv.a)),
    copyShareUrl: () => { const i = $sheetBody.querySelector('.share-url'); if (i) copyText(i.value); },
    shareShareUrl: () => { const i = $sheetBody.querySelector('.share-url'); if (i) shareText('PAWCARE 受診用サマリー', i.value); },
    printView: () => window.print(),
    deleteMemo: (el) => {
      if (!confirm('この問診メモを削除しますか？')) return;
      if (commit(() => { db.memos = db.memos.filter((m) => m.id !== el.dataset.id); })) { closeSheet(); rerender(); }
    }
  };

  document.addEventListener('click', (e) => {
    const toastBtn = e.target.closest('[data-toast-action]');
    if (toastBtn) {
      const a = toastActions[+toastBtn.dataset.toastAction];
      $toast.hidden = true;
      if (a) a.fn();
      return;
    }
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      if (!$sheet.hidden) closeSheet();
      if (nav.dataset.nav === 'interview' && iv && iv.step === STEP_TITLES.length - 1 && iv.savedId) iv = null;
      go(nav.dataset.nav);
      return;
    }
    if (e.target.closest('[data-close-sheet]')) { closeSheet(); return; }
    const act = e.target.closest('[data-action]');
    if (act && actions[act.dataset.action] && act.tagName !== 'INPUT') {
      e.preventDefault();
      actions[act.dataset.action](act);
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    const type = form.dataset.form;
    if (!type) return;
    e.preventDefault();
    if (type === 'log') saveLogForm(form);
    else if (type === 'pet') savePetForm(form);
    else if (type === 'reminder') saveReminderForm(form);
    else if (type === 'share') createShare(form);
    else if (type === 'food') saveFoodForm(form);
    else if (type === 'card') saveCardForm(form);
    else if (type === 'sendcard') createCardLink(form);
    else if (type === 'ingest') saveIngestForm(form);
    else if (type === 'visit') saveVisitForm(form);
    else if (type === 'handoff') createHandoff(form);
    else if (type === 'hospital') {
      const f = new FormData(form);
      const data = { name: String(f.get('name') || '').trim(), phone: String(f.get('phone') || '').trim(), note: String(f.get('note') || '').trim() };
      if (data.phone && !/^[\d+\-() ]{3,20}$/.test(data.phone)) return showFormError(form.querySelector('.form-error'), '電話番号は数字とハイフンで入力してください。');
      const kind = f.get('kind') === 'night' ? 'night' : 'hospital';
      if (commit(() => { db.settings[kind] = data; })) { closeSheet(); toast('保存しました'); rerender(); }
    }
  });

  function handleInput(e) {
    const el = e.target;
    if (el.name === 'when' && el.form && el.form.dataset.form === 'ingest') {
      el.form.querySelector('.ingest-time').hidden = el.value !== 'time';
      return;
    }
    if (el.dataset.nutri) {
      const pet = activePet();
      if (pet && commit(() => { pet.nutri = Object.assign({}, pet.nutri, { [el.dataset.nutri]: el.checked }); })) rerender();
      return;
    }
    if (el.dataset.filter) {
      logFilter[el.dataset.filter] = el.value;
      rerender();
      return;
    }
    if (el.dataset.iv && iv) {
      const key = el.dataset.iv;
      iv.a[key] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'radio') {
        if (key === 'petId') commit(() => { db.settings.activePetId = el.value; });
        rerender();
      }
      return;
    }
    if (el.dataset.change === 'species') {
      el.form.querySelector('.breed-wrap').innerHTML = breedSelectHtml(el.value, '');
      el.form.querySelectorAll('.species-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === el.value));
      return;
    }
    if (el.dataset.change === 'sharePet') {
      const latest = latestMemoFor(el.value);
      const box = el.form.querySelector('.share-memo');
      const own = pendingShareMemo && iv && iv.a.petId === el.value;
      box.hidden = !(own || latest);
      box.querySelector('span').textContent = (own ? '今作成した問診メモ' : latest ? '最新の問診メモ（' + fmtDateTime(latest.createdAt) + '）' : '') + 'を含める';
      return;
    }
    if (el.dataset.change === 'breed') {
      const other = el.form.querySelector('.breed-other');
      other.hidden = el.value !== 'その他';
      if (!other.hidden) other.querySelector('input').focus();
      return;
    }
    if (el.name === 'type' && el.form && el.form.dataset.form === 'reminder') {
      const t = el.form.querySelector('input[name=title]');
      t.placeholder = '例：' + reminderTypeOf(el.value).label;
      return;
    }
    if (el.name === 'category' && el.form && el.form.dataset.form === 'log') {
      el.form.querySelector('.weight-field').hidden = el.value !== 'weight';
      return;
    }
    if (el.dataset.actionChange === 'importJson') {
      importJson(el.files && el.files[0]);
      el.value = '';
    }
  }
  document.addEventListener('change', handleInput);
  document.addEventListener('input', (e) => {
    /* テキスト入力は再描画せず値だけ保持する（入力中のフォーカスを失わないため） */
    const el = e.target;
    if (el.dataset.iv && iv && el.type !== 'radio' && el.type !== 'checkbox') iv.a[el.dataset.iv] = el.value;
    if (el.hasAttribute('data-ingest-check')) updateIngestToxic();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$sheet.hidden) closeSheet(); });
  window.addEventListener('hashchange', render);
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) { loadDb(); rerender(); } });

  /* ============================================================
   * 起動
   * ============================================================ */
  loadDb();
  render();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* オフライン機能なしで動作継続 */ });
    });
  }

  /* テスト用の参照（本番動作には影響しない） */
  window.__PAWCARE__ = { version: APP_VERSION, getDb: () => db, buildMemo: buildMemo };
})();
