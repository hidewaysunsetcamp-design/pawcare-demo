/* PAWCARE nutrition（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * ごはんチェック（栄養の目安。AIなし・無料版）
 * 一般的な基準での計算だけを行い、診断・治療・療法食の指示はしない
 * ============================================================ */
const NU = D.NUTRITION;
function monthsOld(pet) {
  const b = parseLocal(pet.birthday);
  if (!b) return null;
  const n = new Date();
  return (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth()) - (n.getDate() < b.getDate() ? 1 : 0);
}
function foodTypeLabel(id) { const t = NU.foodTypes.find((x) => x.id === id); return t ? t.label : ''; }
function foodKcal(f) { return f.kcal && f.grams ? (+f.kcal) * (+f.grams) / 100 : 0; }
function round(n, d) { const m = Math.pow(10, d || 0); return Math.round(n * m) / m; }

function nutritionAnalysis(pet) {
  const nu = pet.nutri || {};
  if (pet.species !== 'dog' && pet.species !== 'cat') return { stop: '今のところ、ごはんチェックは犬・猫のみに対応しています。' };
  if (nu.restricted) return { stop: '療法食を食べている子や、持病で食事の指示を受けている子は、このチェックの対象外です。かかりつけの先生の指示に従ってください。' };
  if (nu.pregnant) return { stop: '妊娠中・授乳中は必要な栄養とカロリーが大きく変わるため、このチェックの対象外です。かかりつけの先生に相談してください。' };
  const foods = db.foods.filter((f) => f.petId === pet.id);
  const months = monthsOld(pet);
  const growth = months !== null && months < 12;
  const res = { foods: foods, growth: growth, findings: [], suggestions: [], need: null, total: 0 };
  if (!foods.length) return res;
  const sum = (types) => foods.filter((f) => types.indexOf(f.type) >= 0).reduce((a, f) => a + foodKcal(f), 0);
  res.total = sum(['complete', 'general', 'treat', 'homemade']);
  const complete = sum(['complete']);
  const extras = sum(['treat', 'homemade']);
  const homemade = sum(['homemade']);
  const missingKcal = foods.filter((f) => !f.kcal || !f.grams);
  if (missingKcal.length) res.findings.push({ level: 'info', text: 'カロリーか量が未入力の食品があります（' + missingKcal.map((f) => f.name).join('、') + '）。合計にはふくまれていません。' });

  if (pet.weight && !growth) {
    const rer = 70 * Math.pow(+pet.weight, 0.75);
    const intact = pet.sex === 'male' || pet.sex === 'female';
    const factor = NU.factor[pet.species][intact ? 'intact' : 'neutered'];
    res.need = Math.round(rer * factor);
    if (res.total) {
      const r = res.total / res.need;
      if (r < 0.8) res.findings.push({ level: 'warn', text: '1日の合計 約' + Math.round(res.total) + 'kcal は、目安（約' + res.need + 'kcal）より少なめです。体重が減っていないか記録で確認し、気になるときは先生に相談してください。' });
      else if (r > 1.2) res.findings.push({ level: 'warn', text: '1日の合計 約' + Math.round(res.total) + 'kcal は、目安（約' + res.need + 'kcal）より多めです。体重が増えていないか記録で確認し、量を変えるときは先生に相談してください。' });
      else res.findings.push({ level: 'ok', text: '1日の合計 約' + Math.round(res.total) + 'kcal で、目安（約' + res.need + 'kcal）の範囲です。' });
    }
  } else if (growth) {
    res.findings.push({ level: 'info', text: '1歳未満の成長期は必要なカロリーが大きく変わるため、量の目安は表示しません。フードの給与量表と先生の指示を目安にしてください。' });
  } else {
    res.findings.push({ level: 'info', text: 'ペット情報に体重を登録すると、1日の目安カロリーを計算できます。' });
  }

  if (!foods.some((f) => f.type === 'complete')) {
    res.findings.push({ level: 'warn', text: '「総合栄養食」が入っていません。一般食・おやつ・手作りだけでは、栄養が偏るおそれがあります。' });
    res.suggestions.push('主食に、年齢に合った「総合栄養食」（パッケージにそう書かれたフード）を使う');
  } else if (res.total && complete / res.total < 0.9) {
    res.findings.push({ level: 'info', text: '総合栄養食以外が1日のカロリーの約' + Math.round((1 - complete / res.total) * 100) + '%をしめています。' });
  }
  if (res.total && extras / res.total > NU.treatLimit) {
    res.findings.push({ level: 'warn', text: 'おやつ・人の食べ物が1日のカロリーの約' + Math.round(extras / res.total * 100) + '%です。一般的な目安は10%までです。' });
  }
  if (res.total && homemade / res.total >= 0.5) {
    res.findings.push({ level: 'warn', text: '手作り・人の食べ物が中心の食事は、カルシウムなどのミネラルやビタミンが不足しやすいとされます' + (pet.species === 'cat' ? '（猫は必須のタウリンも不足しやすい）' : '') + '。サプリメントで補う前に、先生にレシピを見てもらってください。' });
  }

  const prof = NU.aafco[pet.species][growth ? 'growth' : 'adult'];
  let proteinLow = false;
  foods.filter((f) => f.type === 'complete' && f.moisture !== '' && f.moisture != null && +f.moisture < 100).forEach((f) => {
    const dm = 100 - (+f.moisture);
    [['protein', '粗たんぱく質'], ['fat', '粗脂肪']].forEach(([k, label]) => {
      if (f[k] === '' || f[k] == null) return;
      const v = round(+f[k] / dm * 100, 1);
      if (v < prof[k]) {
        if (k === 'protein') proteinLow = true;
        res.findings.push({ level: 'warn', text: f.name + 'の' + label + '（水分を除いた量 ' + v + '%）が、AAFCOの' + (growth ? '成長期' : '成犬・成猫') + '向けの最低値（' + prof[k] + '%）を下回って見えます。表示の読み取り違いがないか確認し、主食として合っているか先生に相談してください。' });
      } else {
        res.findings.push({ level: 'ok', text: f.name + 'の' + label + 'は、水分を除いて ' + v + '%（AAFCOの最低値 ' + prof[k] + '% 以上）です。' });
      }
    });
  });
  const allergyChicken = /鶏/.test(pet.memo || '') && /アレルギー/.test(pet.memo || '');
  if (proteinLow) {
    res.suggestions.push(allergyChicken
      ? 'たんぱく質を足す食品は、補足メモに鶏肉アレルギーの記載があるため、先生にたんぱく源を相談する'
      : '味付けをしない、加熱した鶏むね肉やささみ（皮と骨を除く）' + (pet.species === 'cat' ? '、骨を除いた加熱した白身魚' : '') + 'を少量トッピングする（おやつと合わせて1日のカロリーの10%以内）');
  }
  if (/アレルギー/.test(pet.memo || '')) res.findings.push({ level: 'info', text: '補足メモにアレルギーの記載があります。新しい食材を足す前に、先生に確認してください。' });
  return res;
}

