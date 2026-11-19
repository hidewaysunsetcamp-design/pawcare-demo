/* PAWCARE home（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * ホーム
 * ============================================================ */
function renderHome() {
  const pet = activePet();
  let html = '';
  if (!pet) {
    html += '<section class="card welcome"><h1>PAWCAREへようこそ</h1>' +
      '<p>毎日の健康記録をつけておくと、体調が悪いときに動物病院へ正確に伝えられます。まずはペットを登録しましょう。</p>' +
      '<button type="button" class="btn primary block" data-action="newPet">＋ ペットを登録する</button>' +
      '<button type="button" class="btn ghost block" data-action="loadSample">サンプルデータで試してみる</button></section>';
    return html + localNotice;
  }
  /* 1. 緊急時は細い帯で常に見える位置に（ヘッダーの「緊急時」ボタンもある） */
  html += petChips(pet.id, 'selectPet');
  html += homeDangerBanner(pet);
  /* 2. ペット＋レベルを1行に */
  const sp = speciesOf(pet.species);
  const g = gameStats();
  const L = levelOf(g.exp);
  /* うちの子のステージ（v1.11）：動くアバター＋しゃべりかけ＋着せかえ・じまん */
  const A = window.PAWCARE_AVATAR;
  const bg = A.find(A.BG, A.settings(pet).bg);
  const calm = !!homeDangerBanner(pet);
  const said = avatarLines(pet, calm);
  html += '<section class="stage' + (calm ? ' calm' : '') + '" style="--bg-a:' + bg.a + ';--bg-b:' + bg.b + '">' +
    '<div class="stage-row"><button type="button" class="av-btn" data-action="petTap" aria-label="' + esc(pet.name) + 'をなでる">' + A.svg(pet, { size: 132, label: pet.name + 'のアバター' }) + '</button>' +
    '<div class="stage-side"><p class="bubble" id="avBubble" aria-live="polite">' + esc(said[0]) + '</p>' +
    '<div class="stage-name"><h1>' + esc(pet.name) + '</h1><p class="muted">' +
    esc([pet.breed || sp.label, ageText(pet.birthday), pet.weight ? pet.weight + 'kg' : ''].filter(Boolean).join('・')) + '</p></div>' +
    '<button type="button" class="lv-chip game-bar" data-nav="game" aria-label="レベル' + L.lv + '、がんばり記録を開く"><span class="lv-n">Lv.' + L.lv + '</span><span class="gb-track"><span style="width:' + Math.round(L.cur / L.need * 100) + '%"></span></span>' +
    (g.streak.current ? '<span class="lv-s">🔥' + g.streak.current + '日</span>' : '<span class="lv-s">' + L.cur + '/' + L.need + '</span>') + '</button></div></div>' +
    '<div class="stage-actions"><button type="button" class="pill" data-nav="avatar">🎨 きせかえ</button><button type="button" class="pill" data-action="shareAvatar">📸 じまんする</button></div></section>';
  /* 3. いちばん使う「ワンタップで記録」を最初の画面に */
  html += '<section class="card"><h2>ワンタップで記録</h2><div class="quick-grid channels">';
  (D.QUICK[pet.species] || D.QUICK.other).map(categoryOf).forEach((c) => {
    html += '<button type="button" class="quick-btn" data-action="quick" data-cat="' + c.id + '" style="--c:' + c.color + '"><span aria-hidden="true">' + c.emoji + '</span>' + esc(c.id === 'ingest' ? '誤食かも' : c.label) + '<small class="qs">' + esc(quickStatText(pet.id, c.id)) + '</small></button>';
  });
  html += '</div><button type="button" class="link" data-action="newLog">＋ 日時・メモを入力して記録</button></section>';
  /* 4. 期限が近い予定・もしもの準備は、あるときだけ1行で */
  const due = sortedReminders(db.reminders.filter((r) => r.petId === pet.id && !r.done && r.dueAt <= toLocalInput(new Date(Date.now() + 24 * 3600000))));
  if (due.length) html += '<button type="button" class="notice-row" data-nav="reminders"><span aria-hidden="true">⏰</span><span><strong>' + esc(due[0].title || reminderTypeOf(due[0].type).label) + '</strong> ' + esc(fmtShort(due[0].dueAt)) + (due.length > 1 ? '　ほか' + (due.length - 1) + '件' : '') + '</span><span class="chev" aria-hidden="true">›</span></button>';
  const prep = preparednessHtml(pet);
  if (prep) {
    const m = /(\d+) \/ (\d+)/.exec(prep);
    html += '<button type="button" class="notice-row" data-action="openPrep"><span aria-hidden="true">🧰</span><span><strong>もしもの準備</strong> ' + (m ? m[1] + ' / ' + m[2] + '　あと' + (m[2] - m[1]) + 'つ' : '') + '</span><span class="chev" aria-hidden="true">›</span></button>';
  }
  /* 5. 今日の記録は新しい3件だけ */
  const today = logsSorted(db.logs.filter((l) => l.petId === pet.id && l.datetime.slice(0, 10) === todayStr()));
  html += '<section class="card"><div class="row-between"><h2>今日の記録</h2><button type="button" class="link" data-nav="logs">すべて見る</button></div>';
  html += today.length ? '<ul class="log-list">' + today.slice(0, 3).map((l) => logItemHtml(l, false)).join('') + '</ul>' + (today.length > 3 ? '<button type="button" class="link" data-nav="logs">ほか' + (today.length - 3) + '件</button>' : '') : '<p class="empty">今日の記録はまだありません。</p>';
  html += '</section>';
  /* 6. そのほかの機能はアイコンのタイルにまとめる */
  const tiles = [['interview', '🩺', '体調が\n気になる'], ['card', '🪪', 'もしも\nカード'], ['book', '📘', '健康手帳'], ['visits', '🏥', '受診の\n記録'],
    ['nutrition', '🍚', 'ごはん\nチェック'], ['reminders', '⏰', '予定'], ['@handoff', '👪', '家族に\n引き継ぐ'], ['guide', '📗', '飼い方']];
  html += '<section class="card tiles-card"><div class="tiles">' + tiles.map((t) => '<button type="button" class="tile" ' + (t[0][0] === '@' ? 'data-action="' + t[0].slice(1) + '"' : 'data-nav="' + t[0] + '"') + '><span aria-hidden="true">' + t[1] + '</span>' + esc(t[2]).replace('\n', '<br>') + '</button>').join('') + '</div></section>';
  html += adSlotHtml('home');
  return html + localNotice;
}

