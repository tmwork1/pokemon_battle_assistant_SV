// ポケモンのダメージ計算、
import {
    roundHalfDown, levenshteinDistance, toKatakana,
} from './common.js';

const NEW_LINE_CODE = '\n'; // \n: Unix,Mac. \r\n: Windows

function push(dict, key, value) {
    if (!(key in dict)) {
        dict[key] = value;
    } else {
        dict[key] += value;
    }
}
// HPからダメージを引く
function crossSubtract(hpDict, damageDict, maxHP=-1) {
    let resultHp = {}, resultDamage = {}, reduced = false;
    Object.keys(hpDict).sort().forEach((hp, i) => {
        for (let damage in damageDict) {
            let r = (Number(hp) == maxHP) ? 0.5 : 1; // 0.5: マルチスケイル
            if (r == 0.5) { reduced = true; }
            let d = Math.trunc(Number(damage)*r);
            let key = String(Math.max(0, String(Number(hp) - d))) + (hp.slice(-2) == '.0' ? '.0' : '');
            push(resultHp, key, hpDict[hp]*damageDict[damage]);
            if (i==0) { resultDamage[d] = damageDict[damage]; }
        }
    });
    return [resultHp, resultDamage, reduced];
}
// 2個の連想配列(HP,ダメージ)の総組み合わせ加算
function crossSum(dict1, dict2) {
    let result = {};
    for (let key1 in dict1) {
        for (let key2 in dict2) {
            let key = String(Number(key1) + Number(key2));
            push(result, key, dict1[key1]*dict2[key2]);
        }
    }
    return result;
}
// 要素が0の割合を返す
function zeroRatio(dict) {
    let n = 0;
    let nZero = 0;
    for (let key in dict) {
        n += dict[key];
        if (Number(key)==0) { nZero += dict[key]; }
    }
    return nZero/n;
}
// HPやダメージに定数を足す
function offsetKeys(dict, v) {
    let result = {};
    let newKey;
    for (let key in dict) {
        newKey = String(Math.max(0, Number(key) + v));
        if (newKey != '0' && key.slice(-2) == '.0') { newKey += '.0' }
        result[newKey] = dict[key];
    }
    return result;
}
// HPやダメージに定数倍する
function multiplyKeys(dict, v) {
    let result = {};
    for (let key in dict) {
        result[String(Number(key)*v)] = dict[key];
    }
    return result;
}

// ポケモンの個体を扱うクラス
export class Pokemon {
    static zukan = {};
    static zukanName = {}; // key: ポケモン表示名, value: 図鑑登録名
    static formDiff = {}; // key: ポケモン表示名, value: フォルム違いの差分
    static battleData = {}; // ランクマッチの統計データ

    static typeFileCode = {}; // タイプ画像のデコード表
    static itemFileCode = {}; // アイテム画像のデコード表
    static iconFileCode = {}; // アイコン画像のデコード表
    static templateFileCode = {}; // テンプレート画像のデコード表

    static foreignNames = {}; // key: ポケモン表示名, value: 外国語名
    
    static abilities = []; // 全特性
    static natureCorrections = {}; // 性格補正
    static typeCorrections = []; // タイプ倍率
    static typeID = {}; // key:type, value:number
    static typeColor = {}; // key: タイプ, value: 色

    static items = {}; // 全アイテム
    static typeBuffItems = {}; // タイプ強化アイテム
    static halfFruits = {}; // タイプ半減実   

    static ailments = ['どく','まひ','やけど','ねむり'];
    static weathers = ['はれ','あめ','すなあらし','ゆき'];
    static fields = ['エレキフィールド','グラスフィールド','サイコフィールド','ミストフィールド'];
    
    static moves = {}; // 全わざ
    static contactMoves = []; // 接触技
    static chikarazukuMoves = []; // ちからずく適用技
    static comboMoves = {}; // key: 連続技, value: [minHit, maxHit]
    static criticalMoves = ['やまあらし','こおりのいぶき','トリックフラワー','あんこくきょうだ','すいりゅうれんだ'];
    static soundMoves = ['いびき','うたかたのアリア','エコーボイス','さわぐ','スケイルノイズ','チャームボイス','バークアウト',
                        'ハイパーボイス','ばくおんぱ','むしのさざめき','りんしょう','オーバードライブ','ぶきみなじゅもん','フレアソング'];
    static punchMoves = ['アイスハンマー','アームハンマー','かみなりパンチ','きあいパンチ','グロウパンチ','コメットパンチ','シャドーパンチ',
                        'スカイアッパー','ドレインパンチ','ばくれつパンチ','バレットパンチ','ピヨピヨパンチ','プラズマフィスト','ほのおのパンチ',
                        'マッハパンチ','メガトンパンチ','れいとうパンチ','れんぞくパンチ','ダブルパンツァー','あんこくきょうだ','すいりゅうれんだ',
                        'ぶちかまし','ジェットパンチ','ふんどのこぶし']
    static varPowMoves = ['アクロバット','からげんき','しおみず','しっぺがえし','Gのちから','たたりめ','はたきおとす',
                        'ひゃっきやこう','ベノムショック','ゆきなだれ','リベンジ']
    static moldBreakers = ['かたやぶり','ターボブレイズ','テラボルテージ']
    static multiScales = ['マルチスケイル','ファントムガード','テラスシェル']

