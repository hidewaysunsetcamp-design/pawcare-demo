/* PAWCARE pets（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

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
      '<button type="button" class="btn ghost small" data-action="openShare" data-id="' + esc(p.id) + '">病院に共有</button>' +
      '<button type="button" class="btn ghost small" data-action="openBook" data-id="' + esc(p.id) + '">📘 健康手帳</button>' +
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
  const sp0 = p.species || 'dog';
  html += '<fieldset><legend>動物の種類</legend><div class="species-big">' + D.SPECIES.map((s) => s.id).map((id) =>
    '<button type="button" class="species-btn' + (sp0 === id ? ' active' : '') + '" data-action="pickSpecies" data-value="' + id + '"><span class="sp-emoji" aria-hidden="true">' + speciesOf(id).emoji + '</span>' + esc(speciesOf(id).label) + '</button>').join('') + '</div>' +
    '<label class="small muted">一覧から選ぶ<select name="species" data-change="species">' + optionsHtml(D.SPECIES, sp0) + '</select></label></fieldset>';
  html += '<div class="breed-wrap">' + breedSelectHtml(p.species || 'dog', p.breed || '') + '</div>';
  html += '<div class="two-col"><label>生年月日<input type="date" name="birthday" max="' + todayStr() + '" value="' + esc(p.birthday || '') + '"></label>';
  html += '<label>性別<select name="sex">' + optionsHtml(D.SEXES, p.sex || '', '選択') + '</select></label></div>';
  html += '<label>体重（kg）<input type="number" name="weight" inputmode="decimal" step="0.001" min="0" max="200" value="' + esc(p.weight || '') + '" placeholder="例：5.2"></label>';
  html += '<label>補足メモ<textarea name="memo" rows="3" maxlength="1000" placeholder="持病・アレルギー・服用中の薬など">' + esc(p.memo || '') + '</textarea></label>';
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
    weight = String(Math.round(w * 1000) / 1000);
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
