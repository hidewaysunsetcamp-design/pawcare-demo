/* PAWCARE ingest（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

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
