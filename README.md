# pokemon_battle_assistant_SV
ポケモンSVランクマッチ用のリアルタイム自動ダメージ計算サイト<br>
https://pbasv.cloudfree.jp/<br>
のソースコード

## 使用言語
- Javascript
- Python

## ディレクトリ構成
- log : デバッグ用
- data/battle_data : ポケモンHOMEの使用率ランキングを格納
- data/icon : ポケモンのアイコン画像を格納
- data/item_img : ポケモンのアイテム画像を格納
- data/template : テンプレートマッチング用のアイコン画像を格納
- data/type_img : タイプのアイコン画像を格納

## 使い方
- index.html : リアルタイム自動ダメージ計算ページ
- setting.html : 詳細設定の小型ウィンドウ
- pokemon_view.html : ポケモンの育成情報を保存するための小型ウィンドウ
- manager.html : ポケモン管理ページ
- data/update_battle_data.py : ポケモンHOMEのランクマッチ使用率を取得する。毎日走らせる。
- data/*.py : 様々なバックデータを取得する。取得済みのため不要。

## js/
- pokemon.js : ダメージ計算やランクマッチ使用率の読み込みなどの、ポケモン対戦に関するクラス
- index.js, manager.js : 各htmlに対応
- common.js : 汎用関数
- storage.js : ローカルストレージを扱うクラス
- opencv.js : OpenCV
- tesseract.min.js : OCR
- guessLanguage.js, _languageData.js : 言語識別
- combobox.js, imageselect.js : Webページの入力インターフェースを生成するためのクラス

## (加算)ダメージ計算のサンプルコード
js/pokemon.jsの末尾の関数（最終行のコメントアウトは削除済み）
```
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
})()
```
