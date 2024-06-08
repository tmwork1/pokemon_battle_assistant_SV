# -*- coding: utf-8 -*-
'''
ポケモンのタイプやステータスなどの情報を取得する
'''

import requests
import re
import cv2
import numpy as np
import os

def imread(filename, flags=cv2.IMREAD_COLOR, dtype=np.uint8):
    try:
        n = np.fromfile(filename, dtype)
        img = cv2.imdecode(n, flags)
        return img
    except Exception as e:
        print(e)
        return None
    
def imwrite(filename, img, params=None):
    try:
        ext = os.path.splitext(filename)[1]
        result, n = cv2.imencode(ext, img, params)

        if result:
            with open(filename, mode='w+b') as f:
                n.tofile(f)
            return True
        else:
            return False
    except Exception as e:
        print(e)
        return False

def block_trim(img, thr=255):
    h, w = img.shape[0], img.shape[1]
    w_min, w_max, h_min, h_max = int(w*0.5), int(w*0.5), int(h*0.5), int(h*0.5)
    for h in range(len(img)):
        for w in range(len(img[0])):
            if img[h][w][0]<thr or img[h][w][1]<thr or img[h][w][2]<thr:
                w_min = min(w_min, w)
                w_max = max(w_max, w)
                h_min = min(h_min, h)
                h_max = max(h_max, h)

    return img[h_min:h_max+1, w_min:w_max+1]


url = "https://gamewith.jp/pokemon-sv/article/show/375426" #全国
data = requests.get(url).text

# with open('log/zukan.html', 'w', encoding='UTF-8') as f:
#     f.write(data)
#     f.close()
    
data = re.sub('data-moves=".*?"', '', data)

# 特性　<-> 数字の対応付け（辞書型）
abilities = re.findall('{id:"[^"]*",name:"[^"]*"', data)
d_ability = {}
for s in abilities:
    ret = re.search('\d+', s)
    i = ret.group()
    ret = re.search('"[^"]+"', s[10:])
    ability = ret.group().replace('"', '')
    d_ability[i] = ability

# 図鑑情報の取得
libnums = re.findall('data-no1="[^"]*"', data)
names = re.findall('data-name="[^"]*"', data)
type1s = re.findall('data-type1="[^"]*"', data)
type2s = re.findall('data-type2="[^"]*"', data)
bases = re.findall('data-base="[^"]*"', data)
abilities = re.findall("data-chara='[^']*'  data-dream=[^\s]*|data-chara='[^']*'", data)
pngs = re.findall('data-thumb=".*?.png', data)

