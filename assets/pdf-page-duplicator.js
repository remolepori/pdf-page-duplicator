(function () {
  // PDF.js worker
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  function qs(root, sel) { return root.querySelector(sel); }

  function isPdfFile(file) {
    if (!file) return false;
    if (file.type === "application/pdf") return true;
    return /\.pdf$/i.test(file.name || "");
  }

  function getMode(root) {
    const checked = root.querySelector('input[name="ppd-mode"]:checked');
    return checked ? checked.value : "interleave";
  }


function getFormat(root) {
  const checked = root.querySelector('input[name="ppd-format"]:checked');
  return checked ? checked.value : "original";
}


  function buildDownloadName(file) {
    const name = (file && file.name) ? file.name : "document.pdf";
    return name.replace(/\.pdf$/i, "") + "_duplicate.pdf";
  }

  function setProgress(root, done, total) {
    const wrap = qs(root, "#ppd-progress");
    const txt = qs(root, "#ppd-progress-text");
    const pctEl = qs(root, "#ppd-progress-pct");
    const bar = qs(root, "#ppd-progress-bar");

    if (!wrap || !txt || !pctEl || !bar) return;

    if (!total || total <= 0) {
      wrap.style.display = "none";
      return;
    }

    wrap.style.display = "block";
    const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
    txt.textContent = `${done} / ${total}`;
    pctEl.textContent = `${pct}%`;
    bar.style.width = `${pct}%`;
  }

  function resetProgress(root) {
    const wrap = qs(root, "#ppd-progress");
    const bar = qs(root, "#ppd-progress-bar");
    if (wrap) wrap.style.display = "none";
    if (bar) bar.style.width = "0%";
  }

  function disableUI(root, disabled) {
    ["#ppd-file", "#ppd-run", "#ppd-reset", "#ppd-copies", "#ppd-range-start", "#ppd-range-end"].forEach((sel) => {
      const el = qs(root, sel);
      if (el) el.disabled = !!disabled;
    });
    root.querySelectorAll('input[name="ppd-mode"]').forEach((el) => el.disabled = !!disabled);
    root.querySelectorAll('input[name="ppd-format"]').forEach((el) => el.disabled = !!disabled);
  }

  async function readPageCount(file) {
    if (!window.PDFLib || !window.PDFLib.PDFDocument) throw new Error("PDFLib nicht geladen.");
    const { PDFDocument } = window.PDFLib;
    const bytes = await file.arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    return doc.getPageCount();
  }

  function normalizeRange(startVal, endVal, pageCount) {
    const sRaw = startVal === "" ? null : parseInt(startVal, 10);
    const eRaw = endVal === "" ? null : parseInt(endVal, 10);

    let s = Number.isFinite(sRaw) ? sRaw : null;
    let e = Number.isFinite(eRaw) ? eRaw : null;

    if (s === null && e === null) return { start: 1, end: pageCount, isAll: true };
    if (s === null) s = 1;
    if (e === null) e = pageCount;

    s = Math.max(1, Math.min(pageCount, s));
    e = Math.max(1, Math.min(pageCount, e));
    if (s > e) [s, e] = [e, s];

    return { start: s, end: e, isAll: false };
  }

  function buildPageOrder({ range, mode, copies }) {
    const pages = [];
    for (let i = range.start; i <= range.end; i++) pages.push(i);

    const result = [];

    if (mode === "append") {
      result.push(...pages);
      for (let c = 0; c < copies; c++) result.push(...pages);
    } else {
      for (const p of pages) {
        result.push(p);
        for (let c = 0; c < copies; c++) result.push(p);
      }
    }

    return result;
  }







function buildTwoUpSheets({ range, copies }) {
  const pages = [];
  for (let i = range.start; i <= range.end; i++) pages.push(i);

  const sheets = [];
  for (let i = 0; i < pages.length; i += 2) {
    const p1 = pages[i];
    const p2 = (i + 1 < pages.length) ? pages[i + 1] : null;

    // 1x + copies Duplikate (auf Sheet-Ebene)
    sheets.push([p1, p2]);
    for (let c = 0; c < copies; c++) sheets.push([p1, p2]);
  }
  return sheets; // Array<[p1, p2|null]>
}











function buildTwoUpSortedSheets({ range, copies }) {
  const pages = [];
  for (let i = range.start; i <= range.end; i++) pages.push(i);

  const sheets = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];

    // 1x + copies Duplikate (auf Sheet-Ebene)
const extra = Math.max(0, (parseInt(copies, 10) || 0) - 1);

sheets.push([p, p]); // genau 1 Blatt pro Originalseite
for (let c = 0; c < extra; c++) sheets.push([p, p]); // zusätzliche Blätter
  }
  return sheets; // Array<[p, p]>
}
















  function getPreviewState(root) {
    if (!root._ppdPreview) {
      root._ppdPreview = {
        pdfJsDoc: null,          // pdf.js document
thumbCache: new Map(),   // pageNum -> thumb dataURL (string)
bigCache: new Map(),     // pageNum -> big dataURL (string)
fileKey: "",
renderSeq: 0,
twoUpVertical: false,
      };
    }
    return root._ppdPreview;
  }

  async function ensurePdfJsDoc(state, file) {
    if (!window.pdfjsLib) throw new Error("PDF.js nicht geladen.");
    const key = `${file.name}|${file.size}|${file.lastModified || 0}`;

    // If file changed, reset state
    if (state.fileKey !== key) {
      state.fileKey = key;
      state.pdfJsDoc = null;
      state.thumbCache = new Map();
state.bigCache = new Map();
    }

    if (!state.pdfJsDoc) {
      const buf = await file.arrayBuffer();
      state.pdfJsDoc = await pdfjsLib.getDocument(buf).promise;
    }

    return state.pdfJsDoc;
  }






  async function renderPreview({ file, order, root }) {
    const container = qs(root, "#ppd-preview");
    const progWrap = qs(root, "#ppd-preview-progress");
    const progTxt = qs(root, "#ppd-preview-progress-text");
    const progPct = qs(root, "#ppd-preview-progress-pct");
    const progBar = qs(root, "#ppd-preview-progress-bar");

    // Preview markup not present => do nothing
    if (!container || !progWrap || !progTxt || !progPct || !progBar) return;

const previewEmpty = qs(root, "#ppd-preview-empty");
if (previewEmpty) previewEmpty.style.display = "none";

    const state = getPreviewState(root);
    const mySeq = ++state.renderSeq;

    // Ensure pdf.js doc
    progWrap.style.display = "block";
    progTxt.textContent = "Lade PDF…";
    progPct.textContent = "";
    progBar.style.width = "0%";

    const pdfJsDoc = await ensurePdfJsDoc(state, file);

    if (mySeq !== state.renderSeq) return; // cancelled by newer render
    progWrap.style.display = "none";

    // Only render missing thumbnails (unique pages)
    const uniquePages = Array.from(new Set(order));
    const missing = uniquePages.filter((p) => !state.thumbCache.has(p));

    if (missing.length) {
      progWrap.style.display = "block";

      for (let i = 0; i < missing.length; i++) {
        if (mySeq !== state.renderSeq) return; // cancelled

        const pageNum = missing[i];
        const page = await pdfJsDoc.getPage(pageNum);

// kleines Thumbnail (Grid) – nur das!
const thumbViewport = page.getViewport({ scale: 0.5 });

const thumbCanvas = document.createElement("canvas");
const thumbCtx = thumbCanvas.getContext("2d");
thumbCanvas.width = thumbViewport.width;
thumbCanvas.height = thumbViewport.height;

await page.render({
  canvasContext: thumbCtx,
  viewport: thumbViewport
}).promise;

// Cache: nur Thumbnail (string)
state.thumbCache.set(pageNum, thumbCanvas.toDataURL("image/png"));

        const pct = Math.round(((i + 1) / missing.length) * 100);
        progTxt.textContent = `Vorschau: ${i + 1} / ${missing.length}`;
        progPct.textContent = `${pct}%`;
        progBar.style.width = pct + "%";
      }

      progWrap.style.display = "none";
    }

    // Build DOM in one shot (no flicker: no container.innerHTML = "" before)
    const frag = document.createDocumentFragment();
for (let i = 0; i < order.length; i++) {
  const originalPageNum = order[i];   // Seite im Original-PDF
  const newPageNum = i + 1;            // Seite im neuen Dokument

  const wrap = document.createElement("div");
  wrap.className = "ppd-preview-page";

  const img = document.createElement("img");
const cached = state.thumbCache.get(originalPageNum);
if (!cached) continue;

img.src = cached;
img.alt = `Seite ${newPageNum} (Seite ${originalPageNum})`;
img.loading = "lazy";
wrap.appendChild(img);

// Für Lazy-Big: wir speichern nur die Originalseite, nicht die big-src
img.setAttribute("data-ppd-old", String(originalPageNum));
img.setAttribute("data-ppd-new", String(newPageNum));

const label = document.createElement("div");
label.className = "ppd-preview-label";

const left = document.createElement("span");
left.className = "ppd-preview-newpage";
left.textContent = `Seite ${newPageNum}`;

const badge = document.createElement("span");
badge.className = "ppd-preview-badge";
badge.textContent = `Seite ${originalPageNum}`; // Original

label.appendChild(left);
label.appendChild(badge);

wrap.appendChild(label);

  frag.appendChild(wrap);
}

    if (mySeq !== state.renderSeq) return; // cancelled

    container.replaceChildren(frag);

const elNew = qs(root, "#ppd-preview-count-new");
const elOld = qs(root, "#ppd-preview-count-old");
if (elNew) elNew.textContent = `Neu: ${order.length} Seiten`;
if (elOld) elOld.textContent = `Original: ${new Set(order).size} Seiten`;

    attachPreviewHover(root);
  }











