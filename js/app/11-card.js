/* PAWCARE card（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

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
    '<button type="button" class="btn ghost block" data-action="sendCard">家族・預け先に送る</button>' +
    '<button type="button" class="btn ghost block" data-nav="book">📘 健康手帳（これまでの記録を1冊に）</button></div>';
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
  num: (v) => (/^\d{1,3}(\.\d{1,3})?$/.test(String(v)) ? String(v) : ''),
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