/* 記録から「すぐ病院へ」の一覧に当てはまる様子が分かるときだけ、ホームの一番上に出す。
   回数などからアプリが危険度を決めることはしない（診断にあたるため） */
/* アバターのセリフ：記録の状況から決まった文を選ぶ（病気の判断はしない） */
let avLineIdx = 0;
function avatarLines(pet, calm) {
  const quick = D.QUICK[pet.species] || D.QUICK.other;
  const mine = db.logs.filter((l) => l.petId === pet.id);
  const t = todayStr();
  const today = { count: 0 };
  const last = {};
  mine.forEach((l) => {
    if (l.datetime.slice(0, 10) === t) { today[l.category] = true; today.count++; }
    if (!last[l.category] || l.datetime > last[l.category]) last[l.category] = l.datetime;
  });
  const daysSince = new Proxy({}, { get: (o, k) => last[k] ? (Date.now() - new Date(last[k]).getTime()) / 86400000 : (k === 'weight' && pet.weight ? 0 : 999) });
  const due = sortedReminders(db.reminders.filter((r) => r.petId === pet.id && !r.done && r.dueAt <= toLocalInput(new Date(Date.now() + 24 * 3600000))))[0];
  const prep = preparednessHtml(pet);
  const m = /(\d+) \/ (\d+)/.exec(prep);
  return window.PAWCARE_AVATAR.lines(pet, {
    calm: calm, hour: new Date().getHours(), quick: quick, today: today, daysSince: daysSince,
    streak: gameStats().streak.current, prepLeft: m ? m[2] - m[1] : 0,
    due: due ? (due.title || reminderTypeOf(due.type).label) : ''
  });
}