async function renderPreviewTwoUp({ file, sheets, root, mode }) {
  const container = qs(root, "#ppd-preview");
  const progWrap = qs(root, "#ppd-preview-progress");
  const progTxt = qs(root, "#ppd-preview-progress-text");
  const progPct = qs(root, "#ppd-preview-progress-pct");
  const progBar = qs(root, "#ppd-preview-progress-bar");

  if (!container || !progWrap || !progTxt || !progPct || !progBar) return;

  const previewEmpty = qs(root, "#ppd-preview-empty");
  if (previewEmpty) previewEmpty.style.display = "none";

  const state = getPreviewState(root);
  const mySeq = ++state.renderSeq;

  // PDF.js doc sicherstellen
  progWrap.style.display = "block";
  progTxt.textContent = "Lade PDF…";
  progPct.textContent = "";
  progBar.style.width = "0%";


// PDF.js doc sicherstellen
const pdfJsDoc = await ensurePdfJsDoc(state, file);
if (mySeq !== state.renderSeq) return;

// Orientierung der ersten Seite bestimmen (für Layout)
const firstPage = await pdfJsDoc.getPage(1);
const vp = firstPage.getViewport({ scale: 1 });
const srcIsLandscape = vp.width >= vp.height;

// Merken für Hover-Tooltip-Composites (optional, falls du es später nutzt)
state.twoUpVertical = srcIsLandscape;


  if (mySeq !== state.renderSeq) return;
  progWrap.style.display = "none";

  // Missing thumbs rendern (unique pages aus allen Sheets)
  const need = new Set();
  sheets.forEach(([a, b]) => { if (a) need.add(a); if (b) need.add(b); });
  const missing = Array.from(need).filter(p => !state.thumbCache.has(p));

  if (missing.length) {
    progWrap.style.display = "block";
    for (let i = 0; i < missing.length; i++) {
      if (mySeq !== state.renderSeq) return;
      const pageNum = missing[i];
      const page = await pdfJsDoc.getPage(pageNum);

      const thumbViewport = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = thumbViewport.width;
      canvas.height = thumbViewport.height;

      await page.render({ canvasContext: ctx, viewport: thumbViewport }).promise;
      state.thumbCache.set(pageNum, canvas.toDataURL("image/png"));

      const pct = Math.round(((i + 1) / missing.length) * 100);
      progTxt.textContent = `Vorschau: ${i + 1} / ${missing.length}`;
      progPct.textContent = `${pct}%`;
      progBar.style.width = pct + "%";
    }
    progWrap.style.display = "none";
  }

  // DOM bauen: jede neue Seite zeigt 2 Thumbs nebeneinander
  const frag = document.createDocumentFragment();

  for (let i = 0; i < sheets.length; i++) {
    const [p1, p2] = sheets[i];
    const newPageNum = i + 1;

    const wrap = document.createElement("div");
    wrap.className = "ppd-preview-page ppd-preview-two-up";

	wrap.setAttribute("data-ppd-sheet-left", p1 ? String(p1) : "");
	wrap.setAttribute("data-ppd-sheet-right", p2 ? String(p2) : "");
	wrap.setAttribute("data-ppd-sheet-new", String(newPageNum));

const row = document.createElement("div");
row.className = srcIsLandscape ? "ppd-two-up-row ppd-two-up-vertical" : "ppd-two-up-row";

    // left thumb
    if (p1) {
      const img1 = document.createElement("img");
      img1.src = state.thumbCache.get(p1);
      img1.alt = `Seite ${newPageNum} (Seite ${p1})`;
      img1.loading = "lazy";
      img1.setAttribute("data-ppd-old", String(p1));
      img1.setAttribute("data-ppd-new", String(newPageNum));
      row.appendChild(img1);
    }

// right thumb
if (p2) {
  const img2 = document.createElement("img");
  img2.src = state.thumbCache.get(p2);
  img2.alt = `Seite ${newPageNum} (Seite ${p2})`;
  img2.loading = "lazy";
  img2.setAttribute("data-ppd-old", String(p2));
  img2.setAttribute("data-ppd-new", String(newPageNum));
  row.appendChild(img2);
} else {
  // Nur bei normalem 2-Up + Querformat-Original Platzhalter anzeigen
  if (mode === "two_up" && srcIsLandscape) {
    const ph = document.createElement("div");
    ph.className = "ppd-two-up-empty";
    row.appendChild(ph);
  }
}

    wrap.appendChild(row);

    const label = document.createElement("div");
    label.className = "ppd-preview-label";

    const left = document.createElement("span");
    left.className = "ppd-preview-newpage";
    left.textContent = `Seite ${newPageNum}`;

    const badge = document.createElement("span");
    badge.className = "ppd-preview-badge";
badge.textContent = (p2 && p1 === p2) ? `Seite ${p1} × 2` : (p2 ? `Seite ${p1} + ${p2}` : `Seite ${p1}`);
    label.appendChild(left);
    label.appendChild(badge);
    wrap.appendChild(label);

    frag.appendChild(wrap);
  }

  if (mySeq !== state.renderSeq) return;
  container.replaceChildren(frag);

  // Badge-Zähler unter der Vorschau aktualisieren
  const elNew = qs(root, "#ppd-preview-count-new");
  const elOld = qs(root, "#ppd-preview-count-old");
  const originalCount = new Set(sheets.flat().filter(Boolean)).size;
  if (elNew) elNew.textContent = `Neu: ${sheets.length} Seiten`;
  if (elOld) elOld.textContent = `Original: ${originalCount} Seiten`;

  attachPreviewHover(root);
}










  async function buildPdf({ file, mode, copies, range, format, onProgress }) {
    const { PDFDocument, degrees } = window.PDFLib;

    const srcBytes = await file.arrayBuffer();
    const srcDoc = await PDFDocument.load(srcBytes);


// ISO A-Formate in PDF-Points (72pt = 1 inch)
const A4 = [595.28, 841.89];
const A3 = [841.89, 1190.55];

function getTargetSize(fmt) {
  if (fmt === "a4") return A4;
  if (fmt === "a3") return A3;
  return null; // "original"
}



function drawPageInCell(outPage, embedded, srcRotationDeg, cellX, cellY, cellW, cellH, pad = 10) {
  const rot = ((360 - (srcRotationDeg || 0)) % 360); // Rotation kompensieren
  const w = embedded.width;
  const h = embedded.height;

  const swap = (rot === 90 || rot === 270);
  const effW = swap ? h : w;
  const effH = swap ? w : h;

  // Fit in cell (mit Padding)
  const availW = Math.max(1, cellW - pad * 2);
  const availH = Math.max(1, cellH - pad * 2);
  const s = Math.min(availW / effW, availH / effH);

  const drawW = w * s;
  const drawH = h * s;
  const boxW = effW * s;
  const boxH = effH * s;

  // Box zentriert in Zelle
  const baseX = cellX + (cellW - boxW) / 2;
  const baseY = cellY + (cellH - boxH) / 2;

  // Korrekte Translation je nach Rotation (pdf-lib rotiert um (x,y))
  let x = baseX;
  let y = baseY;

  if (rot === 90)  x = baseX + boxW;
  if (rot === 180) { x = baseX + boxW; y = baseY + boxH; }
  if (rot === 270) y = baseY + boxH;

  outPage.drawPage(embedded, {
    x,
    y,
    width: drawW,
    height: drawH,
    rotate: rot ? degrees(rot) : undefined,
  });
}

















    const outDoc = await PDFDocument.create();

    const start = range.start;
    const end = range.end;

    const indices = [];
    for (let p = start; p <= end; p++) indices.push(p - 1);

    const rangeCount = indices.length;
    const totalAdds = (mode === "append")
      ? (rangeCount * 1 + rangeCount * copies)
      : (rangeCount * (1 + copies));

    let doneAdds = 0;










async function addPageIndex(pageIndex) {
  const target = getTargetSize(format);

  // Originalformat: wie bisher kopieren
  if (!target) {
    const [copied] = await outDoc.copyPages(srcDoc, [pageIndex]);
    outDoc.addPage(copied);
    doneAdds++;
    if (onProgress) onProgress(doneAdds, totalAdds);
    return;
  }

  // A4/A3: neue Seite im Ziel-Format + Originalseite einbetten und fitten
  const [outW, outH] = target;

  const srcPage = srcDoc.getPage(pageIndex);
  const rot = srcPage.getRotation().angle || 0;

  const [copied] = await outDoc.copyPages(srcDoc, [pageIndex]);
  const embedded = await outDoc.embedPage(copied);

  const outPage = outDoc.addPage([outW, outH]);
  drawPageInCell(outPage, embedded, rot, 0, 0, outW, outH, 0);

  doneAdds++;
  if (onProgress) onProgress(doneAdds, totalAdds);
}
















if (mode === "two_up") {
  const pages = [];
  for (let p = range.start; p <= range.end; p++) pages.push(p - 1);

  const pairs = [];
  for (let i = 0; i < pages.length; i += 2) {
    const a = pages[i];
    const b = (i + 1 < pages.length) ? pages[i + 1] : null;

    pairs.push([a, b]);
    for (let c = 0; c < copies; c++) pairs.push([a, b]);
  }

  const first = srcDoc.getPage(pages[0] ?? 0);
  const srcW = first.getWidth();
  const srcH = first.getHeight();

const srcIsLandscape = (srcW >= srcH);
const target = getTargetSize(format);

let outW, outH;

if (!target) {
  // Originalformat: 2-Up immer um 90° drehen (wie bei dir aktuell)
  outW = srcH;
  outH = srcW;
} else {
  // A4/A3: Basis ist Portrait (W,H). Für Hochformat-Original -> Landscape (H,W).
  const baseW = target[0];
  const baseH = target[1];

  if (srcIsLandscape) {
    // Querformat-Original -> Ausgabe Portrait (oben/unten)
    outW = baseW;
    outH = baseH;
  } else {
    // Hochformat-Original -> Ausgabe Landscape (links/rechts)
    outW = baseH;
    outH = baseW;
  }
}

  const margin = 18;
  const halfW = outW / 2;

  const totalAdds = pairs.length;
  let doneAdds = 0;

  for (const [a, b] of pairs) {
    const outPage = outDoc.addPage([outW, outH]);

const gutter = 0;

let cellA, cellB;

if (srcIsLandscape) {
  // Original Querformat -> Ausgabe Hochformat -> oben/unten
  const cellW = outW;
  const cellH = (outH - gutter) / 2;

  cellA = { x: 0, y: cellH + gutter, w: cellW, h: cellH }; // oben
  cellB = { x: 0, y: 0,             w: cellW, h: cellH };  // unten
} else {
  // Original Hochformat -> Ausgabe Querformat -> links/rechts
  const cellW = (outW - gutter) / 2;
  const cellH = outH;

  cellA = { x: 0,           y: 0, w: cellW, h: cellH }; // links
  cellB = { x: cellW + gutter, y: 0, w: cellW, h: cellH }; // rechts
}

// LEFT (a)
{
  const srcPageA = srcDoc.getPage(a);
  const rotA = srcPageA.getRotation().angle || 0;

  const [copiedA] = await outDoc.copyPages(srcDoc, [a]);
  const embA = await outDoc.embedPage(copiedA);

drawPageInCell(outPage, embA, rotA, cellA.x, cellA.y, cellA.w, cellA.h, 0);

}

// RIGHT (b)
if (b !== null) {
  const srcPageB = srcDoc.getPage(b);
  const rotB = srcPageB.getRotation().angle || 0;

  const [copiedB] = await outDoc.copyPages(srcDoc, [b]);
  const embB = await outDoc.embedPage(copiedB);

drawPageInCell(outPage, embB, rotB, cellB.x, cellB.y, cellB.w, cellB.h, 0);

}

    doneAdds++;
    if (onProgress) onProgress(doneAdds, totalAdds);
  }

  const outBytes = await outDoc.save();
  return new Blob([outBytes], { type: "application/pdf" });
}













if (mode === "two_up_sorted") {
  // Seiten als Indizes (0-basiert)
  const pages = [];
  for (let p = range.start; p <= range.end; p++) pages.push(p - 1);

  // Paare: jede Seite zweimal auf ein Blatt
const extra = Math.max(0, (parseInt(copies, 10) || 0) - 1);

// Paare: jede Seite zweimal auf ein Blatt
const pairs = [];
for (let i = 0; i < pages.length; i++) {
  const a = pages[i];

  pairs.push([a, a]); // genau 1 Blatt pro Originalseite
  for (let c = 0; c < extra; c++) pairs.push([a, a]); // zusätzliche Blätter
}

  const first = srcDoc.getPage(pages[0] ?? 0);
  const srcW = first.getWidth();
  const srcH = first.getHeight();

const srcIsLandscape = (srcW >= srcH);
const target = getTargetSize(format);

let outW, outH;

if (!target) {
  // Originalformat: 2-Up immer um 90° drehen (wie bei dir aktuell)
  outW = srcH;
  outH = srcW;
} else {
  // A4/A3: Basis ist Portrait (W,H). Für Hochformat-Original -> Landscape (H,W).
  const baseW = target[0];
  const baseH = target[1];

  if (srcIsLandscape) {
    // Querformat-Original -> Ausgabe Portrait (oben/unten)
    outW = baseW;
    outH = baseH;
  } else {
    // Hochformat-Original -> Ausgabe Landscape (links/rechts)
    outW = baseH;
    outH = baseW;
  }
}
  const margin = 18;
  const halfW = outW / 2;

  const totalAdds = pairs.length;
  let doneAdds = 0;

  for (const [a, b] of pairs) {
const outPage = outDoc.addPage([outW, outH]);

const gutter = 0;

let cellA, cellB;

if (srcIsLandscape) {
  // Original Querformat -> Ausgabe Hochformat -> oben/unten
  const cellW = outW;
  const cellH = (outH - gutter) / 2;

  cellA = { x: 0, y: cellH + gutter, w: cellW, h: cellH }; // oben
  cellB = { x: 0, y: 0,             w: cellW, h: cellH };  // unten
} else {
  // Original Hochformat -> Ausgabe Querformat -> links/rechts
  const cellW = (outW - gutter) / 2;
  const cellH = outH;

  cellA = { x: 0,           y: 0, w: cellW, h: cellH }; // links
  cellB = { x: cellW + gutter, y: 0, w: cellW, h: cellH }; // rechts
}

// LEFT (a)
{
  const srcPageA = srcDoc.getPage(a);
  const rotA = srcPageA.getRotation().angle || 0;

  const [copiedA] = await outDoc.copyPages(srcDoc, [a]);
  const embA = await outDoc.embedPage(copiedA);

drawPageInCell(outPage, embA, rotA, cellA.x, cellA.y, cellA.w, cellA.h, 0);
}

// RIGHT (b)
if (b !== null) {
  const srcPageB = srcDoc.getPage(b);
  const rotB = srcPageB.getRotation().angle || 0;

  const [copiedB] = await outDoc.copyPages(srcDoc, [b]);
  const embB = await outDoc.embedPage(copiedB);

drawPageInCell(outPage, embB, rotB, cellB.x, cellB.y, cellB.w, cellB.h, 0);
}

    doneAdds++;
    if (onProgress) onProgress(doneAdds, totalAdds);
  }

  const outBytes = await outDoc.save();
  return new Blob([outBytes], { type: "application/pdf" });
}



















    if (mode === "append") {
      for (const i of indices) await addPageIndex(i);
      for (const i of indices) for (let c = 0; c < copies; c++) await addPageIndex(i);
    } else {
      for (const i of indices) {
        await addPageIndex(i);
        for (let c = 0; c < copies; c++) await addPageIndex(i);
      }
    }

    const outBytes = await outDoc.save();
    return new Blob([outBytes], { type: "application/pdf" });
  }







