/* PAWCARE emergency（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * 緊急時の案内
 * ============================================================ */
function renderEmergency() {
  const h = db.settings.hospital;
  const pet = activePet();
  let html = '<h1 class="page-title emergency-title">🚨 緊急時の案内</h1>';
  html += dangerSignsHtml();

  html += '<section class="card"><h2>📞 動物病院へ連絡する</h2>';
  if (h.phone) {
    html += '<a class="btn danger block big" href="tel:' + esc(h.phone.replace(/[^\d+]/g, '')) + '">' + esc(h.name || 'かかりつけの動物病院') + 'に電話する<small>' + esc(h.phone) + '</small></a>';
    if (h.note) html += '<p class="muted small pre">' + esc(h.note) + '</p>';
  } else {
    html += '<p>かかりつけの動物病院を登録しておくと、ここからすぐに電話できます。</p><button type="button" class="btn ghost block" data-action="editHospital">かかりつけ病院を登録する</button>';
  }
  const nt = db.settings.night;
  if (nt.phone) {
    html += '<a class="btn danger-ghost block big night-call" href="tel:' + esc(nt.phone.replace(/[^\d+]/g, '')) + '">🌙 ' + esc(nt.name || '夜間・救急の動物病院') + 'に電話する<small>' + esc(nt.phone) + '</small></a>';
    if (nt.note) html += '<p class="muted small pre">' + esc(nt.note) + '</p>';
  } else {
    html += '<button type="button" class="btn ghost block" data-action="editHospital" data-kind="night">🌙 夜間・救急の病院を登録する</button>';
  }
  html += '<p class="muted small">診療時間外や受け入れ可否は病院ごとに異なります。<strong>向かう前に必ず電話で確認してください。</strong></p>' +
    (pet ? '<button type="button" class="btn ghost block" data-nav="card">🪪 もしもカードを見せる（持病・アレルギー・薬）</button>' : '') + '</section>';

  html += '<section class="card"><h2>🗺️ 近くの動物病院を探す</h2><p class="muted small">地図アプリで検索します。表示される営業時間などは最新でない場合があります。</p>' +
    '<div class="form-actions"><a class="btn ghost block" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent('動物病院') + '">近くの動物病院（Googleマップ）</a>' +
    '<a class="btn ghost block" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent('夜間救急 動物病院') + '">夜間・救急の動物病院を探す</a>' +
    (pet && D.DOG_CAT.indexOf(pet.species) < 0 ? '<a class="btn ghost block" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(speciesOf(pet.species).label + ' 診察 動物病院 エキゾチック') + '">' + esc(speciesOf(pet.species).label) + 'を診られる動物病院を探す</a>' : '') + '</div></section>';

  html += '<section class="card"><h2>📝 電話で伝えること</h2><ul class="check-list">' +
    '<li>ペットの名前・種類・年齢・体重</li><li>どんな症状が、いつから、何回あったか</li><li>呼吸・意識・歩き方の様子</li><li>食べた可能性のあるもの（パッケージがあれば手元に）</li><li>持病・服用中の薬</li></ul>';
  if (pet) {
    html += '<p class="sub">電話で読み上げるメモ</p><pre class="memo phone-script">' + esc(phoneScript(pet)) + '</pre>' +
      '<button type="button" class="btn ghost block" data-action="copyPhoneScript">読み上げメモをコピー</button>';
  }
  const latest = db.memos.length ? db.memos[db.memos.length - 1] : null;
  if (latest) {
    html += '<p class="sub">最新の問診メモ（' + esc(fmtDateTime(latest.createdAt)) + '）</p><pre class="memo">' + esc(latest.text) + '</pre>' +
      '<button type="button" class="btn primary block" data-action="copyLatestMemo">問診メモをコピー</button>';
  }
  html += '<button type="button" class="btn ghost block" data-action="startInterview">問診メモを作成する</button></section>';
  if (pet) {
    html += '<section class="card"><h2>🔗 病院に情報を見せる</h2><p class="muted small">プロフィール・問診メモ・最近の記録をまとめたリンクとQRコードを作ります。受付で見せたり、LINEやメールで送ったりできます。</p>' +
      '<button type="button" class="btn primary block" data-action="openShare" data-id="' + esc(pet.id) + '">共有リンク・QRコードを作る</button></section>';
  }

  if (pet) {
    html += petChips(pet.id, 'selectPet');
    const logs = recentLogs(pet.id, 24);
    html += '<section class="card"><h2>📋 ' + esc(pet.name) + 'の直近24時間の記録</h2><p class="muted small">' + esc(petSummaryLines(pet).slice(1).join(' / ')) + '</p>';
    html += logs.length ? '<ul class="log-list">' + logs.map((l) => logItemHtml(l, false).replace('<span class="log-time">' + esc(l.datetime.slice(11, 16)), '<span class="log-time">' + esc(fmtShort(l.datetime)))).join('') + '</ul>' : '<p class="empty">直近24時間の記録はありません。</p>';
    html += '</section>';
  }
  return html;
}
