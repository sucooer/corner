#!/usr/bin/env python3
"""重新生成中文字体子集 fonts/nekotora.pingfang.subset.woff2

什么时候需要跑：页面新增了静态中文文案（新板块、新链接名、新 slogan 等）。
不跑的后果：新出现的字符不在子集里，浏览器会回退到系统字体（PingFang / 微软雅黑），
          同一段文字里新旧字形混排。注意歌名/歌词是接口返回的动态文本，
          本来就走系统字体，不在子集覆盖范围内。

依赖：pip install fonttools brotli
用法：在仓库根目录执行
      python tools/build-font-subset.py
"""
import glob
import os
import sys

from fontTools.subset import main as subset_main
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SRC = 'fonts/nekotora.pingfang.woff2'
OUT = 'fonts/nekotora.pingfang.subset.woff2'
CHARS = '.font-subset-chars.txt'

# 1) 收集页面实际用到的字符：HTML + JS 里的文案（slogan 等都在 JS 中）
chars = set()
for fp in ['index.html', '404.html'] + sorted(glob.glob('js/*.js')):
    with open(fp, encoding='utf-8', errors='ignore') as f:
        chars.update(f.read())

# 2) 补齐 ASCII、常用标点与全角符号，避免小改动就缺字
chars.update(''.join(chr(c) for c in range(0x20, 0x7F)))
chars.update('　、。，．；：？！…—～·「」『』（）【】《》〈〉“”‘’')
chars.update('％＃＠＆＊＋－／＝＜＞±×÷°′″℃￥§№')
chars.update('①②③④⑤⑥⑦⑧⑨⑩')

with open(CHARS, 'w', encoding='utf-8') as f:
    f.write(''.join(sorted(chars)))

# 3) 生成 woff2 子集
subset_main([
    SRC,
    '--text-file=' + CHARS,
    '--flavor=woff2',
    '--output-file=' + OUT,
    '--layout-features=',
    '--no-hinting',
    '--desubroutinize',
    '--drop-tables+=DSIG,LTSH,VDMX,hdmx',
])
os.remove(CHARS)

# 4) 报告：哪些页面字符是原字体本来就没有的（一直靠系统字体兜底，属正常）
available = set(chr(c) for c in TTFont(SRC).getBestCmap())
missing = sorted(c for c in chars if c not in available)

print('charset  :', len(chars))
print('orig     : %d bytes' % os.path.getsize(SRC))
print('subset   : %d bytes' % os.path.getsize(OUT))
print('saved    : %.1f%%' % (100 - os.path.getsize(OUT) / os.path.getsize(SRC) * 100))
if missing:
    print('note     : 原字体本身不含这些字符（仍走系统字体）:', ''.join(missing))
