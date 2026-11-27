// Measure every look's palette against its own picture.
//
//   node dev/measure-palettes.mjs           # every preset, plus Gruvbox
//   node dev/measure-palettes.mjs watersky  # just one, by picture or look id
//
// The numbers come from a mirror of the plugin's own compositing: the picture is
// scaled into a window, the scrim and vignette are applied, the chat's blur
// filter runs when it is not zero, and the reply-panel solver then picks a tone
// and an alpha from the samples it finds behind the reading column. Printing
// that chain is the only way to know whether a palette clears AA on a picture,
// and every Reading focus level is run through it too, because each one changes
// the backdrop the panel is solved against
// because a colour that looks fine on a swatch still lands under 4.5:1 once the
// glass is over it.
//
// The plugin keeps these functions private, so this file restates them. When one
// changes in plugin.js, change it here to match. `MIRRORED` in lib/preset.mjs
// lists the three.
import fs from 'node:fs/promises'
import path from 'node:path'
import { ASSETS, MIRRORED, REPO, readTables } from './lib/preset.mjs'

const W = 1600
const H = 1000
const TARGET = 4.5          // WCAG AA for body text
const GRID = 16             // pictureBackdrop samples a 16x16 grid
const SAMPLE_SCALE = 64     // preparePictureBackdrop caps the smaller side at 64

// ── colour maths, as plugin.js does it ──────────────────────────────────────
const clamp01 = x => Math.max(0, Math.min(1, x))
const lin = v => (clamp01(v / 255) <= 0.04045 ? clamp01(v / 255) / 12.92 : ((clamp01(v / 255) + 0.055) / 1.055) ** 2.4)
const luminance = rgb => rgb.reduce((sum, v, i) => sum + lin(v) * [0.2126, 0.7152, 0.0722][i], 0)
const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const blend = (a, b, t) => [0, 1, 2].map(i => a[i] * (1 - t) + b[i] * t)
const composite = (ground, fill, alpha) => ground.map((v, i) => v + (fill[i] - v) * alpha)
const mean = samples => samples.reduce((m, rgb) => m.map((v, i) => v + rgb[i] / samples.length), [0, 0, 0])

const hexRgb = hex => {
  const h = String(hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) || 0)
}
const rgbHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const hexTriple = hex => hexRgb(hex).join(', ')
// isPaleSkin, mirrored.
const isPale = skin => luminance(hexRgb(skin.ground)) > luminance(hexRgb(skin.ink))

// pictureLayers' radial vignette, in normalised window coordinates.
const STOPS = [[0, 0], [0.35, 0.10], [0.55, 0.32], [0.72, 0.62], [0.88, 0.90], [1, 1.05]]
const falloffAt = (sx, sy) => {
  const nx = (sx / W - 0.5) / 1.25, ny = (sy / H - 0.42) / 1.15
  const radius = Math.hypot(nx, ny)
  for (let i = 1; i < STOPS.length; i += 1) {
    if (radius <= STOPS[i][0]) {
      const t = (radius - STOPS[i - 1][0]) / (STOPS[i][0] - STOPS[i - 1][0])
      return STOPS[i - 1][1] * (1 - t) + STOPS[i][1] * t
    }
  }
  return STOPS[STOPS.length - 1][1]
}

// ── reading the picture ─────────────────────────────────────────────────────
// A minimal PNG/JPEG decoder is a dependency this repo does not have, so the
// pixels come from Chromium: draw the file into a 64px canvas (the same cap
// preparePictureBackdrop uses) and read the grid back. That also means the
// numbers come from the decoder the app uses, not from a different one.
async function pictureGrid(chrome, file) {
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    const data = await fs.readFile(file)
    const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg'
    return await page.evaluate(async ({ b64, mime, cap }) => {
      const img = new Image()
      img.src = `data:${mime};base64,${b64}`
      await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail })
      const scale = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.naturalWidth * scale))
      c.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, c.width, c.height)
      const px = ctx.getImageData(0, 0, c.width, c.height)
      return { width: img.naturalWidth, height: img.naturalHeight, gridWidth: c.width, gridHeight: c.height, data: Array.from(px.data) }
    }, { b64: data.toString('base64'), mime, cap: SAMPLE_SCALE })
  } finally { await browser.close() }
}

