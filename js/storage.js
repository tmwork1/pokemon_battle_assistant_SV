// ブラウザのローカルストレージを扱うクラス
export class Storage {
    #app;
    #storage = localStorage;
    #data;
    constructor(app) {
        this.#app = app;
        this.#data = JSON.parse(this.#storage[this.#app] || '{}');
    }
    setItem(key, value) {
        this.#data[key] = value;
    }
    getItem(key) {
        return this.#data[key];
    }
    includes(key) {
        return (key in this.#data);
    }
    delete(key) {
        delete this.#data[key];
    }
    keys() {
        return Object.keys(this.#data);
    }
    save() {
        this.#storage[this.#app] = JSON.stringify(this.#data);
    }
    stringify() {
        return JSON.stringify(this.#data);
    }
}