    constructor(name='') {
        this.name = name;
        this.nickname = '';
        this.displayName = ''; // 表示名
        this.level = 50;
        this.sex = '';
        this.weight = 0;
        this.nature = 'まじめ';
        this.type = ['', ''];
        this.ability = '';
        this.item = '';
        this.Ttype = ''; // テラスタイプ
        this.status = [0, 0, 0, 0, 0, 0];
        this.base = [0, 0, 0, 0, 0, 0]; // 種族値
        this.indiv = [31, 31, 31, 31, 31, 31]; // 個体値
        this.effort = [0, 0, 0, 0, 0, 0]; // 努力値
        this.move = ['', '', '', '']; // 技
        this.rank = [0, 0, 0, 0, 0, 0, 0, 0]; // H,A,B,C,D,S,命中,回避
        this.ailment = ''; // 状態異常
        this.terastal = false; // true: テラスタルON
        this.oikaze = false; // true: 追い風
        this.hasItem = true; // true: アイテム保持
        this.hp = 0;
        this.selected = false; // true: 選出済み
        this.description = ''; // 育成メモ
    }
    // ポケモンを複製する
    clone(initProperties = {}) {
        let pokemon = new Pokemon();
        for (let key in pokemon) {
            pokemon[key] = (Array.isArray(this[key])) ? this[key].slice() : this[key];
        }
        for (let key in initProperties) {
            pokemon[key] = initProperties[key];
        }
        return pokemon;        
    }
    // 外部ファイルを読み込んで初期化する
    static async init() {
        console.log('Pokemonを初期化中...');
        // 現シーズンの取得
        let now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth()+1;
        let date = now.getDate();
        const season = Math.max(1, 12*(year-2022)+month-11-(date==1));

        const urls = [
            'data/type_img/codelist.txt',
            'data/item_img/codelist.txt',
            'data/icon/codelist.txt',
            'data/template/codelist.txt',
            'data/zukan.txt',
            'data/foreign_name.txt',
            'data/weight.txt',
            'data/item.txt',
            'data/move.txt',
            'data/contact_move.txt',
            'data/chikarazuku_move.txt',
            'data/combo_move.txt',
            'data/nature.txt',
            'data/type.txt',
            `data/battle_data/season${season}.json`,
        ]
        const responses = await Promise.all(urls.map(url => fetch(url)));
        // タイプ画像コードの読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            let data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            for (let line of lines) {
                const words = line.split('\t');
                if(!words[0]) break;
                Pokemon.typeFileCode[words[1]] = words[0];
            }
            //console.log(Object.keys(Pokemon.typeFileCode));
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // アイテム画像コードの読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            let data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            for (let line of lines) {
                const words = line.split('\t');
                if(!words[0]) break;
                Pokemon.itemFileCode[words[1]] = words[0];
            }
            //console.log(Pokemon.itemFileCode);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // アイコン画像コードの読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            let data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            for (let line of lines) {
                const words = line.split('\t');
                if(!words[0]) break;
                Pokemon.iconFileCode[words[1]] = words[0];
            }
            //console.log(Pokemon.iconFileCode);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // テンプレート画像のファイルコードの読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            for (let line of lines) {
                const words = line.split('\t');
                if(!words[0]) break;
                Pokemon.templateFileCode[words[1]] = words[0];
            }
            //console.log(Pokemon.templateFileCode);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // 図鑑の読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            lines.shift();
            for (let line of lines) {
                const words = line.split('\t');
                const name = words[1];
                if (name == undefined || name == '') { break; }
                Pokemon.zukan[name] = {};
                Pokemon.zukan[name]['type'] = words.slice(2,4).filter(function(s) { return s != '-'; });
                Pokemon.zukan[name]['ability'] = words.slice(4,8).filter(function(s) { return s != '-'; });
                Pokemon.zukan[name]['base'] = words.slice(8,14).map((s) => Number(s));
                for (let s of Pokemon.zukan[name]['ability']) {
                    if (!Pokemon.abilities.includes(s)) {　Pokemon.abilities.push(s);　}
                }

                // 表示名の設定
                let displayName = name;
                if (name.includes('ロトム')) {
                    displayName = 'ロトム';
                } else {
                    if (name.includes('(')) {
                        displayName = name.slice(0, name.indexOf('('));
                    }
                    displayName = displayName.replace('パルデア','');
                    displayName = displayName.replace('ヒスイ','');
                    displayName = displayName.replace('ガラル','');
                    displayName = displayName.replace('アローラ','');
                }
                Pokemon.zukan[name].displayName = displayName;
                
                if (!(displayName in Pokemon.zukanName)) {
                    Pokemon.zukanName[displayName] = [name];
                } else if (!Pokemon.zukanName[displayName].includes(name)) {
                    Pokemon.zukanName[displayName].push(name);
                    // フォルム違いの差分を記録
                    for (let key of ['type', 'ability']) {
                        if (JSON.stringify(Pokemon.zukan[Pokemon.zukanName[displayName][0]][key]) != JSON.stringify(Pokemon.zukan[name][key])) {
                            Pokemon.formDiff[displayName] = key;
                            break;
                        }
                    }
                }               
            }
            //console.log(Pokemon.zukan);
            //console.log(Pokemon.abilities);
            //console.log(Pokemon.zukanName);
            //console.log(Pokemon.formDiff);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // 外国語名の読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            lines.shift();
            for (let line of lines) {
                let words = line.split('\t');
                const name = words.shift();
                if (name == undefined || name == '') { break; }
                Pokemon.foreignNames[name] = name;
                for (let s of words) {
                    Pokemon.foreignNames[s] = name;
                }
            }
            //console.log(Pokemon.foreignNames);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // 体重の読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            lines.shift();
            for (let line of lines) {
                let words = line.split('\t');
                const name = words[0];
                if (name == undefined || name == '') { break; }
                Pokemon.zukan[name].weight = Number(words[1]);
            }
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // アイテムの読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            lines.shift();
            for (let line of lines) {
                let words = line.split('\t');
                const name = words[0];
                if (name == undefined || name == '') { break; }
                Pokemon.items[name] = {
                    power : Number(words[1]), // なげつける威力
                };
                if (words[2] != '-') {
                    Pokemon.typeBuffItems[name] = words[2];
                }
                if (words[3] != '-') {
                    Pokemon.halfFruits[name] = words[3];
                }
            }
            //console.log(Pokemon.items);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // 技の読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            lines.shift();
            for (let line of lines) {
                let words = line.split('\t');
                const name = words[0];
                if (name == undefined || name == '') { break; }
                Pokemon.moves[name] = {
                    'type' : words[1], // タイプ
                    'class' : words[2], // 物理・特殊・変化
                    'power' : Number(words[3]), // 威力
                    'hit' : Number(words[4]), // 命中率
                    'pp' : Number(words[5]) // PP
                };
            }
            // 威力変動技の初期化
            Pokemon.moves['ジャイロボール']['power'] = 1;
            Pokemon.moves['エレキボール']['power'] = 1;
            Pokemon.moves['けたぐり']['power'] = 1;
            Pokemon.moves['くさむすび']['power'] = 1;
            Pokemon.moves['ヘビーボンバー']['power'] = 1;
            Pokemon.moves['ヒートスタンプ']['power'] = 1;
            Pokemon.moves['なげつける']['power'] = 1;
            //console.log(Pokemon.moves);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // 接触技の読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            for (let line of lines) {
                let words = line.split('\t');
                const name = words[0];
                if (name == undefined || name == '') { break; }
                Pokemon.contactMoves.push(name);
            }
            //console.log(Pokemon.contactMoves);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // ちからずく適用技の読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            for (let line of lines) {
                let words = line.split('\t');
                const name = words[0];
                if (name == undefined || name == '') { break; }
                Pokemon.chikarazukuMoves.push(name);
            }
            //console.log(Pokemon.chikarazukuMoves);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // 連続技の読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            for (let line of lines) {
                let words = line.split('\t');
                const name = words[0];
                if (name == undefined || name == '') { break; }
                Pokemon.comboMoves[name] = [Number(words[1]), Number(words[2])];
            }
            //console.log(Pokemon.comboMoves);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // 性格補正の読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            for (let line of lines) {
                let words = line.split(' ');
                const name = words.shift();
                if (name == undefined || name == '') { break; }
                Pokemon.natureCorrections[name] = words.map((s) => Number(s));
            }
            //console.log(Pokemon.natureCorrections);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // タイプ相性補正の読み込み
        try {
            const response = responses.shift();
            if (!response.ok) {
                throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
            }
            const data = await response.text();
            let lines = data.split(NEW_LINE_CODE);
            const words = lines.shift().split('\t');
            for (let i=0; i<words.length; i++) {
                Pokemon.typeID[words[i].replace('\r','')] = i;
            }
            for (let line of lines) {
                Pokemon.typeCorrections.push(line.split('\t').map((s) => Number(s)));
            }
            //console.log(Pokemon.typeID);
            //console.log(Pokemon.typeCorrections);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
        // タイプ色
        this.typeColor['ノーマル'] = '#666666';
        this.typeColor['ほのお'] = '#ff6600';
        this.typeColor['みず'] = '#4689ff';
        this.typeColor['くさ'] = '#009966';
        this.typeColor['でんき'] = '#ffcc66';
        this.typeColor['こおり'] = '#6495ed';
        this.typeColor['かくとう'] = this.typeColor['ほのお'];
        this.typeColor['どく'] = '#cc66ff';
        this.typeColor['じめん'] = '#cd853f';
        this.typeColor['ひこう'] = this.typeColor['こおり'];
        this.typeColor['エスパー'] = '#ff6699';
        this.typeColor['むし'] = this.typeColor['くさ'];
        this.typeColor['いわ'] = this.typeColor['じめん'];
        this.typeColor['ゴースト'] = '#663399';
        this.typeColor['ドラゴン'] = this.typeColor['どく'];
        this.typeColor['あく'] = '#222222';
        this.typeColor['はがね'] = this.typeColor['ノーマル'];
        this.typeColor['フェアリー'] = this.typeColor['エスパー'];
        this.typeColor['ステラ'] = this.typeColor['あく'];
        // ランクマッチの統計データの読み込み
        try {
            let response = responses.shift();
            if (!response.ok) {
                // 読み込みに失敗した場合は前シーズンを参照する
                console.warn(`シーズン${season}の統計データを取得できませんでした。シーズン${season-1}を参照します。`);
                response = await fetch(`data/battle_data/season${season-1}.txt`);
                if (!response.ok) {
                    console.warn(`シーズン${season-1}の統計データを取得できませんでした。`);
                    throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`);
                }
            }
            const data = await response.text();
            let adoption = JSON.parse(data);
            for (let name in adoption) {
                Pokemon.battleData[name] = {}
                Pokemon.battleData[name]['move'] = adoption[name]['move']
                Pokemon.battleData[name]['ability'] = adoption[name]['ability']
                Pokemon.battleData[name]['item'] = adoption[name]['item']
                Pokemon.battleData[name]['Ttype'] = adoption[name]['Ttype']
            }
            //console.log(Object.keys(Pokemon.battleData));
            console.log(`Pokemonを初期化しました`);
        } catch(e) {
            console.error(`${e.name}: ${e.message}`);
        }
    }
    // 図鑑情報を取得する
    loadZukan() {
        if (this.name in Pokemon.zukan) {
            this.displayName = Pokemon.zukan[this.name].displayName;
            this.type = Pokemon.zukan[this.name]['type'];
            this.base = Pokemon.zukan[this.name]['base'];
            this.weight = Pokemon.zukan[this.name]['weight'];
        }
    }
    // ステータスを計算する
    updateStatus(resetHP=true) {
        if (this.name in Pokemon.zukan && this.nature in Pokemon.natureCorrections) {
            const nc = Pokemon.natureCorrections[this.nature];
            this.status[0] = Math.trunc((this.base[0]*2+this.indiv[0]+Math.trunc(this.effort[0]/4))*this.level/100)+this.level+10;
            for (let i=1; i<6; i++) {
                this.status[i] = Math.trunc((Math.trunc((this.base[i]*2+this.indiv[i]+Math.trunc(this.effort[i]/4))*this.level/100)+5)*nc[i]);
            }
            if (resetHP) {
                this.hp = this.status[0];
            }
            return true;
        } else {
            return false;
        }   
    }
    // ステータスから努力値を取得する
    getEffort(ind, status) {
        const nc = Pokemon.natureCorrections[this.nature];
        const efforts = [0].concat(Array.apply(null,new Array(32)).map(function(v,i){ return 4+(i*8);}));
        for (let effort of efforts) {
            let v = (ind == 0) ?
                Math.trunc((this.base[0]*2+this.indiv[0]+Math.trunc(effort/4))*this.level/100)+this.level+10 :
                Math.trunc((Math.trunc((this.base[ind]*2+this.indiv[ind]+Math.trunc(effort/4))*this.level/100)+5)*nc[ind]);
            if (v == status) { return effort; }
            if (effort == 0 && status < v) { break; }
        }
        return -1;
    }
    // ランク補正を取得する
    getRankCorrection(i) {
        if (this.rank[i] >= 0) {
            return (this.rank[i]+2)/2;
        } else {
            return 2/(2-this.rank[i]);
        }
    }
    // 実効素早さを取得する
    getEffSpeed(weather='') {
        let s = Math.trunc(this.status[5]*this.getRankCorrection(5));
        let r = 4096;
        if (this.ability=='ようりょくそ' && weather=='はれ'){
            r = Math.round(r*2);
        }
        if (this.ability=='すいすい' && weather=='あめ'){
            r = Math.round(r*2);
        }
        if (this.ability=='すなかき' && weather=='すなあらし'){
            r = Math.round(r*2);
        }
        if (this.ability=='ゆきかき' && weather=='ゆき'){
            r = Math.round(r*2);
        }
        if (this.ability=='かるわざ') {
            if (!(this.item in Pokemon.items) || !this.hasItem) {
                r = Math.round(r*2);
            }
        }
        if (this.ability=='はやあし' && Pokemon.ailments.includes(this.ailment)){
            r = Math.round(r*1.5);
        }
        if (this.item == 'こだわりスカーフ'){
            r = Math.round(r*1.5);
        }
        if (this.item == 'くろいてっきゅう'){
            r = Math.round(r*0.5);
        }
        if (this.oikaze) {
            r = Math.round(r*2);
        }
        s = roundHalfDown(s*r/4096);
        if (this.ailment == 'まひ' && this.ability != 'はやあし'){
            s = Math.trunc(s*0.5);
        }
        return s;
    }
    // 素早さ早見テキストを返す
    speedText(weather='', separator=' ') {
        this.nature = 'おくびょう';
        this.effort[5] = 252;
        this.updateStatus();
        let s1 = this.getEffSpeed(weather);
        this.nature = 'まじめ';
        this.updateStatus();
        let s2 = this.getEffSpeed(weather);
        this.effort[5] = 0;
        this.updateStatus();
        let s3 = this.getEffSpeed(weather);
        return `最速 ${s1}${separator}準速 ${s2}${separator}無振 ${s3}`;
    }
    // タイプ変動後のわざのタイプを返す
    getMoveType(move, weather='') {
        if (!(move in Pokemon.moves)) {
            return '';
        }
        let moveType = Pokemon.moves[move]['type'];
        if (move == 'テラバースト' && this.terastal) {
            return (Pokemon.typeID[this.Ttype]) ? this.Ttype : 'ノーマル';
        }
        if (this.ability == 'うるおいボイス' && Pokemon.soundMoves.includes(move)) {
            return 'みず';
        }
        if (this.ability == 'エレキスキン' && moveType == 'ノーマル') {
            return 'でんき';
        }       
        if (this.ability == 'スカイスキン' && moveType == 'ノーマル') {
            return 'ひこう';
        }       
        if (this.ability == 'ノーマルスキン') {
            return 'ノーマル';
        }       
        if (this.ability == 'フェアリースキン' && moveType == 'ノーマル') {
            return 'フェアリー';
        }       
        if (this.ability == 'フリーズスキン' && moveType == 'ノーマル') {
            return 'こおり';
        }       
        if (move == 'ツタこんぼう' && this.name.includes('オーガポン(')) {
            return this.type[this.type.length-1];
        }
        if (move == 'ウェザーボール' && Pokemon.weathers.includes(weather)) {
            if (weather == 'はれ') {
                return 'ほのお';
            } else if (weather == 'あめ') {
                return 'みず';
            } else if (weather == 'すなあらし') {
                return 'いわ';
            } else if (weather == 'ゆき') {
                return 'こおり';
            }
        }
        return Pokemon.moves[move]['type'];
    }
    // 技の分類(物理・特殊・変化)を返す
    getMoveClass(move) {
        if (move == 'テラバースト' && this.terastal) {
            const effA = this.status[1]*this.getRankCorrection(1);
            const effC = this.status[3]*this.getRankCorrection(3);
            return (effA >= effC) ? '物理' : '特殊';    
        }
        return Pokemon.moves[move]['class'];
    }
    // 木の実により回復したあとのHPを返す
    fruitRecovery(hpDict) {
        let result = {}, key;
        for (let hp in hpDict) {
            if (hp.slice(-2) == '.0') {
                push(result, hp, hpDict[hp]);
            } else if (['オレンのみ','オボンのみ'].includes(this.item)) {
                if (Number(hp) <= 0.5*this.status[0]) {
                    if (this.item == 'オレンのみ') {
                        key = String(Number(hp) + 10) + '.0';
                    } else {
                        key = String(Number(hp) + Math.trunc(this.status[0]/4)) + '.0';
                    }
                    push(result, key, hpDict[hp]);
                } else {
                    push(result, hp, hpDict[hp]);
                }
            } else if (['フィラのみ','ウイのみ','マゴのみ','バンジのみ','イアのみ'].includes(this.item)) {
                if (Number(hp) <= 0.25*this.status[0]) {
                    key = String(Number(hp) + Math.trunc(this.status[0]/3)) + '.0';
                    push(result, key, hpDict[hp]);
                } else {
                    push(result, hp, hpDict[hp]);
                }
            }
        }
        return result;
    }
    // 名前が最も類似したポケモンの表示名を返す
    static mostLikelyDisplayName(str) {
        let result = '';
        let distance = 100;
        let strL = toKatakana(str, true);
        for (let displayName in Pokemon.zukanName) {
            const nameL = toKatakana(displayName, true);
            const d = levenshteinDistance(strL, nameL);
            if (d < distance) {
                result = displayName;
                distance = d;
            }
            if (distance == 0) break;
        }
        return result;
    }
    // ダメージを与える技ならtrueを返す
    static isDamageMove(move) {
        return (move in Pokemon.moves && Pokemon.moves[move]['class'] != '変化' && Pokemon.moves[move]['power'] > 0);
    }
    // 入力したダメージのHP割合を計算して、確定数も含めた文字列を返す
    damageText({minDamage, maxDamage, lethalProb=1, lethalNum=1, format='full', damageDigits=1, lethalProbDigits=2}) {
        let [minDamageRatio, maxDamageRatio] = [minDamage/this.status[0], maxDamage/this.status[0]];
        minDamageRatio = (damageDigits == 0) ? Math.trunc(100*minDamageRatio) : Math.trunc(100*minDamageRatio*10**damageDigits)/10**damageDigits;
        maxDamageRatio = (damageDigits == 0) ? Math.trunc(100*maxDamageRatio) : Math.trunc(100*maxDamageRatio*10**damageDigits)/10**damageDigits;
        lethalProb = (lethalProbDigits == 0) ? Math.trunc(100*lethalProb) : Math.trunc(100*lethalProb*10**lethalProbDigits)/10**lethalProbDigits;
        let result = '';
        if (format == 'full') {
            result = `${minDamage}~${maxDamage} (${minDamageRatio}~${maxDamageRatio}%)`;
        } else if (format == 'value') {
            result = `${minDamage}~${maxDamage}`;
        } else if (format == 'percent') {
            result = `${minDamageRatio}~${maxDamageRatio}%`;
        }
        if (lethalProb == 100) {
            result += ` 確${lethalNum}`;
        } else if (lethalProb > 0) {
            result += ` 乱${lethalNum}(${lethalProb}%)`;
        }
        return result;
    }
}

// ダメージ計算を扱うクラス
export class Battle {
    constructor(pokemon1, pokemon2) {
        this.pokemon = [pokemon1, pokemon2];

        this.weather = ''; // 天候
        this.field = ''; // フィールド
        this.gravity = false; // 重力
        this.trickroom = false; // トリックルーム

        this.attackSide; // 攻撃する側のポケモンを指定. 0: pokemon1, 1: pokemon2
        this.move; // 攻撃技
        this.maxRepeat; // 確定数のループ計算の最大回数

        this.critical; // true: 急所
        this.reflector; // true: リフレクター
        this.lightwall; // true: ひかりのかべ
        this.enhance; // true: 威力変動技の強化
        this.nCombo; // 連続技のヒット数
        this.approxCombo; // true: 連続技を定数倍で近似
        this.stealthrockDamage; // true: ステルスロックダメージ
        this.metDamage; // true: ゴツゴツメットダメージ
        this.skinDamage; // true: ばけのかわダメージ
        this.orbDamage; // true: いのちのたまダメージ
        this.weatherDamage; // true: 天候ダメージ
        this.glassRecovery; // true: グラスフィールド回復
        this.ailmentDamage; // true: 状態異常ダメージ
        this.resetDamageOption();
    
        this.hp = {};
        this.damage = {};
        this.subDamage = []; // トリプルアクセル計算用
        this.totalDamage = {};
        this.note = []; // ダメージ計算考慮項目
        this.lethalProb; // 致死率
        this.lethalNum; // 確定数
        this.correctedPower; // 変動後の技威力
    }
    // ダメージ計算オプションを初期化する
    resetDamageOption() {
        this.critical = false;
        this.reflector = false;
        this.lightwall = false;
        this.enhance = true;
        this.nCombo = 1;
        this.approxCombo = false;
        this.stealthrockDamage = false;
        this.metDamage = false;
        this.skinDamage = false;
        this.orbDamage = false;
        this.weatherDamage = true;
        this.glassRecovery = true;
        this.ailmentDamage = true;
    }
    // 急所が有効ならtrueを返す
    isCritical() {
        if (!this.critical) { return false; }
        let p1 = (this.attackSide == 0) ? this.pokemon[0] : this.pokemon[1]; // 攻撃側
        let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0]; // 防御側
        if (['シェルアーマー','カブトアーマー'].includes(p2.ability)) {
            if (Pokemon.moldBreakers.includes(p1.ability) && (p2.item != 'とくせいガード' || !p2.hasItem)) {
                return true;
            } else {
                return false;
            }
        } else {
            return true;
        }        
    }
    // 攻撃タイプ補正
    attackTypeCorrection(move) {
        if (!(move in Pokemon.moves)) {
            return 0;
        }
        let r = 1.0;
        let p1 = (this.attackSide == 0) ? this.pokemon[0] : this.pokemon[1]; // 攻撃側
        //let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0]; // 防御側
        const moveType = p1.getMoveType(move, this.weather);
        // テラスタル
        if (p1.terastal) {
            if (p1.Ttype == 'ステラ') {
                if (p1.type.includes(moveType)) {
                    r = (p1.ability == 'てきおうりょく') ? r*2.25 : r*2.0;
                } else {
                    r *= 1.2;
                }
                this.note.push('テラスタル');
            } else if (moveType == p1.Ttype) {
                if (p1.type.includes(p1.Ttype)) {
                    r = (p1.ability == 'てきおうりょく') ? r*2.25 : r*2.0;
                } else {
                    r = (p1.ability == 'てきおうりょく') ? r*2.0 : r*1.5;
                }
                this.note.push('テラスタル');
            } else if (p1.type.includes(moveType)) {
                r *= 1.5;
            }
        } else {
            if (p1.type.includes(moveType)) {
                r = (p1.ability == 'てきおうりょく') ? r*2.0 : r*1.5;
            } else if (['へんげんじざい','リベロ'].includes(p1.ability)) {
                r = 1.5;
                this.note.push(p1.ability);
            }
        }
        return r;
    }
    // 防御タイプ補正
    defenceTypeCorrection(move) {
        if (!(move in Pokemon.moves)) {
            return 0;
        }
        let r = 1.0;        
        let p1 = (this.attackSide == 0) ? this.pokemon[0] : this.pokemon[1]; // 攻撃側
        let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0]; // 防御側
        const moveType = p1.getMoveType(move, this.weather);
        // テラスタル
        let p2_type = p2.terastal ? [p2.Ttype] : p2.type;
        for (let t of p2_type) {
            if (!(t in Pokemon.typeID)) {
                continue;
            }
            if (['しんがん','きもったま'].includes(p1.ability) && t=='ゴースト' && ['ノーマル','かくとう'].includes(moveType)) {
                this.note.push(p1.ability);
            } else if (move == 'フリーズドライ' && t == 'みず') {
                r *= 2;
            } else {
                r *= Pokemon.typeCorrections[Pokemon.typeID[moveType]][Pokemon.typeID[t]]
            }
        }
        return r;
    }
    // 威力補正
    powerCorrection(move) {
        let r = 4096;
        if (!(move in Pokemon.moves)) {
            return r;
        }
        let p1 = (this.attackSide == 0) ? this.pokemon[0] : this.pokemon[1]; // 攻撃側
        let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0]; // 防御側           
        const moveType = p1.getMoveType(move, this.weather);
        const moveClass = p1.getMoveClass(move);
        const movePower = Pokemon.moves[move]['power'];
        // かたやぶり
        if (Pokemon.moldBreakers.includes(p1.ability) && p2.item != 'とくせいガード') {
            p2.ability += 'disabled';
        }
        // 攻撃側
        if (p1.name.includes('オーガポン(')) {
            r = Math.round(r*4915/4096);
            this.note.push('おめん 1.2倍');
        }
        // 威力変動技
        if (move == 'テラバースト' && p1.Ttype == 'ステラ' && p1.terastal) {
            const rate = 1.25;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${this.correctedPower}`);
        }
        if (move == 'アクロバット') {
            const rate = this.enhance ? 2 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (['アシストパワー','つけあがる'].includes(move)) {
            const rate = 1 + p1.rank.slice(1,6).filter(v => { return v > 0; }).concat([0]).reduce((x,y) => x+y);
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${this.correctedPower}`);
        }
        if (move == 'ウェザーボール' && Pokemon.weathers.includes(this.weather)) {
            const rate = 2;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${this.correctedPower}`);
        }
        if (move == 'エレキボール') {
            const s1 = p1.getEffSpeed(this.weather);
            const s2 = p2.getEffSpeed(this.weather);
            if (s1 >= 4*s2) { this.correctedPower = 150; }
            else if (s1 >= 3*s2) { this.correctedPower = 120; }
            else if (s1 >= 2*s2) { this.correctedPower = 80; }
            else if (s1 >= s2) { this.correctedPower = 60; }
            else { this.correctedPower = 40; }
            r *= this.correctedPower;
            this.note.push(`威力${this.correctedPower}`);
        }
        if (move == 'からげんき') {
            const rate = this.enhance ? 2 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (['くさむすび','けたぐり'].includes(move)) {
            if (p2.weight < 10) { this.correctedPower = 20; }
            else if (p2.weight < 25) { this.correctedPower = 40; }
            else if (p2.weight < 50) { this.correctedPower = 60; }
            else if (p2.weight < 100) { this.correctedPower = 80; }
            else if (p2.weight < 200) { this.correctedPower = 100; }
            else { this.correctedPower = 120; }
            r *= this.correctedPower;
            this.note.push(`威力${this.correctedPower}`);
        }
        if (move == 'しおみず') {
            const rate = this.enhance ? 2 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (['じだんだ','やけっぱち'].includes(move)) {
            const rate = this.enhance ? 2 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (move == 'しっぺがえし') {
            const rate = this.enhance ? 2 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }            
        if (move == 'ジャイロボール') {
            this.correctedPower = Math.min(150, Math.trunc(25*p2.getEffSpeed(this.weather)/p1.getEffSpeed(this.weather)+1));
            r *= this.correctedPower;
            this.note.push(`威力${this.correctedPower}`);
        } 
        if (move == 'Gのちから') {
            const rate = this.enhance ? 1.5 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (move == 'たたりめ') {
            const rate = this.enhance ? 2 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (move == 'なげつける') {
            if (p1.item in Pokemon.items && p1.hasItem) {
                this.correctedPower = Pokemon.items[p1.item]['power'];
                r *= this.correctedPower;
                this.note.push(`威力${this.correctedPower}`);    
            } else {
                r = 0;
            }
        }
        if (move == 'はたきおとす') {
            const rate = this.enhance ? 1.5 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (move == 'ひゃっきやこう') {
            const rate = this.enhance ? 2 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (move == 'ベノムショック') {
            const rate = this.enhance ? 2 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (['ヒートスタンプ','ヘビーボンバー'].includes(move)) {
            if (2*p2.weight > p1.weight) { this.correctedPower = 40; }
            else if (3*p2.weight > p1.weight) { this.correctedPower = 60; }
            else if (4*p2.weight > p1.weight) { this.correctedPower = 80; }
            else if (5*p2.weight > p1.weight) { this.correctedPower = 100; }
            else { this.correctedPower = 120; }
            r *= this.correctedPower;
            this.note.push(`威力${this.correctedPower}`);
        }
        if (['ゆきなだれ','リベンジ'].includes(move)) {
            const rate = this.enhance ? 2 : 1;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${rate}倍`);
        }
        if (p1.ability == 'テクニシャン' && movePower*r/4096 <= 60) {
            r = Math.round(r*1.5);
            this.note.push(p1.ability);
        }
        // 以降の技はテクニシャン非適用
        if (['ソーラービーム','ソーラーブレード'].includes(move)) {
            let rate = (this.weather != 'すなあらし') ? 1 : 0.5;
            r = Math.round(r*rate);
            this.correctedPower = Math.trunc(rate*Pokemon.moves[move]['power']);
            this.note.push(`威力${this.correctedPower}`);
        }
        if (p1.ability == 'アナライズ') {
            sign = 1-2*this.trickroom
            if (sign*(p1.getEffSpeed(this.weather)-p2.getEffSpeed(this.weather)) < 0) {
                r = Math.round(r*5325/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'エレキスキン') {
            if (Pokemon.moves[move]['type'] == 'ノーマル') {
                r = Math.round(r*4915/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'かたいつめ') {
            if (Pokemon.contactMoves.includes(move)) {
                r = Math.round(r*5325/4096);
                this.note.push(p1.ability);
            }
        } 
        if (p1.ability == 'がんじょうあご') {
            let appliedMoves = ['かみつく','かみくだく','ひっさつまえば','ほのおのきば','かみなりののきば',
            'こおりのきば','どくどくのきば','サイコファング','エラがみ','くらいつく'];
            if (appliedMoves.includes(move)) {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'きれあじ') {
            let appliedMoves = ['アクアカッター','いあいぎり','エアカッター','エアスラッシュ','がんせきアックス',
            'きょじゅうざん','きりさく','クロスポイズン','サイコカッター','シェルブレード','シザークロス',
            'しんぴのつるぎ','せいなるつるぎ','ソーラーブレード','つじぎり','つばめがえし','ドゲザン','ネズミざん',
            'はっぱカッター','むねんのつるぎ','リーフブレード','れんぞくぎり'];
            if (appliedMoves.includes(move)) {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'スカイスキン') {
            if (Pokemon.moves[move]['type'] == 'ノーマル') {
                r = Math.round(r*4915/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'すてみ') {
            let appliedMoves = ['アフロブレイク','ウッドハンマー','じごくぐるま','すてみタックル','とっしん','とびげり',
            'とびひざげり','もろはのずつき','フレアドライブ','ブレイブバード','ボルテッカー','ワイルドボルト','ウェーブタックル'];
            if (appliedMoves.includes(move)) {
                r = Math.round(r*4915/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'すなのちから') {
            if (this.weather=='すなあらし' && ['いわ','じめん','はがね'].includes(moveType)) {
                r = Math.round(r*5325/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'ちからずく') {
            if (Pokemon.chikarazukuMoves.includes(move)) {
                r = Math.round(r*5325/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'てつのこぶし') {
            if (Pokemon.punchMoves.includes(move)) {
                r = Math.round(r*4915/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'とうそうしん') {
            if (['オス','メス'].includes(p1.sex) && ['オス','メス'].includes(p2.sex)) {
                r = (p1.sex == p2.sex) ? Math.round(r*1.25) : Math.round(r*3072/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'どくぼうそう') {
            if (p1.ailment == 'どく' && moveClass == '物理') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }       
        if (p1.ability == 'ノーマルスキン') {
            r = Math.round(r*4915/4096);
            this.note.push(p1.ability);
        }
        if (p1.ability == 'パンクロック') {
            if (Pokemon.soundMoves.includes(move)) {
                r = Math.round(r*5325/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'フェアリーオーラ') {
            if (moveType == 'フェアリー') {
                r = Math.round(r*5448/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'フェアリースキン') {
            if (Pokemon.moves[move]['type'] == 'ノーマル') {
                r = Math.round(r*4915/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'フリーズスキン') {
            if (Pokemon.moves[move]['type'] == 'ノーマル') {
                r = Math.round(r*4915/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'メガランチャー') {
            let appliedMoves = ['あくのはどう','はどうだん','みずのはどう','りゅうのはどう','だいちのはどう','こんげんのはどう'];
            if (appliedMoves.includes(move)) {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.item.includes('しらたま') && p1.hasItem) {
            if (p1.name.includes('パルキア') && ['みず','ドラゴン'].includes(p1.getMoveType(move))) {
                r = Math.round(r*4915/4096);
                this.note.push(p1.item);
            }
        }
        if (p1.item == 'こころのしずく' && p1.hasItem) {
            if (['ラティオス','ラティアス'].includes(p1.name) && ['エスパー','ドラゴン'].includes(p1.getMoveType(move))) {
                r = Math.round(r*4915/4096);
                this.note.push(p1.item);
            }
        }
        if (p1.item.includes('こんごうだま') && p1.hasItem) {
            if (p1.name.includes('ディアルガ') && ['はがね','ドラゴン'].includes(p1.getMoveType(move))) {
                r = Math.round(r*4915/4096);
                this.note.push(p1.item);
            }
        }
        if (p1.item.includes('はっきんだま') && p1.hasItem) {
            if (p1.name.includes('ギラティナ') && ['ゴースト','ドラゴン'].includes(p1.getMoveType(move))) {
                r = Math.round(r*4915/4096);
                this.note.push(p1.item);
            }
        }
        if (p1.item == 'ちからのハチマキ' && p1.hasItem) {
            if (moveClass == '物理') {
                r = Math.round(r*4505/4096);
                this.note.push(p1.item);
            }
        }
        if (p1.item == 'ノーマルジュエル' && p1.hasItem) {
            if (moveType == 'ノーマル') {
                r = Math.round(r*5325/4096);
                this.note.push(p1.item);
            }
        }
        if (p1.item == 'パンチグローブ' && p1.hasItem) {
            if (Pokemon.punchMoves.includes(move)) {
                r = Math.round(r*4506/4096);
                this.note.push(p1.item);
            }
        }
        if (p1.item == 'ものしりメガネ' && p1.hasItem) {
            if (moveClass == '特殊') {
                r = Math.round(r*4505/4096);
                this.note.push(p1.item);
            }
        }
        // タイプ強化アイテム
        if (p1.item in Pokemon.typeBuffItems && p1.hasItem) {
            if (moveType == Pokemon.typeBuffItems[p1.item]) {
                r = Math.round(r*4915/4096);
                this.note.push(p1.item);
            }
        }
        // フィールド補正
        if (Pokemon.fields.includes(this.field)) {
            if (this.field == 'エレキフィールド') {
                if (moveType=='でんき' && !p1.type.includes('ひこう') && p1.ability != 'ふゆう') {
                    r = Math.round(r*5325/4096);
                }
                if (move == 'ライジングボルト' && !p2.type.includes('ひこう') && p2.ability != 'ふゆう') {
                    r = Math.round(r*2);
                }
            } else if (this.field == 'グラスフィールド') {
                if (moveType == 'くさ' && !p1.type.includes('ひこう') && p1.ability != 'ふゆう') {
                    r = Math.round(r*5325/4096);
                }
                if (['じしん','じならし','マグニチュード'].includes(move) && !p2.type.includes('ひこう') && p2.ability != 'ふゆう') {
                    r = Math.round(r*0.5);
                }
            } else if (this.field == 'サイコフィールド') {
                if (moveType == 'エスパー' && !p1.type.includes('ひこう') && p1.ability != 'ふゆう') {
                    r = Math.round(r*5325/4096);
                }
                if (move == 'ワイドフォース' && !p2.type.includes('ひこう') && p2.ability != 'ふゆう') {
                    r = Math.round(r*1.5);
                }
            } else if (this.field == 'ミストフィールド') {
                if (moveType == 'ドラゴン' && !p2.type.includes('ひこう') && p2.ability != 'ふゆう') {
                    r = Math.round(r*0.5);
                }
                if (move == 'ミストバースト' && !p1.type.includes('ひこう') && p1.ability != 'ふゆう') {
                    r = Math.round(r*1.5);
                }
            }
        }
        // 防御側の特性
        if (p2.ability == 'かんそうはだ') {
            if (moveType == 'ほのお') {
                r = Math.round(r*1.25);
                this.note.push(p2.ability);
            } else if (moveType == 'みず') {
                r = 0;
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'たいねつ') {
            if (moveType == 'ほのお') {
                r = Math.round(r*0.5);
                this.note.push(p2.ability);
            }
        }
        // かたやぶり解除
        if (p2.ability.includes('disabled')) {
            p2.ability.replace('disabled', '');
        }
        return r;
    }
    // 攻撃補正
    attackCorrection(move) {
        let r = 4096;
        if (!(move in Pokemon.moves)) {
            return r;
        }
        let p1 = (this.attackSide == 0) ? this.pokemon[0] : this.pokemon[1]; // 攻撃側
        let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0]; // 防御側            
        const moveType = p1.getMoveType(move, this.weather);
        const moveClass = p1.getMoveClass(move);
        // かたやぶり
        if (Pokemon.moldBreakers.includes(p1.ability) && p2.item != 'とくせいガード') {
            p2.ability += 'disabled';
        }
        // 攻撃側
        if (p1.ability == 'いわはこび') {
            if (moveType == 'いわ') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'クォークチャージ') {
            if ((p1.item == 'ブーストエナジー'  && p1.hasItem) || this.field == 'エレキフィールド') {
                const abcds = p1.status.slice(1,6);
                if (moveClass == '物理' && abcds.indexOf(Math.max(...abcds)) == 0) {
                    r = Math.round(r*5325/4096);
                    this.note.push('A上昇');
                } else if (moveClass == '特殊' && abcds.indexOf(Math.max(...abcds)) == 2) {
                    r = Math.round(r*5325/4096);
                    this.note.push('C上昇');
                }
            }
        }
        if (p1.ability == 'げきりゅう') {
            if (moveType == 'みず' && p1.hp/p1.status[0] <= 1/3) {
                r = Math.round(r*1.5);
                this.note.push('げきりゅう');
            }
        }
        if (p1.ability == 'こだいかっせい') {
            if ((p1.item == 'ブーストエナジー' && p1.hasItem) || this.weather == 'はれ') {
                const abcds = p1.status.slice(1,6);
                if (moveClass == '物理' && abcds.indexOf(Math.max(...abcds)) == 0) {
                    r = Math.round(r*5325/4096);
                    this.note.push('A上昇');
                } else if (moveClass == '特殊' && abcds.indexOf(Math.max(...abcds)) == 2) {
                    r = Math.round(r*5325/4096);
                    this.note.push('C上昇');
                }
            }
        }
        if (p1.ability == 'ごりむちゅう') {
            if (moveClass == '物理') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'こんじょう') {
            if (Pokemon.ailments.includes(p1.ailment) && moveClass == '物理') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'サンパワー') {
            if (this.weather == 'はれ' && moveClass == '特殊') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'すいほう') {
            if (moveType == 'みず') {
                r = r = Math.round(r*2);
                this.note.push(p1.ability);
            }
        }                
        if (p1.ability == 'すてみ') {
            if (true) {
                r = Math.round(r*4915/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'ちからもち') {
            if (moveClass == '物理') {
                r = Math.round(r*2);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'トランジスタ') {
            if (moveType=='でんき') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'ねつぼうそう') {
            if (p1.ailment == 'やけど' && moveClass == '特殊') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'はがねつかい') {
            if (moveType=='はがね') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'はがねのせいしん') {
            if (moveType=='はがね') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'ハドロンエンジン') {
            if (this.field=='エレキフィールド') {
                r = Math.round(r*5461/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'ひひいろのこどう') {
            if (this.weather=='はれ' && p1.item != 'ばんのうがさ') {
                r = Math.round(r*5461/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'フラワーギフト') {
            if (this.weather=='はれ' && p1.item != 'ばんのうがさ') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'むしのしらせ') {
            if (moveType == 'むし' && p1.hp/p1.status[0] <= 1/3) {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'もうか') {
            if (moveType == 'ほのお' && p1.hp/p1.status[0] <= 1/3) {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'ヨガパワー') {
            if (moveClass == '物理') {
                r = Math.round(r*2);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'よわき') {
            if (p1.hp/p1.status[0] <= 1/2) {
                r = Math.round(r*0.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'りゅうのあぎと') {
            if (moveType == 'ドラゴン') {
                r = Math.round(r*1.5);
                this.note.push(p1.ability);
            }
        }
        if (p1.item == 'こだわりハチマキ' && p1.hasItem) {
            if (moveClass == '物理') {
                r = Math.round(r*1.5);
                this.note.push(`${p1.item} 1.5倍`);
            }
        }
        if (p1.item == 'こだわりメガネ' && p1.hasItem) {
            if (moveClass == '特殊') {
                r = Math.round(r*1.5);
                this.note.push(`${p1.item} 1.5倍`);
            }
        }
        if (p1.item == 'でんきだま' && p1.hasItem) {
            if (p1.name == 'ピカチュウ') {
                r = Math.round(r*2);
                this.note.push(`${p1.item} 2倍`);
            }
        }
        // 防御側
        if (p2.ability == 'あついしぼう') {
            if (['ほのお', 'こおり'].includes(moveType)) {
                r = Math.round(r*0.5);
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'きよめのしお') {
            if (moveType == 'ゴースト') {
                r = Math.round(r*0.5);
                this.note.push(p2.ability);
            }
        }   
        if (p2.ability == 'わざわいのうつわ') {
            if (moveClass == '特殊') {
                r = Math.round(r*3072/4096);
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'わざわいのおふだ') {
            if (moveClass == '物理') {
                r = Math.round(r*3072/4096);
                this.note.push(p2.ability);
            }
        }
        // かたやぶり解除
        if (p2.ability.includes('disabled')) {
            p2.ability.replace('disabled', '');
        }
        return r;
    }
    // 防御補正
    defenceCorrection(move) {
        let r = 4096;
        if (!(move in Pokemon.moves)) {
            return r;
        }
        let p1 = (this.attackSide == 0) ? this.pokemon[0] : this.pokemon[1]; // 攻撃側
        let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0]; // 防御側            
        const moveType = p1.getMoveType(move, this.weather);
        const moveClass = p1.getMoveClass(move);
        // かたやぶり
        if (Pokemon.moldBreakers.includes(p1.ability) && p2.item != 'とくせいガード') {
            p2.ability += 'disabled';
        }
        // 攻撃側
        if (p1.ability == 'わざわいのたま') {
            if (moveClass == '特殊' && move != 'サイコショック') {
                r = Math.round(r*3072/4096);
                this.note.push(p1.ability);
            }
        }
        if (p1.ability == 'わざわいのつるぎ') {
            if (moveClass == '物理' || ['サイコショック','サイコブレイク'].includes(move)) {
                r = Math.round(r*3072/4096);
                this.note.push(p1.ability);
            }
        }
        // 防御側
        if (p2.item == 'しんかのきせき' && p2.hasItem) {
            if (true) {
                r = Math.round(r*1.5);
                this.note.push(p2.item);
            }
        }
        if (p2.item == 'とつげきチョッキ' && p2.hasItem) {
            if (moveClass == '特殊' && move != 'サイコショック') {
                r = Math.round(r*1.5);
                this.note.push(p2.item);
            }
        }
        if (p2.ability == 'クォークチャージ') {
            if ((p2.item == 'ブーストエナジー' && p2.hasItem) || this.field == 'エレキフィールド') {
                const abcds = p2.status.slice(1,6);
                if ((moveClass == '物理' || ['サイコショック','サイコブレイク'].includes(move)) && abcds.indexOf(Math.max(...abcds)) == 2) {
                    r = Math.round(r*5325/4096);
                    this.note.push('B上昇');
                } else if (moveClass == '特殊' && move!='サイコショック' && abcds.indexOf(Math.max(...abcds)) == 4) {
                    r = Math.round(r*5325/4096);
                    this.note.push('D上昇');
                }
            }
        }
        if (p2.ability == 'くさのけがわ') {
            if (this.field=='グラスフィールド' && (moveClass == '物理' || ['サイコショック','サイコブレイク'].includes(move))) {
                r = Math.round(r*1.5);
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'こだいかっせい') {
            if ((p2.item == 'ブーストエナジー' && p2.hasItem) || this.weather == 'はれ') {
                const abcds = p2.status.slice(1,6);
                if ((moveClass == '物理' || ['サイコショック','サイコブレイク'].includes(move)) && abcds.indexOf(Math.max(...abcds)) == 2) {
                    r = Math.round(r*5325/4096);
                    this.note.push('B上昇');
                } else if (moveClass == '特殊' && move!='サイコショック' && abcds.indexOf(Math.max(...abcds)) == 4) {
                    r = Math.round(r*5325/4096);
                    this.note.push('D上昇');
                }
            }
        }
        if (p2.ability == 'すいほう') {
            if (moveType == 'ほのお') {
                r = Math.round(r*0.5);
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'ファーコート') {
            if (moveClass == '物理' || ['サイコショック','サイコブレイク'].includes(move)) {
                r = Math.round(r*2);
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'ふしぎなうろこ') {
            if (Pokemon.ailments.includes(p2.ailment)) {
                r = Math.round(r*1.5);
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'フラワーギフト') {
            if (this.weather == 'はれ') {
                r = Math.round(r*1.5);
                this.note.push(p2.ability);
            }
        }
        // かたやぶり解除
        if (p2.ability.includes('disabled')) {
            p2.ability.replace('disabled', '');
        }
        return r;
    }
    // ダメージ補正
    damageCorrection(move) {
        let r = 4096;
        if (!(move in Pokemon.moves)) {
            return r;
        }
        let p1 = (this.attackSide == 0) ? this.pokemon[0] : this.pokemon[1]; // 攻撃側
        let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0]; // 防御側
        const moveType = p1.getMoveType(move, this.weather);
        const moveClass = p1.getMoveClass(move);        
        if (p2.ability == 'プリズムアーマー') {
            if (this.attackTypeCorrection(0, move) > 1) {
                r = Math.round(r*3072/4096);
                this.note.push(p2.ability);
            }
        }
        // かたやぶり
        if (Pokemon.moldBreakers.includes(p1.ability) && p2.item != 'とくせいガード') {
            p2.ability += 'disabled';
        }
        // 攻撃側
        if (p1.ability == 'いろめがね') {
            if (this.defenceTypeCorrection(0,move) < 1) {
                r = Math.round(r*2);
                this.note.push(p1.ability);
            }
        }
        if (p1.item == 'いのちのたま' && p1.hasItem) {
            r = Math.round(r*5324/4096);
            this.note.push(p1.item);
        }
        if (p1.item == 'たつじんのおび' && p1.hasItem) {
            if (this.defenceTypeCorrection(0,move) > 1) {
                r = Math.round(r*4915/4096);
                this.note.push(p1.item);
            }
        }
        // 防御側
        if (this.reflector && moveClass == '物理') {
            if (p1.ability == 'すりぬけ') {
                this.note.push('すりぬけ');
            } else if (['かわらわり','サイコファング','レイジングブル'].includes(move)) {
                this.note.push('壁破壊');
            } else if (!this.isCritical()) {
                r = Math.round(r*0.5);
                this.note.push('リフレクター');
            }
        }   
        if (this.lightwall && moveClass == '特殊') {
            if (p1.ability == 'すりぬけ') {
                this.note.push('すりぬけ');
            } else if (!this.isCritical()) {
                r = Math.round(r*0.5);
                this.note.push('ひかりのかべ');
            }
        }           
        // 半減実
        if (p2.item in Pokemon.halfFruits && p2.hasItem &&  p1.ability != 'きんちょうかん') {
            if (Pokemon.halfFruits[p2.item] == 'ノーマル' && moveType == 'ノーマル') {
                r = Math.round(r*0.5);
                this.note.push(p2.item);
            } else if (this.defenceTypeCorrection(move) > 1 && moveType == Pokemon.halfFruits[p2.item]) {
                r = Math.round(r*0.5);
                this.note.push(p2.item);
            }
        }
        if (p2.ability == 'こおりのりんぷん') {
            if (moveClass == '特殊') {
                r = Math.round(r*0.5);
                this.note.push(p2.ability);
            }
        }
        if (['こんがりボディ','もらいび'].includes(p2.ability)) {
            if (moveType == 'ほのお') {
                r = 0;
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'そうしょく') {
            if (moveType == 'くさ') {
                r = 0;
                this.note.push(p2.ability);
            }
        }
        if (['ちくでん','でんきエンジン','ひらいしん'].includes(p2.ability)) {
            if (moveType == 'でんき') {
                r = 0;
                this.note.push(p2.ability);
            }
        }
        if (['ちょすい','よびみず'].includes(p2.ability)) {
            if (moveType == 'みず') {
                r = 0;
                this.note.push(p2.ability);
            }
        }
        if (['どしょく','ふゆう'].includes(p2.ability)) {
            if (moveType == 'じめん') {
                r = 0;
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'ハードロック') {
            if (this.attackTypeCorrection(0, move) > 1) {
                r = Math.round(r*3072/4096);
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'パンクロック') {
            if (Pokemon.soundMoves.includes(move)) {
                r = Math.round(r*0.5);
                this.note.push(p2.ability);
            }
        }       
        if (p2.ability == 'フィルター') {
            if (this.attackTypeCorrection(0, move) > 1) {
                r = Math.round(r*3072/4096);
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'ぼうおん') {
            if (Pokemon.soundMoves.includes(move)) {
                r = 0;
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'ぼうだん') {
            let appliedMoves = ['アイスボール','アシッドボム','ウェザーボール','エナジーボール','エレキボール','オクタンほう','かえんだん','かえんボール',
            'かふんだんご','がんせきほう','きあいだま','くちばしキャノン','ジャイロボール','シャドーボール','タネばくだん','タネマシンガン','タマゴばくだん',
            'たまなげ','でんじほう','どろばくだん','はどうだん','ヘドロばくだん','マグネットボム','ミストボール','ロックブラスト'];
            if (appliedMoves.includes(move)) {
                r = 0;
                this.note.push(p2.ability);
            }
        }
        if (p2.ability == 'もふもふ') {
            if (moveType == 'ほのお') {
                r = Math.round(r*2);
                this.note.push(p2.ability);
            } else if (Pokemon.contactMoves.includes(move)) {
                r = Math.round(r*0.5);
                this.note.push(p2.ability);
            }
        }                
        // かたやぶり解除
        if (p2.ability.includes('disabled')) {
            p2.ability.replace('disabled', '');
        }
        return r;
    }
    // ダメージ計算
    calculateDamage(move, powerRatio=1) {
        let p1 = (this.attackSide == 0) ? this.pokemon[0] : this.pokemon[1]; // 攻撃側
        let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0]; // 防御側
        if (p1.status.includes(0) || p2.status.includes(0) || !(move in Pokemon.moves)) {
            return false;
        }
        if (Pokemon.moves[move]['class'] == '変化' || Pokemon.moves[move]['power'] == 0) {
            return false;
        }        
        const moveType = p1.getMoveType(move, this.weather);
        const moveClass = p1.getMoveClass(move);
        const movePower = Pokemon.moves[move]['power']*powerRatio;
        this.note = [];
        // 補正値
        const rAttackType = this.attackTypeCorrection(move);
        const rDefenceType = this.defenceTypeCorrection(move);
        const rPower = this.powerCorrection(move);
        const rAttack = this.attackCorrection(move);
        const rDefence = this.defenceCorrection(move);
        const rDamage = this.damageCorrection(move);    
        // 最終威力
        const finalPower = Math.max(1, roundHalfDown(movePower*rPower/4096));
        // 最終攻撃・ランク補正
        let ind = 1;
        if (move == 'ボディプレス') {
            ind = 2;
        } else if (moveClass == '特殊') {
            ind = 3;
        }
        let finalAttack = p1.status[ind]
        let rRank = p1.getRankCorrection(ind)
        if (move == 'イカサマ') {
            finalAttack = p2.status[ind];
            rRank = p2.getRankCorrection(ind);
        }
        if (p2.ability == 'てんねん' && !Pokemon.moldBreakers.includes(p1.ability)) {
            rRank = Math.min(1, rRank);
            this.note.push('てんねん');
        } else if (this.isCritical()) {
            rRank = Math.max(1, rRank);
        }
        finalAttack = Math.trunc(finalAttack*rRank);
        if (p1.ability == 'はりきり' && moveClass == '物理') {
            finalAttack = Math.trunc(finalAttack*1.5);
            this.note.push(p1.ability);
        }
        finalAttack = Math.max(1, roundHalfDown(finalAttack*rAttack/4096));
        // 最終防御・ランク補正
        ind = (moveClass == '物理' || ['サイコショック','サイコブレイク'].includes(move)) ? 2 : 4;
        let finalDefence = p2.status[ind];
        rRank = p2.getRankCorrection(ind);
        if (p1.ability == 'てんねん') {
            rRank = Math.min(1, rRank);
            this.note.push('てんねん');
        } else if (this.isCritical()) {
            rRank = Math.min(1, rRank);
        }
        finalDefence = Math.trunc(finalDefence*rRank);
        // 雪・砂嵐補正
        if (['ゆき','すなあらし'].includes(this.weather)  && !['のーてんき','エアロック'].includes(p1.ability) && !['のーてんき','エアロック'].includes(p2.ability)) {
            if (this.weather == 'ゆき' && p2.type.includes('こおり') && moveClass == '物理') {
                finalDefence = Math.trunc(finalDefence*1.5);
            } else if (this.weather == 'すなあらし' && p2.type.includes('いわ') && moveClass == '特殊') {
                finalDefence = Math.trunc(finalDefence*1.5);
            }
        }
        finalDefence = Math.max(1, roundHalfDown(finalDefence*rDefence/4096));
        // 最大ダメージ
        let maxDamage = Math.trunc(Math.trunc(Math.trunc(p1.level*2/5+2)*finalPower*finalAttack/finalDefence)/50+2); 
        //　晴・雨補正
        if (['はれ','あめ'].includes(this.weather) && !['のーてんき','エアロック'].includes(p1.ability) && !['のーてんき','エアロック'].includes(p2.ability) && p2.item != 'ばんのうがさ') {
            if (moveType == 'ほのお') {
                maxDamage = (this.weather == 'はれ') ? roundHalfDown(maxDamage*1.5) : roundHalfDown(maxDamage*0.5);
            } else if (moveType == 'みず') {
                maxDamage = (this.weather == 'はれ') ? roundHalfDown(maxDamage*0.5) : roundHalfDown(maxDamage*1.5);
            }
        }
        // 急所
        if (this.isCritical()) {
            maxDamage = roundHalfDown(maxDamage*1.5);
            this.note.push('急所');
        }        
        this.damage = {};
        for (let i=0; i<16; i++) {
            // 乱数 85%~100%
            let damage = Math.trunc(maxDamage*(0.85+0.01*i));
            // 攻撃タイプ補正
            damage = roundHalfDown(damage*rAttackType);
            // 防御タイプ補正
            damage = Math.trunc(damage*rDefenceType)
            // 状態異常補正
            if (p1.ailment == 'やけど' && moveClass == '物理' && p1.ability != 'こんじょう' && move != 'からげんき') {
                damage = roundHalfDown(damage*0.5);
            }
            // ダメージ補正
            damage = roundHalfDown(damage*rDamage/4096);           
            if (damage == 0 && rDefenceType*rDamage > 0) {
                damage = 1;
            }
            let key = String(damage);
            this.damage[key] = !(key in this.damage) ? 1 : this.damage[key] += 1;
        }
        return true;
    }
    // 致死率・確定数の計算
    lethal(hp={}) {
        let p1 = (this.attackSide == 0) ? this.pokemon[0] : this.pokemon[1]; // 攻撃側
        let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0]; // 防御側
        if (!Object.keys(hp).length) {
            hp[String(p2.hp) + (p2.hasItem ? '' : '.0')] = 1;
        }
        this.hp = {...hp};
        let totalConstDamage = 0;
        this.totalDamage = {'0': 1};
        this.lethalProb = 0;
        this.lethalNum = 0;
        if ('0' in this.damage) { return; }
        // 連続技
        if (this.move in Pokemon.comboMoves) {
            if (this.approxCombo) {
                // 定数倍で近似
                this.damage = multiplyKeys(this.damage, this.nCombo);
                this.nCombo = 1;
                this.note.push(`${this.nCombo}ヒット(近似)`);
            } else {
                this.maxRepeat = this.nCombo * Math.max(Math.trunc(this.maxRepeat/this.nCombo), 1);
                this.note.push(`${this.nCombo}ヒット`);
            }
        } else {
            this.nCombo = 1;
        }
        const recoveryFruit = ['オレンのみ','オボンのみ','フィラのみ','ウイのみ','マゴのみ','バンジのみ','イアのみ'];
        // ステルスロック
        if (this.stealthrockDamage) {
            let r = this.defenceTypeCorrection('ステルスロック');
            let d = Math.trunc(p2.status[0]/8*r);
            hp = offsetKeys(hp, -d);
            totalConstDamage += d;
            this.note.push(`ステルスロック(${-d})`);
            // 致死判定
            this.lethalProb = zeroRatio(hp);
            // きのみ回復
            if (!this.lethalProb && recoveryFruit.includes(p2.item)) {
                hp = p2.fruitRecovery(hp);
            }
        }
        // マルチスケイル
        let reducible = ['マルチスケイル','ファントムガード','テラスシェル'].includes(p2.ability);
        if (Pokemon.moldBreakers.includes(p1.ability)) {
            if (p2.ability != 'ファントムガード' && !(p2.item == 'とくせいガード' && p2.hasItem)) {
                reducible = false;
            }
        }
        // 死ぬかmaxRepeatに達するまでダメージを蓄積させる
        for (let i=0; i<this.maxRepeat; i++) {
            // 技ダメージ
            let damage = this.damage, reduced;
            if (this.move == 'トリプルアクセル' && i%this.nCombo > 0) {
                damage = this.subDamage[i%this.nCombo-1];
            }
            [hp, damage, reduced] = crossSubtract(hp, damage, (reducible ? p2.status[0] : -1));
            if (reduced) { this.note.push(p2.ability); }
            // 致死判定
            this.lethalProb = zeroRatio(hp);
            // 記録
            if (i < this.nCombo) {
                this.totalDamage = crossSum(this.totalDamage, damage);
            }
            // ゴツゴツメット
            let d = (this.metDamage) ? Math.trunc(p2.status[0]/6) : 0;
            if (!this.lethalProb && d && i==0) {
                hp = offsetKeys(hp, -d);
                totalConstDamage += d; 
                this.note.push(`ゴツゴツメット(${-d})`);
                // 致死判定
                this.lethalProb = zeroRatio(hp);
            }
            // ばけのかわ
            d = (this.skinDamage) ? Math.trunc(p2.status[0]/8) : 0;
            if (!this.lethalProb && d && i==0) {
                hp = offsetKeys(hp, -d);
                totalConstDamage += d;
                this.note.push(`ばけのかわ(${-d})`);
                // 致死判定
                this.lethalProb = zeroRatio(hp);
            }
            // きのみ回復
            if (!this.lethalProb && recoveryFruit.includes(p2.item)) {
                hp = p2.fruitRecovery(hp);
            }
            // ターン終了時の処理
            if ((i+1) % this.nCombo == 0) {
                this.lethalNum += 1;
                // いのちのたま
                if (!this.lethalProb && this.orbDamage) {
                    const d = Math.trunc(p2.status[0]/10);
                    hp = offsetKeys(hp, -d);
                    if (i+1 == this.nCombo) {
                        totalConstDamage += d;
                        this.note.push(`いのちのたま(${-d})`);
                    }
                    // 致死判定
                    this.lethalProb = zeroRatio(hp);
                }
                // 天候ダメージ
                if (!this.lethalProb && this.weatherDamage && this.weather == 'すなあらし') {
                    let flag = true;
                    if (p2.terastal && p2.Ttype in Pokemon.typeID && p2.Ttype != 'ステラ') {
                        if (['いわ', 'じめん', 'はがね'].includes(p2.Ttype)) {
                            flag = false;
                        }
                    } else if (['すなかき','すながくれ','すなのちから','ぼうじん','マジックガード'].includes(p2.ability)) {
                        flag = false;
                    } else if (p2.item != 'ぼうじんゴーグル' || !p2.hasItem) {
                        flag = false;
                    } else {
                        for (let type of p2.type) {
                            if (['いわ', 'じめん', 'はがね'].includes(type)) {
                                flag = false;
                                break;
                            }
                        }
                    }
                    if (flag) {
                        const d = Math.trunc(p2.status[0]/16);
                        hp = offsetKeys(hp, -d);
                        // 致死判定
                        this.lethalProb = zeroRatio(hp);
                        // きのみ回復
                        if (!this.lethalProb && recoveryFruit.includes(p2.item)) {
                            hp = p2.fruitRecovery(hp);
                        }
                        if (i+1 == this.nCombo) {
                            totalConstDamage += d;
                            this.note.push(`すなあらし(${-d})`);
                        }
                    }
                }
                // 天候に関する特性
                if (!this.lethalProb && this.weatherDamage) {
                    let h = 0;
                    if (this.weather == 'はれ') {
                        if (['かんそうはだ','サンパワー'].includes(p2.ability)) {
                            h = -Math.trunc(p2.status[0]/8);
                        }
                    } else if (this.weather == 'あめ') {
                        if (p2.ability == 'あめうけざら') {
                            h = Math.trunc(p2.status[0]/16);
                        } else if (p2.ability == 'かんそうはだ') {
                            h = Math.trunc(p2.status[0]/8);
                        }
                    } else if (this.weather == 'ゆき') {
                        if (p2.ability == 'アイスボディ') {
                            h = Math.trunc(p2.status[0]/16);
                        }
                    }
                    if (h) {
                        hp = offsetKeys(hp, h);
                        if (h < 0) {
                            totalConstDamage += h;
                            // 致死判定
                            this.lethalProb = zeroRatio(hp);
                            // きのみ回復
                            if (!this.lethalProb && recoveryFruit.includes(p2.item)) {
                                hp = p2.fruitRecovery(hp);
                            }
                        }
                        if (i+1 == this.nCombo) {
                            this.note.push(`${p2.ability}(${h>0 ? '+' : ''}${h})`);
                        }
                    }
                }
                // グラスフィールド
                if (!this.lethalProb && this.glassRecovery && this.field == 'グラスフィールド') {
                    let flag = true;
                    if (p2.terastal && p2.Ttype == 'ひこう' && p2.Ttype != 'ステラ') {
                        flag = false;
                    } else {
                        if (p2.type.includes('ひこう')) {
                            flag = false;
                        }
                    }
                    if (flag) {
                        let h = Math.trunc(p2.status[0]/16);
                        hp = offsetKeys(hp, h);
                        if (i+1 == this.nCombo) {
                            //totalConstDamage -= h;
                            this.note.push(`グラスフィールド(+${h})`);
                        }
                    }
                }
                // たべのこし
                if (!this.lethalProb && p2.item == 'たべのこし' && p2.hasItem) {
                    let h = Math.trunc(p2.status[0]/16);
                    hp = offsetKeys(hp, h);
                    if (i+1 == this.nCombo) {
                        //totalConstDamage -= h;
                        this.note.push(`たべのこし(+${h})`);
                    }
                }
                if (!this.lethalProb && p2.item == 'くろいヘドロ' && p2.hasItem) {
                    let r = -1/8;
                    if (p2.terastal) {
                        if (p2.Ttype == 'どく' || (p2.Ttype == 'ステラ' && p2.type.includes('どく'))) {
                            r = 1/16;
                        }
                    } else if (p2.type.includes('どく')) {
                        r = 1/16;
                    }
                    const h = Math.sign(r)*Math.trunc(p2.status[0]*Math.abs(r));
                    hp = offsetKeys(hp, h);
                    if (i+1 == this.nCombo) {
                        //totalConstDamage -= h;
                        this.note.push(`くろいへどろ(${(h > 0 ? '+' : '')}${h})`);
                    }
                    // 致死判定
                    if (h < 0) {
                        this.lethalProb = zeroRatio(hp);
                    }
                }
                // アクアリング（未実装）
                // ねをはる（未実装）
                // 状態異常
                if (!this.lethalProb && this.ailmentDamage && ['どく', 'やけど'].includes(p2.ailment)) {
                    let d;
                    if (p2.ailment == 'どく') {
                        d = Math.trunc(p2.status[0]/8);
                        if (p2.ability == 'ポイズンヒール') { d *= -1; }
                    } else {
                        d = Math.trunc(p2.status[0]/16);
                    }
                    hp = offsetKeys(hp, -d);
                    if (i+1 == this.nCombo) {
                        totalConstDamage += d;
                        this.note.push(`${p2.ailment}(${-d})`);
                    }
                    // 致死判定
                    this.lethalProb = zeroRatio(hp);
                    // きのみ回復
                    if (!this.lethalProb && recoveryFruit.includes(p2.item)) {
                        hp = p2.fruitRecovery(hp);
                    }
                }
                // のろい（未実装）
                // バインド（未実装）
                // 初ターン終了時の状態を保存
                if (i+1 == this.nCombo) {
                    this.hp = {...hp};
                }
                if (this.lethalProb) { break; }
            }
        }
        this.totalDamage = offsetKeys(this.totalDamage, totalConstDamage);
    }
    // ダメージ計算と致死率計算を行い、結果を文字列で返す
    damageText({attackSide, move, maxRepeat=10, format='full', damageDigits=1, lethalProbDigits=2}) {
        this.attackSide = attackSide;
        this.move = move;
        this.maxRepeat = maxRepeat;
        if (move == 'トリプルアクセル') {
            this.subDamage = [];
            for (let i=1; i<this.nCombo; i++) {
                if (!this.calculateDamage(move, i+1)) { return ''; }
                this.subDamage.push(this.damage);
            }
        }
        if (!this.calculateDamage(move)) { return ''; }
        this.lethal();

        let p2 = (this.attackSide == 0) ? this.pokemon[1] : this.pokemon[0];
        return p2.damageText({
            minDamage:Math.min(...Object.keys(this.totalDamage)), maxDamage:Math.max(...Object.keys(this.totalDamage)),
            lethalProb:this.lethalProb, lethalNum:this.lethalNum, format:format, damageDigits:damageDigits, lethalProbDigits:lethalProbDigits,
        });
    }  
}

// ダメージ計算例
(async () => {
    await Pokemon.init()
    
    let p1 = new Pokemon('ハバタクカミ');
    p1.loadZukan();
    p1.nature = 'ひかえめ';
    //p1.ability = 'フェアリースキン';
    p1.effort = [0,252,0,252,0,0];
    //p1.item = 'こだわりメガネ';
    p1.Ttype = 'ステラ';
    //p1.rank[1] = p1.rank[3] = 1;
    //p1.ailment = 'やけど';
    p1.terastal = true;
    p1.updateStatus();

    let p2 = new Pokemon('カイリュー');
    p2.loadZukan();
    //p2.nature = 'いじっぱり';
    p2.ability = 'マルチスケイル';
    p2.effort = [252,0,0,0,0,0];
    p2.item = 'たべのこし';
    //p2.Ttype = 'はがね';
    //p2.rank[2] = p1.rank[4] = 1;
    //p2.ailment = 'やけど';
    //p2.terastal = true;
    p2.updateStatus();

    let attackSide = 0
    let moves = ['ムーンフォース'];
    //let moves = ['すいりゅうれんだ', 'アクアジェット'];

    let damageTexts = [], notes = [], hp, lethalProb, lethalNum, damageRange = [0, 0];

    for (let i=0; i<moves.length; i++) {
        let battle = new Battle(p1.clone(), p2.clone());
        //battle.weather = 'はれ'
        //battle.field = 'エレキフィールド'
        //battle.reflector = battle.lightwall = true
        //battle.stealthrockDamage = true
        if (Pokemon.criticalMoves.includes(moves[i])) {
            battle.critical = true;
        }
        if (moves[i] in Pokemon.comboMoves) {
            battle.nCombo = Pokemon.comboMoves[moves[i]][1];
        }
        damageTexts.push(
            battle.damageText({
                attackSide: attackSide,
                move: moves[i],
                format: 'full',
                damageDigits: 1,
                lethalProbDigits: 2,
            })
        );
        notes.push(battle.note);
        console.log(battle.damage);
        damageRange[0] += Math.min(...Object.keys(battle.totalDamage));
        damageRange[1] += Math.max(...Object.keys(battle.totalDamage));
        if (i > 0) {
            battle.maxRepeat = 1;
            battle.lethal(hp);
        }
        hp = {...battle.hp};
        lethalProb = battle.lethalProb;
        lethalNum = battle.lethalNum;
    }
    console.log(p1);
    console.log(p2);
    console.log(damageTexts);
    console.log(notes);
    console.log(p2.damageText({
        minDamage:damageRange[0],maxDamage:damageRange[1],lethalProb:lethalProb,lethalNum:lethalNum,
    }));
})//()