with open('zukan.txt', 'w', encoding='UTF-8') as f:
    f.write('Num\tName\tType1\tType2\tAbility1\tAbility2\tAbility3\tAbility4\tBase H\tBase A\tBase B\tBase C\tBase D\tBase S\n')              
    for i in range(len(libnums)):
        libnum = libnums[i].replace('data-no1="', '')
        libnum = libnum.replace('"', '')
        libnum = libnum.replace('?', '0')
        libnum = libnum.replace('.', '-')
        
        name = names[i].replace('data-name="', '')
        name = name.replace('"', '')
        
        # 見た目のみが異なるポケモンの重複を避ける
        if name == 'イワンコ(マイペース)':
            continue

        if 'キジカ' in name:
            if 'はる' in name:
                name = name.replace('(はるのすがた)', '')
            else:
                continue
        
        if 'カエンジシ' in name:
            if 'オス' in name:
                name = 'カエンジシ'
            else:
                continue

        if 'がんさくフォルム' in name:
            name = name.replace('(がんさくフォルム)', '')
        elif 'しんさくフォルム' in name:
            continue

        if 'カバルドン' in name:
            if 'オス' in name:
                name = 'カバルドン'
            else:
                continue
        
        if 'にしのうみ' in name:
            name = name.replace('(にしのうみ)', '')
        elif 'ひがしのうみ' in name:
            continue                

        if 'シャリタツ' in name:
            if 'そった' in name:
                name = 'シャリタツ'
            else:
                continue
        
        if 'マガイモノのすがた' in name:
            name = name.replace('(マガイモノのすがた)', '')
        elif 'タカイモノのすがた' in name:
            continue

        if 'ボンサクのすがた' in name:
            name = name.replace('(ボンサクのすがた)', '')
        elif 'ケッサクのすがた' in name:
            continue
        
        # 名前の修正
        name = name.replace('のすがた)', ')')
        name = name.replace('フォルム)', ')')
        name = name.replace('スタイル)', ')')
        name = name.replace('すじ)', ')')
        name = name.replace('フェイス)', ')')
        name = name.replace('(通常)', '')
        name = name.replace('のゆうしゃ)', ')')
        name = name.replace('もよう)', ')')
        name = name.replace('のめん)', ')')
        name = name.replace('のたてがみ)', ')')
        name = name.replace('のつばさ)', ')')
        
        # 図鑑番号の修正
        if 'ウーラオス' in name:
            libnum = '892' if 'いちげき' in name else '892-1'
                
        if 'オーガポン' in name:
            if name == 'オーガポン(かまど)':
                libnum = '1017-2'
            elif name == 'オーガポン(いど)':
                libnum = '1017-1'

        if libnum == '11111':
            if name == 'ガチグマ(アカツキ)':
                libnum = '901-1'
            elif name == 'テラパゴス(ノーマル)':
                libnum = '1024'
            elif name == 'テラパゴス(テラスタル)':
                libnum = '1024-1'
            elif name == 'テラパゴス(ステラ)':
                libnum = '1024-2'
            elif name == 'モモワロウ':
                libnum = '1025'
                            
        if 'バドレックス(' in name:
            libnum = '898-2' if 'こくば' in name else '898-1'
       
        type1 = type1s[i].replace('data-type1="', '')
        type1 = type1.replace('"', '')

        type2 = type2s[i].replace('data-type2="', '')
        type2 = type2.replace('"', '')
        if type2 == '':
            type2 = '-'
            
        base = bases[i].replace('data-base="', '')
        base = base.replace('"', '')
        base = base.split('-')
        
        ability = []

        #　夢特性あり
        if 'dream' in abilities[i]:
            a = abilities[i].split('  ')
            ids = re.search('\d+,?\d*', a[0]).group()
            #　通常特性
            if ',' in ids:
                ids = ids.split(',')
                for id_ in ids:
                    ability.append(d_ability[id_])
            else:
                ability.append(d_ability[ids])

            #　夢特性
            id_ = re.search("\d+", a[1]).group()
            ability.append(d_ability[id_])

        #　夢特性なし
        else:
            a = abilities[i]
            ids = re.search('\d+,?\d*', a).group()
            if ',' in ids:
                ids = ids.split(',')
                for id_ in ids:
                    ability.append(d_ability[id_])
            else:
                ability.append(d_ability[ids])
        
        if name=='イワンコ':
            ability.append('マイペース')           
        
        for j in range(4-len(ability)):
                ability.append('-')
                  
        f.write(libnum+'\t'+name+'\t'+type1+'\t'+type2+'\t'+'\t'.join(ability)+'\t'+'\t'.join(base)+'\n')

        # テンプレート画像の生成
        pngnum = pngs[i].replace('data-thumb="', '')
        pngnum = pngnum.replace('.png', '')
        url = 'http://img.gamewith.jp/article_tools/pokemon-sv/gacha/'+pngnum+'.png'
        filename = 'template/org/%s.png' % name
        with open(filename, 'wb') as f2:
            f2.write(requests.get(url).content)           

        img = imread(filename)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        ret, binary = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
        img[binary==0] = 255
        img = block_trim(img, thr=230)
        imwrite(filename, img)

        print(libnum+'\t'+name+'\t'+type1+'\t'+type2+'\t'+'\t'.join(ability)+'\t'+'\t'.join(base))