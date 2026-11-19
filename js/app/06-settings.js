/* PAWCARE settings（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * 設定・データ管理
 * ============================================================ */
function renderSettings() {
  const h = db.settings.hospital;
  let html = '<h1 class="page-title">設定・データ管理</h1>';
  html += '<section class="card notice"><h2>🔒 データの保存について</h2><p>記録はこの端末のブラウザ内（ローカルストレージ）にのみ保存されます。</p><ul>' +
    '<li>他のスマホやパソコンとは<strong>自動で同期されません</strong>。</li>' +
    '<li>ブラウザの履歴・サイトデータを消去すると記録も消えます。</li>' +
    '<li>iPhoneでは、ホーム画面に追加したアプリとSafariでは保存場所が別になります。</li></ul>' +
    '<p class="muted small">最終バックアップ：' + (db.settings.lastBackupAt ? esc(fmtDateTime(toLocalInput(new Date(db.settings.lastBackupAt)))) : 'まだありません') + '</p>' +
    (storageOk ? '' : '<p class="error-text">現在このブラウザでは保存できない状態です。</p>') + '</section>';

  html += '<section class="card"><h2>🏥 かかりつけの動物病院</h2>' +
    (h.name || h.phone ? '<p><strong>' + esc(h.name || '名称未登録') + '</strong><br>' + esc(h.phone || '電話番号未登録') + '</p>' + (h.note ? '<p class="muted small pre">' + esc(h.note) + '</p>' : '') : '<p class="muted">未登録です。</p>') +
    '<button type="button" class="btn ghost block" data-action="editHospital">' + (h.name || h.phone ? '編集する' : '登録する') + '</button></section>';
  const nt = db.settings.night;
  html += '<section class="card"><h2>🌙 夜間・救急の動物病院</h2><p class="muted small">かかりつけが閉まっている時間に連絡する病院です。元気なうちに調べて登録しておくと安心です。</p>' +
    (nt.name || nt.phone ? '<p><strong>' + esc(nt.name || '名称未登録') + '</strong><br>' + esc(nt.phone || '電話番号未登録') + '</p>' + (nt.note ? '<p class="muted small pre">' + esc(nt.note) + '</p>' : '') : '<p class="muted">未登録です。</p>') +
    '<button type="button" class="btn ghost block" data-action="editHospital" data-kind="night">' + (nt.name || nt.phone ? '編集する' : '登録する') + '</button></section>';

  html += '<section class="card"><h2>🪪 もしもカード・受診の記録・健康手帳</h2><div class="form-actions"><button type="button" class="btn ghost block" data-nav="card">もしもカード</button><button type="button" class="btn ghost block" data-nav="book">📘 健康手帳</button><button type="button" class="btn ghost block" data-nav="visits">受診の記録</button></div></section>';
  html += '<section class="card"><h2>⏰ 予定・リマインダー</h2><p class="muted small">ワクチン・服薬・予防薬などの予定を管理し、スマホのカレンダーに登録して通知を受け取れます。</p><button type="button" class="btn ghost block" data-nav="reminders">予定を管理する</button></section>';
  html += '<section class="card"><h2>💾 バックアップ</h2><p class="muted small">すべてのデータ（ペット・記録・問診メモ・設定）を1つのファイルに書き出します。機種変更時はこのファイルを読み込んでください。</p>' +
    '<div class="form-actions"><button type="button" class="btn primary block" data-action="exportJson">バックアップを書き出す（JSON）</button>' +
    '<label class="btn ghost block file-btn">バックアップ・健康手帳ファイルを読み込む<input type="file" accept="application/json,.json" data-action-change="importJson"></label>' +
    '<button type="button" class="btn ghost block" data-action="exportAllCsv"' + (db.logs.length ? '' : ' disabled') + '>すべての記録をCSVで書き出す</button></div></section>';

  html += '<section class="card"><h2>💎 プラン</h2><p class="small">いまのプラン：<strong>無料</strong></p><p class="muted small">プロ（月480円）・ファミリー（月780円）は準備中です。</p><button type="button" class="btn ghost block" data-nav="plans">プランを見る</button></section>';
  html += '<section class="card"><h2>📤 外部に送られるデータ</h2><p class="muted small">PAWCAREにはサーバーがなく、通常の記録は端末の外に送られません。次の操作をしたときだけ、外部のサービスに情報が渡ります。</p><ul class="small">' +
    '<li><strong>病院への共有リンク</strong>：選んだ情報がリンク自体に入ります。LINE・メールで送ると、その送信履歴にも残ります。</li>' +
    '<li><strong>Googleカレンダーに追加</strong>：ペット名・予定名・メモがGoogleに送られます。</li>' +
    '<li><strong>近くの動物病院を探す</strong>：Googleマップで検索します（検索語は「動物病院」などの固定の言葉だけです）。</li>' +
    '<li><strong>電話・共有ボタン</strong>：スマホの電話アプリや共有先のアプリに渡ります。</li></ul></section>';
  html += '<section class="card"><h2>📱 ホーム画面に追加</h2><p class="muted small">iPhone（Safari）：共有ボタン →「ホーム画面に追加」<br>Android（Chrome）：右上メニュー →「ホーム画面に追加」または「アプリをインストール」</p></section>';

  html += '<section class="card"><h2>このアプリについて</h2><p class="small">PAWCARE デモ版 v' + APP_VERSION + '</p><p class="muted small">本アプリは健康記録と情報整理のためのツールです。病気の診断、治療方針の決定、緊急度の判定は行いません。体調に不安があるときは動物病院にご相談ください。</p>' +
    '<p class="muted small">ペット ' + db.pets.length + '頭／記録 ' + db.logs.length + '件／問診メモ ' + db.memos.length + '件／予定 ' + db.reminders.length + '件</p>' +
    '<button type="button" class="btn danger-ghost block" data-action="wipe">すべてのデータを削除</button></section>';
  return html;
}

