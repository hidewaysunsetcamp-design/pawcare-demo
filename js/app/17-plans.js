/* PAWCARE plans（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * 料金プラン（ADR-012）。課金はクラウド化のあと。今は案内と準備中の表示だけ
 * ============================================================ */
const PLANS = [
  { id: 'free', name: '無料', price: '0円', note: '命に関わる機能は、ずっと無料です', items: ['毎日の記録・ワンタップ記録', '緊急時の案内・電話の読み上げメモ', '病院に渡すQRの要点', 'もしもカード・問診メモ', 'ごはんチェック（計算）', '健康手帳（直近3か月）'] },
  { id: 'pro', name: 'プロ', price: '月480円（年4,800円）', note: 'AIの栄養管理で、毎日のごはんを見守る', items: ['無料プランのすべて', 'AIの栄養管理（フードの写真から成分を読み取り・月30回まで）', '体重目標の見守り・補える食品タイプの提案', 'AIの問診補助（追加の質問・要点の整理）', '月1回の振り返りレポート', '健康手帳のフル版', '広告なし'] },
  { id: 'family', name: 'ファミリー', price: '月780円（年7,800円）', note: '家族4人で、同じ子を一緒に見守る', items: ['プロのすべて', '家族4人で共有（自動で同期）', '服薬の担当を決める・家族へのお知らせ', '広告なし'] }
];
function plansHtml() {
  return '<div class="plans">' + PLANS.map((p) => '<section class="card plan plan-' + p.id + '"><div class="row-between"><h2>' + esc(p.name) + '</h2>' + (p.id === 'free' ? '<span class="tag">利用中</span>' : '<span class="tag warn">準備中</span>') + '</div>' +
    '<p class="plan-price">' + esc(p.price) + '</p><p class="muted small">' + esc(p.note) + '</p><ul class="plan-items">' + p.items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul></section>').join('') + '</div>' +
    '<p class="notice-small">プロ・ファミリーは準備中です（クラウドファンディングでの先行受付を予定しています）。価格は予定で、変わることがあります。<br>AIは病気の診断や治療の指示はしません。</p>';
}
/* 着せかえ（v1.11）：選んだ値は一覧のidだけを保存する */
function renderAvatar() {
  const A = window.PAWCARE_AVATAR;
  const pet = activePet();
  if (!pet) { location.hash = '#/home'; return ''; }
  const s = A.settings(pet);
  const bg = A.find(A.BG, s.bg);
  const sw = (k, list, colors) => '<div class="swatches" role="radiogroup">' + list.map((o) =>
    '<button type="button" role="radio" aria-checked="' + (s[k] === o.id) + '" class="sw' + (colors ? ' color' : '') + (s[k] === o.id ? ' on' : '') + '" data-action="avSet" data-k="' + k + '" data-v="' + o.id + '"' +
    (colors ? ' style="--sw:' + o.hex + '" aria-label="' + esc(o.label) + '"><span></span>' : (o.a ? ' style="--sw:' + o.a + '">' : '>') + esc(o.label)) + '</button>').join('') + '</div>';
  return '<h1 class="page-title">🎨 きせかえ</h1>' +
    '<section class="stage small" style="--bg-a:' + bg.a + ';--bg-b:' + bg.b + '"><div class="av-btn">' + A.svg(pet, { size: 150, label: pet.name + 'のアバター' }) + '</div><div class="stage-name"><h1>' + esc(pet.name) + '</h1></div></section>' +
    '<section class="card avatar-edit">' +
    '<h2>からだの色</h2>' + sw('color', A.COLORS, true) +
    '<h2>もよう</h2>' + sw('pattern', A.PATTERNS) +
    '<h2>おめめ</h2>' + sw('eyes', A.EYES) +
    '<h2>アクセサリー</h2>' + sw('acc', A.ACCS) +
    (s.acc !== 'none' && s.acc !== 'crown' ? '<h2>アクセサリーの色</h2>' + sw('accColor', A.COLORS, true) : '') +
    '<h2>はいけい</h2>' + sw('bg', A.BG) + '</section>' +
    '<button type="button" class="btn primary block" data-nav="home">できた！</button>' +
    '<button type="button" class="btn ghost block" data-action="shareAvatar">📸 この子をじまんする</button>';
}

/* じまん画像：アバター・名前・レベル・連続記録だけを載せる（健康の情報は入れない） */
function avatarImageBlob(pet) {
  const A = window.PAWCARE_AVATAR;
  const bg = A.find(A.BG, A.settings(pet).bg);
  const g = gameStats(), L = levelOf(g.exp);
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const grd = c.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, bg.a); grd.addColorStop(1, bg.b);
  c.fillStyle = grd; c.fillRect(0, 0, W, H);
  const svgText = A.svg(pet, { static: true, size: 760 });
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      c.drawImage(img, (W - 760) / 2, 150, 760, 798);
      const font = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif';
      c.textAlign = 'center'; c.fillStyle = '#3D3436';
      c.font = 'bold 92px ' + font; c.fillText(pet.name, W / 2, 1060, W - 120);
      c.font = 'bold 50px ' + font; c.fillStyle = '#5b6b67';
      c.fillText('Lv.' + L.lv + (g.streak.current ? '　🔥' + g.streak.current + '日 記録中' : '') , W / 2, 1150, W - 120);
      c.font = 'bold 40px ' + font; c.fillStyle = '#1f7a68'; c.fillText('PAWCARE', W / 2, 1270);
      cv.toBlob((b) => b ? resolve(b) : reject(new Error('画像を作れませんでした')), 'image/png');
    };
    img.onerror = () => reject(new Error('画像を作れませんでした'));
    img.src = url;
  });
}

