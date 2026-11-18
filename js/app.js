/* PAWCARE アプリ本体（依存ライブラリなし・静的ホスティング用） */
'use strict';

(function () {
  const D = window.PAWCARE_DATA;
  const APP_VERSION = '1.0.0';
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
  const VIEWS = ['home', 'logs', 'interview', 'pets', 'emergency', 'settings'];
  let currentView = 'home';
  function go(view) {
    if (location.hash !== '#/' + view) location.hash = '#/' + view;
    else render();
  }
  function viewFromHash() {
    const v = (location.hash || '').replace(/^#\/?/, '');
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
    const fn = { home: renderHome, logs: renderLogs, interview: renderInterview, pets: renderPets, emergency: renderEmergency, settings: renderSettings }[currentView];
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
    D.CATEGORIES.forEach((c) => {
      html += '<button type="button" class="quick-btn" data-action="quick" data-cat="' + c.id + '" style="--c:' + c.color + '"><span aria-hidden="true">' + c.emoji + '</span>' + esc(c.label) + '</button>';
    });
    html += '</div><button type="button" class="btn ghost block" data-action="newLog">日時・メモを入力して記録</button></section>';

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
    html += '<label>動物の種類<select name="species" data-change="species">' + optionsHtml(D.SPECIES, p.species || 'dog') + '</select></label>';
    html += '<div class="breed-wrap">' + breedSelectHtml(p.species || 'dog', p.breed || '') + '</div>';
    html += '<div class="two-col"><label>生年月日<input type="date" name="birthday" max="' + todayStr() + '" value="' + esc(p.birthday || '') + '"></label>';
    html += '<label>性別<select name="sex">' + optionsHtml(D.SEXES, p.sex || '', '選択') + '</select></label></div>';
    html += '<label>体重（kg）<input type="number" name="weight" inputmode="decimal" step="0.01" min="0" max="200" value="' + esc(p.weight || '') + '" placeholder="例：5.2"></label>';
    html += '<label>補足メモ<textarea name="memo" rows="3" maxlength="1000" placeholder="持病・アレルギー・服用中の薬・かかりつけ病院など">' + esc(p.memo || '') + '</textarea></label>';
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
      (compact ? '' : '<p>入力された内容には、急いで獣医師に相談すべき兆候が含まれています。</p>') +
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
          '<button type="button" class="btn ghost block" data-action="ivRestart">新しく問診をやり直す</button></div>' +
          '<p class="disclaimer">このメモは飼い主様の入力内容を整理したものであり、診断ではありません。受診の要否や緊急度は動物病院にご相談ください。</p>';
      }
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
      D.DANGER_SIGNS.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul></div>';
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

    html += '<section class="card"><h2>💾 バックアップ</h2><p class="muted small">すべてのデータ（ペット・記録・問診メモ・設定）を1つのファイルに書き出します。機種変更時はこのファイルを読み込んでください。</p>' +
      '<div class="form-actions"><button type="button" class="btn primary block" data-action="exportJson">バックアップを書き出す（JSON）</button>' +
      '<label class="btn ghost block file-btn">バックアップから復元<input type="file" accept="application/json,.json" data-action-change="importJson"></label>' +
      '<button type="button" class="btn ghost block" data-action="exportAllCsv"' + (db.logs.length ? '' : ' disabled') + '>すべての記録をCSVで書き出す</button></div></section>';

    html += '<section class="card"><h2>📱 ホーム画面に追加</h2><p class="muted small">iPhone（Safari）：共有ボタン →「ホーム画面に追加」<br>Android（Chrome）：右上メニュー →「ホーム画面に追加」または「アプリをインストール」</p></section>';

    html += '<section class="card"><h2>このアプリについて</h2><p class="small">PAWCARE デモ版 v' + APP_VERSION + '</p><p class="muted small">本アプリは健康記録と情報整理のためのツールです。病気の診断、治療方針の決定、緊急度の判定は行いません。体調に不安があるときは動物病院にご相談ください。</p>' +
      '<p class="muted small">ペット ' + db.pets.length + '頭／記録 ' + db.logs.length + '件／問診メモ ' + db.memos.length + '件</p>' +
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
      if (!next.pets.length && !next.logs.length) { toast('復元できるデータが見つかりませんでした'); return; }
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
      if (!confirm(p.name + 'を削除しますか？\n健康記録' + n + '件も一緒に削除されます。この操作は取り消せません。')) return;
      if (commit(() => {
        db.pets = db.pets.filter((x) => x.id !== p.id);
        db.logs = db.logs.filter((l) => l.petId !== p.id);
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
      return;
    }
    if (el.dataset.change === 'breed') {
      const other = el.form.querySelector('.breed-other');
      other.hidden = el.value !== 'その他';
      if (!other.hidden) other.querySelector('input').focus();
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
