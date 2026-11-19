/* PAWCARE visits（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

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
