// The photo on a CV, if it has one — read in the browser, like the text.
//
//   PDF   → the images painted on page 1 (pdf.js)
//   DOCX  → the pictures in word/media/
//
// A profile photo is the largest roughly-square picture that isn't a flat colour block (logos, icons
// and backgrounds are left out). It is cropped to a small square JPEG (about 10 KB) and kept only in this
// browser with the CV — it is never uploaded, and never used in the match score.

const OUT = 160; // px, square
const MIN_SIDE = 72; // smaller than this is an icon
const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

type Candidate = { w: number; h: number; draw: (ctx: CanvasRenderingContext2D, sx: number, sy: number, side: number) => void };

const squareish = (w: number, h: number) => Math.min(w, h) >= MIN_SIDE && w / h > 0.55 && w / h < 1.8;

/** Crop to the centre square (a little above centre — faces sit high), shrink, and check it isn't a flat block. */
function toDataUrl(c: Candidate): string | null {
  const side = Math.min(c.w, c.h);
  const sx = (c.w - side) / 2;
  const sy = c.h > c.w ? Math.max(0, (c.h - side) * 0.25) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, OUT, OUT);
  c.draw(ctx, sx, sy, side);
  // A photo has variety; a coloured box, a line or a background doesn't.
  const px = ctx.getImageData(0, 0, OUT, OUT).data;
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4 * 7) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    sum += l;
    sq += l * l;
    n += 1;
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  if (sd < 18) return null;
  return canvas.toDataURL('image/jpeg', 0.82);
}

function pick(cands: Candidate[]): string | null {
  const ok = cands.filter((c) => squareish(c.w, c.h)).sort((a, b) => b.w * b.h - a.w * a.h);
  for (const c of ok.slice(0, 4)) {
    const url = toDataUrl(c);
    if (url) return url;
  }
  return null;
}

async function fromDocx(buf: ArrayBuffer): Promise<string | null> {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^word\/media\/[^/]+\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name) && f.originalSize < 6_000_000 });
  const cands: Candidate[] = [];
  for (const [name, bytes] of Object.entries(files).slice(0, 12)) {
    const type = /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : /\.gif$/i.test(name) ? 'image/gif' : /\.bmp$/i.test(name) ? 'image/bmp' : 'image/jpeg';
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type }));
      cands.push({ w: bmp.width, h: bmp.height, draw: (ctx, sx, sy, side) => ctx.drawImage(bmp, sx, sy, side, side, 0, 0, OUT, OUT) });
    } catch {
      /* a format this browser can't draw (emf, wmf…) */
    }
  }
  return pick(cands);
}

type PdfImage = { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray | Uint8Array; kind?: number };

/** pdf.js image data → a canvas we can draw from. */
function pdfImageCandidate(img: PdfImage): Candidate | null {
  const { width: w, height: h } = img;
  if (!w || !h) return null;
  if (img.bitmap) {
    const bmp = img.bitmap;
    return { w, h, draw: (ctx, sx, sy, side) => ctx.drawImage(bmp, sx, sy, side, side, 0, 0, OUT, OUT) };
  }
  if (!img.data) return null;
  const src = img.data;
  const rgba = new Uint8ClampedArray(w * h * 4);
  if (img.kind === 3 && src.length >= w * h * 4) rgba.set(src.subarray(0, w * h * 4));
  else if (img.kind === 2 && src.length >= w * h * 3) {
    for (let i = 0, j = 0; i < w * h; i += 1, j += 3) {
      rgba[i * 4] = src[j];
      rgba[i * 4 + 1] = src[j + 1];
      rgba[i * 4 + 2] = src[j + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else return null; // 1-bit masks: never a photo
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.putImageData(new ImageData(rgba, w, h), 0, 0);
  return { w, h, draw: (ctx, sx, sy, side) => ctx.drawImage(canvas, sx, sy, side, side, 0, 0, OUT, OUT) };
}

async function fromPdf(buf: ArrayBuffer): Promise<string | null> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const ops = await page.getOperatorList();
    const cands: Candidate[] = [];
    for (let i = 0; i < ops.fnArray.length && cands.length < 12; i += 1) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i] as unknown[];
      let img: PdfImage | null = null;
      if (fn === pdfjs.OPS.paintImageXObject) {
        const id = args[0] as string;
        const store = id.startsWith('g_') ? page.commonObjs : page.objs;
        img = await new Promise<PdfImage | null>((resolve) => {
          const t = window.setTimeout(() => resolve(null), 1500);
          try {
            store.get(id, (v: PdfImage) => {
              window.clearTimeout(t);
              resolve(v ?? null);
            });
          } catch {
            window.clearTimeout(t);
            resolve(null);
          }
        });
      } else if (fn === pdfjs.OPS.paintInlineImageXObject) img = args[0] as PdfImage;
      const c = img && squareish(img.width, img.height) ? pdfImageCandidate(img) : null;
      if (c) cands.push(c);
    }
    return pick(cands);
  } finally {
    void doc.destroy();
  }
}

/** The CV's photo as a small square JPEG data URL, or null when there isn't one. Never throws. */
export async function extractCvPhoto(file: File): Promise<string | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  const kind = ext(file.name);
  try {
    if (kind === 'pdf' || file.type === 'application/pdf') return await fromPdf(await file.arrayBuffer());
    if (kind === 'docx') return await fromDocx(await file.arrayBuffer());
  } catch (err) {
    console.warn('CV photo not read', err);
  }
  return null;
}
