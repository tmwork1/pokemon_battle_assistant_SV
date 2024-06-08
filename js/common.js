// 五捨五超入
export function roundHalfDown(num) {
    return -Math.round(-num);
}
// 2個の文字列の類似度を返す
export function levenshteinDistance(str1, str2) {
    let d = [];
    if (str1.length*str2.length == 0) { return 1e9; }
    for (let r=0; r<=str1.length; r++) d[r] = [r];
    for (let c=0; c<=str2.length; c++) d[0][c] = c;
    for (let r=1; r<=str1.length; r++) {
        for (let c=1; c<=str2.length; c++) {
            const cost = str1.charCodeAt(r-1) == str2.charCodeAt(c-1) ? 0 : 1;
            d[r][c] = Math.min(d[r-1][c]+1, d[r][c-1]+1, d[r-1][c-1] + cost);
        }
    }
    return d[str1.length][str2.length];
}
// カタカナに変換する
export function toKatakana(str, convertLarge=false) {
    let result = str.slice();
    result = result.replace(/[ぁ-ん]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) + 0x60);
    });
    if (convertLarge) {
        let smallCapitals = ['ァ','ィ','ゥ','ェ','ォ','ッ','ャ','ュ','ョ'];
        let largeCapitals = ['ア','イ','ウ','エ','オ','ツ','ヤ','ユ','ヨ'];
        for (let i=0; i<smallCapitals.length; i++) {
            if (result.indexOf(smallCapitals[i]) > -1) {
                result = result.split(smallCapitals[i]).join(largeCapitals[i]);
            }
        }
    } 
    return result;
}
// select要素にオプションを追加する
export function addSelectOptions(selectElement, options=[], clear=false) {
    if (clear) {
        for (let i=selectElement.options.length-1; i>=0; i--) {
            selectElement.remove(i);
        }    
    }
    for (let option of options) {
        let op = document.createElement('option');
        op.text = option;
        selectElement.appendChild(op);
    }
}
// 画像を読み込む
export async function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    });
}
// 画像をcanvasに描画する
export async function drawImage({canvas, url, fitToCanvas=false}) {
    try {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const img = await loadImage(url);
        if (fitToCanvas) {
            const dsize = (img.width >= img.height) ?
            [canvas.width, Math.trunc(canvas.width*img.height/img.width)] :
            [Math.trunc(canvas.height*img.width/img.height), canvas.height];
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, dsize[0], dsize[1]);
        } else {
            ctx.drawImage(img, 0, 0);            
        }   
    } catch (e) {
        console.error(`${e.name}: ${e.message}`);
    }
}
// canvas画像をグレースケールに変換
export function toGrayscale(canvas) {
    const ctx = canvas.getContext('2d');
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = 
        imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114;
    }
    ctx.putImageData(imageData, 0, 0);
}
// canvas画像を白黒に変換
export function toBinary(canvas, bitwiseNot=false, threshold=128) {
    const ctx = canvas.getContext('2d');
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let blackPixel = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
        const value = imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114;
        imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = (value >= threshold) ? 255 : 0;
        if (value >= threshold) {
            imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = (bitwiseNot) ? 0 : 255;
        } else {
            imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = (bitwiseNot) ? 255 : 0;
        }
        blackPixel += (imageData.data[i] == 0);
    }
    ctx.putImageData(imageData, 0, 0);
    return blackPixel/imageData.data.length*4;
}
// canvas画像をトリムして別canvasに描画
export function trim(srcCanvas, dstCanvas, x, y, w, h, mag=1) {
    dstCanvas.width = w*mag;
    dstCanvas.height = h*mag;
    dstCanvas.getContext('2d').drawImage(srcCanvas, x, y, w, h, 0, 0, dstCanvas.width, dstCanvas.height);
}
// 画像から文字を読み取る
export async function ocr(canvas, lang='jpn') {
    try {
        const result = await Tesseract.recognize(
            canvas,
            lang,
            { logger: function(e) {
                document.querySelector('#progress').textContent = e.status;
            }},
        );
        document.querySelector('#result').textContent = result.data.text;
        let text = result.data.text;
        text = text.split('\b').join('');
        text = text.split('\n').join('');
        return text;
    } catch(e) {
        console.error(`${e.name}: ${e.message}`);
    }
}
// canvasの有色領域の輪郭を返す
export function rectBorder(canvas, thr=255) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    let imageData = ctx.getImageData(0, 0, w, h);
    let xmin = Math.trunc(w/2);
    let xmax = Math.trunc(w/2);
    let ymin = Math.trunc(h/2);
    let ymax = Math.trunc(h/2);
    for (let x=0; x<w; x++) {
        for (let y=0; y<h; y++) {
            const R = imageData.data[y*w*4+x*4];
            const G = imageData.data[y*w*4+x*4+1];
            const B = imageData.data[y*w*4+x*4+2];
            if (R < thr || G < thr || B < thr) {
                xmin = Math.min(xmin, x);
                xmax = Math.max(xmax, x);
                ymin = Math.min(ymin, y);
                ymax = Math.max(ymax, y);
            }
        }
    }
    return {x:xmin, y:ymin, w:xmax-xmin+1, h:ymax-ymin+1};
} 
// テンプレートマッチング
export function templateMatch(srcCanvasID, templCanvasID) {
    let src = cv.imread(srcCanvasID);
    let templ = cv.imread(templCanvasID);
    let dst = new cv.Mat();
    let mask = new cv.Mat();
    cv.matchTemplate(src, templ, dst, cv.TM_CCOEFF, mask);
    let result = cv.minMaxLoc(dst, mask);
    src.delete();
    templ.delete();
    dst.delete();
    mask.delete();
    return result;
}
// 配列から最も類似した要素とその番号を取得する
export function mostLikelyElement(array, str) {
    const distances = array.map((s) => levenshteinDistance(s, str));
    const ind = distances.indexOf(Math.min(...distances));
    const elem = array[ind]
    return [elem, ind];
}
// 連想配列のサブセットを返す
export function subset(obj, keys) {
    let result = {};
    for (let key of keys) { 
        if (key in obj) { result[key] = obj[key]; }
    }
    return result;
}
// サブウィンドウ生成に用いるオプションを返す
export function subWindowOption(width, height) {
    let subx = (screen.availWidth-width)/2;
    let suby = (screen.availHeight-height)/2;
    return `width=${width}, height=${height}, top=${suby}, left=${subx}`;
}
// ビデオストリームを開始する
export function videoStream(video, deviceID='') {
    let option = {
        deviceId: deviceID, facingMode: "environment", width:1920, height:1080, aspectRatio:{ exact:16/9 }
    };
    navigator.mediaDevices.getUserMedia({
        video: option,
        audio: false,
    }).then(stream => {
        video.srcObject = stream;
        video.play();
    }).catch(e => {
        console.error(`${e.name}: ${e.message}`);
    });
}
// HTML要素に注釈機能を追加する
export function setAnnotation(element) {
    let annotation = document.getElementById('annotation');
    element.addEventListener('mousemove', event => {
        if (annotation.textContent) {
            annotation.style.opacity = 1;
            annotation.style.left = `${event.pageX+10}px`;
            annotation.style.top = `${event.pageY+10}px`;
        }
    });
    element.addEventListener('mouseleave', event => {
        annotation.style.opacity = 0;
        annotation.textContent = '';
    });
}
// ソートした連想配列を返す
export function sortObj(obj, order='') {
    let array = Object.keys(obj).map((k)=>({ key: k, value: obj[k] }));
    if (order == 'reverse') {
        array.sort((a, b) => b.value - a.value);
    } else {
        array.sort((a, b) => a.value - b.value);
    }
    return Object.assign({}, ...array.map((item) => ({
        [item.key]: item.value,
    })));
}
export function last(array) {
    return array[array.length-1];
}