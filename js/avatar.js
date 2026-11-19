/* PAWCARE アバター（v1.11）
 * ホームで動く「うちの子」。丸いゆるキャラ風のSVGを、動物の種類と着せかえ設定から組み立てる。
 * ・設定値はすべて下の一覧のidで持ち、一覧にない値は既定値に戻す（SVGに外部の文字列を入れない）。
 * ・セリフは記録の状況から決まった文を選ぶだけ。病気の判断や「大丈夫」といった言葉は使わない（ADR-007）。 */
(function () {
  'use strict';

  var COLORS = [
    { id: 'cream', label: 'クリーム', hex: '#F6E3C2' }, { id: 'white', label: 'しろ', hex: '#FFFFFF' },
    { id: 'gold', label: 'ゴールド', hex: '#E8C170' }, { id: 'orange', label: 'オレンジ', hex: '#F2A65A' },
    { id: 'brown', label: 'ちゃいろ', hex: '#C98B55' }, { id: 'choco', label: 'チョコ', hex: '#7A5232' },
    { id: 'gray', label: 'グレー', hex: '#A9AEB5' }, { id: 'black', label: 'くろ', hex: '#4A4446' },
    { id: 'yellow', label: 'きいろ', hex: '#F7D95C' }, { id: 'green', label: 'みどり', hex: '#9BD38A' },
    { id: 'blue', label: 'みずいろ', hex: '#8CC8E8' }, { id: 'pink', label: 'ピンク', hex: '#F5B5C8' },
    { id: 'red', label: 'あか', hex: '#E8705F' }, { id: 'purple', label: 'むらさき', hex: '#B9A3E3' }
  ];
  var PATTERNS = [
    { id: 'none', label: 'なし' }, { id: 'belly', label: 'おなか' }, { id: 'spots', label: 'ぶち' },
    { id: 'stripes', label: 'しま' }, { id: 'patch', label: 'めのまわり' }
  ];
  var EYES = [
    { id: 'round', label: 'まんまる' }, { id: 'sparkle', label: 'きらきら' }, { id: 'smile', label: 'にっこり' }, { id: 'sleepy', label: 'ねむそう' }
  ];
  var ACCS = [
    { id: 'none', label: 'なし' }, { id: 'ribbon', label: 'リボン' }, { id: 'collar', label: '首輪' },
    { id: 'bandana', label: 'バンダナ' }, { id: 'hat', label: 'パーティー帽' }, { id: 'crown', label: 'おうかん' }, { id: 'glasses', label: 'めがね' }
  ];
  var BG = [
    { id: 'sky', label: 'そら', a: '#E9F6FD', b: '#FFFFFF' }, { id: 'grass', label: 'はらっぱ', a: '#EAF7E4', b: '#FFFFFF' },
    { id: 'sunset', label: 'ゆうやけ', a: '#FFEBDD', b: '#FFF9F3' }, { id: 'night', label: 'よぞら', a: '#E4E3F6', b: '#F8F7FF' },
    { id: 'water', label: 'みずべ', a: '#DDF1F7', b: '#F3FBFD' }
  ];

  /* 動物ごとの最初の見た目 */
  var DEFAULTS = {
    dog: { color: 'brown', pattern: 'belly', eyes: 'round', acc: 'collar', accColor: 'red' },
    cat: { color: 'orange', pattern: 'stripes', eyes: 'round', acc: 'none', accColor: 'blue' },
    rabbit: { color: 'white', pattern: 'none', eyes: 'round', acc: 'ribbon', accColor: 'pink' },
    hamster: { color: 'gold', pattern: 'belly', eyes: 'round', acc: 'none', accColor: 'red' },
    bird: { color: 'green', pattern: 'belly', eyes: 'round', acc: 'none', accColor: 'yellow' },
    reptile: { color: 'yellow', pattern: 'spots', eyes: 'round', acc: 'none', accColor: 'red' },
    fish: { color: 'orange', pattern: 'none', eyes: 'round', acc: 'none', accColor: 'blue' },
    squirrel: { color: 'brown', pattern: 'stripes', eyes: 'round', acc: 'none', accColor: 'green' },
    insect: { color: 'choco', pattern: 'none', eyes: 'round', acc: 'none', accColor: 'yellow' },
    other: { color: 'cream', pattern: 'none', eyes: 'round', acc: 'bandana', accColor: 'blue' }
  };

  function find(list, id, dflt) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return find(list, dflt, list[0].id); }
  function settings(pet) {
    var d = DEFAULTS[pet && pet.species] || DEFAULTS.other;
    var a = (pet && pet.avatar) || {};
    return {
      color: find(COLORS, a.color, d.color).id, pattern: find(PATTERNS, a.pattern, d.pattern).id,
      eyes: find(EYES, a.eyes, d.eyes).id, acc: find(ACCS, a.acc, d.acc).id,
      accColor: find(COLORS, a.accColor, d.accColor).id, bg: find(BG, a.bg, 'sky').id
    };
  }

  /* 色を少し暗く／明るく */
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var t = f < 0 ? 0 : 255, p = Math.abs(f);
    var c = function (v) { return Math.round((t - v) * p + v); };
    return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
  }

  var INK = '#3D3436';
  var SW = 'stroke="' + INK + '" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';

  function eyesSvg(kind, cx1, cx2, cy, r) {
    r = r || 9;
    var one = function (x) {
      if (kind === 'smile') return '<path d="M' + (x - r) + ' ' + (cy + 2) + ' Q' + x + ' ' + (cy - r - 2) + ' ' + (x + r) + ' ' + (cy + 2) + '" fill="none" ' + SW + '/>';
      if (kind === 'sleepy') return '<path d="M' + (x - r) + ' ' + cy + ' Q' + x + ' ' + (cy + r) + ' ' + (x + r) + ' ' + cy + '" fill="none" ' + SW + '/>';
      var hi = kind === 'sparkle' ? '<circle cx="' + (x - 3) + '" cy="' + (cy - 4) + '" r="4" fill="#fff"/><circle cx="' + (x + 3) + '" cy="' + (cy + 3) + '" r="2" fill="#fff"/>' : '<circle cx="' + (x - 3) + '" cy="' + (cy - 3) + '" r="3" fill="#fff"/>';
      return '<ellipse cx="' + x + '" cy="' + cy + '" rx="' + (kind === 'sparkle' ? r + 2 : r) + '" ry="' + (kind === 'sparkle' ? r + 3 : r + 1) + '" fill="' + INK + '"/>' + hi;
    };
    return '<g class="av-eyes">' + one(cx1) + one(cx2) + '</g>';
  }
  function cheeks(x1, x2, y) {
    return '<ellipse cx="' + x1 + '" cy="' + y + '" rx="10" ry="6" fill="#F7A1A8" opacity=".55"/><ellipse cx="' + x2 + '" cy="' + y + '" rx="10" ry="6" fill="#F7A1A8" opacity=".55"/>';
  }
  /* 本体の円に合わせた模様（clipPathの内側に描く） */
  function patternSvg(kind, base, clipId, belly) {
    var dark = shade(base, -0.28), light = shade(base, 0.6);
    var inner = '';
    if (kind === 'belly') inner = '<ellipse cx="100" cy="' + (belly || 150) + '" rx="40" ry="32" fill="' + light + '"/>';
    else if (kind === 'spots') inner = '<circle cx="62" cy="96" r="13" fill="' + dark + '"/><circle cx="140" cy="140" r="16" fill="' + dark + '"/><circle cx="128" cy="78" r="8" fill="' + dark + '"/><circle cx="74" cy="150" r="9" fill="' + dark + '"/>';
    else if (kind === 'stripes') inner = '<path d="M86 50 l6 22 M100 46 v24 M114 50 l-6 22" ' + 'stroke="' + dark + '" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M40 120 h22 M40 138 h18 M160 120 h-22 M160 138 h-18" stroke="' + dark + '" stroke-width="7" stroke-linecap="round"/>';
    else if (kind === 'patch') inner = '<ellipse cx="127" cy="104" rx="22" ry="20" fill="' + dark + '"/>';
    return inner ? '<g clip-path="url(#' + clipId + ')">' + inner + '</g>' : '';
  }

  function accSvg(kind, col, headTop) {
    var c = col, dk = shade(col, -0.3);
    var ht = headTop || 46;
    switch (kind) {
      case 'ribbon': return '<g class="av-acc"><path d="M128 ' + (ht + 6) + ' l-22 -14 v28 z M128 ' + (ht + 6) + ' l22 -14 v28 z" fill="' + c + '" ' + SW + '/><circle cx="128" cy="' + (ht + 6) + '" r="7" fill="' + dk + '" ' + SW + '/></g>';
      case 'collar': return '<g class="av-acc"><path d="M58 166 Q100 184 142 166" fill="none" stroke="' + c + '" stroke-width="12" stroke-linecap="round"/><circle cx="100" cy="181" r="9" fill="#F7D95C" ' + SW + '/></g>';
      case 'bandana': return '<g class="av-acc"><path d="M56 160 Q100 178 144 160 L100 196 Z" fill="' + c + '" ' + SW + '/><circle cx="88" cy="174" r="3" fill="#fff"/><circle cx="108" cy="180" r="3" fill="#fff"/></g>';
      case 'hat': return '<g class="av-acc"><path d="M80 ' + (ht + 10) + ' L100 ' + (ht - 44) + ' L120 ' + (ht + 10) + ' Z" fill="' + c + '" ' + SW + '/><circle cx="100" cy="' + (ht - 46) + '" r="8" fill="#F7D95C" ' + SW + '/><path d="M88 ' + (ht - 8) + ' l24 -6" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>';
      case 'crown': return '<g class="av-acc"><path d="M74 ' + (ht + 6) + ' L78 ' + (ht - 26) + ' L90 ' + (ht - 8) + ' L100 ' + (ht - 32) + ' L110 ' + (ht - 8) + ' L122 ' + (ht - 26) + ' L126 ' + (ht + 6) + ' Z" fill="#F7D95C" ' + SW + '/><circle cx="100" cy="' + (ht - 4) + '" r="5" fill="' + c + '"/></g>';
      case 'glasses': return '<g class="av-acc"><circle cx="78" cy="104" r="17" fill="#fff" fill-opacity=".25" stroke="' + dk + '" stroke-width="5"/><circle cx="122" cy="104" r="17" fill="#fff" fill-opacity=".25" stroke="' + dk + '" stroke-width="5"/><path d="M95 104 h10" stroke="' + dk + '" stroke-width="5"/></g>';
      default: return '';
    }
  }

  /* 動物ごとの形（耳・しっぽ・くちばしなど）。本体は中心(100,120)・半径62の円が基本 */
  function speciesSvg(sp, s, base, clip) {
    var dark = shade(base, -0.25), light = shade(base, 0.55), pink = '#F5AAB8';
    var body = '<circle cx="100" cy="120" r="62" fill="' + base + '" ' + SW + '/>';
    var pat = patternSvg(s.pattern, base, clip);
    var eyes = eyesSvg(s.eyes, 78, 122, 108);
    var mouth = '<path d="M92 128 Q100 136 108 128" fill="none" ' + SW + '/>';
    var back = '', front = '';
    switch (sp) {
      case 'dog':
        back = '<g class="av-tail"><path d="M152 150 Q182 128 172 104" fill="none" stroke="' + INK + '" stroke-width="16" stroke-linecap="round"/><path d="M152 150 Q182 128 172 104" fill="none" stroke="' + base + '" stroke-width="7" stroke-linecap="round"/></g>';
        front = '<ellipse cx="46" cy="96" rx="17" ry="30" fill="' + dark + '" ' + SW + ' transform="rotate(18 46 96)"/><ellipse cx="154" cy="96" rx="17" ry="30" fill="' + dark + '" ' + SW + ' transform="rotate(-18 154 96)"/>' +
          '<ellipse cx="100" cy="128" rx="24" ry="17" fill="' + light + '" ' + SW + '/><ellipse cx="100" cy="121" rx="8" ry="6" fill="' + INK + '"/><path d="M100 127 v6 M92 136 Q100 142 108 136" fill="none" ' + SW + '/>';
        mouth = '';
        break;
      case 'cat':
        back = '<g class="av-tail"><path d="M150 160 Q190 150 178 110" fill="none" stroke="' + INK + '" stroke-width="16" stroke-linecap="round"/><path d="M150 160 Q190 150 178 110" fill="none" stroke="' + base + '" stroke-width="7" stroke-linecap="round"/></g>' +
          '<path d="M52 86 L58 40 L92 64 Z" fill="' + base + '" ' + SW + '/><path d="M148 86 L142 40 L108 64 Z" fill="' + base + '" ' + SW + '/><path d="M62 72 L64 54 L80 66 Z M138 72 L136 54 L120 66 Z" fill="' + pink + '"/>';
        front = '<path d="M95 122 h10 l-5 6 z" fill="' + pink + '" ' + SW + '/><path d="M92 132 Q96 136 100 130 Q104 136 108 132" fill="none" ' + SW + '/>' +
          '<path d="M44 118 h22 M46 130 l20 -4 M156 118 h-22 M154 130 l-20 -4" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>';
        mouth = '';
        break;
      case 'rabbit':
        back = '<g class="av-ears"><ellipse cx="78" cy="42" rx="15" ry="40" fill="' + base + '" ' + SW + '/><ellipse cx="122" cy="42" rx="15" ry="40" fill="' + base + '" ' + SW + '/><ellipse cx="78" cy="44" rx="6" ry="28" fill="' + pink + '"/><ellipse cx="122" cy="44" rx="6" ry="28" fill="' + pink + '"/></g>' +
          '<circle cx="160" cy="160" r="15" fill="' + light + '" ' + SW + '/>';
        front = '<path d="M95 122 h10 l-5 6 z" fill="' + pink + '"/><path d="M100 128 v6 M92 136 Q96 139 100 134 Q104 139 108 136" fill="none" ' + SW + '/>';
        mouth = '';
        break;
      case 'hamster':
        body = '<ellipse cx="100" cy="126" rx="70" ry="58" fill="' + base + '" ' + SW + '/>';
        back = '<circle cx="54" cy="76" r="16" fill="' + base + '" ' + SW + '/><circle cx="146" cy="76" r="16" fill="' + base + '" ' + SW + '/><circle cx="54" cy="76" r="8" fill="' + pink + '"/><circle cx="146" cy="76" r="8" fill="' + pink + '"/>';
        front = '<ellipse cx="54" cy="134" rx="18" ry="15" fill="' + light + '"/><ellipse cx="146" cy="134" rx="18" ry="15" fill="' + light + '"/><circle cx="100" cy="124" r="5" fill="' + pink + '" ' + SW + '/><path d="M93 134 Q100 140 107 134" fill="none" ' + SW + '/>' +
          '<ellipse cx="84" cy="176" rx="9" ry="6" fill="' + pink + '" ' + SW + '/><ellipse cx="116" cy="176" rx="9" ry="6" fill="' + pink + '" ' + SW + '/>';
        mouth = '';
        break;
      case 'bird':
        back = '<path d="M96 60 Q90 34 104 40 Q102 50 112 46 Q108 58 104 62" fill="' + base + '" ' + SW + '/>' +
          '<g class="av-tail"><path d="M150 150 L184 168 L168 140 Z" fill="' + dark + '" ' + SW + '/></g>';
        front = '<path d="M86 124 L100 118 L114 124 L100 140 Z" fill="#F7B84A" ' + SW + '/><g class="av-wing"><ellipse cx="146" cy="136" rx="18" ry="30" fill="' + dark + '" ' + SW + ' transform="rotate(-20 146 136)"/></g>';
        mouth = '';
        break;
      case 'reptile':
        body = '<ellipse cx="100" cy="122" rx="72" ry="56" fill="' + base + '" ' + SW + '/>';
        back = '<g class="av-tail"><path d="M160 150 Q196 160 190 124 Q186 112 176 118" fill="none" stroke="' + INK + '" stroke-width="22" stroke-linecap="round"/><path d="M160 150 Q196 160 190 124 Q186 112 176 118" fill="none" stroke="' + base + '" stroke-width="12" stroke-linecap="round"/></g>' +
          '<ellipse cx="62" cy="176" rx="14" ry="8" fill="' + base + '" ' + SW + '/><ellipse cx="138" cy="176" rx="14" ry="8" fill="' + base + '" ' + SW + '/>';
        eyes = eyesSvg(s.eyes, 72, 128, 100, 11);
        mouth = '<path d="M68 132 Q100 148 132 132" fill="none" ' + SW + '/>';
        break;
      case 'fish':
        body = '<ellipse cx="96" cy="120" rx="66" ry="52" fill="' + base + '" ' + SW + '/>';
        back = '<g class="av-tail"><path d="M152 120 L192 90 Q182 120 192 150 Z" fill="' + dark + '" ' + SW + '/></g><path d="M78 72 Q100 46 128 74" fill="' + dark + '" ' + SW + '/>';
        front = '<path d="M98 140 Q114 150 120 132" fill="' + dark + '" ' + SW + '/><path d="M40 124 Q46 130 52 124" fill="none" ' + SW + '/>' +
          '<circle class="av-bubble" cx="30" cy="80" r="6" fill="#fff" stroke="#8CC8E8" stroke-width="3"/><circle class="av-bubble b2" cx="20" cy="56" r="4" fill="#fff" stroke="#8CC8E8" stroke-width="3"/>';
        eyes = eyesSvg(s.eyes, 62, 96, 108, 9);
        mouth = '';
        break;
      case 'squirrel':
        back = '<g class="av-tail"><path d="M140 170 Q206 150 176 70 Q164 46 146 66 Q176 100 146 150 Z" fill="' + dark + '" ' + SW + '/></g>' +
          '<path d="M60 76 L60 42 L86 66 Z" fill="' + base + '" ' + SW + '/><path d="M140 76 L140 42 L114 66 Z" fill="' + base + '" ' + SW + '/>';
        front = '<ellipse cx="100" cy="150" rx="30" ry="22" fill="' + light + '"/><circle cx="100" cy="124" r="5" fill="' + INK + '"/><path d="M93 132 Q100 138 107 132" fill="none" ' + SW + '/>';
        mouth = '';
        break;
      case 'insect':
        body = '<ellipse cx="100" cy="132" rx="62" ry="52" fill="' + base + '" ' + SW + '/><path d="M100 84 V184" ' + SW + '/>';
        back = '<path d="M50 140 l-22 10 M48 160 l-20 20 M56 118 l-24 -6 M150 140 l22 10 M152 160 l20 20 M144 118 l24 -6" ' + SW + '/>' +
          '<g class="av-ears"><path d="M100 70 Q96 30 120 22" fill="none" stroke="' + INK + '" stroke-width="12" stroke-linecap="round"/><path d="M100 70 Q96 30 120 22" fill="none" stroke="' + dark + '" stroke-width="5" stroke-linecap="round"/></g>' +
          '<ellipse cx="100" cy="84" rx="40" ry="24" fill="' + dark + '" ' + SW + '/>';
        eyes = eyesSvg(s.eyes, 80, 120, 84, 7);
        front = '<path d="M64 120 Q80 110 92 120" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6"/>';
        mouth = '';
        break;
      default:
        back = '<circle cx="58" cy="70" r="16" fill="' + base + '" ' + SW + '/><circle cx="142" cy="70" r="16" fill="' + base + '" ' + SW + '/>' +
          '<g class="av-tail"><path d="M152 158 Q184 150 176 124" fill="none" stroke="' + INK + '" stroke-width="16" stroke-linecap="round"/><path d="M152 158 Q184 150 176 124" fill="none" stroke="' + base + '" stroke-width="7" stroke-linecap="round"/></g>';
        front = '<ellipse cx="100" cy="126" rx="7" ry="5" fill="' + INK + '"/>';
    }
    var clipShape = body.replace(/ (stroke|stroke-width|stroke-linejoin|stroke-linecap)="[^"]*"/g, '').replace(/ fill="[^"]*"/, '');
    var bellyY = sp === 'bird' ? 146 : 154;
    pat = patternSvg(s.pattern, base, clip, bellyY);
    var headTop = { rabbit: 58, hamster: 66, reptile: 64, fish: 60, insect: 58 }[sp] || 54;
    return { defs: '<clipPath id="' + clip + '">' + clipShape + '</clipPath>', back: back, body: body + pat, front: front + cheeks(sp === 'fish' ? 54 : 66, sp === 'fish' ? 108 : 134, sp === 'reptile' ? 120 : 126) + eyes + mouth, headTop: headTop };
  }

  var seq = 0;
  /* アバターのSVG（文字列）。opts.static=true でアニメーションなし（画像用） */
  function svg(pet, opts) {
    opts = opts || {};
    var s = settings(pet);
    var sp = DEFAULTS[pet && pet.species] ? pet.species : 'other';
    var base = find(COLORS, s.color).hex;
    var clip = 'avc' + (++seq);
    var parts = speciesSvg(sp, s, base, clip);
    var acc = accSvg(s.acc, find(COLORS, s.accColor).hex, parts.headTop);
    var size = opts.size || 160;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 210" width="' + size + '" height="' + Math.round(size * 1.05) + '" class="av av-' + sp + (opts.static ? '' : ' av-live') + '" role="img" aria-label="' + (opts.label || 'うちの子のアバター') + '">' +
      '<defs>' + parts.defs + '</defs>' +
      '<ellipse class="av-shadow" cx="100" cy="196" rx="52" ry="8" fill="#000" opacity=".08"/>' +
      '<g class="av-body">' + parts.back + parts.body + parts.front + acc + '</g></svg>';
  }

  /* セリフの候補を、記録の状況から優先度順に選ぶ。ctxは app.js から渡す（今日の記録・連続日数など） */
  function lines(pet, ctx) {
    var out = [];
    var add = function (t) { if (t) out.push(t); };
    if (ctx.calm) return ['ここにいるよ。上の案内を先に見てね。'];
    var h = ctx.hour;
    var has = function (c) { return ctx.quick.indexOf(c) >= 0; };
    if (ctx.due) add(ctx.due + 'の予定、わすれないでね。');
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

  window.PAWCARE_AVATAR = { COLORS: COLORS, PATTERNS: PATTERNS, EYES: EYES, ACCS: ACCS, BG: BG, settings: settings, svg: svg, lines: lines, TAP: TAP, find: find };
})();
