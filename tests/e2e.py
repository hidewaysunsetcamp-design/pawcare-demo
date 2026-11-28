"""PAWCARE E2Eテスト（Playwright + Chrome、スマホ画面を再現）

使い方:
  python3 -m http.server 8765 &        # リポジトリ直下で起動
  python3 tests/e2e.py [URL]           # 既定: http://localhost:8765/
"""
import json
import re
import os
import sys
from playwright.sync_api import sync_playwright
from playwright.sync_api import Browser

# 起動画面（v1.18）は1回の起動につき1度だけ。ふつうのテストでは出ないようにしておき、専用のテストで確かめる
_orig_new_context = Browser.new_context
def _ctx_without_splash(self, *a, **k):
    c = _orig_new_context(self, *a, **k)
    c.add_init_script("try { sessionStorage.setItem('kp.splash', '1'); } catch (e) {}")
    return c
Browser.new_context = _ctx_without_splash

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
SHOT = os.environ.get('SHOT_DIR', '/tmp/pawcare-shots')
os.makedirs(SHOT, exist_ok=True)
results = []


def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail and not cond else ''))


def nav(page, view, selector=None):
    """ナビゲーション後の描画完了を待つ。

    画面遷移は location.hash の変更 → hashchange イベント（非同期）で描画されるため、
    クリック直後に inner_text を読むと前の画面の内容を読むことがある（過去の不安定なFAILの原因）。
    render() は body[data-view] の設定と #app の書き換えを同期的に行うので、data-view を待てばよい。
    """
    page.click(selector or f'[data-nav={view}] >> nth=0')
    page.wait_for_function('v => document.body.dataset.view === v', arg=view)


