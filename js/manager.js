import {
    toKatakana, videoStream, setAnnotation, last, toBinary, trim, ocr, loadImage, templateMatch, mostLikelyElement,
} from './common.js';
import { Pokemon, Battle } from './pokemon.js';
import { Storage } from './storage.js';
import { createCombobox } from './combobox.js';


function moveAnnotation(move) {
    let annotation = '';
    if (move in Pokemon.moves) {
        let m = Pokemon.moves[move];
        annotation = (m['power']) ?
        `${m['type']}・${m['class']}<br>威力 ${m['power']}<br>命中 ${m['hit']}%<br>PP ${m['pp']} (${1.6*m['pp']})` :
        `${m['type']}・${m['class']}<br>命中 ${m['hit']}%<br>PP ${m['pp']} (${1.6*m['pp']})`;
    }
    return annotation;
}

class PokemonManager {
    FPS = 60;
    ICON_SIZE = '136px';
    #pokemon;

    #appStorage;
    #pokemonStorage;

    #captureVideo;
    #mediaDevices;
    #deviceLabel;

    #cbNickname;
    #cbName;
    #cbNature;
    #cbAbility;
    #cbItem;
    #cbTtype;
    #cbMove = [];

    #cbFilterNickname;
    #cbFilterName;
    #cbFilterType;
    #cbFilterAbility;
    #cbFilterItem;
    #cbFilterTtype;
    #cbFilterMove;

    #efforts = [0].concat(Array.apply(null,new Array(32)).map(function(v,i){ return 4+(i*8);}));

