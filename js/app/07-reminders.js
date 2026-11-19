/* PAWCARE reminders（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

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
    if (['vaccine', 'prevent', 'checkup'].indexOf(r.type) >= 0) db.care.push({ id: uid(), petId: r.petId, type: r.type, title: r.title || reminderTypeOf(r.type).label, memo: '', date: todayStr(), source: 'reminder' });
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
