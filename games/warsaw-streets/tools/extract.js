/* Sprite extraction pipeline (browser, no dependencies, no Python).

   Cuts animation frames out of the concept sheets and packs them into transparent atlases:
   per frame: crop the hand-measured rectangle -> flood-fill key the background -> remove
   specks / baked-in ground shadow -> scale to game size -> trim -> compute a foot pivot.
   Frames are shelf-packed into <sheet>.png and described by atlas_<sheet>.js.

   Images are plain objects { w, h, data: Uint8ClampedArray(RGBA) }. Reading pixels needs an
   untainted canvas, which is why tools/extract.html takes the sheets through a file picker
   (a page opened from file:// cannot read pixels of images it loads by URL). */
(function () {
  'use strict';

  /* ---------------- image helpers ---------------- */

  function make(w, h) { return { w, h, data: new Uint8ClampedArray(w * h * 4) }; }

  function crop(img, x0, y0, x1, y1) {
    const out = make(x1 - x0, y1 - y0);
    for (let y = y0; y < y1; y++) {
      const so = (y * img.w + x0) * 4;
      out.data.set(img.data.subarray(so, so + out.w * 4), (y - y0) * out.w * 4);
    }
    return out;
  }

  /** Flood-fill the background to transparent from every border pixel, drop big enclosed
      background pockets (between wide-stance legs), then defringe one ring of halo pixels. */
  function keyBackground(img, bg, tol, defringe, pockets) {
    const { w, h, data: d } = img;
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const i = stack.pop();
      if (seen[i]) continue;
      const o = i * 4;
      if (Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]) > tol) continue;
      seen[i] = 1;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && !seen[i - 1]) stack.push(i - 1);
      if (x < w - 1 && !seen[i + 1]) stack.push(i + 1);
      if (y > 0 && !seen[i - w]) stack.push(i - w);
      if (y < h - 1 && !seen[i + w]) stack.push(i + w);
    }
    for (let i = 0; i < w * h; i++) if (seen[i]) d[i * 4 + 3] = 0;

    if (pockets) {
      const ptol = tol * 0.75;
      const near = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        if (d[i * 4 + 3]) {
          const o = i * 4;
          if (Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]) <= ptol) near[i] = 1;
        }
      }
      for (let start = 0; start < w * h; start++) {
        if (!near[start]) continue;
        const blob = [start];
        near[start] = 2;
        for (let k = 0; k < blob.length; k++) {
          const i = blob[k], x = i % w, y = (i / w) | 0;
          const nb = [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1];
          for (const j of nb) if (j >= 0 && near[j] === 1) { near[j] = 2; blob.push(j); }
        }
        if (blob.length >= pockets) for (const i of blob) d[i * 4 + 3] = 0;
      }
    }

    const lim = tol * defringe, kill = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!d[i * 4 + 3]) continue;
        const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
          !d[(i - 1) * 4 + 3] || !d[(i + 1) * 4 + 3] || !d[(i - w) * 4 + 3] || !d[(i + w) * 4 + 3];
        if (edge) {
          const o = i * 4;
          if (Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]) <= lim) kill.push(i);
        }
      }
    }
    for (const i of kill) d[i * 4 + 3] = 0;
    return img;
  }

  /** 8-connected components of non-transparent pixels: [{ area, bbox:[x0,y0,x1,y1], pix }]. */
  function components(img) {
    const { w, h, data: d } = img;
    const seen = new Uint8Array(w * h);
    const out = [];
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || !d[start * 4 + 3]) continue;
      const pix = [start];
      seen[start] = 1;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let k = 0; k < pix.length; k++) {
        const i = pix[k], x = i % w, y = (i / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const j = ny * w + nx;
            if (!seen[j] && d[j * 4 + 3]) { seen[j] = 1; pix.push(j); }
          }
        }
      }
      out.push({ area: pix.length, bbox: [x0, y0, x1 + 1, y1 + 1], pix });
    }
    return out;
  }

  function trim(img) {
    const { w, h, data: d } = img;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? img : crop(img, x0, y0, x1 + 1, y1 + 1);
  }

  /** Area-average downscale on premultiplied colour, then binarise alpha so the result stays
      crisp like pixel art instead of a blurry bitmap. */
  function scale(img, s) {
    const nw = Math.max(1, Math.round(img.w * s)), nh = Math.max(1, Math.round(img.h * s));
    const out = make(nw, nh), d = img.data, od = out.data;
    for (let oy = 0; oy < nh; oy++) {
      const sy0 = oy / s, sy1 = (oy + 1) / s;
      for (let ox = 0; ox < nw; ox++) {
        const sx0 = ox / s, sx1 = (ox + 1) / s;
        let r = 0, g = 0, b = 0, a = 0, wsum = 0;
        for (let y = Math.floor(sy0); y < sy1 && y < img.h; y++) {
          const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
          for (let x = Math.floor(sx0); x < sx1 && x < img.w; x++) {
            const wt = (Math.min(x + 1, sx1) - Math.max(x, sx0)) * wy;
            const o = (y * img.w + x) * 4, al = d[o + 3] / 255;
            r += d[o] * al * wt; g += d[o + 1] * al * wt; b += d[o + 2] * al * wt;
            a += al * wt; wsum += wt;
          }
        }
        if (wsum && a / wsum >= 0.5) {
          const oo = (oy * nw + ox) * 4;
          od[oo] = Math.min(255, Math.trunc(r / a));
          od[oo + 1] = Math.min(255, Math.trunc(g / a));
          od[oo + 2] = Math.min(255, Math.trunc(b / a));
          od[oo + 3] = 255;
        }
      }
    }
    return out;
  }

  /** Nearest-neighbour rotation about the centre; the sign convention is the one manifest.js relies on. */
  function rotate(img, deg, pad) {
    pad = pad === undefined ? 2 : pad;
    const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const { w, h } = img;
    const nw = Math.trunc(Math.abs(w * ca) + Math.abs(h * sa)) + pad * 2;
    const nh = Math.trunc(Math.abs(w * sa) + Math.abs(h * ca)) + pad * 2;
    const out = make(nw, nh);
    const cx = w / 2, cy = h / 2, ncx = nw / 2, ncy = nh / 2;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const dx = x - ncx + 0.5, dy = y - ncy + 0.5;
      const ix = Math.trunc(dx * ca - dy * sa + cx), iy = Math.trunc(dx * sa + dy * ca + cy);
      if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
        const o = (iy * w + ix) * 4;
        if (img.data[o + 3]) out.data.set(img.data.subarray(o, o + 4), (y * nw + x) * 4);
      }
    }
    return out;
  }

  /* ---------------- frame extraction ---------------- */

  /** Most common (quantised) colour along the crop border = local background. */
  function borderBg(img) {
    const counts = new Map();
    const add = (x, y) => {
      const o = (y * img.w + x) * 4;
      const k = ((img.data[o] >> 2) << 16) | ((img.data[o + 1] >> 2) << 8) | (img.data[o + 2] >> 2);
      counts.set(k, (counts.get(k) || 0) + 1);
    };
    for (let x = 0; x < img.w; x++) { add(x, 0); add(x, img.h - 1); }
    for (let y = 0; y < img.h; y++) { add(0, y); add(img.w - 1, y); }
    let best = -1, bestN = -1;
    for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
    return [((best >> 16) & 255) * 4 + 2, ((best >> 8) & 255) * 4 + 2, (best & 255) * 4 + 2];
  }

  function extractFrame(sheet, frameDef, cfg) {
    let rect = frameDef, excl = [];
    if (!Array.isArray(frameDef)) { rect = frameDef.rect; excl = frameDef.excl || []; }
    const img = crop(sheet, rect[0], rect[1], rect[2], rect[3]);
    for (const [ex0, ey0, ex1, ey1] of excl) {          // blank a neighbouring sprite's pixels
      const o = (rect[1] * sheet.w + rect[0]) * 4;
      for (let y = Math.max(0, ey0 - rect[1]); y < Math.min(img.h, ey1 - rect[1]); y++) {
        for (let x = Math.max(0, ex0 - rect[0]); x < Math.min(img.w, ex1 - rect[0]); x++) {
          img.data.set(sheet.data.subarray(o, o + 4), (y * img.w + x) * 4);
        }
      }
    }
    const bg = cfg.bg || borderBg(img);
    keyBackground(img, bg, cfg.tol, cfg.defringe, cfg.pockets);

    const comps = components(img);
    if (!comps.length) throw new Error('Empty frame ' + JSON.stringify(rect));
    const biggest = Math.max(...comps.map(c => c.area));
    const keep = new Uint8Array(img.w * img.h);
    for (const c of comps) {
      const [bx0, by0, bx1, by1] = c.bbox;
      const flat = (bx1 - bx0) >= 2.5 * (by1 - by0) && c.area < biggest * 0.03;   // ground shadow line
      if (c.area >= Math.max(cfg.minSpeck, biggest * 0.004) && !flat) for (const i of c.pix) keep[i] = 1;
    }
    for (let i = 0; i < img.w * img.h; i++) if (!keep[i]) img.data[i * 4 + 3] = 0;

    let t = trim(img);
    // Baked-in ground shadow: dark, blue-ish pixels in the bottom rows (boots are neutral black).
    for (let y = Math.floor(t.h * 0.9); y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const o = (y * t.w + x) * 4, r = t.data[o], g = t.data[o + 1], b = t.data[o + 2];
      if (t.data[o + 3] && r < 45 && b < 75 && b - r >= 20 && Math.abs(b - g) <= 40) t.data[o + 3] = 0;
    }
    t = trim(t);
    return trim(scale(t, cfg.scale));
  }

  /** Pivot x = centre of the lowest pixels (the planted foot / feet); y = bottom row. */
  function footPivot(img) {
    const rows = Math.max(3, Math.floor(img.h / 14));
    let sum = 0, n = 0;
    for (let y = img.h - rows; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3]) { sum += x; n++; }
    }
    return [Math.round(sum / n), img.h - 1];
  }

  function pack(frames, maxW, pad) {
    maxW = maxW || 1024; pad = pad === undefined ? 2 : pad;
    let x = 0, y = 0, shelf = 0;
    const place = {};
    for (const [name, im] of frames) {
      if (x + im.w + pad > maxW) { x = 0; y += shelf + pad; shelf = 0; }
      place[name] = [x, y];
      x += im.w + pad;
      shelf = Math.max(shelf, im.h);
    }
    const atlas = make(maxW, y + shelf + pad);
    for (const [name, im] of frames) {
      const [px, py] = place[name];
      for (let yy = 0; yy < im.h; yy++) {
        atlas.data.set(im.data.subarray(yy * im.w * 4, (yy + 1) * im.w * 4), ((py + yy) * atlas.w + px) * 4);
      }
    }
    return { atlas, place };
  }

  /** Run one sheet. Returns { name, atlas (image), meta (frame table), js (atlas_<name>.js text) }. */
  function run(name, sheet, spec) {
    const cfg = { bg: spec.bg || null, tol: spec.tol, scale: spec.scale,
      minSpeck: spec.minSpeck || 40, defringe: spec.defringe || 2.0, pockets: spec.pockets === undefined ? 60 : spec.pockets };
    const frames = new Map();
    for (const [fname, def] of Object.entries(spec.frames)) frames.set(fname, extractFrame(sheet, def, cfg));
    for (const [fname, [src, deg]] of Object.entries(spec.derived || {})) {
      frames.set(fname, trim(rotate(frames.get(src), deg)));
    }
    const { atlas, place } = pack([...frames]);
    const meta = {};
    for (const [fname, im] of frames) {
      let [px, py] = footPivot(im);
      const piv = (spec.pivots || {})[fname];
      if (piv === 'mid') { px = im.w >> 1; py = im.h - 1; } else if (piv) { px = piv[0]; py = piv[1]; }
      meta[fname] = { x: place[fname][0], y: place[fname][1], w: im.w, h: im.h, px, py };
    }
    const js = '/* generated by tools/extract.html - do not edit */\n' +
      'window.ATLAS = window.ATLAS || {};\n' +
      'window.ATLAS[' + JSON.stringify(name) + '] = ' +
      JSON.stringify({ src: 'assets/sprites/' + name + '.png', frames: meta }, null, 1) + ';\n';
    return { name, atlas, meta, js };
  }

  /* ---------------- browser glue ---------------- */

  async function decodeToImage(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height);   // throws if the canvas is tainted
    return { w: c.width, h: c.height, data: id.data };
  }

  function toCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.w; c.height = img.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
    return c;
  }

  window.ExtractTool = { run, decodeToImage, toCanvas, keyBackground, components, scale, rotate, trim, crop };
})();