function triggerDownload(blob, filename, root) {
  const url = URL.createObjectURL(blob);

  const openAfter = root ? root.querySelector("#ppd-open-after-export") : null;
  const dlAfter   = root ? root.querySelector("#ppd-download-after-export") : null;

  const shouldOpen = !!(openAfter && openAfter.checked);
  const shouldDl   = !!(dlAfter && dlAfter.checked);

  // Wenn beides aus: NICHTS tun + Warnung aktivieren
  if (!shouldOpen && !shouldDl) {
    // optional: visuell "aufleuchten" beim Klick
    try {
      const openWrap = openAfter ? openAfter.closest(".ppd-checkbox, .ppd-checkbox-row") : null;
      const dlWrap   = dlAfter   ? dlAfter.closest(".ppd-checkbox, .ppd-checkbox-row") : null;
      [openWrap, dlWrap].filter(Boolean).forEach(t => {
        t.classList.add("ppd-warn");
        t.classList.remove("ppd-pulse");
        void t.offsetWidth;
        t.classList.add("ppd-pulse");
      });
    } catch (_) {}

    URL.revokeObjectURL(url);
    return;
  }

  // Optional Download
  if (shouldDl) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "duplicated.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Optional Öffnen
  if (shouldOpen) {
    setTimeout(() => window.open(url, "_blank"), shouldDl ? 150 : 0);
  }

  setTimeout(() => URL.revokeObjectURL(url), 60000);
}











