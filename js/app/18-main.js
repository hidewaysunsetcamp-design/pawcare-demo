/* PAWCARE main（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * イベント処理
 * ============================================================ */
const actions = {
  closeBanner: () => { $banner.hidden = true; },
  newPet: () => openPetForm({}),
  editPet: (el) => openPetForm(getPet(el.dataset.id)),
  deletePet: (el) => {
    const p = getPet(el.dataset.id);
    if (!p) return;
    const n = db.logs.filter((l) => l.petId === p.id).length;
    if (!confirm(p.name + 'を削除しますか？\n健康記録' + n + '件と予定も一緒に削除されます。この操作は取り消せません。')) return;
    if (commit(() => {
      db.pets = db.pets.filter((x) => x.id !== p.id);
      db.logs = db.logs.filter((l) => l.petId !== p.id);
      db.reminders = db.reminders.filter((r) => r.petId !== p.id);
      db.foods = db.foods.filter((f) => f.petId !== p.id);
      db.visits = db.visits.filter((v) => v.petId !== p.id);
      db.care = db.care.filter((c) => c.petId !== p.id);
      if (db.settings.activePetId === p.id) db.settings.activePetId = db.pets[0] ? db.pets[0].id : null;
    })) { toast('削除しました'); rerender(); }
  },
  selectPet: (el) => { if (commit(() => { db.settings.activePetId = el.dataset.id; })) rerender(); },
  quick: (el) => {
    const pet = activePet();
    if (!pet) return openPetForm({});
    const cat = el.dataset.cat;
    if (cat === 'weight') return openLogForm({ category: 'weight', value: pet.weight || '' });
    const log = { id: uid(), petId: pet.id, category: cat, datetime: nowLocal(), memo: '', value: '', createdAt: new Date().toISOString() };
    if (!commit(() => { db.logs.push(log); })) return;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* 非対応 */ } }
    rerender();
    if (cat === 'ingest') {
      openIngestSheet(log);
      return;
    }
    if (cat === 'ingest_old') {
      const h = db.settings.hospital;
      openSheet('誤食の疑いを記録しました', '<div class="alert danger"><strong>有害なものを食べた可能性がある場合は、様子を見ずに今すぐ動物病院へ連絡してください。</strong><p>何を・どれくらい・いつ食べたかを伝えられるよう、パッケージや残りがあれば手元に置いてください。</p>' +
        '<div class="btn-row">' + (h.phone ? '<a class="btn danger small" href="tel:' + esc(h.phone.replace(/[^\d+]/g, '')) + '">📞 ' + esc(h.name || 'かかりつけ') + 'に電話</a>' : '') +
        '<button type="button" class="btn danger-ghost small" data-nav="emergency">緊急時の案内を開く</button></div></div>' +
        '<button type="button" class="btn ghost block" data-action="editLog" data-id="' + esc(log.id) + '">何を食べたかメモする</button>');
      return;
    }
    toast(log.datetime.slice(11, 16) + ' ' + categoryOf(cat).label + 'を記録', [
      { label: 'メモ・時刻', fn: () => openLogForm(db.logs.find((l) => l.id === log.id)) },
      { label: '取消', fn: () => { if (commit(() => { db.logs = db.logs.filter((l) => l.id !== log.id); })) { toast('取り消しました'); rerender(); } } }
    ]);
  },
  newLog: () => {
    if (!db.pets.length) return openPetForm({});
    openLogForm(logFilter.petId !== 'all' && currentView === 'logs' ? { petId: logFilter.petId } : {});
  },
  editLog: (el) => { const l = db.logs.find((x) => x.id === el.dataset.id); if (!l) return; if (l.category === 'ingest' && !el.dataset.basic) openIngestSheet(l); else openLogForm(Object.assign({}, l)); },
  editCard: () => { const p = activePet(); if (p) openSheet('もしもカードを編集', cardFormHtml(p)); },
  cardImage: () => { cardImage(); },
  sendCard: () => openSendCard(),
  importCardPet: () => { if (linkCache.data && linkCache.data.pet) importPetProfile(linkCache.data.pet); },
  addMedRow: (el) => { const box = el.form.querySelector('.med-rows'); const i = box.children.length; box.insertAdjacentHTML('beforeend', '<div class="med-row"><input name="med_name_' + i + '" maxlength="60" placeholder="薬の名前"><input name="med_how_' + i + '" maxlength="100" placeholder="先生に言われた飲ませ方"><div class="two-col"><label class="small">開始<input type="date" name="med_from_' + i + '"></label><label class="small">終了（空欄＝続く）<input type="date" name="med_to_' + i + '"></label></div></div>'); },
  addVisitMedRow: (el) => { const box = el.form.querySelector('.med-rows'); const i = box.children.length; box.insertAdjacentHTML('beforeend', '<div class="med-row"><input name="vm_name_' + i + '" maxlength="60" placeholder="薬の名前"><input name="vm_how_' + i + '" maxlength="100" placeholder="飲ませ方（言われたとおりに）"><label class="small">日数<input name="vm_days_' + i + '" type="number" inputmode="numeric" min="1" max="365"></label></div>'); },
  newVisit: () => openSheet('受診の記録', visitFormHtml({ date: todayStr(), hospital: 'regular' })),
  editVisit: (el) => { const v = db.visits.find((x) => x.id === el.dataset.id); if (v) openSheet('受診の記録', visitFormHtml(v)); },
  deleteVisit: (el) => { if (!confirm('この受診の記録を削除しますか？')) return; if (commit(() => { db.visits = db.visits.filter((v) => v.id !== el.dataset.id); })) { closeSheet(); rerender(); } },
  medReminder: (el) => medReminderFromVisit(el.dataset.visit, +el.dataset.idx),
  nextVisitReminder: (el) => { const v = db.visits.find((x) => x.id === el.dataset.id); if (v && v.nextDate) openReminderForm({ petId: v.petId, type: 'checkup', title: '次回の受診', dueAt: v.nextDate + 'T09:00', repeat: 'none', memo: v.reason ? '前回：' + v.reason : '', hint: '時刻は病院の予約に合わせて変更してください。' }); },
  handoff: () => openHandoff(),
  copyHandoff: () => { const t = $sheetBody.querySelector('.handoff-text'); if (t) copyText(t.textContent); },
  shareHandoff: () => { const t = $sheetBody.querySelector('.handoff-text'); if (t) shareText('PAWCARE 引き継ぎ', t.textContent); },
  shareLinkAs: (el) => { const i = $sheetBody.querySelector('.share-url'); if (i) shareText(el.dataset.title || 'PAWCARE', i.value); },
  doImport: (el) => doImport(el.dataset.target),
  recordIngest: () => { const i = document.getElementById('toxicInput'); recordIngestFrom(i ? i.value.trim() : ''); },
  editLogBasic: (el) => { const l = db.logs.find((x) => x.id === el.dataset.id); if (l) openLogForm(Object.assign({}, l)); },
  deleteLog: (el) => {
    if (!confirm('この記録を削除しますか？')) return;
    if (commit(() => { db.logs = db.logs.filter((l) => l.id !== el.dataset.id); })) { closeSheet(); toast('削除しました'); rerender(); }
  },
  clearFilter: () => { logFilter.petId = 'all'; logFilter.date = ''; logFilter.category = 'all'; rerender(); },
  exportCsv: () => exportCsv(filteredLogs()),
  exportAllCsv: () => exportCsv(db.logs),
  exportJson: exportJson,
  editHospital: (el) => openSheet(el.dataset.kind === 'night' ? '夜間・救急の動物病院' : 'かかりつけの動物病院', hospitalFormHtml(el.dataset.kind)),
  copyPhoneScript: () => { const p = activePet(); if (p) copyText(phoneScript(p)); },
  loadSample: loadSample,
  wipe: () => {
    if (!confirm('すべてのペット・記録・問診メモ・設定を削除します。\n先にバックアップを書き出すことをおすすめします。続けますか？')) return;
    if (!confirm('本当に削除しますか？この操作は取り消せません。')) return;
    db = emptyDb();
    iv = null;
    persist();
    toast('すべてのデータを削除しました');
    go('home');
  },
  startInterview: () => { iv = newInterview(); iv.step = 1; go('interview'); },
  ivNext: () => {
    if (iv.step === 2 && !iv.a.symptoms.length && !iv.a.symptomOther.trim()) { toast('症状を1つ以上選ぶか、様子を入力してください'); return; }
    iv.step = Math.min(iv.step + 1, STEP_TITLES.length - 1);
    render();
  },
  ivBack: () => { iv.step = Math.max(iv.step - 1, 0); render(); },
  ivRestart: () => { iv = newInterview(); render(); },
  ivSymptom: (el) => {
    const v = el.dataset.value;
    const i = iv.a.symptoms.indexOf(v);
    if (i >= 0) iv.a.symptoms.splice(i, 1); else iv.a.symptoms.push(v);
    rerender();
  },
  copyMemo: () => copyText(buildMemo(iv.a)),
  shareMemo: () => shareText('PAWCARE 問診メモ', buildMemo(iv.a)),
  saveMemo: () => {
    const p = getPet(iv.a.petId);
    const memo = { id: uid(), petId: iv.a.petId, petName: p ? p.name : '', createdAt: nowLocal(), summary: iv.a.symptoms.join('、') || iv.a.symptomOther.slice(0, 30), text: buildMemo(iv.a), answers: Object.assign({}, iv.a, { symptoms: iv.a.symptoms.slice() }) };
    if (commit(() => { db.memos.push(memo); if (db.memos.length > 50) db.memos.shift(); })) { iv.savedId = memo.id; toast('問診メモを保存しました'); rerender(); }
  },
  viewMemo: (el) => {
    const m = db.memos.find((x) => x.id === el.dataset.id);
    if (!m) return;
    openSheet('問診メモ', '<pre class="memo">' + esc(m.text) + '</pre><div class="form-actions"><button type="button" class="btn primary block" data-action="copySavedMemo" data-id="' + esc(m.id) + '">コピー</button>' +
      '<button type="button" class="btn danger-ghost block" data-action="deleteMemo" data-id="' + esc(m.id) + '">このメモを削除</button></div>');
  },
  copySavedMemo: (el) => { const m = db.memos.find((x) => x.id === el.dataset.id); if (m) copyText(m.text); },
  copyLatestMemo: () => { const m = db.memos[db.memos.length - 1]; if (m) copyText(m.text); },
  newFood: () => openSheet('食品を追加', foodFormHtml({})),
  editFood: (el) => { const f = db.foods.find((x) => x.id === el.dataset.id); if (f) openSheet('食品を編集', foodFormHtml(f)); },
  deleteFood: (el) => { if (!confirm('この食品を削除しますか？')) return; if (commit(() => { db.foods = db.foods.filter((f) => f.id !== el.dataset.id); })) { closeSheet(); rerender(); } },
  toxicCheck: () => toxicCheck(),
  exportBook: () => exportBook(),
  openBook: (el) => { if (commit(() => { db.settings.activePetId = el.dataset.id; })) go('book'); },
  newCare: () => openSheet('ワクチン・予防・健康診断の記録', careFormHtml({ date: todayStr(), type: 'vaccine' })),
  editCare: (el) => { const c = db.care.find((x) => x.id === el.dataset.id); if (c) openSheet('ワクチン・予防・健康診断の記録', careFormHtml(c)); },
  deleteCare: (el) => { if (!confirm('この記録を削除しますか？')) return; if (commit(() => { db.care = db.care.filter((c) => c.id !== el.dataset.id); })) { closeSheet(); rerender(); } },
  petTap: (el) => {
    const A = window.PAWCARE_AVATAR;
    const pet = activePet(); if (!pet) return;
    const b = document.getElementById('avBubble');
    const st = el.closest('.stage');
    if (st && st.classList.contains('calm')) return;
    avLineIdx++;
    const useful = avatarLines(pet, false);
    if (b) b.textContent = avLineIdx % 2 ? A.TAP[Math.floor(Math.random() * A.TAP.length)] : useful[(avLineIdx / 2) % useful.length];
    el.classList.remove('jump'); void el.offsetWidth; el.classList.add('jump');
    const h = document.createElement('span'); h.className = 'heart'; h.textContent = '❤'; h.setAttribute('aria-hidden', 'true');
    el.appendChild(h); setTimeout(() => h.remove(), 1000);
  },
  avSet: (el) => {
    const pet = activePet(); if (!pet) return;
    const A = window.PAWCARE_AVATAR;
    const lists = { color: A.COLORS, accColor: A.COLORS, pattern: A.PATTERNS, eyes: A.EYES, acc: A.ACCS, bg: A.BG };
    const k = el.dataset.k, v = el.dataset.v;
    if (!lists[k] || !lists[k].some((o) => o.id === v)) return;
    if (commit(() => { pet.avatar = Object.assign({}, pet.avatar, { [k]: v }); })) rerender();
  },
  shareAvatar: () => {
    const pet = activePet(); if (!pet) return;
    avatarImageBlob(pet).then((blob) => {
      const file = new File([blob], 'pawcare-' + pet.name + '.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], text: pet.name + 'の記録をPAWCAREでつけています #PAWCARE' }).catch(() => {});
      }
      const u = URL.createObjectURL(blob);
      openSheet('じまん画像', '<img class="share-img" src="' + u + '" alt="' + esc(pet.name) + 'のじまん画像"><p class="small muted">画像を長押し（パソコンは右クリック）で保存して、SNSに投稿できます。健康の記録は画像に入りません。</p>' +
        '<a class="btn primary block" download="pawcare-' + esc(pet.name) + '.png" href="' + u + '">画像を保存</a>');
    }).catch((e) => toast(e.message));
  },
  openPrep: () => { const p = activePet(); if (p) openSheet('もしもの準備', preparednessHtml(p).replace(/^<section class="card prep">/, '<section class="prep">')); },
  pickSpecies: (el) => {
    const form = el.closest('form');
    const sel = form.querySelector('select[name=species]');
    sel.value = el.dataset.value;
    form.querySelectorAll('.species-btn').forEach((b) => b.classList.toggle('active', b === el));
    form.querySelector('.breed-wrap').innerHTML = breedSelectHtml(el.value || el.dataset.value, '');
  },
  newReminder: () => openReminderForm({}),
  editReminder: (el) => { const r = db.reminders.find((x) => x.id === el.dataset.id); if (r) openReminderForm(Object.assign({}, r)); },
  deleteReminder: (el) => {
    if (!confirm('この予定を削除しますか？\n（カレンダーに登録済みの予定は、カレンダー側で削除してください）')) return;
    if (commit(() => { db.reminders = db.reminders.filter((r) => r.id !== el.dataset.id); })) { closeSheet(); toast('予定を削除しました'); rerender(); }
  },
  doneReminder: (el) => doneReminder(el.dataset.id),
  calendarReminder: (el) => { const r = db.reminders.find((x) => x.id === el.dataset.id); if (r) addToCalendar(r); },
  downloadIcs: (el) => { const r = db.reminders.find((x) => x.id === el.dataset.id); if (r) downloadIcs(r); },
  openShare: (el) => openShareSheet(el.dataset.id),
  shareInterview: () => openShareSheet(iv.a.petId, buildMemo(iv.a)),
  copyShareUrl: () => { const i = $sheetBody.querySelector('.share-url'); if (i) copyText(i.value); },
  shareShareUrl: () => { const i = $sheetBody.querySelector('.share-url'); if (i) shareText('PAWCARE 受診用サマリー', i.value); },
  printView: () => window.print(),
  deleteMemo: (el) => {
    if (!confirm('この問診メモを削除しますか？')) return;
    if (commit(() => { db.memos = db.memos.filter((m) => m.id !== el.dataset.id); })) { closeSheet(); rerender(); }
  }
};

