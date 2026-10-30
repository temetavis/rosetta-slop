// Headless test for the Raster bars demo: runs init/update/draw over
// several frames, saves PNG snapshots, and asserts the effect's
// semantics (bars move, gradients are smooth and metallic, every drawn
// color is well-formed).

const fs = require("fs");
const path = require("path");
const { MsRunner } = require("../tools/msrun");
const { renderFrame, parseColor } = require("../tools/snapshot");

const ROOT = path.resolve(__dirname, "..");
const SNAP = path.join(ROOT, "test", "snapshots");
fs.mkdirSync(SNAP, { recursive: true });

const r = new MsRunner({});
r.loadSources();

// ---- parse check ----
const issues = r.parseOnly();
if (issues.length) {
  console.error("PARSE ISSUES:", JSON.stringify(issues, null, 2));
  process.exit(1);
}
console.log("parse OK");

r.start();

// ---- helpers --------------------------------------------------------
function frameCalls() {
  r.env.screen.newFrame();
  r.env.screen.drawCount = 0;
  r.call("update");
  r.call("draw");
  return r.env.screen.frameCalls;
}

function snap(name) {
  const calls = frameCalls();
  renderFrame(calls, 2, path.join(SNAP, name + ".png"));
  console.log(`snapshot ${name}: ${calls.length} draw calls`);
  return calls;
}

function stripsOf(calls) {
  return calls.filter((c) => c[0] === "fillRect" && (c[3] === 1 || c[4] === 1));
}

// Every drawn color must parse as a valid rgb()/hex color.
function assertColorsValid(calls, label) {
  const bad = [];
  for (const c of calls) {
    const col = c[0] === "clear" ? c[1] : c[c.length - 1];
    if (col === undefined) continue;
    if (!parseColor(col)) bad.push(col);
  }
  if (bad.length) {
    console.error(`${label}: malformed colors:`, bad.slice(0, 5));
    process.exit(1);
  }
}

// ---- run ------------------------------------------------------------

// Frame 0: initial state.
let calls = snap("01_start");
assertColorsValid(calls, "start");

// Bar centers must move between frames -> the effect animates.
function hBarYs(calls) {
  return stripsOf(calls)
    .filter((c) => c[3] === 320)
    .map((c) => c[2])
    .sort((a, b) => a - b);
}

const y0 = hBarYs(calls);
for (let i = 1; i < 30; i++) r.frame();
calls = snap("02_after_30_frames");
assertColorsValid(calls, "moved");
const y1 = hBarYs(calls);
if (y0.length !== y1.length || y0.length === 0) {
  console.error("expected the same nonzero number of horizontal strips each frame", y0.length, y1.length);
  process.exit(1);
}
const moved = y0.some((v, i) => Math.abs(v - y1[i]) > 1);
if (!moved) {
  console.error("horizontal bars did not move between frames");
  process.exit(1);
}

// After ~half a sway period, bars should be measurably elsewhere.
for (let i = 0; i < 60; i++) r.frame();
calls = snap("03_after_90_frames");
assertColorsValid(calls, "later");

// ---- gradient smoothness: metallic ramp ---------------------------------
// For one horizontal bar, successive strips must change color gradually
// (per-raster gradient): max channel delta between adjacent strips small.
function maxAdjDelta(calls) {
  const strips = stripsOf(calls).filter((c) => c[3] === 320 && c[4] === 1);
  let worst = 0;
  for (let i = 1; i < strips.length; i++) {
    const a = parseColor(strips[i - 1][5]);
    const b = parseColor(strips[i][5]);
    if (!a || !b) continue;
    if (Math.abs(strips[i][2] - strips[i - 1][2]) > 1.5) continue; // adjacent within a bar only
    const d = Math.max(
      Math.abs(a[0] - b[0]),
      Math.abs(a[1] - b[1]),
      Math.abs(a[2] - b[2])
    );
    if (d > worst) worst = d;
  }
  return worst;
}
const delta = maxAdjDelta(calls);
console.log("max adjacent strip channel delta:", delta);
if (delta > 40) {
  console.error("gradient is not smooth (metallic ramp broken?)");
  process.exit(1);
}

// ---- vertical bars exist too --------------------------------------------
const vStrips = stripsOf(calls).filter((c) => c[4] === 200 && c[3] === 1);
if (vStrips.length === 0) {
  console.error("no vertical raster bars drawn");
  process.exit(1);
}
console.log("vertical bar strips:", vStrips.length);

console.log("ALL TESTS PASSED");