function ensureHoverPreviewEl() {
  let el = document.getElementById("ppd-hover-preview");
  if (el) return el;

  el = document.createElement("div");
  el.id = "ppd-hover-preview";
  el.className = "ppd-hover-preview";

  const img = document.createElement("img");
  img.alt = "Vorschau";
  el.appendChild(img);

  const cap = document.createElement("div");
  cap.className = "ppd-hover-caption";

  const left = document.createElement("span");
  left.className = "ppd-hover-left";
  const right = document.createElement("span");
  right.className = "ppd-hover-right";

  cap.appendChild(left);
  cap.appendChild(right);
  el.appendChild(cap);

  document.body.appendChild(el);
  return el;
}










async function getBigPreviewDataURL(root, pageNum) {
  const state = getPreviewState(root);
  const file = (root && root._ppdSelectedFile) ? root._ppdSelectedFile : null;

  if (!file) return null;

  // schon im Cache?
  if (state.bigCache && state.bigCache.has(pageNum)) {
    return state.bigCache.get(pageNum);
  }

  // PDF.js doc sicherstellen
  const pdfJsDoc = await ensurePdfJsDoc(state, file);
  const page = await pdfJsDoc.getPage(pageNum);

  const bigViewport = page.getViewport({ scale: 1.5 });

  const bigCanvas = document.createElement("canvas");
  const bigCtx = bigCanvas.getContext("2d");
  bigCanvas.width = bigViewport.width;
  bigCanvas.height = bigViewport.height;

  await page.render({
    canvasContext: bigCtx,
    viewport: bigViewport
  }).promise;

  const big = bigCanvas.toDataURL("image/png");
  state.bigCache.set(pageNum, big);
  return big;
}















