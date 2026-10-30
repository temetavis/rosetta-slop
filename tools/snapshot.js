// Renders the mock screen's draw-call log to a PNG snapshot.
// The demo draws 1-px strips (fillRect) in logical screen space
// (center origin, y-up). This rasterizer replays those calls with the
// same nearest-neighbor semantics as the browser canvas.

const { encodePng } = require("./pngcodec");

const W = 320;
const H = 200;

function parseColor(c) {
  if (typeof c !== "string") return null;
  let m = c.match(/^#([0-9a-fA-F]{6})$/);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function renderFrame(calls, scale = 2, file) {
  const img = Buffer.alloc(W * H * 4);
  for (let i = 3; i < W * H * 4; i += 4) img[i] = 255;
  const setPx = (x, y, color) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    img[o] = color[0]; img[o + 1] = color[1]; img[o + 2] = color[2];
  };
  // logical -> virtual pixel: 320x200 virtual screen centered at (0,0), y-up
  const toPx = (x, y) => [Math.round(x + W / 2), Math.round(-y + H / 2)];
  for (const call of calls) {
    if (call[0] === "fillRect") {
      const [, x, y, w, h, color] = call;
      const c = parseColor(color);
      if (!c) continue;
      const [cx, cy] = toPx(x, y);
      const x0 = cx - w / 2, x1 = cx + w / 2;
      const y0 = cy - h / 2, y1 = cy + h / 2;
      for (let py = Math.floor(y0); py < Math.ceil(y1); py++) {
        for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
          setPx(px, py, c);
        }
      }
    } else if (call[0] === "clear") {
      const c = parseColor(call[1]) || [0, 0, 0];
      for (let i = 0; i < W * H; i++) {
        const o = i * 4;
        img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
      }
    }
  }
  if (scale > 1) {
    const scaled = Buffer.alloc(W * scale * H * scale * 4);
    for (let y = 0; y < H * scale; y++) {
      const sy = Math.floor(y / scale);
      for (let x = 0; x < W * scale; x++) {
        const sx = Math.floor(x / scale);
        const s = (sy * W + sx) * 4;
        const d = (y * W * scale + x) * 4;
        scaled[d] = img[s]; scaled[d + 1] = img[s + 1]; scaled[d + 2] = img[s + 2]; scaled[d + 3] = 255;
      }
    }
    if (file) encodePng(scaled, W * scale, H * scale, file);
    return scaled;
  }
  if (file) encodePng(img, W, H, file);
  return img;
}

module.exports = { renderFrame, parseColor };