    constructor() {
        console.log('PokemonRegistrationを初期化中...');
        
        this.#appStorage = new Storage('PokemonManager');
        this.#pokemonStorage = new Storage('pokemonRegistration');

        // canvas要素の初期化
        this.trimCanvas = document.getElementById('canvas-trim');
        this.templCanvas = document.getElementById('canvas-template');
        this.captureCanvas = document.getElementById('canvas-capture');
        this.screenCanvas = document.getElementById('canvas-screen')

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
                // 画面解析に使う画像（非表示）
                this.captureCanvas.getContext('2d').drawImage(this.#captureVideo, 0, 0, this.captureCanvas.width, this.captureCanvas.height);
            }, 1000/this.FPS);
        });
        
        this.init();
    }

    async init() {
        // ポケモンモジュールの初期化
        try {
            await Pokemon.init();
        } catch(e) {
            if(window.confirm(`初期化に失敗しました。ページをリロードします\n${e.name}: ${e.message}`)) {
                location.reload();
            }
        }

        this.#pokemon = new Pokemon();

        this.#cbNickname = createCombobox(document.querySelector('#nickname .combobox'));
        this.#cbNickname.addOptions(this.#pokemonStorage.keys().sort());
    
        this.#cbName = createCombobox(document.getElementById('name'));
        this.#cbName.addOptions(Array.from(new Set(Object.keys(Pokemon.battleData).concat(Object.keys(Pokemon.zukan)))));

        this.#cbNature = createCombobox(document.getElementById('nature'));
        this.#cbNature.addOptions(Object.keys(Pokemon.natureCorrections));

        this.#cbAbility = createCombobox(document.getElementById('ability'));

        this.#cbItem = createCombobox(document.getElementById('item'));
        this.#cbItem.addOptions(Object.keys(Pokemon.items).sort());

        this.#cbTtype = createCombobox(document.getElementById('Ttype'));
        this.#cbTtype.addOptions(Object.keys(Pokemon.typeID));

        this.addBattleWidget({damageWidget:this.addDamageWidget()});

        document.querySelectorAll('.move').forEach((combobox, i) => {
            this.#cbMove.push(createCombobox(combobox));
            this.#cbMove[i].addOptions(Object.keys(Pokemon.moves));   
        });

        document.querySelector('.add-damage-widget').addEventListener('click', () => {
            let damageWidget = this.addDamageWidget();
            let move = '';
            for(let i=0; i<4; i++) {
                let m = this.#cbMove[i].comboboxNode.value;
                if (Pokemon.isDamageMove(m)) {
                    move = m;
                    break;
                }
            }
            this.addBattleWidget({damageWidget:damageWidget, move:move});
            this.updateDamage(damageWidget);
            this.save();
        });

        // 登録ポケモン一覧のフィルタ
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

        document.querySelector('#icon img').src = `data/item_img/${Pokemon.itemFileCode['モンスターボール']}.png`;
        this.setEventListener();
        
        console.log('PokemonManagerを初期化しました');
    }

    display(mode='main') {
        document.querySelector('.damage-calc-wrapper').style.display =
            ['main', 'damageSelection'].includes(mode) ? 'block' : 'none';
        document.querySelector('.capture-window').style.display = (mode == 'capture') ? 'block' : 'none';
        document.querySelector('.damage-window-wrapper').style.display = (mode == 'main') ? 'block' : 'none';
        document.querySelector('.damage-selection-wrapper').style.display = (mode == 'damageSelection') ? 'block' : 'none';
        document.querySelector('.pokemon-list-wrapper').style.display = (mode == 'pokemonList') ? 'block' : 'none';
        if (mode == 'pokemonList') { window.scroll({top: 0, behavior: 'smooth'}); }
    }

    save() {
        if (!(this.#pokemon.name in Pokemon.zukan) || !this.#pokemon.nickname || 
            document.getElementById('nickname-message').style.opacity == 1) {
                return;
        }
        this.#pokemonStorage.setItem(this.#pokemon.nickname, this.#pokemon.clone());
        this.#pokemonStorage.save();

        let dws = [];
        this.damageWidgets().forEach(damageWidget => {
            let dw = {};
            dw.name = damageWidget.querySelector('.enemy-name input').value;
            dw.nature = damageWidget.querySelector('.enemy-nature input').value;
            dw.ability = damageWidget.querySelector('.enemy-ability input').value;
            dw.item = damageWidget.querySelector('.enemy-item input').value;
            dw.Ttype = damageWidget.querySelector('.enemy-Ttype input').value;
            dw.effort = []
            damageWidget.querySelectorAll('.enemy-effort input').forEach(elem => {
                dw.effort.push(Number(elem.value) || 0);
            });
            dw.weather = damageWidget.querySelector('.weather input').value;
            dw.field = damageWidget.querySelector('.field input').value;
            dw.attackSide = Number(damageWidget.querySelector('.AD').textContent == '守');

            let battleWidgets = damageWidget.querySelectorAll('.battle-widget');

            let keys = ['ailment','rank','battlemove','nCombo'];
            for (let key of keys) {
                dw[key] = [];
                battleWidgets.forEach(battleWidget => {
                    battleWidget.querySelectorAll(`.${key} input`).forEach(elem => {
                        dw[key].push(elem.value);
                    });
                });
            }
            keys = ['terastal','hasItem','wall','stealthrock','critical','enhance','skinDamage',
                    'metDamage','orbDamage','weatherDamage','glassRecovery','ailmentDamage'];
            for (let key of keys) {
                dw[key] = [];
                battleWidgets.forEach(battleWidget => {
                    battleWidget.querySelectorAll(`.${key} input`).forEach(elem => {
                        dw[key].push(elem.checked);
                    });
                });
            }
            dws.push(dw);
        });
        this.#appStorage.setItem(this.#pokemon.nickname, dws);

        for (let key of this.#appStorage.keys()) {
            if (!key.includes('enemyTemplate') && !this.#pokemonStorage.includes(key)) {
                this.#appStorage.delete(key);
            }
        }
        this.#appStorage.save();
    }

    clear() {
        this.setName('');
        this.setNature('');
        this.setAbility('');
        this.setItem('');
        this.setTtype('');
        for (let i=0; i<4; i++) {
            this.setMove(i, '');
        }
        this.setLevel(50);
        document.querySelectorAll('.base').forEach(elem => {
            elem.value = '';
        });
        for (let i=0; i<6; i++) {
            this.setIndiv(i, 31);
            this.setEffort(i, 0);
        }
    }

    maximizeBD(mode) {
        let remainingEffort = 508 - this.#pokemon.effort.reduce((x,y) => (x+y));
        if (remainingEffort < 4) { return; }

        let pokemon = this.#pokemon.clone();
        let result = {}, indicator;

        for (let h=0; h<=252; h+=4) {
            if (h > remainingEffort) { break; }
            pokemon.effort[0] = this.#pokemon.effort[0] + h;
            if (!this.#efforts.includes(pokemon.effort[0])) { continue; }

            if (mode == 'B' || mode == 'D') {
                const ind = (mode == 'B') ? 2 : 4;
                for (let x=0; x<=252; x+=4) {
                    if (x > remainingEffort-h) { break; }
                    pokemon.effort[ind] = this.#pokemon.effort[ind] + x;
                    if (!this.#efforts.includes(pokemon.effort[ind])) { continue; }
                    pokemon.updateStatus();
                    indicator = pokemon.status[0]*pokemon.status[ind];
                    if (!(indicator in result)) {
                        result[indicator] = {[h+x]:[pokemon.effort[0],pokemon.effort[2],pokemon.effort[4]]};
                    } else {
                        result[indicator][h+x] = [pokemon.effort[0],pokemon.effort[2],pokemon.effort[4]];
                    }
                }
            } else {
                for (let b=0; b<=252; b+=4) {
                    if (b > remainingEffort-h) { break; }
                    pokemon.effort[2] = this.#pokemon.effort[2] + b;
                    if (!this.#efforts.includes(pokemon.effort[2])) { continue; }
                    for (let d=0; d<=252; d+=4) {
                        if (d > remainingEffort-h-b) { break; }
                        pokemon.effort[4] = this.#pokemon.effort[4] + d;
                        if (!this.#efforts.includes(pokemon.effort[4])) { continue; }
                        pokemon.updateStatus();
                        indicator = Math.trunc(
                            pokemon.status[0]*pokemon.status[2]*pokemon.status[4]/(pokemon.status[2]+pokemon.status[4])
                        );
                        if (!(indicator in result)) {
                            result[indicator] = {[h+b+d]:[pokemon.effort[0],pokemon.effort[2],pokemon.effort[4]]};
                        } else {
                            result[indicator][h+b+d] = [pokemon.effort[0],pokemon.effort[2],pokemon.effort[4]];
                        }
                    }
                }
            }
        }
        return result;
    }

    addEffortItem(effort, status, annotation='') {
        let list = document.getElementById('effort-list');
        let hidden = document.querySelector('.hidden .effort-item');
        let elem = hidden.cloneNode(true);
        elem.querySelectorAll('p').forEach((p,i) => {
            p.textContent = (i == 0) ? 
                `${status[0]} - ${status[2]} - ${status[4]}` :
                `${effort[0]} - ${effort[2]} - ${effort[4]}`;
        });
        elem.addEventListener('click', () => {
            let eff = elem.querySelectorAll('p')[1].textContent.split(' - ');
            for (let i=0; i<3; i++) {
                this.setEffort(2*i, Number(eff[i]));
            }
            this.damageWidgets().forEach(damageWidget => {
                this.updateDamage(damageWidget);
            });
            this.save();
        });
        list.appendChild(elem);
        if (annotation) {
            setAnnotation(elem);
            elem.addEventListener('mousemove', () => {
                document.getElementById('annotation').innerHTML = annotation;
            });
        }
    }

    clearEffortList() {
        document.querySelector('#effort-list').scrollTop = 0;
        document.querySelectorAll('#effort-list .effort-item').forEach(elem => {
            elem.remove();
        });
    }

    updateStatus() {
        if (!(this.#pokemon.name in Pokemon.zukan)) { return; }
        this.#pokemon.updateStatus();
        document.querySelectorAll('.status input').forEach((elem, i) => {
            elem.value = this.#pokemon.status[i];
        });
    }

    setName(name) {
        this.#pokemon = new Pokemon(name);
        let img = document.querySelector('#icon img');
        if (!(name in Pokemon.zukan)) {
            this.#cbName.comboboxNode.value = '';
            img.src = `data/item_img/${Pokemon.itemFileCode['モンスターボール']}.png`;
            img.style.width = img.style.height = '50px';
            document.getElementById('icon').style.margin = 'auto';
            document.querySelectorAll('#type img').forEach(elem => { elem.src = ''; });
            return;
        }
        this.#cbName.comboboxNode.value = name;
        this.#pokemon.loadZukan();
        this.updateStatus();
        // 特性
        let options = (name in Pokemon.battleData) ? Pokemon.battleData[name].ability[0] : [];
        options = Array.from(new Set(options.concat(Pokemon.zukan[name].ability)));
        this.#cbAbility.addOptions(options, true);
        this.setAbility(options[0]);
        // もちもの
        options = (name in Pokemon.battleData) ? Pokemon.battleData[name].item[0] : [];
        options = Array.from(new Set(options.concat(Object.keys(Pokemon.items).sort())));
        this.#cbItem.addOptions(['-'].concat(options), true);
        // テラスタイプ
        options = (name in Pokemon.battleData) ? Pokemon.battleData[name].Ttype[0] : [];
        options = Array.from(new Set(options.concat(Object.keys(Pokemon.typeID))));
        this.#cbTtype.addOptions(options, true);
        // 技
        options = (name in Pokemon.battleData) ? Pokemon.battleData[name].move[0] : [];
        options = Array.from(new Set(options.concat(Object.keys(Pokemon.moves))));
        for (let i=0; i<4; i++) {
            this.#cbMove[i].addOptions(['-'].concat(options), true);
            if (name in Pokemon.battleData) { this.setMove(i, options[i]); }
        }
        img.src = `data/icon/${Pokemon.iconFileCode[name]}.png`;
        img.style.width = img.style.height = this.ICON_SIZE;
        document.getElementById('icon').style.marginLeft = '6px';
        document.querySelectorAll('#type img').forEach((elem, i) => {
            if (i < this.#pokemon.type.length) {
                elem.src = `data/type_img/${Pokemon.typeFileCode[this.#pokemon.type[i]]}.png`;
            }
        });
        document.querySelectorAll('.base').forEach((elem, i) => {
            elem.textContent = this.#pokemon.base[i];
        });
    }

    setNature(nature) {
        if (!(nature in Pokemon.natureCorrections)) { return; }
        this.#cbNature.comboboxNode.value = this.#pokemon.nature = nature;
        this.updateStatus();

        document.querySelectorAll('.status input').forEach((elem, i) => {
            if (Pokemon.natureCorrections[nature][i] > 1) {
                elem.style.color = '#ff0000';
            } else if (Pokemon.natureCorrections[nature][i] < 1) {
                elem.style.color = '#0000ff';
            } else {
                elem.style.color = '#000000';
            }
        });
    }

    setAbility(ability) {
        if (!Pokemon.abilities.includes(ability)) {
            this.#cbAbility.comboboxNode.value = this.#pokemon.ability = '';
            return;
        }
        this.#cbAbility.comboboxNode.value = this.#pokemon.ability = ability;
    }

    setItem(item) {
        let img = document.getElementById('img-item');
        if (!(item in Pokemon.items)) {
            this.#cbItem.comboboxNode.value = this.#pokemon.item = '';
            img.src = '';
            img.style.opacity = 0;
            return;
        }
        this.#cbItem.comboboxNode.value = this.#pokemon.item = item;
        img.src = `data/item_img/${Pokemon.itemFileCode[this.#pokemon.item]}.png`;
        img.style.opacity = 1;
    }

    setTtype(Ttype) {
        let img = document.getElementById('img-Ttype');
        if (!(Ttype in Pokemon.typeID)) {
            this.#cbTtype.comboboxNode.value = this.#pokemon.Ttype = '';
            img.src = '';
            img.style.opacity = 0;
            return;
        }
        this.#cbTtype.comboboxNode.value = this.#pokemon.Ttype = Ttype;
        img.src = `data/type_img/${Pokemon.typeFileCode[this.#pokemon.Ttype]}.png`;
        img.style.opacity = 1;
    }

    setMove(i, move) {
        if (!(move in Pokemon.moves)) { return; }
        this.#cbMove[i].comboboxNode.value = move;
        this.#pokemon.move[i] = move;

        let options = [];
        for (let move of this.#pokemon.move) {
            if (Pokemon.isDamageMove(move)) { options.push(move); }
        }
        options = Array.from(new Set(options.concat(Object.keys(Pokemon.moves).sort())));

        this.damageWidgets().forEach(damageWidget => {
            if (damageWidget.querySelector('.AD').textContent == '攻') {
                damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                    this.createBattlemoveCombobox(battleWidget, options);
                });
            }
        });
    }

    getMoves() {
        let moves = [];
        for (let j=0; j<4; j++) { moves.push(this.#cbMove[j].comboboxNode.value); }
        return moves;
    }

    setLevel(level) {
        document.querySelector('#level input').value = level;
        this.#pokemon.level = level;
        this.updateStatus();
    }

    setIndiv(i, indiv) {
        document.querySelectorAll('.indiv input')[i].value = indiv;
        this.#pokemon.indiv[i] = indiv;
        this.updateStatus();
    }

    setEffort(i, effort) {
        document.querySelectorAll('.effort input')[i].value = effort;
        if (this.#efforts.includes(effort)) {
            document.querySelectorAll('.effort-bar input')[i].value = this.#efforts.indexOf(effort);
        }
        this.#pokemon.effort[i] = effort;
        let remain = 508 - this.#pokemon.effort.reduce((x,y) => x+y);
        document.getElementById('remaining-effort').textContent = `${remain}`;
        document.getElementById('remaining-effort').style.color = (remain < 0) ? 'red' : '#aaaaaa';
        this.updateStatus();
    }

    setStatus(i, status) {
        if (!(this.#pokemon.name in Pokemon.zukan)) { return false; }
        let effort = this.#pokemon.getEffort(i, status);
        if (effort >= 0) { this.setEffort(i, effort); }
    }

    setEventListener() {
        // キャプチャ画面表示
        let videoButton = document.getElementById('video-button');
        videoButton.addEventListener('click', () => {
            let captureWindow = document.querySelector('.capture-window');
            this.display((captureWindow.style.display != 'block') ? 'capture' : 'main');
        });
        
        // バックアップの読み書き
        document.getElementById('write').addEventListener('click', () => {
            // PokemonStorage
            let data = 'PokemonManager\n';
            data += `${this.#pokemonStorage.stringify()}\n`;
            let dict = {};
            for (let key of this.#appStorage.keys()) {
                if (!key.includes('enemyTemplate')) {
                    dict[key] = this.#appStorage.getItem(key);
                }
            }
            // AppStorage
            data += `${JSON.stringify(dict)}`;
            let link = document.getElementById('write');
            link.href = 'data:text/plain,' + encodeURIComponent(data);
            link.download = new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"}).split('/').join('');
        });

        document.getElementById('read').addEventListener('change', event => {
            let reader = new FileReader();
            reader.readAsText(event.currentTarget.files[0], 'utf-8');
            reader.onload = () => {
                let data = reader.result.split('\n');
                if (!data.length || data[0] != 'PokemonManager') {
                    window.alert('ファイルの形式が正しくありません。');
                    return;
                }
                if (data.length >= 2) {
                    let pokemon = JSON.parse(data[1]);
                    for (let p in pokemon) {
                        this.#pokemonStorage.setItem(p, pokemon[p]);
                    }
                    this.#pokemonStorage.save();
                }
                if (data.length >= 3) {
                    let pokemon = JSON.parse(data[2]);
                    for (let p in pokemon) {
                        let dws = [];
                        for (let key in pokemon[p]) {
                            dws.push(pokemon[p][key]);
                        }
                        this.#appStorage.setItem(p, dws);
                    }
                    this.#appStorage.save();
                }
            }
        });

        // 耐久調整
        document.getElementById('opt-defence').addEventListener('click', () => {
            let damageSelectionWrapper = document.querySelector('.damage-selection-wrapper');
            this.display((damageSelectionWrapper.style.display != 'block') ? 'damageSelection' : 'main');
            if (damageSelectionWrapper.style.display == 'block') {
                document.querySelectorAll('.damage-miniwidget-wrapper .damage-miniwidget').forEach(elem => {
                    elem.remove();
                });
                this.damageWidgets().forEach(damageWidget => {
                    if (damageWidget.querySelector('.AD').textContent == '攻') { return; }
                    let name = damageWidget.querySelector('.enemy-name input').value;
                    if (!(name in Pokemon.zukan)) { return; }
                    
                    let widget = document.querySelector('.hidden .damage-miniwidget').cloneNode(true);
                    document.querySelector('.damage-miniwidget-wrapper').appendChild(widget);

                    widget.querySelector('.dmw-enemy-icon').src = `data/icon/${Pokemon.iconFileCode[name]}.png`;

                    let item = damageWidget.querySelector('.enemy-item input').value;
                    let elem = widget.querySelector('.dmw-item-icon');
                    if (item in Pokemon.items) {
                        elem.src = `data/item_img/${Pokemon.itemFileCode[item]}.png`;
                        elem.style.display = 'inline';
                    } else {
                        elem.style.display = 'none';
                    }

                    let Ttype = damageWidget.querySelector('.enemy-Ttype input').value;
                    elem = widget.querySelector('.dmw-Ttype-icon');
                    if (Ttype in Pokemon.typeID) {
                        elem.src = `data/type_img/${Pokemon.typeFileCode[Ttype]}.png`;
                        elem.style.display = 'inline';
                    } else {
                        elem.style.display = 'none';
                    }

                    let status = damageWidget.querySelectorAll('.enemy-status input');
                    let dmwStatus = widget.querySelector('.dmw-status');
                    elem = widget.querySelector('.dmw-move');
                    damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                        let move = battleWidget.querySelector('.battlemove input').value;
                        if (Pokemon.isDamageMove(move)) {
                            elem.innerHTML += (!elem.innerHTML ? '' : '+') + move;
                            let AC = (Pokemon.moves[move]['class'] == '物理') ? 'A' : 'C';
                            if (!(dmwStatus.innerHTML.includes(AC))) {
                                dmwStatus.innerHTML += (!dmwStatus.innerHTML ? '' : '<br>') +
                                    `${AC}${status[1+2*Number(AC == 'C')].value}`;
                            }                           
                        }
                    });
                });
            }
        });
        
        document.querySelector('.damage-selection .close-button').addEventListener('click', () => {
            this.display();
        });
        
        // 耐久調整
        document.getElementById('run-opt').addEventListener('click', () => {
            this.clearEffortList();

            let enables = [], survivalProbs = [], survivalNums = [];
            document.querySelectorAll('.damage-miniwidget-wrapper .damage-miniwidget').forEach(widget => {
                enables.push(widget.querySelector('.enable').checked);
                if (last(enables)) {
                    survivalProbs.push(Number(widget.querySelector('.survival-prob').value)/100);
                    survivalNums.push(Number(widget.querySelector('.survival-num').value));
                }
            });
            let damageWidgets = [], i = 0;
            this.damageWidgets().forEach(damageWidget => {
                if (damageWidget.querySelector('.AD').textContent == '守' ) {
                    if (enables[i]) { damageWidgets.push(damageWidget); }
                    i++;
                }
            });

            // ダメージ計算
            let pokemon = this.#pokemon.clone();
            let minIndicator = [1e10, 1e10], HB = {}, HD = {};
            
            for (let h of [...this.#efforts].reverse()) {
                this.#pokemon.effort[0] = h;

                // ind = 0:物理, 1:特殊
                for (let ind=0; ind<2; ind++) {
                    this.#pokemon.effort[4-2*ind] = 252;

                    for (let x of [...this.#efforts].reverse()) {
                        this.#pokemon.effort[2*(ind+1)] = x;
                        this.#pokemon.updateStatus();
                        let indicator = this.#pokemon.status[0]*this.#pokemon.status[2*(ind+1)];
                        let flag = true;

                        if (indicator < minIndicator[ind]*1.05) {
                            for (let i=0; i<damageWidgets.length; i++) {
                                let [lethalProb, lethalNum] = this.updateDamage(damageWidgets[i], survivalNums[i]);
                                if (lethalNum == 0) {
                                    continue;
                                } else if (lethalNum < survivalNums[i]) {
                                    flag = false;
                                    break;
                                } else if (lethalNum == survivalNums[i]) {
                                    if (1-lethalProb < survivalProbs[i]) {
                                        flag = false;
                                        break;
                                    }
                                }
                            }
                        }

                        if (flag) {
                            if (ind == 0) {
                                HB[h] = x;
                            } else {
                                HD[h] = x;
                            }
                            minIndicator[ind] = Math.min(minIndicator[ind], indicator);
                        } else {
                            break;
                        }
                    }
                }
                if (!(h in HB) || !(h in HD)) { break; }
            }

            let result = {};
            for (let h in HB) {
                if (!(h in HD)) { continue; }
                let key = Number(h) + HB[h] + HD[h];
                if (!(key in result)) {
                    result[key] = {[h]: [Number(h), HB[h], HD[h]]};
                } else {
                    result[key][h] = [Number(h), HB[h], HD[h]];
                }
            }

            let sum = 0;
            for (let i=0; i<3; i++) { sum += pokemon.effort[2*i]; }
            this.addEffortItem(pokemon.effort, pokemon.status, `努力値 ${sum}`);

            let count = 0;
            Object.keys(result).sort((a,b)=>{return Number(a)-Number(b)}).forEach(eff => {
                Object.keys(result[eff]).sort((a,b)=>{return Number(b)-Number(a)}).forEach(h => {
                    if (count < 50) {
                        sum = 0;
                        for (let i=0; i<3; i++) {
                            pokemon.effort[2*i] = result[eff][h][i];
                            sum += result[eff][h][i];
                        }
                        pokemon.updateStatus();
                        this.addEffortItem(pokemon.effort, pokemon.status, `努力値 ${sum}`);

                        if (count == 0) {
                            for (let i=0; i<3; i++) {
                                this.setEffort(2*i, pokemon.effort[2*i]);
                            }
                            this.damageWidgets().forEach(damageWidget => {
                                this.updateDamage(damageWidget);
                            });
                            this.save();
                        }
                    }
                    count++;
                });
            });

            this.display();
        });

        ['select-all', 'deselect-all'].forEach((s, i) => {
            document.getElementById(s).addEventListener('click', () => {
                document.querySelectorAll('.damage-miniwidget-wrapper .damage-miniwidget').forEach(widget => {
                    widget.querySelectorAll('.enable').forEach(elem => {
                        elem.checked = (i+1)%2;
                    });
                });
            });
        });

        document.getElementById('reset').addEventListener('click', () => {
            document.querySelectorAll('.damage-miniwidget-wrapper .damage-miniwidget').forEach(widget => {
                widget.querySelectorAll('.enable').forEach(elem => {
                    elem.checked = true;
                });
                widget.querySelectorAll('.lethal-prob').forEach(elem => {
                    elem.value = 100;
                });
                widget.querySelectorAll('.lethal-num').forEach(elem => {
                    elem.value = 1;
                });
            });
        });

        // 耐久指数の最大化
        ['maximize-B', 'maximize-D', 'maximize-BD'].forEach(s => {
            let mode = s.substring(s.indexOf('-')+1);

            let indicatorText;
            if (mode == 'B') {
                indicatorText = '物理';
            } else if (mode == 'D') {
                indicatorText = '特殊';
            } else {
                indicatorText = '総合';
            }
            indicatorText += '耐久指数';

            let elem = document.getElementById(s);
            elem.addEventListener('click', () => {
                this.clearEffortList();
                if (!(this.#pokemon.name in Pokemon.zukan)) { return; }
                this.addEffortItem(this.#pokemon.effort, this.#pokemon.status, 'オリジナル');

                let data = this.maximizeBD(mode);
                if (!data || !Object.keys(data).length) { return; }
                let pokemon = this.#pokemon.clone();
                let count = 0;

                Object.keys(data).sort((a,b)=>{return Number(b)-Number(a)}).forEach(indicator => {
                    Object.keys(data[indicator]).sort((a,b)=>{return Number(a)-Number(b)}).forEach(eff => {
                        if (count < 50) {
                            for (let i=0; i<3; i++) {
                                pokemon.effort[2*i] = data[indicator][eff][i];
                            }
                            pokemon.updateStatus();
                            this.addEffortItem(pokemon.effort, pokemon.status, `${indicatorText} ${indicator}`);
                        }
                        if (count == 0) {
                            for (let i=0; i<3; i++) {
                                this.setEffort(2*i, pokemon.effort[2*i]);
                            }
                            this.damageWidgets().forEach(damageWidget => {
                                this.updateDamage(damageWidget);
                            });
                            this.save();
                        }
                        count++;
                    });
                });
            });

            setAnnotation(elem);
            elem.addEventListener('mousemove', () => {
                document.getElementById('annotation').innerHTML =
                    indicatorText + 'が最大になるように、残りの努力値を配分する';
            });
        });

        document.getElementById('new-button').addEventListener('click', () => {
            window.open('manager.html');
        });

        let elem = document.getElementById('icon');
        elem.addEventListener('click', async () => {
            if (window.confirm('ボックスからポケモンを読み込みますか？')) {
                await this.readBoxPokemon();
                this.damageWidgets().forEach(damageWidget => {
                    damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                        this.updateBattleWidget(battleWidget);
                    });
                });
                this.save();
                this.display();
            }
        });
        setAnnotation(elem);
        elem.addEventListener('mousemove', () => {
            document.getElementById('annotation').innerHTML = 'ボックスから読み込む';
        });

        this.#cbNickname.comboboxNode.addEventListener('input', event => {
            let nickname = event.currentTarget.value;
            this.#pokemonStorage.delete(this.#pokemon.nickname);
            if (this.#pokemonStorage.includes(nickname)) {
                document.getElementById('nickname-message').textContent = 'すでに登録されているため使用できません'
                document.getElementById('nickname-message').style.opacity = 1;
            } else if (nickname.includes('*')) {
                document.getElementById('nickname-message').textContent = 'アスタリスク*は使用できません'
                document.getElementById('nickname-message').style.opacity = 1;
            } else {
                document.getElementById('nickname-message').style.opacity = 0;
                this.#pokemon.nickname = nickname;
                this.save();
            }
        });

        this.#cbNickname.comboboxNode.addEventListener('change', event => {
            let nickname = event.currentTarget.value;
            if (nickname != this.#pokemon.nickname && this.#pokemonStorage.includes(nickname)) {
                document.getElementById('nickname-message').textContent = 'すでに登録されているため使用できません'
                document.getElementById('nickname-message').style.opacity = 1;
            }
        });

        this.#cbName.comboboxNode.addEventListener('change', event => {
            const name = event.currentTarget.value;
            this.clear();
            this.clearEffortList();
            this.setName(name);
            this.damageWidgets().forEach(damageWidget => {
                damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                    this.updateBattleWidget(battleWidget);
                });
            });
            // ダメージ計算
            this.damageWidgets().forEach(elem => {
                this.updateDamage(elem);
            });
            this.save();
        });

        this.#cbNature.comboboxNode.addEventListener('change', event => {
            this.setNature(event.currentTarget.value);
            // ダメージ計算
            this.damageWidgets().forEach(elem => {
                this.updateDamage(elem);
            });
            this.save();
        });

        this.#cbAbility.comboboxNode.addEventListener('change', event => {
            this.setAbility(event.currentTarget.value);
            this.damageWidgets().forEach(damageWidget => {
                damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                    this.updateBattleWidget(battleWidget);
                });
            });
            // ダメージ計算
            this.damageWidgets().forEach(elem => {
                this.updateDamage(elem);
            });
            this.save();
        });

        this.#cbItem.comboboxNode.addEventListener('change', event => {
            this.setItem(event.currentTarget.value);
            this.damageWidgets().forEach(damageWidget => {
                damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                    this.updateBattleWidget(battleWidget);
                });
            });
            // ダメージ計算
            this.damageWidgets().forEach(elem => {
                this.updateDamage(elem);
            });
            this.save();
        });

        this.#cbTtype.comboboxNode.addEventListener('change', event => {
            this.setTtype(event.currentTarget.value);
            // ダメージ計算
            this.damageWidgets().forEach(elem => {
                this.updateDamage(elem);
            });
            this.save();
        });

        for (let i=0; i<4; i++) {
            this.#cbMove[i].comboboxNode.addEventListener('change', event => {
                this.setMove(i, event.currentTarget.value);
                this.save();
            });
            setAnnotation(this.#cbMove[i].comboboxNode);
            this.#cbMove[i].comboboxNode.addEventListener('mousemove', () => {
                document.getElementById('annotation').innerHTML = moveAnnotation(this.#cbMove[i].comboboxNode.value);
            });
        }

        document.querySelector('#level span').addEventListener('click', () => {
            if (this.#pokemon.level == 50) { return; }
            this.setLevel(50);
            // ダメージ計算
            this.damageWidgets().forEach(elem => {
                this.updateDamage(elem);
            });
            this.save();
        });

        document.querySelector('#level input').addEventListener('change', event => {
            this.setLevel(Number(event.currentTarget.value));
            // ダメージ計算
            this.damageWidgets().forEach(elem => {
                this.updateDamage(elem);
            });
            this.save();
        });

        elem = document.querySelector('#level span');
        setAnnotation(elem);
        elem.addEventListener('mousemove', () => {
            document.getElementById('annotation').innerHTML = 'Lv. 50';
        });

        document.querySelectorAll('.effort-bar').forEach((parent, i) => {
            parent.querySelectorAll('span').forEach((elem, j) => {
                elem.addEventListener('click', () => {
                    if (this.#pokemon.effort[i] != 252*j) {
                        this.setEffort(i, 252*j);
                        // ダメージ計算
                        this.damageWidgets().forEach(elem => {
                            this.updateDamage(elem);
                        });
                        this.save();
                    }
                });
            });
        });

        document.querySelectorAll('.indiv input').forEach((elem, i) => {
            elem.addEventListener('change', event => {
                this.setIndiv(i, Number(event.currentTarget.value));
                // ダメージ計算
                this.damageWidgets().forEach(elem => {
                    this.updateDamage(elem);
                });
                this.save();
            });
        });

        document.querySelectorAll('.effort-bar input').forEach((elem, i) => {
            elem.addEventListener('input', event => {
                this.setEffort(i, this.#efforts[Number(event.currentTarget.value)]);
                // ダメージ計算
                this.damageWidgets().forEach(elem => {
                    this.updateDamage(elem);
                });
                this.save();
            });
        });

        document.querySelectorAll('.effort input').forEach((elem, i) => {
            elem.addEventListener('change', event => {
                this.setEffort(i, Number(event.currentTarget.value));
                // ダメージ計算
                this.damageWidgets().forEach(elem => {
                    this.updateDamage(elem);
                });
                this.save();
            });
        });

        document.querySelectorAll('.status input').forEach((elem, i) => {
            elem.addEventListener('change', event => {
                this.setStatus(i, Number(event.currentTarget.value));
                // ダメージ計算
                this.damageWidgets().forEach(elem => {
                    this.updateDamage(elem);
                });
                this.save();
            });
            setAnnotation(elem);
            ['mousemove', 'change'].forEach(s => {
                elem.addEventListener(s, () => {
                    let annotation = '';
                    if (i==0) {
                        let v = elem.value % 16;
                        if (v > 8) { v -= 16; }
                        annotation += `16n${v > 0 ? '+' : ''}${v != 0 ? v : ''}`;
                        v = elem.value % 8;
                        if (v > 4) { v -= 8; }
                        annotation += ` / 8n${v > 0 ? '+' : ''}${v != 0 ? v : ''}`;
                        if (this.#pokemon.item == 'いのちのたま') {
                            v = elem.value % 10;
                            if (v > 5) { v -= 10; }
                            annotation += `<br>10n${v > 0 ? '+' : ''}${v != 0 ? v : ''}`;
                            v = Math.trunc(elem.value / 10);
                            annotation += ` (いのちのたま -${v})`;
                        }
                        if (this.getMoves().includes('みがわり')) {
                            v = elem.value % 4;
                            annotation += `<br>4n${v > 0 ? '+' : ''}${v != 0 ? v : ''}`;
                            v = Math.trunc(elem.value / 4);
                            annotation += ` (みがわり -${v})`;
                        }
                    } else {
                        if (Pokemon.natureCorrections[this.#pokemon.nature][i] > 1) {
                            if (elem.value % 11 == 0) { annotation += '11n'; }
                        }
                    }
                    document.getElementById('annotation').innerHTML = annotation;
                });
            })
        });

        document.querySelector('#description textarea').addEventListener('input', event => {
            this.#pokemon.description = event.currentTarget.value;
            this.save();
        });

        document.querySelector('#delete-button button').addEventListener('click', ()=> {
            if (this.#pokemonStorage.includes(this.#pokemon.nickname) &&
                window.confirm(`${this.#pokemon.nickname}を削除しますか？`)) {
                this.#pokemonStorage.delete(this.#pokemon.nickname);
                this.#pokemonStorage.save();
                this.#cbNickname.comboboxNode.value = '';
                this.#cbName.comboboxNode.value = '';
                this.clear();
            }
        });

        document.getElementById('load-pokemon').addEventListener('click', () => {
            let pokemonListWrapper = document.querySelector('.pokemon-list-wrapper');
            this.display((pokemonListWrapper.style.display != 'block') ? 'pokemonList' : 'main');
            if (pokemonListWrapper.style.display == 'block') {
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
                this.applyFilter();
            }
        });
        
        document.querySelector('.pokemon-list .close-button').addEventListener('click', () => {
            this.display();
        });

        document.getElementById('filter-icon').addEventListener('click', event => {
            this.#cbFilterNickname.comboboxNode.value = '';
            this.#cbFilterName.comboboxNode.value = '';
            this.#cbFilterType.comboboxNode.value = '';
            this.#cbFilterAbility.comboboxNode.value = '';
            this.#cbFilterItem.comboboxNode.value = '';
            this.#cbFilterTtype.comboboxNode.value = '';
            this.#cbFilterMove.comboboxNode.value = '';
            this.applyFilter();
        });

        [this.#cbFilterNickname,this.#cbFilterName,this.#cbFilterType,this.#cbFilterTtype,this.#cbFilterAbility,
            this.#cbFilterItem, this.#cbFilterTtype, this.#cbFilterMove].forEach(cb => {
            ['input', 'change'].forEach(eventType => {
                cb.comboboxNode.addEventListener(eventType, event => {
                    this.applyFilter();
                });
            });
        });            
    }

    damageWidgets() {
        return document.querySelectorAll('.damage-window .damage-widget');
    }

    addDamageWidget(name='') {
        let damageWidget = document.querySelector('.hidden .damage-widget').cloneNode('true');
        document.querySelector('.damage-window').insertBefore(damageWidget, document.querySelector('.add-damage-wrapper'));

        // Enemy widget
        let cbName = createCombobox(damageWidget.querySelector('.enemy-name'));
        cbName.addOptions(Array.from(new Set(Object.keys(Pokemon.battleData).concat(Object.keys(Pokemon.zukan)))));

        let cbNature = createCombobox(damageWidget.querySelector('.enemy-nature'));
        let natures = ['まじめ','いじっぱり','ひかえめ','ずぶとい','わんぱく','おだやか','しんちょう','おくびょう','ようき']
        cbNature.addOptions(Array.from(new Set(natures.concat(Object.keys(Pokemon.natureCorrections)))));

        let cbAbility = createCombobox(damageWidget.querySelector('.enemy-ability'));

        let cbItem = createCombobox(damageWidget.querySelector('.enemy-item'));
        cbItem.addOptions(Object.keys(Pokemon.items).sort());

        let cbTtype = createCombobox(damageWidget.querySelector('.enemy-Ttype'));
        cbTtype.addOptions(Object.keys(Pokemon.typeID));

        let options = ['-'].concat(Pokemon.weathers);
        createCombobox(damageWidget.querySelector('.weather')).addOptions(options);

        options = ['-'].concat(Pokemon.fields);
        createCombobox(damageWidget.querySelector('.field')).addOptions(options);

        // 初期値
        name = name || Object.keys(Pokemon.battleData)[0];
        if (name in Pokemon.zukan) {
            cbName.comboboxNode.value = name;
            damageWidget.querySelector('.enemy-icon img').src = `data/icon/${Pokemon.iconFileCode[name]}.png`;
            
            let options = (name in Pokemon.battleData) ? Pokemon.battleData[name].ability[0] : Pokemon.zukan[name].ability;
            cbAbility.addOptions(['-'].concat(options), true);
            cbAbility.comboboxNode.value = options[0];
            
            options = (name in Pokemon.battleData) ? Pokemon.battleData[name].item[0] : [];
            options = Array.from(new Set(options.concat(Object.keys(Pokemon.items))));
            cbItem.addOptions(['-'].concat(options), true);
            
            options = (name in Pokemon.battleData) ? Pokemon.battleData[name].Ttype[0] : [];
            options = Array.from(new Set(options.concat(Object.keys(Pokemon.typeID))));
            cbTtype.addOptions(['-'].concat(options), true);

            let enemy = new Pokemon(name);
            enemy.effort = [0, 252, 0, 252, 0, 0];
            enemy.loadZukan();
            enemy.updateStatus();
            for (let i=0; i<6; i++) {
                this.setEnemyEffort(damageWidget, i, enemy.effort[i]);
            }
            damageWidget.querySelectorAll('.enemy-status input').forEach((elem, i) => {
                elem.value = enemy.status[i];
            });
        }
        //this.loadEnemyTemplate(damageWidget, name);
        
        let elem = damageWidget.querySelector('.enemy-icon img');
        setAnnotation(elem);
        elem.addEventListener('mousemove', () => {
            let name = cbName.comboboxNode.value;
            if (name in Pokemon.zukan) {
                document.getElementById('annotation').innerHTML =
                    `${Pokemon.zukan[name].type.join('・')}<br>${Pokemon.zukan[name].base.join('-')}`;
            } else {
                document.getElementById('annotation').innerHTML = '';
            }
        });

        cbName.comboboxNode.addEventListener('change', event => {
            const name = event.currentTarget.value;
            if (!(name in Pokemon.zukan)) { return; }
            this.resetBattleWidget(damageWidget);

            damageWidget.querySelector('.enemy-icon img').src = `data/icon/${Pokemon.iconFileCode[name]}.png`;

            let options = (name in Pokemon.battleData) ? Pokemon.battleData[name].ability[0] : Pokemon.zukan[name].ability;
            cbAbility.addOptions(['-'].concat(options), true);
            cbAbility.comboboxNode.value = options[0];
    
            options = (name in Pokemon.battleData) ? Pokemon.battleData[name].item[0] : [];
            options = Array.from(new Set(options.concat(Object.keys(Pokemon.items))));
            cbItem.addOptions(['-'].concat(options), true);
            cbItem.comboboxNode.value = '';
    
            options = (name in Pokemon.battleData) ? Pokemon.battleData[name].Ttype[0] : [];
            options = Array.from(new Set(options.concat(Object.keys(Pokemon.typeID))));
            cbTtype.addOptions(['-'].concat(options), true);
            cbTtype.comboboxNode.value = '';
            
            let enemy = new Pokemon(name);
            enemy.loadZukan();       
            enemy.effort = [0, 252, 0, 252, 0, 0];
            for (let i=0; i<6; i++) {
                this.setEnemyEffort(damageWidget, i, enemy.effort[i]);
            }
            this.loadEnemyTemplate(damageWidget, name);

            enemy.updateStatus();
            damageWidget.querySelectorAll('.enemy-status input').forEach((elem, i) => {
                elem.value = enemy.status[i];
            });
    
            if (damageWidget.querySelector('.AD').textContent == '守' && name in Pokemon.battleData) {
                let options = Pokemon.battleData[name].move[0];
                options = Array.from(new Set(options.concat(Object.keys(Pokemon.moves).sort())));
                damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                    let cb = this.createBattlemoveCombobox(battleWidget, options);
                    cb.comboboxNode.value = options[0];
                });
            }

            this.updateDamage(damageWidget);
            this.save();
        });
        
        cbNature.comboboxNode.addEventListener('change', event => {
            let nature = event.currentTarget.value;
            this.setEnemyNature(damageWidget, nature);
            this.updateDamage(damageWidget);
            this.save();
            this.setEnemyTemplate(cbName.comboboxNode.value, 'nature', nature);
        });

        cbAbility.comboboxNode.addEventListener('change', event => {
            let ability = event.currentTarget.value;
            this.setEnemyAbility(damageWidget, ability);
            damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                this.updateBattleWidget(battleWidget);
            });
            this.updateDamage(damageWidget);
            this.save();
            this.setEnemyTemplate(cbName.comboboxNode.value, 'ability', ability);
        });

        cbItem.comboboxNode.addEventListener('change', event => {
            let item = event.currentTarget.value;
            this.setEnemyItem(damageWidget, item);
            damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                this.updateBattleWidget(battleWidget);
            });
            this.updateDamage(damageWidget);
            this.save();
            this.setEnemyTemplate(cbName.comboboxNode.value, 'item', item);
        });

        cbTtype.comboboxNode.addEventListener('change', event => {
            let Ttype = event.currentTarget.value;
            this.setEnemyTtype(damageWidget, Ttype, true);
            damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                this.updateBattleWidget(battleWidget);
            });
            this.updateDamage(damageWidget);
            this.save();
            this.setEnemyTemplate(cbName.comboboxNode.value, 'Ttype', Ttype);
        });

        damageWidget.querySelectorAll('.enemy-status-label span').forEach((elem, i) => {
            elem.addEventListener('click', () => {
                let effortInput = damageWidget.querySelectorAll('.enemy-effort input')[i];
                let effort = (effortInput.value != '252') ? 252 : 0;
                effortInput.value = effort;
                this.updateDamage(damageWidget);
                this.save();
                this.setEnemyTemplate(cbName.comboboxNode.value, 'effort', this.enemyEffort(damageWidget));
            });
        });

        damageWidget.querySelectorAll('.enemy-effort input').forEach((elem, i) => {
            elem.addEventListener('change', () => {
                let effort = [];
                damageWidget.querySelectorAll('.enemy-effort input').forEach(elem2 => {
                    effort.push(elem2.value);
                });
                this.updateDamage(damageWidget);
                this.save();
                this.setEnemyTemplate(cbName.comboboxNode.value, 'effort', this.enemyEffort(damageWidget));
            });
        });

        damageWidget.querySelectorAll('.enemy-status input').forEach((elem, i) => {
            elem.addEventListener('change', () => {
                let name = damageWidget.querySelector('.enemy-name input').value;
                if (!(name in Pokemon.zukan)) { return; }
                let enemy = new Pokemon(name);
                enemy.loadZukan();
                let nature = damageWidget.querySelector('.enemy-nature input').value;
                if (nature in Pokemon.natureCorrections) { enemy.nature = nature; }
                let effort = enemy.getEffort(i, Number(elem.value));
                if (effort < 0) { return; }
                this.setEnemyEffort(damageWidget, i, effort);
                this.updateDamage(damageWidget);
                this.save();
                this.setEnemyTemplate(cbName.comboboxNode.value, 'effort', this.enemyEffort(damageWidget));
            });
        });

        damageWidget.querySelector('.weather input').addEventListener('change', event => {
            this.setWeather(damageWidget, event.currentTarget.value);
            damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                this.updateBattleWidget(battleWidget);
            });
            this.updateDamage(damageWidget);
            this.save();
        });

        damageWidget.querySelector('.field input').addEventListener('change', event => {
            this.setField(damageWidget, event.currentTarget.value);
            damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                this.updateBattleWidget(battleWidget);
            });
            this.updateDamage(damageWidget);
            this.save();
        });

        elem = damageWidget.querySelector('.AD');
        elem.addEventListener('click', event => {
            let options = [];
            if (event.currentTarget.textContent == '攻') {
                event.currentTarget.textContent = '守';
                let name = damageWidget.querySelector('.enemy-name input').value;
                if (name in Pokemon.battleData) {
                    Pokemon.battleData[name].move[0].forEach(m => {
                        if (Pokemon.isDamageMove(m)) { options.push(m); }
                    });
                }
            } else {
                event.currentTarget.textContent = '攻';
                for (let move of this.#pokemon.move) {
                    if (Pokemon.isDamageMove(move)) { options.push(move); }
                }
            }
            options = Array.from(new Set(options.concat(Object.keys(Pokemon.moves).sort())));
            damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                this.createBattlemoveCombobox(battleWidget, options);
                this.setBattleMove(battleWidget, options[0]);
            });

            this.updateDamageTextBG(damageWidget);
            damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                this.updateBattleWidget(battleWidget);
            });

            this.updateDamage(damageWidget);
            this.save();
        });
        
        setAnnotation(elem);
        elem.addEventListener('mousemove', () => {
            document.getElementById('annotation').innerHTML = '切り替え';
        });

        damageWidget.querySelector('.add-battle-widget').addEventListener('click', () => {
            this.addBattleWidget({damageWidget:damageWidget, cloneLast:true});
            this.updateDamage(damageWidget);
            this.save();
        });

        return damageWidget;
    }

    updateDamageTextBG(damageWidget) {
        let attackSide = Number(damageWidget.querySelector('.AD').textContent == '守');
        damageWidget.querySelector('.AD').style.background = (attackSide) ? '#568eff' : '#ff7575';
        damageWidget.querySelectorAll('.total-damage, .damage').forEach(elem => {
            elem.style.background = (attackSide) ? '#a2c4ff' : '#ffafa2';
        });
    }

    updateBattleWidget(battleWidget) {
        let damageWidget = battleWidget.parentNode.parentNode;

        // 表示・非表示
        let move = battleWidget.querySelector('.battlemove input').value;
        battleWidget.querySelector('.enhance').style.display = (Pokemon.varPowMoves.includes(move)) ? 'block' : 'none';

        let elem = battleWidget.querySelector('.nCombo');
        if (move in Pokemon.comboMoves) {
            elem.style.display = 'block';
            elem.querySelector('input').max = Pokemon.comboMoves[move][1];
        } else {
            elem.style.display = 'none';
        }
        
        battleWidget.querySelector('.skinDamage').style.display =
            [this.#pokemon.ability, damageWidget.querySelector('.enemy-ability input').value].includes('ばけのかわ') ? 'block' : 'none';
        battleWidget.querySelector('.metDamage').style.display =
            [this.#pokemon.item, damageWidget.querySelector('.enemy-item input').value].includes('ゴツゴツメット') ? 'block' : 'none';
        battleWidget.querySelector('.orbDamage').style.display =
            [this.#pokemon.item, damageWidget.querySelector('.enemy-item input').value].includes('いのちのたま') ? 'block' : 'none';
        battleWidget.querySelector('.weatherDamage').style.display =
            Pokemon.weathers.includes(damageWidget.querySelector('.weather input').value) ? 'block' : 'none';
        battleWidget.querySelector('.glassRecovery').style.display = 
            (damageWidget.querySelector('.field input').value == 'グラスフィールド') ? 'block' : 'none';
        
        let attackSide = Number(damageWidget.querySelector('.AD').textContent == '守');
        battleWidget.querySelector('.ailmentDamage').style.display =
            ['どく','やけど'].includes(battleWidget.querySelectorAll('.ailment input')[(attackSide+1)%2].value) ? 'block' : 'none';
        
        // 文字色
        ['.rank','.terastal','.hasItem','.wall','.stealthrock','.critical','.skinDamage','.metDamage',
        '.orbDamage','.weatherDamage','.glassRecovery','.ailmentDamage'].forEach(s => {
            battleWidget.querySelectorAll(s).forEach(parent => {
                let inputElem = parent.querySelector('input');
                parent.querySelectorAll('*').forEach(elem => {
                    if (inputElem.type == 'checkbox') {
                        if (s == '.hasItem') {
                            elem.style.color = !inputElem.checked ? '#000000' : '#999999';
                        } else {
                            elem.style.color = inputElem.checked ? '#000000' : '#999999';
                        }
                    } else if (inputElem.type == 'number') {
                        elem.style.color = Number(inputElem.value) ? '#000000' : '#999999';
                    }
                });
            });
        });
    }

    addBattleWidget({damageWidget, move='', cloneLast=false}) {
        let battleWidgetWrapper;
        if (damageWidget.querySelector('.battle-widget-wrapper')) {
            let lastWidget = last(damageWidget.querySelectorAll('.battle-widget-wrapper'));
            if (cloneLast) {
                battleWidgetWrapper = lastWidget.cloneNode('true');
                move = lastWidget.querySelector('.battlemove input').value;
            } else {
                battleWidgetWrapper = document.querySelector('.hidden .battle-widget-wrapper').cloneNode('true');
            }
            lastWidget.querySelector('.battle-widget').style.borderRadius = 0;
            lastWidget.querySelector('.damage').style.borderRadius = 0;
        } else {
            battleWidgetWrapper = document.querySelector('.hidden .battle-widget-wrapper').cloneNode('true');
        }
        damageWidget.insertBefore(battleWidgetWrapper, damageWidget.querySelector('.add-battle-widget'));

        let battleWidget = battleWidgetWrapper.querySelector('.battle-widget');

        battleWidget.querySelectorAll('.ailment').forEach(combobox => {
            let cb = createCombobox(combobox);
            cb.addOptions(['-'].concat(Pokemon.ailments), true);
            cb.comboboxNode.addEventListener('change', () => {
                this.updateBattleWidget(battleWidget);
                this.updateDamage(damageWidget);
                this.save();
            });
        });

        let options = [];
        if (damageWidget.querySelector('.AD').textContent == '攻') {
            for (let m of this.#pokemon.move) {
                if (Pokemon.isDamageMove(m)) { options.push(m); }
            }
        } else {
            let name = damageWidget.querySelector('.enemy-name input').value;
            if (name in Pokemon.battleData) {
                Pokemon.battleData[name].move[0].forEach(m => {
                    if (Pokemon.isDamageMove(m)) { options.push(m); }
                });
            }
        }
        options = Array.from(new Set(options.concat(Object.keys(Pokemon.moves).sort())));
        let cbMove = this.createBattlemoveCombobox(battleWidget, options);
        if (move in Pokemon.moves) { cbMove.comboboxNode.value = move; }

        battleWidget.querySelectorAll(
            '.rank input, .terastal input, .hasItem input, .wall input, .stealthrock-critical input, .damage-option input'
        ).forEach(elem => {
            elem.addEventListener('change', () => {
                this.updateBattleWidget(battleWidget);
                this.updateDamage(damageWidget);
                this.save();
            });
        });

        battleWidget.querySelector('.delete-battle-widget').addEventListener('click', () => {
            battleWidget.parentNode.remove();
            if (damageWidget.querySelectorAll('.battle-widget').length == 0) {
                damageWidget.remove();
            } else {
                let elems = damageWidget.querySelectorAll('.battle-widget');
                elems.forEach((elem, i) => {
                    if (i < elems.length-1) {
                        elem.style.borderRadius = 0;
                        elem.querySelector('.damage').style.borderRadius = 0;
                    } else {
                        elem.style.borderTopRightRadius = '8px';
                        elem.style.borderBottomRightRadius = '8px';
                        elem.querySelector('.damage').style.borderBottomRightRadius = '7px';
                    }
                });
                this.updateDamage(damageWidget);
            }
            this.save();
        });       

        setAnnotation(battleWidget.querySelector('.damage'));
        return battleWidget;
    }

    resetBattleWidget(damageWidget) {
        damageWidget.querySelectorAll('.ailment input').forEach(elem => {
            elem.value = '';
        });
        damageWidget.querySelectorAll('.rank input').forEach(elem => {
            elem.value = 0;
        });
        damageWidget.querySelectorAll('.hasItem input').forEach(elem => {
            elem.checked = true;
        });
        damageWidget.querySelectorAll('.terastal input, .wall input, .stealthrock-critical input').forEach(elem => {
            elem.checked = false;
        });
    }

    setEnemyTemplate(name, key, value) {
        if (!(name in Pokemon.zukan)) { return; }
        let s = `enemyTemplate_${name}`;
        let obj = (this.#appStorage.includes(s)) ? this.#appStorage.getItem(s) : {};
        obj[key] = value;
        this.#appStorage.setItem(s, obj);
        this.#appStorage.save();
    }

    loadEnemyTemplate(damageWidget, name) {
        const enemyTemplateKey = `enemyTemplate_${name}`;
        if (this.#appStorage.includes(enemyTemplateKey)) {
            let template = this.#appStorage.getItem(enemyTemplateKey);
            if ('nature' in template) {
                this.setEnemyNature(damageWidget, template.nature);
            }
            if ('ability' in template) {
                this.setEnemyAbility(damageWidget, template.ability);
            }
            if ('item' in template) {
                this.setEnemyItem(damageWidget, template.item);
            }
            if ('Ttype' in template) {
                this.setEnemyTtype(damageWidget, template.Ttype);
            }
            if ('effort' in template) {
                for (let i=0; i<6; i++) {
                    this.setEnemyEffort(damageWidget, i, template.effort[i]);
                }
            }
        }
    }

    setEnemyNature(damageWidget, nature) {
        if (!(nature in Pokemon.natureCorrections)) { return; }
        damageWidget.querySelector('.enemy-nature input').value = nature;
        damageWidget.querySelectorAll('.enemy-status input').forEach((elem, i) => {
            if (Pokemon.natureCorrections[nature][i] > 1) {
                elem.style.color = '#ff0000';
            } else if (Pokemon.natureCorrections[nature][i] < 1) {
                elem.style.color = '#0000ff';
            } else {
                elem.style.color = '#000000';
            }
        });
    }

    setEnemyAbility(damageWidget, ability) {
        if (!Pokemon.abilities.includes(ability)) { ability = ''; }
        damageWidget.querySelector('.enemy-ability input').value = ability;
    }

    setEnemyItem(damageWidget, item) {
        if (!(item in Pokemon.items)) { item = ''; }
        damageWidget.querySelector('.enemy-item input').value = item;
    }

    setEnemyTtype(damageWidget, Ttype, terastal=false) {
        if (!(Ttype in Pokemon.typeID)) { Ttype = ''; }
        damageWidget.querySelector('.enemy-Ttype input').value = Ttype;
        if (terastal) {
            damageWidget.querySelectorAll('.terastal input').forEach((elem, i) => {
                if (i%2==1) { elem.checked = (Ttype in Pokemon.typeID); }
            });
        }
    }

    enemyEffort(damageWidget) {
        let effort = [];
        damageWidget.querySelectorAll('.enemy-effort input').forEach(elem => {
            let v = elem.value;
            v = (isNaN(v)) ? 0 : Math.max(0, Math.min(252, Number(v)));
            effort.push(v);
        });
        return effort;
    }

    setEnemyEffort(damageWidget, i, effort) {
        if (isNaN(effort)) { return; }
        damageWidget.querySelectorAll('.enemy-effort input')[i].value =
            Math.max(0, Math.min(252, effort));
    }

    setWeather(damageWidget, weather) {
        if (!Pokemon.weathers.includes(weather)) { weather = ''; }
        damageWidget.querySelector('.weather input').value = weather;
    }

    setField(damageWidget, field) {
        if (!Pokemon.fields.includes(field)) { field = ''; }
        damageWidget.querySelector('.field input').value = field;
    }

    createBattlemoveCombobox(battleWidget, options) {
        let move = battleWidget.querySelector('.battlemove input').value;
        battleWidget.querySelector('.battlemove').remove();
        let clone = document.querySelector('.hidden .battlemove').cloneNode('true');
        battleWidget.querySelector('.delete-battle-widget').before(clone);
        
        let cbMove = createCombobox(clone);
        cbMove.addOptions(options, true);
        if (move in Pokemon.moves) { cbMove.comboboxNode.value = move; }

        let damageWidget = battleWidget.parentNode.parentNode;
        cbMove.comboboxNode.addEventListener('change', event => {
            let move = event.currentTarget.value;
            if (move in Pokemon.moves) {
                this.setBattleMove(battleWidget, move);
                this.updateDamage(damageWidget);
                this.save();
            }
        });
        setAnnotation(cbMove.comboboxNode.parentNode);
        cbMove.comboboxNode.parentNode.addEventListener('mousemove', () => {
            document.getElementById('annotation').innerHTML = moveAnnotation(cbMove.comboboxNode.value);
        });

        return cbMove;
    }

    setBattleMove(battleWidget, move) {
        if (!(move in Pokemon.moves)) { return; }
        battleWidget.querySelector('.battlemove input').value = move;
        if (Pokemon.criticalMoves.includes(move)) {
            battleWidget.querySelector('.critical input').checked = true;
        }
        if (move in Pokemon.comboMoves) {
            battleWidget.querySelector('.nCombo input').value = Pokemon.comboMoves[move][1];
        }
        this.updateBattleWidget(battleWidget);
    }

    updateDamage(damageWidget, maxRepeat=10) {
        let lethalProb = 0, lethalNum = 0;

        // 相手ポケモンのステータス更新
        let name = damageWidget.querySelector('.enemy-name input').value;
        if (!(name in Pokemon.zukan)) { return [lethalProb, lethalNum]; }
        let enemy = new Pokemon(name);
        enemy.loadZukan();

        let nature = damageWidget.querySelector('.enemy-nature input').value;
        if (nature in Pokemon.natureCorrections) { enemy.nature = nature; }

        let ability = damageWidget.querySelector('.enemy-ability input').value;
        if (Pokemon.abilities.includes(ability)) { enemy.ability = ability; }

        let item = damageWidget.querySelector('.enemy-item input').value;
        if (item in Pokemon.items) { enemy.item = item; }

        let Ttype = damageWidget.querySelector('.enemy-Ttype input').value;
        if (Ttype in Pokemon.typeID) { enemy.Ttype = Ttype; }

        damageWidget.querySelectorAll('.enemy-effort input').forEach((elem, i) => {
            enemy.effort[i] = Number(elem.value) || 0;
        });
        enemy.updateStatus();

        damageWidget.querySelectorAll('.enemy-status input').forEach((elem, i) => {
            elem.value = enemy.status[i];
        });

        if (!(this.#pokemon.name in Pokemon.zukan)) { return [lethalProb, lethalNum]; }
        
        let weather = damageWidget.querySelector('.weather input').value;
        let field = damageWidget.querySelector('.field input').value;
        let attackSide = Number(damageWidget.querySelector('.AD').textContent == '守');

        let battle = {}, hp;
        let damageRange = [0, 0];
        let damageText = damageWidget.querySelectorAll('.battle-widget .damage');
        let damageDigits=0, lethalProbDigits=2;

        // 加算ダメージ計算
        damageWidget.querySelectorAll('.battle-widget').forEach((battleWidget, i) => {
            battle = new Battle(this.#pokemon.clone(), enemy.clone());
            let move = battleWidget.querySelector('.battlemove input').value;
            if (!(move in Pokemon.moves)) {
                damageWidget.querySelector('.damage-text').textContent = '';
                damageText[i].addEventListener('mousemove', () => {
                    document.getElementById('annotation').innerHTML = '';
                });
                return;
            }
            battle.weather = weather;
            battle.field = field;
            battleWidget.querySelectorAll('.ailment input').forEach((elem, i) => {
                battle.pokemon[i].ailment = elem.value;
            });
            battleWidget.querySelectorAll('.rank input').forEach((elem, i) => {
                let v = Number(elem.value);
                for (let j=1; j<5; j++) {
                    battle.pokemon[i].rank[j] = v;
                }
            });
            battleWidget.querySelectorAll('.terastal input').forEach((elem, i) => {
                battle.pokemon[i].terastal = elem.checked;
            });
            battleWidget.querySelectorAll('.hasItem input').forEach((elem, i) => {
                battle.pokemon[i].hasItem = elem.checked;
            });
            battle.reflector = battle.lightwall = battleWidget.querySelector('.wall input').checked;
            battle.stealthrockDamage = battleWidget.querySelector('.stealthrock input').checked;
            battle.critical = battleWidget.querySelector('.critical input').checked;
            if (battleWidget.querySelector('.enhance').style.display == 'block') {
                battle.enhance = battleWidget.querySelector('.enhance input').checked;
            }
            if (battleWidget.querySelector('.nCombo').style.display == 'block') {
                battle.nCombo = Number(battleWidget.querySelector('.nCombo input').value);
            }
            if (battleWidget.querySelector('.skinDamage').style.display == 'block') {
                battle.skinDamage = battleWidget.querySelector('.skinDamage input').checked;
            }
            if (battleWidget.querySelector('.metDamage').style.display == 'block') {
                battle.metDamage = battleWidget.querySelector('.metDamage input').checked;
            }
            if (battleWidget.querySelector('.orbDamage').style.display == 'block') {
                battle.orbDamage = battleWidget.querySelector('.orbDamage input').checked;
            }
            if (battleWidget.querySelector('.weatherDamage').style.display == 'block') {
                battle.weatherDamage = battleWidget.querySelector('.weatherDamage input').checked;
            }
            if (battleWidget.querySelector('.glassRecovery').style.display == 'block') {
                battle.glassRecovery = battleWidget.querySelector('.glassRecovery input').checked;
            }
            if (battleWidget.querySelector('.ailmentDamage').style.display == 'block') {
                battle.ailmentDamage = battleWidget.querySelector('.ailmentDamage input').checked;
            }
            battleWidget.querySelector('.damage-text').textContent = 
                battle.damageText({
                    attackSide:attackSide, move:move, maxRepeat:maxRepeat, damageDigits:damageDigits, lethalProbDigits:lethalProbDigits
                });
            damageRange[0] += Math.min(...Object.keys(battle.totalDamage));
            damageRange[1] += Math.max(...Object.keys(battle.totalDamage));
            if (i > 0) {
                battle.maxRepeat = 1;
                battle.lethal(hp);
            }
            // ダメージ計算結果を保存
            hp = {...battle.hp};
            lethalProb = battle.lethalProb;
            lethalNum = battle.lethalNum;
            damageText[i].addEventListener('mousemove', () => {
                document.getElementById('annotation').innerHTML = battle.note.join(', ');
            });
        });
        damageWidget.querySelector('.total-damage-text').textContent =
            battle.pokemon[(attackSide+1)%2].damageText({
                minDamage:damageRange[0],maxDamage:damageRange[1],lethalProb:lethalProb,
                lethalNum:lethalNum, damageDigits:damageDigits,lethalProbDigits:lethalProbDigits,
            });
        return [lethalProb, lethalNum];
    }

    addRegistered(nickname) {
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
            elem.textContent = `${pokemon.status[i]}`;
            if (Pokemon.natureCorrections[pokemon.nature][i] > 1) {
                elem.style.color = '#ff0000';
            } else if (Pokemon.natureCorrections[pokemon.nature][i] < 1) {
                elem.style.color = '#0000ff';
            } else {
                elem.style.color = '#000000';
            }
        });
        clone.querySelectorAll('.registered-effort span').forEach((elem, i) => {
            elem.textContent = `${pokemon.effort[i]}`;
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
            this.clearEffortList();
            this.setName(pokemon.name);
            for (let key in pokemon) {
                this.#pokemon[key] = (Array.isArray(pokemon[key])) ? pokemon[key].slice() : pokemon[key];
            }
            document.getElementById('nickname-message').textContent = '';
            this.#cbNickname.comboboxNode.value = this.#pokemon.nickname;
            this.setNature(this.#pokemon.nature);
            this.setAbility(this.#pokemon.ability);
            this.setItem(this.#pokemon.item);
            this.setTtype(this.#pokemon.Ttype);
            for (let i=0; i<4; i++) {
                this.setMove(i, this.#pokemon.move[i]);
            }
            this.setLevel(this.#pokemon.level);
            document.querySelectorAll('.base').forEach((elem, i) => {
                elem.textContent = this.#pokemon.base[i];
            });
            for(let i=0; i<6; i++) {
                this.setIndiv(i, this.#pokemon.indiv[i]);
                this.setEffort(i, this.#pokemon.effort[i]);
            }
            document.querySelector('#description textarea').textContent = this.#pokemon.description;

            // ダメージ計算履歴の読み込み
            this.damageWidgets().forEach(elem => { elem.remove(); });
            let dws = this.#appStorage.getItem(this.#pokemon.nickname) || [];

            if (dws.length == 0) {
                this.addBattleWidget({damageWidget: this.addDamageWidget()});
            } else {
                for (let dw of dws) {
                    let damageWidget = this.addDamageWidget(dw.name);
                    this.setEnemyNature(damageWidget, dw.nature);
                    this.setEnemyAbility(damageWidget, dw.ability);
                    this.setEnemyItem(damageWidget, dw.item);
                    this.setEnemyTtype(damageWidget, dw.Ttype);
                    damageWidget.querySelectorAll('.enemy-effort input').forEach((elem, i) => {
                        if (dw.effort[i] >= 0 && dw.effort[i] <= 252) {
                            elem.value = dw.effort[i];
                        }
                    });
                    this.setWeather(damageWidget, dw.weather);
                    this.setField(damageWidget, dw.field);
                    
                    damageWidget.querySelector('.AD').textContent = (dw.attackSide) ? '守' : '攻';
                    
                    for (let move of dw.battlemove) {
                        this.addBattleWidget({damageWidget:damageWidget, move:move})
                    }
                    let keys = ['ailment','rank','nCombo'];
                    for (let key of keys) {
                        damageWidget.querySelectorAll(`.${key} input`).forEach((elem, i) => {
                            elem.value = dw[key][i];
                        });
                    }
                    keys = ['terastal','hasItem','wall','stealthrock','critical','enhance','skinDamage',
                            'metDamage','orbDamage','weatherDamage','glassRecovery','ailmentDamage'];
                    for (let key of keys) {
                        damageWidget.querySelectorAll(`.${key} input`).forEach((elem, i) => {
                            elem.checked = dw[key][i];
                        });
                    }
                    damageWidget.querySelectorAll('.battle-widget').forEach(battleWidget => {
                        this.updateBattleWidget(battleWidget);
                    });
                    this.updateDamageTextBG(damageWidget);
                    this.updateDamage(damageWidget);
                }
            }
            this.display();
        });

        setAnnotation(clone.querySelector('.registered'));
        clone.querySelector('.registered').addEventListener('mousemove', () => {
            document.getElementById('annotation').innerText = pokemon.description;
        });

        document.querySelector('.pokemon-list-main').appendChild(clone);
    }

    applyFilter() {
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
                this.addRegistered(nn);
            }
        }
    }

    // ボックスからポケモンを読み込む
    async readBoxPokemon() {
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

        let img = await loadImage('data/judge.png');
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

        this.#cbName.comboboxNode.parentNode.style.background = '#ffff99';

        // 特性(フォルムの識別に使うため先に読み込む)
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
        if (displayName != this.#pokemon.displayName) {
            let name = Pokemon.zukanName[displayName][0];
            // フォルム違いが存在する場合
            if (displayName in Pokemon.formDiff) {
                for (let s of Pokemon.zukanName[displayName]) {
                    if (Pokemon.formDiff[displayName] == 'type') {
                        //  タイプで識別
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
                    } else if (Pokemon.formDiff[displayName] == 'ability' && Pokemon.zukan[s].ability.includes(ability)) {
                        //  特性で識別
                        name = s;
                        break;
                    }
                }
            }
            this.setName(name);
        }
        this.#cbName.comboboxNode.parentNode.style.background = '#ffffff';
        // 性格
        this.#cbNature.comboboxNode.parentNode.style.background = '#ffff99';
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
                this.setNature(nature);
                break;
            }
        }
        this.#cbNature.comboboxNode.parentNode.style.background = '#ffffff';
        // 特性
        this.#cbAbility.comboboxNode.parentNode.style.background = '#ffff99';
        this.setAbility(ability);
        this.#cbAbility.comboboxNode.parentNode.style.background = '#ffffff';
        // もちもの
        this.#cbItem.comboboxNode.parentNode.style.background = '#ffff99';
        trim(captureCanvas, trimCanvas, 1455, 635, 330, 50);
        toBinary(trimCanvas, true);
        let item = await ocr(trimCanvas).catch(() => '');
        if (!(item in Pokemon.items)) {
            item = mostLikelyElement(Object.keys(Pokemon.items), item)[0];
        }
        this.setItem(item);
        this.#cbItem.comboboxNode.parentNode.style.background = '#ffffff';
        // テラスタイプ
        this.#cbTtype.comboboxNode.parentNode.style.background = '#ffff99';
        trim(captureCanvas, trimCanvas, 1535+200*(this.#pokemon.type.length-1), 150, 145, 40);
        toBinary(trimCanvas, true, 244);
        let Ttype = await ocr(trimCanvas).catch(() => '');
        if (!(Ttype in Pokemon.typeID)) {
            Ttype = mostLikelyElement(Object.keys(Pokemon.typeID), Ttype)[0];
        }
        this.setTtype(Ttype);
        this.#cbTtype.comboboxNode.parentNode.style.background = '#ffffff';
        // 技
        for (let j=0; j<4; j++) {
            this.#cbMove[j].comboboxNode.parentNode.style.background = '#ffff99';
            trim(captureCanvas, trimCanvas, 1320, 700+60*j, 250, 50);
            toBinary(trimCanvas, true);
            let move = await ocr(trimCanvas).catch(() => '');
            if (!(move in Pokemon.moves)) {
                move = mostLikelyElement(Object.keys(Pokemon.moves), move)[0];
            }
            this.setMove(j, move);
            this.#cbMove[j].comboboxNode.parentNode.style.background = '#ffffff';
        }
        // レベル
        let elem = document.querySelector('#level input');
        elem.style.background = '#ffff99';
        trim(captureCanvas, trimCanvas, 1775, 25, 55, 30);
        toBinary(trimCanvas, true);
        let level = await ocr(trimCanvas, 'eng').catch(() => '');
        this.setLevel(Number(level));
        elem.style.background = '#ffffff';
        // ステータス
        trim(captureCanvas, trimCanvas, 1775, 25, 55, 30);
        x = [1585, 1710, 1710, 1320, 1320, 1585];
        y = [215, 330, 440, 330, 440, 512];
        let elems = document.querySelectorAll('.status input');
        for (let j=0; j<6; j++) {
            elems[j].style.background = '#ffff99';
            trim(captureCanvas, trimCanvas, x[j], y[j], 155, 45);
            toBinary(trimCanvas, true);
            let status = await ocr(trimCanvas, 'eng').catch(() => '');
            if (j == 0) { status = status.substring(0, status.indexOf('/')); }
            this.setStatus(j, Number(status));
            elems[j].style.background = '#ffffff';
        }
        if (this.#pokemon.level != 50) { this.setLevel(50); }
        captureCanvas.remove();
        trimCanvas.remove();
        templCanvas.remove();
    }
}

new PokemonManager();