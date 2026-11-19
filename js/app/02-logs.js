/* PAWCARE logs（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * 健康記録
 * ============================================================ */
const logFilter = { petId: 'all', date: '', category: 'all' };
/* 飼い方のめやす：表示中の動物と品種（未選択ならいま選んでいるペット） */
const guideSel = { species: '', breed: '' };
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
    html += adSlotHtml('logs');
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
  html += '<label class="weight-field"' + (log.category === 'weight' ? '' : ' hidden') + '>体重（kg）<input type="number" name="value" inputmode="decimal" step="0.001" min="0" max="200" value="' + esc(log.value || '') + '"></label>';
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
    data.value = String(Math.round(w * 1000) / 1000);
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