def wait_rendered(page):
    """起動直後の初回描画を待つ（.bottom-nav は静的HTMLなので描画完了の目印にならない）"""
    page.wait_for_function('() => !!document.body.dataset.view && !document.querySelector("#app > .loading")')


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
        wait_rendered(page)
        body = page.inner_text('body')
        check(f'[{tag}] アプリ画面が表示される（コード文字列ではない）', 'ことぽすと' in body and '<!DOCTYPE' not in body and '!doctype' not in body.lower())
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
        page.wait_for_selector('.stage')
        check(f'[{tag}] ペット登録→ホームに表示', 'ポチ' in page.inner_text('.stage'))

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
        check(f'[{tag}] 体重記録がプロフィールに反映', '9.4kg' in page.inner_text('.stage'))

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
        nav(page, 'interview')
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
        page.click('.choice:has-text("安静時も苦しそうに呼吸する")')
        check(f'[{tag}] 危険な回答で病院連絡を案内', '今すぐ動物病院へ連絡' in page.inner_text('#app'))
        check(f'[{tag}] 危険な回答の案内は緊急度を判定しない中立的な表現', '緊急度' not in page.inner_text('.alert.danger >> nth=0'))
        page.screenshot(path=f'{SHOT}/{tag}-05-interview-danger.png', full_page=True)
        page.click('text=次へ')
        page.fill('textarea[data-iv=notes]', '昨日新しいおやつ')
        page.click('text=メモを作成')
        page.wait_for_selector('#memoText')
        check(f'[{tag}] 問診結果画面の危険案内文', '「すぐ動物病院へ連絡すべき様子」の一覧と同じ項目があります' in page.inner_text('#app'))
        memo = page.inner_text('#memoText')
        check(f'[{tag}] 問診メモ生成', all(x in memo for x in ['ポチ', '嘔吐、元気がない', '黄色い泡', '今日', '2〜3回', '昨日新しいおやつ', '診断ではありません']), memo[:200])
        check(f'[{tag}] メモに直近24時間の記録', 'ごはん' in memo)
        check(f'[{tag}] 「AI診断」等の表現がない', 'AI' not in page.inner_text('body') and '緊急度：' not in memo)
        page.click('text=この端末に保存')
        page.wait_for_selector('#app .ok-text')
        check(f'[{tag}] 問診メモ保存', '保存済み' in page.inner_text('#app'))
        page.screenshot(path=f'{SHOT}/{tag}-06-memo.png', full_page=True)

        # 緊急時画面
        nav(page, 'emergency', '.header-emergency')
        txt = page.inner_text('#app')
        need = ['大量の出血', 'かかりつけ', '近くの動物病院', '電話で伝えること', '最新の問診メモ', '直近24時間']
        check(f'[{tag}] 緊急時案内の構成', all(x in txt for x in need), '不足: ' + ','.join(x for x in need if x not in txt))
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
        wait_rendered(page)
        db = page.evaluate('JSON.parse(localStorage.getItem("pawcare.v1"))')
        check(f'[{tag}] リロード後もデータ保持', len(db['pets']) == 2 and len(db['logs']) >= 3 and len(db['memos']) == 1)

        # バックアップ書き出し → 全削除 → 復元
        nav(page, 'settings')
        txt = page.inner_text('#app')
        check(f'[{tag}] 端末間で同期されない旨の表示', '自動で同期されません' in txt, txt[:80])
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
            page.wait_for_function('v => document.body.dataset.view === v', arg=v)
            overflow = page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            check(f'[{tag}] {v} 画面で横はみ出しなし', overflow <= 0, f'{overflow}px')

        # XSS対策
        page.click('[data-nav=pets]')
        page.click('text=＋ 追加')
        page.fill('input[name=name]', '<img src=x onerror=alert(1)>')
        page.click('form[data-form=pet] button[type=submit]')
        page.wait_for_timeout(200)
        check(f'[{tag}] 入力値はHTMLとして解釈されない', page.locator('#app img[src=x]').count() == 0)

        # ---------- v1.2 犬・猫向けの見直し ----------
        page.evaluate('location.hash = "#/pets"')
        page.wait_for_timeout(150)
        page.click('text=＋ 追加')
        check(f'[{tag}] 種類は10種類をボタンで選べる', page.locator('.species-btn').count() == 10)
        page.click('.species-btn[data-value=cat]')
        opts = page.eval_on_selector_all('select[name=breedSelect] option', 'o => o.map(x => x.value)')
        check(f'[{tag}] 猫ボタンで品種リストが猫に切り替わる', 'スコティッシュ・フォールド' in opts and page.input_value('select[name=species]') == 'cat')
        page.fill('input[name=name]', 'ミケ')
        page.click('form[data-form=pet] button[type=submit]')
        page.wait_for_timeout(200)
        page.evaluate('location.hash = "#/home"')
        page.wait_for_timeout(150)
        if page.locator('.chip:has-text("ミケ")').count():
            page.click('.chip:has-text("ミケ")')
        cats = page.eval_on_selector_all('.quick-btn', 'b => b.map(x => x.dataset.cat)')
        check(f'[{tag}] 猫のワンタップ記録は猫向けの並び', cats[:3] == ['food', 'water', 'urine'] and 'walk' not in cats, str(cats))
        page.click('.quick-btn[data-cat=ingest]')
        page.wait_for_timeout(200)
        sheet = page.inner_text('#sheet') if not page.locator('#sheet').is_hidden() else ''
        check(f'[{tag}] 誤食の疑いを押すとすぐ病院へ連絡の案内', '今すぐ動物病院へ連絡' in sheet and '監修' not in sheet)
        page.click('#sheet [data-close-sheet] >> nth=1')
        page.evaluate('location.hash = "#/emergency"')
        page.wait_for_timeout(150)
        check(f'[{tag}] 危険な兆候の一覧に監修準備中の注記', '獣医師による監修を準備中' in page.inner_text('#app'))

        # ---------- v1.3 もしもの準備・夜間病院・読み上げメモ・要点 ----------
        page.evaluate('location.hash = "#/settings"')
        page.wait_for_timeout(150)
        page.click('[data-action=editHospital][data-kind=night]')
        page.fill('input[name=name]', '夜間救急センター')
        page.fill('input[name=phone]', '03-9999-0000')
        page.click('form[data-form=hospital] button[type=submit]')
        page.wait_for_timeout(200)
        page.evaluate('location.hash = "#/emergency"')
        page.wait_for_timeout(150)
        check(f'[{tag}] 緊急時に夜間病院の電話ボタン', page.locator('.call-first a[href="tel:0399990000"]').count() == 1)
        check(f'[{tag}] 緊急時に電話で読み上げるメモ', page.locator('.phone-script').count() == 1 and 'です。' in page.inner_text('.phone-script'))
        page.evaluate('location.hash = "#/home"')
        page.wait_for_timeout(150)
        prep = page.locator('.prep')
        check(f'[{tag}] ホームのもしもの準備（未完了項目のみボタン）', prep.count() == 0 or ('夜間' in prep.inner_text() and prep.locator('[data-kind=night]').count() == 0))
        # 構造化した問診つき共有 → 要点カード
        page.evaluate('location.hash = "#/interview"')
        page.wait_for_timeout(150)
        page.click('text=当てはまらない → 問診を始める')
        page.click('.choice >> nth=0')
        page.click('text=次へ')
        page.click('.chip:has-text("下痢")')
        page.click('text=次へ')
        page.click('.choice:has-text("昨日")')
        for _ in range(5):
            page.click('text=次へ')
        page.click('text=メモを作成')
        check(f'[{tag}] 問診結果に読み上げメモ', '下痢が昨日からあります' in page.inner_text('.phone-script'))
        page.click('text=病院への共有リンク・QRコードを作る')
        page.click('text=リンクとQRコードを作る')
        page.wait_for_timeout(500)
        url13 = page.input_value('.share-url')
        vctx13, vp13 = open_viewer(browser, dev, url13, errors, 'viewer13')
        kp = vp13.inner_text('.key-points') if vp13.locator('.key-points').count() else ''
        check(f'[{tag}] 受診用サマリーの1画面目に要点（症状・いつから）', '主な症状' in kp and '下痢' in kp and '昨日' in kp, kp[:200])
        vctx13.close()

        # ---------- v1.4 ごはんチェック ----------
        page.keyboard.press('Escape')
        page.wait_for_timeout(100)
        page.evaluate('location.hash = "#/home"')
        page.wait_for_timeout(150)
        page.click('.chip:has-text("ポチ")') if page.locator('.chip:has-text("ポチ")').count() else None
        page.click('[data-nav=nutrition]')
        page.wait_for_timeout(150)
        check(f'[{tag}] ごはんチェック画面', 'ごはんチェック' in page.inner_text('#app') and '診断や治療ではありません' in page.inner_text('#app'))
        page.click('text=＋ 追加')
        page.fill('input[name=name]', 'ドライフードA')
        page.select_option('select[name=type]', 'complete')
        page.fill('input[name=grams]', '150')
        page.fill('input[name=kcal]', '360')
        page.fill('input[name=protein]', '14')
        page.fill('input[name=fat]', '8')
        page.fill('input[name=moisture]', '10')
        page.click('form[data-form=food] button[type=submit]')
        page.wait_for_timeout(200)
        page.click('text=＋ 追加')
        page.fill('input[name=name]', 'ジャーキー')
        page.select_option('select[name=type]', 'treat')
        page.fill('input[name=grams]', '30')
        page.fill('input[name=kcal]', '350')
        page.click('form[data-form=food] button[type=submit]')
        page.wait_for_timeout(200)
        res = page.inner_text('.nu-findings')
        check(f'[{tag}] 目安カロリーとの比較', '目安' in res and 'kcal' in res, res[:200])
        check(f'[{tag}] おやつ10%超の注意', '10%まで' in res, res[:300])
        check(f'[{tag}] たんぱく質がAAFCO最低値未満で注意と食品タイプ提案', 'AAFCOの成犬・成猫向けの最低値（18%）を下回って' in res and page.locator('.nu-sugg li').count() >= 1)
        page.fill('#toxicInput', 'レーズンパン')
        page.click('[data-action=toxicCheck]')
        check(f'[{tag}] 危険な食材の判定', '今すぐ動物病院へ電話' in page.inner_text('#toxicResult'))
        page.fill('#toxicInput', 'りんご')
        page.click('[data-action=toxicCheck]')
        check(f'[{tag}] 当てはまらなくても「安全」とは言わない', '安全だという意味ではありません' in page.inner_text('#toxicResult'))
        page.check('input[data-nutri=restricted]')
        page.wait_for_timeout(200)
        check(f'[{tag}] 療法食・持病の子は対象外', '対象外' in page.inner_text('#app') and page.locator('.nu-findings').count() == 0)
        page.uncheck('input[data-nutri=restricted]')
        page.wait_for_timeout(150)
        overflow = page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
        check(f'[{tag}] ごはんチェック画面で横はみ出しなし', overflow <= 0, f'{overflow}px')

        # ---------- v1.5 分析の上位5件＋暮らし・食事のQR ----------
        page.keyboard.press('Escape')
        page.evaluate('location.hash = "#/home"')
        page.wait_for_timeout(150)
        if page.locator('.chip:has-text("ポチ")').count():
            page.click('.chip:has-text("ポチ")')
        page.click('.quick-btn[data-cat=vomit]')
        page.wait_for_timeout(150)
        qs = page.inner_text('.quick-btn[data-cat=vomit] .qs')
        check(f'[{tag}] #2 ボタンに今日の回数と最後の時刻', re.match(r'^\d+回・\d+分前$', qs) is not None, qs)
        page.keyboard.press('Escape')
        # #3 誤食メモ
        page.click('.quick-btn[data-cat=ingest]')
        page.wait_for_selector('form[data-form=ingest]')
        sheet = page.inner_text('#sheet')
        check(f'[{tag}] #3 電話ボタンが入力欄より上', sheet.index('緊急時の案内を開く') < sheet.index('電話の前に'))
        page.fill('form[data-form=ingest] input[name=what]', 'ぶどう')
        page.wait_for_timeout(100)
        check(f'[{tag}] #3 入力中に危険な食材の一覧と照合', 'ぶどう・レーズン' in page.inner_text('#ingestToxic') and '安全という意味ではありません' in page.inner_text('#ingestToxic'))
        page.click('form[data-form=ingest] .choice:has-text("半分くらい")')
        page.click('form[data-form=ingest] .choice:has-text("30分以内")')
        page.check('form[data-form=ingest] input[name=packageKept]')
        page.click('form[data-form=ingest] button[type=submit]')
        page.wait_for_timeout(200)
        ps = page.inner_text('#sheet .phone-script')
        check(f'[{tag}] #3 電話メモの先頭に誤食の内容', 'ぶどうを半分くらい食べた可能性があります。包装は手元にあります。' in ps, ps[:200])
        page.keyboard.press('Escape')
        # #1 もしもカード
        page.click('[data-nav=card] >> nth=0')
        page.wait_for_timeout(150)
        check(f'[{tag}] #1 もしもカードに未入力表示', '未入力' in page.inner_text('.moshimo'))
        page.click('[data-action=editCard]')
        page.fill('form[data-form=card] textarea[name=conditions]', '心臓の雑音を指摘')
        page.check('form[data-form=card] input[name=allergiesNone]')
        page.fill('form[data-form=card] input[name=med_name_0]', 'ピモベンダン')
        page.fill('form[data-form=card] input[name=med_how_0]', '1日2回')
        page.select_option('form[data-form=card] select[name=housing]', 'indoor')
        page.fill('form[data-form=card] input[name=cohabit]', 'なし')
        page.fill('form[data-form=card] input[name=ownerPhone]', '090-1111-2222')
        page.click('form[data-form=card] button[type=submit]')
        page.wait_for_timeout(200)
        mc = page.inner_text('.moshimo')
        check(f'[{tag}] #1 カードに持病・なし・薬・暮らし・連絡先', all(x in mc for x in ['心臓の雑音を指摘', 'なし', 'ピモベンダン', '室内のみ', '090-1111-2222']), mc[:300])
        page.click('[data-action=sendCard]')
        page.click('form[data-form=sendcard] button[type=submit]')
        page.wait_for_selector('#sheet input.share-url')
        card_url = page.input_value('#sheet input.share-url')
        cctx, cp = open_viewer(browser, dev, card_url, errors, 'cardview')
        check(f'[{tag}] #1 受け取った側でカード表示（ナビなし・電話リンク）', 'ピモベンダン' in cp.inner_text('#app') and cp.locator('.bottom-nav').is_hidden() and cp.locator('a[href="tel:09011112222"]').count() == 1)
        cp.click('[data-action=importCardPet]')
        cp.wait_for_timeout(200)
        check(f'[{tag}] #1 プロフィールを取り込める', 'ポチ' in cp.inner_text('#app'))
        cctx.close()
        page.keyboard.press('Escape')
        # #4 受診記録 → 服薬予定（終わりの日つき）
        page.evaluate('location.hash = "#/visits"')
        page.wait_for_timeout(150)
        page.click('[data-action=newVisit]')
        page.fill('form[data-form=visit] input[name=reason]', '嘔吐が続いた')
        page.fill('form[data-form=visit] textarea[name=vetSaid]', '整腸剤を5日分')
        page.fill('form[data-form=visit] input[name=vm_name_0]', '整腸剤')
        page.fill('form[data-form=visit] input[name=vm_how_0]', '朝晩')
        page.fill('form[data-form=visit] input[name=vm_days_0]', '5')
        page.click('form[data-form=visit] button[type=submit]')
        page.wait_for_selector('[data-action=medReminder]')
        page.click('[data-action=medReminder]')
        page.wait_for_selector('form[data-form=reminder]')
        endv = page.input_value('form[data-form=reminder] input[name=endAt]')
        import datetime as _dt
        exp_end = (_dt.date.today() + _dt.timedelta(days=4)).isoformat()
        check(f'[{tag}] #4 処方から服薬予定（終わりの日＝受診日＋日数−1、時刻は空欄）', endv == exp_end and page.input_value('form[data-form=reminder] input[name=dueAt]') == '' and page.input_value('form[data-form=reminder] select[name=type]') == 'medicine', endv)
        page.fill('form[data-form=reminder] input[name=dueAt]', _dt.date.today().isoformat() + 'T08:00')
        page.click('form[data-form=reminder] button[type=submit]')
        page.wait_for_timeout(200)
        page.keyboard.press('Escape')
        # 共有QR：暮らし・食べているもの・前回の受診・最初の症状
        page.evaluate('location.hash = "#/emergency"')
        page.wait_for_timeout(150)
        page.click('text=共有リンク・QRコードを作る')
        page.click('form[data-form=share] button[type=submit]')
        page.wait_for_selector('#sheet input.share-url')
        share_url = page.input_value('#sheet input.share-url')
        check(f'[{tag}] QRコードが作れる長さ', page.locator('#sheet svg.qr').count() == 1, str(len(share_url)))
        vctx15, vp15 = open_viewer(browser, dev, share_url, errors, 'viewer15')
        kp = vp15.inner_text('.key-points')
        check(f'[{tag}] QR要点に暮らし・前回の受診・最初の症状', all(x in kp for x in ['暮らし', '室内のみ', '前回の受診', '整腸剤', '最初の症状']), kp[:400])
        vctx15.close()
        page.keyboard.press('Escape')
        # #5 引き継ぎと取り込み
        page.evaluate('location.hash = "#/home"')
        page.wait_for_timeout(150)
        page.click('[data-action=handoff]')
        page.fill('form[data-form=handoff] textarea[name=note]', '夜もう一度吐いたら電話して')
        page.click('form[data-form=handoff] button[type=submit]')
        page.wait_for_selector('.handoff-text')
        ht = page.inner_text('.handoff-text')
        check(f'[{tag}] #5 引き継ぎ文（回数・最後・伝えたいこと・取り込みリンク）', all(x in ht for x in ['の引き継ぎ', '嘔吐', '最後', '夜もう一度吐いたら電話して', '#/import/']), ht[:300])
        imp_url = [w for w in ht.split() if '#/import/' in w][0].split('取り込みリンク：')[-1]
        ictx = browser.new_context(**dev, locale='ja-JP', timezone_id='Asia/Tokyo')
        ip = ictx.new_page(); ip.on('pageerror', lambda e: errors.append('import:' + str(e))); ip.on('dialog', lambda d: d.accept())
        ip.goto(imp_url); ip.wait_for_timeout(800)
        check(f'[{tag}] #5 取り込み画面', '家族からの引き継ぎ' in ip.inner_text('#app'))
        ip.click('[data-action=doImport][data-target=new]')
        ip.wait_for_timeout(300)
        n1 = ip.evaluate('JSON.parse(localStorage.getItem("pawcare.v1")).logs.length')
        ip.goto(imp_url); ip.wait_for_timeout(800)
        ip.click('[data-action=doImport] >> nth=0')
        ip.wait_for_timeout(300)
        n2 = ip.evaluate('JSON.parse(localStorage.getItem("pawcare.v1")).logs.length')
        check(f'[{tag}] #5 二重に取り込まない', n1 > 0 and n1 == n2, f'{n1} {n2}')
        ictx.close()
        for v in ['card', 'visits']:
            page.evaluate(f'location.hash = "#/{v}"')
            page.wait_for_timeout(150)
            ov = page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            check(f'[{tag}] {v} 画面で横はみ出しなし', ov <= 0, f'{ov}px')

        # ---------- v1.6 健康手帳 ----------
        page.keyboard.press('Escape')
        page.evaluate('location.hash = "#/book"')
        page.wait_for_timeout(200)
        bt = page.inner_text('#app')
        check(f'[{tag}] 健康手帳：表紙・もしもカード・受診・体重', all(x in bt for x in ['ことぽすと 健康手帳', 'もしもカード', '受診の記録', '体重の推移', 'ワクチン・予防・健康診断']), bt[:200])
        page.click('[data-action=newCare]')
        page.fill('form[data-form=care] input[name=title]', '混合ワクチン（過去分）')
        page.fill('form[data-form=care] input[name=date]', '2025-11-01')
        page.click('form[data-form=care] button[type=submit]')
        page.wait_for_timeout(200)
        check(f'[{tag}] 健康手帳：過去のワクチンを追加', '混合ワクチン（過去分）' in page.inner_text('#app') and '2025/11/01' in page.inner_text('#app'))
        with page.expect_download() as dlb:
            page.click('[data-action=exportBook]')
        book = json.load(open(dlb.value.path(), encoding='utf-8'))
        check(f'[{tag}] 健康手帳ファイル（このペットだけ）', book.get('kind') == 'book' and len(book['data']['pets']) == 1 and all(l['petId'] == book['data']['pets'][0]['id'] for l in book['data']['logs']))
        bctx = browser.new_context(**dev, locale='ja-JP', timezone_id='Asia/Tokyo', accept_downloads=True)
        bp = bctx.new_page(); bp.on('pageerror', lambda e: errors.append('book:' + str(e))); bp.on('dialog', lambda d: d.accept())
        bp.goto(URL); bp.wait_for_selector('.bottom-nav')
        bp.evaluate('location.hash = "#/settings"'); bp.wait_for_timeout(150)
        bp.set_input_files('input[data-action-change=importJson]', dlb.value.path()); bp.wait_for_timeout(400)
        n1 = bp.evaluate('JSON.parse(localStorage.getItem("pawcare.v1")).care.length')
        bp.evaluate('location.hash = "#/settings"'); bp.wait_for_timeout(150)
        bp.set_input_files('input[data-action-change=importJson]', dlb.value.path()); bp.wait_for_timeout(400)
        n2 = bp.evaluate('JSON.parse(localStorage.getItem("pawcare.v1")).care.length')
        check(f'[{tag}] 健康手帳を別の端末に取り込み（二重にならない）', n1 >= 1 and n1 == n2 and '健康手帳' in bp.inner_text('#app'), f'{n1} {n2}')
        bctx.close()
        page.evaluate('location.hash = "#/book"'); page.wait_for_timeout(150)
        ov = page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
        check(f'[{tag}] 健康手帳で横はみ出しなし', ov <= 0, f'{ov}px')

        # ---------- v1.7 EXP・レベル・勲章 ----------
        page.keyboard.press('Escape')
        page.evaluate('location.hash = "#/home"'); page.wait_for_timeout(200)
        gb = page.inner_text('.game-bar')
        check(f'[{tag}] ホームにレベル表示', 'Lv.' in gb, gb)
        page.click('.game-bar'); page.wait_for_timeout(200)
        gt = page.inner_text('#app')
        check(f'[{tag}] がんばり画面：勲章とEXPのもらい方', '勲章' in gt and 'EXPのもらい方' in gt and 'ペットの健康状態を評価するものではありません' in gt)
        exp1 = page.evaluate('(() => { const t = document.querySelector(".gh-lv").textContent; return t; })()')
        # 同じ日に記録を連打してもEXPが件数分は増えない
        before = page.evaluate('window.__PAWCARE__.getDb().logs.length')
        def total_exp():
            page.evaluate('location.hash = "#/game"'); page.wait_for_timeout(150)
            return re.search(r'合計 (\d+) EXP', page.inner_text('#app')).group(1)
        e_before = total_exp()
        page.evaluate('location.hash = "#/home"'); page.wait_for_timeout(150)
        for _ in range(5):
            page.click('.quick-btn[data-cat=water]'); page.wait_for_timeout(60)
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
        e_after = total_exp()
        check(f'[{tag}] 同じ日の連打ではEXPが増えすぎない', e_before == e_after, f'{e_before} -> {e_after}')
        # 新しい端末：最初の記録で勲章のお知らせ
        nctx = browser.new_context(**dev, locale='ja-JP', timezone_id='Asia/Tokyo')
        np_ = nctx.new_page(); np_.on('pageerror', lambda e: errors.append('game:' + str(e)))
        np_.goto(URL); np_.wait_for_selector('.bottom-nav')
        np_.click('text=＋ ペットを登録する'); np_.fill('input[name=name]', 'テン'); np_.click('form[data-form=pet] button[type=submit]'); np_.wait_for_timeout(300)
        np_.click('.quick-btn[data-cat=food]'); np_.wait_for_timeout(200)
        np_.click('#toast button:has-text("取消")') if False else None
        np_.wait_for_function('() => document.querySelector("#toast") && document.querySelector("#toast").textContent.includes("はじめの一歩")', timeout=12000)
        check(f'[{tag}] 最初の記録で勲章「はじめの一歩」のお知らせ', True)
        nctx.close()

        # ---------- デモ用リンク ----------
        dctx = browser.new_context(**dev, locale='ja-JP', timezone_id='Asia/Tokyo')
        dp = dctx.new_page(); dp.on('pageerror', lambda e: errors.append('demo:' + str(e)))
        dp.goto(URL.split('#')[0] + '#/demo'); dp.wait_for_timeout(600)
        check(f'[{tag}] デモ用リンクでサンプルデータ入りのホームが開く', 'こむぎ' in dp.inner_text('#app') and dp.evaluate('location.hash') == '#/home')
        dp.goto(URL.split('#')[0] + '#/demo'); dp.wait_for_timeout(400)
        check(f'[{tag}] デモ用リンクを2回開いてもデータは増えない', dp.evaluate('JSON.parse(localStorage.getItem("pawcare.v1")).pets.length') == 2)
        dctx.close()

        # ---------- ホームの緊急時：ふだんは出さず、誤食の記録があるときだけ ----------
        hctx = browser.new_context(**dev, locale='ja-JP', timezone_id='Asia/Tokyo')
        hp = hctx.new_page(); hp.on('pageerror', lambda e: errors.append('home:' + str(e)))
        hp.goto(URL); hp.wait_for_selector('.bottom-nav')
        hp.click('text=＋ ペットを登録する'); hp.fill('input[name=name]', 'ハナ'); hp.click('form[data-form=pet] button[type=submit]'); hp.wait_for_timeout(300)
        check(f'[{tag}] ふだんのホームに大きな緊急時の案内は出ない', hp.locator('#app .home-danger, #app .emergency-card').count() == 0 and hp.locator('.header-emergency').is_visible())
        hp.click('.quick-btn[data-cat=ingest]'); hp.wait_for_timeout(200)
        hp.keyboard.press('Escape'); hp.wait_for_timeout(200)
        check(f'[{tag}] 誤食の疑いを記録するとホームの一番上に電話の案内', hp.locator('#app > .home-danger').count() == 1 and '今すぐ電話' in hp.inner_text('.home-danger'))
        hctx.close()

        # ---------- v1.9 プラン・広告枠 ----------
        page.keyboard.press('Escape')
        page.evaluate('location.hash = "#/plans"'); page.wait_for_timeout(150)
        pt = page.inner_text('#app')
        check(f'[{tag}] プラン画面（無料・プロ480円・ファミリー780円・診断しない）', all(x in pt for x in ['無料', '月480円', '月780円', '家族4人', '診断や治療の指示はしません']))
        page.evaluate('location.hash = "#/nutrition"'); page.wait_for_timeout(150)
        check(f'[{tag}] ごはんチェックにプロへの案内', page.locator('#app .upsell[data-nav=plans]').count() == 1)
        check(f'[{tag}] 広告が未設定ならどこにも出ない', page.locator('.ad-card').count() == 0)
        # 広告を1件入れた場合：ホームと記録だけに「PR」付きで出て、緊急時・問診・ごはんチェックには出ない
        page.evaluate("PAWCARE_DATA.ADS.push({title:'テスト広告', text:'説明', url:'https://example.com/', sponsor:'テスト社', slots:['home','logs','emergency','interview','nutrition']})")
        shown = {}
        for v in ['home', 'logs', 'emergency', 'interview', 'nutrition']:
            page.evaluate(f'location.hash = "#/{v}"'); page.wait_for_timeout(150)
            shown[v] = page.locator('.ad-card').count()
        check(f'[{tag}] 広告はホームと記録だけ（PR表示つき）', shown['home'] == 1 and shown['logs'] == 1 and shown['emergency'] == 0 and shown['interview'] == 0 and shown['nutrition'] == 0, str(shown))
        page.evaluate('location.hash = "#/home"'); page.wait_for_timeout(150)
        check(f'[{tag}] 広告に「PR」と提供元、rel=sponsored', 'PR' in page.inner_text('.ad-card') and 'テスト社' in page.inner_text('.ad-card') and 'sponsored' in page.get_attribute('.ad-card', 'rel'))
        page.evaluate('PAWCARE_DATA.ADS.length = 0')

        check(f'[{tag}] JavaScriptエラーなし', not errors, '; '.join(errors[:5]))
        browser.close()