function hospitalFormHtml(kind) {
  const h = kind === 'night' ? db.settings.night : db.settings.hospital;
  return '<form data-form="hospital"><input type="hidden" name="kind" value="' + (kind === 'night' ? 'night' : 'hospital') + '">' +
    (kind === 'night' ? '<p class="muted small">「近くの動物病院を探す」の夜間・救急の検索で見つけた病院を登録できます。受け入れ条件は病院ごとに違うので、事前に電話で確認しておくと安心です。</p>' : '') +
    '<label>病院名<input name="name" maxlength="60" value="' + esc(h.name) + '" placeholder="例：〇〇動物病院"></label>' +
    '<label>電話番号<input name="phone" type="tel" inputmode="tel" maxlength="20" value="' + esc(h.phone) + '" placeholder="例：03-1234-5678"></label>' +
    '<label>メモ（診療時間・夜間の連絡先など）<textarea name="note" rows="3" maxlength="500">' + esc(h.note) + '</textarea></label>' +
    '<p class="muted small">診療時間は変わることがあります。受診前に病院へご確認ください。</p>' +
    '<p class="form-error" hidden></p><div class="form-actions"><button type="submit" class="btn primary block">保存する</button></div></form>';
}

function exportJson() {
  const payload = { app: 'PAWCARE', format: 1, exportedAt: new Date().toISOString(), data: db };
  if (download('pawcare-backup-' + todayStr() + '.json', JSON.stringify(payload, null, 2), 'application/json')) {
    commit(() => { db.settings.lastBackupAt = new Date().toISOString(); });
    rerender();
  }
}
function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch (e) { toast('ファイルの形式が正しくありません'); return; }
    if (parsed && parsed.app === 'PAWCARE' && parsed.kind === 'book') { mergeBook(parsed); return; }
    const data = parsed && parsed.app === 'PAWCARE' ? parsed.data : parsed;
    const next = normalizeDb(data);
    if (!next.pets.length && !next.logs.length && !next.reminders.length) { toast('復元できるデータが見つかりませんでした'); return; }
    if (!confirm('ペット' + next.pets.length + '頭・記録' + next.logs.length + '件を復元します。\n現在の端末内のデータは置き換えられます。よろしいですか？')) return;
    const before = db;
    db = next;
    if (!persist()) { db = before; toast('復元に失敗しました'); return; }
    iv = null;
    toast('バックアップを復元しました');
    go('home');
  };
  reader.onerror = () => toast('ファイルを読み込めませんでした');
  reader.readAsText(file);
}

