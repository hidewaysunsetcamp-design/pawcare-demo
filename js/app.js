/* PAWCARE アプリ本体（依存ライブラリなし・静的ホスティング用） */
'use strict';

(function () {
  const D = window.PAWCARE_DATA;
  const APP_VERSION = '1.2.0';
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
      settings: { activePetId: null, hospital: { name: '', phone: '', note: '' }, lastBackupAt: null }
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
    base.reminders = Array.isArray(raw.reminders) ? raw.reminders.filter((r) => r && r.id && petIds.has(r.petId) && r.dueAt) : [];
    const s = raw.settings || {};
    base.settings.activePetId = petIds.has(s.activePetId) ? s.activePetId : (base.pets[0] ? base.pets[0].id : null);
    base.settings.hospital = Object.assign(base.settings.hospital, s.hospital || {});
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
  const VIEWS = ['home', 'logs', 'interview', 'pets', 'emergency', 'settings', 'reminders'];
  let currentView = 'home';
  function go(view) {
    if (location.hash !== '#/' + view) location.hash = '#/' + view;
    else render();
  }
  function viewFromHash() {
    const v = (location.hash || '').replace(/^#\/?/, '');
    if (v.indexOf('view/') === 0) return 'view';
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
    const navView = currentView === 'reminders' ? 'home' : currentView;
    document.querySelectorAll('.bottom-nav [data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === navView));
    const fn = { home: renderHome, logs: renderLogs, interview: renderInterview, pets: renderPets, emergency: renderEmergency, settings: renderSettings, reminders: renderReminders, view: renderSharedView }[currentView];
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
      esc([pet.breed || sp.label, ageText(pet.birthday), pet.weight ? pet.weight + 'kg' : ''].filter(Boolean).join('・')) + '</p></div></section>';

    html += '<section class="card"><h2>ワンタップで記録</h2><p class="muted small">押すと今の時刻で記録されます。時刻やメモはあとから修正できます。</p><div class="quick-grid">';
    (D.QUICK[pet.species] || D.QUICK.other).map(categoryOf).forEach((c) => {
      html += '<button type="button" class="quick-btn" data-action="quick" data-cat="' + c.id + '" style="--c:' + c.color + '"><span aria-hidden="true">' + c.emoji + '</span>' + esc(c.label) + '</button>';
    });
    html += '</div><button type="button" class="btn ghost block" data-action="newLog">日時・メモを入力して記録</button></section>';

    html += homeRemindersHtml(pet);

    const today = db.logs.filter((l) => l.petId === pet.id && l.datetime.slice(0, 10) === todayStr());
    html += '<section class="card"><div class="row-between"><h2>今日の記録</h2><button type="button" class="link" data-nav="logs">すべて見る</button></div>';
    html += today.length ? '<ul class="log-list">' + logsSorted(today).map((l) => logItemHtml(l, false)).join('') + '</ul>' : '<p class="empty">今日の記録はまだありません。</p>';
    html += '</section>';

    html += '<button type="button" class="card action-card" data-nav="interview"><span aria-hidden="true">🩺</span><span><strong>体調が気になるとき</strong><small>症状を順番に入力して、獣医師に伝える問診メモを作成</small></span><span class="chev" aria-hidden="true">›</span></button>';
    return html + localNotice;
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
        html += '<p class="muted small">内容を確認し、電話や受付で獣医師に伝える際に使ってください。</p>' +
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
    html += '<p class="muted small">診療時間外や受け入れ可否は病院ごとに異なります。<strong>向かう前に必ず電話で確認してください。</strong></p></section>';

    html += '<section class="card"><h2>🗺️ 近くの動物病院を探す</h2><p class="muted small">地図アプリで検索します。表示される営業時間などは最新でない場合があります。</p>' +
      '<div class="form-actions"><a class="btn ghost block" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent('動物病院') + '">近くの動物病院（Googleマップ）</a>' +
      '<a class="btn ghost block" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent('夜間救急 動物病院') + '">夜間・救急の動物病院を探す</a></div></section>';

    html += '<section class="card"><h2>📝 電話で伝えること</h2><ul class="check-list">' +
      '<li>ペットの名前・種類・年齢・体重</li><li>どんな症状が、いつから、何回あったか</li><li>呼吸・意識・歩き方の様子</li><li>食べた可能性のあるもの（パッケージがあれば手元に）</li><li>持病・服用中の薬</li></ul>';
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

  function hospitalFormHtml() {
    const h = db.settings.hospital;
    return '<form data-form="hospital"><label>病院名<input name="name" maxlength="60" value="' + esc(h.name) + '" placeholder="例：〇〇動物病院"></label>' +
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
      db.pets.push({ id: petId, name: 'こむぎ', species: 'dog', breed: '柴犬', birthday: (d.getFullYear() - 4) + '-04-12', sex: 'female_spayed', weight: '8.4', memo: '鶏肉アレルギーあり', createdAt: new Date().toISOString() });
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
    const data = { petId: f.get('petId'), type: f.get('type') || 'other', title: String(f.get('title') || '').trim(), dueAt: String(f.get('dueAt') || '').slice(0, 16), repeat: f.get('repeat') || 'none', memo: String(f.get('memo') || '').trim() };
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
        r.dueAt = next;
      }
      if (r.type === 'medicine') db.logs.push({ id: uid(), petId: r.petId, category: 'medicine', datetime: nowLocal(), memo: r.title || r.memo || '', value: '', createdAt: new Date().toISOString() });
    });
    if (!ok) return;
    closeSheet();
    rerender();
    toast((r.title || t.label) + 'を完了しました' + (r.type === 'medicine' ? '（服薬を記録）' : '') + (r.done ? '' : '／次回 ' + fmtShort(r.dueAt)));
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
    if (RRULE[r.repeat]) lines.push('RRULE:' + RRULE[r.repeat]);
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
    if (RRULE[r.repeat]) url += '&recur=' + encodeURIComponent('RRULE:' + RRULE[r.repeat]);
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
      '<label class="check"><input type="checkbox" name="profileMemo"> <span>プロフィールの補足メモ（持病・アレルギーなど）を含める</span></label>' +
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
    if (f.get('memo') && !form.querySelector('.share-memo').hidden) {
      const m = pendingShareMemo && pet.id === (iv && iv.a.petId) ? pendingShareMemo : (latestMemoFor(pet.id) || {}).text;
      memo = m || '';
    }
    const logs = days ? recentLogs(pet.id, days * 24).slice(0, 120).map((l) => [l.datetime, l.category, l.value || '', (l.memo || '').slice(0, 200)]) : [];
    const payload = {
      v: 1, c: nowLocal(), x: Date.now() + hours * 3600000,
      p: { n: pet.name, s: pet.species, b: pet.breed, bd: pet.birthday, sx: pet.sex, w: pet.weight, m: f.get('profileMemo') ? pet.memo : '' },
      memo: memo, d: days, l: logs
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
    editLog: (el) => { const l = db.logs.find((x) => x.id === el.dataset.id); if (l) openLogForm(Object.assign({}, l)); },
    deleteLog: (el) => {
      if (!confirm('この記録を削除しますか？')) return;
      if (commit(() => { db.logs = db.logs.filter((l) => l.id !== el.dataset.id); })) { closeSheet(); toast('削除しました'); rerender(); }
    },
    clearFilter: () => { logFilter.petId = 'all'; logFilter.date = ''; logFilter.category = 'all'; rerender(); },
    exportCsv: () => exportCsv(filteredLogs()),
    exportAllCsv: () => exportCsv(db.logs),
    exportJson: exportJson,
    editHospital: () => openSheet('かかりつけの動物病院', hospitalFormHtml()),
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
      const memo = { id: uid(), petId: iv.a.petId, petName: p ? p.name : '', createdAt: nowLocal(), summary: iv.a.symptoms.join('、') || iv.a.symptomOther.slice(0, 30), text: buildMemo(iv.a) };
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
    else if (type === 'hospital') {
      const f = new FormData(form);
      const data = { name: String(f.get('name') || '').trim(), phone: String(f.get('phone') || '').trim(), note: String(f.get('note') || '').trim() };
      if (data.phone && !/^[\d+\-() ]{3,20}$/.test(data.phone)) return showFormError(form.querySelector('.form-error'), '電話番号は数字とハイフンで入力してください。');
      if (commit(() => { db.settings.hospital = data; })) { closeSheet(); toast('保存しました'); rerender(); }
    }
  });

  function handleInput(e) {
    const el = e.target;
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
