# PAWCARE（デモ版）作業メモ

静的HTML + CSS + JavaScript のPWA。ビルドなし・サーバーなし・データは端末の localStorage（キー `pawcare.v1`）。GitHub Pages（`main` のルート）で公開。

## どこに何があるか（まずここを見て、必要なファイルだけ開く）

`js/app/` はもともと1つだった `app.js` を区切りごとに分けたもの。**モジュールではなく普通の `<script>`** で、`index.html` に書いた順に読み込まれ、トップレベルの関数・変数はファイルをまたいで共有される。

| ファイル | 中身 |
|---|---|
| `js/app/00-core.js` | 共通：`esc`・日付の整形・保存（`db`・`loadDb`・`persist`・`commit`）・シート/トースト・ルーティング（`render`・`go`・画面名→描画関数の表） |
| `js/app/01-home.js` | ホーム（アバター・もしもの準備・危険の案内） |
| `js/app/02-logs.js` | 健康記録（一覧・フォーム・CSV書き出し） |
| `js/app/03-pets.js` | ペット登録・編集 |
| `js/app/04-interview.js` | 症状問診 → 問診メモ（`buildMemo`・電話で伝える文） |
| `js/app/05-emergency.js` | 緊急時の案内 |
| `js/app/06-settings.js` | 設定・JSONバックアップ/復元・サンプルデータ |
| `js/app/07-reminders.js` | 予定・リマインダー・.ics／Googleカレンダー |
| `js/app/08-share.js` | 病院への共有リンク・QR・受診用サマリー（`#/view/...`） |
| `js/app/09-nutrition.js` | ごはんチェック・危険な食べ物 |
| `js/app/10-quickstats.js` | 「今日2回・最後40分前」の表記 |
| `js/app/11-card.js` | もしもカード（`#/card/...`） |
| `js/app/12-ingest.js` | 誤食メモ |
| `js/app/13-visits.js` | 受診の記録・処方からの服薬予定 |
| `js/app/14-handoff.js` | 家族への引き継ぎ・取り込み（`#/import/...`） |
| `js/app/15-book.js` | 健康手帳 |
| `js/app/16-game.js` | がんばり（EXP・レベル・勲章） |
| `js/app/17-plans.js` | 料金プラン・広告枠・飼い方ガイド画面・アバター画面 |
| `js/app/18-main.js` | **イベント処理（`actions` = `data-action` の対応表）と起動処理**。必ず最後に読み込む |
| `js/data.js` | 選択肢などの定数（`window.PAWCARE_DATA`） |
| `js/care.js` | 飼い方のめやす（`window.PAWCARE_CARE`） |
| `js/avatar.js` | アバターSVG（`window.PAWCARE_AVATAR`） |
| `css/style.css` | すべてのスタイル |

## js/app/ を触るときの決まり

- ボタンは `data-action="名前"` を付け、処理は `18-main.js` の `actions` に足す。画面を足すときは `00-core.js` の `VIEWS` と `render()` の表にも足す。
- **読み込み時にすぐ実行されるコード**（`const X = 関数()` や `addEventListener(..., 関数名)` など）は、それより前のファイルにある名前しか使えない。関数の中から呼ぶだけなら、どのファイルの関数でもよい。
- トップレベルの名前は全ファイル共通。同じ名前を `const`/`let` で2回宣言すると、アプリ全体が起動しなくなる。新しい名前を作る前に `grep` で確認する。
- `js/app/` にファイルを足したら、`index.html` の `<script>` と `sw.js` の `ASSETS` の両方に追加し、`sw.js` の `CACHE` のバージョンを上げる。
- 入力値は必ず `esc()` を通して HTML に入れる。

## 守ること（詳しくは docs/DECISIONS.md）

- 病名・治療・緊急度の判定は出さない（獣医師法17条、ADR-006/007）。
- サーバーやログインは使わない（ADR-001〜005）。共有はURLの `#` 以降にデータを入れる。

## 読まなくてよいもの

- `docs/concept/`・`docs/research/`・`docs/ai/` は構想と調査の文書。実装の作業では、頼まれたときだけ読む。構想の最新版は `docs/concept/2026-11-18-concept-v3.md`。
- `js/vendor/qrcode.js` は外部ライブラリ。変更しない。

## 確認のしかた

- `bash tests/verify.sh`：公開前の静的チェック（JSの構文・HTMLの破損）。push前に必ず実行する。
- `python3 -m http.server 8765` で起動し、`http://localhost:8765/#/demo` を開くとサンプルデータ入りで確認できる。
- `tests/e2e.py`：Playwright のE2Eテスト（README参照）。
