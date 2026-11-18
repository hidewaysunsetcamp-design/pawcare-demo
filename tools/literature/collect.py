#!/usr/bin/env python3
"""PAWCARE 獣医学文献コレクター（Europe PMC 無料API）

犬・猫・鳥・うさぎ等の愛玩動物の論文メタデータと要旨を集め、AI問診補助の
知識ベース（RAG）用に JSONL で保存する。

方針
- 商用利用できるライセンス（CC BY / CC0 / CC BY-SA）のオープンアクセス論文だけ
  要旨・本文を保存する。それ以外はメタデータ（書誌情報とURL）のみ保存する。
- 1件ごとに出典（DOI/PMID/URL/ライセンス）を必ず持たせ、AIの回答に引用できるようにする。
- APIキー不要。GitHub Actions（公開リポジトリは無料）で定期実行できる。

使い方
  python3 tools/literature/collect.py --since 2020 --max-per-query 200
  python3 tools/literature/collect.py --fixture tests/fixtures/europepmc_sample.json   # オフライン動作確認
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DEFAULT_OUT = os.path.join(ROOT, 'data', 'literature')
COMMERCIAL_OK = {'cc by', 'cc0', 'cc by-sa', 'cc-by', 'cc-by-sa', 'public domain'}
USER_AGENT = 'PAWCARE-literature-collector/1.0 (https://github.com/hidewaysunsetcamp-design/pawcare-demo)'


def load_queries(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def normalize_license(value):
    return re.sub(r'\s+', ' ', (value or '').strip().lower())


def clean(text):
    text = re.sub(r'<[^>]+>', ' ', text or '')
    return re.sub(r'\s+', ' ', text).strip()


def to_record(item, query):
    lic = normalize_license(item.get('license'))
    reusable = item.get('isOpenAccess') == 'Y' and lic in COMMERCIAL_OK
    journal = ((item.get('journalInfo') or {}).get('journal') or {}).get('title') or item.get('journalTitle') or ''
    pmid, pmcid, doi = item.get('pmid'), item.get('pmcid'), item.get('doi')
    if doi:
        url = 'https://doi.org/' + doi
    elif pmcid:
        url = 'https://europepmc.org/article/PMC/' + pmcid
    elif pmid:
        url = 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/'
    else:
        url = 'https://europepmc.org/article/%s/%s' % (item.get('source', 'MED'), item.get('id', ''))
    key = doi or pmid or pmcid or item.get('id') or url
    return {
        'id': 'lit_' + hashlib.sha1(key.encode('utf-8')).hexdigest()[:12],
        'title': clean(item.get('title')),
        'authors': item.get('authorString', ''),
        'journal': journal,
        'year': int(item.get('pubYear') or 0),
        'pmid': pmid, 'pmcid': pmcid, 'doi': doi, 'url': url,
        'license': lic or 'unknown',
        'reusable_text': reusable,
        # 再利用不可の論文は要旨を保存しない（書誌情報のみ）
        'abstract': clean(item.get('abstractText')) if reusable else '',
        'species': query['species'],
        'topics': [query['topic']],
        'publication_types': ((item.get('pubTypeList') or {}).get('pubType') or []),
        'collected_at': dt.date.today().isoformat(),
    }


def fetch(query_text, since, max_results, sleep):
    cursor, got = '*', 0
    q = '(%s) AND PUB_YEAR:[%d TO 3000] AND (SRC:MED OR SRC:PMC)' % (query_text, since)
    while got < max_results:
        params = {'query': q, 'format': 'json', 'resultType': 'core', 'pageSize': min(100, max_results - got), 'cursorMark': cursor, 'sort': 'P_PDATE_D desc'}
        req = urllib.request.Request(API + '?' + urllib.parse.urlencode(params), headers={'User-Agent': USER_AGENT})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    data = json.load(res)
                break
            except Exception as e:  # ネットワーク一時エラーは再試行
                if attempt == 2:
                    raise
                print('  retry after error:', e, file=sys.stderr)
                time.sleep(5 * (attempt + 1))
        items = (data.get('resultList') or {}).get('result') or []
        if not items:
            return
        for it in items:
            yield it
        got += len(items)
        nxt = data.get('nextCursorMark')
        if not nxt or nxt == cursor:
            return
        cursor = nxt
        time.sleep(sleep)


def merge(existing, rec):
    if rec['id'] not in existing:
        existing[rec['id']] = rec
        return True
    old = existing[rec['id']]
    old['topics'] = sorted(set(old['topics']) | set(rec['topics']))
    old['species'] = sorted(set(old['species']) | set(rec['species']))
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--queries', default=os.path.join(HERE, 'queries.json'))
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--since', type=int, default=2019)
    ap.add_argument('--max-per-query', type=int, default=200)
    ap.add_argument('--sleep', type=float, default=0.5)
    ap.add_argument('--fixture', help='APIの代わりにローカルJSON（Europe PMCの応答形式）を読む')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    store_path = os.path.join(args.out, 'papers.jsonl')
    existing = {}
    if os.path.exists(store_path):
        with open(store_path, encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    r = json.loads(line)
                    existing[r['id']] = r

    added = 0
    for q in load_queries(args.queries):
        print('query:', q['topic'], '/', ','.join(q['species']), file=sys.stderr)
        if args.fixture:
            with open(args.fixture, encoding='utf-8') as f:
                items = (json.load(f).get('resultList') or {}).get('result') or []
        else:
            items = fetch(q['query'], args.since, args.max_per_query, args.sleep)
        for it in items:
            rec = to_record(it, q)
            if rec['title'] and merge(existing, rec):
                added += 1
        if args.fixture:
            break

    records = sorted(existing.values(), key=lambda r: (-r['year'], r['id']))
    with open(store_path, 'w', encoding='utf-8') as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    summary = {
        'updated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'total': len(records), 'added': added,
        'reusable_text': sum(1 for r in records if r['reusable_text']),
        'by_species': {}, 'by_license': {},
    }
    for r in records:
        for s in r['species']:
            summary['by_species'][s] = summary['by_species'].get(s, 0) + 1
        summary['by_license'][r['license']] = summary['by_license'].get(r['license'], 0) + 1
    with open(os.path.join(args.out, 'summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
