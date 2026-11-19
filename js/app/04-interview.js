/* PAWCARE interview（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

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
    D.DANGER_SIGNS.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul><p class="small">※この一覧は犬・猫を中心にした一般的な目安で、獣医師による監修を準備中です。迷ったら動物病院に電話で相談してください。</p>' + exoticNoteHtml() + '</div>';
}

/* 犬・猫以外の動物を飼っているときの一般的な案内（病名や基準は示さない） */
function exoticNoteHtml() {
  const pet = activePet();
  if (!pet || D.DOG_CAT.indexOf(pet.species) >= 0) return '';
  return '<p class="small exotic-note"><strong>' + esc(speciesOf(pet.species).label) + 'の場合：</strong>具合の悪いサインは動物ごとに大きく違い、上の一覧に当てはまらないこともあります。食べない・動かない・いつもと様子が違うなど、小さな変化でも早めに、' + esc(speciesOf(pet.species).label) + 'を診られる動物病院に相談してください。</p>';
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
