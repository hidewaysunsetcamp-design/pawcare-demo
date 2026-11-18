#!/usr/bin/env python3
"""知識ベース（RAG）の構築と検索（無料・外部APIなし）

build : papers.jsonl のうち再利用可能な論文の要旨を段落（チャンク）に分け chunks.jsonl を作る
search: BM25 でチャンクを検索し、出典付きで返す（将来は埋め込み検索に置き換え可能）

  python3 tools/literature/kb.py build
  python3 tools/literature/kb.py search "cat urethral obstruction" --species cat -k 5
"""
import argparse
import json
import math
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, '..', '..', 'data', 'literature'))
TOKEN = re.compile(r'[a-z0-9]+')
STOP = set('a an the of and or in on to for with by from as at is are was were be been this that these those we our it its than then into not no'.split())


def tokens(text):
    return [t for t in TOKEN.findall((text or '').lower()) if t not in STOP and len(t) > 1]


def split_chunks(text, size=900):
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunk = ''
    for s in sentences:
        if chunk and len(chunk) + len(s) > size:
            yield chunk.strip()
            chunk = ''
        chunk += ' ' + s
    if chunk.strip():
        yield chunk.strip()


def build(data_dir):
    src = os.path.join(data_dir, 'papers.jsonl')
    out = os.path.join(data_dir, 'chunks.jsonl')
    n = 0
    with open(src, encoding='utf-8') as f, open(out, 'w', encoding='utf-8') as w:
        for line in f:
            p = json.loads(line)
            if not p.get('reusable_text') or not p.get('abstract'):
                continue
            for i, text in enumerate(split_chunks(p['abstract'])):
                w.write(json.dumps({
                    'chunk_id': '%s#%d' % (p['id'], i), 'paper_id': p['id'], 'text': text,
                    'title': p['title'], 'year': p['year'], 'journal': p['journal'],
                    'url': p['url'], 'license': p['license'], 'species': p['species'], 'topics': p['topics'],
                }, ensure_ascii=False) + '\n')
                n += 1
    print('chunks:', n, '->', out)


def search(data_dir, query, species=None, k=5):
    chunks = []
    with open(os.path.join(data_dir, 'chunks.jsonl'), encoding='utf-8') as f:
        for line in f:
            c = json.loads(line)
            if species and species not in c['species']:
                continue
            c['_tf'] = Counter(tokens(c['title'] + ' ' + c['text']))
            c['_len'] = sum(c['_tf'].values())
            chunks.append(c)
    if not chunks:
        return []
    avg = sum(c['_len'] for c in chunks) / len(chunks)
    df = Counter()
    for c in chunks:
        df.update(c['_tf'].keys())
    q = tokens(query)
    k1, b = 1.5, 0.75
    scored = []
    for c in chunks:
        s = 0.0
        for t in q:
            if t not in c['_tf']:
                continue
            idf = math.log(1 + (len(chunks) - df[t] + 0.5) / (df[t] + 0.5))
            tf = c['_tf'][t]
            s += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * c['_len'] / avg))
        if s > 0:
            scored.append((s, c))
    scored.sort(key=lambda x: -x[0])
    return [{'score': round(s, 3), **{k2: v for k2, v in c.items() if not k2.startswith('_')}} for s, c in scored[:k]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['build', 'search'])
    ap.add_argument('query', nargs='?')
    ap.add_argument('--species')
    ap.add_argument('-k', type=int, default=5)
    ap.add_argument('--data', default=DATA)
    a = ap.parse_args()
    if a.cmd == 'build':
        build(a.data)
    else:
        if not a.query:
            sys.exit('検索語を指定してください')
        for r in search(a.data, a.query, a.species, a.k):
            print(json.dumps(r, ensure_ascii=False))


if __name__ == '__main__':
    main()
