// Headless microScript 2.0 runner for rosetta-slop.
// Loads the vendored microStudio v2 engine into a Node vm, provides a mock
// microStudio environment (screen/keyboard/mouse/touch/audio/storage) and
// exposes helpers to drive init/update/draw, inspect VM globals and render
// snapshots. Mirrors the recipe from mine-demake's lessons-learned doc.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "ms");
const VENDOR = path.join(ROOT, "vendor", "microscript-v2");

// ---------------------------------------------------------------- mock env

// Exact VIC-II (Pepto) palette used by the game; the mock screen verifies
// that every color ever drawn is one of these 16 values.
// VIC-II (Pepto) palette kept for reference/snapshots; raster bars may use
// interpolated colors outside this set, so trackColor only validates hex form.
const PALETTE = [
  "#000000", "#ffffff", "#68372b", "#70a4b2",
  "#6f3d86", "#588d43", "#352879", "#b8c70f",
  "#6f4f25", "#433900", "#9a6759", "#444444",
  "#6c6c6c", "#9ad284", "#6c5eb5", "#959595",
];
const PALETTE_RGB = [
  [0x00, 0x00, 0x00], [0xFF, 0xFF, 0xFF], [0x68, 0x37, 0x2B], [0x70, 0xA4, 0xB2],
  [0x6F, 0x3D, 0x86], [0x58, 0x8D, 0x43], [0x35, 0x28, 0x79], [0xB8, 0xC7, 0x0F],
  [0x6F, 0x4F, 0x25], [0x43, 0x39, 0x00], [0x9A, 0x67, 0x59], [0x44, 0x44, 0x44],
  [0x6C, 0x6C, 0x6C], [0x9A, 0xD2, 0x84], [0x6C, 0x5E, 0xB5], [0x95, 0x95, 0x95],
];

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function normColor(c) {
  if (typeof c !== "string") return null;
  const m = c.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return "#" + m[1].toLowerCase();
}

class MockScreen {
  constructor() {
    this.width = 200;
    this.height = 200;
    this.frameCalls = [];
    this.allColors = new Set();
    this.badColors = [];
    this.drawCount = 0;
    this.transforms = [];
  }
  need(v, name, call) {
    if (v === undefined || v === null || Number.isNaN(v)) {
      throw new Error(`mock screen: ${call}: missing/NaN argument '${name}'`);
    }
  }
  trackColor(c, call) {
    if (c === undefined || c === null) return;
    const hex = normColor(c);
    if (hex === null) {
      this.badColors.push({ call, color: String(c) });
    } else {
      this.allColors.add(hex);
    }
  }
  fillRect(x, y, w, h, color) {
    this.need(x, "x", "fillRect"); this.need(y, "y", "fillRect");
    this.need(w, "w", "fillRect"); this.need(h, "h", "fillRect");
    this.trackColor(color, "fillRect");
    this.drawCount++;
    this.frameCalls.push(["fillRect", x, y, w, h, color]);
  }
  drawRect(x, y, w, h, color) {
    this.need(x, "x", "drawRect"); this.need(y, "y", "drawRect");
    this.need(w, "w", "drawRect"); this.need(h, "h", "drawRect");
    this.trackColor(color, "drawRect");
    this.drawCount++;
    this.frameCalls.push(["drawRect", x, y, w, h, color]);
  }
  fillRound(x, y, w, h, color) {
    this.need(x, "x", "fillRound"); this.need(y, "y", "fillRound");
    this.need(w, "w", "fillRound"); this.need(h, "h", "fillRound");
    this.trackColor(color, "fillRound");
    this.drawCount++;
  }
  drawLine(x1, y1, x2, y2, color) {
    [x1, y1, x2, y2].forEach((v, i) => this.need(v, `arg${i}`, "drawLine"));
    this.trackColor(color, "drawLine");
    this.drawCount++;
  }
  drawText(text, x, y, size, color) {
    this.need(x, "x", "drawText"); this.need(y, "y", "drawText");
    if (typeof text !== "string") throw new Error("drawText: text not a string");
    this.trackColor(color, "drawText");
    this.drawCount++;
  }
  clear(color) {
    this.trackColor(color, "clear");
    this.drawCount++;
    this.frameCalls.push(["clear", color]);
  }
  setAlpha(a) { this.need(a, "alpha", "setAlpha"); }
  setLineWidth(w) { this.need(w, "width", "setLineWidth"); }
  setColor(c) { this.trackColor(c, "setColor"); }
  setTranslation(x, y) { this.need(x, "x", "setTranslation"); this.need(y, "y", "setTranslation"); this.transforms.push(["t", x, y]); }
  setScale(x, y) { this.need(x, "x", "setScale"); this.need(y, "y", "setScale"); this.transforms.push(["s", x, y]); }
  setRotation(r) { this.need(r, "rotation", "setRotation"); this.transforms.push(["r", r]); }
  setDrawAnchor(x, y) { this.transforms.push(["a", x, y]); }
  setFont(f) { if (typeof f !== "string") throw new Error("setFont: not a string"); }
  loadFont() {}
  isFontReady() { return 1; }
  textWidth(t, s) { return String(t).length * 8 * s; }
  setPixelated(p) { this.pixelated = p; }
  setBlending(b) { this.blending = b; }
  setLinearGradient(x1, y1, x2, y2, c1, c2) { this.trackColor(c1, "gradient"); this.trackColor(c2, "gradient"); }
  setRadialGradient(x, y, r, c1, c2) { this.trackColor(c1, "gradient"); this.trackColor(c2, "gradient"); }
  drawSprite(sprite, x, y, w, h) {
    this.need(x, "x", "drawSprite"); this.need(y, "y", "drawSprite");
    this.drawCount++;
  }
  drawSpritePart(sprite, sx, sy, sw, sh, x, y, w, h) {
    this.need(x, "x", "drawSpritePart"); this.drawCount++;
  }
  drawMap(map, x, y, w, h) { this.drawCount++; }
  fillRoundRect(x, y, w, h, r, c) { this.trackColor(c, "fillRoundRect"); this.drawCount++; }
  drawRoundRect(x, y, w, h, r, c) { this.trackColor(c, "drawRoundRect"); this.drawCount++; }
  drawRound(x, y, w, h, c) { this.trackColor(c, "drawRound"); this.drawCount++; }
  drawRoundRectShape() { this.drawCount++; }
  drawArc() { this.drawCount++; }
  fillArc() { this.drawCount++; }
  drawPolygon() { this.drawCount++; }
  fillPolygon() { this.drawCount++; }
  drawPolyline() { this.drawCount++; }
  setLineDash() {}
  setCursorVisible() {}
  newFrame() { this.frameCalls = []; }
}