async function getTwoUpBigPreviewDataURL(root, leftOld, rightOld) {
  const state = getPreviewState(root);
  const vertical = !!state.twoUpVertical;
const key = `twoUp:${vertical ? "v" : "h"}:${leftOld}|${rightOld || ""}`;

  if (state.bigCache && state.bigCache.has(key)) {
    return state.bigCache.get(key);
  }

  // Bigs lazy holen (einzeln)
  const left = leftOld ? await getBigPreviewDataURL(root, leftOld) : null;
  const right = rightOld ? await getBigPreviewDataURL(root, rightOld) : null;

  // Fallback: wenn nur links existiert
  if (!left && !right) return null;
  if (left && !right) return left;

  // Images laden und in Canvas zusammensetzen
  const imgL = new Image();
  const imgR = new Image();

  const load = (img, src) => new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
    img.src = src;
  });

  await load(imgL, left);
  await load(imgR, right);

  const gap = 16;
const pad = 14;

let W, H;

if (vertical) {
  // oben/unten
  W = Math.max(imgL.naturalWidth, imgR.naturalWidth) + pad * 2;
  H = imgL.naturalHeight + imgR.naturalHeight + gap + pad * 2;
} else {
  // links/rechts
  W = imgL.naturalWidth + imgR.naturalWidth + gap + pad * 2;
  H = Math.max(imgL.naturalHeight, imgR.naturalHeight) + pad * 2;
}

const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext("2d");

// Hintergrund weiss
ctx.fillStyle = "#fff";
ctx.fillRect(0, 0, W, H);

if (vertical) {
  const xL = pad + (W - pad * 2 - imgL.naturalWidth) / 2;
  const xR = pad + (W - pad * 2 - imgR.naturalWidth) / 2;

  ctx.drawImage(imgL, xL, pad);
  ctx.drawImage(imgR, xR, pad + imgL.naturalHeight + gap);
} else {
  const yL = pad + (H - pad * 2 - imgL.naturalHeight) / 2;
  const yR = pad + (H - pad * 2 - imgR.naturalHeight) / 2;

  ctx.drawImage(imgL, pad, yL);
  ctx.drawImage(imgR, pad + imgL.naturalWidth + gap, yR);
}

  const out = canvas.toDataURL("image/png");
  state.bigCache.set(key, out);
  return out;
}
























async function getTwoUpThumbPreviewDataURL(root, leftOld, rightOld) {
  const state = getPreviewState(root);
  const vertical = !!state.twoUpVertical;
const key = `twoUpThumb:${vertical ? "v" : "h"}:${leftOld}|${rightOld || ""}`;

  if (state.bigCache && state.bigCache.has(key)) {
    return state.bigCache.get(key);
  }

  const leftSrc = leftOld ? state.thumbCache.get(leftOld) : null;
  const rightSrc = rightOld ? state.thumbCache.get(rightOld) : null;

  if (!leftSrc && !rightSrc) return null;
  if (leftSrc && !rightSrc) return leftSrc;

  const imgL = new Image();
  const imgR = new Image();

  const load = (img, src) => new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
    img.src = src;
  });

  await load(imgL, leftSrc);
  await load(imgR, rightSrc);

  const gap = 10;