document.addEventListener('click', (e) => {
  const toastBtn = e.target.closest('[data-toast-action]');
  if (toastBtn) {
    const a = toastActions[+toastBtn.dataset.toastAction];
    $toast.hidden = true;
    if (a) a.fn();
    return;
  }
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    e.preventDefault();
    if (!$sheet.hidden) closeSheet();
    if (nav.dataset.nav === 'interview' && iv && iv.step === STEP_TITLES.length - 1 && iv.savedId) iv = null;
    go(nav.dataset.nav);
    return;
  }
  if (e.target.closest('[data-close-sheet]')) { closeSheet(); return; }
  const act = e.target.closest('[data-action]');
  if (act && actions[act.dataset.action] && act.tagName !== 'INPUT') {
    e.preventDefault();
    actions[act.dataset.action](act);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  const type = form.dataset.form;
  if (!type) return;
  e.preventDefault();
  if (type === 'log') saveLogForm(form);
  else if (type === 'pet') savePetForm(form);
  else if (type === 'reminder') saveReminderForm(form);
  else if (type === 'share') createShare(form);
  else if (type === 'food') saveFoodForm(form);
  else if (type === 'card') saveCardForm(form);
  else if (type === 'sendcard') createCardLink(form);
  else if (type === 'ingest') saveIngestForm(form);
  else if (type === 'visit') saveVisitForm(form);
  else if (type === 'handoff') createHandoff(form);
  else if (type === 'care') saveCareForm(form);
  else if (type === 'hospital') {
    const f = new FormData(form);
    const data = { name: String(f.get('name') || '').trim(), phone: String(f.get('phone') || '').trim(), note: String(f.get('note') || '').trim() };
    if (data.phone && !/^[\d+\-() ]{3,20}$/.test(data.phone)) return showFormError(form.querySelector('.form-error'), '電話番号は数字とハイフンで入力してください。');
    const kind = f.get('kind') === 'night' ? 'night' : 'hospital';
    if (commit(() => { db.settings[kind] = data; })) { closeSheet(); toast('保存しました'); rerender(); }
  }
});

