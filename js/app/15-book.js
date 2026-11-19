/* PAWCARE book（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * 健康手帳（生涯の記録を1冊に。PDF保存・ファイル書き出し）
 * ============================================================ */
const CARE_TYPES = [{ id: 'vaccine', label: 'ワクチン' }, { id: 'prevent', label: 'ノミ・ダニ・フィラリア予防' }, { id: 'checkup', label: '健康診断・通院' }, { id: 'other', label: 'その他' }];
function careLabel(id) { const t = CARE_TYPES.find((x) => x.id === id); return t ? t.label : 'その他'; }
function weightChartSvg(points) {
  /* 単一系列の折れ線：2pxの線・8pxの点・薄い目盛り。凡例なし（見出しが系列名） */
  if (points.length < 2) return '';
  const W = 640, H = 220, L = 48, R = 16, T = 16, B = 34;
  const t0 = parseLocal(points[0].d).getTime(), t1 = parseLocal(points[points.length - 1].d).getTime();
  let lo = Math.min.apply(null, points.map((p) => p.w)), hi = Math.max.apply(null, points.map((p) => p.w));
  const pad = Math.max(0.2, (hi - lo) * 0.15); lo = Math.max(0, lo - pad); hi += pad;
  const x = (d) => L + (t1 === t0 ? 0.5 : (parseLocal(d).getTime() - t0) / (t1 - t0)) * (W - L - R);
  const y = (w) => T + (1 - (w - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  let svg = '<svg class="wchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="体重の推移の折れ線グラフ（下に表もあります）">';
  ticks.forEach((v) => { svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="wgrid"/><text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" class="wtick" text-anchor="end">' + v.toFixed(1) + '</text>'; });
  [points[0], points[points.length - 1]].forEach((p, i) => { svg += '<text x="' + x(p.d).toFixed(1) + '" y="' + (H - 10) + '" class="wtick" text-anchor="' + (i ? 'end' : 'start') + '">' + esc(p.d.slice(0, 10).replace(/-/g, '/')) + '</text>'; });
  svg += '<polyline class="wline" points="' + points.map((p) => x(p.d).toFixed(1) + ',' + y(p.w).toFixed(1)).join(' ') + '"/>';
  points.forEach((p) => { svg += '<g class="wpt"><circle cx="' + x(p.d).toFixed(1) + '" cy="' + y(p.w).toFixed(1) + '" r="10" class="whit"/><circle cx="' + x(p.d).toFixed(1) + '" cy="' + y(p.w).toFixed(1) + '" r="4" class="wdot"/><title>' + esc(p.d.slice(0, 10).replace(/-/g, '/') + '：' + p.w + 'kg') + '</title></g>'; });
  const lastP = points[points.length - 1];
  svg += '<text x="' + (x(lastP.d) - 8).toFixed(1) + '" y="' + (y(lastP.w) - 10).toFixed(1) + '" class="wlabel" text-anchor="end">' + lastP.w + 'kg</text>';
  return svg + '</svg>';
}
function renderBook() {
  const pet = activePet();
  let html = '<h1 class="page-title no-print">📘 健康手帳</h1>';
  if (!pet) return html + '<section class="card"><button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button></section>';
  html += '<div class="no-print">' + petChips(pet.id, 'selectPet') + '<p class="notice-small">' + esc(pet.name) + 'の記録を1冊にまとめます。病院を変えるとき・引っ越しのとき・預けるときに見せたり渡したりできます。</p>' +
    '<div class="form-actions"><button type="button" class="btn primary block" data-action="printView">PDFで保存・印刷</button>' +
    '<p class="muted small">印刷画面で「PDFに保存」を選ぶとPDFになります（iPhoneは共有→「プリント」→2本指で拡大→共有）。</p>' +
    '<button type="button" class="btn ghost block" data-action="exportBook">手帳ファイルを書き出す（別の端末へ移すとき）</button></div></div>';
  const s = db.settings;
  const sp = speciesOf(pet.species);
  html += '<section class="card book-cover"><p class="tag">PAWCARE 健康手帳</p><h1>' + sp.emoji + ' ' + esc(pet.name) + '</h1><dl class="kp-dl">' +
    [['種類', sp.label + (pet.breed ? '・' + pet.breed : '')], ['生年月日', pet.birthday ? pet.birthday.replace(/-/g, '/') + '（' + ageText(pet.birthday) + '）' : ''], ['性別', sexLabel(pet.sex)],
      ['マイクロチップ', pet.microchip || ''], ['保険', [pet.insurer, pet.policyNo].filter(Boolean).join(' ／ ')], ['かかりつけ', [s.hospital.name, s.hospital.phone].filter(Boolean).join(' ')],
      ['飼い主', [s.owner.name, s.owner.phone].filter(Boolean).join(' ')]]
      .filter((r) => r[1]).map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') +
    '</dl><p class="muted small">作成：' + esc(fmtDateTime(nowLocal())) + '　／　飼い主が記録した内容で、獣医師の確認を受けたものではありません。</p></section>';

  html += cardHtml(cardData(pet));

  const ws = logsSorted(db.logs.filter((l) => l.petId === pet.id && l.category === 'weight' && l.value)).reverse().map((l) => ({ d: l.datetime, w: +l.value }));
  html += '<section class="card"><h2>体重の推移</h2>' + (ws.length >= 2 ? weightChartSvg(ws) : '<p class="empty">体重の記録が2回以上になるとグラフを表示します。</p>') +
    (ws.length ? '<table class="shared-table"><thead><tr><th>日付</th><th>体重</th></tr></thead><tbody>' + ws.slice().reverse().slice(0, 24).map((p) => '<tr><td>' + esc(fmtShort(p.d).split(' ')[0]) + (p.d.slice(0, 4) !== String(new Date().getFullYear()) ? '（' + p.d.slice(0, 4) + '）' : '') + '</td><td>' + esc(String(p.w)) + ' kg</td></tr>').join('') + '</tbody></table>' : '') + '</section>';

  const visits = db.visits.filter((v) => v.petId === pet.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  html += '<section class="card"><div class="row-between"><h2>受診の記録</h2><button type="button" class="btn ghost small no-print" data-action="newVisit">＋ 追加</button></div>' + (visits.length ? '<table class="shared-table"><thead><tr><th>日付</th><th>病院・理由</th><th>先生に言われたこと・処方</th></tr></thead><tbody>' +
    visits.map((v) => '<tr><td>' + esc(v.date.replace(/-/g, '/')) + '</td><td>' + esc(visitHospitalName(v)) + (v.reason ? '<br>' + esc(v.reason) : '') + '</td><td>' + esc(v.vetSaid || '') + ((v.meds || []).length ? '<br><small>処方：' + esc(v.meds.map((m) => m.name + (m.days ? ' ' + m.days + '日分' : '')).join('、')) + '</small>' : '') + '</td></tr>').join('') + '</tbody></table>' : '<p class="empty">受診の記録はまだありません。</p>') + '</section>';

  const care = db.care.filter((c) => c.petId === pet.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  html += '<section class="card"><div class="row-between"><h2>ワクチン・予防・健康診断</h2><button type="button" class="btn ghost small no-print" data-action="newCare">＋ 追加</button></div>' +
    '<p class="muted small no-print">予定を「完了」にすると自動でここに残ります。過去の分は「＋ 追加」で入力できます。</p>' +
    (care.length ? '<table class="shared-table"><thead><tr><th>日付</th><th>種類</th><th>内容</th></tr></thead><tbody>' + care.map((c) => '<tr><td>' + esc(c.date.replace(/-/g, '/')) + '</td><td>' + esc(careLabel(c.type)) + '</td><td>' + esc(c.title || '') + (c.memo ? '<br><small>' + esc(c.memo) + '</small>' : '') + ' <button type="button" class="link no-print" data-action="editCare" data-id="' + esc(c.id) + '">編集</button></td></tr>').join('') + '</tbody></table>' : '<p class="empty">まだ記録はありません。</p>') + '</section>';

  const memos = db.memos.filter((m) => m.petId === pet.id).slice().reverse();
  if (memos.length) html += '<section class="card"><h2>問診メモの履歴</h2><ul class="book-list">' + memos.slice(0, 30).map((m) => '<li>' + esc(fmtDateTime(m.createdAt)) + '　' + esc(m.summary || '') + '</li>').join('') + '</ul></section>';
  return html;
}
function careFormHtml(c) {
  return '<form data-form="care" novalidate><input type="hidden" name="id" value="' + esc(c.id || '') + '">' +
    '<label>日付<input type="date" name="date" max="' + todayStr() + '" value="' + esc(c.date || '') + '"></label>' +
    '<label>種類<select name="type">' + optionsHtml(CARE_TYPES, c.type || 'vaccine') + '</select></label>' +
    '<label>内容<input name="title" maxlength="60" value="' + esc(c.title || '') + '" placeholder="例：混合ワクチン、狂犬病予防注射"></label>' +
    '<label>メモ<input name="memo" maxlength="200" value="' + esc(c.memo || '') + '" placeholder="例：〇〇動物病院"></label>' +
    '<p class="form-error" hidden></p><div class="form-actions"><button type="submit" class="btn primary block">保存する</button>' +
    (c.id ? '<button type="button" class="btn danger-ghost block" data-action="deleteCare" data-id="' + esc(c.id) + '">削除</button>' : '') + '</div></form>';
}
function saveCareForm(form) {
  const f = new FormData(form);
  const pet = activePet();
  const date = String(f.get('date') || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showFormError(form.querySelector('.form-error'), '日付を入力してください。');
  const data = { date: date, type: CARE_TYPES.some((x) => x.id === f.get('type')) ? f.get('type') : 'other', title: String(f.get('title') || '').trim().slice(0, 60), memo: String(f.get('memo') || '').trim().slice(0, 200) };
  const id = f.get('id');
  if (commit(() => {
    if (id) { const c = db.care.find((x) => x.id === id); if (c) Object.assign(c, data); }
    else db.care.push(Object.assign({ id: uid(), petId: pet.id, source: 'manual' }, data));
  })) { closeSheet(); toast('保存しました'); rerender(); }
}
function exportBook() {
  const pet = activePet();
  if (!pet) return;
  const own = (arr) => arr.filter((x) => x.petId === pet.id);
  const book = { app: 'PAWCARE', kind: 'book', format: 1, exportedAt: new Date().toISOString(),
    data: { pets: [pet], logs: own(db.logs), visits: own(db.visits), care: own(db.care), foods: own(db.foods), memos: own(db.memos), reminders: own(db.reminders) } };
  download('pawcare-book-' + pet.name + '-' + todayStr() + '.json', JSON.stringify(book, null, 2), 'application/json');
}
/* 手帳ファイルの取り込み：今のデータは消さず、同じIDの記録は追加しない */
function mergeBook(parsed) {
  const n = normalizeDb(parsed.data);
  const pet = n.pets[0];
  if (!pet) { toast('手帳ファイルにペットの情報がありません'); return; }
  const exists = getPet(pet.id);
  if (!confirm(exists ? '「' + exists.name + '」に手帳の記録を追加します。今の記録は消えません。よろしいですか？' : '「' + pet.name + '」を新しいペットとして追加します。よろしいですか？')) return;
  let added = 0;
  if (commit(() => {
    if (!exists) db.pets.push(pet);
    ['logs', 'visits', 'care', 'foods', 'memos', 'reminders'].forEach((k) => {
      const ids = new Set(db[k].map((x) => x.id));
      n[k].forEach((x) => { if (!ids.has(x.id)) { db[k].push(x); added += 1; } });
    });
    db.settings.activePetId = pet.id;
  })) { toast(pet.name + 'の手帳を取り込みました（' + added + '件追加）'); go('book'); }
}