// Mock msImage-like frame: pixel buffer with getRGB/setRGB in microScript style.
class MockImage {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Int32Array(w * h).fill(-1); // -1 = unset/transparent
  }
  index(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new Error(`mock image: pixel out of bounds (${x},${y}) in ${this.width}x${this.height}`);
    }
    return y * this.width + x;
  }
  setRGB(x, y, r, g, b) {
    const i = this.index(x, y);
    if (r && typeof r === "object" && r.R !== undefined) { g = r.G; b = r.B; r = r.R; }
    this.data[i] = ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
  }
  getRGB(x, y, res) {
    const i = this.index(x, y);
    const v = this.data[i];
    const out = res || {};
    out.R = v < 0 ? 0 : (v >> 16) & 255;
    out.G = v < 0 ? 0 : (v >> 8) & 255;
    out.B = v < 0 ? 0 : v & 255;
    return out;
  }
}

class MockSprite {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.frames = [new MockImage(w, h)];
    this.fps = 5;
    this.ready = 1;
  }
}



// ------------------------------------------------------------------ runner

function makeMockEnv(opts = {}) {
  const screen = new MockScreen();
  const keyboard = { press: {}, release: {} };
  const mouse = { x: 0, y: 0, pressed: 0, left: 0, right: 0, middle: 0, press: 0, wheel: 0 };
  const touch = { touching: 0, press: 0, x: 0, y: 0 };
  const sprites = {};

  const audio = {
    beep: (type, f, dur, vol) => { audio.beeps.push([type, f, dur, vol]); },
    beeps: [],
  };
  const storage = {};
  const system = { time: () => system.now, preemptive: 1, fps: 60, inputs: { keyboard: 1, mouse: 1, touch: 0 } };
  system.now = 0;

  const globalObj = {
    screen, keyboard, mouse, touch, sprites, audio, system,
    storage: {
      set: (n, v) => { storage[n] = v; return v; },
      get: (n) => (storage[n] !== undefined ? storage[n] : 0),
    },
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
    atan2: Math.atan2, abs: Math.abs, min: Math.min, max: Math.max,
    sqrt: Math.sqrt, pow: Math.pow, floor: Math.floor, ceil: Math.ceil,
    round: Math.round, exp: Math.exp, log: Math.log, sign: Math.sign,
    PI: Math.PI,
    print: (...a) => { if (opts.verbose) console.log("[ms]", ...a); },
    Number: Number,
  };
  const microvm = {
    context: {
      global: globalObj,
      meta: { print: globalObj.print },
      warnings: {
        assigning_api_variable: {},
        assignment_as_condition: {},
        using_undefined_variable: {},
        assigning_field_to_undefined: {},
      },
    },
  };
  return { screen, keyboard, mouse, touch, sprites, audio, storage, system, globalObj, microvm };
}