const pad = 8;

let W, H;

if (vertical) {
  // oben/unten
  W = Math.max(imgL.naturalWidth, imgR.naturalWidth) + pad * 2;
  H = imgL.naturalHeight + imgR.naturalHeight + gap + pad * 2;
} else {
  // links/rechts
  W = imgL.naturalWidth + imgR.naturalWidth + gap + pad * 2;
  H = Math.max(imgL.naturalHeight, imgR.naturalHeight) + pad * 2;
}

const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext("2d");

ctx.fillStyle = "#fff";
ctx.fillRect(0, 0, W, H);

if (vertical) {
  const xL = pad + (W - pad * 2 - imgL.naturalWidth) / 2;
  const xR = pad + (W - pad * 2 - imgR.naturalWidth) / 2;

  ctx.drawImage(imgL, xL, pad);
  ctx.drawImage(imgR, xR, pad + imgL.naturalHeight + gap);
} else {
  const yL = pad + (H - pad * 2 - imgL.naturalHeight) / 2;
  const yR = pad + (H - pad * 2 - imgR.naturalHeight) / 2;

  ctx.drawImage(imgL, pad, yL);
  ctx.drawImage(imgR, pad + imgL.naturalWidth + gap, yR);
}

  const out = canvas.toDataURL("image/png");
  state.bigCache.set(key, out); // wir nutzen bigCache auch für Composite-Images
  return out;
}





























