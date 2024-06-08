const DEBUG = false;

import {
    toKatakana, addSelectOptions, loadImage, drawImage, toGrayscale, toBinary, trim, ocr, rectBorder,
    templateMatch, mostLikelyElement, subset, subWindowOption, videoStream, setAnnotation, sortObj,
} from './common.js';
import { Pokemon, Battle } from './pokemon.js';
import { Storage } from './storage.js';
import { createCombobox } from './combobox.js';
import { ImageSelector } from './imageselect.js';

class PokemonBattleAssistant {
    IS_INIT = false;
    FPS = 60; // キャプチャ画面のリフレッシュレート
    GAME_TIME_MINUIT = 20;
    N_DEFENCE_DAMAGE; // 被ダメージ表示数(=10)
    MIN_DAMAGE_OPACITY = 0.4; // 小ダメージ表示の透明度の下限
    MIN_MOVE_ADOPTION_RATE = 20; // 選出ガイドの被ダメージ計算で考慮する、技の採用率の下限
    MIN_ITEM_TTYPE_ADOPTION_RATE = 10; // バランスチェックで考慮する、持ち物とテラスタイプの採用率の下限
    ICON_SIZE = '90px';
    ENEMY_ICON_TRIM_BORDER = 200; // 見せ合い画面での相手ポケモン画像のトリム閾値
    #party = new Array(6); // 自分パーティ
    #enemy = new Array(6); // 相手パーティ
    #battle;
    #partySelectionWeight = new Array(6).fill(1); // 自分ポケモンの選出重み
    #enemySelectionWeight = new Array(6).fill(1); // 相手ポケモンの選出重み
    startTime = 0; // 試合開始時刻
    #fieldPokemonIndex = 0; // 場の自分ポケモンの番号
    #fieldEnemyIndex = 0; // 場の相手ポケモンの番号
    #enemyHPratio = new Array(6).fill(1); // 相手ポケモンの残りHP割合
    #appStorage; // このアプリのローカルストレージ
    #pokemonStorage; // ポケモン登録アプリのローカルストレージ
    #captureVideo;
    #matchingIcon; // 見せ合い画面の識別画像
    #battleIcon; // バトル画面の識別画像
    #isPokemonNameStable = false; // true: 読み取った場の自分ポケモンの名前が再現した
    #isEnemyNameStable = false; // true: 読み取った場の相手ポケモンの名前が再現した
    #isHPstable = false; // true: 読み取った場の自分ポケモンのHPが再現した
    #attackEnhance = new Array(4).fill(true); // true: 威力変動技を強化する
    #attackNotes = new Array(4).fill([]); // 読ダメージ計算時の考慮事項
    #defenceEnhance;
    #defenceNotes;
    #mediaDevices;
    #deviceLabel;
    recognizeEnemy = new Array(6).fill(true); // false: 見せ合い画面で相手ポケモンの読み取りが完了している
    recognizeHP = true; // true: 自分ポケモンのHPを認識する
    recognizeEnemyHP = true; // true: 相手ポケモンのHPを認識する
    guideSelection = true; // true: 選出ガイドを表示する
    damageShade = true;
    damageColor = false;
    templateLength = 300;
    #trend = []; // バランスチェックで表示したポケモン使用率順
    // Comboboxオブジェクト
    #cbName = [];
    #cbNature = [];
    #cbAbility = [];
    #cbItem = [];
    #cbTtype = [];
    #cbMove = [];
    #cbFilterNickname;
    #cbFilterName;
    #cbFilterType;
    #cbFilterAbility;
    #cbFilterItem;
    #cbFilterTtype;
    #cbFilterMove;