function loadSample() {
  const petId = uid(), cat = uid();
  const d = new Date();
  const at = (daysAgo, hm) => { const x = new Date(d); x.setDate(x.getDate() - daysAgo); const [hh, mm] = hm.split(':'); x.setHours(+hh, +mm, 0, 0); return toLocalInput(x); };
  const nowHm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const todayAt = (hm) => (hm <= nowHm ? at(0, hm) : at(1, hm));
  commit(() => {
    db.pets.push({ id: petId, name: 'こむぎ', species: 'dog', breed: '柴犬', birthday: (d.getFullYear() - 4) + '-04-12', sex: 'female_spayed', weight: '8.4', memo: '鶏肉アレルギーあり', createdAt: new Date().toISOString(), allergies: '鶏肉', conditionsNone: true, medsNone: true, life: { housing: 'mostly_indoor', cohabit: '猫1匹（ミント）', recentChanges: '先週からおやつを変えた' } });
    db.foods.push({ id: uid(), petId: petId, name: 'いつものドライフード（ラム）', type: 'complete', grams: '120', kcal: '360', protein: '24', fat: '12', moisture: '10' });
    db.pets.push({ id: cat, name: 'ミント', species: 'cat', breed: 'スコティッシュ・フォールド', birthday: (d.getFullYear() - 2) + '-09-03', sex: 'male_neutered', weight: '4.1', memo: '', createdAt: new Date().toISOString() });
    const add = (pid, category, datetime, memo, value) => db.logs.push({ id: uid(), petId: pid, category, datetime, memo: memo || '', value: value || '', createdAt: new Date().toISOString() });
    add(petId, 'food', todayAt('08:00'), 'いつもの量を完食');
    add(petId, 'regurgitate', todayAt('09:15'), '少量・未消化のフード');
    add(petId, 'water', todayAt('12:00'), '');
    add(petId, 'walk', todayAt('14:00'), '30分');
    add(petId, 'medicine', todayAt('18:30'), '整腸剤');
    add(petId, 'stool', at(1, '07:40'), '普通の硬さ');
    add(petId, 'weight', at(150, '20:00'), '', '8.9');
    add(petId, 'weight', at(90, '20:00'), '', '8.7');
    add(petId, 'weight', at(45, '20:00'), '', '8.6');
    add(petId, 'weight', at(3, '20:00'), '', '8.4');
    db.visits.push({ id: uid(), petId: petId, date: at(40, '10:00').slice(0, 10), hospital: 'other', hospitalName: 'さくら動物病院', reason: '皮膚をかゆがる', vetSaid: '季節性の可能性。2週間後にもう一度見せてください', meds: [{ id: uid(), name: 'かゆみ止めの塗り薬', how: '1日1回', days: 14 }], nextDate: '', cost: 4400, createdAt: new Date().toISOString() });
    db.care.push({ id: uid(), petId: petId, type: 'vaccine', title: '狂犬病予防注射', memo: 'さくら動物病院', date: at(200, '10:00').slice(0, 10), source: 'manual' });
    db.care.push({ id: uid(), petId: petId, type: 'vaccine', title: '混合ワクチン', memo: 'さくら動物病院', date: at(120, '10:00').slice(0, 10), source: 'manual' });
    add(cat, 'food', todayAt('07:30'), '');
    add(cat, 'urine', todayAt('10:10'), '');
    db.settings.activePetId = petId;
  });
  toast('サンプルデータを追加しました（設定から削除できます）');
  rerender();
}