function attachPreviewHover(root) {
  const container = qs(root, "#ppd-preview");
  if (!container) return;

  // nur einmal binden
  if (container._ppdHoverBound) return;
  container._ppdHoverBound = true;

  const tip = ensureHoverPreviewEl();
  const tipImg = tip.querySelector("img");
  const capLeft = tip.querySelector(".ppd-hover-left");
  const capRight = tip.querySelector(".ppd-hover-right");

  function place(x, y) {
    const pad = 14;
    const rect = tip.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;

    // rechts/unten nicht aus dem viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (left + rect.width > vw - 8) left = Math.max(8, x - rect.width - pad);
    if (top + rect.height > vh - 8) top = Math.max(8, y - rect.height - pad);

    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  container.addEventListener("mousemove", (e) => {
    if (tip.style.display !== "none") place(e.clientX, e.clientY);
  });

  container.addEventListener("mouseover", async (e) => {
const img = e.target && e.target.closest ? e.target.closest(".ppd-preview-page img") : null;
if (!img) return;

// Check: sind wir auf einem two_up Blatt?
const sheet = img.closest(".ppd-preview-two-up");

if (sheet) {
  const leftOld = parseInt(sheet.getAttribute("data-ppd-sheet-left") || "", 10);
  const rightOld = parseInt(sheet.getAttribute("data-ppd-sheet-right") || "", 10);
  const newNum = sheet.getAttribute("data-ppd-sheet-new") || "";

capLeft.textContent = newNum ? `Neu: Seite ${newNum}` : "";
capRight.textContent =
  (Number.isFinite(leftOld) && leftOld > 0 && Number.isFinite(rightOld) && rightOld > 0)
    ? `Original: Seite ${leftOld} + ${rightOld}`
    : (Number.isFinite(leftOld) && leftOld > 0 ? `Original: Seite ${leftOld}` : "");


// Sofort: echtes kombiniertes Thumbnail aus dem Cache (falls möglich)
try {
const l = (Number.isFinite(leftOld) && leftOld > 0) ? leftOld : null;
const r = (Number.isFinite(rightOld) && rightOld > 0) ? rightOld : null;

const thumb2 = r ? await getTwoUpThumbPreviewDataURL(root, l, r) : null;
tipImg.src = thumb2 || img.src;
} catch (_) {
  tipImg.src = img.src;
}

  tip.style.display = "block";

  // Danach lazy: grosses kombiniertes 2-Up rendern
  try {
const l = (Number.isFinite(leftOld) && leftOld > 0) ? leftOld : null;
const r = (Number.isFinite(rightOld) && rightOld > 0) ? rightOld : null;

const big = r
  ? await getTwoUpBigPreviewDataURL(root, l, r)
  : (l ? await getBigPreviewDataURL(root, l) : null);

if (big) tipImg.src = big;
  } catch (_) {
    // keep thumbnail
  }

  return;
}

// Standard (nicht two_up): wie bisher pro Seite
const newNum = img.getAttribute("data-ppd-new") || "";
const oldNum = img.getAttribute("data-ppd-old") || "";
const oldPage = parseInt(oldNum, 10);

tipImg.src = img.src;
capLeft.textContent = newNum ? `Neu: Seite ${newNum}` : "";
capRight.textContent = oldNum ? `Original: Seite ${oldNum}` : "";
tip.style.display = "block";

if (!Number.isFinite(oldPage) || oldPage < 1) return;

try {
  const big = await getBigPreviewDataURL(root, oldPage);
  if (big) tipImg.src = big;
} catch (_) {
  // keep thumbnail
}



});



container.addEventListener("mouseout", (e) => {
  const img = e.target && e.target.closest ? e.target.closest(".ppd-preview-page img") : null;
  if (!img) return;
  tip.style.display = "none";
});



}

















  function init(root) {
    const fileInput = qs(root, "#ppd-file");
    const drop = qs(root, "#ppd-drop");
    const meta = qs(root, "#ppd-filemeta");
    const pagecountEl = qs(root, "#ppd-pagecount");
    if (pagecountEl) pagecountEl.style.display = "none";
    const run = qs(root, "#ppd-run");
    const reset = qs(root, "#ppd-reset");
    const copiesEl = qs(root, "#ppd-copies");
    const copiesCard  = qs(root, "#ppd-copies-card");
    const copiesLabel = qs(root, "#ppd-copies-label");
    const copiesHelp  = qs(root, "#ppd-copies-help");
    const statusEl = qs(root, "#ppd-status");
    const startEl = qs(root, "#ppd-range-start");
    const endEl = qs(root, "#ppd-range-end");
    const previewEmpty = qs(root, "#ppd-preview-empty");








const openAfterEl = qs(root, "#ppd-open-after-export");
const dlAfterEl   = qs(root, "#ppd-download-after-export");

// optional: wenn du Labels/Wrapper direkt referenzieren willst
const openAfterWrap = openAfterEl ? openAfterEl.closest(".ppd-checkbox, .ppd-checkbox-row") : null;
const dlAfterWrap   = dlAfterEl   ? dlAfterEl.closest(".ppd-checkbox, .ppd-checkbox-row") : null;

function updateExportChoiceWarning(pulse = false) {
  if (!openAfterEl || !dlAfterEl) return;

  const noneSelected = !openAfterEl.checked && !dlAfterEl.checked;

  const targets = [openAfterWrap, dlAfterWrap].filter(Boolean);
  targets.forEach(t => {
    t.classList.toggle("ppd-warn", noneSelected);
    if (pulse) {
      t.classList.remove("ppd-pulse");
      // reflow für erneutes Abspielen
      void t.offsetWidth;
      t.classList.add("ppd-pulse");
    } else {
      t.classList.remove("ppd-pulse");
    }
  });

  return noneSelected;
}





if (openAfterEl) openAfterEl.addEventListener("change", () => updateExportChoiceWarning());
if (dlAfterEl)   dlAfterEl.addEventListener("change", () => updateExportChoiceWarning());






    let selectedFile = null;
    let pageCount = null;

    // ensure preview state exists
    getPreviewState(root);

    function showStatus(msg, type = "") {
      const txt = (msg || "").trim();
      statusEl.classList.remove("is-success");

      if (!txt) {
        statusEl.style.display = "none";
        statusEl.textContent = "";
        return;
      }

      if (type === "success") {
        statusEl.classList.add("is-success");
      }

      statusEl.style.display = "block";
      statusEl.textContent = txt;
    }

    function resetPreviewUI() {
      const state = getPreviewState(root);
      state.renderSeq++; // cancel any running preview render
      state.pdfJsDoc = null;
      state.thumbCache = new Map();
state.bigCache = new Map();
      state.fileKey = "";

      const preview = qs(root, "#ppd-preview");
      if (preview) preview.innerHTML = "";

      const pwrap = qs(root, "#ppd-preview-progress");
      if (pwrap) pwrap.style.display = "none";

      const pbar = qs(root, "#ppd-preview-progress-bar");
      if (pbar) pbar.style.width = "0%";

      const ptxt = qs(root, "#ppd-preview-progress-text");
      if (ptxt) ptxt.textContent = "";

      const ppct = qs(root, "#ppd-preview-progress-pct");
      if (ppct) ppct.textContent = "";

      const previewEmpty = qs(root, "#ppd-preview-empty");
      if (previewEmpty) previewEmpty.style.display = "flex";

const elNew = qs(root, "#ppd-preview-count-new");
const elOld = qs(root, "#ppd-preview-count-old");
if (elNew) elNew.textContent = "Neu: – Seiten";
if (elOld) elOld.textContent = "Original: – Seiten";

    }








function updateCopiesUI() {
  const mode = getMode(root);

// copies-card immer sichtbar lassen
if (copiesCard) copiesCard.style.display = "";
if (copiesEl) {
  // überall min 1 erzwingen
  copiesEl.min = "1";
  if (!copiesEl.value || parseInt(copiesEl.value, 10) < 1) copiesEl.value = "1";
}

if (mode === "two_up") {
  if (copiesLabel) copiesLabel.textContent = "Zusätzliche Blätter";
  if (copiesHelp)  copiesHelp.textContent  = "Je zwei Originalseiten werden auf ein Blatt gelegt.\n1 = 1 zusätzliches Blatt mit zwei Originalseiten.";
  return;
}

if (mode === "two_up_sorted") {
  if (copiesLabel) copiesLabel.textContent = "Anzahl Blätter mit zwei Originalseiten";
  if (copiesHelp)  copiesHelp.textContent  = "Jede Originalseite erscheint zweimal auf einem Blatt.\n1 = 1 Blatt mit zweimal der gleichen Originalseite.";
  // wichtig: falls du intern extra=copies-1 nutzt, bleibt UI trotzdem logisch, weil 1 -> 1 Blatt
  return;
}

// Standard-Modi
if (mode === "append") {
  if (copiesLabel) copiesLabel.textContent = "Zusätzliche Kopien pro Seite";
  if (copiesHelp)  copiesHelp.textContent  = "Alle Duplikate werden als Block ans Ende angehängt.\n1 = jede Seite 1× zusätzlich.";
  return;
}

// interleave (Default)
if (copiesLabel) copiesLabel.textContent = "Zusätzliche Kopien pro Seite";
if (copiesHelp)  copiesHelp.textContent  = "Duplikate werden direkt nach jeder Seite eingefügt.\n1 = jede Seite 1× zusätzlich.";
}
















    async function updatePreview() {
      if (!selectedFile || !pageCount) return;

      let copies = parseInt(copiesEl.value, 10);
      if (!Number.isFinite(copies) || copies < 1) copies = 1;
      if (copies > 50) copies = 50;

      const range = normalizeRange(startEl.value, endEl.value, pageCount);
      const mode = getMode(root);




if (mode === "two_up") {
  const sheets = buildTwoUpSheets({ range, copies });
await renderPreviewTwoUp({ file: selectedFile, sheets, root, mode: "two_up" });
} else if (mode === "two_up_sorted") {
  const sheets = buildTwoUpSortedSheets({ range, copies });
await renderPreviewTwoUp({ file: selectedFile, sheets, root, mode: "two_up_sorted" });
} else {
  const order = buildPageOrder({ range, mode, copies });
  await renderPreview({ file: selectedFile, order, root });
}




    }

    function setFileMeta(file) {
      selectedFile = file;
root._ppdSelectedFile = file || null;
      pageCount = null;
      resetProgress(root);
      resetPreviewUI();

if (!file) {
  meta.textContent = "Keine Datei ausgewählt";
  pagecountEl.textContent = "";
  startEl.value = "";
  endEl.value = "";
  showStatus("");

  if (previewEmpty) previewEmpty.style.display = "flex";

  return;
}

      const sizeMB = file.size / (1024 * 1024);
      const sizeStr = sizeMB >= 1 ? `${sizeMB.toFixed(2)} MB` : `${Math.round(file.size / 1024)} KB`;
      meta.textContent = `Hochgeladene Datei: ${file.name} (${sizeStr})`;
      pagecountEl.textContent = "Seiten werden gelesen…";
      showStatus("");

      (async () => {
        try {
          const pc = await readPageCount(file);
          pageCount = pc;

          pagecountEl.textContent = `PDF erkannt: ${pc} Seite${pc === 1 ? "" : "n"}.`;
if (pagecountEl) pagecountEl.style.display = "";
          startEl.placeholder = "1";
          endEl.placeholder = String(pc);
          startEl.max = String(pc);
          endEl.max = String(pc);

          // Start preview (after successful pageCount)
          setTimeout(updatePreview, 0);
        } catch (e) {
          pagecountEl.textContent = "";
          showStatus("Fehler beim Lesen der PDF (Seitenzahl).");
        }
      })();
    }

    // Click / keyboard => picker
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    // Drag & Drop
    ["dragenter", "dragover"].forEach((evt) => {
      drop.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.add("is-over");
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      drop.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.remove("is-over");
      });
    });
    drop.addEventListener("drop", (e) => {
      const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
      const file = files[0];
      if (!file) return;
      if (!isPdfFile(file)) { setFileMeta(null); showStatus("Bitte eine PDF-Datei ablegen."); return; }
      setFileMeta(file);
    });

    // Picker
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      if (file && !isPdfFile(file)) {
        setFileMeta(null);
        fileInput.value = "";
        showStatus("Bitte eine PDF auswählen.");
        return;
      }
      setFileMeta(file);
    });

    // Preview live updates
    copiesEl.addEventListener("change", updatePreview);
    startEl.addEventListener("change", updatePreview);
    endEl.addEventListener("change", updatePreview);
    root.querySelectorAll('input[name="ppd-mode"]').forEach((el) =>
  el.addEventListener("change", () => {
    updateCopiesUI();
    updatePreview();
  })
);