# ======================================================================
# v1.1 機能：予定・リマインダー／カレンダー連携／病院への共有リンク
# ======================================================================
import base64
import gzip
from datetime import datetime, timedelta
from urllib.parse import unquote


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def j_payload(obj) -> str:
    """アプリが対応する 'j' 形式（非圧縮 base64url(UTF-8 JSON)）の共有データを作る"""
    return 'j' + b64url(json.dumps(obj, ensure_ascii=False).encode('utf-8'))


def decode_share(url: str):
    data = url.split('#/view/', 1)[1]
    raw = base64.urlsafe_b64decode(data[1:] + '=' * (-len(data[1:]) % 4))
    if data[0] == 'z':
        raw = gzip.decompress(raw)
    return json.loads(raw.decode('utf-8'))


def hide_toast(page):
    """トーストが下部のボタンに重なってクリックを遅らせないよう閉じる"""
    page.evaluate('() => { const t = document.getElementById("toast"); if (t) t.hidden = true; }')


def no_overflow(page):
    return page.evaluate('document.documentElement.scrollWidth - window.innerWidth')


def attach_errors(page, errors, label):
    page.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
    page.on('console', lambda m: errors.append(f'{label}: {m.text}') if m.type == 'error' else None)
    page.on('dialog', lambda d: d.accept())