// ── pictureBackdrop, mirrored ───────────────────────────────────────────────
// Returns the single mean sample the plugin's solver sees behind the reading
// column, which is what the panel tone and alpha are solved from. `focus` is a
// READING_FOCUS level, measured in a conversation with its blurred copy made
// (the normal path); chatGlass in plugin.js folds the look's own glass into it.
function backdropSample(source, skin, focus = null, darkSet = skin) {
  // Reading focus tones a light look's conversation with its dark set
  // (toningSet in plugin.js).
  const toning = Boolean(focus) && (focus.blur > 0 || focus.scrim > 0 || focus.band > 0 || focus.saturate !== 1 || focus.brightness !== 1)
  const set = toning && isPale(skin) ? darkSet : skin
  const deeper = hexRgb(set.deeper)
  const scrim = Number.isFinite(Number(set.scrim)) ? Number(set.scrim) : 0.31
  const posX = Number.isFinite(Number(skin.posX)) ? Number(skin.posX) : 46
  const posY = Number.isFinite(Number(skin.posY)) ? Number(skin.posY) : 45
  const scale = skin.fit === 'contain' ? Math.min(W / source.width, H / source.height) : Math.max(W / source.width, H / source.height)
  const drawnW = source.width * scale, drawnH = source.height * scale
  const offsetX = (W - drawnW) * posX / 100, offsetY = (H - drawnH) * posY / 100
  const left = (W - Math.min(W, 736)) / 2, right = (W + Math.min(W, 736)) / 2
  const blur = Number(skin.blur) || 0
  const look = blur > 0
  const on = toning
  const saturate = (look ? (Number.isFinite(Number(skin.saturate)) ? Number(skin.saturate) : 1.3) : 1) * (on ? focus.saturate : 1)
  const brightness = (look ? (Number.isFinite(Number(skin.brightness)) ? Number(skin.brightness) : 0.9) : 1) * (on ? focus.brightness : 1)
  const filter = rgb => {
    const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    return rgb.map(v => Math.max(0, Math.min(255, (luma + (v - luma) * saturate) * brightness)))
  }
  const samples = []
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const sx = (x + 0.5) * W / GRID
      const sy = (y + 0.5) * H / GRID
      if (sx < left || sx > right) continue
      const ix = (sx - offsetX) / drawnW * source.gridWidth
      const iy = (sy - offsetY) / drawnH * source.gridHeight
      let rgb = [...deeper]
      if (ix >= 0 && iy >= 0 && ix < source.gridWidth && iy < source.gridHeight) {
        const k = (Math.floor(iy) * source.gridWidth + Math.floor(ix)) * 4
        rgb = [source.data[k], source.data[k + 1], source.data[k + 2]]
      }
      // Reading focus's blurred copy carries the filter under the scrims; the
      // look's live glass filter applies it over them.
      if (on) rgb = filter(rgb)
      const f = falloffAt(sx, sy)
      rgb = blend(rgb, deeper, Math.min(1, 1 - (1 - scrim * f) * (1 - scrim * 0.70)))
      // html[data-atr-chat]::after only exists when there is something to apply
      if (look && !on) rgb = filter(rgb)
      if (look) {
        const afterRadius = Math.hypot((sx / W - 0.5) / 1.2, (sy / H - 0.4) / 0.9)
        rgb = blend(rgb, deeper, scrim * (0.45 + 0.50 * Math.min(1, afterRadius)))
      }
      if (on && focus.scrim > 0) rgb = blend(rgb, deeper, focus.scrim)
      if (on && focus.band > 0) rgb = blend(rgb, deeper, focus.band)
      samples.push(rgb)
    }
  }
  return samples.length ? [mean(samples)] : [[0, 0, 0]]
}

// ── replyMaterial / replyPanelTone, mirrored ────────────────────────────────
function panelTone(ink, tint, samples, dials, lift = [255, 255, 255]) {
  const dark = contrast(ink, tint) >= TARGET ? tint : [9 * 0.1, 13 * 0.1, 22 * 0.1]
  const pale = luminance(tint) > luminance(ink)
  const light = pale && contrast(ink, tint) >= TARGET ? tint : composite(tint, [255, 255, 255], 0.97)
  const base = contrast(ink, dark) >= contrast(ink, light) ? dark : light
  const clampRgb = rgb => rgb.map(v => Math.round(Math.min(255, Math.max(0, v))))
  const separation = rgb => Math.min(...samples.map(s => contrast(composite(s, rgb, dials.solid), s)))
  const cap = Math.min(1, Math.max(0, dials.tone))
  const stop = clampRgb(base)
  if (contrast(ink, stop) < TARGET) return stop
  // The light step goes toward the look's Edges colour, as in plugin.js.
  const up = pale ? [255, 255, 255] : luminance(lift) > luminance(base) ? lift : base
  const toward = separation(clampRgb(composite(base, up, cap))) >= separation(clampRgb(composite(base, [0, 0, 0], cap)))
    ? up : [0, 0, 0]
  let best = { tone: stop, sep: separation(stop) }
  for (let i = 1; i <= 40; i += 1) {
    const rgb = clampRgb(composite(base, toward, (i / 40) * cap))
    if (contrast(ink, rgb) < TARGET) break
    const sep = separation(rgb)
    if (sep > best.sep) best = { tone: rgb, sep }
    if (sep >= dials.edge) break
  }
  return best.tone
}