run.addEventListener("click", async () => {
     


const openAfter = qs(root, "#ppd-open-after-export");
const dlAfter   = qs(root, "#ppd-download-after-export");

if (openAfter && dlAfter && !openAfter.checked && !dlAfter.checked) {
  // Warnung visuell aktualisieren
  updateExportChoiceWarning(true);

  resetProgress(root);

  return; // Export abbrechen
}




 try {
        showStatus("");
        resetProgress(root);

        const file = selectedFile || (fileInput.files && fileInput.files[0]);
        if (!file) { showStatus("Du hast noch keine PDF-Datei hochgeladen."); return; }
        if (!isPdfFile(file)) { showStatus("Das sieht nicht wie eine PDF aus."); return; }

        if (!pageCount) {
          pagecountEl.textContent = "Seiten werden gelesen…";
          pageCount = await readPageCount(file);
          pagecountEl.textContent = `PDF erkannt: ${pageCount} Seite${pageCount === 1 ? "" : "n"}.`;
          startEl.max = String(pageCount);
          endEl.max = String(pageCount);
        }

        let copies = parseInt(copiesEl.value, 10);
        if (!Number.isFinite(copies) || copies < 1) copies = 1;
        if (copies > 50) copies = 50;

        const range = normalizeRange(startEl.value, endEl.value, pageCount);
        const mode = getMode(root);
	const format = getFormat(root);

        disableUI(root, true);
        showStatus("Verarbeite PDF lokal im Browser…");
        setProgress(root, 0, 1);

	const blob = await buildPdf({
  	file,
  	mode,
  	copies,
  	range,
  	format,
  	onProgress: (done, total) => setProgress(root, done, total),
	});

triggerDownload(blob, buildDownloadName(file), root);


const rangeLabel = range.isAll ? "alle Seiten" : `Seiten ${range.start}–${range.end}`;

let actionText = "";

if (dlAfter?.checked && openAfter?.checked) {
  actionText = "heruntergeladen und im Browser geöffnet";
} else if (dlAfter?.checked) {
  actionText = "heruntergeladen";
} else if (openAfter?.checked) {
  actionText = "im Browser geöffnet";
} else {
  actionText = "erstellt";
}

showStatus(
  `Fertig. Neue PDF-Datei wurde erstellt und ${actionText}. (${rangeLabel})`,
  "success"
);
      } catch (e) {
        showStatus("Fehler: " + (e && e.message ? e.message : String(e)));
      } finally {
        disableUI(root, false);
      }
    });

    reset.addEventListener("click", () => {
      const openAfter = qs(root, "#ppd-open-after-export");
      const dlAfter   = qs(root, "#ppd-download-after-export");

      if (openAfter) openAfter.checked = true;
      if (dlAfter)   dlAfter.checked = true;

      updateExportChoiceWarning(false);

	// Modus auf Standard zurücksetzen
	const defaultMode = qs(root, 'input[name="ppd-mode"][value="two_up_sorted"]');
	if (defaultMode) defaultMode.checked = true;

	// Format auf Standard zurücksetzen
	const defaultFormat = qs(root, 'input[name="ppd-format"][value="original"]');
	if (defaultFormat) defaultFormat.checked = true;

      fileInput.value = "";
      selectedFile = null;
      root._ppdSelectedFile = null;
      pageCount = null;
      showStatus("");
      resetProgress(root);
      resetPreviewUI();

const copiesEl = qs(root, "#ppd-copies");
if (copiesEl) copiesEl.value = "1";

      meta.textContent = "Keine Datei ausgewählt";
      pagecountEl.textContent = "";
      startEl.value = "";
      endEl.value = "";
      startEl.placeholder = "1";
      endEl.placeholder = "z.B. 10";
updateCopiesUI();
if (pagecountEl) pagecountEl.style.display = "none";

updatePreview();
updateExportChoiceWarning(false);

    });

    setFileMeta(null);

updateCopiesUI();










// Sidebar-Höhe = exakt Höhe der linken Spalte
(function syncSidebarHeight(){
  const layout = root.querySelector(".ppd-layout");
  const main = root.querySelector(".ppd-main");
  const side = root.querySelector(".ppd-side");
  if (!layout || !main || !side) return;

  const apply = () => {
    // Höhe der linken Spalte (inkl. Inhalt)
    const h = Math.ceil(main.getBoundingClientRect().height);
    side.style.height = h ? `${h}px` : "";
  };

  apply();

  // Reagiert auf dynamische Änderungen (Preview-Rerender, Statusmeldungen, etc.)
  const ro = new ResizeObserver(() => apply());
  ro.observe(main);

  // Fallback: auch bei Window-Resize
  window.addEventListener("resize", apply);
})();
















  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-ppd-root]").forEach(init);
  });
})();