function renderNutrition() {
  let html = '<h1 class="page-title">🍚 ごはんチェック</h1>';
  const pet = activePet();
  if (!pet) return html + '<section class="card"><p>ペットを登録すると使えます。</p><button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button></section>';
  html += petChips(pet.id, 'selectPet');
  html += '<p class="notice-small">パッケージの成分表示とあげている量から、一般的な基準での目安を計算します。診断や治療ではありません。</p>';
  const nu = pet.nutri || {};
  html += '<section class="card"><h2>' + esc(pet.name) + 'について</h2>' +
    '<label class="check"><input type="checkbox" data-nutri="restricted"' + (nu.restricted ? ' checked' : '') + '> 療法食を食べている、または持病で食事の指示を受けている</label>' +
    '<label class="check"><input type="checkbox" data-nutri="pregnant"' + (nu.pregnant ? ' checked' : '') + '> 妊娠中・授乳中</label></section>';
  const a = nutritionAnalysis(pet);
  if (a.stop) return html + '<div class="alert warn">' + esc(a.stop) + '</div>' + toxicCheckHtml(pet);

  html += upsellHtml('pro');
  html += '<section class="card"><div class="row-between"><h2>あげているもの（1日分）</h2><button type="button" class="btn primary small" data-action="newFood">＋ 追加</button></div>';
  html += a.foods.length ? '<ul class="log-list">' + a.foods.map((f) =>
    '<li><button type="button" class="log-item" data-action="editFood" data-id="' + esc(f.id) + '"><span class="log-main"><span class="log-cat">' + esc(f.name) + '</span><span class="log-memo">' + esc(foodTypeLabel(f.type)) + '・' + (f.grams ? esc(f.grams) + 'g' : '量未入力') + (foodKcal(f) ? '・約' + Math.round(foodKcal(f)) + 'kcal' : '') + '</span></span><span class="chev" aria-hidden="true">›</span></button></li>').join('') + '</ul>'
    : '<p class="empty">まだ登録されていません。主食のフード、トッピング、おやつを1日分ずつ登録してください。</p>';
  html += '</section>';

  if (a.foods.length) {
    html += '<section class="card"><h2>チェック結果</h2>' + (a.need ? '<p class="nu-need">1日の目安：<strong>約' + a.need + 'kcal</strong><small>体重' + esc(pet.weight) + 'kgからの計算。個体差があります</small></p>' : '') +
      '<ul class="nu-findings">' + a.findings.map((x) => '<li class="nu-' + x.level + '"><span aria-hidden="true">' + (x.level === 'ok' ? '✅' : x.level === 'warn' ? '⚠️' : 'ℹ️') + '</span><span>' + esc(x.text) + '</span></li>').join('') + '</ul>';
    if (a.suggestions.length) {
      html += '<p class="sub">補える食品のタイプ</p><ul class="nu-sugg">' + a.suggestions.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
        '<p class="muted small">新しい食品は少量から始め、体調の変化があればやめて先生に相談してください。</p>';
    }
    html += '<p class="disclaimer">計算の根拠：1日の目安は「70×体重(kg)の0.75乗」に一般的な係数（犬1.6〜1.8・猫1.2〜1.4）をかけた値。成分はAAFCOの栄養基準（水分を除いた量での最低値）、おやつは1日のカロリーの10%までという一般的な目安です。表示の成分値は最低保証値のため、実際の量とは異なります。</p></section>';
  }
  return html + toxicCheckHtml(pet);
}

