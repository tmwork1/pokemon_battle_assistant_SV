import requests
import json
import os
import copy


# 取得するシーズン（最新: 0, 前シーズン: 1, 前前シーズン: 2, ...）
target_season = 0

# 取得するルール（シングル: 0, ダブル: 1）
target_rule = 0


dir = os.path.dirname(__file__)

# デコードデータの読み込み
names, types, moves, items, abilities = {}, {}, {}, {}, {} 
with open(dir+'/codelist/name_code.json', encoding='UTF-8') as fin:
    names = json.load(fin)
with open(dir+'/codelist/type_code.json', encoding='UTF-8') as fin:
    types = json.load(fin)
with open(dir+'/codelist/move_code.json', encoding='UTF-8') as fin:
    moves = json.load(fin)
with open(dir+'/codelist/item_code.json', encoding='UTF-8') as fin:
    items = json.load(fin)
with open(dir+'/codelist/ability_code.json', encoding='UTF-8') as fin:
    abilities = json.load(fin)

headers = {
    'accept': 'application/json, text/javascript, */*; q=0.01',
    'countrycode': '304',
    'authorization': 'Bearer',
    'langcode': '1',
    'user-agent': 'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Mobile Safari/537.36',
    'content-type': 'application/json',
}

# シーズン情報を取得
data = '{"soft":"Sw"}'
#url = 'https://api.battle.pokemon-home.com/cbd/competition/rankmatch/list' #剣盾
url = 'https://api.battle.pokemon-home.com/tt/cbd/competition/rankmatch/list' #SV
response = requests.post(url, headers=headers, data=data)
with open(dir+'/raw/season.json', 'w', encoding='UTF-8') as fout:
    fout.write(response.text)
with open(dir+'/raw/season.json', encoding = 'utf-8') as fin:
    data = json.load(fin)['list']

current_season = list(data.keys())[target_season]

terms = []
for season in data:
    for id in data[season]:
        if data[season][id]['rule'] == target_rule:
            terms.append({'id': id, 'rst': data[season][id]['rst'], 'ts1': data[season][id]['ts1'], 'ts2': data[season][id]['ts2']})

term = terms[target_season]
id = str(term['id'])
rst = str(term['rst'])
ts1 = str(term['ts1'])
ts2 = str(term['ts2'])
headers = {
    'user-agent': 'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Mobile Safari/537.36',
    'content-type': 'application/json',
}

# ポケモンの使用率を取得
#url = 'https://resource.pokemon-home.com/battledata/ranking/'+id+'/'+rst+'/'+ts2+'/pokemon' # 剣盾
url = 'https://resource.pokemon-home.com/battledata/ranking/scvi/'+id+'/'+rst+'/'+ts2+'/pokemon' # SV
response = requests.get(url, headers=headers)
with open(dir+'/raw/pokemon_ranking.json', 'w', encoding='UTF-8') as fout:
    fout.write(response.text)

ranking = []
with open(dir+'/raw/pokemon_ranking.json', encoding='UTF-8') as fin:
    data = json.load(fin)
    for i,d in enumerate(data):
        ranking.append(names[str(d['id'])][str(d['form'])])

# 技や持ち物などの採用率を取得
adoption = {}

for x in range(1,7):
    #url = 'https://resource.pokemon-home.com/battledata/ranking/'+id+'/'+rst+'/'+ts2+'/pdetail-'+str(x) # 剣盾
    url = 'https://resource.pokemon-home.com/battledata/ranking/scvi/'+id+'/'+rst+'/'+ts2+'/pdetail-'+str(x) # SV
    response = requests.get(url, headers=headers)
    with open(dir+'/raw/pokemon'+str(x)+'.json', 'w', encoding='UTF-8') as fout:
        fout.write(response.text)
    
    # デコード
    with open(dir+'/raw/pokemon'+str(x)+'.json', encoding='UTF-8') as fin:
        data = json.load(fin)
        for zukan_num in data:
            for form_num in data[zukan_num]:
                name = names[zukan_num][form_num]
                adoption[name] = {}

                # わざ採用率
                adoption[name]['move'] = [[], []]
                for d in data[zukan_num][form_num]['temoti']['waza']:
                    adoption[name]['move'][0].append(moves[str(d['id'])])
                    adoption[name]['move'][1].append(float(d['val']))

                # 特性採用率
                adoption[name]['ability'] = [[], []]
                for d in data[zukan_num][form_num]['temoti']['tokusei']:
                    adoption[name]['ability'][0].append(abilities[str(d['id'])])
                    adoption[name]['ability'][1].append(float(d['val']))
                
                # もちもの採用率
                adoption[name]['item'] = [[], []]
                for d in data[zukan_num][form_num]['temoti']['motimono']:
                    adoption[name]['item'][0].append(items[str(d['id'])])
                    adoption[name]['item'][1].append(float(d['val']))
                
                # テラスタイプ採用率
                adoption[name]['Ttype'] = [[], []]
                for d in data[zukan_num][form_num]['temoti']['terastal']:
                    adoption[name]['Ttype'][0].append(types[str(d['id'])])
                    adoption[name]['Ttype'][1].append(float(d['val']))

for name in adoption:
    if name not in ranking:
        ranking.append(name)

# 使用率順にソート
adoption2 = {}

for name in ranking:
    adoption2[name] = copy.deepcopy(adoption[name])
    print(name)

    if name == 'オーガポン':
        _ablities = ['かたやぶり','ちょすい','がんじょう']
        _items = ['かまどのめん','いどのめん','いしずえのめん']
        _Ttypes = ['ほのお','みず','いわ']
        # 草
        adoption2[name]['ability'][0] = ['まけんき']
        adoption2[name]['ability'][1] = [adoption[name]['ability'][1][adoption[name]['ability'][0].index('まけんき')]]
        adoption2[name]['Ttype'][0] = ['くさ']
        adoption2[name]['Ttype'][1] = [100]
        adoption2[name]['item'][0] = []
        adoption2[name]['item'][1] = []
        for j, item in enumerate(adoption[name]['item'][0]):
            if item not in _items:
                adoption2[name]['item'][0].append(item)
                adoption2[name]['item'][1].append(adoption[name]['item'][1][j])
        total = sum(adoption2[name]['item'][1])
        for j in range(len(adoption2[name]['item'][1])):
            adoption2[name]['item'][1][j] = round(adoption2[name]['item'][1][j]/total*100, 1)

        # 草以外
        for j, s in enumerate(['オーガポン(かまど)','オーガポン(いど)','オーガポン(いしずえ)']):
            adoption2[s] = copy.deepcopy(adoption[name])
            adoption2[s]['ability'][0] = [_ablities[j]]
            adoption2[s]['ability'][1] = [adoption[name]['ability'][1][adoption[name]['ability'][0].index(_ablities[j])]]
            adoption2[s]['item'][0] = [_items[j]]
            adoption2[s]['item'][1] = [100]
            adoption2[s]['Ttype'][0] = [_Ttypes[j]]
            adoption2[s]['Ttype'][1] = [100]

with open(dir+'/battle_data/season'+str(current_season)+'.json', 'w', encoding='UTF-8') as fout:
    json.dump(adoption2, fout, ensure_ascii=False)