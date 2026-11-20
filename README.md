# ことぽすと（デモ版）

**うちの子の“いつも”を、先生へ。** 呼び名は「ことぽ」。開発中の呼び名は PAWCARE（リポジトリ名・ファイル形式などに残っています）。

ペットの毎日の健康記録と、体調不良・緊急時に動物病院へ伝える問診メモを整理するWebアプリです。

- 公開URL: https://kotopost.jp/ （旧: https://hidewaysunsetcamp-design.github.io/pawcare-demo/ から自動で転送）
- 対応: iPhone Safari / Android Chrome（PCブラウザでも動作）
- 構成: 静的HTML + CSS + JavaScript（ビルド不要・サーバーなし）。外部ライブラリはQRコード生成のみ同梱（`js/vendor/qrcode.js`、下記「サードパーティライセンス」）
- 利用者向けガイド: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)／設計判断の記録: [docs/DECISIONS.md](docs/DECISIONS.md)

> 本アプリは病気の診断・緊急度の判定を行いません。表示する危険な兆候は「問診を待たず動物病院へ連絡する目安」です。

## 実装済み機能

| 区分 | 内容 |
|---|---|
| ペット管理 | 複数登録・編集・削除／種類（犬・猫・うさぎ・ハムスター・鳥・その他）／品種の選択式（ミックス・不明・その他＋自由入力）／生年月日（年齢自動計算）・性別・体重・補足メモ |
| 健康記録 | 10カテゴリのワンタップ記録（現在時刻を自動入力・取り消し可）／日時の手動修正・メモ／編集・削除／時系列表示／日付・カテゴリ・ペットで絞り込み／CSV書き出し／体重記録はプロフィールへ自動反映 |
| 症状問診 | 最初に危険な兆候を提示 → 8ステップ（ペット・症状・発症時期・頻度・食欲/飲水・元気/意識・呼吸・補足）→ 獣医師向け問診メモ生成（直近24時間の記録を添付可）／コピー・共有・端末内保存／危険な回答があると病院連絡を案内 |
| 予定・リマインダー（v1.1.0） | 種類（ワクチン／服薬／ノミ・ダニ・フィラリア予防／健康診断・通院／トリミング・爪切り／その他）・日時・くり返し（なし／毎日／毎週／毎月／毎年）・メモ／「完了」で次回の日時へ自動で進む（くり返しなしは完了済みへ）／服薬の予定を完了すると健康記録に「服薬」を自動追加／期限切れ・今日のバッジ／ホームに予定カード（直近3件）／一覧画面 `#/reminders`（ホームの予定カード・設定画面から開く） |
| カレンダー登録（v1.1.0） | 予定ごとに .ics を生成（iPhoneは `data:` URLで開き「カレンダーに追加」画面へ、その他は .ics をダウンロード）／予定時刻に通知（VALARM）、ワクチン・健康診断は前日にも通知／くり返しは RRULE で登録／Googleカレンダーの予定作成リンク。**通知はスマホのカレンダーから届く**（アプリ自体はプッシュ通知を送らない） |
| 病院への共有（v1.1.0） | 緊急時画面・問診メモ作成後から共有シートを開く／ペット・最新の問診メモを含めるか・健康記録の期間（含めない／24時間／3日／7日／30日）・有効期間の目安（24時間／3日／7日）を選択 → 共有リンクとQRコード（URLが1800文字以下のときのみ）を生成／コピー・LINE等で送信／病院側は `#/view/...` で「受診用サマリー」を閲覧専用で表示・印刷可。データはURLの `#` 以降（gzip＋base64url）に入り、サーバーには送信・保存されない |
| 緊急時の案内 | 危険な兆候の一覧／かかりつけ病院へ電話（tel:リンク）／Googleマップで近隣・夜間救急の病院検索／電話で伝えること／最新の問診メモ／直近24時間の記録 |
| データ | localStorage保存（リロード後も保持。予定も保存・バックアップ対象）／JSONバックアップ・復元／保存失敗時（容量不足・プライベートモード）のエラー表示と変更の巻き戻し／破損データの退避／「端末間で同期されない」旨をUIに明示 |
| その他 | PWA（ホーム画面追加・オフライン表示）／LINE等で共有した際のOGP画像／XSS対策（入力値は必ずエスケープ） |

