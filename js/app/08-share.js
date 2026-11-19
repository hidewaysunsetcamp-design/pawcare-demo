/* PAWCARE share（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

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
  const num = (v) => (/^\d{1,3}(\.\d{1,3})?$/.test(String(v)) ? String(v) : '');
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
