// ============================================================
//  Creador de Tops · app.js
// ============================================================

const MAX_ITEMS = 10;
const STORAGE_KEY = 'creador-de-tops:v1';

const DEFAULTS = {
    colorPodium: '#65c111',
    colorRest: '#3a3a3a',
    colorHeader: '#5a1827',
    colorAccent: '#e55353',
    showHonorable: true
};

// ---------- Referencias al DOM ----------
const canvas = document.getElementById('top-canvas');
let ctx = canvas ? canvas.getContext('2d') : null;

const itemsListEl = document.getElementById('items-list');
const headerInput = document.getElementById('header-title-input');
const honorableInput = document.getElementById('honorable-title-input');
const podiumColorInput = document.getElementById('color-podium');
const restColorInput = document.getElementById('color-rest');
const headerColorInput = document.getElementById('color-header');
const accentColorInput = document.getElementById('color-accent');
const honorableToggle = document.getElementById('toggle-honorable');
const resetBtn = document.getElementById('reset-btn');

const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');
const searchType = document.getElementById('search-type');
const searchError = document.getElementById('search-error');
const searchResults = document.getElementById('search-results');

const exportBtn = document.getElementById('export-btn');
const exportModal = document.getElementById('export-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const downloadBtn = document.getElementById('download-btn');
const modalImageContainer = document.getElementById('modal-image-container');

// ---------- Estado global ----------
function createItem(i) {
    return {
        id: i + 1,
        text: '',
        imageUrl: '',
        imgElement: null,
        offsetY: 0,
        scale: 1.0,
        loadError: false,
        tainted: false
    };
}

function resetItem(item) {
    item.text = '';
    item.imageUrl = '';
    item.imgElement = null;
    item.offsetY = 0;
    item.scale = 1.0;
    item.loadError = false;
    item.tainted = false;
}

const state = {
    headerTitle: '',
    honorableTitle: '',
    colorPodium: DEFAULTS.colorPodium,
    colorRest: DEFAULTS.colorRest,
    colorHeader: DEFAULTS.colorHeader,
    colorAccent: DEFAULTS.colorAccent,
    showHonorable: DEFAULTS.showHonorable,
    items: Array.from({ length: MAX_ITEMS }, (_, i) => createItem(i))
};

function refreshIcons() {
    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  Persistencia (localStorage)
// ============================================================
let saveTimer = null;

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 400);
}

function serializeState(includeDataUrls) {
    return {
        headerTitle: state.headerTitle,
        honorableTitle: state.honorableTitle,
        colorPodium: state.colorPodium,
        colorRest: state.colorRest,
        colorHeader: state.colorHeader,
        colorAccent: state.colorAccent,
        showHonorable: state.showHonorable,
        items: state.items.map(item => ({
            text: item.text,
            // Las imágenes subidas (base64) pesan mucho: si no entran, se omiten.
            imageUrl: (includeDataUrls || !item.imageUrl.startsWith('data:')) ? item.imageUrl : '',
            offsetY: item.offsetY,
            scale: item.scale
        }))
    };
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(true)));
    } catch (err) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(false)));
        } catch (err2) {
            // Sin espacio o almacenamiento bloqueado: la app sigue funcionando sin guardar.
        }
    }
}

function loadState() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (err) {
        return;
    }
    if (!saved || typeof saved !== 'object') return;

    const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    if (typeof saved.headerTitle === 'string') state.headerTitle = saved.headerTitle;
    if (typeof saved.honorableTitle === 'string') state.honorableTitle = saved.honorableTitle;
    if (isColor(saved.colorPodium)) state.colorPodium = saved.colorPodium;
    if (isColor(saved.colorRest)) state.colorRest = saved.colorRest;
    if (isColor(saved.colorHeader)) state.colorHeader = saved.colorHeader;
    if (isColor(saved.colorAccent)) state.colorAccent = saved.colorAccent;
    if (typeof saved.showHonorable === 'boolean') state.showHonorable = saved.showHonorable;

    if (Array.isArray(saved.items)) {
        saved.items.slice(0, MAX_ITEMS).forEach((s, i) => {
            if (!s || typeof s !== 'object') return;
            const item = state.items[i];
            if (typeof s.text === 'string') item.text = s.text;
            if (typeof s.offsetY === 'number') item.offsetY = clamp(s.offsetY, -100, 100);
            if (typeof s.scale === 'number') item.scale = clamp(s.scale, 1, 2.5);
            if (typeof s.imageUrl === 'string') item.imageUrl = s.imageUrl;
        });
    }
}