class MsRunner {
  constructor(opts = {}) {
    this.opts = opts;
    this.env = makeMockEnv(opts);
    this.ctx = vm.createContext(this.env.globalObj);
    const files = [
      "token.js", "tokenizer.js", "parser.js", "program.js", "routine.js",
      "compiler.js", "processor.js", "runner.js", "random.js",
    ];
    for (const f of files) {
      vm.runInContext(fs.readFileSync(path.join(VENDOR, f), "utf8"), this.ctx);
    }
    this.runner = new this.ctx.Runner(this.env.microvm);
    // Runner.init() replaces global.Number with the microScript Number object;
    // the engine tokenizer needs the real Number.parseFloat, so restore it.
    this.env.globalObj.Number = Number;
    this.sources = null;
  }

  loadSources(dir = SRC) {
    const names = fs.readdirSync(dir).filter((f) => f.endsWith(".ms")).sort();
    this.sources = names.map((n) => ({
      name: n,
      code: fs.readFileSync(path.join(dir, n), "utf8"),
    }));
    return names;
  }

  parseOnly() {
    // syntax-check each file with the v2 parser; returns array of issues
    const issues = [];
    for (const s of this.sources || []) {
      const parser = new this.ctx.Parser(s.code, s.name);
      parser.parse();
      if (parser.error_info) issues.push({ file: s.name, ...parser.error_info });
      for (const w of parser.warnings || []) {
        if (w.type === "assigning_api_variable") {
          issues.push({ file: s.name, line: w.line, error: "assigning_api_variable", column: 0 });
        }
      }
    }
    return issues;
  }

  run() {
    // Prime Runner.init() with an empty program first: init() replaces the VM
    // global Number with the microScript Number object, which breaks the
    // tokenizer's Number.parseFloat. After init, restore the real Number.
    this.runner.run("", "_prime.ms");
    this.env.globalObj.Number = Number;
    for (const s of this.sources) {
      this.runner.run(s.code, s.name);
      this.tick();
    }
  }

  start() {
    // Mirrors the microStudio runtime: run top-level code, call init once.
    this.run();
    this.call("init");
  }

  tick() {
    this.runner.tick();
    // microStudio resets per-frame edge input in keyboard.update(); emulate
    for (const k of Object.keys(this.env.keyboard.press)) this.env.keyboard.press[k] = 0;
    for (const k of Object.keys(this.env.keyboard.release)) this.env.keyboard.release[k] = 0;
    for (const k of Object.keys(this.env.keyboard)) {
      if (k === "press" || k === "release") continue;
      if (!this.env.keyboard[k]) this.env.keyboard[k] = 0;
    }
  }

  call(name, args = []) {
    this.runner.call(name, args);
    // The v2 runner is preemptive: a long call (init/worldgen) may be
    // interrupted mid-run; keep ticking until the main thread is done.
    let guard = 0;
    while (!this.runner.main_thread.processor.done && guard++ < 1000) {
      this.tick();
    }
    this.tick();
  }

  fn(name) {
    const routine = this.env.globalObj[name];
    if (!routine) throw new Error(`no global function '${name}'`);
    return this.runner.main_thread.processor.routineAsFunction(routine, this.env.microvm.context);
  }

  // advance simulated time by one frame (60fps)
  frame(seconds = 1 / 60) {
    this.env.system.now += seconds * 1000;
    this.call("update");
    this.env.screen.newFrame();
    this.call("draw");
    return this.env.screen.drawCount;
  }
}

module.exports = { MsRunner, MockScreen, MockImage, MockSprite, PALETTE, PALETTE_RGB, hexToRgb, makeMockEnv };