## 未実装（将来構想）

- **クラウド同期・ログイン**: 2026-11-18 にオーナー判断で見送り（[docs/DECISIONS.md](docs/DECISIONS.md) ADR-003）。v1.1.0 はログインなし・端末内保存のまま
- 家族共有、病院向け管理画面（受付システム連携）、アプリ自体からのプッシュ通知、AI問診補助、写真添付、体重グラフ、有料プラン

※ v1.0 で未実装だった「リマインダー」と「動物病院との情報共有」は、v1.1.0 で**サーバーを使わない形**（カレンダー登録／URLに情報を入れた共有リンク）で実装済みです。

## フォルダ構成

```
index.html            画面の骨組み（ヘッダー・下部ナビ・モーダル）
css/style.css         スタイル（スマホ最優先）
js/data.js            選択肢データ（品種・記録カテゴリ・危険な兆候・問診・予定の種類/くり返し・共有の期間/有効期間）
js/app.js             アプリ本体（保存・画面描画・操作・予定・カレンダー登録・共有リンク）
js/vendor/qrcode.js   QRコード生成ライブラリ（Kazuhiko Arase, MITライセンス）
sw.js                 Service Worker（ネットワーク優先＋オフライン用キャッシュ）
manifest.webmanifest  PWA設定
icons/                アイコン・OGP画像
tests/verify.sh       公開前の静的チェック（破損検出・JS構文・HTMLタグ対応）
tests/html_check.py   HTMLタグ対応チェック
tests/e2e.py          ブラウザE2Eテスト（iPhone 13 / Pixel 7 の画面を再現）
docs/USER_GUIDE.md    飼い主・動物病院スタッフ向けの使い方
docs/DECISIONS.md     設計判断の記録（ADR）
```

## 開発環境の起動

```bash
python3 -m http.server 8765
# ブラウザで http://localhost:8765/ を開く
```

## テスト

```bash
bash tests/verify.sh                 # 静的チェック（必ずpush前に実行）
pip install playwright && playwright install chromium   # 初回のみ
python3 -m http.server 8765 &
CHROME=$(which google-chrome) python3 tests/e2e.py
python3 tests/e2e.py https://hidewaysunsetcamp-design.github.io/pawcare-demo/   # 公開版に対して実行
```

## デプロイ

GitHub Pages（`main` ブランチのルート）で公開しています。`main` にpushすると1〜数分で反映されます。

1. `bash tests/verify.sh` と E2E テストが通ることを確認
2. `git push origin main`
3. 公開URLを開き、実際に配信されているファイルを確認（`curl -s <URL>index.html | head -c 15` が `<!DOCTYPE html>` であること）

Service Worker を更新したときは `sw.js` の `CACHE` 名のバージョンを上げてください。

## データ保存

- キー `pawcare.v1` に JSON で保存（`pets` / `logs` / `memos` / `reminders` / `settings`）
- `reminders` の各要素: `id` / `petId` / `type` / `title` / `dueAt` / `repeat` / `memo` / `done` / `lastDoneAt` / `createdAt` / `updatedAt`。ペットを削除すると、そのペットの予定も削除
- 共有リンクのデータは端末に保存せず、URLの `#/view/` 以降にだけ入る（先頭 `z` = gzip圧縮、`j` = 非圧縮JSON。どちらも base64url）
- 日時は端末ローカル時刻の `YYYY-MM-DDTHH:mm` 文字列
- 保存はすべて `commit()` 経由。失敗したら変更前の状態に戻してエラー表示

## 既知の制限

