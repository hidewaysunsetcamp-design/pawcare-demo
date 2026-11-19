/* PAWCARE アバター（v1.11→v1.12でイラストに差し替え）
 * ホームで動く「うちの子」。動物ごとのイラストに、着せかえのアクセサリーを重ねる。
 * ・設定値はすべて下の一覧のidで持ち、一覧にない値は既定値に戻す（SVGに外部の文字列を入れない）。
 * ・セリフは記録の状況から決まった文を選ぶだけ。病気の判断や「大丈夫」といった言葉は使わない（ADR-007）。 */
(function () {
  'use strict';

  /* v1.12：オーナー提供のイラスト（img/avatars/*.webp）に差し替え。
   * 「すがた」は動物ごとの絵の種類、アクセサリーは頭の上に重ねるSVG。設定値は一覧のidだけ保存する。 */
  var LOOKS = {
    dog: [{ id: 'base', label: 'いつもの', file: 'dog' }, { id: 'party', label: 'パーティー', file: 'v_dog_hat', acc: true }],
    cat: [{ id: 'base', label: 'さばとら', file: 'cat' }, { id: 'black', label: 'くろねこ', file: 'v_cat_black' }],
    rabbit: [{ id: 'base', label: 'いつもの', file: 'rabbit' }, { id: 'book', label: 'どくしょ', file: 'v_rabbit_book', acc: true }],
    hamster: [{ id: 'base', label: 'いつもの', file: 'hamster' }],
    bird: [{ id: 'base', label: 'きみどり', file: 'bird' }, { id: 'blue', label: 'みずいろ', file: 'v_bird_blue' }],
    reptile: [{ id: 'base', label: 'いつもの', file: 'reptile' }],
    fish: [{ id: 'base', label: 'いつもの', file: 'fish' }, { id: 'crown', label: 'おうさま', file: 'v_fish_crown', acc: true }],
    squirrel: [{ id: 'base', label: 'いつもの', file: 'squirrel' }],
    insect: [{ id: 'base', label: 'いつもの', file: 'insect' }],
    other: [{ id: 'base', label: 'いつもの', file: 'other' }]
  };
  /* 頭のてっぺんの位置（320×320の絵の中の座標）と、アクセサリーの大きさ */
  var HEAD = {
    dog: [168, 46, 1.35], cat: [132, 52, 1.2], rabbit: [152, 106, 1.05], hamster: [160, 36, 1.35], bird: [128, 30, 1.2],
    reptile: [228, 126, .95], fish: [126, 106, 1.05], squirrel: [112, 94, 1.05], insect: [160, 82, 1.2], other: [156, 78, 1.3]
  };
  var COLORS = [
    { id: 'red', label: 'あか', hex: '#E8705F' }, { id: 'pink', label: 'ピンク', hex: '#F5A6BC' }, { id: 'blue', label: 'あお', hex: '#6FAEDB' },
    { id: 'green', label: 'みどり', hex: '#7CC47A' }, { id: 'yellow', label: 'きいろ', hex: '#F2CF4A' }, { id: 'purple', label: 'むらさき', hex: '#A98FDB' }
  ];
  var ACCS = [{ id: 'none', label: 'なし' }, { id: 'ribbon', label: 'リボン' }, { id: 'hat', label: 'パーティー帽' }, { id: 'crown', label: 'おうかん' }];
  var BG = [
    { id: 'sky', label: 'そら', a: '#E9F6FD', b: '#FFFFFF' }, { id: 'grass', label: 'はらっぱ', a: '#EAF7E4', b: '#FFFFFF' },
    { id: 'sunset', label: 'ゆうやけ', a: '#FFEBDD', b: '#FFF9F3' }, { id: 'night', label: 'よぞら', a: '#E4E3F6', b: '#F8F7FF' },
    { id: 'water', label: 'みずべ', a: '#DDF1F7', b: '#F3FBFD' }
  ];
  var DEFAULT_ACC = { dog: 'none', cat: 'none', rabbit: 'ribbon', hamster: 'none', bird: 'none', reptile: 'none', fish: 'none', squirrel: 'none', insect: 'none', other: 'none' };

  function find(list, id, dflt) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return dflt !== undefined ? find(list, dflt) : list[0]; }
  function spOf(pet) { return LOOKS[pet && pet.species] ? pet.species : 'other'; }
  function settings(pet) {
    var sp = spOf(pet);
    var a = (pet && pet.avatar) || {};
    return {
      look: find(LOOKS[sp], a.look, 'base').id, acc: find(ACCS, a.acc, DEFAULT_ACC[sp]).id,
      accColor: find(COLORS, a.accColor, 'pink').id, bg: find(BG, a.bg, 'sky').id
    };
  }
  function look(pet) { var s = settings(pet); return find(LOOKS[spOf(pet)], s.look); }

  var INK = '#4A3A35';
  var SW = 'stroke="' + INK + '" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var t = f < 0 ? 0 : 255, p = Math.abs(f);
    var c = function (v) { return Math.round((t - v) * p + v); };
    return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
  }
  /* 頭の上のアクセサリー（320×320のSVG。絵の上に重ねる） */
  function accSvg(pet) {
    var s = settings(pet), lk = look(pet);
    if (s.acc === 'none' || lk.acc) return '';
    var h = HEAD[spOf(pet)], c = find(COLORS, s.accColor).hex, dk = shade(c, -0.3);
    var g;
    if (s.acc === 'ribbon') g = '<path d="M0 0 l-26 -16 v32 z M0 0 l26 -16 v32 z" fill="' + c + '" ' + SW + '/><circle r="8" fill="' + dk + '" ' + SW + '/>';
    else if (s.acc === 'hat') g = '<path d="M-24 6 L0 -60 L24 6 Z" fill="' + c + '" ' + SW + '/><path d="M-14 -16 L12 -24 M-8 -36 L7 -41" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cy="-62" r="9" fill="#F7D95C" ' + SW + '/>';
    else g = '<path d="M-30 6 L-26 -28 L-12 -10 L0 -36 L12 -10 L26 -28 L30 6 Z" fill="#F7D95C" ' + SW + '/><circle cy="-4" r="6" fill="' + c + '"/>';
    return '<g class="av-acc" transform="translate(' + h[0] + ' ' + (h[1] + 2) + ') scale(' + h[2] + ')">' + g + '</g>';
  }
  function imgUrl(pet) { return 'img/avatars/' + look(pet).file + '.webp'; }

  /* アバターのHTML。opts.static=true で動きなし */
  function html(pet, opts) {
    opts = opts || {};
    var size = opts.size || 140, sp = spOf(pet);
    return '<span class="av av-' + sp + (opts.static ? '' : ' av-live') + '" style="width:' + size + 'px;height:' + size + 'px" role="img" aria-label="' + (opts.label || 'うちの子のアバター').replace(/[<>"&]/g, '') + '">' +
      '<span class="av-shadow" aria-hidden="true"></span><span class="av-body"><img src="' + imgUrl(pet) + '" alt="" width="' + size + '" height="' + size + '" draggable="false">' +
      '<svg class="av-over" viewBox="0 0 320 320" aria-hidden="true">' + accSvg(pet) + '</svg></span></span>';
  }
  /* 画像用：キャンバスに描く */
  function draw(ctx, pet, x, y, size) {
    var load = function (src) { return new Promise(function (ok, ng) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = ng; i.src = src; }); };
    var over = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="' + size + '" height="' + size + '">' + accSvg(pet) + '</svg>';
    return Promise.all([load(imgUrl(pet)), load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(over))]).then(function (im) {
      ctx.drawImage(im[0], x, y, size, size); ctx.drawImage(im[1], x, y, size, size);
    });
  }
  var FILES = []; Object.keys(LOOKS).forEach(function (k) { LOOKS[k].forEach(function (l) { FILES.push('img/avatars/' + l.file + '.webp'); }); });

  /* セリフの候補を、記録の状況から優先度順に選ぶ。ctxは app.js から渡す（今日の記録・連続日数など） */
  function lines(pet, ctx) {
    var out = [];
    var add = function (t) { if (t) out.push(t); };
    if (ctx.calm) return ['ここにいるよ。上の案内を先に見てね。'];
    var h = ctx.hour;
    var has = function (c) { return ctx.quick.indexOf(c) >= 0; };
    if (ctx.due) add(ctx.due + 'の予定、わすれないでね。');
    if (ctx.daily && ctx.daily.goal.length) {
      if (ctx.daily.perfect) add('今日のお世話、パーフェクト！ ありがとう！');
      else if (ctx.daily.done.length && ctx.daily.left <= 2) add('今日のお世話、あと' + ctx.daily.left + 'つ！ がんばろ〜');
    }
    if (has('food') && !ctx.today.food) add(h < 11 ? 'おはよう！ 朝ごはん、記録してくれる？' : '今日のごはん、記録してくれる？');
    if (has('temp') && !ctx.today.temp && (pet.species === 'reptile' || pet.species === 'insect')) add('今日のおへやの温度、はかってみて？');
    if (has('tank') && ctx.daysSince.tank > 7 && (pet.species === 'fish' || pet.species === 'reptile' || pet.species === 'hamster' || pet.species === 'bird')) add('おそうじ・水換え、そろそろかな？');
    if (has('weight') && ctx.daysSince.weight > 30) add('そろそろ体重、はかってみない？');
    if (has('walk') && !ctx.today.walk && h >= 15 && h < 20) add('お散歩いきたいな〜！');
    if (ctx.streak >= 3) add(ctx.streak + '日つづけて記録してくれてるね。ありがとう！');
    if (ctx.prepLeft > 0) add('もしもの準備、あと' + ctx.prepLeft + 'つ。いっしょにやろう！');
    if (ctx.today.count >= 3) add('今日もいっぱい見てくれてうれしいな。');
    if (ctx.today.food) add('ごはん、おいしかった〜！');
    if (h >= 21 || h < 4) add('おやすみ前に、今日のようすを残しておこうね。');
    else if (h < 10) add('おはよう！ 今日もよろしくね。');
    add('なでなでしてくれる？');
    return out;
  }
  var TAP = ['えへへ、くすぐったい！', 'だいすき！', 'もっとあそぼ！', 'うれしいな〜', 'ずっといっしょだよ'];

  window.PAWCARE_AVATAR = { LOOKS: LOOKS, COLORS: COLORS, ACCS: ACCS, BG: BG, settings: settings, look: look, html: html, draw: draw, FILES: FILES, lines: lines, TAP: TAP, find: find };
})();
