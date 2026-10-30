// =====================================================================
// RASTER BARS - a Rosetta Code draft task, implemented in microScript 2.0
// https://rosettacode.org/wiki/Raster_bars
// ---------------------------------------------------------------------
// Displays metallic-looking horizontal and vertical raster bars (the
// classic C64/demoscene "copper bars" effect). Several bars sway across
// the screen on sinusoidal paths; each bar is a smooth multi-stop color
// gradient through the C64's VIC-II palette, with a bright specular
// core to fake a chrome sheen.
// =====================================================================

// ----------------------------- palette ------------------------------
// Measured "Pepto" VIC-II PAL hex values.
C64 = [
  "#000000", //  0 black
  "#FFFFFF", //  1 white
  "#68372B", //  2 red
  "#70A4B2", //  3 cyan
  "#6F3D86", //  4 purple
  "#588D43", //  5 green
  "#352879", //  6 blue
  "#B8C70F", //  7 yellow
  "#6F4F25", //  8 brown
  "#433900", //  9 dark brown
  "#9A6759", // 10 light red
  "#444444", // 11 dark gray
  "#6C6C6C", // 12 medium gray
  "#9AD284", // 13 light green
  "#6C5EB5", // 14 light blue
  "#959595"  // 15 light gray
]

// Precomputed RGB components of the palette (three parallel lists, since
// microScript objects cannot hold arrays-of-arrays keyed by hex here).
PAL_R = [0x00,0xFF,0x68,0x70,0x6F,0x58,0x35,0xB8,0x6F,0x43,0x9A,0x44,0x6C,0x9A,0x6C,0x95]
PAL_G = [0x00,0xFF,0x37,0xA4,0x3D,0x8D,0x28,0xC7,0x4F,0x39,0x67,0x44,0x6C,0xD2,0x5E,0x95]
PAL_B = [0x00,0xFF,0x2B,0xB2,0x86,0x43,0x79,0x0F,0x25,0x00,0x59,0x44,0x6C,0x84,0xB5,0x95]

// --------------------------- configuration --------------------------

VW = 320             // virtual screen width (px)
VH = 200             // virtual screen height (px)
BAR_THICKNESS = 48   // thickness of a bar (in pixels)
SPEED = 0.02         // sway speed (radians per frame)

// Horizontal bars: rest positions spread over the screen, each with its
// own phase and a VIC-II color ramp (dark edge -> core -> dark edge)
// for the metallic look. amp = sway amplitude, freq = relative speed.
H_BARS = [
  object
    phase = 0.0
    freq = 1.0
    amp = 70
    rest = 60
    colors = [11,12,15,12,11]
  end,
  object
    phase = 1.3
    freq = 1.0
    amp = 70
    rest = 20
    colors = [9,8,10,8,9]
  end,
  object
    phase = 2.6
    freq = 1.0
    amp = 70
    rest = -20
    colors = [6,14,3,14,6]
  end,
  object
    phase = 3.9
    freq = 1.0
    amp = 70
    rest = -60
    colors = [0,2,10,2,0]
  end,
  object
    phase = 5.2
    freq = 1.0
    amp = 70
    rest = -90
    colors = [0,5,13,5,0]
  end
]

// Vertical bars: the same idea, but swaying left and right.
V_BARS = [
  object
    phase = 0.6
    freq = 1.0
    amp = 90
    rest = 80
    colors = [6,14,3,14,6]
  end,
  object
    phase = 2.1
    freq = 1.0
    amp = 90
    rest = 0
    colors = [11,12,15,12,11]
  end,
  object
    phase = 3.4
    freq = 1.0
    amp = 90
    rest = -80
    colors = [0,2,10,2,0]
  end,
  object
    phase = 4.8
    freq = 1.0
    amp = 90
    rest = -40
    colors = [0,5,13,5,0]
  end
]

BG = "#100826"       // deep blue-black backdrop
T = 0                // frame counter, drives all motion

// ----------------------------- helpers ------------------------------
// Precomputed logarithmic luminance ramp for the metallic sheen: the
// core of the bar reflects a bright highlight, the edges fall to dark.
// u in [0,1] across the bar thickness -> brightness in [0,1].
SHEEN = []
for i = 0 to 99
  u = i/99
  SHEEN.push(0.15+0.85*sqrt(4*u*(1-u)))
end

// Interpolated ramp color at u in [0,1] across the bar thickness.
// colors is a list of palette indices (dark -> bright -> dark).
// Returns [r,g,b] with the metallic brightness already applied.
rampRGB = function(colors, u)
  n = colors.length-1
  p = min(n-0.0001, u*n)
  i = floor(p)
  f = p-i
  c0 = colors[i]
  c1 = colors[i+1]
  r = PAL_R[c0]+(PAL_R[c1]-PAL_R[c0])*f
  g = PAL_G[c0]+(PAL_G[c1]-PAL_G[c0])*f
  b = PAL_B[c0]+(PAL_B[c1]-PAL_B[c0])*f
  s = SHEEN[floor(u*99)]
  return [floor(r*s), floor(g*s), floor(b*s)]
end

rgb = function(c)
  return "rgb("+c[0]+","+c[1]+","+c[2]+")"
end

// -------------------- horizontal raster bar -------------------------
// One 1-pixel-tall strip per raster line, so the gradient is truly
// per-raster, like the real hardware effect.
drawHBar = function(bar, yCenter)
  half = BAR_THICKNESS/2
  for i = 0 to BAR_THICKNESS-1
    u = i/(BAR_THICKNESS-1)
    c = rampRGB(bar.colors, u)
    screen.fillRect(0, yCenter-half+i+0.5, VW, 1, rgb(c))
  end
end

// -------------------- vertical raster bar ---------------------------
drawVBar = function(bar, xCenter)
  half = BAR_THICKNESS/2
  for i = 0 to BAR_THICKNESS-1
    u = i/(BAR_THICKNESS-1)
    c = rampRGB(bar.colors, u)
    screen.fillRect(xCenter-half+i+0.5, 0, 1, VH, rgb(c))
  end
end

// ----------------------------- lifecycle ----------------------------

init = function()
  T = 0
end

update = function()
  T = T+1
end

draw = function()
  screen.clear(BG)

  // ---- horizontal bars: swaying up and down ----
  for j = 0 to H_BARS.length-1
    bar = H_BARS[j]
    y = bar.rest+bar.amp*sin(T*SPEED*bar.freq+bar.phase)
    drawHBar(bar, y)
  end

  // ---- vertical bars: swaying left and right ----
  for j = 0 to V_BARS.length-1
    bar = V_BARS[j]
    x = bar.rest+bar.amp*sin(T*SPEED*bar.freq+bar.phase)
    drawVBar(bar, x)
  end

  // Caption, in a C64 gray so it fits the look.
  screen.drawText("RASTER BARS", 0, 88, 20, C64[12])
end