function syncControlsFromState() {
    if (headerInput) headerInput.value = state.headerTitle;
    if (honorableInput) honorableInput.value = state.honorableTitle;
    if (podiumColorInput) podiumColorInput.value = state.colorPodium;
    if (restColorInput) restColorInput.value = state.colorRest;
    if (headerColorInput) headerColorInput.value = state.colorHeader;
    if (accentColorInput) accentColorInput.value = state.colorAccent;
    if (honorableToggle) honorableToggle.checked = state.showHonorable;
}

// ============================================================
//  Lista de elementos (panel de control)
// ============================================================
let dragSrcIndex = null;

function moveItem(from, to) {
    if (from === to || to < 0 || to >= state.items.length) return;
    const [moved] = state.items.splice(from, 1);
    state.items.splice(to, 0, moved);
    renderItemsList();
    drawCanvas();
}

function createItemRow(item, index) {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.dataset.index = index;

    // Solo HTML estático: los valores que escribe el usuario se asignan por JS
    // (así las comillas u otros caracteres no rompen los atributos).
    row.innerHTML = `
        <span class="drag-handle" title="Arrastrar para reordenar">
            <i data-lucide="grip-vertical"></i>
        </span>
        <div class="item-number"></div>
        <div class="item-inputs">
            <div class="item-fields">
                <input type="text" class="item-text-input">
                <input type="text" class="item-url-input">
            </div>
            ${item.imgElement ? `
            <div class="item-adjust">
                <span>Mover Y:</span>
                <input type="range" min="-100" max="100" class="offset-y-slider">
                <span>Zoom:</span>
                <input type="range" min="100" max="250" class="scale-slider">
            </div>` : ''}
            ${item.loadError ? `
            <small class="item-error">No se pudo cargar la imagen. Revisa la URL o súbela desde tu dispositivo.</small>` : ''}
            ${item.tainted ? `
            <small class="item-warning">Esta imagen se ve, pero el sitio de origen no permite exportarla. Guárdala en tu equipo y súbela como archivo.</small>` : ''}
        </div>
        <div class="move-btns">
            <button type="button" class="btn-small mini move-up-btn" title="Subir"><i data-lucide="chevron-up"></i></button>
            <button type="button" class="btn-small mini move-down-btn" title="Bajar"><i data-lucide="chevron-down"></i></button>
        </div>
        <input type="file" class="item-file-input" accept="image/*" hidden>
        <button type="button" class="btn-small upload-btn" title="Subir imagen"><i data-lucide="upload"></i></button>
        <button type="button" class="btn-small clear-btn" title="Borrar elemento"><i data-lucide="trash-2"></i></button>
    `;

    // Valores
    const number = row.querySelector('.item-number');
    number.textContent = index + 1;
    number.style.backgroundColor = index < 3 ? state.colorPodium : state.colorRest;

    const textInput = row.querySelector('.item-text-input');
    textInput.value = item.text;
    textInput.placeholder = `Nombre / Título #${index + 1}`;

    const urlInput = row.querySelector('.item-url-input');
    if (item.imageUrl.startsWith('data:')) {
        urlInput.value = '';
        urlInput.placeholder = 'Imagen subida desde archivo';
    } else {
        urlInput.value = item.imageUrl;
        urlInput.placeholder = 'URL Imagen...';
    }

    // Eventos de texto e imagen
    textInput.addEventListener('input', (e) => {
        item.text = e.target.value;
        drawCanvas();
    });

    urlInput.addEventListener('change', (e) => {
        setImageUrl(item, e.target.value.trim());
    });

    const offsetSlider = row.querySelector('.offset-y-slider');
    if (offsetSlider) {
        offsetSlider.value = item.offsetY;
        offsetSlider.addEventListener('input', (e) => {
            item.offsetY = parseFloat(e.target.value);
            drawCanvas();
        });
    }

    const scaleSlider = row.querySelector('.scale-slider');
    if (scaleSlider) {
        scaleSlider.value = Math.round(item.scale * 100);
        scaleSlider.addEventListener('input', (e) => {
            item.scale = parseFloat(e.target.value) / 100;
            drawCanvas();
        });
    }

    const fileInput = row.querySelector('.item-file-input');
    row.querySelector('.upload-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => setImageUrl(item, event.target.result);
        reader.onerror = () => {
            item.loadError = true;
            renderItemsList();
        };
        reader.readAsDataURL(file);
    });

    row.querySelector('.clear-btn').addEventListener('click', () => {
        resetItem(item);
        renderItemsList();
        drawCanvas();
    });

    // Flechas (funcionan también en pantallas táctiles)
    const upBtn = row.querySelector('.move-up-btn');
    const downBtn = row.querySelector('.move-down-btn');
    upBtn.disabled = index === 0;
    downBtn.disabled = index === state.items.length - 1;
    upBtn.addEventListener('click', () => moveItem(index, index - 1));
    downBtn.addEventListener('click', () => moveItem(index, index + 1));

    // Arrastrar y soltar
    const handle = row.querySelector('.drag-handle');
    handle.addEventListener('mousedown', () => row.setAttribute('draggable', 'true'));

    row.addEventListener('dragstart', (e) => {
        dragSrcIndex = index;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index)); // Firefox lo necesita para iniciar el arrastre
        row.classList.add('dragging');
    });

    row.addEventListener('dragend', () => {
        dragSrcIndex = null;
        row.removeAttribute('draggable');
        row.classList.remove('dragging');
        document.querySelectorAll('.item-row.drag-over').forEach(r => r.classList.remove('drag-over'));
    });

    row.addEventListener('dragover', (e) => {
        if (dragSrcIndex === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', (e) => {
        if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over');
    });

    row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const from = dragSrcIndex;
        dragSrcIndex = null;
        if (from !== null && from !== index) moveItem(from, index);
    });

    return row;
}

