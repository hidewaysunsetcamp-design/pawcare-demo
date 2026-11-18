"""index.html のタグ対応を検査する簡易HTMLバリデータ"""
import sys
from html.parser import HTMLParser
VOID = {'meta','link','img','input','br','hr','source','area','base','col','embed','track','wbr'}
class P(HTMLParser):
    def __init__(s): super().__init__(); s.stack=[]; s.errors=[]
    def handle_starttag(s,t,a):
        if t not in VOID: s.stack.append((t,s.getpos()))
    def handle_endtag(s,t):
        if t in VOID: return
        if not s.stack or s.stack[-1][0]!=t: s.errors.append(f'行{s.getpos()[0]}: </{t}> の対応が不正 (開いているタグ: {s.stack[-1][0] if s.stack else "なし"})'); return
        s.stack.pop()
p=P(); p.feed(open(sys.argv[1],encoding='utf-8').read()); p.close()
for t,pos in p.stack: p.errors.append(f'行{pos[0]}: <{t}> が閉じられていません')
if p.errors: print('NG: HTML構文\n'+'\n'.join(p.errors)); sys.exit(1)
print('OK: HTMLタグの対応')
