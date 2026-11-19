/* PAWCARE 定数データ（選択肢・カテゴリなど） */
'use strict';

window.PAWCARE_DATA = (function () {
  var COMMON_TAIL = ['ミックス', '不明', 'その他'];

  var SPECIES = [
    { id: 'dog', label: '犬', emoji: '🐶' },
    { id: 'cat', label: '猫', emoji: '🐱' },
    { id: 'rabbit', label: 'うさぎ', emoji: '🐰' },
    { id: 'hamster', label: 'ハムスター', emoji: '🐹' },
    { id: 'bird', label: 'インコ・文鳥', emoji: '🦜' },
    { id: 'reptile', label: '爬虫類', emoji: '🦎' },
    { id: 'fish', label: '魚', emoji: '🐠' },
    { id: 'squirrel', label: 'リス', emoji: '🐿️' },
    { id: 'insect', label: '昆虫', emoji: '🐜' },
    { id: 'other', label: 'その他', emoji: '🐾' }
  ];

  var BREEDS = {
    dog: [
      'トイ・プードル', 'チワワ', 'ミニチュア・ダックスフンド', 'カニンヘン・ダックスフンド',
      'ポメラニアン', '柴犬', '豆柴', 'ミニチュア・シュナウザー', 'ヨークシャー・テリア',
      'フレンチ・ブルドッグ', 'シー・ズー', 'マルチーズ', 'ゴールデン・レトリーバー',
      'ラブラドール・レトリーバー', 'パグ', 'ウェルシュ・コーギー・ペンブローク',
      'ジャック・ラッセル・テリア', 'パピヨン', 'キャバリア・キング・チャールズ・スパニエル',
      'ビション・フリーゼ', 'ボーダー・コリー', 'シェットランド・シープドッグ',
      'ビーグル', 'イタリアン・グレーハウンド', 'ペキニーズ', 'ボストン・テリア',
      'バーニーズ・マウンテン・ドッグ', '秋田犬', '甲斐犬', '北海道犬', 'ミニチュア・ピンシャー',
      'ウエスト・ハイランド・ホワイト・テリア', 'シベリアン・ハスキー', 'ドーベルマン',
      'ジャーマン・シェパード', 'グレート・ピレニーズ', 'サモエド'
    ].concat(COMMON_TAIL),
    cat: [
      'スコティッシュ・フォールド', 'マンチカン', 'アメリカン・ショートヘア', 'ラグドール',
      'ノルウェージャン・フォレスト・キャット', 'ブリティッシュ・ショートヘア', 'ミヌエット',
      'ロシアンブルー', 'サイベリアン', 'ベンガル', 'メイン・クーン', 'ペルシャ',
      'エキゾチック・ショートヘア', 'ソマリ', 'アビシニアン', 'シャム', 'ラガマフィン',
      'セルカーク・レックス', 'スフィンクス', 'ヒマラヤン', 'トンキニーズ', 'シンガプーラ',
      '日本猫（雑種）'
    ].concat(COMMON_TAIL),
    rabbit: [
      'ネザーランドドワーフ', 'ホーランドロップ', 'ミニレッキス', 'ライオンヘッド',
      'ドワーフホト', 'アメリカンファジーロップ', 'ジャージーウーリー', 'ミニウサギ'
    ].concat(COMMON_TAIL),
    hamster: [
      'ゴールデンハムスター', 'ジャンガリアンハムスター', 'キャンベルハムスター',
      'ロボロフスキーハムスター', 'チャイニーズハムスター'
    ].concat(COMMON_TAIL),
    bird: [
      'セキセイインコ', 'オカメインコ', 'コザクラインコ', 'ボタンインコ', 'マメルリハ',
      '文鳥', 'カナリア', 'ジュウシマツ', 'ヨウム', 'オキナインコ'
    ].concat(COMMON_TAIL),
    reptile: [
      'ヒョウモントカゲモドキ（レオパ）', 'ニシアフリカトカゲモドキ', 'フトアゴヒゲトカゲ', 'クレステッドゲッコー', 'カメレオン',
      'ボールパイソン', 'コーンスネーク', 'ミシシッピアカミミガメ', 'クサガメ', 'ニホンイシガメ', 'ヘルマンリクガメ', 'ロシアリクガメ'
    ].concat(COMMON_TAIL),
    fish: ['金魚', 'メダカ', '錦鯉', 'ベタ', 'グッピー', 'ネオンテトラ', 'コリドラス', 'エンゼルフィッシュ', 'アロワナ', 'その他の熱帯魚', '海水魚'].concat(COMMON_TAIL),
    squirrel: ['シマリス', 'アメリカアカリス', 'タイリクモモンガ', 'プレーリードッグ'].concat(COMMON_TAIL),
    insect: ['カブトムシ', 'ヘラクレスオオカブト', 'クワガタ', 'スズムシ', 'カマキリ', 'ナナフシ', 'アリ'].concat(COMMON_TAIL),
    other: ['フェレット', 'モルモット', 'チンチラ', 'デグー', 'ハリネズミ', 'カエル・両生類'].concat(COMMON_TAIL)
  };

  /* ホームのワンタップ記録に並べるカテゴリ（犬・猫に合わせた順番） */
  var QUICK = {
    dog: ['food', 'water', 'walk', 'stool', 'urine', 'vomit', 'regurgitate', 'medicine', 'weight', 'ingest'],
    cat: ['food', 'water', 'urine', 'stool', 'vomit', 'regurgitate', 'medicine', 'weight', 'ingest', 'other'],
    rabbit: ['food', 'water', 'stool', 'urine', 'medicine', 'weight', 'ingest', 'other'],
    hamster: ['food', 'water', 'stool', 'urine', 'medicine', 'weight', 'tank', 'other'],
    bird: ['food', 'water', 'stool', 'regurgitate', 'medicine', 'weight', 'tank', 'other'],
    reptile: ['food', 'water', 'stool', 'shed', 'temp', 'weight', 'medicine', 'tank', 'other'],
    fish: ['food', 'tank', 'temp', 'medicine', 'other'],
    squirrel: ['food', 'water', 'stool', 'urine', 'medicine', 'weight', 'tank', 'other'],
    insect: ['food', 'shed', 'temp', 'tank', 'other'],
    other: ['food', 'water', 'stool', 'urine', 'vomit', 'medicine', 'weight', 'ingest', 'walk', 'other']
  };
  /* 今日のおせわ（v1.13）：毎日つけたい記録。全部できたら「パーフェクト」。
   * 爬虫類・昆虫は毎日食べない種が多いので、ごはんを目標に入れない */
  var DAILY = {
    dog: ['food', 'water', 'walk', 'stool', 'urine'], cat: ['food', 'water', 'urine', 'stool'],
    rabbit: ['food', 'water', 'stool'], hamster: ['food', 'water'], bird: ['food', 'water', 'stool'],
    reptile: ['temp', 'water'], fish: ['food', 'temp'], squirrel: ['food', 'water'], insect: ['temp'], other: ['food', 'water']
  };
  /* 危険な兆候の一覧・ごはんチェックの基準は犬・猫向け。ほかの動物には一般的な案内だけを出す */
  var DOG_CAT = ['dog', 'cat'];

  /* ごはんチェック（v1.4）：一般的な目安の計算に使う定数
   * 栄養基準：AAFCO Dog/Cat Food Nutrient Profiles（乾物量あたりの最低値）
   * エネルギー：RER = 70 × 体重(kg)^0.75、維持係数は一般的な目安
   * おやつ：1日のカロリーの10%まで（WSAVA等で広く使われる目安） */
  var NUTRITION = {
    aafco: {
      dog: { adult: { protein: 18, fat: 5.5 }, growth: { protein: 22.5, fat: 8.5 } },
      cat: { adult: { protein: 26, fat: 9 }, growth: { protein: 30, fat: 9 } }
    },
    factor: { dog: { neutered: 1.6, intact: 1.8 }, cat: { neutered: 1.2, intact: 1.4 } },
    treatLimit: 0.10,
    foodTypes: [
      { id: 'complete', label: '総合栄養食（主食のフード）' },
      { id: 'general', label: '一般食・副食（トッピング・ウェットの一部など）' },
      { id: 'treat', label: 'おやつ' },
      { id: 'homemade', label: '手作り・人の食べ物' }
    ],
    /* 人の食べ物で特に危険とされるもの（キーワード：表示名） */
    toxic: [
      { k: ['玉ねぎ', 'たまねぎ', 'タマネギ', 'ねぎ', 'ネギ', 'にら', 'ニラ', 'にんにく', 'ニンニク', 'らっきょう'], name: 'ネギ類（玉ねぎ・長ねぎ・にら・にんにくなど）', both: true },
      { k: ['ぶどう', 'ブドウ', '葡萄', 'レーズン', '干しぶどう'], name: 'ぶどう・レーズン', both: true },
      { k: ['チョコ', 'ココア', 'カカオ'], name: 'チョコレート・ココア', both: true },
      { k: ['キシリトール', 'ガム'], name: 'キシリトール（ガム・菓子など）', both: true },
      { k: ['マカダミア'], name: 'マカダミアナッツ', dog: true },
      { k: ['アルコール', 'お酒', 'ビール', 'ワイン'], name: 'アルコール', both: true },
      { k: ['コーヒー', 'カフェイン', '紅茶', '緑茶', 'エナジードリンク'], name: 'カフェイン（コーヒー・お茶など）', both: true },
      { k: ['骨', 'ほね'], name: '加熱した骨（割れて刺さるおそれ）', both: true },
      { k: ['ユリ', 'ゆり', '百合'], name: 'ユリ（花・葉・花粉・花瓶の水も）', cat: true },
      { k: ['人の薬', '鎮痛剤', '風邪薬', 'イブプロフェン', 'アセトアミノフェン'], name: '人の薬', both: true }
    ]
  };

  var SEXES = [
    { id: 'male', label: 'オス' },
    { id: 'female', label: 'メス' },
    { id: 'male_neutered', label: 'オス（去勢済み）' },
    { id: 'female_spayed', label: 'メス（避妊済み）' },
    { id: 'unknown', label: '不明' }
  ];

  var CATEGORIES = [
    { id: 'food', label: 'ごはん', emoji: '🍚', color: '#e8a33d' },
    { id: 'water', label: '飲水', emoji: '💧', color: '#3d8fe8' },
    { id: 'regurgitate', label: '吐き戻し', emoji: '🌀', color: '#b07ad6' },
    { id: 'vomit', label: '嘔吐', emoji: '🤢', color: '#d65a5a' },
    { id: 'stool', label: '排便', emoji: '💩', color: '#8a6a4a' },
    { id: 'urine', label: '排尿', emoji: '🚽', color: '#c9b13a' },
    { id: 'walk', label: '散歩', emoji: '🦮', color: '#3aa877' },
    { id: 'medicine', label: '服薬', emoji: '💊', color: '#e06c9f' },
    { id: 'weight', label: '体重', emoji: '⚖️', color: '#5a7bd6' },
    { id: 'ingest', label: '誤食の疑い', emoji: '⚠️', color: '#d23f3f' },
    { id: 'shed', label: '脱皮', emoji: '✨', color: '#9a7bd6' },
    { id: 'temp', label: '温度・湿度', emoji: '🌡️', color: '#e07a3d' },
    { id: 'tank', label: '掃除・水換え', emoji: '🫧', color: '#3da3c4' },
    { id: 'other', label: 'その他', emoji: '📌', color: '#7d8a87' }
  ];

  /* 問診を待たずに動物病院へ連絡すべき兆候（診断ではなく受診の目安として表示） */
  var DANGER_SIGNS = [
    '呼吸が苦しそう（安静にしていても呼吸が荒い・苦しそう、猫・うさぎ・小動物・鳥が口を開けて呼吸する、舌や歯ぐきが紫色・白っぽい）',
    '意識がない、呼びかけへの反応が鈍い、ぐったりして立てない',
    'けいれん（ひきつけ）が起きている・起きた',
    '大量の出血、または出血が止まらない',
    '交通事故・高所からの落下など強い衝撃を受けた',
    '有害なもの（人の薬・殺虫剤・タマネギ・チョコレート・キシリトール・ぶどう／レーズン、猫ではユリなど）や、おもちゃ・布などを飲み込んだ可能性がある',
    'お腹が急に膨れて、吐こうとしても吐けない',
    '何度もトイレに行く・力むのにおしっこが出ない、または長い時間まったく出ていない',
    '熱中症が疑われる（暑い場所で激しいパンティング、よだれ、ふらつき）'
  ];

  var SYMPTOMS = [
    '嘔吐', '吐き戻し', '下痢', '軟便', '血便', '便秘', '食欲がない', '水を飲まない',
    '水をたくさん飲む', '元気がない', '咳', 'くしゃみ・鼻水', '呼吸が荒い', '震え',
    'ふらつき', '足を引きずる', 'かゆがる', '皮膚の赤み・脱毛', '目やに・目の充血',
    '耳を気にする', 'おしっこの異常', '体を触ると痛がる', 'けいれん', '出血・けが', '誤食'
  ];

  var ONSET = ['1時間以内', '数時間前', '今日', '昨日', '2〜3日前', '1週間ほど前', 'それ以上前', 'わからない'];
  var FREQUENCY = ['1回だけ', '2〜3回', '4回以上', 'ずっと続いている', '時々（波がある）', 'わからない'];
  var APPETITE = ['いつも通り食べる', '少し減った', 'ほとんど食べない', 'まったく食べない', 'わからない'];
  var WATER = ['いつも通り', '少ない', '飲まない', 'いつもより多い', 'わからない'];
  var ENERGY = ['いつも通り元気', '少し元気がない', 'ぐったりして立てない', '呼びかけへの反応が鈍い', '意識がない'];
  var BREATHING = ['いつも通り', '少し速い・荒い', '安静時も苦しそうに呼吸する（猫・小動物・鳥は口を開けて呼吸）', '咳き込む', 'わからない'];

  /* 上記の選択肢のうち、危険な兆候に該当するもの */
  var DANGER_ANSWERS = ['ぐったりして立てない', '呼びかけへの反応が鈍い', '意識がない', '安静時も苦しそうに呼吸する（猫・小動物・鳥は口を開けて呼吸）'];
  /* 選ばれたら緊急度は判定せず、注意文だけを表示する症状 */
  var CAUTION_SYMPTOMS = ['誤食', '出血・けが'];
  var DANGER_SYMPTOMS = ['けいれん'];

  var REMINDER_TYPES = [
    { id: 'vaccine', label: 'ワクチン', emoji: '💉' },
    { id: 'medicine', label: '服薬', emoji: '💊' },
    { id: 'prevent', label: 'ノミ・ダニ・フィラリア予防', emoji: '🛡️' },
    { id: 'checkup', label: '健康診断・通院', emoji: '🏥' },
    { id: 'care', label: 'トリミング・爪切り', emoji: '✂️' },
    { id: 'other', label: 'その他', emoji: '📌' }
  ];
  var REPEATS = [
    { id: 'none', label: 'くり返さない' },
    { id: 'daily', label: '毎日' },
    { id: 'weekly', label: '毎週' },
    { id: 'monthly', label: '毎月' },
    { id: 'yearly', label: '毎年' }
  ];
  var SHARE_RANGES = [
    { id: '0', label: '含めない' },
    { id: '1', label: '直近24時間' },
    { id: '3', label: '直近3日間' },
    { id: '7', label: '直近7日間' },
    { id: '30', label: '直近30日間' }
  ];
  var SHARE_EXPIRY = [
    { id: '1', label: '24時間' },
    { id: '3', label: '3日間' },
    { id: '7', label: '7日間' }
  ];

  /* 無料プランの広告（ADR-012）。提携が決まるまで空。1件の形：
     { title, text, url: 'https://…', sponsor, slots: ['home', 'logs'] }
     緊急時・問診・病院に渡す要点・ごはんチェックとAIの結果には表示されない */
  var ADS = [];

  return {
    ADS: ADS, DAILY: DAILY, DOG_CAT: DOG_CAT, NUTRITION: NUTRITION, QUICK: QUICK, REMINDER_TYPES: REMINDER_TYPES, REPEATS: REPEATS, SHARE_RANGES: SHARE_RANGES, SHARE_EXPIRY: SHARE_EXPIRY,
    SPECIES: SPECIES, BREEDS: BREEDS, SEXES: SEXES, CATEGORIES: CATEGORIES,
    DANGER_SIGNS: DANGER_SIGNS, SYMPTOMS: SYMPTOMS, ONSET: ONSET, FREQUENCY: FREQUENCY,
    APPETITE: APPETITE, WATER: WATER, ENERGY: ENERGY, BREATHING: BREATHING,
    DANGER_ANSWERS: DANGER_ANSWERS, DANGER_SYMPTOMS: DANGER_SYMPTOMS, CAUTION_SYMPTOMS: CAUTION_SYMPTOMS
  };
})();