function renderItemsList() {
    if (!itemsListEl) return;
    itemsListEl.innerHTML = '';
    state.items.forEach((item, index) => {
        itemsListEl.appendChild(createItemRow(item, index));
    });
    refreshIcons();
}

// Si se suelta el mouse sobre el handle sin arrastrar, la fila no debe quedar "arrastrable"
document.addEventListener('mouseup', () => {
    document.querySelectorAll('.item-row[draggable]').forEach(r => r.removeAttribute('draggable'));
});

// ============================================================
//  Carga de imágenes
// ============================================================
// Recibe el objeto del item (no el índice), así una carga lenta no cae en
// otra fila si mientras tanto se reordenó la lista.
function setImageUrl(item, url) {
    item.loadError = false;
    item.tainted = false;
    item.imageUrl = url;

    if (!url) {
        item.imgElement = null;
        renderItemsList();
        drawCanvas();
        return;
    }

    loadImageWithFallbacks(url)
        .then(({ img, tainted }) => {
            if (item.imageUrl !== url) return; // llegó tarde: ya se cambió o borró
            item.imgElement = img;
            item.tainted = tainted;
            renderItemsList();
            drawCanvas();
        })
        .catch((err) => {
            console.error(err);
            if (item.imageUrl !== url) return;
            item.imageUrl = '';       // el slot no queda "ocupado" por una imagen rota
            item.imgElement = null;
            item.tainted = false;
            item.loadError = true;    // se muestra el aviso en la fila
            renderItemsList();
            drawCanvas();
        });
}

function loadImage(src, useCors) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (useCors) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = src;
    });
}