    constructor() {
        console.log('PokemonBattleAssistantを初期化中...');
        this.#appStorage = new Storage('battleAssistant');
        this.#pokemonStorage = new Storage('pokemonRegistration');
        this.N_DEFENCE_DAMAGE = document.querySelectorAll('.defence-damage-box').length;
        this.#defenceEnhance = new Array(this.N_DEFENCE_DAMAGE).fill(true);
        this.#defenceNotes = new Array(this.N_DEFENCE_DAMAGE).fill([]);
        // ストレージの読み込み
        if (this.#appStorage.includes('recognize-enemy')) {
            this.recognizeEnemy = this.#appStorage.getItem('recognize-enemy');
        }
        if (this.#appStorage.includes('template-length')) {
            this.templateLength = this.#appStorage.getItem('template-length');
        }
        if (this.#appStorage.includes('guide-selection')) {
            this.guideSelection = this.#appStorage.getItem('guide-selection');
        }
        if (this.#appStorage.includes('recognize-hp')) {
            this.recognizeHP = this.#appStorage.getItem('recognize-hp');
        }
        if (this.#appStorage.includes('recognize-enemy-hp')) {
            this.recognizeEnemyHP = this.#appStorage.getItem('recognize-enemy-hp');
        }
        if (this.#appStorage.includes('damage-shade')) {
            this.damageShade = this.#appStorage.getItem('damage-shade');
        }
        if (this.#appStorage.includes('damage-color')) {
            this.damageColor = this.#appStorage.getItem('damage-color');
        }
        // canvas要素の初期化
        this.trimCanvas = document.getElementById('canvas-trim');
        this.templCanvas = document.getElementById('canvas-template');
        this.nameBuffCanvas1 = document.getElementById('canvas-name-buffer1');
        this.nameBuffCanvas2 = document.getElementById('canvas-name-buffer2');
        this.hpBuffCanvas = document.getElementById('canvas-hp-buffer');
        this.captureCanvas = document.getElementById('canvas-capture');
        this.screenCanvas = document.getElementById('canvas-screen')
        this.screenCanvas.width = 752;
        this.screenCanvas.height = 423;
        this.captureCanvas.width = 1920;
        this.captureCanvas.height = 1080;
        this.#captureVideo = document.getElementById("capture-video");
        this.#mediaDevices = {};
        // ビデオストリーム
        this.#deviceLabel = this.#appStorage.getItem('media');
        navigator.mediaDevices.enumerateDevices().then(devices => {
            // 映像デバイス一覧を取得する
            for (let device of devices) {
                if (device.deviceId) {
                    this.#mediaDevices[device.label] = device.deviceId;
                }
            }
            // ビデオストリームを開始する
            videoStream(this.#captureVideo, this.#mediaDevices[this.#deviceLabel] || '');
            setInterval(() => {
                // スクリーンに映し出す画像
                this.screenCanvas.getContext('2d').drawImage(
                    this.#captureVideo, 0, 0, 1920, 1080, 0, 0, this.screenCanvas.width, this.screenCanvas.height
                );
                if (!DEBUG) {
                    // 画面解析に使う画像（非表示）
                    this.captureCanvas.getContext('2d').drawImage(this.#captureVideo, 0, 0, this.captureCanvas.width, this.captureCanvas.height);
                }
            }, 1000/this.FPS);        
        });
        this.init();
    }
    // アプリの初期化
    async init() {
        // ポケモンモジュールの初期化
        try {
            await Pokemon.init();
        } catch(e) {
            if(window.confirm(`初期化に失敗しました。ページをリロードします\n${e.name}: ${e.message}`)) {
                location.reload();
            }
        }
        // 試合場面を識別するための画像を読み込む
        try {
            this.#matchingIcon = await loadImage('data/matching.png');
        } catch(e) {
            if(window.confirm(`初期化に失敗しました。ページをリロードします\n${e.name}: ${e.message}`)) {
                location.reload();
            }
        }
        try {
            this.#battleIcon = await loadImage('data/battle.png');
        } catch(e) {
            if(window.confirm(`初期化に失敗しました。ページをリロードします\n${e.name}: ${e.message}`)) {
                location.reload();
            }
        }
        for (let i=0; i<6; i++) {
            this.#party[i] = new Pokemon();
            this.#enemy[i] = new Pokemon();
        }
        this.#battle = new Battle(new Pokemon(), new Pokemon());
        // comboboxの初期化
        document.querySelectorAll('.name').forEach((combobox, i) => {
            this.#cbName.push(createCombobox(combobox));
            this.#cbName[i].addOptions(Object.keys(Pokemon.battleData).concat(Object.keys(Pokemon.zukan)));
        });
        document.querySelectorAll('.nature').forEach((combobox, i) => {
            this.#cbNature.push(createCombobox(combobox));
            this.#cbNature[i].addOptions(Object.keys(Pokemon.natureCorrections));
        });
        document.querySelectorAll('.ability').forEach(combobox => {
            this.#cbAbility.push(createCombobox(combobox));
        });
        document.querySelectorAll('.item').forEach((combobox, i) => {
            this.#cbItem.push(createCombobox(combobox));
            this.#cbItem[i].addOptions(Object.keys(Pokemon.items));
        });
        document.querySelectorAll('.Ttype').forEach((combobox, i) => {
            this.#cbTtype.push(createCombobox(combobox));
            this.#cbTtype[i].addOptions(Object.keys(Pokemon.typeID));
        });
        document.querySelectorAll('.move').forEach((combobox, i) => {
            this.#cbMove.push(createCombobox(combobox));
            this.#cbMove[i].addOptions(Object.keys(Pokemon.moves).sort());
        });
        document.querySelectorAll('.enemy-name').forEach(combobox => {
            createCombobox(combobox).addOptions(Object.keys(Pokemon.battleData).concat(Object.keys(Pokemon.zukan)));
        });
        this.#cbFilterNickname = createCombobox(document.getElementById('filter-nickname'));
        this.#cbFilterNickname.addOptions(Array.from(new Set(Object.keys(Pokemon.battleData).concat(Object.keys(Pokemon.zukan)))));
        this.#cbFilterName = createCombobox(document.getElementById('filter-name'));
        this.#cbFilterName.addOptions(Array.from(new Set(Object.keys(Pokemon.battleData).concat(Object.keys(Pokemon.zukan)))));
        this.#cbFilterType = createCombobox(document.getElementById('filter-type'));
        this.#cbFilterType.addOptions(Object.keys(Pokemon.typeID));
        this.#cbFilterAbility = createCombobox(document.getElementById('filter-ability'));
        this.#cbFilterAbility.addOptions(Pokemon.abilities.sort());
        this.#cbFilterItem = createCombobox(document.getElementById('filter-item'));
        this.#cbFilterItem.addOptions(Object.keys(Pokemon.items).sort());
        this.#cbFilterTtype = createCombobox(document.getElementById('filter-Ttype'));
        this.#cbFilterTtype.addOptions(Object.keys(Pokemon.typeID));
        this.#cbFilterMove = createCombobox(document.getElementById('filter-move'));
        this.#cbFilterMove.addOptions(Object.keys(Pokemon.moves).sort());
        // imageselectの初期化
        document.querySelectorAll('.imageselect').forEach(elem => {
            new ImageSelector(elem);
        });
        // 前回の設定を読み込む
        for (let i=0; i<6; i++) {
            let pokemon = new Pokemon();
            if (this.#appStorage.includes(`party${i}`)) {
                let jsObj = this.#appStorage.getItem(`party${i}`);
                for (let key in jsObj) {
                    pokemon[key] = (Array.isArray(jsObj[key])) ? jsObj[key].slice() : jsObj[key];
                }
            }
            this.setPokemon(i, pokemon, true);
            pokemon = new Pokemon();
            if (this.#appStorage.includes(`enemy${i}`)) {
                let jsObj = this.#appStorage.getItem(`enemy${i}`);
                for (let key in jsObj) {
                    pokemon[key] = (Array.isArray(jsObj[key])) ? jsObj[key].slice() : jsObj[key];
                }
            }
            this.setEnemyName(i, pokemon.name);
        }   
        if (this.#appStorage.includes('battle')) {
            let jsObj = this.#appStorage.getItem('battle');
            for (let key in jsObj) {
                if (key == 'pokemon') { continue; }
                this.#battle[key] = (Array.isArray(jsObj[key])) ? jsObj[key].slice() : jsObj[key];
            }
        }
        // 登録済みポケモンを呼び出すイベントを設定する
        document.querySelectorAll('.load-pokemon').forEach((elem, i) => {
            elem.addEventListener('click', () => {
                let pokemonListWrapper = document.querySelector('.pokemon-list-wrapper');
                if (pokemonListWrapper.style.display == 'block') {
                    this.display();
                    return;
                }
                this.display('pokemonList');
                document.querySelectorAll('.pokemon-list-main .registered-wrapper').forEach(elem => {
                    elem.remove();
                });
                this.#cbFilterNickname.comboboxNode.value = '';
                this.#cbFilterName.comboboxNode.value = '';
                this.#cbFilterType.comboboxNode.value = '';
                this.#cbFilterAbility.comboboxNode.value = '';
                this.#cbFilterItem.comboboxNode.value = '';
                this.#cbFilterTtype.comboboxNode.value = '';
                this.#cbFilterMove.comboboxNode.value = '';
                this.applyFilter(i);
                document.getElementById('filter-icon').addEventListener('click', () => {
                    this.#cbFilterNickname.comboboxNode.value = '';
                    this.#cbFilterName.comboboxNode.value = '';
                    this.#cbFilterType.comboboxNode.value = '';
                    this.#cbFilterAbility.comboboxNode.value = '';
                    this.#cbFilterItem.comboboxNode.value = '';
                    this.#cbFilterTtype.comboboxNode.value = '';
                    this.#cbFilterMove.comboboxNode.value = '';
                    this.applyFilter(i);
                });
                [this.#cbFilterNickname,this.#cbFilterName,this.#cbFilterType,this.#cbFilterTtype,this.#cbFilterAbility,
                    this.#cbFilterItem, this.#cbFilterTtype, this.#cbFilterMove].forEach(cb => {
                    ['input', 'change'].forEach(eventType => {
                        cb.comboboxNode.addEventListener(eventType, () => {
                            this.applyFilter(i);
                        });
                    });
                });            
            });
        });
        // ポケモンを登録するイベントを設定する
        document.querySelectorAll('.save-pokemon').forEach((elem, i) => {
            elem.addEventListener('click', () => {
                let subwin = window.open(
                    'pokemon_view.html', 'save_pokemon', subWindowOption(400, 620)
                );
                // サブウィンドウ
                subwin.addEventListener('load', () => {
                    subwin.document.getElementById('main-button').textContent = '保存';
                    this.setPokemonView(subwin, this.#party[i]);
                    let cb = createCombobox(subwin.document.querySelector('.combobox'));
                    cb.addOptions(this.#pokemonStorage.keys().sort());
                    cb.comboboxNode.value = this.#party[i].nickname || this.#party[i].name;
                    if (cb.comboboxNode.value && cb.comboboxNode.value.slice(-1) == '*') {
                        cb.comboboxNode.value = cb.comboboxNode.value.slice(0, cb.comboboxNode.value.length-1);
                    }
                    subwin.document.getElementById('main-button').addEventListener('click', ()=> {
                        let nickname = cb.comboboxNode.value;
                        if (nickname && nickname.slice(-1) != '*') {
                            if (this.#pokemonStorage.includes(nickname) && !subwin.confirm(`${nickname}はすでに登録されています。上書きしますか？`)) {
                                // いいえの場合は何もしない
                            } else {
                                this.#party[i].nickname = nickname;
                                this.#party[i].description = subwin.document.querySelector('#description textarea').value;
                                this.save();
                                this.#pokemonStorage.setItem(this.#party[i].nickname, this.#party[i].clone());
                                this.#pokemonStorage.save();
                                elem.src = 'img/saved.png';
                                console.log(`${nickname} を保存しました`);
                                subwin.close();
                            }
                        }
                    });
                });
            });
        });
        // バランスチェックで表示するポケモンをあらかじめ読み込む
        let names = Object.keys(Pokemon.battleData);
        document.querySelectorAll('#balance-check-main .trend').forEach(elem => {
            // ポケモン
            let name = names.shift();
            if (name.includes('オーガポン')) {
                let ability = Pokemon.zukan[name].ability[0];
                let ind = Pokemon.battleData[name].ability[0].indexOf(ability);
                if (Pokemon.battleData[name].ability[1][ind] < this.MIN_ITEM_TTYPE_ADOPTION_RATE) {
                    name = names.shift();
                }
            }
            let elem2 = elem.querySelector('.trend-pokemon')
            elem2.src = `data/icon/${Pokemon.iconFileCode[name]}.png`;
            // 注釈
            setAnnotation(elem2);
            elem2.addEventListener('mousemove', () => {
                let annotation = [];
                Pokemon.battleData[name].move[0].forEach((move, j) => {
                    let rate = Pokemon.battleData[name].move[1][j];
                    let text = (rate < 10) ? '&nbsp&nbsp;' : '';
                    text += `${Math.trunc(rate)}%&nbsp;&nbsp;&nbsp;${move}`;
                    annotation.push(text);
                });
                document.getElementById('annotation').innerHTML = annotation.join('<br>');
            });
            // 持ち物
            elem.querySelectorAll('.trend-item1, .trend-item2, .trend-item3').forEach((elem2, i) => {
                if (i < Pokemon.battleData[name].item[0].length && Pokemon.battleData[name].item[1][i] >= this.MIN_ITEM_TTYPE_ADOPTION_RATE) {
                    elem2.src = `data/item_img/${Pokemon.itemFileCode[Pokemon.battleData[name].item[0][i]]}.png`;
                    elem2.style.opacity = 1;
                } else {
                    elem2.src = '';
                    elem2.style.opacity = 0;
                }
                // 注釈
                setAnnotation(elem2);
                elem2.addEventListener('mousemove', () => {
                    let annotation = `${Math.trunc(Pokemon.battleData[name].item[1][i])}%`;
                    document.getElementById('annotation').innerHTML = annotation;
                });
            });
            // テラスタイプ
            elem.querySelectorAll('.trend-Ttype1, .trend-Ttype2, .trend-Ttype3').forEach((elem2, i) => {
                setAnnotation(elem2);
                if (i < Pokemon.battleData[name].Ttype[0].length && Pokemon.battleData[name].Ttype[1][i] >= this.MIN_ITEM_TTYPE_ADOPTION_RATE) {
                    elem2.src = `data/type_img/${Pokemon.typeFileCode[Pokemon.battleData[name].Ttype[0][i]]}.png`;
                    elem2.style.opacity = 1;
                } else {
                    elem2.src = '';
                    elem2.style.opacity = 0;
                }
                // 注釈
                setAnnotation(elem2);
                elem2.addEventListener('mousemove', () => {
                    let annotation = `${Math.trunc(Pokemon.battleData[name].Ttype[1][i])}%`;
                    document.getElementById('annotation').innerHTML = annotation;
                });
            });
            this.#trend.push(name);
        });
        this.setEventListener();
        this.IS_INIT = true;
        console.log('PokemonBattleAssistantを初期化しました');
    }
    // 表示画面を切り替える
    display(mode='main') {
        document.getElementById('balance-check-wrapper').style.display = (mode == 'balanceCheck') ? 'block' : 'none';
        document.querySelector('.pokemon-list-wrapper').style.display = (mode == 'pokemonList') ? 'block' : 'none';
    }
    // ダメージ計算を表示していればtrueを返す
    isMainMode() {
        if (document.getElementById('balance-check-wrapper').style.display == 'block') { return false; }
        if (document.querySelector('.pokemon-list-wrapper').style.display == 'block') { return false; }
        return true;
    }
    // 現在の状態を保存する
    save() {
        for (let i=0; i<6; i++) {
            this.#appStorage.setItem(`party${i}`, this.#party[i]);
            this.#appStorage.setItem(`enemy${i}`, this.#enemy[i]);
        }    
        this.#appStorage.setItem('battle', this.#battle);   
        this.#appStorage.setItem('media', this.#deviceLabel);
        this.#appStorage.setItem('recognize-enemy', this.recognizeEnemy);
        this.#appStorage.setItem('template-length', this.templateLength);
        this.#appStorage.setItem('guide-selection', this.guideSelection);
        this.#appStorage.setItem('recognize-hp', this.recognizeHP);
        this.#appStorage.setItem('recognize-enemy-hp', this.recognizeEnemyHP);
        this.#appStorage.setItem('damage-shade', this.damageShade);
        this.#appStorage.setItem('damage-color', this.damageColor);

        this.#appStorage.save();
    } 
    // 登録済みポケモンを選択画面に追加する
    addRegistered(nickname, ind) {
        let pokemon = this.#pokemonStorage.getItem(nickname);
        let clone = document.querySelector('.registered-wrapper').cloneNode('true');
        clone.querySelector('.registered-icon img').src = `data/icon/${Pokemon.iconFileCode[pokemon.name]}.png`;
        clone.querySelector('.registered-nickname').textContent = nickname;
        clone.querySelector('.registered-ability').textContent = pokemon.ability;
        clone.querySelector('.registered-item').src = 
            (pokemon.item in Pokemon.items) ? `data/item_img/${Pokemon.itemFileCode[pokemon.item]}.png` : '';
        clone.querySelector('.registered-Ttype').src =
            (pokemon.Ttype in Pokemon.typeID) ? `data/type_img/${Pokemon.typeFileCode[pokemon.Ttype]}.png` : '';
            clone.querySelectorAll('.registered-status span').forEach((elem, i) => {
                elem.textContent = `${pokemon.status[i]}`
                if (Pokemon.natureCorrections[pokemon.nature][i] > 1) {
                    elem.style.color = '#ff0000';
                } else if (Pokemon.natureCorrections[pokemon.nature][i] < 1) {
                    elem.style.color = '#0000ff';
                } else {
                    elem.style.color = '#000000';
                }
            });
        clone.querySelectorAll('.registered-status span').forEach((elem, i) => {
            elem.textContent = `${pokemon.status[i]}`
            if (Pokemon.natureCorrections[pokemon.nature][i] > 1) {
                elem.style.color = '#ff0000';
            } else if (Pokemon.natureCorrections[pokemon.nature][i] < 1) {
                elem.style.color = '#0000ff';
            } else {
                elem.style.color = '#000000';
            }
        });
        clone.querySelectorAll('.registered-effort span').forEach((elem, i) => {
            elem.textContent = `${pokemon.effort[i]}`
        });
        clone.querySelectorAll('.registered-move div').forEach((elem, i) => {
            let move = pokemon.move[i];
            elem.textContent = move;
            if (move in Pokemon.moves) {
                elem.style.background = `${Pokemon.typeColor[Pokemon.moves[move].type]}`;
                elem.style.opacity = 0.9;
            } else {
                elem.style.background = '#ffffff';
                elem.style.opacity = 1;
            }
        });
        clone.querySelector('.registered-delete').addEventListener('click', event => {
            if (window.confirm(`${pokemon.nickname}を削除しますか？`)) {
                this.#pokemonStorage.delete(pokemon.nickname);
                this.#pokemonStorage.save();
                clone.remove();
                this.display();
            }
            event.stopImmediatePropagation();
        });
        clone.querySelector('.registered').addEventListener('click', () => {
            let p = new Pokemon();
            for (let key in pokemon) {
                p[key] = (Array.isArray(pokemon[key])) ? pokemon[key].slice() : pokemon[key];
            }
            p.level = 50;
            this.setPokemon(ind, p, true);
            this.display();
            this.save();
        });
        setAnnotation(clone.querySelector('.registered'));
        clone.querySelector('.registered').addEventListener('mousemove', () => {
            document.getElementById('annotation').innerText = pokemon.description;
        });
        document.querySelector('.pokemon-list-main').appendChild(clone);
    }
    // 自分パーティにポケモンを追加する
    setPokemon(ind, pokemon, keepNickname=false) {
        this.setPokemonName(ind, pokemon.name, keepNickname);
        this.setPokemonNature(ind, pokemon.nature, keepNickname);
        this.setPokemonAbility(ind, pokemon.ability, keepNickname);
        this.setPokemonItem(ind, pokemon.item, keepNickname);
        this.setPokemonTtype(ind, pokemon.Ttype, keepNickname);
        for (let j=0; j<6; j++) {
            this.setPokemonIndiv(ind, j, pokemon.indiv[j], keepNickname);
            this.setPokemonEffort(ind, j, pokemon.effort[j], keepNickname);
        }
        for (let j=0; j<4; j++) {
            this.setPokemonMove(ind, j, pokemon.move[j], keepNickname);
        }
        this.#party[ind] = pokemon.clone();
        document.querySelectorAll('.save-pokemon')[ind].src =
            (this.#pokemonStorage.includes(this.#party[ind].nickname)) ? 'img/saved.png' : 'img/unsaved.png';
    }
    // 自分パーティのポケモンの名前を設定する
    setPokemonName(ind, name, keepNickname=false) {
        let inputElement = this.#cbName[ind].comboboxNode;
        let img = document.querySelectorAll('.img-pokemon img')[ind];
        if (!(name in Pokemon.zukan)) {
            this.#party[ind] = new Pokemon();
            img.src = `data/item_img/${Pokemon.itemFileCode['モンスターボール']}.png`;
            img.style.width = img.style.height = '40px';
            // 個体情報をリセット
            this.setPokemonNature(ind, '', keepNickname);
            this.setPokemonAbility(ind, '', keepNickname);
            this.setPokemonItem(ind, '', keepNickname);
            this.setPokemonTtype(ind, '', keepNickname);
            for (let j=0; j<6; j++) {
                this.setPokemonIndiv(ind, j, 31, keepNickname);
                this.setPokemonEffort(ind, j, 0, keepNickname);
            }
            for (let j=0; j<4; j++) {
                this.setPokemonMove(ind, j, '', keepNickname);
            }                  
        } else {
            this.#party[ind] = new Pokemon(name);
            this.#party[ind].loadZukan();
            this.#party[ind].updateStatus();
            // プルダウンの候補を使用率順に並べる
            let options = (name in Pokemon.battleData) ?
                Pokemon.battleData[name].ability[0] : Pokemon.zukan[this.#party[ind].name].ability;
            this.#cbAbility[ind].addOptions(options, true);
            options = (name in Pokemon.battleData) ? Pokemon.battleData[name].item[0] : [];
            options = options.concat(Object.keys(Pokemon.items))
            this.#cbItem[ind].addOptions(Array.from(new Set(options)), true);
            options = (name in Pokemon.battleData) ? Pokemon.battleData[name].Ttype[0] : [];
            options = options.concat(Object.keys(Pokemon.typeID))
            this.#cbTtype[ind].addOptions(Array.from(new Set(options)), true);
            options = (name in Pokemon.battleData) ? Pokemon.battleData[name].move[0] : [];
            options = options.concat(Object.keys(Pokemon.moves))
            for (let j=0; j<4; j++) {
                this.#cbMove[4*ind+j].addOptions(Array.from(new Set(options)), true);
            }
            inputElement.value = this.#party[ind].name;
            img.src = `data/icon/${Pokemon.iconFileCode[name]}.png`;
            img.style.width = img.style.height = this.ICON_SIZE;
            img.style.top = '32px';
            img.style.right = '0px';
        }
        if (!keepNickname && this.#party[ind].nickname.slice(-1) != '*') {
            this.#party[ind].nickname += '*';
            document.querySelectorAll('.save-pokemon')[ind].src = 'img/unsaved.png';
        }
    } 
    // 自分パーティのポケモンの性格を設定する
    setPokemonNature(ind, nature, keepNickname=false) {
        this.#party[ind].nature = (nature in Pokemon.natureCorrections) ? nature : 'まじめ';
        this.#party[ind].updateStatus();
        this.#cbNature[ind].comboboxNode.value =
            (!this.#party[ind].name && this.#party[ind].nature == 'まじめ') ? '' : nature;
        for (let j=0; j<6; j++) {
            document.querySelectorAll('.status')[ind].querySelector(`input:nth-child(${j+1})`).value = this.#party[ind].status[j];
        }

        if (!keepNickname && this.#party[ind].nickname.slice(-1) != '*') {
            this.#party[ind].nickname += '*';
            document.querySelectorAll('.save-pokemon')[ind].src = 'img/unsaved.png';
        }
    }
    // 自分パーティのポケモンの特性を設定する
    setPokemonAbility(ind, ability, keepNickname=false) {
        this.#party[ind].ability = ability;
        this.#cbAbility[ind].comboboxNode.value = ability;

        if (!keepNickname && this.#party[ind].nickname.slice(-1) != '*') {
            this.#party[ind].nickname += '*';
            document.querySelectorAll('.save-pokemon')[ind].src = 'img/unsaved.png';
        }
    }
    // 自分パーティのポケモンの持ち物を設定する
    setPokemonItem(ind, item, keepNickname=false) {
        const inputElement = this.#cbItem[ind].comboboxNode;
        const img = document.querySelectorAll('.img-item')[ind];

        if (!(item in Pokemon.items)) {
            this.#party[ind].item = '';
            img.style.opacity = 0;
        } else {
            this.#party[ind].item = item;
            img.src = `data/item_img/${Pokemon.itemFileCode[item]}.png`;
            img.style.opacity = 1;
        }
        inputElement.value = this.#party[ind].item;

        if (!keepNickname && this.#party[ind].nickname.slice(-1) != '*') {
            this.#party[ind].nickname += '*';
            document.querySelectorAll('.save-pokemon')[ind].src = 'img/unsaved.png';
        }
    }
    // 自分パーティのポケモンのテラスタイプを設定する
    setPokemonTtype(ind, type, keepNickname=false) {
        const inputElement = this.#cbTtype[ind].comboboxNode;
        const img = document.querySelectorAll('.img-Ttype')[ind];

        if (!(type in Pokemon.typeID)) {
            this.#party[ind].Ttype = '';
            inputElement.value = '';
            img.style.opacity = 0;
        } else {
            this.#party[ind].Ttype = type;
            inputElement.value = this.#party[ind].Ttype;
            img.src = `data/type_img/${Pokemon.typeFileCode[type]}.png`;
            img.style.opacity = 1;
        }

        if (!keepNickname && this.#party[ind].nickname.slice(-1) != '*') {
            this.#party[ind].nickname += '*';
            document.querySelectorAll('.save-pokemon')[ind].src = 'img/unsaved.png';
        }
    }
    // 自分パーティのポケモンの個体値を設定する
    setPokemonIndiv(ind, ind2, value, keepNickname=false) {
        this.#party[ind].indiv[ind2] = Math.min(31, Math.max(0, value));
        this.#party[ind].updateStatus();
        document.querySelectorAll('.indiv')[ind].querySelector(`input:nth-child(${ind2+1})`).value = this.#party[ind].indiv[ind2];
        document.querySelectorAll('.status')[ind].querySelector(`input:nth-child(${ind2+1})`).value = this.#party[ind].status[ind2];

        if (!keepNickname && this.#party[ind].nickname.slice(-1) != '*') {
            this.#party[ind].nickname += '*';
            document.querySelectorAll('.save-pokemon')[ind].src = 'img/unsaved.png';
        }
    }
    // 自分パーティのポケモンの努力値を設定する
    setPokemonEffort(ind, ind2, value, keepNickname=false) {
        this.#party[ind].effort[ind2] = Math.min(252, Math.max(0, value));
        this.#party[ind].updateStatus();
        document.querySelectorAll('.effort')[ind].querySelector(`input:nth-child(${ind2+1})`).value = this.#party[ind].effort[ind2];
        document.querySelectorAll('.status')[ind].querySelector(`input:nth-child(${ind2+1})`).value = this.#party[ind].status[ind2];

        if (!keepNickname && this.#party[ind].nickname.slice(-1) != '*') {
            this.#party[ind].nickname += '*';
            document.querySelectorAll('.save-pokemon')[ind].src = 'img/unsaved.png';
        }
    }
    // 自分パーティのポケモンのステータスを設定する
    setPokemonStatus(ind, ind2, value, keepNickname=false) {
        let effort = this.#party[ind].getEffort(ind2, value);
        if (effort < 0) { return; }
        this.#party[ind].effort[ind2] = effort;
        this.#party[ind].updateStatus();
        document.querySelectorAll('.effort')[ind].querySelector(`input:nth-child(${ind2+1})`).value = this.#party[ind].effort[ind2];

        if (!keepNickname && this.#party[ind].nickname.slice(-1) != '*') {
            this.#party[ind].nickname += '*';
            document.querySelectorAll('.save-pokemon')[ind].src = 'img/unsaved.png';
        }
    }
    // 自分パーティのポケモンの技を設定する
    setPokemonMove(ind, ind2, move, keepNickname=false) {
        if (!(move in Pokemon.moves)) {
            this.#party[ind].move[ind2] = '';
        } else {
            this.#party[ind].move[ind2] = move;
        }
        this.#cbMove[4*ind+ind2].comboboxNode.value = this.#party[ind].move[ind2];

        if (!keepNickname && this.#party[ind].nickname.slice(-1) != '*') {
            this.#party[ind].nickname += '*';
            document.querySelectorAll('.save-pokemon')[ind].src = 'img/unsaved.png';
        }
    }
    // 相手パーティのポケモンの名前を設定する
    setEnemyName(ind, name) {
        let inputElement = document.querySelectorAll('.enemy-name input')[ind];
        let img = document.querySelectorAll('.img-enemy img')[ind];
        if (!(name in Pokemon.zukan)) {
            this.#enemy[ind].name = '';
            img.src = `data/item_img/${Pokemon.itemFileCode['モンスターボール']}.png`;
            img.style.width = img.style.height = '34px';
        } else {
            this.#enemy[ind].name = name;
            this.#enemy[ind].loadZukan();
            this.#enemy[ind].updateStatus();
            img.src = `data/icon/${Pokemon.iconFileCode[this.#enemy[ind].name]}.png`;
            img.style.width = img.style.height = '68px';
        }
        inputElement.value = this.#enemy[ind].name;
    }
    setEventListener() {
        for (let i=0; i<6; i++) {
            // ボックス画面からポケモンを読み取る処理のイベントリスナー
            document.querySelectorAll('.img-pokemon img')[i].addEventListener('click', async () => {
                if (window.confirm('ボックスからポケモンを読み込みますか？')) {
                    await this.readBoxPokemon(i);
                    this.save();
                }
            });
            // ポケモン名が入力されたときのイベントリスナー
            this.#cbName[i].comboboxNode.addEventListener('change', async event =>  {
                this.setPokemonName(i, event.currentTarget.value);
                // ダメージ計算
                if (document.getElementById('balance-check-wrapper').style.display == 'block') {
                    this.updateBalanceCheck();
                } else if (this.currentPhase() != 'MATCHING') {
                    await this.updateFieldPokemon(true);
                    this.updateAttackDamage();
                    this.updateDefenceDamage(true);
                }   
                this.save();
            });
            // 性格が入力されたときのイベントリスナー
            this.#cbNature[i].comboboxNode.addEventListener('change', event => {
                this.setPokemonNature(i, event.currentTarget.value);
                // ダメージ計算
                if (document.getElementById('balance-check-wrapper').style.display == 'block') {
                    this.updateBalanceCheck();
                } else if (this.currentPhase() != 'MATCHING' && this.#fieldPokemonIndex == i) {
                    this.#battle.pokemon[0].nature = this.#party[i].nature;
                    this.#battle.pokemon[0].updateStatus();
                    this.updateAttackDamage();
                    this.updateDefenceDamage();
                }   
                this.save();
            });
            // 特性が入力されたときのイベントリスナー
            this.#cbAbility[i].comboboxNode.addEventListener('change', event => {
                this.setPokemonAbility(i, event.currentTarget.value);
                // ダメージ計算
                if (document.getElementById('balance-check-wrapper').style.display == 'block') {
                    this.updateBalanceCheck();
                } else if (this.currentPhase() != 'MATCHING' && this.#fieldPokemonIndex == i) {
                    this.#battle.pokemon[0].ability = this.#party[i].ability;
                    this.updateAttackDamage();
                    this.updateDefenceDamage();
                }   
                this.save();
            });
            // アイテムが入力されたときのイベントリスナー
            this.#cbItem[i].comboboxNode.addEventListener('change', event => {
                this.setPokemonItem(i, event.currentTarget.value);
                // ダメージ計算
                if (document.getElementById('balance-check-wrapper').style.display == 'block') {
                    this.updateBalanceCheck();
                } else if (this.currentPhase() != 'MATCHING' && this.#fieldPokemonIndex == i) {
                    this.#battle.pokemon[0].item = this.#party[i].item;
                    let img = document.getElementById('has-item');
                    if (this.#battle.pokemon[0].item in Pokemon.items) {
                        img.style.src = `data/item_img/${Pokemon.itemFileCode[this.#battle.pokemon[0].item]}.png`;
                        img.style.opacity = 1;
                    } else {
                        img.opacity = 0;
                    }
                    this.updateAttackDamage();
                    this.updateDefenceDamage();
                }   
                this.save();
            });
            // テラスタイプが入力されたときのイベントリスナー
            this.#cbTtype[i].comboboxNode.addEventListener('change', event => {
                this.setPokemonTtype(i, event.currentTarget.value);
                // ダメージ計算
                if (document.getElementById('balance-check-wrapper').style.display == 'block') {
                    this.updateBalanceCheck();
                } else if (this.currentPhase() != 'MATCHING' && this.#fieldPokemonIndex == i) {
                    this.#battle.pokemon[0].Ttype = this.#party[i].Ttype;
                    document.getElementById('terastal').style.opacity = 
                        (this.#battle.pokemon[0].Ttype in Pokemon.typeID) ? 1 : 0;
                    if (this.#battle.pokemon[0].terastal) {
                        this.updateAttackDamage();
                        this.updateDefenceDamage();
                    }
                }   
                this.save();
            });
            for (let j=0; j<6; j++) {
                // 個体値が入力されたときのイベントリスナー
                document.querySelectorAll('.indiv')[i].querySelector(`input:nth-child(${j+1})`).addEventListener('input', event => {
                    this.setPokemonIndiv(i, j, Number(event.currentTarget.value));
                    // ダメージ計算
                    if (document.getElementById('balance-check-wrapper').style.display == 'block') {
                        this.updateBalanceCheck();
                    } else if (this.currentPhase() != 'MATCHING' && this.#fieldPokemonIndex == i) {
                        this.#battle.pokemon[0].indiv[j] = this.#party[i].indiv[j];
                        this.#battle.pokemon[0].updateStatus();
                        this.updateAttackDamage();
                        this.updateDefenceDamage();
                    }   
                    this.save();
                });
                // 努力値が入力されたときのイベントリスナー
                document.querySelectorAll('.effort')[i].querySelector(`input:nth-child(${j+1})`).addEventListener('input', event => {
                    this.setPokemonEffort(i, j, Number(event.currentTarget.value));
                    // ダメージ計算
                    if (document.getElementById('balance-check-wrapper').style.display == 'block') {
                        this.updateBalanceCheck();
                    } else if (this.currentPhase() != 'MATCHING' && this.#fieldPokemonIndex == i) {
                        this.#battle.pokemon[0].effort[j] = this.#party[i].effort[j];
                        this.#battle.pokemon[0].updateStatus();
                        this.updateAttackDamage();
                        this.updateDefenceDamage();
                    }   
                    this.save();
                });
                // ステータスが入力されたときのイベントリスナー
                document.querySelectorAll('.status')[i].querySelector(`input:nth-child(${j+1})`).addEventListener('input', event => {
                    this.setPokemonStatus(i, j, Number(event.currentTarget.value));
                    // ダメージ計算
                    if (document.getElementById('balance-check-wrapper').style.display == 'block') {
                        this.updateBalanceCheck();
                    } else if (this.currentPhase() != 'MATCHING' && this.#fieldPokemonIndex == i) {
                        this.#battle.pokemon[0].effort[j] = this.#party[i].effort[j];
                        this.#battle.pokemon[0].updateStatus();
                        this.updateAttackDamage();
                        this.updateDefenceDamage();
                    }   
                    this.save();
                });
            }
            for (let j=0; j<4; j++) {
                // 技が入力されたときのイベントリスナー
                this.#cbMove[4*i+j].comboboxNode.addEventListener('change', event => {
                    this.setPokemonMove(i, j, event.currentTarget.value);
                    // ダメージ計算
                    if (document.getElementById('balance-check-wrapper').style.display == 'block') {
                        this.updateBalanceCheck();
                    } else if (this.currentPhase() != 'MATCHING' && this.#fieldPokemonIndex == i) {
                        this.#battle.pokemon[0].move[j] = this.#party[i].move[j];
                        this.updateAttackDamage();
                    }   
                    this.save();
                });
            }
            // 相手ポケモン名が入力されたときのイベントリスナー
            document.querySelectorAll('.enemy-name input')[i].addEventListener('change', async event => {
                this.recognizeEnemy[i] = false;
                this.setEnemyName(i, event.currentTarget.value);
                // ダメージ計算
                if (this.currentPhase() != 'MATCHING') {
                    await this.updateFieldEnemy(true);
                    this.updateAttackDamage();
                    this.updateDefenceDamage(true);
                }   
                this.save();
            });
            // 注釈表示
            let elem = document.querySelectorAll('.img-pokemon img')[i];
            setAnnotation(elem);
            elem.addEventListener('mousemove', () => {
                document.getElementById('annotation').innerHTML = (this.#party[i].name in Pokemon.zukan) ?
                    `${this.#party[i].type.join('・')}<br>${this.#party[i].base.join('-')}` : '';
            });
            elem = document.querySelectorAll('.img-enemy img')[i];
            setAnnotation(elem);
            elem.addEventListener('mousemove', () => {
                if (this.#enemy[i].name in Pokemon.zukan) {
                    document.getElementById('annotation').innerHTML =
                        `${this.#enemy[i].type.join('・')}<br>${this.#enemy[i].base.join('-')}<br>${this.#enemy[i].speedText()}`;
                } else {
                    document.getElementById('annotation').innerHTML = '';
                }
            });
        }    
        document.querySelectorAll('.attack-move').forEach((elem, i) => {
            if(i == 0) { return; }
            // 攻撃側の技名をクリックすると威力上昇を切り替える設定
            elem.addEventListener('click', () => {
                let move = this.#battle.pokemon[0].move[i-1];
                if (Pokemon.varPowMoves.includes(move)) {
                    this.#attackEnhance[i-1] = !this.#attackEnhance[i-1];
                    this.updateAttackDamage();
                }
            });
            // 注釈表示
            setAnnotation(elem);
            elem.addEventListener('mousemove', () => {
                let annotation = '';
                let move = this.#battle.pokemon[0].move[i-1];
                if (move in Pokemon.moves) {
                    let m = Pokemon.moves[move];
                    annotation = (m['power']) ?
                    `${m['type']}・${m['class']}<br>威力 ${m['power']}<br>命中 ${m['hit']}%<br>PP ${m['pp']} (${1.6*m['pp']})` :
                    `${m['type']}・${m['class']}<br>命中 ${m['hit']}%<br>PP ${m['pp']} (${1.6*m['pp']})`;
                    if (this.#attackNotes[i-1].length) {
                        annotation += `<br>補正：${this.#attackNotes[i-1].join(', ')}`;
                    }
                }
                document.getElementById('annotation').innerHTML = annotation;
            });
        });
        document.querySelectorAll('.defence-move').forEach((elem, i) => {
            if(i == 0) { return; }
            // 防御側の技名をクリックすると威力上昇を切り替える設定
            elem.addEventListener('click', () => {
                const name = this.#battle.pokemon[1].name;
                if (name in Pokemon.battleData && i-1 < Pokemon.battleData[name].move[0].length) {
                    let move = Pokemon.battleData[name].move[0][i-1];
                    if (Pokemon.varPowMoves.includes(move)) {
                        this.#defenceEnhance[i-1] = !this.#defenceEnhance[i-1];
                        this.updateDefenceDamage();
                    }
                }
            });
            // 注釈表示
            setAnnotation(elem);
            elem.addEventListener('mousemove', () => {
                let annotation = '';
                const name = this.#battle.pokemon[1].name;
                if (name in Pokemon.battleData && i-1 < Pokemon.battleData[name].move[0].length) {
                    let move = Pokemon.battleData[name].move[0][i-1];
                    if (move in Pokemon.moves) {
                        let m = Pokemon.moves[move];
                        annotation = (m['power']) ?
                        `${m['type']}・${m['class']}<br>威力 ${m['power']}<br>命中 ${m['hit']}%<br>PP ${m['pp']} (${1.6*m['pp']})` :
                        `${m['type']}・${m['class']}<br>命中 ${m['hit']}%<br>PP ${m['pp']} (${1.6*m['pp']})`;
                        if (this.#defenceNotes[i-1].length) {
                            annotation += `<br>補正：${this.#defenceNotes[i-1].join(', ')}`;
                        }
                    }
                }
                document.getElementById('annotation').innerHTML = annotation;
            });
        });
        // 急所が入力されたときのイベントリスナー
        document.getElementById('critical-attack').addEventListener('change', () => {
            // ダメージ計算
            if (this.currentPhase() != 'MATCHING') {
                this.updateAttackDamage();
            }   
        });
        document.getElementById('critical-defence').addEventListener('change', () => {
            // ダメージ計算
            if (this.currentPhase() != 'MATCHING') {
                this.updateDefenceDamage();
            }   
        });
        // ランク補正が入力されたときのイベントリスナー
        document.querySelectorAll('#rank, #enemy-rank').forEach((parent, ind) => {
            parent.querySelectorAll('input').forEach((elem, j) => {
                elem.addEventListener('change', event => {
                    this.#battle.pokemon[ind].rank[j+1] = Number(event.currentTarget.value);
                    // ダメージ計算
                    if (this.currentPhase() != 'MATCHING') {
                        this.updateAttackDamage();
                        this.updateDefenceDamage();
                    }
                });
            });
        });
        // 状態異常が入力されたときのイベントリスナー
        document.querySelectorAll("#ailment, #enemy-ailment").forEach((parent, ind) => {
            parent.querySelectorAll("input").forEach(radio => {
                radio.addEventListener("click", () => {
                    let ailment;
                    if (radio.classList.contains("is-checked")) {
                        radio.classList.remove("is-checked");
                        radio.checked = false;
                        ailment = '';
                    } else {
                        document.querySelectorAll("#ailment input.is-checked").forEach((checkedRadio) => {
                            checkedRadio.classList.remove("is-checked");
                        });
                        radio.classList.add("is-checked");
                        ailment = radio.value;
                    }
                    this.#battle.pokemon[ind].ailment = ailment;
                    if (ind == 0) {
                        this.#party[this.#fieldPokemonIndex].ailment = ailment;
                    } else {
                        this.#enemy[this.#fieldEnemyIndex].ailment = ailment;
                    }
                    // ダメージ計算
                    if (this.currentPhase() != 'MATCHING') {
                        this.updateAttackDamage();
                        this.updateDefenceDamage();
                    }
                });
            });
        });
        // リフレクター・ひかりのかべが入力されたときのイベントリスナー
        document.getElementById('wall').addEventListener('change', () => {
            // ダメージ計算
            if (this.currentPhase() != 'MATCHING') {
                this.updateDefenceDamage();
            }
        });
        document.getElementById('enemy-wall').addEventListener('change', () => {
            // ダメージ計算
            if (this.currentPhase() != 'MATCHING') {
                this.updateAttackDamage();
            }
        });
        // 天候が入力されたときのイベントリスナー
        document.querySelectorAll("#weather input").forEach(radio => {
            radio.addEventListener("click", () => {
                if (radio.classList.contains("is-checked")) {
                    radio.classList.remove("is-checked");
                    radio.checked = false;
                    this.#battle.weather = '';
                } else {
                    document.querySelectorAll("#weather input.is-checked").forEach((checkedRadio) => {
                        checkedRadio.classList.remove("is-checked");
                    });
                    radio.classList.add("is-checked");
                    this.#battle.weather = radio.value;
                }
                // ダメージ計算
                if (this.currentPhase() != 'MATCHING') {
                    this.updateAttackDamage();
                    this.updateDefenceDamage();
                }
            });
        });
        // フィールドが入力されたときのイベントリスナー
        document.querySelectorAll("#field input").forEach(radio => {
            radio.addEventListener("click", () => {
                if (radio.classList.contains("is-checked")) {
                    radio.classList.remove("is-checked");
                    radio.checked = false;
                    this.#battle.field = '';
                } else {
                    document.querySelectorAll("#field input.is-checked").forEach((checkedRadio) => {
                        checkedRadio.classList.remove("is-checked");
                    });
                    radio.classList.add("is-checked");
                    this.#battle.field = radio.value;
                }
                // ダメージ計算
                if (this.currentPhase() != 'MATCHING') {
                    this.updateAttackDamage();
                    this.updateDefenceDamage();
                }
            });
        });
        // 場の自分ポケモン名前が入力されたときのイベントリスナー
        document.querySelectorAll('#field-pokemon img').forEach(elem => {
            elem.addEventListener('click', () => {
                this.setFieldPokemonIndex(elem.value);
                // ダメージ計算
                if (this.currentPhase() != 'MATCHING') {
                    this.updateAttackDamage();
                    this.updateDefenceDamage(true);
                }
            });
        });
        let elem = document.querySelector('#field-pokemon .ImageSelector__display');
        setAnnotation(elem);
        elem.addEventListener('mousemove', () => {
            document.getElementById('annotation').innerHTML = (this.#battle.pokemon[0].name in Pokemon.zukan) ?
                `HP ${this.#battle.pokemon[0].hp}<br>素早さ ${this.#battle.pokemon[0].getEffSpeed(this.#battle.weather)}` : '';
        });
        // 場の相手ポケモン名が入力されたときのイベントリスナー
        document.querySelectorAll('#field-enemy img').forEach(elem => {
            elem.addEventListener('click', () => {
                this.setFieldEnemyIndex(elem.value);
                // ダメージ計算
                if (this.currentPhase() != 'MATCHING') {
                    this.updateAttackDamage();
                    this.updateDefenceDamage(true);
                }
            });
        });
        elem = document.querySelector('#field-enemy .ImageSelector__display');
        setAnnotation(elem);
        elem.addEventListener('mousemove', () => {
            document.getElementById('annotation').innerHTML = (this.#battle.pokemon[1].name in Pokemon.zukan) ?
                `HP ${Math.trunc(this.#enemyHPratio[this.#fieldEnemyIndex]*100)}%<br>
                ${this.#battle.pokemon[1].speedText(this.#battle.weather, '<br>')}` : '';
        });
        // テラスタルが入力されたときのイベントリスナー
        document.getElementById('terastal').addEventListener('click', () => {
            this.#battle.pokemon[0].terastal = !this.#battle.pokemon[0].terastal;
            this.#party[this.#fieldPokemonIndex].terastal = this.#battle.pokemon[0].terastal;
            document.getElementById('terastal').src = this.#battle.pokemon[0].terastal ? "img/terastal_on.svg" : "img/terastal_off.svg";
            // ダメージ計算
            if (this.currentPhase() != 'MATCHING') {
                this.updateAttackDamage();
                this.updateDefenceDamage();
            }
        });
        // もちもの有無が入力されたときのイベントリスナー
        document.getElementById('has-item').addEventListener('click', () => {
            this.#battle.pokemon[0].hasItem = !this.#battle.pokemon[0].hasItem;
            this.#party[this.#fieldPokemonIndex].hasItem = this.#battle.pokemon[0].hasItem;
            document.getElementById('has-item').style.opacity = (this.#battle.pokemon[0].hasItem) ? 1 : 0.5;
            // ダメージ計算
            if (this.currentPhase() != 'MATCHING') {
                this.updateAttackDamage();
                this.updateDefenceDamage();
            }
        });
        // 相手の特性が入力されたときのイベントリスナー
        document.querySelector('#enemy-ability select').addEventListener('click', event => {
            this.#battle.pokemon[1].ability = event.currentTarget.value;
            this.#enemy[this.#fieldEnemyIndex].ability = this.#battle.pokemon[1].ability;
            // ダメージ計算
            if (this.currentPhase() != 'MATCHING') {
                this.updateAttackDamage();
                this.updateDefenceDamage();
            }
        });
        // 相手の持ち物が入力されたときのイベントリスナー 
        document.querySelectorAll("#enemy-item input").forEach(radio => {
            radio.addEventListener("click", () => {
                if (radio.classList.contains("is-checked")) {
                    radio.classList.remove("is-checked");
                    radio.checked = false;
                    this.#battle.pokemon[1].item = '';
                } else {
                    document.querySelectorAll("#enemy-item input.is-checked").forEach((checkedRadio) => {
                        checkedRadio.classList.remove("is-checked");
                    });
                    radio.classList.add("is-checked");
                    this.#battle.pokemon[1].item = radio.value;
                }
                this.#enemy[this.#fieldEnemyIndex].item = this.#battle.pokemon[1].item;
                // ダメージ計算
                if (this.currentPhase() != 'MATCHING') {
                    this.updateAttackDamage();
                    this.updateDefenceDamage();
                }
            });
        });
        // 注釈表示
        document.querySelectorAll("#enemy-item label").forEach((label, i) => {
            setAnnotation(label);
            let radio = document.getElementById(`enemy-item${i+1}`);
            label.addEventListener('mousemove', () => {
                document.getElementById('annotation').innerHTML = (radio.value) ?
                    `${radio.value} ${Math.trunc(Pokemon.battleData[this.#battle.pokemon[1].name]['item'][1][i])}%` : '';
            });
        });
        // 相手のテラスタイプが入力されたときのイベントリスナー
        document.querySelectorAll("#enemy-Ttype input").forEach(radio => {
            radio.addEventListener("click", () => {
                if (radio.classList.contains("is-checked")) {
                    radio.classList.remove("is-checked");
                    radio.checked = false;
                    this.#battle.pokemon[1].Ttype = '';
                    this.#battle.pokemon[1].terastal = false;
                } else {
                    document.querySelectorAll("#enemy-Ttype input.is-checked").forEach((checkedRadio) => {
                        checkedRadio.classList.remove("is-checked");
                    });
                    radio.classList.add("is-checked");
                    this.#battle.pokemon[1].Ttype = radio.value;
                    this.#battle.pokemon[1].terastal = true;
                }
                this.#enemy[this.#fieldEnemyIndex].Ttype = this.#battle.pokemon[1].Ttype;
                this.#enemy[this.#fieldEnemyIndex].terastal = this.#battle.pokemon[1].terastal;
                // ダメージ計算
                if (this.currentPhase() != 'MATCHING') {
                    this.updateAttackDamage();
                    this.updateDefenceDamage();
                }
            });
        });
        // 注釈表示
        document.querySelectorAll("#enemy-Ttype label").forEach((label, i) => {
            setAnnotation(label);
            let radio = document.getElementById(`enemy-Ttype${i+1}`);
            label.addEventListener('mousemove', () => {
                document.getElementById('annotation').innerHTML = (radio.value) ?
                    `${radio.value} ${Math.trunc(Pokemon.battleData[this.#battle.pokemon[1].name]['Ttype'][1][i])}%` : '';
            });
        });
        // バランスチェックのイベントリスナー
        document.getElementById('balance-check-button').addEventListener('click', () => {
            if (document.getElementById('balance-check-wrapper').style.display != 'block') {
                this.display('balanceCheck');
                this.updateBalanceCheck();
            } else {
                this.display();
                document.querySelectorAll('.img-pokemon img').forEach(elem => {
                    elem.style.opacity = 1;
                });
            }
        });
        document.getElementById('close-balance-check').addEventListener('click', () => {
            this.display();
            document.querySelectorAll('.img-pokemon img').forEach(elem => {
                elem.style.opacity = 1;
            });
        });
        // バランスチェック モード切り替え
        document.querySelectorAll("#balance-check-top input").forEach(radio => {
            radio.addEventListener("click", () => {
                if (radio.classList.contains("is-checked")) {
                    radio.classList.remove("is-checked");
                    radio.checked = false;
                } else {
                    document.querySelectorAll("#balance-check-top input.is-checked").forEach((checkedRadio) => {
                        checkedRadio.classList.remove("is-checked");
                    });
                    radio.classList.add("is-checked");
                }
                this.updateBalanceCheck();
            });
        });
        // 詳細設定画面
        document.getElementById('setting').addEventListener('click', () => {
            let subwin = window.open(
                'setting.html', 'setting', subWindowOption(500, 440)
            );
            // サブウィンドウの処理
            subwin.addEventListener('load', () => {
                // 映像入力
                let cbVideo = createCombobox(subwin.document.getElementById('videoSrc'));
                cbVideo.addOptions(Object.keys(this.#mediaDevices), true);
                cbVideo.comboboxNode.value = this.#deviceLabel;
                // 映像デバイスを切り替える
                cbVideo.comboboxNode.addEventListener('change', event => {
                    this.#captureVideo.srcObject.getVideoTracks().forEach((camera) => {
                        camera.stop();
                    });
                    this.#deviceLabel = event.currentTarget.value;
                    videoStream(this.#captureVideo, this.#mediaDevices[this.#deviceLabel]);
                })
                // 相手ポケモンの検索範囲
                subwin.document.getElementById('template-length').value = this.templateLength;
                subwin.document.getElementById('template-length').addEventListener('change', event => {
                    this.templateLength = event.currentTarget.value;
                    this.save();
                    // 設定が変わったら相手のパーティをクリア
                    if (this.currentPhase() == 'MATCHING') {
                        document.querySelectorAll(`.enemy-name input`).forEach((elem, i) => {
                            elem.value = '';
                            this.setEnemyName(i, '')
                        });
                        this.recognizeEnemy = new Array(6).fill(true);
                    }
                });
                // 選出ガイド
                subwin.document.getElementById('guide-selection').checked = this.guideSelection;
                subwin.document.getElementById('guide-selection').addEventListener('change', event => {
                    this.guideSelection = event.currentTarget.checked;
                    this.save();
                });
                // HP認識
                subwin.document.getElementById('recognize-hp').checked = this.recognizeHP;
                subwin.document.getElementById('recognize-hp').addEventListener('change', event => {
                    this.recognizeHP = event.currentTarget.checked;
                    this.save();
                });
                // 相手のHP認識
                subwin.document.getElementById('recognize-enemy-hp').checked = this.recognizeEnemyHP;
                subwin.document.getElementById('recognize-enemy-hp').addEventListener('change', event => {
                    this.recognizeEnemyHP = event.currentTarget.checked;
                    this.save();
                });
                // ダメージ濃淡表示
                subwin.document.getElementById('damage-shade').checked = this.damageShade;
                subwin.document.getElementById('damage-shade').addEventListener('change', event => {
                    this.damageShade = event.currentTarget.checked;
                    this.save();
                    // ダメージ計算
                    if (this.currentPhase() != 'MATCHING') {
                        this.updateAttackDamage();
                        this.updateDefenceDamage();
                    }
                });
                // ダメージ色表示
                subwin.document.getElementById('damage-color').checked = this.damageColor;
                subwin.document.getElementById('damage-color').addEventListener('change', event => {
                    this.damageColor = event.currentTarget.checked;
                    this.save();
                    // ダメージ計算
                    if (this.currentPhase() != 'MATCHING') {
                        this.updateAttackDamage();
                        this.updateDefenceDamage();
                    }
                });
            });
        });
        // 登録ポケモン一覧
        document.getElementById('close-pokemon-list').addEventListener('click', () => {
            this.display();
        });
    }
    // 登録済みポケモンのフィルタ表示
    applyFilter(ind) {
        let nickname = toKatakana(this.#cbFilterNickname.comboboxNode.value, true);
        let name = toKatakana(this.#cbFilterName.comboboxNode.value, true);
        let type = toKatakana(this.#cbFilterType.comboboxNode.value, true);
        let ability = toKatakana(this.#cbFilterAbility.comboboxNode.value, true);
        let item = toKatakana(this.#cbFilterItem.comboboxNode.value, true);
        let Ttype = toKatakana(this.#cbFilterTtype.comboboxNode.value, true);
        let move = toKatakana(this.#cbFilterMove.comboboxNode.value, true);
        document.querySelectorAll('.pokemon-list-main .registered-wrapper').forEach(elem => {
            elem.remove();
        });
        for (let nn of this.#pokemonStorage.keys().sort()) {
            let pokemon = this.#pokemonStorage.getItem(nn);
            let flag = true;
            if (nickname) {
                flag &= toKatakana(nn, true).includes(nickname);
            }
            if (name) {
                flag &= toKatakana(pokemon.name, true).includes(name);
            }
            if (type) {
                flag &= toKatakana(pokemon.type.join('*'), true).includes(type);
            }
            if (ability) {
                flag &= toKatakana(pokemon.ability, true).includes(ability);
            }
            if (item) {
                flag &= toKatakana(pokemon.item, true).includes(item);
            }
            if (Ttype) {
                flag &= toKatakana(pokemon.Ttype, true).includes(Ttype);
            }
            if (move) {
                flag &= toKatakana(pokemon.move.join('*'), true).includes(move);
            }
            if (flag) {
                this.addRegistered(nn, ind);
            }
        }
    }
    // 試合場面を識別する
    currentPhase() {
        // マッチング画面
        trim(this.captureCanvas, this.trimCanvas, 855, 10, 50, 60);
        toBinary(this.trimCanvas, true);
        this.templCanvas.width = this.#matchingIcon.width;
        this.templCanvas.height = this.#matchingIcon.height;
        this.templCanvas.getContext('2d').drawImage(this.#matchingIcon, 0, 0);
        toBinary(this.templCanvas, true);
        let result = templateMatch('canvas-trim', 'canvas-template');
        if (result.maxVal > 5e7) return 'MATCHING';
        // 対戦画面
        trim(this.captureCanvas, this.trimCanvas, 128, 840, 50, 40);
        toBinary(this.trimCanvas, true);
        this.templCanvas.width = this.#battleIcon.width;
        this.templCanvas.height = this.#battleIcon.height;
        this.templCanvas.getContext('2d').drawImage(this.#battleIcon, 0, 0);
        toBinary(this.templCanvas, true);
        result = templateMatch('canvas-trim', 'canvas-template');
        if (result.maxVal > 4e7) return 'BATTLE';
        return 'NONE';
    }
    // 試合時間を設定する
    updateMatchTime() {
        let remainingTime;
        if (this.startTime) {
            let elapsedTime = Math.trunc((performance.now()-this.startTime)/1000);
            remainingTime = Math.max(0, this.GAME_TIME_MINUIT*60 - elapsedTime);
        } else {
            remainingTime = this.GAME_TIME_MINUIT*60;
        }
        let remainingMinute = Math.trunc(remainingTime/60)
        let remainingSecond = remainingTime - remainingMinute*60;
        remainingMinute = (remainingMinute <= 9) ? `0${remainingMinute}` : `${remainingMinute}`;
        remainingSecond = (remainingSecond <= 9) ? `0${remainingSecond}` : `${remainingSecond}`;
        document.getElementById('timer').textContent = `${remainingMinute}:${remainingSecond}`;
    }
    /* 自分パーティを読み取る
    async readParty() {
        for (let i=0; i<6; i++) {
            if (this.currentPhase() != 'MATCHING') {
                continue;
            }
            // 名前を読み取る
            this.#cbName[i].comboboxNode.style.background = '#ffff99';
            trim(this.captureCanvas, this.trimCanvas, 170, 150+116*i, 225, 54);
            let blackRatio = toBinary(this.trimCanvas, true);
            if (blackRatio > 0.5) { toBinary(this.trimCanvas, true); }
            let text = await ocr(this.trimCanvas).catch(() => '');
            const displayName = Pokemon.mostLikelyDisplayName(text);
            if (displayName && this.#party[i].displayName != displayName) {
                this.setPokemonName(i, Pokemon.zukanName[displayName][0]);
                this.save();
                console.log(`Party : ${displayName}`);
            }
            this.#cbName[i].comboboxNode.style.background = '#ffffff';
            // アイテムを読み取る
            this.#cbItem[i].comboboxNode.style.background = '#ffff99';
            trim(this.captureCanvas, this.trimCanvas, 220, 200+116*i, 300, 50);
            blackRatio = toBinary(this.trimCanvas, true);
            if (blackRatio > 0.5) { toBinary(this.trimCanvas, true); }
            text = await ocr(this.trimCanvas).catch(() => '');
            const item = mostLikelyElement(Object.keys(Pokemon.items), text)[0];
            if (item && this.#party[i].item != item) {
                this.setPokemonItem(i, item);
                this.save();
                console.log(`Item : ${item}`);
            }
            this.#cbItem[i].comboboxNode.style.background = '#ffffff';
        }
    }
    */
    // 相手パーティを読み取る
    async readEnemy() {
        for (let i=0; i<6; i++) {
            if (!this.recognizeEnemy[i] || this.currentPhase() != 'MATCHING') {
                continue;
            }
            document.querySelectorAll('.enemy-name input')[i].style.background = '#ffff99';
            let trimRange = {x:1243, y:236+101*i-(i<2)*2, w:94, h:94}
            trim(this.captureCanvas, this.trimCanvas, trimRange.x, trimRange.y, trimRange.w, trimRange.h);
            const border = rectBorder(this.trimCanvas, this.ENEMY_ICON_TRIM_BORDER);
            trim(this.captureCanvas, this.trimCanvas, trimRange.x+border.x, trimRange.y+border.y, border.w, border.h);
            toGrayscale(this.trimCanvas);
            // ポケモン名の検索元
            let names = Object.keys(Pokemon.battleData).slice(0, this.templateLength);
            let maxCorerlation = 0;
            let mostLikely = '';
            for (let name of names) {
                try {
                    const img = await loadImage(`data/template/${Pokemon.templateFileCode[name]}.png`);
                    const dsize = (img.width >= img.height) ?
                        [border.w, Math.trunc(border.w*img.height/img.width)] :
                        [Math.trunc(border.h*img.width/img.height), border.h];
                    // 画像サイズが異なるものをあらかじめ排除する
                    if (Math.abs(dsize[0]-border.w) > 5 || Math.abs(dsize[1]-border.h) > 5) {
                        continue;
                    } 
                    this.templCanvas.width = dsize[0];
                    this.templCanvas.height = dsize[1];
                    this.templCanvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height, 0, 0, dsize[0], dsize[1]);
                    toGrayscale(this.templCanvas);
                    let result = templateMatch('canvas-trim', 'canvas-template');
                    if (maxCorerlation < result.maxVal) {
                        maxCorerlation = result.maxVal;
                        mostLikely = name;
                    }    
                } catch (e) {
                    console.log(name)
                    console.error(`${e.name}: ${e.message}`);
                }
            }
            // フォルムチェンジ対応
            if (mostLikely == 'イルカマン(ナイーブ)') {
                mostLikely = 'イルカマン(マイティ)';
            }
            if (this.#enemy[i].name == mostLikely) {
                // 同じ名前を読んだ時点で自動認識を終了する
                this.recognizeEnemy[i] = false;
            } else {
                this.setEnemyName(i, mostLikely);
                this.save();
                console.log(`Enemy : ${mostLikely}`);
            }
            document.querySelectorAll('.enemy-name input')[i].style.background = '#ffffff';
        }
    }
    // 選出ガイド
    updateSelectionGuide() {
        if (!this.guideSelection) {
            document.querySelectorAll('.img-pokemon img, .img-enemy img').forEach((elem) => {
                elem.style.opacity = 1;
            });
            return;
        }
        // 相手パーティの読み込みが完了していなければ実行しない
        if (this.recognizeEnemy.includes(true)) {
            return;
        }
        let partyAttackWeight = new Array(6).fill(0);
        let enemyAttackWeight = new Array(6).fill(0);
        let battle = new Battle(new Pokemon(), new Pokemon());
        // 与ダメージによるポケモンの重み付け
        for (let j=0; j<6; j++) {
            battle.pokemon[1] = this.#enemy[j];
            battle.pokemon[1].nature = 'まじめ';
            battle.pokemon[1].effort = [252, 0, 0, 0, 0, 0];
            battle.pokemon[1].updateStatus();
            for (let i=0; i<6; i++) {
                battle.pokemon[0] = this.#party[i].clone();
                let maxDamageRatio = 0;
                battle.pokemon[0].move.forEach((move) => {
                    if (!Pokemon.isDamageMove(move)) { return; }
                    battle.critical = Pokemon.criticalMoves.includes(move);
                    battle.nCombo = (move in Pokemon.comboMoves) ? Pokemon.comboMoves[move][1] : 1;
                    battle.damageText({attackSide:0, move:move, maxRepeat:1, approxCombo:true});
                    maxDamageRatio = Math.min(
                        1, Math.max(maxDamageRatio, Math.max(...Object.keys(battle.totalDamage))/battle.pokemon[1].status[0])
                    );
                    if (move == 'テラバースト') {
                        battle.pokemon[0].terastal = true;
                        battle.damageText({attackSide:0, move:move, maxRepeat:1, approxCombo:true});
                        maxDamageRatio = Math.min(
                            1, Math.max(maxDamageRatio, Math.max(...Object.keys(battle.totalDamage))/battle.pokemon[1].status[0])
                        );
                        battle.pokemon[0].terastal = false;
                    }
                });
                partyAttackWeight[i] += maxDamageRatio * this.#enemySelectionWeight[j];
            }
        }
        // 被ダメージによる相手ポケモンの重み付け
        for (let j=0; j<6; j++) {
            if (!(this.#enemy[j].name in Pokemon.battleData)) { continue; }
            battle.pokemon[1] = this.#enemy[j];
            battle.pokemon[1].nature = 'まじめ';
            battle.pokemon[1].effort = [0, 252, 0, 252, 0, 0];
            battle.pokemon[1].updateStatus();
            let name = battle.pokemon[1].name;
            for (let i=0; i<6; i++) {
                battle.pokemon[0] = this.#party[i].clone();
                let maxDamageRatio = 0;
                for (let k=0; k<Pokemon.battleData[name].move[0].length; k++) {
                    if (Pokemon.battleData[name].move[1][k] < this.MIN_MOVE_ADOPTION_RATE) {
                        break;
                    }
                    let move = Pokemon.battleData[name].move[0][k];
                    if (!Pokemon.isDamageMove(move)) { continue; }
                    battle.critical = Pokemon.criticalMoves.includes(move);
                    battle.nCombo = (move in Pokemon.comboMoves) ? Pokemon.comboMoves[move][1] : 1;
                    battle.damageText({attackSide:1, move:move, maxRepeat:1, approxCombo:true});
                    maxDamageRatio = Math.min(
                        1, Math.max(maxDamageRatio, Math.max(...Object.keys(battle.totalDamage))/battle.pokemon[0].status[0])
                    );
                    if (move == 'テラバースト') {
                        battle.pokemon[1].terastal = true;
                        for (let t=0; t<Pokemon.battleData[name].Ttype[0].length; t++) {
                            if (Pokemon.battleData[name].Ttype[1][t] < this.MIN_MOVE_ADOPTION_RATE) {
                                break;
                            }
                            battle.pokemon[1].Ttype = Pokemon.battleData[name].Ttype[0][t];
                            battle.damageText({attackSide:1, move:move, maxRepeat:1, approxCombo:true});
                            maxDamageRatio = Math.min(
                                1, Math.max(maxDamageRatio, Math.max(...Object.keys(battle.totalDamage))/battle.pokemon[0].status[0])
                            );
                        }
                        battle.pokemon[1].terastal = false;
                    }
                }
                enemyAttackWeight[j] += maxDamageRatio * this.#partySelectionWeight[i];
            }
        }
        // 選出の重み付け
        for (let i=0; i<6; i++) {
            this.#partySelectionWeight[i] = partyAttackWeight[i] + 0.001;
            this.#enemySelectionWeight[i] = enemyAttackWeight[i] + 0.001;
        }
        let denom = Math.max(...this.#partySelectionWeight);
        for (let i=0; i<6; i++) {
            this.#partySelectionWeight[i] = this.#partySelectionWeight[i]/denom;
            document.querySelectorAll('.img-pokemon img')[i].style.opacity =
                Math.max(0.5, this.#partySelectionWeight[i]);
        }
        denom = Math.max(...this.#enemySelectionWeight);
        for (let i=0; i<6; i++) {
            this.#enemySelectionWeight[i] = this.#enemySelectionWeight[i]/denom;
        }
        // 重みの小さい順にソート
        let indicies = [0, 1, 2, 3, 4, 5];
        indicies.sort((ind1, ind2) => 
            this.#enemySelectionWeight[ind1] - this.#enemySelectionWeight[ind2]);
        indicies.forEach((ind, i) => {
            document.querySelectorAll('.img-enemy img')[ind].style.filter =
                `drop-shadow(0 0 ${i}px rgba(255,255,${255-51*i})`;
        });
        //console.log(this.#partySelectionWeight);
        //console.log(this.#enemySelectionWeight);
    }
    // 場の自分ポケモンを読み取る
    async updateFieldPokemon(forceUpdate=false) {
        let displayName = this.#battle.pokemon[0].displayName;
        let names = [];
        for (let i=0; i<6; i++) { 
            names.push(this.#party[i].displayName);
        }
        // OCRする前に画面に変化があるか判定する
        if (!forceUpdate) {
            trim(this.captureCanvas, this.trimCanvas, 90, 885, 240, 50);
            toBinary(this.trimCanvas, true, 200);
            let result = templateMatch(this.trimCanvas, this.nameBuffCanvas1);
            forceUpdate = (result.maxVal < 1e8);
        }
        // 変化があればOCRする
        if (forceUpdate || !this.#isPokemonNameStable) {
            let text = await ocr(this.trimCanvas).catch(() => ''); // ハングル認識不可
            let lang = '';
            guessLanguage.detect(text, function(l) {
                lang = ['ja','en','de','fr','ko','zh'].includes(l) ? l : 'en';
            });
            if (lang != 'ja') {
                text = mostLikelyElement(Object.keys(Pokemon.foreignNames), text)[0];
                text = Pokemon.foreignNames[text]; // 翻訳
                // 該当なしならハングルで再OCR
                if (lang != 'ko' && !names.includes(text)) {
                    text = await ocr(this.trimCanvas, 'kor').catch(() => '');
                    text = mostLikelyElement(Object.keys(Pokemon.foreignNames), text)[0];
                    text = Pokemon.foreignNames[text]; // 翻訳
                }
            }
            displayName = Pokemon.mostLikelyDisplayName(text);
            this.nameBuffCanvas1.getContext('2d').drawImage(this.trimCanvas, 0, 0, this.trimCanvas.width, this.trimCanvas.height);
            console.log(`Party : ${displayName}`);
        }
        let ind = mostLikelyElement(names, displayName)[1];
        // 変化があれば反映させる
        if (this.#battle.pokemon[0].name != this.#party[ind].name && this.#party[ind].name in Pokemon.zukan) {
            this.setFieldPokemonIndex(ind);
            this.#isPokemonNameStable = false;
            return true;
        } else {
            this.#isPokemonNameStable = true;
            return false;
        }
    }
    // 場の相手ポケモンを読み取る
    async updateFieldEnemy(forceUpdate=false) {
        let displayName = this.#battle.pokemon[1].displayName;
        let names = [];
        for (let i=0; i<6; i++) { 
            names.push(this.#enemy[i].displayName);
        }
        // OCRする前に画面に変化があるか判定する
        if (!forceUpdate || !this.#isEnemyNameStable) {
            trim(this.captureCanvas, this.trimCanvas, 1530, 95, 240, 50);
            toBinary(this.trimCanvas, true, 200);
            const result = templateMatch(this.trimCanvas, this.nameBuffCanvas2);
            forceUpdate = (result.maxVal < 1e8);
        }
        // 変化があればOCRする
        if (forceUpdate) {
            let text = await ocr(this.trimCanvas).catch(() => '');
            let lang = '';
            guessLanguage.detect(text, function(l) {
                lang = ['ja','en','de','fr','ko','zh'].includes(l) ? l : 'en';
            });
            if (lang != 'ja') {
                text = mostLikelyElement(Object.keys(Pokemon.foreignNames), text)[0];
                text = Pokemon.foreignNames[text]; // 翻訳
                // 該当なしならハングルで再OCR
                if (lang != 'ko' && !names.includes(text)) {
                    text = await ocr(this.trimCanvas, 'kor').catch(() => '');
                    text = mostLikelyElement(Object.keys(Pokemon.foreignNames), text)[0];
                    text = Pokemon.foreignNames[text]; // 翻訳
                }
            }
            displayName = Pokemon.mostLikelyDisplayName(text);
            this.nameBuffCanvas2.getContext('2d').drawImage(this.trimCanvas, 0, 0, this.trimCanvas.width, this.trimCanvas.height);
            console.log(`Enemy : ${displayName}`);
        }
        let ind = mostLikelyElement(names, displayName)[1];
        // 場のポケモンに変化があれば反映させる
        if (this.#battle.pokemon[1].name != this.#enemy[ind].name && this.#enemy[ind].name in Pokemon.zukan) {
            this.setFieldEnemyIndex(ind);
            this.#isEnemyNameStable = false;
            return true;
        } else {
            this.#isEnemyNameStable = true;
            return false;
        }
    }
    // 場の自分ポケモンのHPを読み取る
    async updateFieldPokemonHP(forceUpdate=false) {
        let hp = this.#battle.pokemon[0].hp;
        // OCRする前に画面に変化があるか判定する
        if (!forceUpdate) {
            trim(this.captureCanvas, this.trimCanvas, 210, 945, 166, 38);
            toBinary(this.trimCanvas, true, 200);
            const result = templateMatch(this.trimCanvas, this.hpBuffCanvas);
            forceUpdate = (result.maxVal < 1e8);
        }
        // 変化があればOCRする
        if (forceUpdate || !this.#isHPstable) {
            let text = await ocr(this.trimCanvas, 'eng').catch(() => '');
            hp = Number(text.substr(0, text.indexOf('/'))) || hp;
            this.hpBuffCanvas.getContext('2d').drawImage(this.trimCanvas, 0, 0, this.trimCanvas.width, this.trimCanvas.height);
            console.log(`HP : ${hp}`);
        }
        if (hp && hp != this.#battle.pokemon[0].hp) {
            this.#battle.pokemon[0].hp = hp;
            this.#isHPstable = false;
            return true;
        } else {
            this.#isHPstable = true;
            return false;
        }
    }
    // 場の相手ポケモンの残りHP割合を読み取る
    async updateEnemyHPratio(forceUpdate=false) {
        // 相手の残りHPを測る
        trim(this.captureCanvas, this.trimCanvas, 1539, 150, 282, 48);
        toBinary(this.trimCanvas, true, 70);
        const imageData = this.trimCanvas.getContext('2d').getImageData(0, 0, this.trimCanvas.width, this.trimCanvas.height);
        let count = 0;
        for (let i = 0; i < imageData.width; i++) {
            let ind = Math.trunc(imageData.height/2*imageData.width*4) + 4*i;
            if (imageData.data[ind] == 0) { count++; }
        }
        let HPratio = Math.min(1, count/(imageData.width-2));
        if (this.#enemy[this.#fieldEnemyIndex].selected) {
            document.querySelectorAll('.enemy-HP')[this.#fieldEnemyIndex].textContent = `${Math.trunc(HPratio*100)}%`;
        }
        if (HPratio && (forceUpdate || HPratio != this.#enemyHPratio[this.#fieldEnemyIndex])) {
            this.#enemyHPratio[this.#fieldEnemyIndex] = HPratio;
            console.log(`Enemy HP : ${Math.trunc(HPratio*100)}%`);
            return true;
        } else {
            return false;
        }
    }
    // 与ダメージ計算
    updateAttackDamage() {
        if (!(this.#battle.pokemon[0].name in Pokemon.zukan) ||
            !(this.#battle.pokemon[1].name in Pokemon.battleData)) {
            return;
        }
        this.#attackNotes = new Array(4).fill([]);
        document.querySelectorAll('.attack-damage-box').forEach((elem, i) => {
            elem.querySelectorAll('span').forEach(elem2 => { elem2.innerText = ''; });
            const move = this.#battle.pokemon[0].move[i];
            let lethalNum = 999;
            elem.querySelector('.attack-move').innerText = move;
            if (Pokemon.isDamageMove(move)) {
                const mClass = Pokemon.moves[move]['class'];
                this.#battle.critical = Pokemon.criticalMoves.includes(move) ||
                    document.getElementById('critical-attack').checked;
                this.#battle.nCombo = (move in Pokemon.comboMoves) ? Pokemon.comboMoves[move][1] : 1;
                this.#battle.enhance = this.#attackEnhance[i];
                this.#battle.reflector = this.#battle.lightwall = document.getElementById('enemy-wall').checked;
                // HB・HD特化
                this.#battle.pokemon[1].nature = (mClass == '物理') ? 'ずぶとい' : 'おだやか';
                this.#battle.pokemon[1].effort = [252, 0, 252, 0, 252, 0];
                this.#battle.pokemon[1].updateStatus();
                this.#battle.pokemon[1].hp = Math.trunc(this.#enemyHPratio[this.#fieldEnemyIndex]*this.#battle.pokemon[1].status[0]);
                let text = this.#battle.damageText({
                    attackSide:0, move:move, maxRepeat:10, format:'percent', damageDigits:0, lethalProbDigits:0
                });
                elem.querySelector(`.attack-damage1 span:first-child`).innerText = text.includes(' ') ? text.substr(0, text.indexOf(' ')) : text;
                elem.querySelector(`.attack-damage1 span:last-child`).innerText = text.includes(' ') ? text.substr(text.indexOf(' ')+1) : '-';
                // H252振り
                this.#battle.pokemon[1].nature = 'まじめ';
                this.#battle.pokemon[1].effort = [252, 0, 0, 0, 0, 0];
                this.#battle.pokemon[1].updateStatus();
                this.#battle.pokemon[1].hp = Math.trunc(this.#enemyHPratio[this.#fieldEnemyIndex]*this.#battle.pokemon[1].status[0]);
                text = this.#battle.damageText({
                    attackSide:0, move:move, maxRepeat:10, format:'percent', damageDigits:0, lethalProbDigits:0
                });
                elem.querySelector(`.attack-damage2 span:first-child`).innerText = text.includes(' ') ? text.substr(0, text.indexOf(' ')) : text;
                elem.querySelector(`.attack-damage2 span:last-child`).innerText = text.includes(' ') ? text.substr(text.indexOf(' ')+1) : '-';
                // 無振り
                this.#battle.pokemon[1].nature = 'まじめ';
                this.#battle.pokemon[1].effort = [0, 0, 0, 0, 0, 0];
                this.#battle.pokemon[1].updateStatus();
                this.#battle.pokemon[1].hp = Math.trunc(this.#enemyHPratio[this.#fieldEnemyIndex]*this.#battle.pokemon[1].status[0]);
                text = this.#battle.damageText({
                    attackSide:0, move:move, maxRepeat:10, format:'percent', damageDigits:0, lethalProbDigits:0
                });
                elem.querySelector(`.attack-damage3 span:first-child`).innerText = text.includes(' ') ? text.substr(0, text.indexOf(' ')) : text;
                elem.querySelector(`.attack-damage3 span:last-child`).innerText = text.includes(' ') ? text.substr(text.indexOf(' ')+1) : '-';
                lethalNum = this.#battle.lethalNum || 999;
                this.#attackNotes[i] = this.#battle.note;
            }
            // タイプまたは威力変動の有無によってテキストの色を変える
            if (this.damageColor) {
                elem.style.color = Pokemon.typeColor[
                    this.#battle.pokemon[0].getMoveType(move, this.#battle.weather)
                ];
            } else {
                elem.style.color =  '#000000';
                if (Pokemon.varPowMoves.includes(move)) {
                    elem.querySelector('.attack-move').style.color = this.#attackEnhance[i] ? '#ff0000' : '#0000ff';
                }
            }
            // ダメージによってテキストの透過率を変える
            elem.querySelectorAll('.attack-move, span').forEach((elem2) => {
                elem2.style.opacity = (this.damageShade) ?
                    Math.max(1-0.12*(lethalNum-1), this.MIN_DAMAGE_OPACITY) : 1;
            });
        });
    }
    // 被ダメージ計算
    updateDefenceDamage(scrollTop=false) {
        if (!(this.#battle.pokemon[0].name in Pokemon.zukan) ||
            !(this.#battle.pokemon[1].name in Pokemon.battleData)) {
            return;
        }
        this.#defenceNotes = new Array(this.N_DEFENCE_DAMAGE).fill([]);
        if (scrollTop) {
            document.querySelector('.defence-damage-window').scrollTop = 0;
        }
        document.querySelectorAll('.defence-damage-box').forEach((elem, i) => {
            elem.querySelectorAll('span').forEach(elem2 => {
                elem2.innerText = '';
            });
            if (i >= Pokemon.battleData[this.#battle.pokemon[1].name]['move'][0].length) { return; }
            const move = Pokemon.battleData[this.#battle.pokemon[1].name]['move'][0][i];
            const rate = Pokemon.battleData[this.#battle.pokemon[1].name]['move'][1][i];
            let lethalNum = 999;
            elem.querySelector(`.defence-move span:first-child`).innerText = move;
            elem.querySelector(`.defence-move span:last-child`).innerText = Math.trunc(rate) + '%';
            if (Pokemon.isDamageMove(move)) {
                const mClass = Pokemon.moves[move]['class'];
                this.#battle.critical = Pokemon.criticalMoves.includes(move) ||
                    document.getElementById('critical-defence').checked;
                this.#battle.nCombo = (move in Pokemon.comboMoves) ? Pokemon.comboMoves[move][1] : 1;
                this.#battle.enhance = this.#defenceEnhance[i];
                this.#battle.reflector = this.#battle.lightwall = document.getElementById('wall').checked;
                // A・C特化
                this.#battle.pokemon[1].nature = (mClass == '物理' ||
                    (move == 'テラバースト' && this.#battle.pokemon[1].base[1] > this.#battle.pokemon[1].base[3])) ? 'いじっぱり' : 'ひかえめ';
                this.#battle.pokemon[1].effort = [0, 252, 252, 252, 0, 252];
                if (move == 'ボディプレス') { 
                    this.#battle.pokemon[1].nature = 'わんぱく';
                } else if (move == 'ジャイロボール') { 
                    this.#battle.pokemon[1].indiv[5] = 0;
                    this.#battle.pokemon[1].effort[5] = 0;
                }
                this.#battle.pokemon[1].updateStatus();
                let text = this.#battle.damageText({
                    attackSide:1, move:move, maxRepeat:10, format:'value', lethalProbDigits:0
                });
                elem.querySelector('.defence-damage1 span:first-child').innerText = text.includes(' ') ? text.substr(0, text.indexOf(' ')) : text;
                elem.querySelector('.defence-damage1 span:last-child').innerText = text.includes(' ') ? text.substr(text.indexOf(' ')+1) : '';
                lethalNum = this.#battle.lethalNum || 999;
                this.#defenceNotes[i] = this.#battle.note;
                // 252振り
                this.#battle.pokemon[1].nature = 'まじめ';
                this.#battle.pokemon[1].indiv[5] = 31;
                this.#battle.pokemon[1].effort = [0, 252, 252, 252, 0, 252];
                if (move == 'ジャイロボール') { 
                    this.#battle.pokemon[1].indiv[5] = 0;
                    this.#battle.pokemon[1].effort[5] = 0;
                }
                this.#battle.pokemon[1].updateStatus();
                text = this.#battle.damageText({
                    attackSide:1, move:move, maxRepeat:10, format:'value', lethalProbDigits:0
                });
                elem.querySelector('.defence-damage2 span:first-child').innerText = text.includes(' ') ? text.substr(0, text.indexOf(' ')) : text;
                elem.querySelector('.defence-damage2 span:last-child').innerText = text.includes(' ') ? text.substr(text.indexOf(' ')+1) : '';
                // 無振り
                this.#battle.pokemon[1].nature = 'まじめ';
                this.#battle.pokemon[1].indiv[5] = 31;
                this.#battle.pokemon[1].effort = [0, 0, 0, 0, 0, 0];
                this.#battle.pokemon[1].updateStatus();
                text = this.#battle.damageText({
                    attackSide:1, move:move, maxRepeat:10, format:'value', lethalProbDigits:0
                });
                elem.querySelector('.defence-damage3 span:first-child').innerText = text.includes(' ') ? text.substr(0, text.indexOf(' ')) : text;
                elem.querySelector('.defence-damage3 span:last-child').innerText = text.includes(' ') ? text.substr(text.indexOf(' ')+1) : '';
            }
            // タイプまたは威力変動の有無によってテキストの色を変える
            if (this.damageColor) {
                elem.style.color =  Pokemon.typeColor[
                    this.#battle.pokemon[1].getMoveType(move, this.#battle.weather)
                ];
            } else {
                elem.style.color =  '#000000';
                if (Pokemon.varPowMoves.includes(move)) {
                    elem.querySelector('.defence-move').style.color = this.#defenceEnhance[i] ? '#ff0000' : '#0000ff';
                }
            }
            // ダメージによってテキストの透過率を変える
            elem.querySelectorAll('span').forEach((elem2) => {
                elem2.style.opacity = (this.damageShade) ?
                    Math.max(1-0.12*(lethalNum-1), this.MIN_DAMAGE_OPACITY) : 1;
            });
        });
    }
    // 登録画面にポケモンを表示する
    setPokemonView(regWindow, pokemon) {
        if (pokemon.name in Pokemon.zukan) {
            regWindow.document.querySelector('#icon img').src =
                `data/icon/${Pokemon.iconFileCode[pokemon.name]}.png`;
            regWindow.document.querySelector('#icon img').style.opacity = 1;
        } else {
            regWindow.document.querySelector('#icon img').style.opacity = 0;
        }
        if (pokemon.item in Pokemon.items) {
            regWindow.document.getElementById('item').src = `data/item_img/${Pokemon.itemFileCode[pokemon.item]}.png`;
            regWindow.document.getElementById('item').style.opacity = 1;
        } else {
            regWindow.document.getElementById('item').style.opacity = 0;
        }
        if (pokemon.Ttype in Pokemon.typeID) {
            regWindow.document.getElementById('Ttype').src =
                `data/type_img/${Pokemon.typeFileCode[pokemon.Ttype]}.png`;
            regWindow.document.getElementById('Ttype').style.opacity = 1;
        } else {
            regWindow.document.getElementById('Ttype').style.opacity = 0;
        }
        regWindow.document.getElementById('nature').textContent = pokemon.nature;
        regWindow.document.getElementById('ability').textContent = pokemon.ability;
        regWindow.document.querySelectorAll('.move').forEach((elem, j) => {
            elem.textContent = pokemon.move[j];
        });
        regWindow.document.querySelectorAll('#base div').forEach((elem, j) => {
            if (j >= 1) {
                elem.textContent = pokemon.base[j-1];
            }
        });
        regWindow.document.querySelectorAll('#indiv div').forEach((elem, j) => {
            if (j >= 1) {
                elem.textContent = pokemon.indiv[j-1];
            }
        });
        regWindow.document.querySelectorAll('#effort div').forEach((elem, j) => {
            if (j >= 1) {
                elem.textContent = pokemon.effort[j-1];
            }
        });
        regWindow.document.querySelectorAll('#status div').forEach((elem, j) => {
            if (j >= 1) {
                elem.textContent = pokemon.status[j-1];
            }
        });
        regWindow.document.querySelector('#description textarea').value = pokemon.description;
    }
    // ボックス画面からポケモンを読み込む
    async readBoxPokemon(ind) {
        // mainloopと干渉しないように一時的なCanvasを使用する
        let captureCanvas = document.createElement('canvas');
        let trimCanvas = document.createElement('canvas');
        let templCanvas = document.createElement('canvas');
        trimCanvas.id = 'tmp-canvas-trim';
        templCanvas.id = 'tmp-canvas-template';
        document.querySelector('.hidden').appendChild(trimCanvas);
        document.querySelector('.hidden').appendChild(templCanvas);
        // キャプチャ画面をcaptureCanvasに転写
        captureCanvas.width = this.captureCanvas.width;
        captureCanvas.height = this.captureCanvas.height;
        trim(this.captureCanvas, captureCanvas, 0, 0, captureCanvas.width, captureCanvas.height);
        // 画面が読み取り可能か判定する
        trim(captureCanvas, trimCanvas, 1372, 1020, 110, 40);
        toBinary(trimCanvas, true);
        const img = await loadImage('data/judge.png');
        templCanvas.width = img.width;
        templCanvas.height = img.height;
        templCanvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);
        toBinary(templCanvas, true);
        let result = templateMatch('tmp-canvas-trim', 'tmp-canvas-template');
        if (result.maxVal < 5e7) {
            window.alert('画面を読み取ることができませんでした。\nステータスを表示した状態で実行してください。');
            captureCanvas.remove();
            trimCanvas.remove();
            templCanvas.remove();
            return;
        };
        this.#cbName[ind].comboboxNode.parentNode.style.background = '#ffff99';
        // 特性：フォルムの識別に使うため先に読み込む
        trim(captureCanvas, trimCanvas, 1455, 575, 330, 50);
        toBinary(trimCanvas, true);
        let ability = await ocr(trimCanvas).catch(() => '');
        if (!Pokemon.abilities.includes(ability)) {
            ability = mostLikelyElement(Pokemon.abilities, ability)[0];
        }
        // 名前
        trim(captureCanvas, trimCanvas, 1420, 90, 200, 40);
        toBinary(trimCanvas, true);
        let displayName = await ocr(trimCanvas).catch(() => '');
        displayName = toKatakana(displayName);
        if (!(displayName in Pokemon.zukanName)) {
            displayName = Pokemon.mostLikelyDisplayName(displayName);
        }
        if (displayName != this.#party[ind].displayName) {
            let name = Pokemon.zukanName[displayName][0];
            // フォルム違いが存在する場合
            if (displayName in Pokemon.formDiff) {
                for (let s of Pokemon.zukanName[displayName]) {
                    //  タイプで識別
                    if (Pokemon.formDiff[displayName] == 'type') {
                        let types = [];
                        for (let t=0; t<2; t++) {
                            trim(captureCanvas, trimCanvas, 1335+200*t, 150, 145, 40);
                            toBinary(trimCanvas, true, 244);
                            let type = await ocr(trimCanvas).catch(() => '');
                            if (type && !(type in Pokemon.typeID)) {
                                type = mostLikelyElement(Object.keys(Pokemon.typeID), type)[0];
                            }
                            types.push(type);
                        }
                        if (JSON.stringify(types) == JSON.stringify(Pokemon.zukan[s].type) ||
                            JSON.stringify([types[1],types[0]]) == JSON.stringify(Pokemon.zukan[s].type)) {
                            name = s;
                            break;
                        }
                    //  特性で識別
                    } else if (Pokemon.formDiff[displayName] == 'ability' && Pokemon.zukan[s].ability.includes(ability)) {
                        name = s;
                        break;
                    }
                }
            }
            this.setPokemonName(ind, name);
        }
        this.#cbName[ind].comboboxNode.parentNode.style.background = '#ffffff';
        // 性格
        this.#cbNature[ind].comboboxNode.parentNode.style.background = '#ffff99';
        let x = [1579, 1678, 1678, 1480, 1480, 1579];
        let y = [262, 316, 432, 316, 432, 486];
        let natureCorrection = [1, 1, 1, 1, 1, 1];
        for (let j=0; j<6; j++) {
            trim(captureCanvas, trimCanvas, x[j], y[j], 22, 22);
            toBinary(trimCanvas, true, 200);
            let maxVals = [];
            for (let url of ['data/nature_down.png', 'data/nature_neutral.png', 'data/nature_up.png']) {
                const img = await loadImage(url);
                templCanvas.width = img.width;
                templCanvas.height = img.height;
                templCanvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);
                toBinary(templCanvas, true, 200);
                maxVals.push(templateMatch('tmp-canvas-trim', 'tmp-canvas-template').maxVal);
            }
            natureCorrection[j] = 1 + 0.1*(maxVals.indexOf(Math.max(...maxVals))-1);
        }
        for (let nature in Pokemon.natureCorrections) {
            if (JSON.stringify(Pokemon.natureCorrections[nature]) == JSON.stringify(natureCorrection)) {
                this.setPokemonNature(ind, nature);
                break;
            }
        }
        this.#cbNature[ind].comboboxNode.parentNode.style.background = '#ffffff';
        // 特性
        this.#cbAbility[ind].comboboxNode.parentNode.style.background = '#ffff99';
        this.setPokemonAbility(ind, ability);
        this.#cbAbility[ind].comboboxNode.parentNode.style.background = '#ffffff';
        // もちもの
        this.#cbItem[ind].comboboxNode.parentNode.style.background = '#ffff99';
        trim(captureCanvas, trimCanvas, 1455, 635, 330, 50);
        toBinary(trimCanvas, true);
        let item = await ocr(trimCanvas).catch(() => '');
        if (item in Pokemon.items) {
            this.setPokemonItem(ind, item);
        } else if (item) {
            this.setPokemonItem(ind, mostLikelyElement(Object.keys(Pokemon.items), item)[0]);
        }
        this.#cbItem[ind].comboboxNode.parentNode.style.background = '#ffffff';
        // テラスタイプ
        this.#cbTtype[ind].comboboxNode.parentNode.style.background = '#ffff99';
        trim(captureCanvas, trimCanvas, 1535+200*(this.#party[ind].type.length-1), 150, 145, 40);
        toBinary(trimCanvas, true, 244);
        let Ttype = await ocr(trimCanvas).catch(() => '');
        if (!(Ttype in Pokemon.typeID)) {
            Ttype = mostLikelyElement(Object.keys(Pokemon.typeID), Ttype)[0];
        }
        this.setPokemonTtype(ind, Ttype);
        this.#cbTtype[ind].comboboxNode.parentNode.style.background = '#ffffff';
        // 技
        for (let j=0; j<4; j++) {
            this.#cbMove[4*ind+j].comboboxNode.parentNode.style.background = '#ffff99';
            trim(captureCanvas, trimCanvas, 1320, 700+60*j, 250, 50);
            toBinary(trimCanvas, true);
            let move = await ocr(trimCanvas).catch(() => '');
            if (move in Pokemon.moves) {
                this.setPokemonMove(ind, j, move);
            } else if (move) {
                this.setPokemonMove(ind, j, mostLikelyElement(Object.keys(Pokemon.moves), move)[0]);
            }
            this.#cbMove[4*ind+j].comboboxNode.parentNode.style.background = '#ffffff';
        }
        // レベル
        trim(captureCanvas, trimCanvas, 1775, 25, 55, 30);
        toBinary(trimCanvas, true);
        let level = await ocr(trimCanvas, 'eng').catch(() => '');
        this.#party[ind].level = Number(level);
        // ステータス
        trim(captureCanvas, trimCanvas, 1775, 25, 55, 30);
        x = [1585, 1710, 1710, 1320, 1320, 1585];
        y = [215, 330, 440, 330, 440, 512];
        for (let j=0; j<6; j++) {
            let elem = document.querySelectorAll('.status')[ind].querySelector(`input:nth-child(${j+1})`);
            elem.style.background = '#ffff99';
            document.querySelectorAll('.effort')[ind].querySelector(`input:nth-child(${j+1})`).style.background = '#ffff99';
            trim(captureCanvas, trimCanvas, x[j], y[j], 155, 45);
            toBinary(trimCanvas, true);
            let status = await ocr(trimCanvas, 'eng').catch(() => ''); 
            if (j == 0) {
                status = status.substr(0, status.indexOf('/'));
            }
            this.setPokemonStatus(ind, j, Number(status));
            elem.value = Number(status);
            elem.style.background = '#ffffff';
            document.querySelectorAll('.effort')[ind].querySelector(`input:nth-child(${j+1})`).style.background = '#ffffff';
        }
        if (this.#party[ind].level != 50) {
            this.#party[ind].level = 50;
            for (let j=0; j<6; j++) {
                this.setPokemonEffort(ind, j, this.#party[ind].effort[j]);
            }
        }
        captureCanvas.remove();
        trimCanvas.remove();
        templCanvas.remove();
    }
    // パーティから場の自分ポケモンを読み込む
    setFieldPokemonIndex(ind) {
        this.#fieldPokemonIndex = ind;
        this.#party[this.#fieldPokemonIndex].selected = true;
        this.#battle.pokemon[0] = this.#party[this.#fieldPokemonIndex].clone(
            subset(this.#battle.pokemon[0], ['critical','rank','reflector','lightwall']) // これらはポケモンに追従しない
        );
        // アイコンを描画
        let inds = [this.#fieldPokemonIndex];
        for (let i=0; i<6; i++) {
            if (i != this.#fieldPokemonIndex) { inds.push(i); }
        }
        document.querySelectorAll('#field-pokemon img').forEach((elem, i) => {
            elem.style.opacity = 1;
            elem.src = `data/icon/${Pokemon.iconFileCode[this.#party[inds[i]].name]}.png`;
            elem.value = inds[i];
        });
        // 状態異常を設定
        document.querySelectorAll("#ailment input").forEach(radio => {
            if (radio.value == this.#battle.pokemon[0].ailment) {
                radio.classList.add("is-checked");
                radio.checked = true;
            } else {
                radio.classList.remove("is-checked");
                radio.checked = false;
            }
        });       
        // テラスタルを設定
        let img = document.getElementById('terastal');
        if (this.#battle.pokemon[0].Ttype in Pokemon.typeID) {
            img.src = this.#battle.pokemon[0].terastal ? "img/terastal_on.svg" : "img/terastal_off.svg";
            img.style.opacity = 1;
        } else {
            img.style.opacity = 0;
        }
        // もちものを描画
        img = document.getElementById('has-item')
        if (this.#battle.pokemon[0].item in Pokemon.items) {
            img.src = `data/item_img/${Pokemon.itemFileCode[this.#battle.pokemon[0].item]}.png`;
            img.style.opacity = (this.#battle.pokemon[0].hasItem) ? 1 : 0.5;
        } else {
            img.style.opacity = 0;
        }
    }
    // パーティから場の相手ポケモンを読み込む
    setFieldEnemyIndex(ind) {
        this.#fieldEnemyIndex = ind;
        this.#enemy[this.#fieldEnemyIndex].selected = true;
        this.#battle.pokemon[1] = this.#enemy[this.#fieldEnemyIndex].clone(
            subset(this.#battle.pokemon[1], ['critical','rank','reflector','lightwall']) // これらはポケモンに追従しない
        );        
        // アイコンを描画
        let inds = [this.#fieldEnemyIndex];
        for (let i=0; i<6; i++) {
            if (i != this.#fieldEnemyIndex) { inds.push(i); }
        }
        document.querySelectorAll('#field-enemy img').forEach((elem, i) => {
            elem.style.opacity = 1;
            elem.src = `data/icon/${Pokemon.iconFileCode[this.#enemy[inds[i]].name]}.png`;
            elem.value = inds[i];
        });
        // 状態異常を設定
        document.querySelectorAll("#enemy-ailment input").forEach(radio => {
            if (radio.value == this.#battle.pokemon[1].ailment) {
                radio.classList.add("is-checked");
                radio.checked = true;
            } else {
                radio.classList.remove("is-checked");
                radio.checked = false;
            }
        });
        // 特性を設定
        let elem = document.querySelector('#enemy-ability select');
        let options = (this.#battle.pokemon[1].name in Pokemon.battleData) ?
            Pokemon.battleData[this.#battle.pokemon[1].name].ability[0] :
            Pokemon.zukan[this.#battle.pokemon[1].name].ability;
        options = options.concat(['-']);
        addSelectOptions(elem, options, true);
        elem.options[0].selected = true;
        elem.style.opacity = 1;            
        ind = Math.max(0, options.indexOf(this.#battle.pokemon[1].ability));
        this.#battle.pokemon[1].ability = options[ind];
        elem.options[ind].selected = true;
        if (this.#battle.pokemon[1].name in Pokemon.battleData) {
            // もちもの・テラスタイプを表示する
            document.getElementById('enemy-item-Ttype').style.opacity = 1;
            // もちものを設定
            let inputElements = document.querySelectorAll('#enemy-item input');
            let imgElements = document.querySelectorAll('#enemy-item img');
            let items = Pokemon.battleData[this.#battle.pokemon[1].name]['item'][0];
            for (let i=0; i<inputElements.length; i++) {
                if (i < items.length) {
                    inputElements[i].value = items[i];
                    imgElements[i].src = `data/item_img/${Pokemon.itemFileCode[items[i]]}.png`;
                    imgElements[i].style.opacity = 1;

                    if (inputElements[i].value == this.#battle.pokemon[1].item) {
                        inputElements[i].classList.add("is-checked");
                        inputElements[i].checked = true;
                    } else {
                        inputElements[i].classList.remove("is-checked");
                        inputElements[i].checked = false;
                    }
                } else {
                    inputElements[i].value = '';
                    imgElements[i].style.opacity = 0;
                }
            }
            // テラスタイプを設定
            inputElements = document.querySelectorAll('#enemy-Ttype input');
            imgElements = document.querySelectorAll('#enemy-Ttype img');
            let types = Pokemon.battleData[this.#battle.pokemon[1].name]['Ttype'][0];
            for (let i=0; i<inputElements.length; i++) {
                if (i < types.length) {
                    inputElements[i].value = types[i];
                    imgElements[i].src = `data/type_img/${Pokemon.typeFileCode[types[i]]}.png`;
                    imgElements[i].style.opacity = 1;
                    if (inputElements[i].value == this.#battle.pokemon[1].Ttype) {
                        inputElements[i].classList.add("is-checked");
                        inputElements[i].checked = true;
                    } else {
                        inputElements[i].classList.remove("is-checked");
                        inputElements[i].checked = false;
                    }
                } else {
                    inputElements[i].value = '';
                    imgElements[i].style.opacity = 0;
                }
            }
        }
    }
    // 試合をリセット
    resetMatch() {
        this.startTime = 0;
        this.recognizeEnemy = new Array(6).fill(true);
        this.#enemyHPratio[this.#fieldEnemyIndex] = new Array(6).fill(1);
        this.#isPokemonNameStable = false;
        this.#isEnemyNameStable = false;
        this.#isHPstable = false;
        for (let i=0; i<6; i++) {
            this.#party[i].selected = false;
            this.#party[i].ailment = '';
            this.#party[i].terastal = false;
            this.#party[i].hasItem = true;
            this.setEnemyName(i, '');
            this.#enemy[i].selected = false;
            this.#enemy[i].ability = '';
            this.#enemy[i].item = '';
            this.#enemy[i].Ttype = '';
            this.#enemy[i].ailment = '';
            this.#enemy[i].terastal = false;
            this.#enemy[i].hasItem = true;
        }
        this.#battle = new Battle(new Pokemon(), new Pokemon());
        this.#attackEnhance = new Array(4).fill(true);
        this.#defenceEnhance = new Array(this.N_DEFENCE_DAMAGE).fill(true);
        // 入力欄をリセット
        document.querySelectorAll('.rank input').forEach((elem) => {
            elem.value = 0;
        });
        document.querySelectorAll(
            '.critical input, .ailment, .wall, #weather, #field'
        ).forEach((elem) => {
            elem.checked = false;
        });
        document.getElementById('terastal').src = 'img/terastal_off.svg';
        addSelectOptions(document.querySelector('#enemy-ability select'), ['特性'], true);
        document.querySelectorAll('.radioimage').forEach((elem) => {
            elem.scrollTop = 0;
        });
        // 場のポケモン関連の入力欄を非表示
        document.querySelectorAll(
            '.field-pokemon img, #terastal, #has-item, #enemy-ability select, #enemy-item-Ttype'
        ).forEach((elem) => {
            elem.style.opacity = 0;
        });
        // 選出ガイドをリセット
        this.#partySelectionWeight = new Array(6).fill(1);
        this.#enemySelectionWeight = new Array(6).fill(1);
        document.querySelectorAll('.img-pokemon img').forEach((elem) => {
            elem.style.opacity = 1;
        });
        document.querySelectorAll('.img-enemy img').forEach((elem) => {
            elem.style.filter = 'drop-shadow(0 0 1px #000000)';
        });
        // 相手のHP表示をクリア
        document.querySelectorAll('.enemy-HP').forEach(elem => {
            elem.textContent = '';
        });
        this.save();
    }
    // バランスチェック処理
    updateBalanceCheck() {
        let mode = '';
        document.querySelectorAll("#balance-check-top input").forEach(radio => {
            if (radio.checked) { mode = radio.value; }
        });
        document.getElementById('recommend-type').style.opacity = (mode) ? 1 : 0;
        let partyWeight = new Array(6).fill(1);
        let enemyWeight = new Array(this.#trend.length).fill(1);
        let typeWeight = {};
        for (let type in Pokemon.typeID) {
            if (type != 'ステラ') { typeWeight[type] = 0; }
        }
        document.querySelectorAll('.trend').forEach((_, i) => {
            if (mode == 'attack') {
                for (let j=0; j<6; j++) {
                    if (!(this.#party[j].name in Pokemon.zukan)) { continue; }
                    let battle = new Battle(this.#party[j].clone(), new Pokemon(this.#trend[i]));
                    battle.pokemon[1].loadZukan();
                    battle.pokemon[1].effort = [252, 252, 0, 252, 0, 252];
                    battle.pokemon[1].updateStatus();
                    let maxDamageRatio = 0;
                    for (let move of battle.pokemon[0].move) {
                        if (!Pokemon.isDamageMove(move)) { continue; }
                        battle.critical = Pokemon.criticalMoves.includes(move);
                        battle.nCombo = (move in Pokemon.comboMoves) ? Pokemon.comboMoves[move][1] : 1;
                        battle.damageText({attackSide:0, move:move, maxRepeat:1, approxCombo:true});
                        maxDamageRatio = Math.max(maxDamageRatio,
                            Math.min(1, Math.max(...Object.keys(battle.totalDamage))/battle.pokemon[1].status[0])
                        );
                        if (move == 'テラバースト') {
                            battle.pokemon[0].terastal = true;
                            battle.damageText({attackSide:0, move:move, maxRepeat:1, approxCombo:true});
                            maxDamageRatio = Math.max(maxDamageRatio,
                                Math.min(1, Math.max(...Object.keys(battle.totalDamage))/battle.pokemon[1].status[0])
                            );
                            battle.pokemon[0].terastal = false;
                        }
                    }
                    maxDamageRatio = Math.min(1, maxDamageRatio);
                    partyWeight[j] += Math.sqrt(maxDamageRatio);
                    enemyWeight[i] += 1-maxDamageRatio;
                }
                // 推奨タイプ
                for (let type in Pokemon.typeID) {
                    if (type == 'ステラ') { continue; }
                    let w = 1;
                    for (let t of Pokemon.zukan[this.#trend[i]].type) {
                        w *= Pokemon.typeCorrections[Pokemon.typeID[type]][Pokemon.typeID[t]];
                    }
                    typeWeight[type] += w*enemyWeight[i];
                }
            } else if (mode == 'defence') {
                for (let j=0; j<6; j++) {
                    if (!(this.#party[j].name in Pokemon.zukan)) { continue; }
                    let battle = new Battle(this.#party[j].clone(), new Pokemon(this.#trend[i]));
                    battle.pokemon[1].loadZukan();
                    battle.pokemon[1].effort = [252, 252, 0, 252, 0, 252];
                    battle.pokemon[1].updateStatus();
                    let maxDamageRatio = 0;
                    let maxDamageType = '';
                    for (let k=0; k<Pokemon.battleData[this.#trend[i]].move[0].length; k++) {
                        let move = Pokemon.battleData[this.#trend[i]].move[0][k];
                        let rate = Pokemon.battleData[this.#trend[i]].move[1][k];
                        if (rate < 10) { break; }
                        if (!Pokemon.isDamageMove(move)) { continue; }
                        battle.critical = Pokemon.criticalMoves.includes(move);
                        battle.nCombo = (move in Pokemon.comboMoves) ? Pokemon.comboMoves[move][1] : 1;
                        battle.damageText({attackSide:1, move:move, maxRepeat:1, approxCombo:true});
                        let damageRatio = Math.min(1, Math.max(...Object.keys(battle.totalDamage))/battle.pokemon[0].status[0]);
                        if (maxDamageRatio < rate/100*damageRatio) {
                            maxDamageRatio = rate/100*damageRatio;
                            maxDamageType = Pokemon.moves[move].type;
                        }
                        if (move == 'テラバースト') {
                            battle.pokemon[1].terastal = true;
                            Pokemon.battleData[this.#trend[i]].Ttype[0].forEach((Ttype, t) => {
                                if (Pokemon.battleData[this.#trend[i]].Ttype[1][k] < 10) { return; }
                                battle.pokemon[1].Ttype = Ttype;
                                battle.damageText({attackSide:0, move:move, maxRepeat:1, approxCombo:true});
                                damageRatio = Math.min(1, Math.max(...Object.keys(battle.totalDamage))/battle.pokemon[0].status[0]);
                                if (maxDamageRatio < rate/100*damageRatio) {
                                    maxDamageRatio = rate/100*damageRatio;
                                    maxDamageType = Ttype;
                                }
                            });
                            battle.pokemon[1].terastal = false;
                        }
                    }
                    maxDamageRatio = Math.min(1, maxDamageRatio);
                    partyWeight[j] += Math.sqrt(1-maxDamageRatio);
                    enemyWeight[i] += maxDamageRatio;
                    if (maxDamageType) { typeWeight[maxDamageType] += maxDamageRatio; }
                }
            }
        });
        let max = Math.max(...partyWeight, 0.001);
        document.querySelectorAll('.img-pokemon img').forEach((elem, j) => {
            elem.style.opacity = Math.max(0.2, partyWeight[j]/max);
        });
        max = Math.max(...enemyWeight, 0.001);
        document.querySelectorAll('#balance-check-main .trend').forEach((elem, i) => {
            elem.querySelectorAll('img').forEach(elem2 => {
                elem2.style.opacity = Math.max(0.2, enemyWeight[i]/max);
            });
        });
        if (mode == 'defence') {
            // 重みを、被ダメージの大きさ -> 受けの有利さに変換
            let weight = {...typeWeight};
            for (let type in Pokemon.typeID) {
                if (type == 'ステラ') { continue; }
                for (let t in weight) {
                    let w = Pokemon.typeCorrections[Pokemon.typeID[t]][Pokemon.typeID[type]];
                    typeWeight[type] -= w*weight[t];
                }
            }
        }
        typeWeight = sortObj(typeWeight, 'reverse');
        document.querySelectorAll('#recommend-type img').forEach((elem, i) => {
            elem.src = `data/type_img/${Pokemon.typeFileCode[Object.keys(typeWeight)[i]]}.png`;
        });
    }
}
// main
(async () => {
    const app = new PokemonBattleAssistant();
    if (DEBUG) {
        await drawImage({canvas:app.captureCanvas, url:'log/matching.png', fitToCanvas:true});
        //await drawImage({canvas:app.captureCanvas, url:'log/battle.png', fitToCanvas:true});
    }
    const interval = 100; // [ms]
    let isReset = false;
    async function mainLoop() {
        try {
            if (app.IS_INIT) {
                if (app.isMainMode()) {
                    let phase = app.currentPhase();
                    console.log(`< ${phase} >`);    
                    // マッチング画面
                    if (phase == 'MATCHING') {
                        // リセット
                        if (!isReset) {
                            isReset = true;
                            document.getElementById('timer').style.opacity = 0;
                            app.resetMatch();
                        }
                        // 相手のパーティを読み取る
                        await app.readEnemy();
                        // 選出ガイド
                        app.updateSelectionGuide();
                    }
                    // バトル画面
                    else if (phase == 'BATTLE') {
                        if (!app.startTime) {
                            // 試合開始
                            app.startTime = performance.now();
                            document.getElementById('timer').style.opacity = 1;
                            document.querySelectorAll('.img-pokemon img').forEach((elem) => {
                                elem.style.opacity = 1;
                            });
                            document.querySelectorAll('.img-enemy img').forEach((elem) => {
                                elem.style.filter = 'drop-shadow(0 0 1px #000000)';
                            });
                            isReset = false;
                        } else {
                            let changeFlag = false;
                            // 味方ポケモンの名前を読み取る
                            changeFlag |= await app.updateFieldPokemon();
                            // 相手ポケモンの名前を読み取る
                            changeFlag |= await app.updateFieldEnemy();
                            if (app.recognizeHP) {
                                // ポケモンのHPを読み取る
                                changeFlag |= await app.updateFieldPokemonHP();
                                // 相手ポケモンのHPを読み取る
                                changeFlag |= app.updateEnemyHPratio();
                            }
                            // ダメージ計算
                            if (changeFlag) {
                                app.updateAttackDamage();
                                app.updateDefenceDamage(true);
                            }
                        }
                    }
                    // タイマー更新
                    app.updateMatchTime();
                }
            }
            setTimeout(mainLoop, interval);
        } catch (e) {
            if(window.confirm(`エラーが発生しました。ページをリロードします\n${e.name}: ${e.message}`)) {
                location.reload();
            }
        }
    }
    mainLoop();
})()