function replyMaterial(ink, tint, samples, dials, lift) {
  const before = Math.min(...samples.map(rgb => contrast(ink, rgb)))
  const color = panelTone(ink, tint, samples, dials, lift)
  const at = alpha => Math.min(...samples.map(rgb => contrast(ink, composite(rgb, color, alpha))))
  let solved = 0
  if (before < TARGET) {
    let lo = 0, hi = 1
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2
      if (at(mid) >= TARGET) hi = mid
      else lo = mid
    }
    solved = Math.ceil(hi * 1e6) / 1e6
  }
  const max = Math.max(dials.solid, dials.max)
  return { alpha: Math.min(max, Math.max(dials.solid, solved)), color, before, after: at(Math.min(max, Math.max(dials.solid, solved))) }
}

// The reply panel at one Reading focus level: the backdrop it is solved
// against, and Solid's opaque floor, as syncPanel applies it.
function panelAt(skin, source, panelDials, focus, darkSet = skin) {
  const ink = hexRgb(skin.ink)
  const dials = focus?.solid ? { ...panelDials, solid: 1, max: 1 } : panelDials
  const samples = backdropSample(source, skin, focus, darkSet)
  const material = replyMaterial(ink, hexRgb(skin.ground), samples, dials, hexRgb(skin.edge))
  const grounds = samples.map(s => composite(s, material.color, material.alpha))
  return { ratio: Math.min(...grounds.map(g => contrast(ink, g))), alpha: material.alpha }
}

// ── the surfaces a palette actually paints ──────────────────────────────────
// Each one is the worst case over the whole window, because a surface can sit
// anywhere on the picture: the chrome pane, a sidebar card, a page, your own
// message, and the reply panel solved against the reading column.
//
// The grounds are built once (every grid cell under each fill) and then every
// ink tier is contrasted against them. Computing a ground per tier is what got
// this wrong the first time: passing the text colour as the fill measures the
// text against itself.
function measure(skin, source, panelDials) {
  const deeper = hexRgb(skin.deeper), ground = hexRgb(skin.ground), ink = hexRgb(skin.ink)
  const cardTint = blend(deeper, ink, 0.04)   // sideCard: deeper mixed 4% toward ink
  // The chat pane's ground is fixed at 0.88 now (sheetCss `density`); it is no
  // longer a skin knob.
  const chrome = 0.88
  const cardA = Number.isFinite(Number(skin.card)) ? Number(skin.card) : 0.78
  const bubbleA = Number.isFinite(Number(skin.bubble)) ? Number(skin.bubble) : 0.78
  const pageA = Number.isFinite(Number(skin.page)) ? Number(skin.page) : 0.86
  const scrim = Number.isFinite(Number(skin.scrim)) ? Number(skin.scrim) : 0.31
  const posX = Number.isFinite(Number(skin.posX)) ? Number(skin.posX) : 46
  const posY = Number.isFinite(Number(skin.posY)) ? Number(skin.posY) : 45
  const scale = skin.fit === 'contain' ? Math.min(W / source.width, H / source.height) : Math.max(W / source.width, H / source.height)
  const drawnW = source.width * scale, drawnH = source.height * scale

  // Every cell of the window at full picture strength, scrim and vignette on.
  const cells = []
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const sx = (x + 0.5) * W / GRID, sy = (y + 0.5) * H / GRID
      const ix = (sx - (W - drawnW) * posX / 100) / drawnW * source.gridWidth
      const iy = (sy - (H - drawnH) * posY / 100) / drawnH * source.gridHeight
      let rgb = [...deeper]
      if (ix >= 0 && iy >= 0 && ix < source.gridWidth && iy < source.gridHeight) {
        const k = (Math.floor(iy) * source.gridWidth + Math.floor(ix)) * 4
        rgb = [source.data[k], source.data[k + 1], source.data[k + 2]]
      }
      const f = falloffAt(sx, sy)
      cells.push(blend(rgb, deeper, Math.min(1, 1 - (1 - scrim * f) * (1 - scrim * 0.70))))
    }
  }
  const groundsUnder = (fill, alpha) => cells.map(cell => composite(cell, fill, alpha))
  const worstOn = (grounds, color) => Math.min(...grounds.map(g => contrast(color, g)))

  const chromeGrounds = groundsUnder(ground, chrome)
  const samples = backdropSample(source, skin)
  const material = replyMaterial(ink, ground, samples, panelDials, hexRgb(skin.edge))
  const panelGrounds = samples.map(s => composite(s, material.color, material.alpha))
  return {
    panel: { ratio: worstOn(panelGrounds, ink), alpha: material.alpha, tone: rgbHex(material.color) },
    bare: worstOn(samples, ink),
    chrome: worstOn(chromeGrounds, ink),
    card: worstOn(groundsUnder(cardTint, cardA), ink),
    bubble: worstOn(groundsUnder(hexRgb(skin.bubbleTint), bubbleA), ink),
    page: worstOn(groundsUnder(ground, pageA), ink),
    accentText: contrast(deeper, hexRgb(skin.accent)),
    tiers: Object.fromEntries(['ink2', 'ink3', 'quiet', 'ink4', 'link', 'code', 'quote']
      .map(k => [k, worstOn(chromeGrounds, hexRgb(skin[k]))])),
    cardTiers: Object.fromEntries(['ink2', 'ink3', 'ink4']
      .map(k => [k, worstOn(groundsUnder(cardTint, cardA), hexRgb(skin[k]))])),
    // Kept so a failing tier can be solved against the same grounds it failed on.
    tierGround: chromeGrounds
  }
}