// Descarga la imagen con fetch (sin usar la caché del navegador) y la convierte a data URL.
// Una imagen cargada así es "local" para el navegador y nunca contamina el canvas.
async function fetchImageAsDataUrl(src) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(src, { mode: 'cors', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('La respuesta no es una imagen');

        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    } finally {
        clearTimeout(timer);
    }
}

// Orden de intentos:
//  1) directo (si el sitio permite CORS)
//  2) y 3) a través de proxies públicos que sí lo permiten (wsrv.nl, allorigins.win)
//  4) último recurso: se muestra en la vista previa, pero esa imagen NO se podrá exportar
async function loadImageWithFallbacks(url) {
    if (url.startsWith('data:image')) {
        return { img: await loadImage(url, false), tainted: false };
    }

    const sources = [
        url,
        'https://wsrv.nl/?url=' + encodeURIComponent(url),
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
    ];

    for (const src of sources) {
        try {
            const dataUrl = await fetchImageAsDataUrl(src);
            return { img: await loadImage(dataUrl, false), tainted: false };
        } catch (err) {
            console.warn('No se pudo obtener la imagen desde:', src, err);
        }
    }

    return { img: await loadImage(url, false), tainted: true };
}

// ============================================================
//  Búsqueda en AniList
// ============================================================
function showSearchMessage(text) {
    if (!searchError) return;
    searchError.textContent = text;
    searchError.style.display = 'block';
}

function hideSearchMessage() {
    if (searchError) searchError.style.display = 'none';
}

function createSearchCard(name, imgUrl) {
    const card = document.createElement('div');
    card.className = 'search-card';

    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = name;

    const label = document.createElement('p');
    label.textContent = name;
    label.title = name;

    card.append(img, label);

    card.addEventListener('click', () => {
        // Slot libre = sin texto y sin imagen (no pisa lo que ya escribiste)
        const item = state.items.find(it => !it.text && !it.imageUrl);
        if (!item) {
            showSearchMessage('Los 10 lugares ya tienen contenido. Borra uno para agregar este resultado.');
            return;
        }
        hideSearchMessage();
        item.text = name;
        item.offsetY = 0;
        item.scale = 1.0;
        renderItemsList();
        drawCanvas();
        setImageUrl(item, imgUrl);
    });

    return card;
}

async function doSearch() {
    if (!searchInput || !searchType) return;

    const queryText = searchInput.value.trim();
    const type = searchType.value;

    hideSearchMessage();
    if (searchResults) searchResults.innerHTML = '';
    if (!queryText) return;

    const graphqlQuery = type === 'ANIME' ? `
        query ($search: String) {
            Page(perPage: 8) {
                media(search: $search, type: ANIME) {
                    title { romaji english }
                    coverImage { large }
                }
            }
        }
    ` : `
        query ($search: String) {
            Page(perPage: 8) {
                characters(search: $search) {
                    name { full }
                    image { large }
                }
            }
        }
    `;

    if (searchBtn) searchBtn.disabled = true;

    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query: graphqlQuery, variables: { search: queryText } })
        });

        const data = await response.json();
        if (data.errors) throw new Error(data.errors[0].message);

        const list = type === 'ANIME' ? (data.data?.Page?.media || []) : (data.data?.Page?.characters || []);

        if (list.length === 0) {
            showSearchMessage('No se encontraron resultados.');
            return;
        }

        list.forEach(entry => {
            const name = type === 'ANIME' ? (entry.title?.romaji || entry.title?.english) : entry.name?.full;
            const imgUrl = type === 'ANIME' ? entry.coverImage?.large : entry.image?.large;
            if (!name || !imgUrl) return;
            if (searchResults) searchResults.appendChild(createSearchCard(name, imgUrl));
        });

    } catch (err) {
        console.error(err);
        showSearchMessage('Error al conectar con AniList.');
    } finally {
        if (searchBtn) searchBtn.disabled = false;
    }
}

if (searchBtn) searchBtn.addEventListener('click', doSearch);
if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });
}

// ============================================================
//  Canvas
// ============================================================

// Recorta con "…" si el texto no entra en el ancho dado (usa la fuente actual del ctx)
function ellipsize(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
        t = t.slice(0, -1);
    }
    return t.trimEnd() + '…';
}