function toxicCheckHtml(pet) {
  return '<section class="card"><h2>⚠️ 人の食べ物チェック</h2><p class="muted small">食べてしまった・あげようとしているものを入力すると、特に危険とされる食材に当てはまるかを確認します。</p>' +
    '<div class="toxic-row"><input id="toxicInput" maxlength="100" placeholder="例：ぶどう、玉ねぎ入りハンバーグ"><button type="button" class="btn primary small" data-action="toxicCheck">確認</button></div><div id="toxicResult"></div></section>';
}
function toxicCheck() {
  const pet = activePet();
  const input = document.getElementById('toxicInput');
  const out = document.getElementById('toxicResult');
  if (!input || !out) return;
  const text = input.value.trim();
  if (!text) { out.innerHTML = ''; return; }
  const sp = pet ? pet.species : 'dog';
  const hits = NU.toxic.filter((t) => (t.both || t[sp]) && t.k.some((k) => text.indexOf(k) >= 0));
  if (hits.length) {
    const h = db.settings.hospital, nt = db.settings.night;
    out.innerHTML = '<div class="alert danger"><strong>' + esc(hits.map((x) => x.name).join('、')) + 'は、' + (sp === 'cat' ? '猫' : '犬') + 'にとって特に危険とされる食材です。</strong><p>食べた・飲み込んだ可能性がある場合は、様子を見ずに今すぐ動物病院へ電話してください。何を・どれくらい・いつ食べたかを伝えられるようにしておきましょう。</p><div class="btn-row">' +
      (h.phone ? '<a class="btn danger small" href="tel:' + esc(h.phone.replace(/[^\d+]/g, '')) + '">📞 ' + esc(h.name || 'かかりつけ') + '</a>' : '') +
      (nt.phone ? '<a class="btn danger-ghost small" href="tel:' + esc(nt.phone.replace(/[^\d+]/g, '')) + '">🌙 ' + esc(nt.name || '夜間・救急') + '</a>' : '') +
      '<button type="button" class="btn danger-ghost small" data-nav="emergency">緊急時の案内</button></div>' +
      '<button type="button" class="btn danger block" data-action="recordIngest">食べてしまった → 誤食として記録して電話する</button></div>';
  } else {
    out.innerHTML = '<div class="alert warn">登録されている「特に危険な食材」には当てはまりませんでした。ただし、<strong>安全だという意味ではありません</strong>。味付け・量・体質によって体調を崩すことがあります。食べたあとに様子がおかしいときや不安なときは、動物病院に相談してください。</div>';
  }
}