// The nearest colour that clears `bar` on these grounds: the tier blended toward
// the look's own ink, the smallest step that gets there. Moving toward ink keeps
// the tier in its palette's hue and keeps the tiers in order, since every one of
// them moves toward the same colour. Returns null when even the ink falls short.
function nearestClearing(color, ink, grounds, bar) {
  const worst = rgb => Math.min(...grounds.map(g => contrast(rgb, g)))
  if (worst(color) >= bar) return color
  if (worst(ink) < bar) return null
  let lo = 0, hi = 1
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2
    if (worst(blend(color, ink, mid)) >= bar) hi = mid; else lo = mid
  }
  // Rounding to hex can land a hair under; step until the hex itself clears.
  let out = hexRgb(rgbHex(blend(color, ink, hi)))
  for (let t = hi; worst(out) < bar && t < 1; t = Math.min(1, t + 0.002)) out = hexRgb(rgbHex(blend(color, ink, t)))
  return out
}

// ── code blocks ─────────────────────────────────────────────────────────────
// The text colours of the app's syntax themes. Dark: Shiki's github-dark-dimmed.
// The app owns them; the plugin only chooses the ground behind them (the look's
// `deeper`, opaque) and how much they are brightened (CODE_BLOCK.lift). If the
// app changes its theme, update this list.
const SYNTAX = {
  text: '#adbac7', comment: '#768390', keyword: '#f47067', constant: '#6cb6ff',
  variable: '#f69d50', function: '#dcbdfb', tag: '#8ddb8c', string: '#96d0ff', invalid: '#ff938a'
}
// The same for light mode: `github-light-default`, with the comment grey the
// app swaps in. Nothing brightens these.
const SYNTAX_LIGHT = {
  text: '#1f2328', comment: '#57606a', keyword: '#cf222e', constant: '#0550ae',
  variable: '#953800', function: '#8250df', tag: '#116329', string: '#0a3069', invalid: '#82071e'
}
// The faintest syntax colour on this look's code ground.
function codeBlock(skin, lift) {
  const ground = hexRgb(skin.deeper)
  const light = isPale(skin)
  return Object.entries(light ? SYNTAX_LIGHT : SYNTAX)
    .map(([name, hex]) => ({ name, ratio: contrast(hexRgb(hex).map(v => Math.min(255, v * (light ? 1 : lift))), ground) }))
    .reduce((worst, next) => (next.ratio < worst.ratio ? next : worst))
}

