/* PAWCARE handoff（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * #5 家族・預け先への引き継ぎ（テキスト＋取り込みリンク）
 * ============================================================ */
function openHandoff() {
  const pet = activePet();
  if (!pet) return;
  openSheet(pet.name + 'の引き継ぎ', '<form data-form="handoff">' +
    '<label>期間<select name="range"><option value="today">今日</option><option value="24" selected>直近24時間</option><option value="72">直近3日</option></select></label>' +
    '<label class="check"><input type="checkbox" name="counts" checked> 記録の回数と最後の時刻</label>' +
    '<label class="check"><input type="checkbox" name="plans" checked> これから24時間の予定（服薬など）</label>' +
    '<label class="check"><input type="checkbox" name="card"> もしもカードのリンク</label>' +
    '<label class="check"><input type="checkbox" name="importLink" checked> 記録を相手のPAWCAREに取り込むリンク</label>' +
    '<label>伝えたいこと<textarea name="note" rows="3" maxlength="300" placeholder="例：夜もう一度吐いたら○○病院に電話して"></textarea></label>' +
    '<div class="alert warn small">自動では同期されません。相手が記録したものは、相手から引き継ぎを送ってもらってください。リンクを知っている人は誰でも読め、取り消せません。</div>' +
    '<div class="form-actions"><button type="submit" class="btn primary block">引き継ぎ文を作る</button></div></form>');
}
async function createHandoff(form) {
  const f = new FormData(form);
  const pet = activePet();
  const range = f.get('range');
  const since = range === 'today' ? todayStr() + 'T00:00' : toLocalInput(new Date(Date.now() - (+range) * 3600000));
  const logs = logsSorted(db.logs.filter((l) => l.petId === pet.id && l.datetime >= since));
  const L = ['【' + pet.name + 'の引き継ぎ ' + fmtShort(nowLocal()) + '】'];
  if (f.get('counts')) {
    const cw = countsWithLast(logs);
    const keys = KEY_CATS.concat(['walk', 'weight', 'other']).filter((k) => cw[k]);
    L.push(keys.length ? '・' + keys.map((k) => categoryOf(k).label + ' ' + cw[k].n + '回（最後 ' + cw[k].last.slice(11, 16) + '）').join('・') : '・この期間の記録はありません');
  }
  if (f.get('plans')) {
    const until = toLocalInput(new Date(Date.now() + 24 * 3600000));
    const plans = sortedReminders(db.reminders.filter((r) => r.petId === pet.id && !r.done && r.dueAt <= until));
    if (plans.length) L.push('・これからの予定：' + plans.map((r) => fmtShort(r.dueAt) + ' ' + (r.title || reminderTypeOf(r.type).label)).join('、'));
  }
  const note = String(f.get('note') || '').trim().slice(0, 300);
  if (note) L.push('・伝えたいこと：' + note);
  const base = location.origin + location.pathname;
  if (f.get('card')) L.push('・もしもカード：' + base + '#/card/' + await encodePayload(Object.assign(cardPayloadOf(pet), { x: Date.now() + 7 * 86400000, pet: petExport(pet) })));
  if (f.get('importLink')) {
    const payload = { v: 1, t: 'handoff', c: nowLocal(), x: Date.now() + 3 * 86400000, from: db.settings.owner.name || '', pet: petExport(pet),
      logs: logs.slice(0, 120).map((l) => ({ id: l.id, datetime: l.datetime, category: l.category, value: l.value || '', memo: (l.memo || '').slice(0, 200), ingest: l.ingest || null })) };
    L.push('・取り込みリンク：' + base + '#/import/' + await encodePayload(payload));
  }
  const text = L.join('\n');
  $sheetTitle.textContent = '引き継ぎ文ができました';
  $sheetBody.innerHTML = '<pre class="memo handoff-text">' + esc(text) + '</pre>' + upsellHtml('family') + '<div class="form-actions"><button type="button" class="btn primary block" data-action="copyHandoff">コピー</button>' +
    (navigator.share ? '<button type="button" class="btn ghost block" data-action="shareHandoff">LINE・メールで送る</button>' : '') + '</div>';
}
function sanitizeHandoff(raw) {
  if (!raw || typeof raw !== 'object' || raw.t !== 'handoff') return null;
  const cats = D.CATEGORIES.map((c) => c.id);
  const logs = Array.isArray(raw.logs) ? raw.logs.slice(0, 500).filter((l) => l && typeof l === 'object' && S.dt(l.datetime) && cats.indexOf(l.category) >= 0).map((l) => {
    const g = l.ingest && typeof l.ingest === 'object' ? l.ingest : null;
    return { id: S.str(l.id, 40).replace(/[^\w-]/g, '') || uid(), datetime: S.dt(l.datetime), category: l.category, value: S.num(l.value), memo: S.str(l.memo, 200),
      ingest: g ? { what: S.str(g.what, 100), product: S.str(g.product, 100), amount: ['little', 'half', 'all', 'unknown'].indexOf(g.amount) >= 0 ? g.amount : '', amountNote: S.str(g.amountNote, 50),
        when: ['now', '30m', '1h', 'time', 'unknown'].indexOf(g.when) >= 0 ? g.when : '', ateAt: S.dt(g.ateAt), packageKept: g.packageKept === true } : null };
  }) : [];
  return { c: S.dt(raw.c), x: Number.isFinite(raw.x) ? raw.x : 0, from: S.str(raw.from, 40), pet: S.pet(raw.pet), logs: logs };
}
function renderImport() {
  const st = decodeRouteData(/^#\/import\//, sanitizeHandoff);
  if (st.loading) return '<p class="loading">読み込み中…</p>';
  if (st.error) return linkErrorHtml(st.error);
  const h = st.data;
  if (Date.now() > h.x) return '<section class="card"><h1>このリンクは有効期限が切れています</h1><p class="muted">送ってくれた方に、新しい引き継ぎを送ってもらってください。</p></section>';
  const sorted = logsSorted(h.logs);
  const range = sorted.length ? fmtShort(sorted[sorted.length - 1].datetime) + '〜' + fmtShort(sorted[0].datetime) : '';
  let html = '<section class="card import-head"><p class="tag">家族からの引き継ぎ</p><h1>' + esc(h.from ? h.from + 'さんから：' : '') + esc(h.pet.name) + 'の記録 ' + h.logs.length + '件</h1><p class="muted small">' + esc(range) + '</p></section>';
  html += '<section class="card">' + groupedLogsHtml(h.logs.map((l) => Object.assign({}, l, { petId: '' })), false).replace(/data-action="editLog"/g, 'data-action="noop"') + '</section>';
  const same = getPet(h.pet.id);
  html += '<section class="card"><h2>この端末のPAWCAREに取り込む</h2>' +
    (same ? '<p class="small">この端末の「' + esc(same.name) + '」に記録を追加します。</p><button type="button" class="btn primary block" data-action="doImport" data-target="' + esc(same.id) + '">取り込む</button>'
      : '<button type="button" class="btn primary block" data-action="doImport" data-target="new">新しいペットとして追加</button>' +
        (db.pets.length ? '<label>既存のペットに取り込む<select id="importTarget">' + optionsHtml(db.pets.map((p) => ({ id: p.id, label: p.name })), '') + '</select></label><button type="button" class="btn ghost block" data-action="doImport" data-target="select">選んだペットに取り込む</button>' : '')) +
    '<p class="muted small">すでにある記録は消したり上書きしたりしません。同じ記録は二重に追加しません。自動では同期されません。</p></section>';
  return html;
}
function doImport(target) {
  const h = linkCache.data;
  if (!h || !h.logs) return;
  let petId = target;
  let newPet = null;
  if (target === 'new') { newPet = Object.assign({ createdAt: new Date().toISOString(), memo: '' }, h.pet, { id: getPet(h.pet.id) ? uid() : (h.pet.id || uid()) }); petId = newPet.id; }
  else if (target === 'select') { const sel = document.getElementById('importTarget'); petId = sel && sel.value; }
  if (!newPet && !getPet(petId)) { toast('取り込み先のペットを選んでください'); return; }
  const batch = uid();
  const existing = new Set(db.logs.map((l) => l.id));
  let added = 0, dup = 0;
  if (!commit(() => {
    if (newPet) db.pets.push(newPet);
    h.logs.forEach((l) => {
      if (existing.has(l.id)) { dup += 1; return; }
      const rec = { id: l.id, petId: petId, category: l.category, datetime: l.datetime, value: l.value, memo: l.memo, createdAt: new Date().toISOString(), importBatch: batch };
      if (l.ingest) rec.ingest = l.ingest;
      db.logs.push(rec); added += 1;
    });
    db.settings.activePetId = petId;
  })) return;
  go('home');
  toast(added + '件追加・' + dup + '件はすでにありました', added ? [{ label: '取り消す', fn: () => { if (commit(() => { db.logs = db.logs.filter((l) => l.importBatch !== batch); if (newPet) db.pets = db.pets.filter((p) => p.id !== newPet.id); })) { toast('取り込みを取り消しました'); rerender(); } } }] : []);
}