def page_now(page):
    return page.evaluate('''() => { const d = new Date(), p = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }''')


def get_db(page):
    return page.evaluate('JSON.parse(localStorage.getItem("pawcare.v1"))')


def rem_by_title(page, title):
    return next((r for r in get_db(page)['reminders'] if r['title'] == title), None)


def open_viewer(browser, dev, url, errors, label):
    """病院側の閲覧を再現：PAWCAREのデータを持たない新しいブラウザコンテキストで開く"""
    vctx = browser.new_context(**dev, locale='ja-JP', timezone_id='Asia/Tokyo')
    vp = vctx.new_page()
    attach_errors(vp, errors, label)
    vp.goto(url)
    vp.wait_for_function('() => ["view", "cardview", "import"].includes(document.body.dataset.view) && !document.querySelector("#app > .loading")', timeout=10000)
    return vctx, vp


def run_v11(device_name):
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        dev = dict(p.devices[device_name]); dev.pop('default_browser_type', None)
        ctx = browser.new_context(**dev, accept_downloads=True, locale='ja-JP', timezone_id='Asia/Tokyo')
        page = ctx.new_page()
        errors = []
        attach_errors(page, errors, 'app')
        tag = device_name.split()[0]
        ios = 'iPhone' in device_name

        page.goto(URL)
        wait_rendered(page)
        page.click('text=＋ ペットを登録する')
        page.fill('input[name=name]', 'ポチ')
        page.select_option('select[name=breedSelect]', '柴犬')
        page.fill('input[name=weight]', '9.2')
        page.fill('textarea[name=memo]', '鶏肉アレルギー')
        page.click('form[data-form=pet] button[type=submit]')
        page.wait_for_selector('.stage')
        page.click('.quick-btn[data-cat=food]')
        hide_toast(page)
        pet_id = get_db(page)['pets'][0]['id']

        # ---------- 予定：ホームカード・追加 ----------
        check(f'[{tag}] ホームに予定のタイル', page.locator('.tile[data-nav=reminders]').count() == 1)
        now = datetime.strptime(page_now(page), '%Y-%m-%dT%H:%M')
        future = (now + timedelta(days=10)).strftime('%Y-%m-%dT10:00')
        page.click('.tile[data-nav=reminders]')
        page.wait_for_function('() => document.body.dataset.view === "reminders"')
        page.click('#app >> text=＋ 予定')
        page.wait_for_selector('form[data-form=reminder]')
        f = 'form[data-form=reminder] '
        page.select_option(f + 'select[name=petId]', pet_id)
        page.select_option(f + 'select[name=type]', 'vaccine')
        page.fill(f + 'input[name=title]', '混合ワクチン')
        page.fill(f + 'input[name=dueAt]', future)
        page.select_option(f + 'select[name=repeat]', 'none')
        page.fill(f + 'textarea[name=memo]', '8種')
        page.click(f + 'button[type=submit]')
        page.wait_for_selector('#sheet', state='hidden')
        r = rem_by_title(page, '混合ワクチン')
        check(f'[{tag}] 予定を追加', r and r['type'] == 'vaccine' and r['dueAt'] == future and r['repeat'] == 'none' and r['memo'] == '8種' and r['done'] is False, str(r))
        check(f'[{tag}] 追加した予定が一覧に表示', '混合ワクチン' in page.inner_text('#app'))
        check(f'[{tag}] 追加後トーストからカレンダー登録できる', '📅 カレンダーに登録' in page.inner_text('#toast'))
        hide_toast(page)

        # ---------- 予定：編集 ----------
        page.click('.rem-item:has-text("混合ワクチン") .log-item')
        page.wait_for_selector('form[data-form=reminder]')
        check(f'[{tag}] 予定の編集フォームに既存値', page.input_value(f + 'input[name=title]') == '混合ワクチン' and page.input_value(f + 'input[name=dueAt]') == future)
        page.fill(f + 'input[name=title]', '混合ワクチン（8種）')
        page.select_option(f + 'select[name=repeat]', 'yearly')
        page.click(f + 'button[type=submit]')
        page.wait_for_selector('#sheet', state='hidden')
        hide_toast(page)
        r = rem_by_title(page, '混合ワクチン（8種）')
        check(f'[{tag}] 予定の編集', r and r['repeat'] == 'yearly' and len(get_db(page)['reminders']) == 1, str(r))

        # ---------- 予定：くり返し（毎日・服薬）の完了 → 次の未来の日時・服薬記録 ----------
        past = (now - timedelta(days=3)).strftime('%Y-%m-%dT08:00')
        page.click('[data-nav=home]')
        page.evaluate('location.hash = "#/reminders"')
        page.wait_for_function('() => document.body.dataset.view === "reminders"')
        page.click('#app >> text=＋ 予定')
        page.wait_for_selector('form[data-form=reminder]')
        page.select_option(f + 'select[name=type]', 'medicine')
        page.fill(f + 'input[name=title]', '整腸剤')
        page.fill(f + 'input[name=dueAt]', past)
        page.select_option(f + 'select[name=repeat]', 'daily')
        page.click(f + 'button[type=submit]')
        page.wait_for_selector('#sheet', state='hidden')
        hide_toast(page)
        check(f'[{tag}] 予定日を過ぎた予定に中立的なバッジ', '予定日を過ぎています' in page.inner_text('.rem-item:has-text("整腸剤")') and '期限切れ' not in page.inner_text('#app'))
        page.screenshot(path=f'{SHOT}/{tag}-v11-01-reminders.png', full_page=True)

        # カレンダー登録シート（Googleカレンダー・毎日）
        page.click('.rem-item:has-text("整腸剤") >> text=📅 カレンダーに登録')
        page.wait_for_selector('#sheet:not([hidden]) a:has-text("Googleカレンダーに追加")')
        href = page.get_attribute('#sheet a:has-text("Googleカレンダーに追加")', 'href')
        dec = unquote(href)
        exp_dates = past.replace('-', '').replace(':', '') + '00'
        check(f'[{tag}] Googleカレンダーのリンク', href.startswith('https://calendar.google.com/') and 'action=TEMPLATE' in href and f'dates={exp_dates}/' in href and 'recur=RRULE:FREQ=DAILY' in dec and 'ポチ：整腸剤' in dec, href[:200])
        check(f'[{tag}] .icsボタンの表記', ('iPhoneのカレンダーに追加' if ios else 'カレンダーファイル（.ics）で追加') in page.inner_text('#sheet'))
        page.screenshot(path=f'{SHOT}/{tag}-v11-02-calendar.png')
        if not ios:
            with page.expect_download() as dl:
                page.click('#sheet [data-action=downloadIcs]')
            raw = open(dl.value.path(), 'rb').read()
            ics = raw.decode('utf-8')
            check(f'[{tag}] .icsファイル名', dl.value.suggested_filename.endswith('.ics'), dl.value.suggested_filename)
            check(f'[{tag}] .icsの内容（VCALENDAR/DTSTART/RRULE/VALARM）', all(x in ics for x in ['BEGIN:VCALENDAR', 'END:VCALENDAR', 'BEGIN:VEVENT', f'DTSTART:{exp_dates}', 'RRULE:FREQ=DAILY', 'BEGIN:VALARM']), ics[:300])
            check(f'[{tag}] .icsの改行はCRLF', b'\r\n' in raw and b'\n' not in raw.replace(b'\r\n', b''))
        page.click('#sheet [data-close-sheet] >> nth=-1')
        page.wait_for_selector('#sheet', state='hidden')

        logs_before = len([l for l in get_db(page)['logs'] if l['category'] == 'medicine'])
        n1 = page_now(page)
        page.click('.rem-item:has-text("整腸剤") >> text=✓ 完了')
        page.wait_for_function('() => !document.getElementById("toast").hidden')
        n2 = page_now(page)
        hide_toast(page)
        r = rem_by_title(page, '整腸剤')

        def next_daily(nowstr):
            d = datetime.strptime(past, '%Y-%m-%dT%H:%M') + timedelta(days=1)
            while d.strftime('%Y-%m-%dT%H:%M') <= nowstr:
                d += timedelta(days=1)
            return d.strftime('%Y-%m-%dT%H:%M')
        check(f'[{tag}] くり返し予定の完了で次の未来の日時へ進む', r and not r['done'] and r['dueAt'] in (next_daily(n1), next_daily(n2)) and r['dueAt'] > n1, f"{r and r['dueAt']} 期待 {next_daily(n1)}")
        meds = [l for l in get_db(page)['logs'] if l['category'] == 'medicine']
        check(f'[{tag}] 服薬の予定を完了すると服薬記録が追加', len(meds) == logs_before + 1 and meds[-1]['memo'] == '整腸剤', str(meds[-1:]))

        # ---------- くり返さない予定の完了 ----------
        logs_count = len(get_db(page)['logs'])
        page.click('.rem-item:has-text("混合ワクチン") .log-item')
        page.select_option(f + 'select[name=repeat]', 'none')
        page.click(f + 'button[type=submit]')
        page.wait_for_selector('#sheet', state='hidden')
        hide_toast(page)
        page.click('.rem-item:has-text("混合ワクチン") >> text=✓ 完了')
        page.wait_for_function('() => !document.getElementById("toast").hidden')
        hide_toast(page)
        r = rem_by_title(page, '混合ワクチン（8種）')
        done_sec = page.locator('section.card:has(h2:has-text("完了した予定"))')
        check(f'[{tag}] くり返さない予定の完了', r and r['done'] is True and r['dueAt'] == future and done_sec.count() == 1 and '混合ワクチン' in done_sec.inner_text(), str(r))
        check(f'[{tag}] 服薬以外の完了では記録が増えない', len(get_db(page)['logs']) == logs_count)

        # ---------- 毎月・毎年くり返しの月末処理（localStorage に直接投入して再読込） ----------
        y = now.year + 1
        page.evaluate('''([pid, y]) => { const db = JSON.parse(localStorage.getItem('pawcare.v1'));
            db.reminders.push({ id: 'mjan31', petId: pid, type: 'prevent', title: '月末の予防薬', dueAt: y + '-01-31T09:00', repeat: 'monthly', memo: '', done: false });
            db.reminders.push({ id: 'yfeb29', petId: pid, type: 'other', title: 'うるう年', dueAt: (y + (4 - y % 4) % 4) + '-02-29T09:00', repeat: 'yearly', memo: '', done: false });
            localStorage.setItem('pawcare.v1', JSON.stringify(db)); }''', [pet_id, y])
        page.reload()
        wait_rendered(page)
        page.click('.rem-item:has-text("月末の予防薬") >> text=✓ 完了')
        page.wait_for_function('() => !document.getElementById("toast").hidden')
        hide_toast(page)
        due = rem_by_title(page, '月末の予防薬')['dueAt']
        check(f'[{tag}] 毎月くり返し：1/31 → 2月末に丸める', due == f'{y}-02-28T09:00', due)
        page.click('.rem-item:has-text("月末の予防薬") >> text=✓ 完了')
        page.wait_for_function('() => !document.getElementById("toast").hidden')
        hide_toast(page)
        due = rem_by_title(page, '月末の予防薬')['dueAt']
        check(f'[{tag}] 毎月くり返し：2月末の次は3/31（元の31日を維持）', due == f'{y}-03-31T09:00', f'実際 {due}')
        leap = y + (4 - y % 4) % 4
        page.click('.rem-item:has-text("うるう年") >> text=✓ 完了')
        page.wait_for_function('() => !document.getElementById("toast").hidden')
        hide_toast(page)
        due = rem_by_title(page, 'うるう年')['dueAt']
        check(f'[{tag}] 毎年くり返し：2/29 → 翌年2/28', due == f'{leap + 1}-02-28T09:00', due)

        # ---------- .ics：長い日本語SUMMARYの折り返し・セミコロンのエスケープ ----------
        if not ios:
            long_title = '長い件名のテスト；フィラリア予防薬とノミダニ予防薬をあわせて投与する日'
            page.evaluate('''([pid, t]) => { const db = JSON.parse(localStorage.getItem('pawcare.v1'));
                db.reminders.push({ id: 'longics', petId: pid, type: 'checkup', title: t, dueAt: '2030-05-01T10:00', repeat: 'none', memo: 'a;b,c', done: false });
                localStorage.setItem('pawcare.v1', JSON.stringify(db)); }''', [pet_id, long_title.replace('；', ';')])
            page.reload()
            wait_rendered(page)
            page.click('.rem-item:has-text("長い件名のテスト") >> text=📅 カレンダーに登録')
            with page.expect_download() as dl:
                page.click('#sheet [data-action=downloadIcs]')
            raw = open(dl.value.path(), 'rb').read()
            phys = raw.split(b'\r\n')
            check(f'[{tag}] .ics 各物理行が75オクテット以下', all(len(l) <= 75 for l in phys), str([len(l) for l in phys if len(l) > 75]))
            unfolded = raw.replace(b'\r\n ', b'').decode('utf-8')
            summary_lines = [l for l in raw.decode('utf-8').split('\r\n')]
            idx = next(i for i, l in enumerate(summary_lines) if l.startswith('SUMMARY:'))
            check(f'[{tag}] .ics 長いSUMMARYは継続行（先頭スペース）に折り返される', summary_lines[idx + 1].startswith(' ') and ('SUMMARY:ポチ：' + long_title.replace('；', r'\;')) in unfolded, unfolded[:400])
            check(f'[{tag}] .ics の ; , はエスケープされる', r'DESCRIPTION:a\;b\,c' in unfolded)
            check(f'[{tag}] .ics 健康診断・通院は前日のアラームも付く', 'TRIGGER:-P1D' in unfolded and unfolded.count('BEGIN:VALARM') == 2)
            page.click('#sheet [data-close-sheet] >> nth=-1')

        # ---------- 予定の削除 ----------
        page.click('.rem-item:has-text("整腸剤") .log-item')
        page.click('text=この予定を削除')
        page.wait_for_selector('#sheet', state='hidden')
        hide_toast(page)
        check(f'[{tag}] 予定の削除', rem_by_title(page, '整腸剤') is None and '整腸剤' not in page.inner_text('#app'))
        check(f'[{tag}] reminders 画面で横はみ出しなし', no_overflow(page) <= 0, f'{no_overflow(page)}px')

        # ---------- 病院への共有：緊急時画面から ----------
        nav(page, 'home')
        page.click('.quick-btn[data-cat=vomit]')
        hide_toast(page)
        page.click('.log-item:has-text("嘔吐")')
        page.fill('textarea[name=memo]', '黄色い液体<b>少量</b>')
        page.click('form[data-form=log] button[type=submit]')
        page.wait_for_selector('#sheet', state='hidden')
        hide_toast(page)
        nav(page, 'emergency', '.header-emergency')
        page.click('text=共有リンク・QRコードを作る')
        page.wait_for_selector('form[data-form=share]')
        check(f'[{tag}] 共有フォーム：もしもカードの内容は既定で含める', page.is_checked('form[data-form=share] input[name=cardInfo]') is True)
        page.screenshot(path=f'{SHOT}/{tag}-v11-03-share-form.png', full_page=True)
        page.click('form[data-form=share] button[type=submit]')
        page.wait_for_selector('#sheet input.share-url')
        url = page.input_value('input.share-url')
        check(f'[{tag}] 共有リンクとQRコードが作られる', url.startswith(URL.split('#')[0]) and '#/view/' in url and page.locator('#sheet svg.qr').count() == 1, url[:80])
        payload = decode_share(url)
        check(f'[{tag}] 既定ではもしもカードの項目だけを含め、自由記述の補足メモは含めない', payload['p'].get('m', '').startswith('持病：') and '鶏肉アレルギー' not in json.dumps(payload, ensure_ascii=False))
        page.screenshot(path=f'{SHOT}/{tag}-v11-04-share-result.png', full_page=True)

        vctx, vp = open_viewer(browser, dev, url, errors, 'viewer')
        vt = vp.inner_text('#app')
        check(f'[{tag}] 共有ページ：受診用サマリーとペット情報', all(x in vt for x in ['受診用サマリー', 'ポチ', 'ペット情報', '柴犬', '9.2 kg']), vt[:200])
        check(f'[{tag}] 共有ページ：日ごとの要約', vp.locator('.day-summary li').count() >= 1 and '嘔吐 1回' in vp.inner_text('.day-summary'), vp.inner_text('.day-summary')[:200] if vp.locator('.day-summary').count() else 'なし')
        vp.click('.ds-details summary')
        rows = vp.locator('table.shared-table tbody tr')
        check(f'[{tag}] 共有ページ：記録の表', rows.count() >= 2 and '嘔吐' in vp.inner_text('table.shared-table') and '黄色い液体<b>少量</b>' in vp.inner_text('table.shared-table'))
        check(f'[{tag}] 共有ページ：下部ナビ・緊急ボタン非表示', vp.locator('.bottom-nav').is_hidden() and vp.locator('.header-emergency').is_hidden())
        check(f'[{tag}] 共有ページ：閲覧側のlocalStorageに何も残さない', vp.evaluate('localStorage.length') == 0, vp.evaluate('JSON.stringify(Object.keys(localStorage))'))
        check(f'[{tag}] 共有ページで横はみ出しなし', no_overflow(vp) <= 0, f'{no_overflow(vp)}px')
        vp.screenshot(path=f'{SHOT}/{tag}-v11-05-shared-view.png', full_page=True)
        vctx.close()

        # もしもカードの内容を外した場合
        page.click('#sheet [data-close-sheet] >> nth=-1')
        page.click('text=共有リンク・QRコードを作る')
        page.uncheck('form[data-form=share] input[name=cardInfo]')
        page.click('form[data-form=share] button[type=submit]')
        page.wait_for_selector('#sheet input.share-url')
        check(f'[{tag}] チェックを外すと持病・アレルギー・薬を含めない', decode_share(page.input_value('input.share-url'))['p']['m'] == '')
        page.click('#sheet [data-close-sheet] >> nth=-1')

        # ---------- 共有リンクの異常系（新しいコンテキストで開く） ----------
        base = URL.split('#')[0]
        ok_p = {'v': 1, 'c': '2026-11-01T10:00', 'p': {'n': 'テスト', 's': 'dog'}, 'memo': '', 'd': 0, 'l': []}
        cases = [
            ('有効期限切れ', dict(ok_p, x=1000), '有効期限が切れています'),
            ('xが数値でない', dict(ok_p, x='9999999999999'), '有効期限が切れています'),
        ]
        for name, obj, expect in cases:
            vctx, vp = open_viewer(browser, dev, base + '#/view/' + j_payload(obj), errors, 'viewer-' + name)
            check(f'[{tag}] 共有リンク（{name}）は期限切れ表示', expect in vp.inner_text('#app') and 'テスト' not in vp.inner_text('#app'))
            vctx.close()
        corrupt = [('途中で切れたリンク', url.split('#/view/')[1][:40]), ('不正な形式', 'q@@@@'), ('壊れたJSON', 'j' + b64url(b'{"v":1,'))]
        for name, data in corrupt:
            vctx, vp = open_viewer(browser, dev, base + '#/view/' + data, errors, 'viewer-' + name)
            check(f'[{tag}] 共有リンク（{name}）はエラーメッセージ表示', '共有された情報を表示できません' in vp.inner_text('#app'), vp.inner_text('#app')[:80])
            vctx.close()
        # JSONとしては正しいがオブジェクトでない（null）
        vctx = browser.new_context(**dev, locale='ja-JP', timezone_id='Asia/Tokyo')
        vp = vctx.new_page(); attach_errors(vp, [], 'viewer-null')
        vp.goto(base + '#/view/' + 'j' + b64url(b'null'))
        vp.wait_for_timeout(1500)
        t = vp.inner_text('#app')
        check(f'[{tag}] 共有リンク（中身がnull）はエラーメッセージ表示（読み込み中のまま止まらない）', '共有された情報を表示できません' in t or '有効期限' in t, f'表示: {t[:40]}')
        vctx.close()

        # XSS：改ざんされたリンク
        xss = '<img src=x onerror="window.__xss=1">'
        evil = {'v': 1, 'c': '2026-11-01T10:00', 'x': 4102444800000,
                'p': {'n': xss, 's': '<svg onload=window.__xss=2>', 'b': xss, 'bd': '2020-01-01', 'sx': xss, 'w': xss, 'm': xss},
                'memo': xss + '<script>window.__xss=3</script>', 'd': 7,
                'l': [['2026-11-01T09:00', xss, xss, xss], ['<img src=x onerror=window.__xss=4>', 'food', '', '']]}
        vctx, vp = open_viewer(browser, dev, base + '#/view/' + j_payload(evil), errors, 'viewer-xss')
        vp.wait_for_timeout(300)
        check(f'[{tag}] 共有リンクのペット名等はHTMLとして解釈されない', vp.locator('#app img, #app script, #app svg[onload]').count() == 0 and vp.evaluate('window.__xss') is None and xss in vp.inner_text('#app'))
        vctx.close()
        evil_d = dict(evil, p={'n': 'Dテスト'}, d='<img src=x onerror="window.__xss=5">')
        vctx, vp = open_viewer(browser, dev, base + '#/view/' + j_payload(evil_d), errors, 'viewer-xss-d')
        vp.wait_for_timeout(300)
        check(f'[{tag}] 改ざんされた d は実行されず記録欄も出ない', vp.locator('#app img').count() == 0 and vp.evaluate('window.__xss') is None and 'Dテスト' in vp.inner_text('#app') and '健康記録（直近' not in vp.inner_text('#app'))
        vctx.close()

        # ---------- 問診結果からの共有（今作成したメモを含む） ----------
        nav(page, 'interview')
        page.click('text=当てはまらない → 問診を始める')
        page.click('text=次へ')
        page.click('.chip:has-text("誤食")')
        check(f'[{tag}] 誤食を選ぶと注意文（緊急度判定なし）', page.locator('#app .alert.warn').count() >= 1 and '緊急度' not in page.inner_text('#app .alert.warn >> nth=0'))
        page.click('.chip:has-text("誤食")')
        page.click('.chip:has-text("下痢")')
        for _ in range(6):
            page.click('text=次へ')
        page.fill('textarea[data-iv=notes]', '共有テスト用メモQ7')
        page.click('text=メモを作成')
        page.wait_for_selector('#memoText')
        check(f'[{tag}] 問診結果に「病院への共有リンク・QRコードを作る」', page.locator('text=病院への共有リンク・QRコードを作る').count() == 1)
        page.click('text=病院への共有リンク・QRコードを作る')
        page.wait_for_selector('form[data-form=share]')
        check(f'[{tag}] 共有フォームに「今作成した問診メモを含める」', page.locator('.share-memo').is_visible() and '今作成した問診メモ' in page.inner_text('.share-memo'))
        page.click('form[data-form=share] button[type=submit]')
        page.wait_for_selector('#sheet input.share-url')
        url2 = page.input_value('input.share-url')
        check(f'[{tag}] 共有データに問診メモ本文', '共有テスト用メモQ7' in decode_share(url2)['memo'])
        vctx, vp = open_viewer(browser, dev, url2, errors, 'viewer-memo')
        check(f'[{tag}] 共有ページに問診メモ', '共有テスト用メモQ7' in vp.inner_text('#app pre.memo') and '下痢' in vp.inner_text('#app pre.memo'))
        vctx.close()

        # ---------- v1.10 いろいろな動物・飼い方のめやす ----------
        page.goto(URL + '#/pets'); page.reload(); wait_rendered(page)
        page.click('text=＋ 追加')
        page.click('.species-btn[data-value=reptile]')
        opts = page.eval_on_selector_all('select[name=breedSelect] option', 'o => o.map(x => x.value)')
        check(f'[{tag}] 爬虫類ボタンで爬虫類の品種リスト', 'ヒョウモントカゲモドキ（レオパ）' in opts, str(opts[:4]))
        page.select_option('select[name=breedSelect]', 'ヒョウモントカゲモドキ（レオパ）')
        page.fill('input[name=name]', 'レオ')
        page.fill('input[name=weight]', '0.065')
        page.click('form[data-form=pet] button[type=submit]')
        page.wait_for_timeout(200)
        leo = [x for x in get_db(page)['pets'] if x['name'] == 'レオ'][0]
        check(f'[{tag}] 小さな体重（0.065kg）を保存できる', leo['species'] == 'reptile' and str(leo.get('weight')) in ('0.065',), str(leo.get('weight')))
        page.evaluate('id => { const d = JSON.parse(localStorage.getItem("pawcare.v1")); d.settings.activePetId = id; localStorage.setItem("pawcare.v1", JSON.stringify(d)); }', leo['id'])
        page.goto(URL + '#/home'); wait_rendered(page)
        cats = page.eval_on_selector_all('.quick-btn', 'b => b.map(x => x.dataset.cat)')
        check(f'[{tag}] 爬虫類のワンタップに脱皮・温度', 'shed' in cats and 'temp' in cats and 'walk' not in cats, str(cats))
        check(f'[{tag}] ホームに飼い方タイル', page.locator('.tile[data-nav=guide]').count() == 1)
        page.click('.tile[data-nav=guide]')
        page.wait_for_function('() => document.body.dataset.view === "guide"')
        g = page.inner_text('#app')
        check(f'[{tag}] 飼い方：ペットの品種を最初に表示', 'ヒョウモントカゲモドキ（レオパ）について' in g and 'ホットスポット30〜32℃' in g and 'パキスタン' in g)
        check(f'[{tag}] 飼い方：温度・湿度・ごはん・寝床・習性・歴史', all(k in g for k in ['温度', '湿度', 'ごはん', '寝床・住まい', '習性', '爬虫類と人の歴史']))
        check(f'[{tag}] 飼い方：監修準備中と病院への相談の注記', '監修を準備中' in g and '動物病院に相談' in g)
        page.select_option('select[data-guide=species]', 'cat'); page.wait_for_timeout(150)
        page.select_option('select[data-guide=breed]', 'スコティッシュ・フォールド'); page.wait_for_timeout(150)
        g = page.inner_text('#app')
        check(f'[{tag}] 飼い方：猫の品種に切り替え', '1961年' in g and 'リビアヤマネコ' in g)
        check(f'[{tag}] 飼い方：画面からはみ出さない', no_overflow(page) <= 0)
        # すべての動物・品種が表示できる（データ欠けの検出）
        bad = page.evaluate("""() => { const C = window.PAWCARE_CARE, D = window.PAWCARE_DATA, out = [];
          D.SPECIES.forEach(s => { const base = C.SPECIES[s.id]; if (!base) out.push('species:' + s.id);
            (D.BREEDS[s.id] || []).forEach(b => { if (['ミックス','不明','その他'].includes(b)) return;
              const x = (C.BREEDS[s.id] || {})[b]; if (!x || !x.origin || !x.history) out.push(s.id + ':' + b); }); });
          return out; }""")
        check(f'[{tag}] 全品種に由来と歴史がある', not bad, str(bad[:8]))
        page.evaluate('location.hash = "#/emergency"'); page.wait_for_timeout(150)
        e = page.inner_text('#app')
        check(f'[{tag}] 緊急：犬猫以外は診られる病院の検索リンク', '爬虫類を診られる動物病院を探す' in e)
        check(f'[{tag}] 緊急：犬猫以外の一般的な案内', '爬虫類の場合' in e)

        # ---------- v1.11 うちの子ステージ・着せかえ・じまん画像 ----------
        page.goto(URL + '#/home'); page.reload(); wait_rendered(page)
        check(f'[{tag}] ホームに動くアバター', page.locator('.stage .av.av-live img[src*="img/avatars/"]').count() == 1)
        b0 = page.inner_text('#avBubble')
        check(f'[{tag}] アバターがしゃべりかける', len(b0) > 3 and '大丈夫' not in b0, b0)
        page.click('.av-btn'); page.wait_for_timeout(150)
        b1 = page.inner_text('#avBubble')
        check(f'[{tag}] なでると反応する', b1 != b0 and page.locator('.av-btn .heart').count() == 1, b1)
        page.click('.stage [data-nav=avatar]')
        page.wait_for_function('() => document.body.dataset.view === "avatar"')
        page.click('.sw[data-k=acc][data-v=crown]'); page.wait_for_timeout(120)
        page.click('.sw[data-k=accColor][data-v=pink]'); page.wait_for_timeout(120)
        page.click('.sw[data-k=bg][data-v=night]'); page.wait_for_timeout(120)
        cur = [x for x in get_db(page)['pets'] if x['id'] == get_db(page)['settings']['activePetId']][0]
        check(f'[{tag}] 着せかえが保存される', cur.get('avatar', {}).get('accColor') == 'pink' and cur['avatar'].get('acc') == 'crown' and cur['avatar'].get('bg') == 'night', str(cur.get('avatar')))
        check(f'[{tag}] 着せかえがプレビューに反映', '#F5A6BC' in page.inner_html('.stage .av-over') and 'reptile.webp' in page.inner_html('.stage .av'))
        # 一覧にない値は保存しない（SVGに外部の文字列を入れない）
        page.evaluate("""() => { const b = document.createElement('button'); b.dataset.action = 'avSet'; b.dataset.k = 'accColor'; b.dataset.v = '"><script>x</script>'; b.id = 'evil'; document.getElementById('app').appendChild(b); }""")
        page.click('#evil'); page.wait_for_timeout(100)
        cur = [x for x in get_db(page)['pets'] if x['id'] == get_db(page)['settings']['activePetId']][0]
        check(f'[{tag}] 一覧にない着せかえ値は無視', cur['avatar']['accColor'] == 'pink')
        page.evaluate("""() => { const d = JSON.parse(localStorage.getItem('pawcare.v1')); const p = d.pets.find(x => x.id === d.settings.activePetId); p.avatar = { look: '../../evil', accColor: '<img src=x onerror=alert(1)>', acc: 'zzz' }; localStorage.setItem('pawcare.v1', JSON.stringify(d)); }""")
        page.goto(URL + '#/home'); page.reload(); wait_rendered(page)
        check(f'[{tag}] 壊れた着せかえ値でも既定の見た目で表示', page.locator('.stage .av img[src="img/avatars/reptile.webp"]').count() == 1 and page.locator('#app img[src=x]').count() == 0)
        page.click('.stage [data-action=shareAvatar]')
        page.wait_for_selector('#sheet .share-img', timeout=8000)
        nat = page.evaluate("() => { const i = document.querySelector('#sheet .share-img'); return [i.naturalWidth, i.naturalHeight]; }")
        check(f'[{tag}] じまん画像（1080×1350）を作れる', nat == [1080, 1350], str(nat))
        check(f'[{tag}] じまん画像の説明に健康記録は入らないと明記', '健康の記録は画像に入りません' in page.inner_text('#sheet'))
        page.keyboard.press('Escape'); page.goto(URL + '#/home'); page.reload(); wait_rendered(page)
        # 誤食直後など危険の案内が出ているときは、ふざけず落ち着いたセリフにする
        page.evaluate("""() => { const d = JSON.parse(localStorage.getItem('pawcare.v1')); const n = new Date(); const pad = (x) => String(x).padStart(2, '0');
          const dt = n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()) + 'T' + pad(n.getHours()) + ':' + pad(n.getMinutes());
          d.logs.push({ id: 'calmtest', petId: d.settings.activePetId, category: 'ingest', datetime: dt, memo: 'テスト', value: '' }); localStorage.setItem('pawcare.v1', JSON.stringify(d)); }""")
        page.reload(); wait_rendered(page)
        calm = page.locator('.stage.calm').count() == 1
        check(f'[{tag}] 危険の案内中はアバターが落ち着いたセリフ', calm and '上の案内' in page.inner_text('#avBubble'), page.inner_text('#avBubble'))
        page.click('.av-btn'); page.wait_for_timeout(120)
        check(f'[{tag}] 危険の案内中はなでても遊ばない', '上の案内' in page.inner_text('#avBubble'))
        page.evaluate("""() => { const d = JSON.parse(localStorage.getItem('pawcare.v1')); d.logs = d.logs.filter(l => l.id !== 'calmtest'); localStorage.setItem('pawcare.v1', JSON.stringify(d)); }""")
        # 10種類すべてのアバターが描ける
        files = page.evaluate("() => window.PAWCARE_AVATAR.FILES")
        bad_img = page.evaluate("async (fs) => { const out = []; for (const f of fs) { const ok = await new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth > 100); i.onerror = () => r(false); i.src = f; }); if (!ok) out.push(f); } return out; }", files)
        check(f'[{tag}] 10種類＋すがた違いのイラストがすべて読める', len(files) == 15 and not bad_img, str(bad_img))
        # ---------- v1.12 動きと手応え ----------
        page.goto(URL + '#/home'); page.reload(); wait_rendered(page)
        page.click('.quick-btn[data-cat=food]'); page.wait_for_timeout(60)
        check(f'[{tag}] ワンタップ記録で「＋1」がはじける', page.locator('.quick-btn[data-cat=food] .plus-one').count() == 1)
        check(f'[{tag}] 記録のトーストにチェック', page.inner_text('#toast').startswith('✓'))
        hide_toast(page)
        check(f'[{tag}] もしもの準備に進み具合のバー', page.locator('.notice-row .progress').count() <= 1)
        page.goto(URL + '#/logs'); page.reload(); wait_rendered(page)
        rows = page.locator('#app .swipe-row')
        n_before = len(get_db(page)['logs'])
        first = rows.first.locator('.log-item')
        bb = first.bounding_box()
        page.mouse.move(bb['x'] + bb['width'] - 20, bb['y'] + bb['height'] / 2)
        page.mouse.down(); page.mouse.move(bb['x'] + bb['width'] - 80, bb['y'] + bb['height'] / 2, steps=6); page.mouse.move(bb['x'] + bb['width'] - 140, bb['y'] + bb['height'] / 2, steps=6); page.mouse.up()
        page.wait_for_timeout(300)
        check(f'[{tag}] 記録を左にずらすと削除ボタンが出る', rows.first.get_attribute('class').find('open') >= 0 and page.locator('#sheet').is_hidden())
        rows.first.locator('.swipe-del').click(); page.wait_for_timeout(150)
        check(f'[{tag}] ずらして削除できる', len(get_db(page)['logs']) == n_before - 1)
        page.click('#toast [data-toast-action="0"]'); page.wait_for_timeout(150)
        check(f'[{tag}] 削除を元に戻せる', len(get_db(page)['logs']) == n_before)
        page.goto(URL + '#/pets'); page.reload(); wait_rendered(page)
        page.click('text=＋ 追加'); page.wait_for_selector('form[data-form=pet]')
        page.click('form[data-form=pet] button[type=submit]'); page.wait_for_timeout(80)
        check(f'[{tag}] 入力もれはシェイクで知らせる', page.locator('#sheet .shake').count() >= 1)
        check(f'[{tag}] ボトムシートに引っぱるつまみ', page.locator('.sheet-grab').is_visible())
        page.keyboard.press('Escape')
        # ---------- v1.13 今日のおせわ・パーフェクト・コンボ・毎日のお知らせ ----------
        page.goto(URL + '#/home'); page.reload(); wait_rendered(page)
        page.evaluate("""() => { const d = JSON.parse(localStorage.getItem('pawcare.v1')); const id = d.settings.activePetId; const t = new Date(); const pad = (x) => String(x).padStart(2, '0');
          const day = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); d.logs = d.logs.filter(l => !(l.petId === id && l.datetime.slice(0, 10) === day)); localStorage.setItem('pawcare.v1', JSON.stringify(d)); }""")
        page.reload(); wait_rendered(page)
        goal = page.eval_on_selector_all('.quick-btn[data-goal]', 'b => b.map(x => x.dataset.cat)')
        check(f'[{tag}] 爬虫類の今日のおせわは温度と水', goal == ['water', 'temp'] or sorted(goal) == ['temp', 'water'], str(goal))
        check(f'[{tag}] 今日のおせわの進み具合が0', '0 / 2' in page.inner_text('.care'))
        page.click('.quick-btn[data-cat=water]'); page.wait_for_timeout(120)
        hide_toast(page)
        check(f'[{tag}] 1つ記録すると進み具合が進む', '1 / 2' in page.inner_text('.care') and page.locator('.quick-btn[data-cat=water][data-goal=done]').count() == 1)
        page.click('.quick-btn[data-cat=temp]'); page.wait_for_timeout(60)
        check(f'[{tag}] 続けて記録するとコンボ', 'コンボ×2' in page.inner_text('.quick-btn[data-cat=temp]'))
        page.wait_for_selector('#celebrate', timeout=3000)
        check(f'[{tag}] 全部できたらパーフェクトのお祝い', 'パーフェクト' in page.inner_text('#celebrate'))
        page.click('#celebrate .cel-next'); page.wait_for_selector('#celebrate', state='detached', timeout=3000)
        check(f'[{tag}] パーフェクトがホームに表示', 'パーフェクト' in page.inner_text('.care'))
        hide_toast(page)
        page.click('.quick-btn[data-cat=water]'); page.wait_for_timeout(700)
        check(f'[{tag}] パーフェクト後はお祝いを繰り返さない', page.locator('#celebrate').count() == 0)
        hide_toast(page)
        page.click('.notice-row[data-action=dailyReminder]') if page.locator('.notice-row[data-action=dailyReminder]').count() else page.click('text=⚙️')
        if page.locator('#dailyTime').count() == 0:
            page.goto(URL + '#/settings'); page.reload(); wait_rendered(page); page.click('[data-action=dailyReminder]')
        page.fill('#dailyTime', '21:30')
        page.evaluate("() => { window.__opened = ''; window.open = (u) => { window.__opened = u; return null; }; }")
        page.click('[data-action=dailyGoogle]'); page.wait_for_timeout(100)
        gurl = page.evaluate('() => window.__opened')
        check(f'[{tag}] 毎日のお知らせをGoogleカレンダーに（毎日くり返し）', 'RRULE%3AFREQ%3DDAILY' in gurl or 'RRULE:FREQ=DAILY' in gurl, gurl[:200])
        check(f'[{tag}] お知らせの時間を保存', get_db(page)['settings'].get('dailyTime') == '21:30')
        # ---------- v1.14 Finch型ホーム・今週のようす・項目の変更・音と振動 ----------
        page.goto(URL + '#/home'); page.reload(); wait_rendered(page)
        check(f'[{tag}] ステージの中に今日のお世話の一覧', page.locator('.stage .care .care-row').count() >= 1)
        check(f'[{tag}] 今週のようす（回数・最後の日・7日の点）', page.locator('.week-map li').count() >= 2 and '今週の' in page.inner_text('.week-map') and page.locator('.week-map .wm-dots i').count() >= 14)
        page.click('.care [data-action=editDaily]'); page.wait_for_selector('form[data-form=daily]')
        page.evaluate("() => document.querySelectorAll('form[data-form=daily] input[type=checkbox]').forEach(i => i.checked = false)")
        page.click('form[data-form=daily] button[type=submit]'); page.wait_for_timeout(80)
        check(f'[{tag}] お世話の項目を0こにはできない', not page.locator('form[data-form=daily] .form-error').is_hidden())
        page.check('form[data-form=daily] input[name=d_food]'); page.check('form[data-form=daily] input[name=d_shed]')
        page.click('form[data-form=daily] button[type=submit]'); page.wait_for_timeout(200)
        cur = [x for x in get_db(page)['pets'] if x['id'] == get_db(page)['settings']['activePetId']][0]
        check(f'[{tag}] お世話の項目を変えられる', cur.get('daily') == ['food', 'shed'], str(cur.get('daily')))
        hide_toast(page)
        rows = page.eval_on_selector_all('.care-row', 'b => b.map(x => x.dataset.cat)')
        check(f'[{tag}] 変えた項目がホームに出る', rows == ['food', 'shed'], str(rows))
        page.click('.care-row[data-cat=shed]'); page.wait_for_timeout(150)
        check(f'[{tag}] 一覧の行をタップして記録・うちの子が反応', page.locator('.care-row[data-cat=shed].done').count() == 1 and 'ぬぎぬぎ' in page.inner_text('#avBubble') and page.locator('.av-btn.react').count() == 1)
        if page.locator('#celebrate').count(): page.click('#celebrate .cel-next')
        hide_toast(page)
        page.goto(URL + '#/settings'); page.reload(); wait_rendered(page)
        page.click('label:has(input[data-action-change=toggleSound])'); page.wait_for_timeout(120)
        page.click('label:has(input[data-action-change=toggleHaptic])'); page.wait_for_timeout(120)
        st = get_db(page)['settings']
        check(f'[{tag}] 音と振動をオフにできる', st.get('sound') == 'off' and st.get('haptic') == 'off', str({k: st.get(k) for k in ['sound', 'haptic']}))
        # v1.17 研究・開発への協力（任意・最初はオフ）
        rc = page.locator('.research-card')
        check(f'[{tag}] 研究への協力：設定に説明があり最初はオフ', rc.count() == 1 and not page.is_checked('input[data-action-change=toggleResearch]') and (st.get('research') or {}).get('agreed') is not True and '端末の外に出ません' in rc.inner_text() and '売ったり渡したりしません' in rc.inner_text())
        page.click('label:has(input[data-action-change=toggleResearch])'); page.wait_for_timeout(150)
        r = get_db(page)['settings'].get('research') or {}
        check(f'[{tag}] 研究への協力：同意すると日付と版が残る', r.get('agreed') is True and r.get('v') == 1 and bool(r.get('at')) and page.locator('.research-when').count() == 1, str(r))
        page.reload(); wait_rendered(page)
        check(f'[{tag}] 研究への協力：読み込み直しても同意が残る', page.is_checked('input[data-action-change=toggleResearch]'))
        page.click('label:has(input[data-action-change=toggleResearch])'); page.wait_for_timeout(150)
        r = get_db(page)['settings'].get('research') or {}
        check(f'[{tag}] 研究への協力：いつでもやめられる', r.get('agreed') is False and r.get('at') is None, str(r))
        page.evaluate("() => { const d = JSON.parse(localStorage.getItem('pawcare.v1')); d.settings.research = { agreed: true, at: 'x', v: 99 }; localStorage.setItem('pawcare.v1', JSON.stringify(d)); }")
        page.reload(); wait_rendered(page)
        check(f'[{tag}] 研究への協力：版が違う・おかしい同意は無効になる', not page.is_checked('input[data-action-change=toggleResearch]'))
        hide_toast(page)

        # ---------- v1.14.1 緊急時はお祝いを出さない・電話を最初に ----------
        page.evaluate("""() => { const d = JSON.parse(localStorage.getItem('pawcare.v1')); const p = d.pets.find(x => x.id === d.settings.activePetId); p.daily = ['food'];
          const t = new Date(); const pad = (x) => String(x).padStart(2, '0'); const day = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
          d.logs = d.logs.filter(l => !(l.petId === p.id && l.datetime.slice(0, 10) === day)); d.settings.sound = 'on'; localStorage.setItem('pawcare.v1', JSON.stringify(d)); }""")
        page.goto(URL + '#/home'); page.reload(); wait_rendered(page)
        page.click('.care-row[data-cat=food]')
        page.evaluate('location.hash = "#/emergency"'); page.wait_for_timeout(1300)
        check(f'[{tag}] 最後の1つの直後に緊急時へ→お祝いを出さない', page.locator('#celebrate').count() == 0 and page.locator('.confetti').count() == 0 and page.locator('#toast').is_hidden())
        order = page.evaluate("() => { const c = document.querySelector('.call-first'), d = document.querySelector('#app .danger-signs, #app .alert'); return c && (!d || (c.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) > 0); }")
        check(f'[{tag}] 緊急時の画面は電話のカードが一番上', bool(order))
        dctx = browser.new_context(**dev, locale='ja-JP', timezone_id='Asia/Tokyo'); dp = dctx.new_page()
        dp.goto(URL + '#/demo'); wait_rendered(dp); dp.evaluate('location.hash = "#/emergency"'); dp.wait_for_timeout(300)
        tel = dp.eval_on_selector_all('.call-first a[href^="tel:"]', 'a => a.map(x => x.getAttribute("href"))')
        top = dp.evaluate("() => { const a = document.querySelector('.call-first a[href^=\"tel:\"]'); return a ? a.getBoundingClientRect().bottom : 9999; }")
        check(f'[{tag}] デモでも電話ボタンが出る（架空の000番号）', tel == ['tel:00000000001', 'tel:00000000002'], str(tel))
        check(f'[{tag}] 電話ボタンが最初の1画面に入る', top < dp.viewport_size['height'], str(top))
        # v1.15 外平先生のご意見：食べてはいけないもの・見逃したくない様子・病院に着くまで
        g = ' '.join(dp.eval_on_selector_all('.em-guide', 'e => e.map(x => x.innerText)'))
        check(f'[{tag}] 緊急時に食べてはいけないもの（イラスト一覧）', dp.locator('.toxic-grid li').count() >= 12 and 'ぶどう' in g)
        check(f'[{tag}] 犬（避妊済み）には胃拡張、子宮の項目は出ない', '吐こうとしても吐けない' in g and '避妊していない' not in g and '急に後ろ足' not in g)
        check(f'[{tag}] 病院に着くまで（熱中症・共通）と下書きの注記', '熱中症かも' in g and '向かう前に電話' in g and '確認していただいている途中の下書き' in g)
        dp.evaluate("() => { const d = JSON.parse(localStorage.getItem('pawcare.v1')); d.settings.activePetId = d.pets.find(p => p.species === 'cat').id; localStorage.setItem('pawcare.v1', JSON.stringify(d)); }")
        dp.reload(); dp.wait_for_timeout(400)
        g = ' '.join(dp.eval_on_selector_all('.em-guide', 'e => e.map(x => x.innerText)'))
        check(f'[{tag}] 猫（男の子）には血栓症・尿閉、胃拡張は出ない', '急に後ろ足' in g and 'おしっこが出ない' in g and '吐こうとしても吐けない' not in g and '避妊していない' not in g)
        check(f'[{tag}] 緊急時の追加に動き・お祝いがない', dp.locator('.confetti, #celebrate').count() == 0)
        dctx.close()
        # v1.18 起動画面とオレンジの配色
        sctx = _orig_new_context(browser, **dev, locale='ja-JP', timezone_id='Asia/Tokyo'); sp = sctx.new_page()
        sp.goto(URL + '#/home'); sp.wait_for_timeout(300)
        check(f'[{tag}] 起動画面に「ことぽすと」が出る', sp.locator('#splash').count() == 1 and sp.inner_text('.splash-name').replace('\n', '') == 'ことぽすと')
        sp.wait_for_timeout(2000)
        check(f'[{tag}] 起動画面は2秒以内に消える', sp.locator('#splash').count() == 0)
        sp.reload(); sp.wait_for_timeout(200)
        check(f'[{tag}] 起動画面は同じ起動中に二度出ない', sp.locator('#splash').count() == 0)
        sp.evaluate("sessionStorage.clear()"); sp.goto(URL + '#/home'); sp.reload(); sp.wait_for_timeout(200)
        sp.locator('#splash').click(); sp.wait_for_timeout(100)
        check(f'[{tag}] 起動画面はタップで飛ばせる', sp.locator('#splash').count() == 0)
        sp.evaluate("sessionStorage.clear()"); sp.goto(URL + '#/emergency'); sp.reload(); sp.wait_for_timeout(100)
        check(f'[{tag}] 緊急時の画面を直接開いたときは起動画面を出さない', sp.locator('#splash').count() == 0)
        hdr = sp.evaluate("getComputedStyle(document.querySelector('.app-header')).backgroundColor")
        check(f'[{tag}] ヘッダーがオレンジ', hdr == 'rgb(227, 109, 20)', hdr)
        sctx.close()
        rctx = _orig_new_context(browser, **dev, locale='ja-JP', timezone_id='Asia/Tokyo', reduced_motion='reduce'); rp = rctx.new_page()
        rp.goto(URL + '#/home'); rp.wait_for_timeout(100)
        check(f'[{tag}] 動きを減らす設定では起動画面を出さない', rp.locator('#splash').count() == 0)
        rctx.close()
        check(f'[{tag}] v1.1 JavaScriptエラーなし', not errors, '; '.join(errors[:5]))
        browser.close()


for d in ['iPhone 13', 'Pixel 7']:
    run(d)
    run_v11(d)

fails = [r for r in results if not r[1]]
print(f'\n合計 {len(results)} 件 / 成功 {len(results) - len(fails)} / 失敗 {len(fails)}')
sys.exit(1 if fails else 0)
