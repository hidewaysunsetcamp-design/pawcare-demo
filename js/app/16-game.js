/* PAWCARE game（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * がんばり（EXP・レベル・勲章）
 * 飼い主の「行動」だけを数える。ペットの健康には点数をつけない。
 * EXPは保存せず、毎回いまのデータから計算する（記録を消せばEXPも減る）
 * ============================================================ */
const LEVEL_TITLES = [[1, 'はじめての記録係'], [3, '見守り上手'], [5, '記録マスター'], [8, '獣医さんの名パートナー'], [12, 'うちの子の名マネージャー'], [18, 'PAWCAREの伝説']];
function dayList() {
  return Array.from(new Set(db.logs.map((l) => l.datetime.slice(0, 10)))).sort();
}
function streaks() {
  const days = dayList();
  let max = 0, run = 0, prev = null;
  days.forEach((d) => {
    const cur = parseLocal(d);
    if (prev && Math.round((cur - prev) / 86400000) === 1) run += 1; else run = 1;
    if (run > max) max = run;
    prev = cur;
  });
  const set = new Set(days);
  let current = 0;
  const c = new Date(); c.setHours(0, 0, 0, 0);
  if (!set.has(toLocalInput(c).slice(0, 10))) c.setDate(c.getDate() - 1); /* 今日まだでも昨日までの連続は途切れない */
  while (set.has(toLocalInput(c).slice(0, 10))) { current += 1; c.setDate(c.getDate() - 1); }
  return { current: current, max: max, days: days.length };
}
function weekKey(dt) {
  const d = parseLocal(dt); const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  return toLocalInput(t).slice(0, 10);
}
function gameStats() {
  const st = streaks();
  const weightWeeks = new Set(db.logs.filter((l) => l.category === 'weight').map((l) => weekKey(l.datetime))).size;
  const kindsByDay = {};
  const memoByDay = {};
  db.logs.forEach((l) => {
    const d = l.datetime.slice(0, 10);
    (kindsByDay[d] = kindsByDay[d] || new Set()).add(l.category);
    if ((l.memo && l.memo.trim()) || (l.ingest && l.ingest.what)) memoByDay[d] = Math.min(5, (memoByDay[d] || 0) + 1);
  });
  const richDays = Object.keys(kindsByDay).filter((d) => kindsByDay[d].size >= 3).length;
  const memoPts = Object.keys(memoByDay).reduce((a, d) => a + memoByDay[d], 0);
  const careDone = db.care.filter((c) => c.source === 'reminder').length + db.logs.filter((l) => l.category === 'medicine').length;
  const prepDone = db.pets.length && db.pets.every((p) => cardDone(p)) ? 1 : 0;
  const settingsDone = (db.settings.hospital.phone ? 1 : 0) + (db.settings.night.phone ? 1 : 0);
  const items = [
    ['記録した日', st.days, 10], ['1日に3種類以上記録した日', richDays, 5], ['メモつきの記録（1日5件まで）', memoPts, 2],
    ['体重を測った週', weightWeeks, 20], ['服薬・予防・健診の実施', careDone, 10], ['受診の記録', db.visits.length, 30],
    ['問診メモの保存', db.memos.length, 15], ['もしもカードの完成（全頭）', prepDone, 50], ['病院の電話番号の登録', settingsDone, 25]
  ];
  const exp = items.reduce((a, i) => a + i[1] * i[2], 0);
  return { exp: exp, items: items, streak: st, weightWeeks: weightWeeks };
}
function levelOf(exp) {
  /* レベルnに必要な累計EXP = 50 × (n-1) × n */
  let lv = 1;
  while (50 * lv * (lv + 1) <= exp) lv += 1;
  const base = 50 * (lv - 1) * lv, next = 50 * lv * (lv + 1);
  let title = LEVEL_TITLES[0][1];
  LEVEL_TITLES.forEach((t) => { if (lv >= t[0]) title = t[1]; });
  return { lv: lv, title: title, cur: exp - base, need: next - base };
}
const MEDALS = [
  { id: 'first', icon: '🐾', name: 'はじめの一歩', how: '最初の記録をつける', ok: (g) => db.logs.length >= 1 },
  { id: 's3', icon: '🔥', name: '3日連続', how: '3日続けて記録する', ok: (g) => g.streak.max >= 3 },
  { id: 's7', icon: '🔥', name: '7日連続', how: '7日続けて記録する', ok: (g) => g.streak.max >= 7 },
  { id: 's30', icon: '🏆', name: '30日連続', how: '30日続けて記録する', ok: (g) => g.streak.max >= 30 },
  { id: 'weight4', icon: '⚖️', name: '体重番長', how: '4つの週で体重を記録する', ok: (g) => g.weightWeeks >= 4 },
  { id: 'card', icon: '🪪', name: 'そなえ上手', how: '全頭のもしもカードを完成させる', ok: () => db.pets.length && db.pets.every((p) => cardDone(p)) },
  { id: 'phones', icon: '📞', name: '連絡先ばっちり', how: 'かかりつけと夜間の病院を登録する', ok: () => !!(db.settings.hospital.phone && db.settings.night.phone) },
  { id: 'memo', icon: '🩺', name: '問診メモデビュー', how: '問診メモを保存する', ok: () => db.memos.length >= 1 },
  { id: 'visit', icon: '🏥', name: '受診記録デビュー', how: '受診の記録をつける', ok: () => db.visits.length >= 1 },
  { id: 'care3', icon: '💉', name: '予防の達人', how: 'ワクチン・予防・健診を3回記録する', ok: () => db.care.length >= 3 },
  { id: 'log100', icon: '📒', name: '記録100件', how: '記録を100件つける', ok: () => db.logs.length >= 100 },
  { id: 'lv5', icon: '⭐', name: '記録マスター', how: 'レベル5になる', ok: (g) => levelOf(g.exp).lv >= 5 }
];
const PET_LINES = ['今日も見ててくれてありがとう！', 'きみの記録、先生にちゃんと伝わるよ', 'いっしょにいられてうれしいな', 'ごはんの時間、楽しみにしてるね', 'そばにいてくれると安心するよ', 'また明日もよろしくね'];
function petLine(pet) {
  const i = (new Date().getDate() + pet.name.length) % PET_LINES.length;
  return PET_LINES[i];
}
function gameBarHtml(pet) {
  const g = gameStats();
  const L = levelOf(g.exp);
  const pct = Math.round(L.cur / L.need * 100);
  return '<button type="button" class="card game-bar" data-nav="game"><span class="gb-lv">Lv.' + L.lv + '</span><span class="gb-main"><span class="gb-title">' + esc(L.title) + (g.streak.current ? '　<span class="gb-streak">🔥' + g.streak.current + '日連続</span>' : '') + '</span>' +
    '<span class="gb-track" role="progressbar" aria-valuemin="0" aria-valuemax="' + L.need + '" aria-valuenow="' + L.cur + '"><span style="width:' + pct + '%"></span></span><span class="gb-exp">' + L.cur + ' / ' + L.need + ' EXP</span></span>' +
    '<span class="gb-say">' + speciesOf(pet.species).emoji + '「' + esc(petLine(pet)) + '」</span></button>';
}
function renderGame() {
  const g = gameStats();
  const L = levelOf(g.exp);
  const pet = activePet();
  let html = '<h1 class="page-title">🎖 がんばり記録</h1>';
  html += '<section class="card game-hero"><p class="gh-lv">Lv.' + L.lv + '</p><p class="gh-title">' + esc(L.title) + '</p><div class="gb-track big"><span style="width:' + Math.round(L.cur / L.need * 100) + '%"></span></div><p class="muted small">次のレベルまで ' + (L.need - L.cur) + ' EXP（合計 ' + g.exp + ' EXP）</p>' +
    '<p>🔥 いまの連続記録：<strong>' + g.streak.current + '日</strong>（最長 ' + g.streak.max + '日）</p>' + (pet ? '<p class="gh-say">' + speciesOf(pet.species).emoji + ' ' + esc(pet.name) + '「' + esc(petLine(pet)) + '」</p>' : '') + '</section>';
  html += '<section class="card"><h2>勲章</h2><div class="medals">' + MEDALS.map((m) => {
    const ok = m.ok(g);
    return '<div class="medal' + (ok ? ' got' : '') + '"><span class="m-icon" aria-hidden="true">' + m.icon + '</span><span class="m-name">' + esc(m.name) + '</span><span class="m-how">' + (ok ? '獲得済み' : esc(m.how)) + '</span></div>';
  }).join('') + '</div></section>';
  html += '<section class="card"><h2>EXPのもらい方</h2><table class="shared-table"><thead><tr><th>やったこと</th><th>1回あたり</th><th>いまの回数</th></tr></thead><tbody>' +
    g.items.map((i) => '<tr><td>' + esc(i[0]) + '</td><td>' + i[2] + ' EXP</td><td>' + i[1] + '</td></tr>').join('') + '</tbody></table>' +
    '<p class="muted small">EXPは記録した「日数」や「丁寧さ」で増えます。同じ日にたくさん記録しても増えすぎないようにしています。正確な記録ほど、先生に役立ちます。</p>' +
    '<p class="disclaimer">EXP・レベル・勲章は飼い主さんの記録の習慣を表すもので、ペットの健康状態を評価するものではありません。</p></section>';
  return html;
}
/* 新しく取った勲章・レベルアップをお知らせ（画面を描くたびに確認） */
function toastWhenFree(msg, actions, tries) {
  tries = tries || 0;
  if (!$toast.hidden && toastActions.length && tries < 8) { setTimeout(() => toastWhenFree(msg, actions, tries + 1), 1500); return; }
  toast(msg, actions);
}
function checkGameNews() {
  if (!storageOk || !db.pets.length) return;
  const g = gameStats();
  const L = levelOf(g.exp);
  const got = MEDALS.filter((m) => m.ok(g)).map((m) => m.id);
  const seen = db.game;
  if (!seen) { db.game = { medals: got, lv: L.lv }; persist(); return; } /* 初回は今の状態を静かに記録 */
  const fresh = got.filter((id) => seen.medals.indexOf(id) < 0);
  const lvUp = L.lv > seen.lv;
  if (!fresh.length && !lvUp) return;
  db.game = { medals: Array.from(new Set(seen.medals.concat(got))), lv: Math.max(L.lv, seen.lv) };
  persist();
  const m = fresh.length ? MEDALS.find((x) => x.id === fresh[0]) : null;
  const msg = m ? '🎖 勲章「' + m.name + '」を獲得！' + (lvUp ? '（Lv.' + L.lv + 'にアップ）' : '') : '⬆️ レベルアップ！ Lv.' + L.lv + '「' + L.title + '」';
  setTimeout(() => toastWhenFree(msg, [{ label: '見る', fn: () => go('game') }]), 300);
}