// The text tiers again on a sidebar card, where the faintest ones (labels,
// timestamps) sit over the brightest passage the card can cross.
const CARD_TIERS = ['ink2', 'ink3', 'ink4']

// ── output ──────────────────────────────────────────────────────────────────
// The bar is Gruvbox's own numbers, not the WCAG minimum, for the faint tiers:
// they are labels and timestamps, and the shipped look is what "quiet enough,
// still readable" has meant in this plugin since the beginning.
//
// It is Gruvbox's hierarchy, not its absolute ratios. A look over a brighter
// picture has a lighter worst-case ground, so its body text reaches less than
// Gruvbox's does; holding its quiet tiers to Gruvbox's absolute numbers then
// demands that ink2 match the body text, which erases the hierarchy the tiers
// exist for. So each tier's bar is Gruvbox's ratio scaled by how this look's
// body text compares to Gruvbox's, and never more than Gruvbox's own number.
const tierBar = (base, m, t) => Math.min(base.tiers[t], base.tiers[t] * m.chrome / base.chrome)
const TIER_NAMES = ['ink2', 'ink3', 'quiet', 'ink4', 'link', 'code', 'quote']
const pad = (s, n) => String(s).padEnd(n)
const num = v => (v ?? 0).toFixed(2)

async function main() {
  const only = process.argv[2]
  const { findChrome } = await import('./lib/preset.mjs')
  const { LOOK_PRESETS, SKIN_DEFAULTS, PANEL_DEFAULTS, READING_FOCUS, CODE_BLOCK, GRUVBOX_LIGHT } = await readTables()
  const chrome = await findChrome()

  // Gruvbox is the baseline every other look is judged against.
  const gruvbox = { ...SKIN_DEFAULTS, image: 'assets/charles-william-wyllie-the-backwater.jpg' }
  // Every look twice: its dark set, then its light one over the same picture.
  const dark = [
    { id: 'gruvbox', label: 'Gruvbox', skin: gruvbox },
    ...Object.entries(LOOK_PRESETS).map(([id, p]) => ({ id, label: p.name, skin: { ...SKIN_DEFAULTS, ...p.skin } }))
  ]
  const looks = [
    ...dark,
    ...dark.map(l => ({ ...l, light: true, darkSet: l.skin, label: `${l.label} light`, skin: { ...l.skin, ...GRUVBOX_LIGHT, ...(LOOK_PRESETS[l.id]?.light || {}) } }))
  ].filter(l => !only || l.id === only || l.label.toLowerCase().startsWith(only.toLowerCase()) || path.basename(l.skin.image) === only)

  if (!looks.length) {
    console.error(`no look matches "${only}". Looks: ${['gruvbox', ...Object.keys(LOOK_PRESETS)].join(', ')}`)
    process.exit(2)
  }

  const rows = []
  for (const look of looks) {
    const file = path.join(ASSETS, path.basename(String(look.skin.image)))
    try { await fs.access(file) } catch {
      console.error(`${look.label}: ${path.basename(file)} is not in assets/, so it cannot be measured. Skipping.`)
      continue
    }
    const source = await pictureGrid(chrome, file)
    const focus = Object.fromEntries(Object.entries(READING_FOCUS).map(([level, f]) => [level, panelAt(look.skin, source, PANEL_DEFAULTS, f, look.darkSet)]))
    rows.push({ ...look, file: path.basename(file), m: measure(look.skin, source, PANEL_DEFAULTS), focus })
  }

  const base = rows.find(r => r.id === 'gruvbox' && !r.light)?.m
  console.log(`\nWorst case per surface, over the whole window (WCAG AA is ${TARGET}:1)`)
  console.log(`${pad('look', 16)}${pad('picture', 18)}${pad('panel', 7)}${pad('chrome', 8)}${pad('card', 7)}${pad('bubble', 8)}${pad('page', 7)}${pad('accent', 8)}alpha`)
  for (const r of rows) {
    const m = r.m
    console.log(`${pad(r.label, 16)}${pad(r.file, 18)}${pad(num(m.panel.ratio), 7)}${pad(num(m.chrome), 8)}${pad(num(m.card), 7)}${pad(num(m.bubble), 8)}${pad(num(m.page), 7)}${pad(num(m.accentText), 8)}${num(m.panel.alpha)}`)
  }

  console.log(`\nFaint text tiers on the chrome pane, as ratio/bar (the bar is Gruvbox's hierarchy, scaled to the look's own body text)`)
  console.log(`${pad('look', 16)}${TIER_NAMES.map(t => pad(t, 12)).join('')}`)
  for (const r of rows) console.log(`${pad(r.label, 16)}${TIER_NAMES.map(t => pad(base && !r.light ? `${num(r.m.tiers[t])}/${num(tierBar(base, r.m, t))}` : num(r.m.tiers[t]), 12)).join('')}`)

  console.log(`\nFaint text on a sidebar card, and the faintest syntax colour in a code block`)
  console.log(`${pad('look', 16)}${CARD_TIERS.map(t => pad(t, 12)).join('')}code block`)
  for (const r of rows) {
    r.code = codeBlock(r.skin, CODE_BLOCK.lift)
    console.log(`${pad(r.label, 16)}${CARD_TIERS.map(t => pad(num(r.m.cardTiers[t]), 12)).join('')}${num(r.code.ratio)} (${r.code.name})`)
  }

  const levels = Object.keys(READING_FOCUS)
  console.log(`
Ink on the reply panel at each Reading focus level, in a conversation, as ratio (panel alpha)`)
  console.log(`${pad('look', 16)}${levels.map(l => pad(l, 14)).join('')}`)
  for (const r of rows) console.log(`${pad(r.label, 16)}${levels.map(l => pad(`${num(r.focus[l].ratio)} (${num(r.focus[l].alpha)})`, 14)).join('')}`)

  // Fail only on things that are bugs rather than taste: body text below AA, or
  // a tier that has fallen under the shipped look's own value.
  const problems = []
  const suggestions = []
  for (const r of rows) {
    if (r.m.panel.ratio < TARGET) problems.push(`${r.label}: ink on the reply panel is ${num(r.m.panel.ratio)}:1, under AA`)
    if (r.m.chrome < TARGET) problems.push(`${r.label}: ink on the chrome pane is ${num(r.m.chrome)}:1, under AA`)
    if (r.code.ratio < TARGET) problems.push(`${r.label}: ${r.code.name} in a code block is ${num(r.code.ratio)}:1, under AA`)
    for (const [level, f] of Object.entries(r.focus)) {
      if (f.ratio < TARGET) problems.push(`${r.label}: ink on the reply panel at Reading focus ${level} is ${num(f.ratio)}:1, under AA`)
    }
    // A light set has no shipped look to be judged against, so every tier of it
    // is held to AA, on the chrome pane and on a sidebar card, and so are the
    // accent's label and your own messages.
    if (r.light) {
      const held = [
        ...TIER_NAMES.map(t => [`${t} on the chrome pane`, r.m.tiers[t]]),
        ...CARD_TIERS.map(t => [`${t} on a sidebar card`, r.m.cardTiers[t]]),
        ['text on the accent', r.m.accentText], ['ink on your message', r.m.bubble], ['ink on a page', r.m.page]
      ]
      for (const [what, ratio] of held) if (ratio < TARGET) problems.push(`${r.label}: ${what} is ${num(ratio)}:1, under AA`)
      continue
    }
    if (r.id === 'gruvbox' || !base) continue
    for (const t of TIER_NAMES) {
      const bar = tierBar(base, r.m, t)
      if (r.m.tiers[t] + 0.02 < bar) {
        problems.push(`${r.label}: ${t} is ${num(r.m.tiers[t])}:1, under its bar of ${num(bar)}:1`)
        const fix = nearestClearing(hexRgb(r.skin[t]), hexRgb(r.skin.ink), r.m.tierGround, bar)
        suggestions.push(`${r.label}: ${t} ${r.skin[t]} -> ${fix ? rgbHex(fix) : '(even the ink falls short; change the ground)'}`)
      }
    }
  }
  if (problems.length) {
    console.log('\nBelow the bar:')
    for (const p of problems) console.log(`  ${p}`)
    if (suggestions.length) {
      console.log('\nNearest colours that clear it (each tier blended toward its own ink):')
      for (const line of suggestions) console.log(`  ${line}`)
    }
    process.exitCode = 1
  } else {
    console.log('\nEvery look clears AA on the reading column. Dark faint tiers keep Gruvbox\'s hierarchy and light ones clear AA.')
  }
  console.log(`\nThe panel solver this mirrors: ${MIRRORED.join(', ')} (grep these in plugin.js).`)
  console.log(`Run from ${REPO}.`)
}

main().catch(error => { console.error(String(error)); process.exit(2) })