/* 飼い方のめやす（v1.10）：動物ごとの基本の環境＋品種ごとの由来・歴史 */
function renderGuide() {
  const C = window.PAWCARE_CARE;
  const pet = activePet();
  if (!guideSel.species) { guideSel.species = pet ? pet.species : 'dog'; guideSel.breed = pet && C.BREEDS[pet.species] && C.BREEDS[pet.species][pet.breed] ? pet.breed : ''; }
  const sp = guideSel.species;
  const breeds = Object.keys(C.BREEDS[sp] || {});
  const g = C.get(sp, guideSel.breed);
  const sLabel = speciesOf(sp).label;
  let html = '<h1 class="page-title">📗 飼い方のめやす</h1>';
  html += '<section class="card"><div class="guide-pick"><label>動物<select data-guide="species">' + optionsHtml(D.SPECIES, sp) + '</select></label>' +
    '<label>品種<select data-guide="breed">' + optionsHtml(breeds.map((b) => ({ id: b, label: b })), guideSel.breed, '（動物の基本だけ見る）') + '</select></label></div>' +
    (pet ? '<p class="small muted">はじめは「' + esc(pet.name) + '」の種類・品種を表示しています。</p>' : '') + '</section>';
  const rows = [['🌡️', '温度', g.temp], ['💧', '湿度', g.humid], ['🍚', 'ごはん', g.food], ['🛏️', '寝床・住まい', g.bed], ['🐾', '習性', g.habit]];
  html += '<section class="card guide-env"><h2>' + esc(speciesOf(sp).emoji + ' ' + (guideSel.breed || sLabel)) + 'の基本の環境（おすすめ）</h2><dl class="guide-dl">' +
    rows.map((r) => '<div><dt><span aria-hidden="true">' + r[0] + '</span>' + esc(r[1]) + '</dt><dd>' + esc(r[2]) + '</dd></div>').join('') + '</dl></section>';
  if (g.breed) {
    html += '<section class="card guide-breed"><h2>' + esc(guideSel.breed) + 'について</h2>' +
      '<p><strong>原産・ルーツ：</strong>' + esc(g.breed.origin) + '</p><p><strong>歴史：</strong>' + esc(g.breed.history) + '</p>' +
      (g.breed.care ? '<p><strong>気をつけたいこと：</strong>' + esc(g.breed.care) + '</p>' : '') + '</section>';
  }
  html += '<section class="card"><h2>' + esc(sLabel) + 'と人の歴史</h2><p>' + esc(g.history) + '</p></section>';
  html += '<p class="small muted guide-note">※一般的な飼育の目安をまとめたもので、獣医師による監修を準備中です。年齢・季節・体調・個体によって合う環境は変わります。' +
    (D.DOG_CAT.indexOf(sp) < 0 ? esc(sLabel) + 'はお店や病院によって勧める環境が違うこともあるので、迎えたお店や、' + esc(sLabel) + 'を診られる動物病院でも確認してください。' : '') +
    '体調が気になるときは、この目安で判断せず動物病院に相談してください。</p>';
  return html;
}

function renderPlans() { return '<h1 class="page-title">💎 プラン</h1>' + plansHtml(); }
function upsellHtml(kind) {
  const t = kind === 'family' ? ['👪', 'ファミリープラン（準備中）なら、家族4人で記録を自動で共有できます。'] : ['💎', 'プロプラン（準備中）なら、AIがフードの写真から成分を読み取り、毎日のごはんを見守ります。'];
  return '<button type="button" class="upsell" data-nav="plans"><span aria-hidden="true">' + t[0] + '</span><span>' + esc(t[1]) + '</span><span class="chev" aria-hidden="true">›</span></button>';
}

/* 広告枠（無料プランだけ・必ず「PR」表示・命に関わる画面やAIの結果には出さない） */
const AD_SLOTS = ['home', 'logs'];
function adSlotHtml(slot) {
  const ads = (D.ADS || []).filter((a) => a.slots && a.slots.indexOf(slot) >= 0 && /^https:\/\//.test(a.url));
  if (AD_SLOTS.indexOf(slot) < 0 || !ads.length || currentPlan() !== 'free') return '';
  const a = ads[(new Date().getDate()) % ads.length];
  return '<a class="card ad-card" href="' + esc(a.url) + '" target="_blank" rel="sponsored noopener noreferrer"><span class="ad-label">PR</span><span class="ad-title">' + esc(a.title) + '</span><span class="muted small">' + esc(a.text || '') + '</span><span class="ad-sponsor">提供：' + esc(a.sponsor || '') + '</span></a>';
}
function currentPlan() { return 'free'; /* 課金の実装まではすべて無料プラン */ }