// Parte el texto en máximo 2 líneas (usa la fuente actual del ctx)
function breakInTwoLines(text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    let first = '';
    let i = 0;

    while (i < words.length) {
        const test = first ? first + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxWidth) break;
        first = test;
        i++;
    }

    if (!first) return { lines: [ellipsize(text, maxWidth)], overflow: true };

    const rest = words.slice(i).join(' ');
    if (!rest) return { lines: [first], overflow: false };
    if (ctx.measureText(rest).width <= maxWidth) return { lines: [first, rest], overflow: false };
    return { lines: [first, ellipsize(rest, maxWidth)], overflow: true };
}

// Elige tamaño y líneas: primero 1 línea (de maxSize a singleMin),
// luego 2 líneas (de maxSize-2 a minSize) y, como último recurso, recorta con "…".
function layoutText(text, maxWidth, opts) {
    const { maxSize, singleMin, minSize, maxLines = 2, weight = 'bold' } = opts;
    const setFont = (s) => { ctx.font = `${weight} ${s}px Arial, sans-serif`; };

    for (let s = maxSize; s >= singleMin; s--) {
        setFont(s);
        if (ctx.measureText(text).width <= maxWidth) return { size: s, lines: [text] };
    }

    if (maxLines >= 2) {
        for (let s = maxSize - 2; s >= minSize; s--) {
            setFont(s);
            const res = breakInTwoLines(text, maxWidth);
            if (!res.overflow) return { size: s, lines: res.lines };
        }
    }

    setFont(minSize);
    const lines = maxLines >= 2 ? breakInTwoLines(text, maxWidth).lines : [ellipsize(text, maxWidth)];
    return { size: minSize, lines };
}