function handleInput(e) {
  const el = e.target;
  if (el.name === 'when' && el.form && el.form.dataset.form === 'ingest') {
    el.form.querySelector('.ingest-time').hidden = el.value !== 'time';
    return;
  }
  if (el.dataset.nutri) {
    const pet = activePet();
    if (pet && commit(() => { pet.nutri = Object.assign({}, pet.nutri, { [el.dataset.nutri]: el.checked }); })) rerender();
    return;
  }
  if (el.dataset.filter) {
    logFilter[el.dataset.filter] = el.value;
    rerender();
    return;
  }
  if (el.dataset.iv && iv) {
    const key = el.dataset.iv;
    iv.a[key] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'radio') {
      if (key === 'petId') commit(() => { db.settings.activePetId = el.value; });
      rerender();
    }
    return;
  }
  if (el.dataset.guide) {
    if (el.dataset.guide === 'species') { guideSel.species = el.value; guideSel.breed = ''; } else guideSel.breed = el.value;
    rerender();
    return;
  }
  if (el.dataset.change === 'species') {
    el.form.querySelector('.breed-wrap').innerHTML = breedSelectHtml(el.value, '');
    el.form.querySelectorAll('.species-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === el.value));
    return;
  }
  if (el.dataset.change === 'sharePet') {
    const latest = latestMemoFor(el.value);
    const box = el.form.querySelector('.share-memo');
    const own = pendingShareMemo && iv && iv.a.petId === el.value;
    box.hidden = !(own || latest);
    box.querySelector('span').textContent = (own ? '今作成した問診メモ' : latest ? '最新の問診メモ（' + fmtDateTime(latest.createdAt) + '）' : '') + 'を含める';
    return;
  }
  if (el.dataset.change === 'breed') {
    const other = el.form.querySelector('.breed-other');
    other.hidden = el.value !== 'その他';
    if (!other.hidden) other.querySelector('input').focus();
    return;
  }
  if (el.name === 'type' && el.form && el.form.dataset.form === 'reminder') {
    const t = el.form.querySelector('input[name=title]');
    t.placeholder = '例：' + reminderTypeOf(el.value).label;
    return;
  }
  if (el.name === 'category' && el.form && el.form.dataset.form === 'log') {
    el.form.querySelector('.weight-field').hidden = el.value !== 'weight';
    return;
  }
  if (el.dataset.actionChange === 'importJson') {
    importJson(el.files && el.files[0]);
    el.value = '';
  }
}
document.addEventListener('change', handleInput);
document.addEventListener('input', (e) => {
  /* テキスト入力は再描画せず値だけ保持する（入力中のフォーカスを失わないため） */
  const el = e.target;
  if (el.dataset.iv && iv && el.type !== 'radio' && el.type !== 'checkbox') iv.a[el.dataset.iv] = el.value;
  if (el.hasAttribute('data-ingest-check')) updateIngestToxic();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$sheet.hidden) closeSheet(); });
window.addEventListener('hashchange', render);
window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) { loadDb(); rerender(); } });

/* ============================================================
 * 起動
 * ============================================================ */
loadDb();
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* オフライン機能なしで動作継続 */ });
  });
}

/* テスト用の参照（本番動作には影響しない） */
window.__PAWCARE__ = { version: APP_VERSION, getDb: () => db, buildMemo: buildMemo };
