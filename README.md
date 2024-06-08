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

## ダメージ計算のサンプルコード
js/pokemon.jsの末尾の関数