function drawFittedText(text, x, centerY, maxWidth, color, align, opts) {
    const { size, lines } = layoutText(text, maxWidth, opts);
    ctx.font = `${opts.weight || 'bold'} ${size}px Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    const lineHeight = size * 1.25;
    const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, k) => ctx.fillText(line, x, startY + k * lineHeight));
}

// Devuelve blanco o negro según cuál se lea mejor sobre el color de fondo dado (#rrggbb)
function readableTextColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b; // 0 (oscuro) a 255 (claro)
    return luminance > 150 ? '#000000' : '#ffffff';
}

const HEADER_TEXT_OPTS = { maxSize: 26, singleMin: 18, minSize: 14, maxLines: 2 };
const ITEM_TEXT_OPTS = { maxSize: 22, singleMin: 16, minSize: 12, maxLines: 2 };
const HONORABLE_TEXT_OPTS = { maxSize: 20, singleMin: 14, minSize: 12, maxLines: 2 };

// Franja discreta al pie de la imagen con la dirección de la página
const SITE_CREDIT_TEXT = 'olquifo.github.io/Anime-Tops';
const CREDIT_HEIGHT = 28;

function drawCanvas() {
    if (!canvas) return;
    paintTop(canvas);
    scheduleSave();
}

// Dibuja el top completo sobre el canvas indicado: el de la vista previa
// o uno temporal creado solo para exportar (ver renderExportCanvas).
function paintTop(target) {
    const previousCtx = ctx;
    ctx = target.getContext('2d');
    try {
        paintTopContents(target);
    } finally {
        ctx = previousCtx;
    }
}

function paintTopContents(target) {
    const w = target.width;
    const h = target.height;
    ctx.clearRect(0, 0, w, h);

    const headerHeight = 90;
    const footerHeight = state.showHonorable ? 90 : 0;
    const contentBottom = h - CREDIT_HEIGHT;
    const availableHeight = contentBottom - headerHeight - footerHeight;
    const rowHeight = availableHeight / MAX_ITEMS;
    const accentText = readableTextColor(state.colorAccent);

    const colImgW = w * 0.32;
    const colNumW = w * 0.16;
    const colTextW = w * 0.52;
    const textColX = colImgW + colNumW;

    // 1. Header
    ctx.fillStyle = state.colorHeader;
    ctx.fillRect(0, 0, textColX, headerHeight);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 42px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TOP 10', textColX / 2, headerHeight / 2);

    ctx.fillStyle = state.colorAccent;
    ctx.fillRect(textColX, 0, colTextW, headerHeight);
    if (state.headerTitle) {
        drawFittedText(state.headerTitle, textColX + colTextW / 2, headerHeight / 2,
            colTextW - 40, accentText, 'center', HEADER_TEXT_OPTS);
    }

    // 2. Filas (1 al 10)
    state.items.forEach((item, i) => {
        const y = headerHeight + (i * rowHeight);

        // Imagen
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, y, colImgW, rowHeight);

        if (item.imgElement) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, y, colImgW, rowHeight);
            ctx.clip();

            const img = item.imgElement;
            const scale = item.scale || 1.0;
            const imgRatio = img.width / img.height;
            const cellRatio = colImgW / rowHeight;
            let drawW, drawH;

            if (imgRatio > cellRatio) {
                drawH = rowHeight * scale;
                drawW = rowHeight * imgRatio * scale;
            } else {
                drawW = colImgW * scale;
                drawH = (colImgW / imgRatio) * scale;
            }

            const offsetX = (colImgW - drawW) / 2;
            const baseOffsetY = y + (rowHeight - drawH) / 2;
            // El slider (-100..100) recorre justo el margen sobrante de la imagen,
            // así nunca se ven huecos blancos ni se sale del recuadro.
            const maxShift = Math.max(0, (drawH - rowHeight) / 2);
            const offsetY = baseOffsetY + (item.offsetY / 100) * maxShift;

            try {
                ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
            } catch (err) {
                console.error('No se pudo dibujar la imagen del lugar ' + (i + 1), err);
            }
            ctx.restore();
        } else {
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'italic 18px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Sin imagen', colImgW / 2, y + rowHeight / 2);
        }

        // Número
        ctx.fillStyle = i < 3 ? state.colorPodium : state.colorRest;
        ctx.fillRect(colImgW, y, colNumW, rowHeight);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 46px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, colImgW + (colNumW / 2), y + (rowHeight / 2));

        // Texto
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(textColX, y, colTextW, rowHeight);

        if (item.text) {
            drawFittedText(item.text, textColX + 20, y + rowHeight / 2,
                colTextW - 40, '#000000', 'left', ITEM_TEXT_OPTS);
        }

        // Borde
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, y + rowHeight);
        ctx.lineTo(w, y + rowHeight);
        ctx.stroke();
    });

    // 3. Divisiones Verticales
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(colImgW, headerHeight);
    ctx.lineTo(colImgW, contentBottom - footerHeight);
    ctx.moveTo(textColX, 0);
    ctx.lineTo(textColX, contentBottom);
    ctx.stroke();

    // 4. Footer (Menciones Honoríficas)
    if (state.showHonorable) {
        const footerY = contentBottom - footerHeight;

        // Bloque izquierdo: texto fijo "MENCIONES HONORÍFICAS"
        ctx.fillStyle = state.colorHeader;
        ctx.fillRect(0, footerY, textColX, footerHeight);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 13px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MENCIONES HONORÍFICAS', textColX / 2, footerY + (footerHeight / 2));

        // Bloque derecho: cuadro rojo editable con los nombres ingresados
        ctx.fillStyle = state.colorAccent;
        ctx.fillRect(textColX, footerY, colTextW, footerHeight);
        if (state.honorableTitle) {
            drawFittedText(state.honorableTitle, textColX + 20, footerY + footerHeight / 2,
                colTextW - 40, accentText, 'left', HONORABLE_TEXT_OPTS);
        }
    }

    // 5. Franja inferior con la dirección de la página
    ctx.fillStyle = state.colorHeader;
    ctx.fillRect(0, contentBottom, w, CREDIT_HEIGHT);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, contentBottom);
    ctx.lineTo(w, contentBottom);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '600 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SITE_CREDIT_TEXT, w / 2, contentBottom + CREDIT_HEIGHT / 2 + 1);
}

// ============================================================
//  Controles de diseño
// ============================================================
if (headerInput) {
    headerInput.addEventListener('input', (e) => {
        state.headerTitle = e.target.value;
        drawCanvas();
    });
}

if (honorableInput) {
    honorableInput.addEventListener('input', (e) => {
        state.honorableTitle = e.target.value;
        drawCanvas();
    });
}

if (podiumColorInput) {
    podiumColorInput.addEventListener('input', (e) => {
        state.colorPodium = e.target.value;
        renderItemsList();
        drawCanvas();
    });
}

if (restColorInput) {
    restColorInput.addEventListener('input', (e) => {
        state.colorRest = e.target.value;
        renderItemsList();
        drawCanvas();
    });
}

if (headerColorInput) {
    headerColorInput.addEventListener('input', (e) => {
        state.colorHeader = e.target.value;
        drawCanvas();
    });
}

if (accentColorInput) {
    accentColorInput.addEventListener('input', (e) => {
        state.colorAccent = e.target.value;
        drawCanvas();
    });
}

if (honorableToggle) {
    honorableToggle.addEventListener('change', (e) => {
        state.showHonorable = e.target.checked;
        drawCanvas();
    });
}

if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        if (!confirm('¿Reiniciar todo? Se borrarán los textos, imágenes y colores actuales.')) return;

        state.headerTitle = '';
        state.honorableTitle = '';
        Object.assign(state, DEFAULTS);
        state.items.forEach(resetItem);

        syncControlsFromState();
        renderItemsList();
        drawCanvas();
    });
}

// ============================================================
//  Exportar
// ============================================================
// Una vez que un canvas dibuja una imagen sin permiso CORS queda contaminado para siempre
// (aunque después se reemplace esa imagen). Por eso se exporta desde un canvas nuevo.
function renderExportCanvas() {
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    paintTop(off);
    return off;
}

function buildFileName() {
    const slug = state.headerTitle
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug ? `top-10-${slug}.png` : 'top-10.png';
}

function exportErrorMessage() {
    alert('No se pudo generar la imagen. Si usaste imágenes por URL, prueba subirlas desde tu dispositivo con el botón de subir archivo.');
}

function closeExportModal() {
    if (exportModal) exportModal.style.display = 'none';
}

if (exportBtn && exportModal) {
    exportBtn.addEventListener('click', () => {
        const blocked = state.items
            .map((it, i) => (it.tainted ? i + 1 : null))
            .filter(Boolean);

        if (blocked.length) {
            alert(
                'No se puede exportar: ' +
                (blocked.length === 1 ? 'la imagen del lugar ' : 'las imágenes de los lugares ') +
                blocked.join(', ') +
                ' vienen de un sitio que no permite usarlas en la exportación.\n\n' +
                'Guárdalas en tu equipo (clic derecho > "Guardar imagen como...") y súbelas con el botón de subir archivo.'
            );
            return;
        }

        try {
            const dataUrl = renderExportCanvas().toDataURL('image/png');
            modalImageContainer.innerHTML = '';

            const imgPreview = document.createElement('img');
            imgPreview.src = dataUrl;
            imgPreview.alt = 'Top 10 Exportado';
            modalImageContainer.appendChild(imgPreview);

            exportModal.style.display = 'flex';
        } catch (err) {
            console.error(err);
            exportErrorMessage();
        }
    });
}

if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
        try {
            renderExportCanvas().toBlob((blob) => {
                if (!blob) return exportErrorMessage();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = buildFileName();
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, 'image/png');
        } catch (err) {
            console.error(err);
            exportErrorMessage();
        }
    });
}

if (closeModalBtn) closeModalBtn.addEventListener('click', closeExportModal);

window.addEventListener('click', (e) => {
    if (e.target === exportModal) closeExportModal();
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeExportModal();
});

// ============================================================
//  Inicialización
// ============================================================
loadState();
syncControlsFromState();
renderItemsList();
drawCanvas();

// Recargar las imágenes guardadas (el resto del estado ya está restaurado)
state.items.forEach(item => {
    if (item.imageUrl) setImageUrl(item, item.imageUrl);
});
