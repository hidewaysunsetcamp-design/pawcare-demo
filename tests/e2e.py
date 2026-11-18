"""PAWCARE E2Eテスト（Playwright + Chrome、スマホ画面を再現）

使い方:
  python3 -m http.server 8765 &        # リポジトリ直下で起動
  python3 tests/e2e.py [URL]           # 既定: http://localhost:8765/
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
SHOT = os.environ.get('SHOT_DIR', '/tmp/pawcare-shots')
os.makedirs(SHOT, exist_ok=True)
results = []


def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail and not cond else ''))


def run(device_name):
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        dev = dict(p.devices[device_name]); dev.pop('default_browser_type', None)
        ctx = browser.new_context(**dev, accept_downloads=True, locale='ja-JP', timezone_id='Asia/Tokyo')
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('dialog', lambda d: d.accept())
        tag = device_name.split()[0]

        page.goto(URL)
        page.wait_for_selector('.bottom-nav')
        body = page.inner_text('body')
        check(f'[{tag}] アプリ画面が表示される（コード文字列ではない）', 'PAWCARE' in body and '<!DOCTYPE' not in body and '!doctype' not in body.lower())
        check(f'[{tag}] 初回はようこそ画面', 'ようこそ' in body)
        page.screenshot(path=f'{SHOT}/{tag}-01-welcome.png', full_page=True)

        # ペット登録（品種選択 + その他自由入力）
        page.click('text=＋ ペットを登録する')
        page.fill('input[name=name]', 'ポチ')
        page.select_option('select[name=species]', 'dog')
        page.select_option('select[name=breedSelect]', '柴犬')
        page.fill('input[name=birthday]', '2020-05-01')
        page.select_option('select[name=sex]', 'male')
        page.fill('input[name=weight]', '9.2')
        page.screenshot(path=f'{SHOT}/{tag}-02-pet-form.png')
        page.click('form[data-form=pet] button[type=submit]')
        page.wait_for_selector('.pet-hero')
        check(f'[{tag}] ペット登録→ホームに表示', 'ポチ' in page.inner_text('.pet-hero'))

        # 2頭目：猫・品種「その他」
        page.click('[data-nav=pets]')
        page.click('text=＋ 追加')
        page.fill('input[name=name]', 'タマ')
        page.select_option('select[name=species]', 'cat')
        opts = page.eval_on_selector_all('select[name=breedSelect] option', 'o => o.map(x => x.value)')
        check(f'[{tag}] 猫の品種リストにミックス・不明・その他', all(x in opts for x in ['ミックス', '不明', 'その他']) and 'スコティッシュ・フォールド' in opts)
        page.select_option('select[name=breedSelect]', 'その他')
        page.fill('input[name=breedOther]', 'ラパーマ')
        page.click('form[data-form=pet] button[type=submit]')
        page.wait_for_timeout(200)
        check(f'[{tag}] 品種の自由入力が保存される', 'ラパーマ' in page.inner_text('#app'))

        # 編集
        page.click('.pet-card:has-text("タマ") >> text=編集')
        page.fill('input[name=weight]', '4.5')
        page.click('form[data-form=pet] button[type=submit]')
        page.wait_for_timeout(200)
        check(f'[{tag}] ペット編集', '4.5 kg' in page.inner_text('.pet-card:has-text("タマ")'))

        # ホームでポチに切替 → ワンタップ記録
        page.click('[data-nav=home]')
        page.click('.chip:has-text("ポチ")')
        page.click('.quick-btn[data-cat=food]')
        page.wait_for_selector('#toast:not([hidden])')
        check(f'[{tag}] ワンタップ記録', 'ごはん' in page.inner_text('.card:has-text("今日の記録")'))
        page.click('.quick-btn[data-cat=vomit]')
        page.click('#toast button:has-text("取消")')
        page.wait_for_timeout(200)
        check(f'[{tag}] 記録の取り消し', '嘔吐' not in page.inner_text('.card:has-text("今日の記録")'))
        page.click('.quick-btn[data-cat=walk]')
        page.screenshot(path=f'{SHOT}/{tag}-03-home.png', full_page=True)

        # 日時を指定して記録
        page.click('text=日時・メモを入力して記録')
        page.click('.cat-opt:has-text("吐き戻し")')
        page.fill('input[name=datetime]', '2026-11-17T09:15')
        page.fill('textarea[name=memo]', '少量の未消化フード')
        page.click('form[data-form=log] button[type=submit]')
        page.wait_for_timeout(200)

        # 体重記録 → プロフィール反映
        page.click('.quick-btn[data-cat=weight]')
        page.fill('input[name=value]', '9.4')
        page.click('form[data-form=log] button[type=submit]')
        page.wait_for_timeout(200)
        check(f'[{tag}] 体重記録がプロフィールに反映', '9.4kg' in page.inner_text('.pet-hero'))

        # 記録一覧・絞り込み・編集・削除
        page.click('[data-nav=logs]')
        page.wait_for_selector('.log-list')
        check(f'[{tag}] 時系列一覧に過去日の記録', '吐き戻し' in page.inner_text('#app') and '11月17日' in page.inner_text('#app'))
        page.fill('input[data-filter=date]', '2026-11-17')
        page.dispatch_event('input[data-filter=date]', 'change')
        page.wait_for_timeout(200)
        txt = ' '.join(page.locator('.log-list').all_inner_texts())
        check(f'[{tag}] 日付で絞り込み', '吐き戻し' in txt and '散歩' not in txt)
        page.click('text=絞り込みを解除')
        page.select_option('select[data-filter=category]', 'walk')
        page.wait_for_timeout(200)
        check(f'[{tag}] カテゴリで絞り込み', '散歩' in page.inner_text('.log-list') and 'ごはん' not in page.inner_text('.log-list'))
        page.click('text=絞り込みを解除')
        page.click('.log-item:has-text("吐き戻し")')
        page.fill('textarea[name=memo]', '編集済みメモ')
        page.click('form[data-form=log] button[type=submit]')
        page.wait_for_timeout(200)
        check(f'[{tag}] 記録の編集', '編集済みメモ' in page.inner_text('#app'))
        page.screenshot(path=f'{SHOT}/{tag}-04-logs.png', full_page=True)
        with page.expect_download() as dl:
            page.click('text=表示中の記録をCSVで書き出す')
        csv = open(dl.value.path(), encoding='utf-8-sig').read()
        check(f'[{tag}] CSV書き出し', csv.startswith('日時,ペット,カテゴリ') and '編集済みメモ' in csv)
        page.click('.log-item:has-text("散歩")')
        page.click('text=この記録を削除')
        page.wait_for_timeout(200)
        check(f'[{tag}] 記録の削除', '散歩' not in ' '.join(page.locator('.log-list').all_inner_texts()))

        # 問診フロー
        page.click('[data-nav=interview]')
        page.wait_for_timeout(200)
        check(f'[{tag}] 問診の最初に危険な兆候を案内', 'けいれん' in page.inner_text('#app') and '診断' in page.inner_text('#app'))
        page.click('text=当てはまらない → 問診を始める')
        page.click('.choice:has-text("ポチ")')
        page.click('text=次へ')
        page.click('text=次へ')
        check(f'[{tag}] 症状未入力では進めない', 'どんな症状' in page.inner_text('#app'))
        page.click('.chip:has-text("嘔吐")')
        page.click('.chip:has-text("元気がない")')
        page.fill('textarea[data-iv=symptomOther]', '黄色い泡を吐いた')
        page.click('text=次へ')
        page.click('.choice:has-text("今日")')
        page.click('text=次へ')
        page.click('.choice:has-text("2〜3回")')
        page.click('text=次へ')
        page.click('.choice:has-text("ほとんど食べない")')
        page.click('.choice:has-text("少ない")')
        page.click('text=次へ')
        page.click('.choice:has-text("少し元気がない")')
        page.click('text=次へ')
        page.click('.choice:has-text("口を開けて苦しそうに呼吸する")')
        check(f'[{tag}] 危険な回答で病院連絡を案内', '今すぐ動物病院へ連絡' in page.inner_text('#app'))
        page.screenshot(path=f'{SHOT}/{tag}-05-interview-danger.png', full_page=True)
        page.click('text=次へ')
        page.fill('textarea[data-iv=notes]', '昨日新しいおやつ')
        page.click('text=メモを作成')
        memo = page.inner_text('#memoText')
        check(f'[{tag}] 問診メモ生成', all(x in memo for x in ['ポチ', '嘔吐、元気がない', '黄色い泡', '今日', '2〜3回', '昨日新しいおやつ', '診断ではありません']), memo[:200])
        check(f'[{tag}] メモに直近24時間の記録', 'ごはん' in memo)
        check(f'[{tag}] 「AI診断」等の表現がない', 'AI' not in page.inner_text('body') and '緊急度：' not in memo)
        page.click('text=この端末に保存')
        page.wait_for_timeout(200)
        check(f'[{tag}] 問診メモ保存', '保存済み' in page.inner_text('#app'))
        page.screenshot(path=f'{SHOT}/{tag}-06-memo.png', full_page=True)

        # 緊急時画面
        page.click('.header-emergency')
        txt = page.inner_text('#app')
        check(f'[{tag}] 緊急時案内の構成', all(x in txt for x in ['大量の出血', 'かかりつけ', '近くの動物病院', '電話で伝えること', '最新の問診メモ', '直近24時間']))
        check(f'[{tag}] 地図検索リンク', page.locator('a[href*="google.com/maps/search"]').count() == 2)
        page.click('text=かかりつけ病院を登録する')
        page.fill('input[name=name]', 'さくら動物病院')
        page.fill('input[name=phone]', '03-1234-5678')
        page.click('form[data-form=hospital] button[type=submit]')
        page.wait_for_timeout(200)
        check(f'[{tag}] 病院電話ボタン', page.locator('a[href="tel:0312345678"]').count() >= 1)
        page.screenshot(path=f'{SHOT}/{tag}-07-emergency.png', full_page=True)

        # リロードしても残る
        page.reload()
        page.wait_for_selector('.bottom-nav')
        db = page.evaluate('JSON.parse(localStorage.getItem("pawcare.v1"))')
        check(f'[{tag}] リロード後もデータ保持', len(db['pets']) == 2 and len(db['logs']) >= 3 and len(db['memos']) == 1)

        # バックアップ書き出し → 全削除 → 復元
        page.click('[data-nav=settings]')
        check(f'[{tag}] 端末間で同期されない旨の表示', '自動で同期されません' in page.inner_text('#app'))
        with page.expect_download() as dl:
            page.click('text=バックアップを書き出す（JSON）')
        backup_path = dl.value.path()
        backup = json.load(open(backup_path, encoding='utf-8'))
        check(f'[{tag}] JSONバックアップ', backup['app'] == 'PAWCARE' and len(backup['data']['pets']) == 2)
        page.screenshot(path=f'{SHOT}/{tag}-08-settings.png', full_page=True)
        page.click('text=すべてのデータを削除')
        page.wait_for_timeout(200)
        check(f'[{tag}] 全データ削除', 'ようこそ' in page.inner_text('#app'))
        page.click('[data-nav=settings]')
        page.set_input_files('input[data-action-change=importJson]', backup_path)
        page.wait_for_timeout(400)
        check(f'[{tag}] バックアップから復元', 'ポチ' in page.inner_text('#app'))

        # 保存失敗時のエラー処理
        page.evaluate("""() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function(){ const e = new Error('quota'); e.name='QuotaExceededError'; throw e; }; window.__restore = () => { Storage.prototype.setItem = orig; }; }""")
        before = len(page.evaluate('window.__PAWCARE__.getDb().logs'))
        page.click('.quick-btn[data-cat=water]')
        page.wait_for_timeout(200)
        after = len(page.evaluate('window.__PAWCARE__.getDb().logs'))
        check(f'[{tag}] 保存失敗時にエラー表示しデータを戻す', (not page.locator('#storageBanner').is_hidden()) and '容量' in page.inner_text('#storageBanner') and before == after)
        page.evaluate('window.__restore()')

        # ペット削除（記録も削除）
        page.click('[data-nav=pets]')
        page.click('.pet-card:has-text("タマ") >> text=削除')
        page.wait_for_timeout(200)
        check(f'[{tag}] ペット削除', 'タマ' not in page.inner_text('#app'))

        # 横はみ出しチェック
        for v in ['home', 'logs', 'interview', 'pets', 'emergency', 'settings']:
            page.evaluate(f'location.hash = "#/{v}"')
            page.wait_for_timeout(150)
            overflow = page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            check(f'[{tag}] {v} 画面で横はみ出しなし', overflow <= 0, f'{overflow}px')

        # XSS対策
        page.click('[data-nav=pets]')
        page.click('text=＋ 追加')
        page.fill('input[name=name]', '<img src=x onerror=alert(1)>')
        page.click('form[data-form=pet] button[type=submit]')
        page.wait_for_timeout(200)
        check(f'[{tag}] 入力値はHTMLとして解釈されない', page.locator('#app img[src=x]').count() == 0)

        check(f'[{tag}] JavaScriptエラーなし', not errors, '; '.join(errors[:5]))
        browser.close()


for d in ['iPhone 13', 'Pixel 7']:
    run(d)

fails = [r for r in results if not r[1]]
print(f'\n合計 {len(results)} 件 / 成功 {len(results) - len(fails)} / 失敗 {len(fails)}')
sys.exit(1 if fails else 0)