function homeDangerBanner(pet) {
  const reasons = [];
  const ingest = logsSorted(db.logs.filter((l) => l.petId === pet.id && l.category === 'ingest' && l.datetime >= toLocalInput(new Date(Date.now() - 6 * 3600000))))[0];
  if (ingest) reasons.push('「誤食の疑い」を記録しています（' + agoText(ingest.datetime) + '）' + (ingest.ingest && ingest.ingest.what ? '：' + ingest.ingest.what : '') + '。');
  const memo = db.memos.filter((m) => m.petId === pet.id && m.answers && m.createdAt >= toLocalInput(new Date(Date.now() - 24 * 3600000))).slice(-1)[0];
  if (!memo && iv && iv.a.petId === pet.id && iv.step >= 2 && interviewDanger(iv.a)) reasons.push('入力中の問診で、「すぐ動物病院へ連絡すべき様子」の一覧と同じ項目を選んでいます。');
  if (memo && interviewDanger(Object.assign({ symptoms: [] }, memo.answers))) reasons.push('問診で、「すぐ動物病院へ連絡すべき様子」の一覧と同じ項目を選んでいます（' + agoText(memo.createdAt) + '）。');
  if (!reasons.length) return '';
  return '<section class="alert danger home-danger" role="alert"><strong>まだ病院に連絡していなければ、今すぐ電話してください。</strong>' +
    reasons.map((r) => '<p>' + esc(r) + '</p>').join('') + callButtonsHtml() + '</section>';
}

/* もしもの準備：元気なうちに済ませておくと、いざという時に迷わない */
function preparednessHtml(pet) {
  const backupFresh = db.settings.lastBackupAt && (Date.now() - new Date(db.settings.lastBackupAt).getTime()) < 30 * 86400000;
  const items = [
    { done: !!db.settings.hospital.phone, label: 'かかりつけ病院の電話番号', btn: '<button type="button" class="btn ghost small" data-action="editHospital">登録</button>' },
    { done: !!db.settings.night.phone, label: '夜間・救急の病院の電話番号', btn: '<button type="button" class="btn ghost small" data-action="editHospital" data-kind="night">登録</button>' },
    { done: !!pet.weight, label: pet.name + 'の体重（薬の量や電話で必ず聞かれます）', btn: '<button type="button" class="btn ghost small" data-action="editPet" data-id="' + esc(pet.id) + '">登録</button>' },
    { done: cardDone(pet), label: 'もしもカード（持病・アレルギー・薬を「内容」か「なし」で）', btn: '<button type="button" class="btn ghost small" data-nav="card">入力</button>' },
    { done: !!backupFresh, label: 'データのバックアップ（30日以内）', btn: '<button type="button" class="btn ghost small" data-action="exportJson">保存</button>' }
  ];
  const n = items.filter((i) => i.done).length;
  if (n === items.length) return '';
  return '<section class="card prep"><div class="row-between"><h2>🧰 もしもの準備</h2><span class="tag">' + n + ' / ' + items.length + '</span></div>' +
    '<p class="muted small">元気なうちに済ませておくと、いざという時に迷わずに済みます。</p><ul class="prep-list">' +
    items.map((i) => '<li class="' + (i.done ? 'done' : '') + '"><span aria-hidden="true">' + (i.done ? '✅' : '⬜') + '</span><span class="prep-label">' + esc(i.label) + '</span>' + (i.done ? '' : i.btn) + '</li>').join('') + '</ul></section>';
}
