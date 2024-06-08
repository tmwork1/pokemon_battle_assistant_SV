# -*- coding: utf-8 -*-
'''
接触技の一覧を取得する
'''

import requests
import re


url = "https://gamewith.jp/pokemon-sv/article/show/379899"
data = requests.get(url).data
# with open('log/contact_move.html', 'w', encoding='UTF-8') as f:
#     f.write(data)
#     f.close()
    
names = re.findall("data-name='[^']*'", data)

with open('contact_move.txt', 'w') as f:
    for i in range(len(names)):
        name = names[i].replace("data-name='", "")
        name = name.replace("'", "")
        f.write(name+'\n')                       
        print(name)                       