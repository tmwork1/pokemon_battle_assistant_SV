# -*- coding: utf-8 -*-
'''
わざ一覧を取得する
'''

import requests
import re


url = "https://gamewith.jp/pokemon-sv/article/show/374194"
data = requests.get(url).text

# with open('log/move.html, 'w', encoding='UTF-8') as f:
#     f.write(html.text)
#     f.close()
    
names = re.findall("data-name='[^']*'", data)
types = re.findall("data-type='[^']*'", data)
classes = re.findall("data-class='[^']*'", data)
powers = re.findall("data-pw='[^']*'", data)
hits = re.findall("data-hit='[^']*'", data)
pps = re.findall("data-pp='[^']*'", data)

with open('move.txt', 'w') as f:
    f.write('Name\tType\tClass\tPower\tHit\tPP\n')
    for i in range(len(names)):
        name = names[i].replace("data-name='", "")
        name = name.replace("'", "")
        print(name, end='')
        
        type_ = types[i].replace("data-type='", "")
        type_ = type_.replace("'", "")
        if type_ not in ['ノーマル','ほのお','みず','でんき','くさ','こおり','かくとう','どく','じめん','ひこう','エスパー','むし','いわ','ゴースト','ドラゴン','あく','はがね','フェアリー']:
            type_ = 'ノーマル'

        class_ = classes[i].replace("data-class='", "")
        class_ = class_.replace("'", "")
        if class_ not in ['物理','特殊','変化']:
            class_ = '変化'

        power = powers[i].replace("data-pw='", "")
        power = power.replace("'", "")
        if not power.isdigit():
            power = '0'

        hit = hits[i].replace("data-hit='", "")
        hit = hit.replace("'", "")
        if not hit.isdigit():
            hit = '100'

        pp = pps[i].replace("data-pp='", "")
        pp = pp.replace("'", "")
        if not pp.isdigit():
            pp = '100'
        
        f.write(name+'\t'+type_+'\t'+class_+'\t'+power+'\t'+hit+'\t'+pp+'\n')
        print('\t'+type_+'\t'+class_+'\t'+power+'\t'+hit+'\t'+pp) 