function foodFormHtml(f) {
  return '<form data-form="food" novalidate><input type="hidden" name="id" value="' + esc(f.id || '') + '">' +
    '<label>名前<input name="name" maxlength="40" required value="' + esc(f.name || '') + '" placeholder="例：いつものドライフード"></label>' +
    '<label>種類<select name="type">' + optionsHtml(NU.foodTypes, f.type || 'complete') + '</select></label>' +
    '<label>1日にあげる量（g）<input name="grams" type="number" inputmode="decimal" step="0.1" min="0" max="5000" value="' + esc(f.grams || '') + '"></label>' +
    '<label>カロリー（100gあたり kcal）<input name="kcal" type="number" inputmode="decimal" step="0.1" min="0" max="1000" value="' + esc(f.kcal || '') + '" placeholder="パッケージの「代謝エネルギー」"></label>' +
    '<p class="sub">成分表示（パッケージの「保証成分」）</p><div class="two-col">' +
    '<label>粗たんぱく質（%）<input name="protein" type="number" inputmode="decimal" step="0.1" min="0" max="100" value="' + esc(f.protein == null ? '' : f.protein) + '"></label>' +
    '<label>粗脂肪（%）<input name="fat" type="number" inputmode="decimal" step="0.1" min="0" max="100" value="' + esc(f.fat == null ? '' : f.fat) + '"></label>' +
    '<label>水分（%）<input name="moisture" type="number" inputmode="decimal" step="0.1" min="0" max="99" value="' + esc(f.moisture == null ? '' : f.moisture) + '"></label></div>' +
    '<p class="muted small">「1kgあたり」の表示は10で割ると100gあたりになります。成分が分からない食品は空欄でかまいません。</p>' +
    '<p class="form-error" hidden></p><div class="form-actions"><button type="submit" class="btn primary block">' + (f.id ? '保存する' : '追加する') + '</button>' +
    (f.id ? '<button type="button" class="btn danger-ghost block" data-action="deleteFood" data-id="' + esc(f.id) + '">削除</button>' : '') + '</div></form>';
}
function saveFoodForm(form) {
  const fd = new FormData(form);
  const err = form.querySelector('.form-error');
  const pet = activePet();
  const name = String(fd.get('name') || '').trim();
  if (!pet) return;
  if (!name) return showFormError(err, '名前を入力してください。');
  const num = (k, max) => { const v = String(fd.get(k) || '').trim(); if (!v) return ''; const n = parseFloat(v); return n >= 0 && n <= max ? String(round(n, 1)) : null; };
  const data = { name: name, type: fd.get('type') || 'complete', grams: num('grams', 5000), kcal: num('kcal', 1000), protein: num('protein', 100), fat: num('fat', 100), moisture: num('moisture', 99) };
  if (Object.values(data).some((v) => v === null)) return showFormError(err, '数値の範囲を確認してください。');
  const id = fd.get('id');
  if (commit(() => {
    if (id) { const f = db.foods.find((x) => x.id === id); if (f) Object.assign(f, data); }
    else db.foods.push(Object.assign({ id: uid(), petId: pet.id }, data));
  })) { closeSheet(); toast('保存しました'); rerender(); }
}