- データは端末・ブラウザごとに別。**iPhoneではSafariで開いた場合とホーム画面に追加したアプリで保存先が別**（片方で入力した記録・予定はもう片方に出ない）。ブラウザのデータ消去で消える（バックアップ推奨）
- **プッシュ通知はない**: サーバーがないため、アプリからは通知を送れません。通知はスマホのカレンダーに登録した予定から届きます。カレンダーに登録しなかった予定は、アプリを開いたときに表示されるだけです
- **カレンダーとは同期しない**: 予定を編集・完了・削除しても、登録済みのカレンダーの予定は変わりません（カレンダー側で手動で直す必要がある。再登録すると重複することがある）
- **共有リンクは取り消せない**: データはリンク自体に入っているため、送ったリンクを無効にする手段はありません。有効期限は閲覧側の画面で判定する表示上の目安で、端末の時計を変えたりURLを解読したりすれば内容は読めます。病院以外に送らないよう画面で注意しています
- **共有リンクの長さ**: 記録の期間を長くするとURLが長くなり、1800文字を超えるとQRコードは作りません（リンクのみ）。記録は最大120件・メモは各200文字までに切り詰め。メールやチャットによっては長いURLが途中で切れることがある
- 共有リンクの圧縮には CompressionStream を使用（iOS Safari 16.4以降・最近のChrome）。未対応のブラウザでは非圧縮（`j` 形式）になりURLが長くなる。圧縮リンクは DecompressionStream 未対応の古いブラウザでは表示できない
- iOS Safariは長期間未使用のサイトデータを削除することがある
- 病院の診療時間・受け入れ可否は取得していない（地図アプリの検索結果に依存）
- 実機（iPhone/Android）での確認はブラウザのエミュレーションで代替しています。実機での最終確認が必要です

## 将来のクラウド化の提案

> 2026-11-18 時点でクラウド同期は見送り（ADR-003）。以下は再検討するときのメモです。

1. **Supabase（無料枠）** または **Firebase** で認証（メール/LINEログイン）＋DB を導入。`pets`/`logs`/`memos` をそのままテーブル化できる構造にしてあります
2. 端末内データは JSON バックアップ形式でクラウドへ初回移行
3. 家族共有は「世帯（household）」単位のアクセス権で実装
4. 問診メモの病院送信は、病院側の受付画面（SaaS）とセットで設計。医療情報の扱いについて法務・獣医師の監修を受ける
5. 機能が増えた段階で Vite + TypeScript へ移行（現在のモジュール分割のまま移せます）

## サードパーティライセンス

`js/vendor/qrcode.js` は QRCode for JavaScript（Copyright (c) 2009 Kazuhiko Arase）を、npmパッケージ qrcode-terminal 0.12.0 の `vendor/QRCode` 同梱版からブラウザ用にまとめたものです。MITライセンスで提供されています（http://www.d-project.com/）。

```
The MIT License

Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

「QRコード」は株式会社デンソーウェーブの登録商標です。

## 障害記録（2026年11月）と再発防止

| 起きたこと | 原因 | 対策 |
|---|---|---|
| index.html が `!doctype html>`（15文字）だけになり、アプリが表示されない | ブラウザ自動操作ツールでGitHubのWebエディタに貼り付けた際に内容が欠落 | Gitで直接コミット・pushする。`tests/verify.sh` で先頭が `<!DOCTYPE html>` か、`</html>` で終わるかを検査 |
| `<` が欠けてコードが文字列として表示 | 同上（エディタ入力時の文字落ち） | 同上 |
| `<` が `&lt;` にエスケープされた（コミット 1f8e9f2） | テキストをHTMLとして扱う経路で変換された | verify.sh でエスケープ済みタグを検出 |
| ツールの「成功」報告と実ファイルが不一致 | 保存結果を確認していなかった | push後に公開URLの実ファイルを取得して検証する |

旧版はGitの履歴に残っています（例: `git show 1f8e9f2:index.html`）。旧版の問診は独自ロジックで緊急度を判定しており医療安全条件に合わないため、流用せず再構築しました。
