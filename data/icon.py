# -*- coding: utf-8 -*-
'''
ポケモンのアイコン画像を取得する
'''

import requests
import re
import base64
import svgwrite


with open('zukan.txt', encoding='UTF-8') as f:
    next(f)
    count = 0
    
    for line in f:
        count += 1
        
        data = line.split('\t')
        zukanNum = data[0]
        name = data[1]
        
        if zukanNum in ['801-1', '893-1']: #マギアナ,ザルード
            continue
        
        num = int(zukanNum.split('-')[0])
        
        if num < 10:
            url = "https://zukan.pokemon.co.jp/detail/000%s" % zukanNum
        elif num < 100:
            url = "https://zukan.pokemon.co.jp/detail/00%s" % zukanNum
        elif num < 1000:
            url = "https://zukan.pokemon.co.jp/detail/0%s" % zukanNum
        else:
            url = "https://zukan.pokemon.co.jp/detail/%s" % zukanNum
        
        data = requests.get(url).text
    
        matchObj = re.search('"image_m":".*?"', data)
        url = matchObj.group()[11:-1]
        url = url.replace('\/', '/')

        print('%d %s %s' % (count, name, url))
        
        filename = 'icon/org/%s' % name
        pngfile = requests.get(url).content
        
        with open(filename+'.png', 'wb') as f1:
            f1.write(pngfile)
        
        img = base64.b64encode(pngfile)
        dwg = svgwrite.Drawing(filename+'.svg')
        dwg.add(dwg.image('data:image/png;base64,' + img.decode("ascii"), size=(570, 570)))
        dwg.save()
    