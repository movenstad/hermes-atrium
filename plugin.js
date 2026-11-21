/**
 * Hermes Atrium — a better UI for Hermes Agent, over a painting of your own.
 *
 * Loaded as a RUNTIME plugin from <HERMES_HOME>/desktop-plugins/hermes-atrium/plugin.js:
 * plain ESM, imports rewritten to the app's SDK/react shims, registered through
 * the same contribution areas the built-in UI uses. Nothing here forks the app,
 * so an update cannot revert it.
 *
 * This build is the two-look edition: **Gruvbox** (a painting behind tinted
 * glass) and **Custom** (the same machinery driven by hermes-atrium-theme.json). There
 * is no weather, no feed and no network access of any kind: nothing leaves the
 * computer, ever.
 *
 * Each feature rides the cheapest existing mechanism:
 *   appearance        -> contributed themes (one stable "Hermes Atrium" entry whose
 *                        colours follow the chosen look) + CSS over the app
 *   reply panels      -> five live dials that solve a panel tone against the
 *                        picture behind the reading column (§2)
 *   snippet cards     -> a `::snippet{...}` transcript directive (copy/pin)
 *   calmer chat       -> CSS over the app's own surfaces, plus small observers
 *                        for folding finished work, tabs and the status panel
 *
 * CONTENTS (search for the tag, e.g. "══ §5"):
 *   §1  SETUP, SKIN, PAINTING & MATERIALS
 *   §2  REPLY PANELS (tone solver) & STATUS STACK FILLETS
 *   §3  SIDEBAR SWITCH HOOKS
 *   §4  APP CSS (sheetCss: layout, glass material, every surface)
 *   §5  APP MOTION (always-on interface animation)
 *   §6  PAINTING, THEMES & ACCENT
 *   §7  SNIPPET CARDS & LOOK CHIP
 *   §8  PLUGIN REGISTRATION (register: settings, timers, observers)
 */

import { atom, Button, Codicon, host, ListRow, requestTheme, SegmentedControl, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, setAccentOverride, ToggleRow, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

// ══ §1 SETUP, SKIN, PAINTING & MATERIALS ═══════════════════════════════════

const THEMES_AREA = 'themes'
const DIRECTIVE_AREA = 'transcript.directives'

const STORE_KEYS = { auto: 'auto', pins: 'pins', tint: 'tint', sky: 'sky', chrome: 'chrome', replyGround: 'replyGround', panel: 'panel', look: 'look', margins: 'margins', collapseWork: 'collapseWork', motion: 'motion', statusDock: 'statusDock', statusDockOpen: 'statusDockOpen', statusPin: 'statusPin', shelf: 'shelf', library: 'library', libraryOpen: 'libraryOpen', skin: 'skin', skinImage: 'skinImage', home: 'home', homeCard: 'homeCard', recents: 'recents' }

// write an attribute only when its value changes: an identical write still queues a
// mutation record, and every observer wakes up for it
const put = (el, name, value) => { if (el && el.getAttribute(name) !== value) el.setAttribute(name, value) }
const putData = (el, key, value) => { if (el && el.dataset[key] !== value) el.dataset[key] = value }
const putText = (el, value) => { if (el && el.textContent !== value) el.textContent = value }
// ── Gruvbox ──────────────────────────────────────────────────────────────────
// Dressed from gruvbox's own element table, not from "brown and orange". Every
// role below maps onto a named highlight group in morhetz/gruvbox (dark, medium
// contrast), so the app reads the way the colorscheme reads:
//
//   Normal        fg1 on bg0        -> body text on the reading ground
//   Comment       gray, italic      -> folds, timestamps, tertiary labels
//   Visual        bg3               -> selection
//   VertSplit     bg3               -> borders
//   Pmenu         fg1 on bg2        -> user bubble, menus
//   PmenuSel      bg2 on blue, bold -> selected row
//   CursorLine    bg1               -> hover / raised surface
//   CursorLineNr  yellow on bg1     -> focus ring
//   Search        yellow, inversed  -> ring / find
//   IncSearch     orange            -> the thing the eye should land on
//   Title         bold green        -> headings
//   Underlined    blue, underline   -> links
//   Constant      purple            -> numbers, literals, inline code
//   String        green             -> strings
//   Type          yellow            -> types
//   PreProc       aqua              -> quotes / preprocessor
//   Special       orange            -> highlights
//   Statement     red               -> errors, destructive, keywords
//   LineNr        bg4               -> hairlines
//   Folded        gray on bg1, italic
//
// The painting is the ground under all of it: 4096×2428, its own bytes, no
// resize and no re-encode. Panels are gruvbox surfaces at high alpha — tinted
// glass rather than a clear pane — because fg1 on bg0 is a 9.5:1 pair and that
// is the only way prose stays readable over a picture with real highlights.
const GROUND_THEME = 'hermes-atrium-gruvbox'
const GRUVBOX_ACCENT = '#fe8019'
// Resolved at startup from wherever the plugin is installed (assets/ in a
// clone, or next to plugin.js); see resolvePluginFiles.
let PAINTING_URL = 'data:,'
const PAINTING_FILE = 'gruvbox.jpg'

// The palette, verbatim from gruvbox.vim's `s:gb` dictionary.
const GB = {
  bg0h: [29, 32, 33], bg0: [40, 40, 40], bg0s: [50, 48, 47], bg1: [60, 56, 54],
  bg2: [80, 73, 69], bg3: [102, 92, 84], bg4: [124, 111, 100],
  gray: [146, 131, 116], fg0: [251, 241, 199], fg1: [235, 219, 178], fg2: [213, 196, 161],
  fg3: [189, 174, 147], fg4: [168, 153, 132],
  red: '#fb4934', green: '#b8bb26', yellow: '#fabd2f', blue: '#83a598',
  purple: '#d3869b', aqua: '#8ec07c', orange: '#fe8019'
}
const gbA = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
// Gruvbox's own bg ladder is nearly neutral, which over a painting reads grey.
// These are the same values pushed toward the river in the picture: equal or
// lower luminance than bg0, but with hue and chroma, so the panes stay dark
// while reading as deep green glass instead of soot. Deliberately outside the
// palette.
const RIVER = { deep: [13, 23, 19], pane: [19, 32, 26], card: [27, 43, 35], bubble: [38, 58, 46] }
const RIVER_EDGE = '#466553'

// ── The skin, as data ───────────────────────────────────────────────────────
// Everything below is what the editor writes: the artwork, how the glass sits on
// it, and the panel colours. Defaults reproduce the shipped look exactly, so a
// fresh install paints what you saw before anyone touched a control.
const SKIN_DEFAULTS = {
  image: PAINTING_URL,
  fit: 'cover',
  posX: 46,
  posY: 45,
  scrim: 0.31,
  blur: 18,
  saturate: 1.3,
  brightness: 0.90,
  chrome: 0.74,
  sidebar: 0.74,
  card: 0.78,
  bubble: 0.78,
  ground: '#16261e',
  deeper: '#0c1612',
  cardTint: '#1d3328',
  bubbleTint: '#2b4636',
  edge: '#4f7360',
  accent: '#fe8019',
  ink: '#fbf1c7',
  ink2: '#ebdbb2'
}
const SKIN_SLIDERS = [
  ['scrim', 'Picture scrim', 0, 0.9, 0.01],
  ['blur', 'Glass blur (px)', 0, 40, 1],
  ['saturate', 'Glass saturation', 0.5, 2, 0.05],
  ['brightness', 'Glass brightness', 0.5, 1.1, 0.01],
  ['chrome', 'Chat pane opacity', 0.4, 1, 0.01],
  ['sidebar', 'Sidebar opacity', 0.4, 1, 0.01],
  ['card', 'Card opacity', 0.4, 1, 0.01],
  ['bubble', 'Your message opacity', 0.4, 1, 0.01]
]
const SKIN_COLORS = [
  ['ground', 'Chat ground'],
  ['deeper', 'Sidebar ground'],
  ['cardTint', 'Card'],
  ['bubbleTint', 'Your messages'],
  ['edge', 'Edges'],
  ['accent', 'Accent'],
  ['ink', 'Text'],
  ['ink2', 'Quiet text']
]
let SKIN = { ...SKIN_DEFAULTS }

// ── Gruvbox tint: the desktop through the window ───────────────────────────
// Tint replaces the painting with the desktop: one ground across the window,
// with native glass supplying blur or a wallpaper blurred once at screen size.
// Palette matching keeps every surface and text role in the wallpaper's family.
const LEGACY_GLASS_DEFAULTS = {
  ground: '#1f0b06', deeper: '#170805', cardTint: '#2c130b', bubbleTint: '#3b1a10', edge: '#5b2a1b',
  accent: '#e2704a', ink: '#edd1b3', ink2: '#d6b597', quiet: '#a8846c', link: '#7fa3bc', code: '#e6a3ac', quote: '#9db07c',
  tint: 0.92, thumb: ''
}
const GLASS_DEFAULTS = {
  ground: '#282828', deeper: '#1d2021', cardTint: '#3c3836', bubbleTint: '#504945', edge: '#665c54',
  accent: '#fe8019', ink: '#ebdbb2', ink2: '#d5c4a1', quiet: '#bdae93', link: '#83a598', code: '#d3869b', quote: '#8ec07c',
  tint: 0, thumb: ''
}
// Old Glass stored opacity; Gruvbox stores transparency so zero keeps its painting.
const migrateGruvboxTint = (look, palette) => {
  if (look !== 'glass') return null
  const n = Number(palette?.tint)
  const opacity = Number.isFinite(n) ? Math.min(0.97, Math.max(0.4, n)) : LEGACY_GLASS_DEFAULTS.tint
  return { ...LEGACY_GLASS_DEFAULTS, ...palette, tint: Number((1 - opacity).toFixed(4)) }
}
const GLASS_KEYS = Object.keys(GLASS_DEFAULTS)
let GLASS = { ...GLASS_DEFAULTS }
const setGlass = (next, defaults = GLASS_DEFAULTS) => {
  const out = { ...defaults }
  for (const key of GLASS_KEYS) {
    const v = next?.[key]
    if (key === 'tint') { const n = Number(v); if (Number.isFinite(n)) out.tint = Math.min(0.92, Math.max(0, n)) }
    else if (key === 'thumb') { if (typeof v === 'string' && v.startsWith('data:image/')) out.thumb = v }
    else if (typeof v === 'string' && SKIN_HEX.test(v.trim())) out[key] = v.trim()
  }
  GLASS = out
}
// HSL in [0,360) / [0,1] / [0,1] to '#rrggbb'
const hslHex = (h, s, l) => {
  h = ((h % 360) + 360) % 360
  const k = n => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}
const rgbHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
// The palette a picture implies: its dominant hue becomes the glass, the ink and
// the accent; the strongest hue far from it becomes links. Pure, so testable.
const glassPaletteFrom = pixels => {
  const bins = new Array(36).fill(0), sat = new Array(36).fill(0)
  let total = 0
  for (let i = 0; i + 2 < pixels.length; i += 4) {
    const [h, s, l] = rgbHsl(pixels[i], pixels[i + 1], pixels[i + 2])
    const w = s * Math.max(0, 1 - Math.abs(l - 0.5) * 2)
    const b = Math.floor(h / 10) % 36
    bins[b] += w; sat[b] += s * w; total += w
  }
  const smooth = bins.map((_, i) => bins[(i + 35) % 36] * 0.5 + bins[i] + bins[(i + 1) % 36] * 0.5)
  const top = smooth.indexOf(Math.max(...smooth))
  const hue = top * 10 + 5
  // how colourful the picture is overall (0 grey .. 1 vivid), so a grey
  // wallpaper gets grey glass rather than an invented colour
  const vivid = Math.min(1, total / (pixels.length / 4) / 0.35)
  const chroma = Math.max(0.08, (sat[top] / Math.max(bins[top], 1e-6)) * vivid)
  let far = -1, farW = 0
  smooth.forEach((w, i) => { const d = Math.min(Math.abs(i - top), 36 - Math.abs(i - top)); if (d >= 6 && w > farW) { farW = w; far = i } })
  const linkHue = far >= 0 && farW > smooth[top] * 0.08 ? far * 10 + 5 : hue + 180
  const c = x => Math.min(1, x * chroma / 0.75)
  return {
    ground: hslHex(hue, c(0.68), 0.075), deeper: hslHex(hue, c(0.7), 0.055),
    cardTint: hslHex(hue, c(0.55), 0.11), bubbleTint: hslHex(hue, c(0.5), 0.15), edge: hslHex(hue, c(0.42), 0.25),
    accent: hslHex(hue + 2, Math.max(0.35, c(0.72)), 0.6), ink: hslHex(hue + 18, c(0.62), 0.82), ink2: hslHex(hue + 18, c(0.42), 0.72),
    quiet: hslHex(hue + 14, c(0.22), 0.55), link: hslHex(linkHue, Math.max(0.2, c(0.33)), 0.63),
    code: hslHex(hue - 20, Math.max(0.25, c(0.55)), 0.75), quote: hslHex(hue + 70, Math.max(0.15, c(0.25)), 0.6)
  }
}
// The glass colours, as the host theme's tokens (menus, dialogs, inputs).
const glassGrounds = () => {
  const a = (hex, alpha) => `rgba(${hexTriple(hex)}, ${alpha})`
  return {
    background: a(GLASS.ground, 0.80), foreground: GLASS.ink, card: a(GLASS.cardTint, 0.86), cardForeground: GLASS.ink,
    muted: a(GLASS.cardTint, 0.6), mutedForeground: GLASS.ink2, popover: a(GLASS.deeper, 0.96), popoverForeground: GLASS.ink,
    primary: GLASS.accent, primaryForeground: GLASS.deeper, secondary: a(GLASS.bubbleTint, 0.7), secondaryForeground: GLASS.ink,
    accent: GLASS.accent, accentForeground: GLASS.deeper, border: GLASS.edge, input: a(GLASS.cardTint, 0.7), ring: GLASS.accent,
    destructive: '#e5482f', destructiveForeground: '#fff4ee',
    sidebarBackground: 'transparent', sidebarBorder: a(GLASS.ink, 0.09), userBubble: a(GLASS.ink, 0.05), userBubbleBorder: a(GLASS.ink, 0.1)
  }
}
// Glass reuses the skin machinery for its panels; these are its skin values.
const glassSkin = () => ({
  ...SKIN_DEFAULTS, scrim: 0, blur: 0, saturate: 1, brightness: 1,
  chrome: 0.62, sidebar: 0.5, card: 0.7, bubble: 0.8,
  ground: GLASS.ground, deeper: GLASS.deeper, cardTint: GLASS.cardTint, bubbleTint: GLASS.bubbleTint,
  edge: GLASS.edge, accent: GLASS.accent, ink: GLASS.ink, ink2: GLASS.ink2
})
// The skin comes from a hand-edited file and goes into the stylesheet as text, so
// one stray `;` or `}` would break every rule after it. Colours must be hex and
// numbers are clamped to what the sliders allow; anything else keeps its default.
const SKIN_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const setSkin = next => {
  const out = { ...SKIN_DEFAULTS }
  for (const key of Object.keys(next || {})) {
    if (!(key in SKIN_DEFAULTS)) continue
    const v = next[key]
    const slider = SKIN_SLIDERS.find(s => s[0] === key)
    if (slider) {
      const n = Number(v)
      if (Number.isFinite(n)) out[key] = Math.min(slider[3], Math.max(slider[2], n))
    } else if (SKIN_COLORS.some(c => c[0] === key)) {
      if (typeof v === 'string' && SKIN_HEX.test(v.trim())) out[key] = v.trim()
    } else if (key === 'fit') {
      if (v === 'contain' || v === 'cover') out[key] = v
    } else if (key === 'posX' || key === 'posY') {
      const n = Number(v)
      if (Number.isFinite(n)) out[key] = Math.min(100, Math.max(0, n))
    } else if (key === 'image') {
      if (typeof v === 'string' && v) out[key] = v
    }
  }
  SKIN = out
}
const skinNumber = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback)
// '#221a16' -> '34, 26, 22' (the app's neutral tokens are bare RGB triples)
const hexTriple = hex => {
  const h = String(hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) || 0).join(', ')
}
const hexRgb = hex => hexTriple(hex).split(', ').map(Number)

// Every surface Atrium paints reads these, so a look (or a user skin) is one
// set of numbers instead of a hunt through the stylesheet.
const mixHex = (a, b, t) => hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * t))
// The skin's materials, as the host theme's tokens (menus, dialogs, inputs).
const materialVars = () => {
  const tri = rgb => rgb.join(', ')
  const deep = SKIN.deeper, ground = SKIN.ground, card = SKIN.cardTint, bub = SKIN.bubbleTint
  const g = k => skinNumber(SKIN[k], 0.78)
  return [
    'html:root {',
    `  --atr-hi: ${hexTriple(SKIN.ink)};`,
    `  --atr-m-solid: rgb(${tri(mixHex(deep, ground, 0.6))});`,
    `  --atr-m-tab: rgba(${hexTriple(bub)}, 0.86);`,
    `  --atr-m-pin-a: rgba(${hexTriple(ground)}, ${(g('sidebar') * 0.68).toFixed(3)}); --atr-m-pin-b: rgba(${hexTriple(deep)}, ${(g('sidebar') * 0.78).toFixed(3)});`,
    `  --atr-m-comp-a: rgba(${hexTriple(bub)}, ${(g('chrome') * 0.62).toFixed(3)}); --atr-m-comp-b: rgba(${hexTriple(card)}, ${(g('chrome') * 0.70).toFixed(3)});`,
    `  --atr-m-bub-a: rgba(${hexTriple(bub)}, ${(g('bubble') * 0.60).toFixed(3)}); --atr-m-bub-b: rgba(${hexTriple(card)}, ${(g('bubble') * 0.68).toFixed(3)});`,
    `  --atr-m-sheet: rgba(${tri(mixHex(deep, ground, 0.5))}, ${(g('card') * 0.92).toFixed(3)});`,
    `  --atr-m-on: ${deep};`,
    '  --ui-row-active-background: var(--atr-selected, rgba(255, 255, 255, 0.10)) !important;',
    '}'
  ]
}

const gbHex = rgb => `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`

const GRUVBOX_GROUNDS = {
  // Deep green ground: the luminance of bg0_hard with the river's green in it,
  // so prose keeps its contrast while the app stops reading as grey.
  background: gbA(RIVER.pane, 0.88), foreground: gbHex(GB.fg0),
  card: gbA(RIVER.card, 0.96), cardForeground: gbHex(GB.fg0),
  muted: gbA(GB.bg1, 0.80), mutedForeground: gbHex(GB.fg3),
  popover: gbA(RIVER.deep, 0.98), popoverForeground: gbHex(GB.fg0),
  primary: GB.orange, primaryForeground: gbHex(GB.bg0h),
  secondary: gbA(RIVER.card, 0.90), secondaryForeground: gbHex(GB.fg2),
  accent: GB.orange, accentForeground: gbHex(GB.bg0h),
  border: RIVER_EDGE, input: gbA(RIVER.card, 0.95),
  ring: GB.yellow, destructive: GB.red, destructiveForeground: gbHex(GB.bg0h),
  sidebarBackground: 'transparent', sidebarBorder: RIVER_EDGE,
  userBubble: gbA(RIVER.bubble, 0.95), userBubbleBorder: RIVER_EDGE
}

// The glass material comes from bg1/bg2, so every Atrium surface (sidebar
// cards, snippet cards, composer) is a gruvbox pane. The ink ramp is gruvbox's
// own fg ladder.
const gruvboxMaterial = () => ({
  tint: hexRgb(SKIN.ground),
  tintHi: hexRgb(SKIN.bubbleTint),
  // ink3 lands on every 10-11px uppercase label in the app — section headers,
  // the status bar, the fold line, shortcuts — and gruvbox's Comment grey is
  // simply too quiet at that size over a tinted ground, so the quiet tier sits
  // at fg1. This is the one place the theme deliberately out-contrasts gruvbox.
  ink: [hexRgb(SKIN.ink), hexRgb(SKIN.ink2), gruvboxTinted() ? hexRgb(GLASS.ink2) : GB.fg2, hexRgb(SKIN.ink2)],
  night: 0.2,
  accent: SKIN.accent
})

// The painting as the ground. The scrim is what makes the glass tinted rather
// than clear: it drops the picture's peak brightness so the panels above it can
// stay translucent without letting a highlight sit under a line of prose.
const gruvboxLayers = () => {
  const scrim = skinNumber(SKIN.scrim, 0.44)
  return [
    'html::before {',
    "  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;",
    '  background-image:',
    // left: the sidebar's column of small text sits over the dress and the
    // sunlit grass; top/bottom: titlebar and composer edges.
    // fine grain: dark gradients over 8-bit colour step visibly; a faint
    // noise breaks the steps up so the falloff reads as a smooth curve
    `    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"),`,
    // one soft vignette (eased, many stops) + one even scrim: no ramps that end
    // in a visible line
    `    radial-gradient(125% 115% at 50% 42%, rgba(${hexTriple(SKIN.deeper)}, 0) 0%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.10).toFixed(3)}) 35%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.32).toFixed(3)}) 55%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.62).toFixed(3)}) 72%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.90).toFixed(3)}) 88%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 1.05).toFixed(3)}) 100%),`,
    `    linear-gradient(rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.70).toFixed(3)}), rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.70).toFixed(3)})),`,
    // the artwork itself: a custom property, so swapping the picture is one tiny
    // style element instead of rebuilding a multi-megabyte CSS string
    `    var(--atr-pic, url("${PAINTING_URL}"));`,
    `  background-size: 160px 160px, cover, cover, ${SKIN.fit === 'contain' ? 'contain' : 'cover'};`,
    `  background-position: 0 0, center, center, ${skinNumber(SKIN.posX, 46)}% ${skinNumber(SKIN.posY, 45)}%;`,
    '  background-repeat: repeat, no-repeat, no-repeat, no-repeat;',
    `  background-color: ${SKIN.deeper};`,
    '}',
    'body::before { content: none; }'
  ]
}

// Glass has no picture: the window is the picture. <body> is the one painter,
// a single tint over the native material, exactly like a terminal with
// background-opacity + background-blur. Without native glass (the setting is
// off, or the platform has none) the same tint is painted solid.
const glassLayers = () => [
  "html, html:root { background: transparent !important; background-color: transparent !important; }",
  `html:root body { background: rgba(${hexTriple(GLASS.ground)}, ${Number((1 - GLASS.tint).toFixed(4))}) !important; }`,
  `html:root:not([data-hermes-glass-on]) body { background: ${GLASS.ground} !important; }`,
  "html::before, body::before { content: none !important; }",
  "html:root [data-contrib-shell], html:root [data-slot='sidebar-wrapper'] { background-color: transparent !important; }",
]
const glassChromeCss = () => [
  "html:root {",
  `  --atr-glass-rgb: ${hexTriple(GLASS.ground)};`,
  `  --atr-glass-a: ${Number((1 - GLASS.tint).toFixed(4))};`,
  `  --ui-text-tertiary: ${GLASS.quiet} !important;`,
  `  --ui-text-quaternary: rgba(${hexTriple(GLASS.quiet)}, 0.8) !important;`,
  `  --atr-ink-3: ${GLASS.quiet} !important;`,
  // One surface, like a terminal: panels are a faint lift of the ink over the
  // same tint, never a second slab of colour, and nothing casts a shadow.
  `  --atr-side-card: rgba(${hexTriple(GLASS.ink)}, 0.035) !important;`,
  `  --atr-side-card-hi: rgba(${hexTriple(GLASS.ink)}, 0.07) !important;`,
  `  --atr-glass: rgba(${hexTriple(GLASS.ink)}, 0.035) !important;`,
  `  --atr-glass-hover: rgba(${hexTriple(GLASS.ink)}, 0.07) !important;`,
  `  --theme-neutral-card: rgba(${hexTriple(GLASS.ink)}, 0.035) !important;`,
  `  --atr-edge: rgba(${hexTriple(GLASS.ink)}, 0.09) !important;`,
  "  --atr-lift: none !important;",
  "  --atr-lift-high: none !important; --atr-lift-float: none !important; --atr-frost: none !important;",
  "}",
  // Nothing in this look needs a live blur: the OS already blurred what is
  // behind the window, and blurring our own flat tint again is pure GPU cost.
  "html:root *, html:root *::before, html:root *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }",
  // Over a busy desktop the prose shadow reads as smudge; the tint carries contrast.
  "html:root :is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message'], [data-slot='assistant-message'], [data-slot='aui_intro'], [data-slot='statusbar']) :is(p, li, td, th, dd, dt, figcaption, h1, h2, h3, span) { text-shadow: none !important; }",
  `::selection { background: rgba(${hexTriple(GLASS.accent)}, 0.38) !important; color: ${GLASS.ink} !important; }`,
  // the running dot takes the palette's accent instead of a stock blue
  "html:root :is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='ui-accent'], [aria-label*='session running' i]) {",
  `  background: ${GLASS.accent} !important; background-color: ${GLASS.accent} !important; box-shadow: 0 0 6px rgba(${hexTriple(GLASS.accent)}, 0.55) !important;`,
  "}",
  "html:root :is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='ui-accent'], [aria-label*='session running' i])::after {",
  `  box-shadow: 0 0 0 1.5px rgba(${hexTriple(GLASS.accent)}, 0.35) !important;`,
  "}",
  "* { scrollbar-color: rgba(" + hexTriple(GLASS.ink) + ", 0.16) transparent; }",
]

// The picture lives in its own style element: a 5 MB data URL must not be
// re-stringified on every clock tick.
const ensurePictureStyle = url => {
  if (typeof document === 'undefined' || !document.head) return
  let el = document.getElementById('atr-picture')
  if (!el) {
    el = document.createElement('style')
    el.id = 'atr-picture'
    document.head.appendChild(el)
  }
  const value = `:root { --atr-pic: url("${String(url).replace(/"/g, '%22')}"); }`
  if (el.textContent !== value) { el.textContent = value; pictureRevision += 1 }
}

// The image changes rarely; decode a small source grid once, then crop it to
// the reading column when the existing material rewrite asks for samples.
let pictureReady = () => {}
let pictureRevision = 0
let pictureSource = null
let pictureSourceUrl = ''
let pictureRequestUrl = ''
const preparePictureBackdrop = url => {
  // Returning to the cached picture must also invalidate a different pending
  // decode, or its late callback replaces the picture we just switched to.
  if (url === pictureSourceUrl) { pictureRequestUrl = url; return }
  if (url === pictureRequestUrl || typeof Image === 'undefined') return
  pictureRequestUrl = url
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.onload = () => {
    if (pictureRequestUrl !== url) return
    try {
      const canvas = document.createElement('canvas'), scale = Math.min(1, 64 / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      pictureSource = { url, width: image.naturalWidth, height: image.naturalHeight, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height), gridWidth: canvas.width, gridHeight: canvas.height }
      pictureSourceUrl = url
      pictureReady(url)
    } catch {
      pictureSource = { url, failed: true }
      pictureSourceUrl = url
      pictureReady(url)
    }
  }
  image.onerror = () => {
    if (pictureRequestUrl !== url) return
    pictureSource = { url, failed: true }
    pictureSourceUrl = url
    pictureReady(url)
  }
  image.src = url
}

const pictureBackdrop = (bounds, filtered = true) => {
  const source = pictureSource
  if (!source || source.url !== String(SKIN.image || PAINTING_URL) || source.failed) return [[0, 0, 0], [255, 255, 255]]
  const width = Math.max(1, window.innerWidth || 1), height = Math.max(1, window.innerHeight || 1)
  const fallback = { left: (width - Math.min(width, 736)) / (2 * width), top: 0, right: (width + Math.min(width, 736)) / (2 * width), bottom: 1 }
  const region = bounds && ['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(bounds[key])) ? bounds : fallback
  const left = Math.max(0, Math.min(1, region.left)) * width, top = Math.max(0, Math.min(1, region.top)) * height
  const right = Math.max(0, Math.min(1, region.right)) * width, bottom = Math.max(0, Math.min(1, region.bottom)) * height
  if (right <= left || bottom <= top) return [[0, 0, 0], [255, 255, 255]]
  const scale = SKIN.fit === 'contain'
    ? Math.min(width / source.width, height / source.height)
    : Math.max(width / source.width, height / source.height)
  const drawnWidth = source.width * scale, drawnHeight = source.height * scale
  const offsetX = (width - drawnWidth) * skinNumber(SKIN.posX, 46) / 100
  const offsetY = (height - drawnHeight) * skinNumber(SKIN.posY, 45) / 100
  const pixels = source.pixels.data, samples = [], deeper = hexRgb(SKIN.deeper)
  const scrim = skinNumber(SKIN.scrim, 0.31)
  const blend = (a, b, t) => [0, 1, 2].map(i => a[i] * (1 - t) + b[i] * t)
  const chat = filtered && document.documentElement.matches?.("html[data-atr-chat='1']")
  const applyBackdrop = (rgb, sx, sy) => {
    // Transparent image pixels reveal the CSS background color before either scrim.
    if (rgb.length > 3) rgb = blend(rgb, deeper, 1 - rgb[3] / 255)
    const nx = (sx / width - 0.5) / 1.25, ny = (sy / height - 0.42) / 1.15
    const radius = Math.hypot(nx, ny)
    const stops = [[0, 0], [.35, .10], [.55, .32], [.72, .62], [.88, .90], [1, 1.05]]
    let falloff = stops[stops.length - 1][1]
    for (let i = 1; i < stops.length; i += 1) if (radius <= stops[i][0]) {
      const t = (radius - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])
      falloff = stops[i - 1][1] * (1 - t) + stops[i][1] * t
      break
    }
    // CSS stacks the radial and linear picture scrims before the chat backdrop filter.
    const alpha = 1 - (1 - scrim * falloff) * (1 - scrim * 0.70)
    rgb = blend(rgb, deeper, Math.min(1, alpha))
    if (chat) {
      const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
      const sat = skinNumber(SKIN.saturate, 1.3), brightness = skinNumber(SKIN.brightness, 0.9)
      rgb = rgb.map(v => Math.max(0, Math.min(255, (luma + (v - luma) * sat) * brightness)))
    }
    // html::after paints its own radial scrim above the filtered backdrop.
    if (chat) {
      const afterRadius = Math.hypot((sx / width - 0.5) / 1.2, (sy / height - 0.4) / 0.9)
      rgb = blend(rgb, deeper, scrim * (0.45 + 0.50 * Math.min(1, afterRadius)))
    }
    return rgb
  }
  const sampleAt = (sx, sy) => {
    const ix = (sx - offsetX) / drawnWidth * source.gridWidth, iy = (sy - offsetY) / drawnHeight * source.gridHeight
    let rgba = [...deeper, 255]
    if (ix >= 0 && iy >= 0 && ix < source.gridWidth && iy < source.gridHeight) {
      const index = (Math.floor(iy) * source.gridWidth + Math.floor(ix)) * 4
      rgba = [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]
    }
    return applyBackdrop(rgba, sx, sy)
  }
  // A uniform screen grid estimates the local mean, including `contain`
  // letterbox. Extrema from a whole viewport made night glows at the edge
  // trigger a wash over otherwise readable prose in the reading column.
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
    samples.push(sampleAt(left + (x + 0.5) * (right - left) / 16, top + (y + 0.5) * (bottom - top) / 16))
  }
  return [replyMean(samples)]
}

// Session tabs (the session rows in the tree — `data-tree-tab`, workspace or
// session-tile): wide pills, the active one a flat matte block, the same
// material the suggestion cards wear. The pane tabs (Sessions / Bots) are NOT
// these; they keep their own look.
const SESSION_TAB_CSS = [
  // Top tabs: soft pills, sentence case, no rules between them. The active tab
  // is a flat matte block of the same material as the cards; the rest stay
  // quiet until hovered.
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) {",
  '  position: relative;',
  '  height: 26px !important; min-height: 26px !important; margin: 4px 1px 0 !important;',
  '  padding-inline: 4px 6px !important;',
  '  border: 0 !important; border-radius: 8px !important;',
  '  background: transparent !important; box-shadow: none !important;',
  '  color: var(--atr-ink-2, #ebdbb2) !important; opacity: 0.78;',
  '  transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease, opacity 140ms ease;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *)::before { display: none !important; }",
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) .uppercase {",
  '  text-transform: none !important; letter-spacing: 0 !important;',
  '  font-size: 12px !important; font-weight: 500 !important;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *):is(:hover, [aria-selected='true']) { opacity: 1; }",
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *):hover {",
  '  color: var(--atr-ink-1, #ebdbb2) !important;',
  '  background: rgba(var(--atr-hi), 0.06) !important;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *)[aria-selected='true'] {",
  '  color: var(--atr-ink-0, #fbf1c7) !important;',
  // The active tab wears the same matte material as the suggestion cards: one
  // flat opaque fill, no white wash, no inset ring, no drop shadow. Lifted one
  // step toward the ink so it still reads as raised on the bar.
  '  background: color-mix(in srgb, var(--atr-m-solid, rgb(17, 18, 24)) 90%, rgb(var(--atr-hi, 255, 255, 255))) !important;',
  '  box-shadow: none !important;',
  '}',
  // the + button: a quiet rounded square in line with the pills
  "button[aria-label='New session tab'] {",
  '  width: 26px !important; height: 26px !important; margin: 4px 0 0 4px !important; border-radius: 8px !important;',
  '  color: var(--atr-ink-3, #d5c4a1) !important; background: transparent !important; border: 0 !important;',
  '  transition: background-color 140ms ease, color 140ms ease, transform 140ms ease;',
  '}',
  "button[aria-label='New session tab']:hover { background: rgba(var(--atr-hi), 0.08) !important; color: var(--atr-ink-0, #fbf1c7) !important; }",
  "button[aria-label='New session tab']:active { transform: scale(0.94); }",
  "button[aria-label='New session tab'] :is(svg, i) { width: 14px !important; height: 14px !important; font-size: 14px !important; }",
  // a tab's close button: hidden until the tab is hovered or active
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) button { border-radius: 5px !important; opacity: 0; transition: opacity 120ms ease, background-color 120ms ease; }",
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *):is(:hover, [aria-selected='true']) button { opacity: 0.7; }",
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) button:hover { opacity: 1; background: rgba(var(--atr-hi), 0.10) !important; }",
  // Wider tabs: the app caps them at 12rem and sizes them to the title. Give
  // every tab a generous fixed span (Chrome-style), shrinking only when crowded.
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) { flex: 0 1 220px !important; width: 220px !important; min-width: 120px !important; max-width: 260px !important; height: 28px !important; padding-inline: 10px 6px !important; }",
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) .truncate { flex: 1 1 auto !important; min-width: 0 !important; }",
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) button[aria-label='Close'] { width: 18px !important; height: 18px !important; margin-left: 6px !important; flex: none !important; align-self: center !important; }",
  // the app hides the close slot (opacity 0, no pointer) until hover; show it on the active tab too
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *):is(:hover, [aria-selected='true']) span:has(> button[aria-label='Close']) { opacity: 1 !important; pointer-events: auto !important; z-index: 2; }",
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) .pane-tab-content { padding-right: 22px !important; }",
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) span:has(> button[aria-label='Close']) { align-items: center !important; padding-right: 6px; }",
  "[role='tab'][data-tree-tab]:not([data-atr-arc-col] *) button[aria-label='Close'] .codicon { opacity: 1 !important; visibility: visible !important; font-size: 12px !important; color: var(--atr-ink-2, #ebdbb2) !important; }",
]

// ── Refinement pass ────────────────────────────────────────────────────────
// The audit found ten different corner radii, ten font sizes, three border
// colours that were not ours, and every message group 16px wider than the column
// it sits in. This layer puts the app on one scale: four radii, one border
// colour, one hover, one focus ring, and prose that cannot overflow.
const polishCss = () => [
  // The app's ink tiers were landing on values that read as invisible against
  // this ground: secondary computed to rgb(33 3 25) (1.09:1) and quaternary to
  // 36% ink (1.01:1). Pane-tab labels, timestamps and session subtitles were
  // effectively black on black. `html:root` outranks whatever sets them later.
  'html:root {',
  // !important because the app writes these tokens inline on <html> when it
  // applies a theme, and inline declarations otherwise beat any stylesheet.
  `  --ui-text-primary: ${SKIN.ink} !important;`,
  `  --ui-text-secondary: ${SKIN.ink2} !important;`,
  `  --ui-text-tertiary: ${gruvboxTinted() ? GLASS.quiet : '#bdae93'} !important;`,
  `  --ui-text-quaternary: ${gruvboxTinted() ? GLASS.quiet : '#a89984'} !important;`,
  '}',
  // `--atr-` is the app's namespace too: it ships its own --atr-ink-2, which is
  // rgb(33 3 25) — near-black. Every rule of ours that said
  // var(--atr-ink-2, #d5c4a1) got the app's value instead of the fallback, which
  // is why pane-tab labels and timestamps stayed invisible. Reclaim the ramp.
  'html:root {',
  `  --atr-ink-0: ${SKIN.ink} !important;`,
  `  --atr-ink-1: ${SKIN.ink2} !important;`,
  `  --atr-ink-2: ${SKIN.ink2} !important;`,
  `  --atr-ink-3: ${gruvboxTinted() ? GLASS.quiet : '#d5c4a1'} !important;`,
  '}',
  ':root {',
  // One ladder, four steps: chip 4, control/row/well 8, card 12, sheet 16.
  '  --atr-r-1: 4px;',
  '  --atr-r-2: 8px;',
  '  --atr-r-3: 12px;',
  '  --atr-r-4: 16px;',
  '  --atr-r-chip: var(--atr-r-1);',
  '  --atr-r-control: var(--atr-r-2);',
  '  --atr-r-card: var(--atr-r-3);',
  // The app's utility radii are computed from `--radius-scalar`, pinned to .2
  // by its own base sheet: `rounded-xl` was 3.2px, `rounded-lg` 2.4px, while
  // Atrium drew 8-16px surfaces beside them. That is why a command well, a
  // menu and the sheet around them never read as one family. One scalar puts
  // every Tailwind radius on the same scale as the tokens below:
  //   rounded-sm 6px · rounded-md 7.5px · rounded-lg 9px · rounded-xl 12px
  //   rounded-2xl 18px · rounded-3xl 24px
  '  --radius-scalar: .75;',
  // No explicit --radius-sm/md/lg overrides: the app's base sheet already
  // derives those from the scalar, and re-declaring them (8/12/6) made
  // rounded-lg tie rounded-xl at 12. The scalar alone gives the scale above;
  // --radius stays as the app's standalone base token.
  '  --radius: 12px;',
  // Atrium's two surface aliases: cards/floating lists, and sheets.
  '  --atr-radius: var(--atr-r-3);',
  '  --atr-radius-lg: var(--atr-r-4);',
  // The painting's edge is a green hairline.
  `  --atr-hair: rgba(${hexTriple(SKIN.edge)}, 0.55);`,
  '  --atr-selected: color-mix(in srgb, var(--atr-accent, #fe8019) 14%, transparent);',
  '  --atr-ease: cubic-bezier(0.2, 0, 0, 1);',
  '}',

  // One radius per role. Buttons, inputs and rows are controls; cards and code
  // are surfaces; chips are inline. Atrium's own components (`atr-*`) opt out:
  // their sheet/card radius must not be flattened to the control radius just
  // because the host renders them as a <button> (the new-tab shelf cards were).
  "button:not([class*='rounded-full']):not([class*='atr-']), input, select, textarea, [role='button']:not([class*='rounded-full']):not([class*='atr-']), [role='tab'], [role='option'] {",
  '  border-radius: var(--atr-r-control) !important;',
  '}',
  // Search fields are the exception: the app's Input primitive draws the border,
  // fill and radius on a <span> wrapping the real <input>, so the rule above
  // only rounds the invisible inner field. The model picker's search therefore
  // kept the app's 12px radius on a 32px row and read as a pill beside 8px
  // controls. Round the wrapper to the same control radius.
  ":is(span, div):has(> input[role='searchbox']) {",
  '  border-radius: var(--atr-r-control) !important;',
  '}',
  "[data-slot='aui_message'] :is(pre, table),",
  "[data-slot='aui_message'] :is(.rounded-lg, .rounded-xl, .rounded-2xl) {",
  '  border-radius: var(--atr-r-card) !important;',
  '}',
  "[data-slot='aui_message'] :not(pre) > code {",
  '  border-radius: var(--atr-r-chip) !important;',
  '}',

  // One hairline colour everywhere a border is drawn by the app, so dividers
  // stop being three different greys.
  // `[class]` is here to outrank Tailwind's own class-level !important
  // declarations (border-white/5 and friends), which otherwise win on
  // specificity no matter how early this sheet is injected.
  // ...but never on an edge the app meant to be invisible: re-colouring
  // border-transparent drew a box around every nav row in Settings and the sidebar.
  "html body :is(div, span, button, a, li, table, th, td, input, textarea, select, section, header, footer, aside, nav)[class]:not([class*='border-transparent']):not([class*='border-destructive']):not([class*='border-red']) {",
  '  border-color: var(--atr-hair) !important;',
  '}',
  // the accent is for state, not decoration: a focused control keeps its ring
  ':focus-visible {',
  '  border-color: color-mix(in srgb, var(--atr-accent, #fe8019) 55%, transparent) !important;',
  '}',

  // Focus is visible, consistent, and only on keyboard focus.
  ':focus-visible {',
  '  outline: 2px solid color-mix(in srgb, var(--atr-accent, #fe8019) 70%, transparent);',
  '  outline-offset: 2px;',
  '}',

  // One hover, one duration. The app animates some rows and snaps others.
  "button, [role='button'], [role='tab'], [role='option'], [role='menuitem'] {",
  '  transition: background-color 120ms var(--atr-ease), color 120ms var(--atr-ease), border-color 120ms var(--atr-ease);',
  '}',
  "@media (prefers-reduced-motion: reduce) {",
  "  button, [role='button'], [role='tab'], [role='option'] { transition: none !important; }",
  '}',

  // Scrollbars: thin, tinted, no full-width gutter.
  '::-webkit-scrollbar { width: 10px; height: 10px; }',
  '::-webkit-scrollbar-track { background: transparent; }',
  '::-webkit-scrollbar-thumb {',
  '  background: color-mix(in srgb, var(--atr-ink-3, #a89984) 26%, transparent);',
  '  border: 3px solid transparent;',
  '  border-radius: 999px;',
  '  background-clip: content-box;',
  '}',
  '::-webkit-scrollbar-thumb:hover {',
  '  background: color-mix(in srgb, var(--atr-ink-3, #a89984) 44%, transparent);',
  '  background-clip: content-box;',
  '}',

  // ── Prose: rhythm, and nothing overflowing the column ────────────────────
  "[data-slot='aui_thread-content'] :is(p, li, td, th, h1, h2, h3, h4, blockquote) {",
  '  overflow-wrap: anywhere;',
  '}',
  "[data-slot='aui_thread-content'] p { margin-block: 0.7em !important; }",
  "[data-slot='aui_thread-content'] :is(h1, h2, h3, h4) {",
  '  letter-spacing: -0.011em;',
  '  margin-block: 1.15em 0.5em;',
  '  line-height: 1.3;',
  '}',
  "[data-slot='aui_thread-content'] :is(ul, ol) { padding-inline-start: 2.4em; margin-block: 0.6em; }",
  "[data-slot='aui_thread-content'] li { margin-block: 0.22em !important; }",
  "[data-slot='aui_thread-content'] li::marker { color: var(--atr-ink-3, #a89984); }",
  "[data-slot='aui_thread-content'] hr {",
  '  border: 0; border-top: 1px solid var(--atr-hair); margin-block: 1.4em;',
  '}',
  "[data-slot='aui_thread-content'] blockquote {",
  '  border-inline-start: 2px solid var(--atr-hair);',
  '  padding-inline-start: 0.9em;',
  '  margin-inline: 0;',
  '  color: var(--atr-ink-2, #d5c4a1);',
  '}',
  "[data-slot='aui_thread-content'] a {",
  '  text-underline-offset: 2px;',
  '  text-decoration-thickness: 1px;',
  '  text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);',
  '}',
  "[data-slot='aui_thread-content'] a:hover { text-decoration-color: currentColor; }",
  "[data-slot='aui_thread-content'] img { max-width: 100%; border-radius: var(--atr-r-control); }",

  // Code: one padding, one radius, one border, tabular figures in blocks.
  "[data-slot='aui_thread-content'] pre {",
  '  padding: 12px !important;',
  '  border-radius: var(--atr-r-card) !important;',
  '  border: 1px solid var(--atr-hair) !important;',
  '  line-height: 1.55 !important;',
  '  font-variant-numeric: tabular-nums;',
  '}',
  // A code card already has an edge and a fill. react-shiki nests its own pre
  // inside the wrapper pre, and both matched the rule above, so the inner one
  // drew a second border and fill inside the wrapper's padding — the
  // upside-down U-shaped seam around the code. The card is the surface; a pre
  // inside it is content, not a second surface.
  "[data-slot='aui_thread-content'] [data-slot='code-card'] pre {",
  '  border: 0 !important;',
  '  border-radius: 0 !important;',
  '  padding: 2rem 12px 12px !important;',
  '}',
  "[data-slot='aui_thread-content'] [data-slot='code-card'] pre pre {",
  '  padding: 0 !important;',
  '  background: transparent !important;',
  '}',
  "[data-slot='aui_thread-content'] :not(pre) > code {",
  '  padding: 0.12em 0.36em;',
  '  font-size: 0.92em;',
  '}',
  // A code card already has an edge and a fill. react-shiki nests its own
  // <pre class="shiki"> inside the wrapper <pre>, and both matched the rule
  // above, so the inner one drew its own border and fill inside the wrapper's
  // padding — the upside-down U-shaped seam around the code. The card is the
  // surface; a pre inside it is content, not a second surface.
  "[data-slot='aui_thread-content'] [data-slot='code-card'] pre {",
  '  border: 0 !important;',
  '  border-radius: 0 !important;',
  '}',
  "[data-slot='aui_thread-content'] [data-slot='code-card'] pre pre {",
  '  padding: 0 !important;',
  '  background: transparent !important;',
  '}',
  // The code card floats its copy chip over the block's top-right corner (20px
  // tall, 6px down). The block's own padding puts the first line underneath it,
  // so a long line runs behind the chip. Reserve the band the chip sits in.
  "[data-slot='aui_thread-content'] [data-slot='code-card'] pre {",
  '  padding-top: 2rem !important;',
  '}',

  // Tables scroll instead of pushing the column wide.
  "[data-slot='aui_thread-content'] table {",
  '  border-collapse: collapse;',
  '  width: 100%;',
  '  display: block;',
  '  overflow-x: auto;',
  '}',
  "[data-slot='aui_thread-content'] :is(th, td) {",
  '  padding: 6px 10px;',
  '  border-bottom: 1px solid var(--atr-hair);',
  '  text-align: start;',
  '}',
  "[data-slot='aui_thread-content'] th {",
  '  font-weight: 600;',
  '  color: var(--atr-ink-1, #ebdbb2);',
  '}',

  // The 16px overflow: message groups are flex children that refuse to shrink.
  "[data-slot='aui_message-group'], [data-slot='aui_turn-pair'],",
  "[data-slot='aui_message-group'] > *, [data-slot='aui_turn-pair'] > * {",
  '  max-width: 100% !important;',
  '  min-width: 0 !important;',
  '}',

  // Settings nav: the open group is shown by its children, not by a second
  // filled box above the selected child
  "html body button[data-tour][class*='bg-(--ui-bg-tertiary)'][class*='border-(--ui-stroke-tertiary)'] { background: transparent !important; border-color: transparent !important; color: var(--atr-ink-0, #fbf1c7) !important; }",
  // No orange or yellow text, anywhere: the app's accent-coloured text
  // utilities, spinners and time stamps all fall back to the ink ramp.
  "html body :is([class*='text-(--ui-accent)'], [class*='text-(--accent)'], [class*='text-primary']:not([class*='text-primary-foreground']), [class*='text-amber'], [class*='text-yellow'], [class*='text-orange'], [class*='text-(--theme-primary)'], .glyph-spinner, .glyph-spinner *) { color: var(--atr-ink-2, #cdc4b4) !important; }",
  "html body time { color: var(--atr-ink-3, #a8a092) !important; }",
  // unread badge and tab dots: no orange
  "html body div.fixed[data-atr-sbbtn] [class*='bg-primary'] { background: var(--atr-ink-1, #e2dacb) !important; color: var(--atr-m-on) !important; }",
  "[role='tab'][data-tree-tab] [class*='rounded-full'][class*='bg-'] { background: var(--atr-ink-2, #cdc4b4) !important; }",
  // Landing for an empty tab: the app only draws its intro for the very first
  // draft, so a fresh tab was a blank smear. Same wordmark, same mood.
  ':is(#atr-landing, .atr-landing-x) { position: fixed; z-index: 1; pointer-events: none; display: none; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px; opacity: 0; transition: opacity 260ms ease; container-type: inline-size; overflow: hidden; }',
  "html[data-atr-landing='1'] :is(#atr-landing, .atr-landing-x) { display: flex; opacity: 1; }",
  ':is(#atr-landing, .atr-landing-x) .atr-land-mark { font-family: Collapse, ui-serif, serif; font-size: clamp(26px, 11cqw, 112px); font-weight: 700; letter-spacing: 0.02em; line-height: 1; color: rgba(var(--atr-hi), 0.92); mix-blend-mode: plus-lighter; white-space: nowrap; }',
  ':is(#atr-landing, .atr-landing-x) .atr-land-line { font-size: 15px; color: var(--atr-ink-2, #ebdbb2); max-width: 34rem; }',
  '@keyframes atr-land-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }',
  "html[data-atr-landing='1'] :is(#atr-landing, .atr-landing-x) > * { animation: atr-land-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both; }",
  "html[data-atr-landing='1'] :is(#atr-landing, .atr-landing-x) .atr-land-line { animation-delay: 80ms; }",
  // Settings is a floating sheet, solid enough that nothing reads through it
  "div.rounded-xl[data-atr-setbox] { background: var(--atr-glass-strong) !important; border-radius: var(--atr-radius-lg) !important; box-shadow: var(--atr-lift-float) !important; isolation: isolate; }",
  "[class*='grid-cols-[13rem_minmax(0,1fr)]'] > aside { background: rgba(0, 0, 0, 0.16) !important; }",
  // focus: a soft cream ring, never the orange accent; the composer gets none
  "html body :focus-visible { outline: 1.5px solid rgba(var(--atr-hi), 0.38) !important; outline-offset: 2px; border-color: rgba(var(--atr-hi), 0.28) !important; }",
  "html body :is([data-slot='composer-rich-input'], [data-slot^='composer'] textarea, [data-slot^='composer'] [contenteditable='true'], [data-slot^='composer'] input):is(:focus, :focus-visible) { outline: none !important; box-shadow: none !important; border-color: transparent !important; }",
  "html body [data-slot='composer-surface']:focus-within { box-shadow: inset 0 0 0 1px rgba(var(--atr-hi), 0.16), var(--atr-lift, 0 8px 24px rgba(0,0,0,.3)) !important; }",
  // The composer's backing div paints `--composer-fill`, which the app mixes out
  // of --dt-card; in a light host theme that resolves to near-white, so
  // the bar read as a lighter material than the cards beside it. Give it the same
  // glass every other surface wears, in every phase — the night branch below only
  // ever covered the dark hours.
  ":is([data-slot='composer-root'], [data-slot='composer-surface'], [class~='group/composer-surface']) {",
  '  --composer-fill: color-mix(in srgb, var(--atr-tint) 88%, transparent) !important;',
  '}',
  ":is([data-slot='composer-surface'], [class~='group/composer-surface']) > div:first-child,",
  ":is([data-slot='composer-surface'], [class~='group/composer-surface']) [class*='composerInputBacking'] {",
  '  background: color-mix(in srgb, var(--atr-tint) 88%, transparent) !important;',
  '}',
  // The status bar is app chrome at the window's foot; untouched it paints the
  // theme's opaque surface and cuts a pale band across the picture.
  "[data-slot='statusbar'] {",
  '  background: color-mix(in srgb, var(--atr-tint) 74%, transparent) !important;',
  '  backdrop-filter: var(--atr-frost) !important;',
  '}',
  // a session opened through the row's own menu: the menu is the mechanism, not
  // something to watch, so it stays invisible while it is driven
  "html[data-atr-ghost-menu='1'] :is([data-radix-popper-content-wrapper], [role='menu']) { opacity: 0 !important; pointer-events: none !important; }",
  // The composer and your own messages wear the gruvbox glass, the material
  // every other surface wears (--atr-glass): a plain white wash over the
  // painting reads as a different, lighter thing than the cards beside it.
  ...(!gruvboxTinted() ? [
    "html body div[data-slot='composer-surface'][data-slot][class] { background: linear-gradient(var(--atr-m-comp-a), var(--atr-m-comp-b)) !important; backdrop-filter: blur(18px) saturate(1.25) brightness(1.08) !important; box-shadow: inset 0 1px 0 rgba(var(--atr-hi), 0.07), inset 0 0 0 1px rgba(var(--atr-hi), 0.06), 0 10px 30px rgba(0, 0, 0, 0.22) !important; }",
    "html body :is(.composer-human-message, [class*='composer-human-message']):not(.composer-human-message-container) { background: linear-gradient(var(--atr-m-bub-a), var(--atr-m-bub-b)) !important; box-shadow: inset 0 1px 0 rgba(var(--atr-hi), 0.07), inset 0 0 0 1px rgba(var(--atr-hi), 0.06), 0 6px 20px rgba(0, 0, 0, 0.16) !important; border-color: transparent !important; }",
  ] : []),
  // No live backdrop blur on a full-height sheet: the frosted glass it sat
  // behind is already baked, and the 28px pass was the most expensive one left.
  "div.rounded-xl[data-atr-setbox] { backdrop-filter: none !important; }",

  // Two text roles still resolved to a colour the theme never chose — the pane
  // tab label and the sidebar timestamps both computed to rgb(33 3 25), which is
  // 1.1:1 on this ground. Named explicitly rather than guessed at the token.
  "[data-slot='pane-tab'] :is(span, div) {",
  '  color: var(--atr-ink-2, #d5c4a1) !important;',
  '}',
  "[data-slot='pane-tab']:is([aria-selected='true'], [data-active='true']) :is(span, div) {",
  '  color: var(--atr-ink-0, #fbf1c7) !important;',
  '}',
  "[data-slot='sidebar'] time, time[tooltip-trigger] {",
  '  color: var(--atr-ink-3, #a89984) !important;',
  '}',

  "[role='tab'][data-tree-tab]:not([data-slot='pane-tab']) :is(span, div) {",
  '  text-overflow: ellipsis;',
  '}',

  // Floating surfaces: menus, dialogs, popovers and tooltips share one radius
  // and one shadow, instead of each carrying its own.
  ":is([role='menu'], [role='dialog'], [role='listbox'], [role='tooltip'], [data-slot*='popover']) {",
  '  border-radius: var(--atr-r-card) !important;',
  '}',
  ":is([role='tooltip']) {",
  '  border-radius: 6px !important;',
  '  padding: 4px 8px !important;',
  '  font-size: 11px !important;',
  '}',
  ":is([role='menu'], [role='dialog'], [role='listbox']) {",
  '  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42), 0 2px 6px rgba(0, 0, 0, 0.28) !important;',
  '}',
]

// Adorned fields have one visual owner: the wrapper, never the inner input.
// SearchField currently has no data-slot; its field-sizing utility identifies
// the shared component without tying the fix to radio, placeholder or locale.
const groupedFieldCss = () => {
  const group = ":is([data-slot='input-group'], [data-slot='command-input-wrapper'], :is(span, div):has(> input[role='searchbox']), :is(span, div):has(> input[class*='field-sizing:content']))"
  return [
    // Include the focused states and wrapper class to beat both the global
    // focus rule and dialog/overlay form styling, including !important fills.
    'html body ' + group + '[class] > input[class]:not([type=checkbox]):not([type=radio]):not([type=range]):not(:focus),',
    'html body ' + group + '[class] > input[class]:not([type=checkbox]):not([type=radio]):not([type=range]):is(:focus, :focus-visible) {',
    '  background: transparent !important;',
    '  border: 0 !important;',
    '  border-radius: 0 !important;',
    '  box-shadow: none !important;',
    '  outline: none !important;',
    '}',
    'html body ' + group + '[class]:has(> input:focus-visible) {',
    '  border-radius: var(--atr-r-control, 8px) !important;',
    '  outline: 1.5px solid rgba(var(--atr-hi, 255, 255, 255), 0.38) !important;',
    '  outline-offset: 2px;',
    '  box-shadow: none !important;',
    '}',
    // Keep the single focus boundary visible in Windows high contrast too.
    '@media (forced-colors: active) {',
    '  html body ' + group + '[class]:has(> input:focus-visible) { outline-color: Highlight !important; }',
    '}',
  ]
}

// The prose layer wears the syntax side of gruvbox: headings are Title (bold
// green), links are Underlined (blue), inline code is Constant (purple) on
// bg0_hard, quotes are PreProc (aqua), hairlines are LineNr (bg4), selection is
// Visual (bg3). This is the half of the colorscheme a chat window actually uses.
const gruvboxTextCss = () => [
  /* one soft-focus layer for the reading column: the picture stays as colour
     and light, not as detail competing with letterforms */
  // One glass band across the WHOLE window: edge to edge, left side of the
  // screen to the right, so there is no vertical seam anywhere — the panes are
  // translucent, so the blur simply shows through all of them. Only the top and
  // bottom fade, because those are the only edges that are actually visible.
  //
  // It hangs off html::after rather than a thread element precisely because a
  // thread element's width ends at the pane boundary, and that boundary is the
  // hard line we are trying to get rid of.
  ...(gruvboxTinted() ? [] : [
  "html[data-atr-chat='1']::after {",
  "  content: '';",
  '  position: fixed; left: 0; right: 0; top: 0; bottom: 0; z-index: -1;',
  '  pointer-events: none;',
  `  background: radial-gradient(120% 90% at 50% 40%, rgba(${hexTriple(SKIN.deeper)}, ${(skinNumber(SKIN.scrim, 0.44) * 0.45).toFixed(3)}), rgba(${hexTriple(SKIN.deeper)}, ${(skinNumber(SKIN.scrim, 0.44) * 0.95).toFixed(3)}));`,
  `  backdrop-filter: blur(${skinNumber(SKIN.blur, 16)}px) saturate(${skinNumber(SKIN.saturate, 1.35)}) brightness(${skinNumber(SKIN.brightness, 0.84)});`,
  '}',
  "html[data-atr-chat='1'][data-atr-clip='1']::after { clip-path: var(--atr-chat-clip); }",
  ]),
  `::selection { background: ${SKIN.edge} !important; color: ${SKIN.ink} !important; }`,
  // The tab bar floats on the picture with nothing marking where it ends. The very top of the
  // window is a touch darker, fading out under the tabs, with a faint line at the bar's foot.
  'html.dark body::after {',
  "  content: ''; position: fixed; left: 0; right: 0; top: 0; height: 54px; z-index: 40; pointer-events: none;",
  `  background: linear-gradient(rgba(${hexTriple(SKIN.ink)}, 0.07), rgba(${hexTriple(SKIN.ink)}, 0.07)) 0 37px / 100% 1px no-repeat,`,
  `    linear-gradient(rgba(${hexTriple(SKIN.deeper)}, 0.38) 0, rgba(${hexTriple(SKIN.deeper)}, 0.27) 37px, rgba(${hexTriple(SKIN.deeper)}, 0) 54px);`,
  '}',

  // Title
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) :is(h1, h2, h3, h4, h5, h6) {",
  '  color: var(--atr-ink-0, #fbf1c7) !important;',
  '}',
  // Underlined
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) a {",
  `  color: ${gruvboxTinted() ? GLASS.link : '#83a598'} !important;`,
  '  text-decoration: underline !important;',
  `  text-decoration-color: rgba(${gruvboxTinted() ? hexTriple(GLASS.link) : '131, 165, 152'}, 0.55) !important;`,
  '}',
  // Constant
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) :is(code, kbd, samp) {",
  `  color: ${gruvboxTinted() ? GLASS.code : '#d3869b'} !important;`,
  `  background: rgba(${hexTriple(SKIN.deeper)}, ${gruvboxTinted() ? 0.55 : 0.78}) !important;`,
  `  border: 1px solid ${SKIN.edge} !important;`,
  '}',
  // String / Special in blocks: the fence keeps bg0_hard, the border is bg2
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) pre {",
  `  background: rgba(${hexTriple(SKIN.deeper)}, ${gruvboxTinted() ? 0.6 : 0.90}) !important;`,
  `  border: 1px solid ${SKIN.edge} !important;`,
  `  color: ${gruvboxTinted() ? GLASS.ink : '#ebdbb2'} !important;`,
  '}',
  // PreProc
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) blockquote {",
  `  border-left: 2px solid ${gruvboxTinted() ? GLASS.quote : '#8ec07c'} !important;`,
  `  color: ${gruvboxTinted() ? GLASS.ink2 : '#d5c4a1'} !important;`,
  '}',
  // LineNr
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) hr {",
  `  border-color: ${SKIN.edge} !important;`,
  '}',
  // prose shadow: cheap insurance on the last translucent surface in the stack
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message'], [data-slot='assistant-message']) :is(p, li, td, th, dd, dt, figcaption) {",
  '  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55), 0 2px 7px rgba(0, 0, 0, 0.38);',
  '}',
  "[data-slot='aui_intro'] :is(p, h1, h2, h3, [class*='wordmark']), [data-slot='statusbar'] {",
  '  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.50), 0 2px 7px rgba(0, 0, 0, 0.32);',
  '}'
]

// Read by sheetCss, which stays a pure function of the switches.
// Custom shares Gruvbox chrome but must never inherit its desktop tint.
let LOOK_MODE = 'gruvbox'
const setLookMode = mode => { LOOK_MODE = mode === 'custom' ? 'custom' : 'gruvbox' }
const gruvboxTinted = () => LOOK_MODE === 'gruvbox' && GLASS.tint > 0

const WORK_ICONS = {
  brain: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M216,72a48,48,0,0,0-88-26.49A48,48,0,0,0,40,72v1.39a56,56,0,0,0,0,101.22V176a48,48,0,0,0,88,26.49A48,48,0,0,0,216,176v-1.39A56.09,56.09,0,0,0,248,124,56.11,56.11,0,0,0,216,72ZM120,208a32,32,0,0,1-32-32,48,48,0,0,1,32-45.26Zm0-93.26A48,48,0,0,1,88,69.26,32,32,0,0,1,120,40Zm16-74.74A32,32,0,0,1,168,69.26a48,48,0,0,1-32,45.48Zm0,93.26A48,48,0,0,1,168,176a32,32,0,0,1-32,32Z"/></svg>',
  terminal: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-91,94.25-40,32a8,8,0,1,1-10-12.5L107.19,128,75,102.25a8,8,0,1,1,10-12.5l40,32a8,8,0,0,1,0,12.5ZM176,168H136a8,8,0,0,1,0-16h40a8,8,0,0,1,0,16Z"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M229.66,218.34l-50.06-50.07a88,88,0,1,0-11.32,11.31l50.06,50.07a8,8,0,0,0,11.32-11.31ZM112,184a72,72,0,1,1,72-72A72.08,72.08,0,0,1,112,184Z"/></svg>',
  tool: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M232,96a72,72,0,0,1-100.94,66L79,222.22c-.12.14-.26.29-.39.42a32,32,0,0,1-45.26-45.26c.14-.13.28-.27.43-.39L94,124.94a72.07,72.07,0,0,1,83.54-98.78,8,8,0,0,1,3.93,13.19L144,80l5.66,26.35L176,112l40.65-37.52a8,8,0,0,1,13.19,3.93A72.6,72.6,0,0,1,232,96Z"/></svg>',
  file: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM152,88V44l44,44Z"/></svg>'
}

// ══ §2 REPLY PANELS (tone solver) & STATUS STACK FILLETS ═══════════════════

// ── Reply panels ───────────────────────────────────────────────────────────
// WHERE the backdrop is painted matters. A `body::before` layer sits in normal
// paint order and a positioned app shell can cover it. The document's own
// background on `html` is the one layer no app surface can cover, so the
// picture goes there, with the app's deliberately-translucent grounds sitting
// on top of it.
//
// The plugin owns its <style> elements rather than riding the theme's
// `customCSS`: one owner, one lifecycle (removed on unload and when the toggle
// is off), and no dependence on which theme is active.
// ── Reply legibility ───────────────────────────────────────────────────────
// CSS composites encoded sRGB channels; WCAG linearises the result, not the
// inputs. Solving that same pair avoids a guessed day/night opacity threshold.
const clamp01 = x => Math.max(0, Math.min(1, x))
// One reading of the OS motion preference for every animated path in the plugin.
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const replyLuminance = rgb => rgb.reduce((sum, v, i) => {
  const s = clamp01(v / 255)
  return sum + (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i]
}, 0)
const replyContrast = (a, b) => {
  const x = replyLuminance(a), y = replyLuminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const replyComposite = (ground, fill, alpha) => ground.map((v, i) => v + (fill[i] - v) * alpha)
const replyMean = samples => samples.reduce((mean, rgb) => mean.map((v, i) => v + rgb[i] / samples.length), [0, 0, 0])
const REPLY_TARGET = 4.5

// ── Panel tuning ───────────────────────────────────────────────────────────
// The wash used to be a pure legibility fallback: solved for REPLY_TARGET and
// absent (alpha 0) whenever the backdrop already passed AA. These dials make it
// a panel in its own right, exposed in Settings -> Hermes Atrium -> Chat & motion as
// five live sliders (PANEL_DEFAULTS seeds the stored values, so an existing
// install keeps the shipped look until a control is touched).
//
//   solid  the floor. A panel is never thinner than this, so a reply keeps a
//          readable card under it in every light. Raise for a more solid panel.
//   max    the ceiling the contrast solver may push to over a bright ground.
//   tone   how far the panel's tone steps away from the backdrop's brightness,
//          as a fraction of the way to white/black. A Custom look puts an
//          arbitrary picture behind the shell, so a fixed step can land exactly
//          on the backdrop's own tone and the panel vanishes; the step is
//          therefore measured against the sampled backdrop.
//   edge   the panel edge is held at least this visible (a contrast ratio)
//          against the backdrop it sits on, unless `tone`'s cap is reached.
//   pad    breathing room between the text and the panel's edge, in rem.
const PANEL_DEFAULTS = { solid: 0.85, max: 0.97, tone: 0.55, edge: 1.35, pad: 0.7 }
// Read live: `panelSettings` is an atom defined in §9's registration, and these
// helpers are only ever called from there, so a module-level copy keeps the
// pure functions below self-contained and testable in plain Node.
let panel = { ...PANEL_DEFAULTS }
const REPLY_MIN_ALPHA = () => panel.solid
const REPLY_MAX_ALPHA = () => Math.max(panel.solid, panel.max)
const REPLY_LIFT = () => panel.tone
const REPLY_SEPARATION = () => panel.edge
const REPLY_PAD = () => `${panel.pad}rem`
// The panel's own tone. Start from the pole of the tint/ink ramp that can carry
// the ink, then step away from the backdrop's brightness -- a card, not a
// thicker pane of the same light. The direction is chosen ONCE (whichever way
// the full step separates better), so a higher `edge` can never make the result
// less separated: legibility is a hard filter, separation is what is maximised.
const replyPanelTone = (ink, tint, samples) => {
  // The opposite pole comes from the existing tint/ink ramp. Custom dark ink
  // needs the light end; reusing the normal dark glass would reduce contrast.
  const dark = replyContrast(ink, tint) >= REPLY_TARGET ? tint : ZF_INK.map(v => v * 0.1)
  const light = replyComposite(tint, [255, 255, 255], 0.97)
  const base = replyContrast(ink, dark) >= replyContrast(ink, light) ? dark : light
  const clampRgb = rgb => rgb.map(v => Math.round(Math.min(255, Math.max(0, v))))
  const separation = rgb => Math.min(...samples.map(s => replyContrast(replyComposite(s, rgb, REPLY_MIN_ALPHA()), s)))
  const legible = rgb => replyContrast(ink, rgb) >= REPLY_TARGET
  const cap = Math.min(1, Math.max(0, REPLY_LIFT()))
  const need = REPLY_SEPARATION()
  const stop = clampRgb(base)
  if (!legible(stop)) return replyContrast(ink, stop) >= REPLY_TARGET ? stop : [255, 255, 255]
  // One direction for the whole search: the one whose furthest reach separates
  // best. A near-black ground can only lighten, a near-white one only darken.
  const toward = separation(clampRgb(replyComposite(base, [255, 255, 255], cap)))
    >= separation(clampRgb(replyComposite(base, [0, 0, 0], cap)))
    ? [255, 255, 255] : [0, 0, 0]
  // Walk out until the edge target is met (or legibility runs out); keep the
  // last passing tone, so the result is the least step that satisfies `edge`.
  let best = { tone: stop, sep: separation(stop) }
  for (let i = 1; i <= 40; i += 1) {
    const rgb = clampRgb(replyComposite(base, toward, (i / 40) * cap))
    if (!legible(rgb)) break
    const sep = separation(rgb)
    if (sep > best.sep) best = { tone: rgb, sep }
    if (sep >= need) break
  }
  return best.tone
}
const replyMaterial = (ink, tint, samples) => {
  const before = Math.min(...samples.map(rgb => replyContrast(ink, rgb)))
  const color = replyPanelTone(ink, tint, samples)
  const contrastAt = alpha => Math.min(...samples.map(rgb => replyContrast(ink, replyComposite(rgb, color, alpha))))
  // The least fill that reaches REPLY_TARGET; 0 is "the backdrop already passes".
  let solved = 0
  if (before < REPLY_TARGET) {
    let lo = 0, hi = 1
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2
      if (contrastAt(mid) >= REPLY_TARGET) hi = mid
      else lo = mid
    }
    // Round upward: serialising CSS must never round a passing pair below AA.
    solved = Math.ceil(hi * 1000000) / 1000000
  }
  const alpha = Math.min(REPLY_MAX_ALPHA(), Math.max(REPLY_MIN_ALPHA(), solved))
  return { alpha, color, before, after: contrastAt(alpha) }
}
// The panel solver needs a dark pole for "the app has no backdrop of its own":
// the app's own night ground, and the ink the glass ramp starts from.
const ZF_INK = [9, 13, 22]
const ZF_NIGHT = [20, 21, 25]

// The app's neutral tokens are bare RGB triples; this writes them.
const cssRgb = ([r, g, b]) => `rgb(${r} ${g} ${b})`

const REPLY_SHELL = "[data-slot='aui_assistant-message-content']"
const replyGroundCss = material => {
  // No rule at all when the panel is switched off entirely (alpha 0 is only
  // reachable with `solid` set to 0): even padding, nested fills and hit areas
  // are then byte-for-byte the host's own styles.
  if (!material.alpha) return ''
  const shell = 'html body ' + REPLY_SHELL
  return [
    ':root {',
    `  --atr-reply-ground: rgba(${material.color.join(', ')}, ${material.alpha});`,
    `  --atr-reply-pad: ${REPLY_PAD()};`,
    '}',
    // The host shell pads only the left gutter, so a wash painted on its bare
    // box put the first line on the top edge and full lines on the right edge,
    // where the 12px radius then cut into the glyphs.
    // A small block padding and a right gutter fix it; the box still spans the
    // column, so it keeps lining up with the composer, and the measure only
    // loses ~10px.
    //
    // `--atr-reply-ground` is a translucent tint of the panel's own tone, so the
    // card still reads as glass; the inset hairline and the outer shadow give it
    // a defined edge, which is what stops it reading as a rectangle of slightly
    // different backdrop.
    shell + ' {',
    '  background: var(--atr-reply-ground) !important;',
    '  border-radius: var(--atr-radius, 12px) !important;',
    '  padding-block: var(--atr-reply-pad) !important;',
    '  padding-inline-end: var(--atr-reply-pad) !important;',
    '  border-color: transparent !important; outline: 0 !important;',
    '  box-shadow: inset 0 0 0 1px rgba(var(--atr-hi, 255, 255, 255), 0.06), 0 6px 18px rgba(0, 0, 0, 0.16) !important;',
    '}',
    // Content primitives lose their fill; the reply is their sole ground.
    // Card containers keep one material step, while pre/code inside a card
    // cannot paint a second framed well (including Gruvbox/Shiki overrides).
    shell + " :is(.aui-md, pre, pre code, table, thead, tbody, tr, th, td, blockquote, .atr-work-summary, [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-slot='tool-block']:not([data-tool-open])) {",
    '  background: transparent !important; box-shadow: none !important;',
    '}',
    shell + ' :is(pre, pre code, blockquote) { border-color: transparent !important; outline: 0 !important; }',
    // Thinking/activity rows belong to this ground too; their own faint edge
    // otherwise survives as a ghost card after its fill has been flattened.
    shell + " :is([data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-slot='tool-block']:not([data-tool-open])) { border-color: transparent !important; }",
    // These are cards, not another reply wash. Keep their current materials;
    // only the redundant ring/lift disappears inside the unframed shell.
    shell + " :is([data-slot='code-card'], [data-slot='file-diff-panel'], [data-slot='tool-block'][data-tool-open], [data-slot='clarify-inline'], .atr-snip, [class*='bg-(--ui-widget-surface-background)'], [class*='bg-(--ui-chat-surface-background)']) {",
    '  box-shadow: none !important;',
    '}',
    // Tool command wells and inner diff/code wrappers otherwise add a second
    // ground inside the retained card, even after its nested pre is cleared.
    shell + " [data-slot='tool-block'] div:has(> code),",
    shell + " :is([data-slot='code-card'], [data-slot='file-diff-panel']) :is([class*='bg-(--ui-widget-surface-background)'], [class*='bg-(--ui-chat-surface-background)']) {",
    '  background: transparent !important; border-color: transparent !important; box-shadow: none !important;',
    '}',
    // Fold/thinking/tool labels and actions share the body ground. Without
    // this, tertiary ink still disappeared even after the prose passed AA.
    shell + " :is(.atr-work-summary, [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-slot='tool-block']:not([data-tool-open]), [data-slot*='actions'], [data-slot*='feedback'], time) {",
    '  color: inherit !important; text-shadow: none !important;',
    '}',
    // The app normally places actions beside content; keep that cluster on
    // the same ground when it is a sibling, without framing the whole root.
    'html body [data-slot=\'aui_assistant-message-root\'] > :is([data-slot*=\'actions\'], [data-slot*=\'feedback\']) {',
    '  background: var(--atr-reply-ground) !important; border-radius: var(--atr-radius, 12px);',
    '  color: inherit !important; text-shadow: none !important;',
    '}',
  ].join('\n')
}

// Read only theme/viewport state, never individual messages. Hermes themes can
// supply dark ink too, so inactive Hermes Atrium appearance shares the same solver.
const replyCssRgb = value => {
  if (SKIN_HEX.test(String(value).trim())) return hexRgb(String(value).trim())
  const numbers = String(value).match(/[\d.]+/g)?.map(Number)
  // Computed color-mix values may stay in color(srgb …) notation; treating
  // their 0..1 channels as bytes reverses the native-theme polarity decision.
  if (/^color\(srgb\s/i.test(String(value).trim()) && numbers?.length >= 3) return numbers.slice(0, 3).map(v => v * 255)
  return numbers?.length >= 3 ? numbers.slice(0, 3) : null
}
const replyHostGround = () => {
  const fallback = { ink: [255, 255, 255], tint: ZF_NIGHT, samples: [ZF_NIGHT], bounds: { left: 0, top: 0, right: 1, bottom: 1 } }
  if (typeof getComputedStyle !== 'function') return fallback
  const thread = document.querySelector("[data-slot='aui_thread-content']") || document.body
  if (!thread) return fallback
  const cs = getComputedStyle(thread)
  const ink = replyCssRgb(cs.color) || fallback.ink
  let ground = document.documentElement.classList?.contains?.('dark') ? ZF_NIGHT : [255, 255, 255]
  const ancestors = []
  for (let el = thread; el; el = el.parentElement) ancestors.unshift(el)
  for (const el of ancestors) {
    const color = getComputedStyle(el).backgroundColor
    const rgb = replyCssRgb(color)
    const values = String(color).match(/[\d.]+/g)?.map(Number)
    if (rgb) ground = replyComposite(ground, rgb, values?.[3] ?? 1)
  }
  const rect = thread.getBoundingClientRect?.()
  const width = Math.max(1, window.innerWidth)
  const bounds = rect?.width > 0 ? {
    left: clamp01(rect.left / width), right: clamp01(rect.right / width),
    top: 0, bottom: 1,
  } : fallback.bounds
  return { ink, tint: replyLuminance(ink) > 0.18 ? ZF_NIGHT : [250, 251, 253], samples: [ground], bounds }
}
// ── Status stack fillets ───────────────────────────────────────────────────

// ── Status stack ⟷ composer seam ─────────────────────────────────────────
// The status stack sits on the composer, a little narrower, with square bottom
// corners, while the composer's top corners are round. fitStatusStack gives
// the stack concave bottom corners: each side of the card sweeps out in a
// fillet that lands tangent on the composer's own corner arc, so the two
// outlines run together as one S-curve. The geometry is measured (inset,
// composer radius, border width, fill colour), so it follows any theme or
// font size; it is drawn by two pseudo-elements on the stack's wrapper.
const STACK_FLARE_ATTR = 'data-atr-flare'
const fitStatusStack = () => {
  if (typeof document === 'undefined') return
  const stack = document.querySelector("[data-slot='composer-status-stack']")
  const card = stack?.querySelector(":scope > [class*='rounded-t-']") || stack?.firstElementChild
  const surf = document.querySelector("[data-slot='composer-surface'], [class~='group/composer-surface']")
  const off = () => { if (stack?.hasAttribute(STACK_FLARE_ATTR)) stack.removeAttribute(STACK_FLARE_ATTR) }
  if (!stack || !card || !surf) return off()
  const cr = card.getBoundingClientRect()
  const sr = surf.getBoundingClientRect()
  const wr = stack.getBoundingClientRect()
  const m = cr.left - sr.left                 // how far the card is inset
  const gap = sr.top - cr.bottom
  if (cr.height < 4 || m < 1.5 || Math.abs(gap) > 2.5 || Math.abs((sr.right - cr.right) - m) > 1.5) return off()
  const cs = getComputedStyle(card)
  const R = Math.max(0.5, parseFloat(getComputedStyle(surf).borderTopLeftRadius) || 0)
  const b = parseFloat(cs.borderLeftWidth) || 0
  // the fillet: radius s, tangent to the card's side (outside its border line)
  // and to the composer's corner circle (centre R,R; frame: composer top-left)
  const s = Math.min(12, Math.max(3, m * 0.85))
  const cx2 = m + b - s
  const dx = R - cx2
  const reach = (s + R) * (s + R) - dx * dx
  if (dx <= 0 || reach <= 0) return off()
  const cy2 = R - Math.sqrt(reach)             // composer top is y = 0 in this frame
  const ty = cy2 + (R - cy2) * s / (s + R)       // tangent point with the composer arc
  const boxL = cx2, boxT = cy2, boxW = m + b - cx2, boxH = Math.max(1, ty - cy2)
  const fill = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'var(--composer-fill)'
  const px = v => v.toFixed(2) + 'px'
  const vars = {
    '--fl-x': px(sr.left - wr.left + boxL),
    '--fl-xr': px(wr.right - sr.right + boxL),
    '--fl-top': px(cr.bottom - wr.top + gap + boxT),
    '--fl-w': px(boxW),
    '--fl-h': px(boxH),
    '--fl-c2': px(cx2 - boxL) + ' ' + px(cy2 - boxT),
    '--fl-c1': px(R - boxL) + ' ' + px(R - boxT),
    '--fl-s': px(s),
    '--fl-si': px(Math.max(0, s - b)),
    '--fl-R': px(R),
    '--fl-fill': fill,
    '--fl-line': b > 0 ? cs.borderLeftColor : 'transparent'
  }
  for (const [k, v] of Object.entries(vars)) if (stack.style.getPropertyValue(k) !== v) stack.style.setProperty(k, v)
  if (!stack.hasAttribute(STACK_FLARE_ATTR)) stack.setAttribute(STACK_FLARE_ATTR, '')
}
const STACK_FLARE_CSS = [
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}] { position: relative; overflow: visible !important; }`,
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}]::before,`,
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}]::after {`,
  "  content: ''; position: absolute; z-index: 5; pointer-events: none;",
  '  top: var(--fl-top); width: var(--fl-w); height: var(--fl-h);',
  '  background: radial-gradient(circle at var(--fl-c2), transparent var(--fl-si), var(--fl-line) var(--fl-si), var(--fl-line) var(--fl-s), var(--fl-fill) calc(var(--fl-s) + 0.35px));',
  '  -webkit-mask: radial-gradient(circle at var(--fl-c1), transparent var(--fl-R), #000 calc(var(--fl-R) + 0.6px));',
  '  mask: radial-gradient(circle at var(--fl-c1), transparent var(--fl-R), #000 calc(var(--fl-R) + 0.6px));',
  '}',
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}]::before { left: var(--fl-x); }`,
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}]::after { right: var(--fl-xr); transform: scaleX(-1); }`
].join('\n')

// ══ §3 SIDEBAR SWITCH HOOKS ════════════════════════════════════════════════

// The sidebar's own strip: a header on the sidebar surface that owns a tablist.
// The workspace tab bar and the terminal rail do not match it.
const STRIP_HOOK = '[data-atr-strip]'

// Only a two-way strip becomes a switch — SESSIONS | BOTS. A three-way strip
// falls back to the app's own tabs rather than getting a pill that cannot land.
const PIN_MASK_URL = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 17v5'/%3E%3Cpath d='M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'/%3E%3C/svg%3E")`
const MENU_SURFACES = ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'], [data-slot='dialog-content'] [data-slot='command'])"
const MENU_ROWS = ":is([role='menuitem'], [role='option'], [role='menuitemcheckbox'], [role='menuitemradio'], [cmdk-item], [data-slot='command-item'])"
const SWITCH_HOOK = '[data-atr-strip][data-atr-switch]'

// ══ §4 APP CSS (sheetCss: layout, glass material, every surface) ═══════════

// ── The floating sidebar ──────────────────────────────────────────
// The sidebar column becomes one card. Parked, it sits off-screen and a touch
// on the left edge slides it in; pinned, the same card is docked, inset from
// the window edge, and the chat sits beside it. Everything that rides on the
// card (the status data, the snippet row, the mode button) moves with it.
// The mode morph: the sidebar column and the main pane are captured and glide
// to their new boxes on Cmd+S. Emitted only when the platform has view
// transitions, because the rules do nothing otherwise.
const MORPH_CSS = [
  "::view-transition-group(atr-side), ::view-transition-group(atr-main), ::view-transition-group(atr-home) { animation-duration: 300ms; animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); }",
  "::view-transition-old(atr-home), ::view-transition-new(atr-home) { animation-duration: 300ms; }",
  "::view-transition-old(atr-main), ::view-transition-new(atr-main) { width: 100%; height: 100%; object-fit: none; object-position: center top; animation-duration: 300ms; }",
  "::view-transition-old(atr-side), ::view-transition-new(atr-side) { animation-duration: 220ms; }",
  "::view-transition-old(root), ::view-transition-new(root) { animation: none; }"
]

const SIDEBAR_CSS = [
  // The host replaces the desktop rail with a native overlay below its narrow
  // breakpoint. It is not data-atr-arc-col, and must mask the transcript even
  // when the theme deliberately makes pinned sidebar surfaces transparent.
  "html:root body [data-narrow-overlay] { background: var(--atr-m-solid, var(--ui-bg-chrome)) !important; background-image: none !important; }",
  // ── The floating sidebar ──────────────────────────────────────────────────────────────
  // The sidebar column never unmounts. "Collapsed" takes it out of the flow
  // (position: fixed, so the chat never reflows) and parks it off-screen; a
  // hover slides it back. Only translate and opacity animate: compositor work,
  // no React, no layout.
  "html[data-atr-arc='1'] [data-atr-arc-col] {",
  '  position: fixed !important; left: 10px !important; top: 10px !important; bottom: 10px !important;',
  '  width: 272px !important; height: auto !important; min-width: 0 !important; max-width: none !important;',
  '  flex: none !important; z-index: 60 !important;',
  '  border-radius: 16px !important; overflow: hidden !important;',
  '  background: var(--atr-m-solid) !important; background-image: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important;',
  '  box-shadow: var(--atr-lift-float) !important;',
  '  translate: calc(-100% - 28px) 0; opacity: 0; pointer-events: none;',
  '  transition: translate 150ms cubic-bezier(0.4, 0, 1, 1), opacity 110ms ease;',
  '  will-change: translate, opacity; contain: layout paint;',
  '}',
  "html[data-atr-arc='1'][data-atr-arc-open='1'] [data-atr-arc-col] {",
  '  translate: 0 0; opacity: 1; pointer-events: auto;',
  '  transition: translate 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease;',
  '}',
  // In floating mode the card's own surfaces are see-through, so the column is
  // one piece of glass. Pinned does not flatten them: with no outer card, the
  // inner surfaces have to paint themselves or the list would be a hole.
  "html[data-atr-arc='1'] [data-atr-arc-col] > div, html[data-atr-arc='1'] [data-atr-arc-col] [data-slot='sidebar'] {",
  '  background: transparent !important; border: 0 !important;',
  '}',
  // room at the bottom of the column for snippets + status
  // The snippet card and the status-dock head are the app's own fixed layers:
  // it places them from the column's own box, on its own schedule. Left alone
  // they stay put while the card slides, then jump when the app re-measures.
  // They ride the same slide on the same curve instead, and their re-measure
  // glides rather than snapping.
  "html[data-atr-arc-ready='1'] body #atr-snips {",
  '  transition: translate 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease,',
  '    left 300ms cubic-bezier(0.22, 1, 0.36, 1), top 300ms cubic-bezier(0.22, 1, 0.36, 1);',
  '}',
  "html[data-atr-arc-ready='1'] body #atr-statusdock-head {",
  '  transition: translate 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease,',
  '    left 300ms cubic-bezier(0.22, 1, 0.36, 1), top 300ms cubic-bezier(0.22, 1, 0.36, 1),',
  '    height var(--atr-sd-dur) var(--atr-sd-ease), color var(--atr-t-2, 150ms) var(--atr-ease, ease),',
  '    box-shadow var(--atr-t-2, 150ms) var(--atr-ease, ease);',
  '}',
  // They paint in the card's own plane. Behind it (the app's z-40 against the
  // card's z-60) they only showed once the slide had finished, which read as
  // arriving late, while the card was already there.
  "html[data-atr-arc='1'] body :is(#atr-snips, #atr-statusdock-head) { z-index: 61 !important; }",
  // Their x is the card's own, not the app's next measurement: with the column
  // parked, the app's own re-measure lands late (its heartbeat is a second) and
  // the two arrive after the card. Fixed to the card, they ride it exactly.
  "html[data-atr-arc='1'] body :is(#atr-snips, #atr-statusdock-head) {",
  '  left: var(--atr-rail-x, 20px) !important;',
  '  width: var(--atr-rail-w, 252px) !important;',
  '}',
  "html[data-atr-arc='1']:not([data-atr-arc-open='1']) body :is(#atr-snips, #atr-statusdock-head) {",
  '  translate: calc(-100% - 28px) 0; opacity: 0; pointer-events: none;',
  '}',
  "html[data-atr-arc='1'][data-atr-arc-open='1'] body :is(#atr-snips, #atr-statusdock-head) {",
  '  translate: 0 0; opacity: 1; pointer-events: auto;',
  '}',
  // The open status card's body is the app's real footer, pinned under the
  // head. It belongs to the same card, so it rides the same slide: left
  // behind, it stayed on screen over the chat after the sidebar tucked away.
  // Its transition list is the dock's (!important); the translate leg there
  // reads these two tokens.
  "html[data-atr-arc='1'] body footer[data-slot='statusbar'][data-atr-dock-side] {",
  '  left: var(--atr-rail-x, 20px) !important; width: var(--atr-rail-w, 252px) !important; z-index: 61 !important;',
  '  --atr-arc-dur: 300ms; --atr-arc-ease: cubic-bezier(0.22, 1, 0.36, 1);',
  '}',
  "html[data-atr-arc='1']:not([data-atr-arc-open='1']) body footer[data-slot='statusbar'][data-atr-dock-side] {",
  '  translate: calc(-100% - 28px) 0; opacity: 0 !important; pointer-events: none !important;',
  '  --atr-arc-dur: 150ms; --atr-arc-ease: cubic-bezier(0.4, 0, 1, 1);',
  '}',
  // the tucked state has to leave too, at the closing speed
  "html[data-atr-arc='1']:not([data-atr-arc-open='1']) body #atr-snips {",
  '  transition: translate 150ms cubic-bezier(0.4, 0, 1, 1), opacity 110ms ease,',
  '    left 150ms cubic-bezier(0.4, 0, 1, 1), top 150ms cubic-bezier(0.4, 0, 1, 1);',
  '}',
  "html[data-atr-arc='1']:not([data-atr-arc-open='1']) body #atr-statusdock-head {",
  '  transition: translate 150ms cubic-bezier(0.4, 0, 1, 1), opacity 110ms ease,',
  '    left 150ms cubic-bezier(0.4, 0, 1, 1), top 150ms cubic-bezier(0.4, 0, 1, 1),',
  '    height var(--atr-sd-dur) var(--atr-sd-ease);',
  '}',
  // the chat keeps the toggle's corner clear once the sidebar is out of the flow
  "html[data-atr-arc='1'] [data-tree-split] > div:not([data-atr-arc-col]) [data-window-top] {",
  // the mode button lives inside the card here, so the tabs can take the corner
  '  --panel-titlebar-left: 12px !important;',
  '}',
  // menus, tooltips and dialogs opened from inside the card must sit above it
  "[data-radix-popper-content-wrapper], [role='menu'], [role='listbox'], [role='tooltip'], [data-slot$='-content'][data-state='open'][style*='--radix'] { z-index: 70 !important; }",
  "[data-slot='dialog-overlay'], [data-slot='dialog-content'], [data-slot='sheet-overlay'], [data-slot='sheet-content'], [data-slot='alert-dialog-overlay'], [data-slot='alert-dialog-content'] { z-index: 72 !important; }",
  // the sidebar toggle hides while the sidebar is out; the card is the control then
  "html[data-atr-arc-ready='1'] div.fixed[data-atr-sbbtn] { opacity: 0 !important; pointer-events: none !important; }",
  // Keyed on the BUTTON as well as the marked wrapper: the mark comes from the page
  // observer, which fires on sidebar rows and tab strips, and in a pinned window the
  // app's own toggle kept painting in the same corner as the mode button (two
  // sidebar controls on top of each other). A rule on the element itself cannot miss.
  "html[data-atr-arc-ready='1'] :is(div.fixed, [data-titlebar-cluster='left']) > button[aria-label*='sidebar' i]:not(#atr-mode-btn):not([aria-label*='right sidebar' i]) { opacity: 0 !important; pointer-events: none !important; }",
  // Below the host's 640px dock floor there is no Arc column / mode button.
  // The native titlebar toggle is the only persistent way to close AND reopen
  // its narrow overlay, including after the overlay has unmounted.
  '@media (max-width: 639.98px) {',
  "  html[data-atr-arc-ready='1'] body div.fixed[data-atr-sbbtn] { opacity: 1 !important; pointer-events: auto !important; }",
  "  html[data-atr-arc-ready='1'] body div.fixed[data-atr-sbbtn] button { pointer-events: auto !important; }",
  "  html[data-atr-arc-ready='1'] body :is(div.fixed, [data-titlebar-cluster='left']) > button[aria-label*='sidebar' i]:not(#atr-mode-btn):not([aria-label*='right sidebar' i]) { opacity: 1 !important; pointer-events: auto !important; }",
  '}',
  // Pinned: no card. The column keeps the app's own gravity and inset, but
  // paints nothing: the surfaces inside it are the sidebar, not a Hermes Atrium panel.
  // Floating mode below is the one piece of glass.
  "html:not([data-atr-arc='1']) [data-atr-arc-col] {",
  '  margin: 10px 0 10px 10px !important; height: calc(100vh - 20px) !important; align-self: flex-start;',
  '}',
  // sidebar mode switch, sitting in the command-center row
  "#atr-mode-btn { position: absolute; left: 8px; top: 4px; z-index: 5; display: none; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--atr-ink-2, #ebdbb2); cursor: pointer; -webkit-app-region: no-drag; transition: background-color 120ms ease, color 120ms ease, transform 120ms ease; }",
  "[data-atr-arc-col] > #atr-mode-btn { display: inline-grid; position: absolute !important; left: 10px !important; top: 3px !important; width: 24px !important; height: 24px !important; margin: 0 !important; transform: none; }",
  "html:not([data-atr-arc='1']) [data-atr-arc-col] { position: relative !important; }",
  "html[data-atr-settings] #atr-mode-btn { display: none; }",
  "#atr-mode-btn svg { width: 16px; height: 16px; }",
  // sidebar: the button belongs to the card, top-left inside it, and rides
  // the same slide; pinned keeps it in the window corner
  "html[data-atr-arc='1'] #atr-mode-btn { left: 20px; top: 12px; translate: -300px 0; opacity: 0; pointer-events: none; transition: translate 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease, background-color 120ms ease, color 120ms ease; }",
  "html[data-atr-arc='1'][data-atr-arc-open='1'] #atr-mode-btn { translate: 0 0; opacity: 1; pointer-events: auto; transition: translate 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease, background-color 120ms ease, color 120ms ease; }",
  "#atr-mode-btn:hover, #atr-mode-btn:focus-visible { background: rgba(var(--atr-hi), 0.10); color: var(--atr-ink-0, #fbf1c7); outline: none !important; }",
  "#atr-mode-btn:active { transform: scale(0.92); }",
  // left-edge hot zone, invisible. An 8px strip was a fiddly target: at 18px the
  // edge grab reads as deliberate instead of accidental.
  '#atr-rail-hot { position: fixed; left: 0; top: 40px; bottom: 0; width: 18px; z-index: 59; display: none; background: transparent; }',
  "html[data-atr-arc='1']:not([data-atr-arc-open='1']) #atr-rail-hot { display: block; }",


  // The card slides on its own: the app keeps its status bar, its snippet card
  // and the command center exactly where they were.
  '@media (prefers-reduced-motion: reduce) {',
  "  [data-atr-arc-col] { transition: none !important; }",
  '}',
]

// `backdrop` paints the ground the app sits on (the painting or your picture);
// `chrome` paints Atrium's own panels, type and controls. They are separate
// switches in Settings, so a plain Hermes chrome can keep the picture, and the
// glass can stay without a backdrop behind it.
//
// Only two looks exist now: Gruvbox (built in) and Custom (the same machinery
// driven by hermes-atrium-theme.json). Both are the skin -- one set of colours and
// opacities, so nothing here reads the clock or anything live.
const sheetCss = (date, gl = false, { backdrop = true, chrome = true, split = false } = {}) => {
  const glass = gruvboxTinted()
  // There is no day/night split any more: the look is one palette.
  const isNight = false
  // Panels are the skin's own opacities; there is no light level to follow.
  const zf = gruvboxMaterial()
  // Gruvbox's own night factor: how much weight the glass carries over a
  // picture. It is a constant of the look, not of the clock.
  const NIGHT = zf.night
  // The reading pane and the cards hold the picture back differently; the
  // sidebar's own numbers live in `sideCard` below.
  const density = glass ? '0' : String(skinNumber(SKIN.chrome, 0.88))
  const cardDensity = glass ? '0.55' : String(skinNumber(SKIN.card, 0.96))
  const glassPct = a => `${Math.round(a)}%`
  // gruvbox has no white in its palette; fg0 is the brightest ink it uses.
  const solidInk = glass ? GLASS.ink : gbHex(GB.fg0)
  // The sidebar is the cards, and only the cards.
  //
  // `sideCard` is the cards' own fill: the deeper ground with the ink mixed in,
  // at the slider's alpha, because a card that was only the ground was the same
  // colour as the gaps.
  //
  // The rail behind them is transparent and stays that way. It used to carry a
  // wash of its own, and that wash is what killed the floating look: it dimmed
  // the picture inside the gaps, so the gaps came down to the cards' tone and
  // the column read as one slab with rounded corners. Measured on the user's own
  // screenshot, the gaps sat 8.9 luma under the cards; the reference look, with
  // a clear rail, separates them by 32.6. Leaving the rail alone gives the gaps
  // the full picture back, which is the contrast that makes the cards float.
  //
  // Glass keeps the terminal look: a faint lift of the ink, no ground at all.
  //
  // Which slider owns the sidebar cards: Card opacity, not Sidebar opacity.
  // Sidebar opacity was the original owner, which left the card slider only
  // touching the chat's own cards while every sidebar surface ignored it. The
  // slider is named for the cards it paints, and the reply panels' Solidity
  // floor is what gives it a genuinely solid end of the range.
  const sideAlpha = skinNumber(SKIN.card, 0.96)
  const sideCard = glass
    ? `rgba(${hexTriple(GLASS.ink)}, 0.035)`
    : `rgba(${hexTriple(gbHex(mixHex(SKIN.deeper, SKIN.ink, 0.04)))}, ${String(sideAlpha)})`
  // Sidebar opacity is the column the cards sit on. The slider runs 0.4..1, and
  // it has to be able to reach NOTHING: at its floor the gaps between the cards
  // should be the bare picture, which is the floating look. So the range maps
  // linearly onto alpha 0..0.5 rather than being used raw: 0.4 is clear, 0.74
  // lands on 0.28 (what this column looked like before), and 1.0 is a half
  // wash. Using the raw value left a floor of 0.16 that no setting could clear.
  const sideSlider = skinNumber(SKIN.sidebar, 0.92)
  const sideWashAlpha = Math.max(0, Math.min(1, (sideSlider - 0.4) / 0.6)) * 0.5
  const sideWash = glass
    ? 'transparent'
    : `rgba(${hexTriple(SKIN.deeper)}, ${sideWashAlpha.toFixed(3)})`
  // Zero, always: the host's token chain puts the theme's seed at
  // --theme-mix-sidebar and colour-mix takes a percentage there. At 100% an
  // opaque seed decides the fill on its own and swallows the neutral above
  // (and its alpha), which is exactly how this slider stopped working.
  // Measured in Chromium: at 0% the neutral arrives with its own alpha intact,
  // 0.74 in and 0.74 out, so the token follows the slider.
  const sideSeedMix = '0%'

  // Keep the sections in cascade order. The clock only changes the backdrop
  // and material, so a refresh doesn't reparse the layout and widget rules.
  const sections = [[
    ...(backdrop ? [
    'html {',
    `  background-color: ${glass ? 'transparent' : '#1d2021'};`,
    '}',
    // The app's own ground is `body { background: var(--ui-chat-surface-background) }`,
    // and that chrome colour is a color-mix whose second input is an OPAQUE
    // neutral, which caps how transparent it can ever be. Clearing body's
    // background is the lever that lets the picture be the ground.
    'body { background: transparent; }',
    // The app's own "Chat Backdrop" (Settings > Appearance) is the faint statue
    // image behind the conversation. Over the painting it reads as dirt on the
    // glass, so it rests while a backdrop is shown.
    "img[src*='filler-bg0'] { display: none; }",
    // The painting (or the desktop, when tinted) IS the background.
    ...(glass ? glassLayers() : gruvboxLayers()),
    ] : []),
    ...(chrome ? [
    // Panel density, and it is deliberately mode-scoped: Atrium's palettes are
    // dark, and a light-mode app would not want a translucent ground.
    ':root.dark {',
    // The panes ARE the palette (bg0 chrome, bg0_hard sidebar, bg1 cards), so
    // each is a gruvbox surface with the painting behind it, not soot.
    `  --theme-neutral-chrome: rgba(${hexTriple(SKIN.ground)}, ${density});`,
    `  --theme-neutral-sidebar: ${sideCard};`,
    // The host builds every sidebar fill (the rail, the settings list, hover
    // rows, and the whole window in the sidebar's own colour mode) as
    // `color-mix(<seed> var(--theme-mix-sidebar), var(--theme-neutral-sidebar))`.
    // Its own themes leave the seed transparent at 100%, so the neutral is the
    // one input that decides the fill; Atrium publishes an opaque seed, and at
    // 100% that seed alone decides it. Point the mix at the seed's own alpha
    // instead, so the neutral above is what reaches the screen and the slider
    // is not overwritten by the theme.
    `  --theme-mix-sidebar: ${sideSeedMix};`,
    `  --theme-neutral-card: rgba(${hexTriple(SKIN.cardTint)}, ${cardDensity});`,
    // Same story for the cards, and this is the one that made Card opacity look
    // dead. The host builds both card surfaces by blending an opaque seed over
    // this neutral:
    //   --ui-bg-editor   = color-mix(card-seed     var(--theme-mix-card),     neutral-card)
    //   --ui-bg-elevated = color-mix(elevated-seed var(--theme-mix-elevated), neutral-card)
    // Its own dark theme leaves 38% and 46% of a white seed in the mix, so at
    // Card opacity 0.40 the card rendered pale at 0.63 alpha, not dark at 0.40,
    // and the slider read as doing nothing. Zeroing the two mix weights hands
    // the fill back to the neutral, exactly as the sidebar seed fix does.
    '  --theme-mix-card: 0%;',
    '  --theme-mix-elevated: 0%;',
    `  --ui-text-primary: ${SKIN.ink};`,
    '  --ui-text-secondary: var(--atr-ink-2);',
    '  --ui-text-tertiary: var(--atr-ink-3);',
    '  --sidebar-foreground: var(--atr-ink-1);',
    '  --sidebar-accent-foreground: var(--atr-ink-0);',
    '  --sidebar-muted-foreground: var(--atr-ink-2);',
    '  --ui-sidebar-foreground: var(--atr-ink-1);',
    '  --ui-sidebar-accent-foreground: var(--atr-ink-0);',
    '  --ui-sidebar-muted-foreground: var(--atr-ink-2);',
    '  --accent-foreground: var(--atr-ink-1);',
    '  --ui-accent-foreground: var(--atr-ink-1);',
    '}',
    ] : []),
  ], chrome ? [
    // Active clicked elements: swap text to crisp light slate grey (var(--atr-ink-1)) so it never turns dark
    ":is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [class~='peer/menu-button'], button, [role='button'], [data-slot='pane-tab'], a, input, select):active,",
    ":is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [class~='peer/menu-button'], button, [role='button'], [data-slot='pane-tab']):active * {",
    '  color: var(--atr-ink-1) !important;',
    '}',
    ":is(button, [role='button'], [data-slot*='button'], [data-slot='pane-tab'], a):active svg {",
    '  color: var(--atr-ink-1) !important;',
    '  stroke: currentColor !important;',
    '}',
    // The sidebar, as a stack of floating panels. The column itself goes
    // transparent and drops its edge, and each region inside it becomes a card
    // in the composer's clothes: `--dt-card` at 88% plus the 0.75rem frost,
    // both lifted from the input bar. The gaps between cards show the backdrop,
    // which is what makes the column read as floating pieces rather than one
    // strip. `:has(input)` is how the search row is named: it is the only
    // region in the column holding an input.
    ':root.dark {',
    '  --sidebar-edge-border: color-mix(in srgb, var(--ui-base) 18%, transparent);',
    '}',
    // No live backdrop-filter here: re-blurring the picture behind the whole
    // column costs a full-window pass on every scroll.
    //
    // Both the rail and the shell wrapper go transparent, so the gaps between
    // the cards show the picture at full strength. That contrast is what makes
    // the cards float; any fill here flattens the column into one panel.
    //
    // [data-slot='sidebar'] matters most. The host renders it with
    // `collapsible="none"`, and that div carries Tailwind's `bg-sidebar`, which
    // maps to --sidebar, which the theme above used to paint solid. This div is
    // the parent of sidebar-content, so it sits behind every card: as long as it
    // has a fill, the cards' gaps are that fill and the column reads as one slab
    // no matter what the cards do. Measured on the user's screenshot: a flat
    // band from the first card to the bottom of the window, no gap anywhere.
    "[data-tour='sessions-sidebar'],",
    "[data-slot='sidebar'] {",
    `  background: ${sideWash} !important;`,
    '  border-color: transparent;',
    '}',
    // The wrapper below the window's own theme scope, so it is the host's
    // color-mix that would win here; the seed mix keeps that mix off the
    // neutral, and transparent keeps the shell from painting the whole window.
    "[data-slot='sidebar-wrapper'] {",
    '  background-color: transparent !important;',
    '}',
    "[data-slot='sidebar-content'] {",
    '  gap: 0.5rem;',
    '  padding-top: calc(var(--titlebar-height, 0rem) + 0.625rem);',
    '  padding-bottom: 0.5rem;',
    '}',
    /* The first card drops default padding so the 3 action buttons fill the panel without grey edges on top/bottom */
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'] { padding: 0 !important; }",
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'] [data-slot='sidebar-menu'] { gap: 0 !important; }",
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'] [data-slot='sidebar-menu-button'] {",
    '  border-radius: 0 !important;',
    '  border: none !important;',
    '  height: 1.85rem !important;',
    '}',
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'],",
    "[data-slot='sidebar-content'] > [data-sessions-mode],",
    "[data-slot='sidebar-content'] > div:has(input),",
    "[data-slot='sidebar-content'] > div:last-child {",
    '  background: var(--atr-side-card);',
    '  border: none;',
    '  border-radius: var(--atr-radius);',
    '  overflow: hidden;',
    '}',
    // Every pane paints a surface, and they nest: the zone container
    // (`data-tree-group`, the editor surface), then the chat pane root
    // (`data-chat-surface`), then the transcript wrapper. Clearing only the
    // header left the pane's own surface behind it, which is the box that
    // survived every previous attempt. All three go transparent, so the picture
    // is the ground everywhere and only the sidebar cards and the active tab
    // are painted.
    '[data-tree-group],',
    '[data-chat-surface],',
    "[data-slot='composer-bounds'],",
    // The app shell paints `[data-slot=sidebar-wrapper]` (with `[data-contrib-shell]`)
    // across the WHOLE window with an ink fill — 74% opaque at this density — which
    // dims the picture to a barely-visible tint and reads as "nothing is rendering".
    // The app's own glass mode clears exactly this pair; do the same.
    "[data-slot='sidebar-wrapper'],",
    '[data-contrib-shell] {',
    '  background: transparent !important;',
    '}',
    "[data-slot='composer-bounds'],",
    "[data-slot='composer-dock'],",
    "[data-slot='composer-root'],",
    "[class~='group/composer'],",
    "[class~='group/composer-surface'],",
    "[data-slot='composer-surface'],",
    "form[data-slot='composer'] {",
    '  border: none !important;',
    '  outline: none !important;',
    '  box-shadow: none !important;',
    '}',
    // Retain the input box's floating shape with rounded corners matching the other panels (0.45rem)
    ":is([data-slot='composer-surface'], [class~='group/composer-surface'], .composer-fallback-surface) {",
    '  border-radius: var(--atr-radius) !important;',
    '  overflow: hidden !important;',
    '}',
    // The root's own fade layer spans the 5px grab margin and darkens toward
    // the bottom, so around a floating surface it reads as a lopsided shadow.
    "[data-slot='composer-root'] > .pointer-events-none.absolute:not([data-slot]) {",
    '  background: none !important;',
    '}',
    // Status stack card: the composer's fill, corner radius and hairline edge,
    // with the bottom left open into the composer (the fillets close it).
    "[data-slot='composer-status-stack'] > div[class*='rounded-t-'] {",
    '  background: var(--atr-glass) !important;',
    '  border-color: var(--atr-edge) !important;',
    '  border-bottom-color: transparent !important;',
    '  border-top-left-radius: var(--atr-radius) !important;',
    '  border-top-right-radius: var(--atr-radius) !important;',
    '  box-shadow: none !important;',
    // inset by the composer's corner radius (plus the root's 5px grab margin),
    // so the stack sits inside the composer's rounded shoulders and the
    // fillets have room to flare out into them
    "  margin-inline: calc(5px + var(--atr-radius)) !important;",
    '}',
    // Outer dock and root wrappers remain transparent so no box leaks outside
    "[data-slot='composer-dock'],",
    "[data-slot='composer-root'],",
    "[class~='group/composer'] {",
    '  background: transparent !important;',
    '  background-color: transparent !important;',
    '}',
    "[data-slot='sidebar-content'] input {",
    '  border: none !important;',
    '  outline: none !important;',
    '  box-shadow: none !important;',
    '}',
    "[data-slot='user-message'], [data-slot='assistant-message'] {",
    '  border: none !important;',
    '  outline: none !important;',
    '}',
    // A long bubble scrolls inside the host's fixed height. The painted
    // scrollbar sits just inside the ring and reads as a second border, so the
    // bubble keeps the host's scrolling but loses the visible track.
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is(.composer-human-message, [class*='composer-human-message']):not(.composer-human-message-container) {",
    '  scrollbar-width: none;',
    '}',
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is(.composer-human-message, [class*='composer-human-message']):not(.composer-human-message-container)::-webkit-scrollbar {",
    '  display: none;',
    '}',
    // User message bubbles: styled to match the frosted panels and composer cards
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is(.composer-human-message, [class*='composer-human-message']),",
    ":is(.composer-human-message, [class*='composer-human-message'], .composer-human-message-container) {",
    '  background: var(--atr-glass) !important;',
    '  background-color: var(--atr-glass) !important;',
    '  border: none !important;',
    '  outline: none !important;',
    '  box-shadow: none !important;',
    '  border-radius: var(--atr-radius) !important;',
    '  color: var(--atr-ink-0) !important;',
    '}',
    ":is(.composer-human-message, [class*='composer-human-message']):hover {",
    '  background: var(--atr-glass-hover) !important;',
    '  border: none !important;',
    '  outline: none !important;',
    '}',
    ":is(.composer-human-message, [class*='composer-human-message']) :is(p, span, div, button, code) {",
    '  color: var(--atr-ink-0) !important;',
    '}',
    // User message hover cluster: remove the background box around time and actions, position bottom-right
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message'], .composer-human-message, [class*='composer-human-message']) [class*='group-hover/user-message'] {",
    '  background: transparent !important;',
    '  background-color: transparent !important;',
    '  box-shadow: none !important;',
    '  border: none !important;',
    '  outline: none !important;',
    '  padding: 0 !important;',
    '  position: absolute !important;',
    '  right: 0.5rem !important;',
    '  bottom: 0.35rem !important;',
    '  display: flex !important;',
    '  align-items: flex-end !important;',
    '  justify-content: flex-end !important;',
    '  opacity: 0.85 !important;',
    '  transition: opacity 0.15s ease-in-out !important;',
    '}',
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']):hover [class*='group-hover/user-message'] {",
    '  opacity: 1 !important;',
    '}',
    // Remove stop button on user messages
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) [class*='group-hover/user-message'] button,",
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) button[aria-label*='Stop' i] {",
    '  display: none !important;',
    '}',
    // User message time: accent colour
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message'], .composer-human-message, [class*='composer-human-message']) [class*='group-hover/user-message'] :is(time, span, div),",
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message'], .composer-human-message, [class*='composer-human-message']) time,",
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is([data-slot='timeline-timestamp'], [class*='timeline-timestamp']) time {",
    '  color: var(--atr-ink-3) !important;',
    '}',
    // Brighter, whiter text across transcript, chat bubbles, and sidebar
    ":is([data-slot='aui_thread-content'], [data-chat-surface], [data-slot='thread']) {",
    `  color: ${solidInk};`,
    '  background: transparent !important;',
    '}',
    ":is([data-slot='aui_thread-content'], [data-slot='thread']) :is(p, li, span, h1, h2, h3, h4) {",
    '  color: var(--atr-ink-0);',
    '}',
    // Panel items: visible, legible grey hierarchy on dark card backgrounds
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) {",
    '  color: var(--atr-ink-1);',
    '}',
    // Primary items: session titles, navigation buttons, menu actions
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button']) {",
    '  color: var(--atr-ink-1) !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button']) :is(span:not([class*='text-xs']):not([class*='tabular-nums']), p, div, label) {",
    '  color: inherit;',
    '}',
    // Override Tailwind muted and sidebar foreground classes in panels
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) [class*='text-sidebar-foreground'] {",
    '  color: var(--atr-ink-1) !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) [class*='text-muted'] {",
    '  color: var(--atr-ink-2) !important;',
    '}',
    // Active session item remains crisp bright white
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button'])[data-active='true'],",
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button'])[data-active='true'] * {",
    '  color: var(--atr-ink-0) !important;',
    '}',
    // Panel SVGs and icons: visible medium-light grey
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is(svg, [data-slot*='icon']) {",
    '  color: var(--atr-ink-2) !important;',
    '  stroke: currentColor;',
    '}',
    // Disentangle date and 3-dot hamburger/kebab menu so they never collide
    ":is([data-slot='sidebar-menu-item'], [data-sessions-mode] li, [data-row-actions]) {",
    '  position: relative !important;',
    '}',
    "[data-sessions-mode] [data-slot='sidebar-menu-button'] {",
    '  padding-right: 2.25rem !important;',
    '}',
    "[data-sessions-mode] [data-row-actions] {",
    '  display: flex !important;',
    '  align-items: center !important;',
    '  justify-content: flex-end !important;',
    '  gap: 0.375rem !important;',
    '  position: relative !important;',
    '}',
    // In Hermes session-row, the kebab button previously had absolute right-0 which collided with the date.
    // Flow the button cleanly beside the date with dedicated breathing room:
    "[data-sessions-mode] [data-row-actions] button,",
    "[data-sessions-mode] [data-row-actions] [role='button'],",
    "[data-sessions-mode] [data-slot='sidebar-menu-action'] {",
    '  position: relative !important;',
    '  right: auto !important;',
    '  top: auto !important;',
    '  transform: none !important;',
    '  flex-shrink: 0 !important;',
    '  display: inline-flex !important;',
    '  align-items: center !important;',
    '  justify-content: center !important;',
    '  margin-left: 0.25rem !important;',
    '  z-index: 2 !important;',
    '}',
    // Ensure the date / tail does not disappear or fade into the button on hover
    "[data-sessions-mode] [data-row-actions] .session-row-tail,",
    "[data-sessions-mode] [data-row-actions] [class*='session-row-tail'] {",
    '  opacity: 1 !important;',
    '  display: inline-flex !important;',
    '  align-items: center !important;',
    '}',
    // Timestamps, dates, snippets, and secondary metadata in visible grey
    "[data-sessions-mode] :is(time, [class*='text-xs'], [class*='tabular-nums'], [class*='date'], [class*='time'], [class*='snippet'], [class*='preview'], [class*='desc']) {",
    '  color: var(--atr-ink-2) !important;',
    '  flex-shrink: 0 !important;',
    '  margin-left: auto !important;',
    '  white-space: nowrap !important;',
    '}',
    // 3-dot kebab icon: clear, visible medium-grey by default, bright white on hover
    "[data-sessions-mode] [data-row-actions] button svg,",
    "[data-sessions-mode] [data-slot='sidebar-menu-action'] svg {",
    '  color: var(--atr-ink-2) !important;',
    '  stroke: currentColor !important;',
    '}',
    "[data-sessions-mode] [data-row-actions] button:hover svg,",
    "[data-sessions-mode] [data-slot='sidebar-menu-action']:hover svg {",
    `  color: ${solidInk} !important;`,
    '}',
    // ── Session status indicators in chat history panel ──────────────────────
    // Remove the traveling border laser/arc animation around running session rows
    '.arc-border.arc-row,',
    ':root.dark .arc-border.arc-row {',
    '  display: none !important;',
    '  opacity: 0 !important;',
    '  animation: none !important;',
    '}',
    // Base indicator dot geometry: clean 6px circular dot
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[class*='rounded-full'],",
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status'] {",
    '  width: 6px !important;',
    '  height: 6px !important;',
    '  border-radius: 9999px !important;',
    '  display: inline-block !important;',
    '  flex-shrink: 0 !important;',
    '}',
    // Grey dot: not working right now (idle, draft, background, settled - clean slate default)
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[class*='rounded-full'] {",
    '  background: #64748b !important;',
    '  background-color: #64748b !important;',
    '  border-color: #64748b !important;',
    '  border: none !important;',
    '  box-shadow: none !important;',
    '  opacity: 0.65 !important;',
    '  animation: none !important;',
    '}',
    // Green dot: turn is done (unread / finished)
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='ui-success'], [aria-label*='finish' i], [title*='finish' i], [aria-label*='unread' i], [title*='unread' i]) {",
    '  background: #22c55e !important;',
    '  background-color: #22c55e !important;',
    '  border-color: #22c55e !important;',
    '  border: none !important;',
    '  box-shadow: 0 0 5px rgba(34, 197, 94, 0.45) !important;',
    '  opacity: 1 !important;',
    '  animation: none !important;',
    '}',
    // Yellow dot: action required (needs input, tool approval, clarify)
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='amber'], [aria-label*='input' i], [title*='answer' i], [title*='input' i]) {",
    '  background: #eab308 !important;',
    '  background-color: #eab308 !important;',
    '  border-color: #eab308 !important;',
    '  border: none !important;',
    '  box-shadow: 0 0 6px rgba(234, 179, 8, 0.55) !important;',
    '  opacity: 1 !important;',
    '  animation: none !important;',
    '}',
    // Blue dot: ONLY when actually running (working / stalled turn). Every
    // working/stalled dot already carries `ui-accent` and role=status, so the
    // old `:has(> .arc-row)` fallback was redundant — and it made Blink
    // re-evaluate :has() for every virtualized row mount while scrolling.
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='ui-accent'], [aria-label*='session running' i]) {",
    '  background: #3b82f6 !important;',
    '  background-color: #3b82f6 !important;',
    '  border-color: #3b82f6 !important;',
    '  border: none !important;',
    '  box-shadow: 0 0 6px rgba(59, 130, 246, 0.6) !important;',
    '  opacity: 1 !important;',
    '  position: relative !important;',
    // Static on purpose. An infinite pulse, however small, keeps the
    // compositor drawing the WHOLE window at display refresh (120 Hz) for as
    // long as any session runs, and every translucent surface above the
    // picture is re-composited each time. A lit dot says "running" just as well.
    '  animation: none !important;',
    '}',
    // The pulse ring rides a pseudo-element: transform and opacity only, so it
    // animates on the compositor instead of repainting the dot's box-shadow on
    // the main thread while the history list scrolls.
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='ui-accent'], [aria-label*='session running' i])::after {",
    "  content: ''; position: absolute; inset: -3px; border-radius: 9999px; pointer-events: none;",
    '  box-shadow: 0 0 0 1.5px rgba(59, 130, 246, 0.35) !important;',
    '  animation: none !important;',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    // Mirrors the running-dot selectors' specificity (plus html) so the
    // override actually wins; the shorter selector it replaced lost to the
    // dot rules and the pulse kept animating under reduced motion.
    "  html :is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status'],",
    "  html :is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']::after {",
    '    animation: none !important;',
    '  }',
    '}',
    // Section headers: PINNED, SESSIONS, YESTERDAY, MATRIX
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-group-label'], [class*='group-label'], [class*='sidebar-group-label'], h2, h3) {",
    '  color: var(--atr-ink-3) !important;',
    '  font-weight: 500;',
    '}',
    // Search input text and placeholder
    "[data-slot='sidebar-content'] input {",
    '  color: var(--atr-ink-1) !important;',
    '}',
    "[data-slot='sidebar-content'] input::placeholder {",
    '  color: var(--atr-ink-3) !important;',
    '  opacity: 1 !important;',
    '}',
    // Keyboard shortcut badges
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content']) kbd {",
    '  color: var(--atr-ink-3) !important;',
    '  border-color: rgba(148, 163, 184, 0.28) !important;',
    '  background: rgba(255, 255, 255, 0.05) !important;',
    '}',
    // Switch tabs: inactive tab in grey, active in white
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'] {`,
    '  color: var(--atr-ink-2) !important;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab']:hover {`,
    `  color: ${solidInk} !important;`,
    '}',
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'][data-active='true'] {`,
    '  color: var(--atr-ink-0) !important;',
    '}',
    // Hover state on panel items
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button']):hover {",
    `  color: ${solidInk} !important;`,
    '  background-color: rgba(255, 255, 255, 0.08) !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button']):hover * {",
    `  color: ${solidInk} !important;`,
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button']):hover :is(svg, [data-slot*='icon']) {",
    `  color: ${solidInk} !important;`,
    '}',
    // Profile rail at the bottom
    "[data-slot='profile-rail'] :is(span, p, div, label) {",
    '  color: var(--atr-ink-2) !important;',
    '}',
    "[data-slot='profile-rail'] :is(svg, [data-slot*='icon']) {",
    '  color: var(--atr-ink-3) !important;',
    '}',
    "[data-slot='user-message'] {",
    '  background: var(--atr-glass) !important;',
    `  color: ${solidInk} !important;`,
    '}',
    // The zone headers (the tab bar and the SESSIONS | BOTS strip) stay BARE:
    // no card, no edge, no radius. A card on the header AND a box on the tab
    // inside it read as a box in a box, and giving the header a fill put a card
    // behind the whole top bar, which is window chrome and not part of the
    // sidebar. Only the tab carries the material, so the header is the backdrop.
    //
    // The strip's own small track is the one thing that is painted, and it is
    // styled below with the switch: a pill hugging the two labels, not a card
    // spanning the column. That is what the reference look does.
    '[data-panel-header],',
    "[class~='group/pane-header'],",
    '[data-atr-strip] {',
    '  background: transparent;',
    '  border: none;',
    // The active tab paints nothing of its own: the pill on the track IS the
    // state now, and a tab fill under it would read as a box inside a box.
    '  --pane-tab-active-bg: transparent;',
    '  --pane-tab-strip-bg: transparent;',
    '  --pane-tab-active-accent: transparent;',
    '}',
    // ── SESSIONS | BOTS: one long sliding switch ──────────────────────────
    // Two boxes that trade places read as two buttons. A switch reads as ONE
    // control with two positions, so the strip's tablist becomes a recessed
    // track in the cards' material — long, centred — and the active state is a
    // pill that SLIDES between the halts. The labels never move; only the pill
    // does, which is the whole difference.
    // Only the switch lives on this strip. The app parks a minimize chevron in
    // the strip's trailing slot, and beside a two-position switch it reads as a
    // third control, so the strip is reduced to its tablist. The zone's own menu
    // still minimizes it.
    `${STRIP_HOOK} > *:not([role='tablist']) {`,
    '  display: none;',
    '}',
    // The strip is pinned to the BOTTOM of the header band, which the shell sizes
    // inline at 34px (titlebar) + 28px (tab row) = 62px. Two consequences, and
    // both are why this rule has no vertical padding at all:
    //   - zero bottom padding is what puts the switch in the exact 28px row the
    //     shell reserved for tabs, so it never reaches up into the titlebar band
    //     (a drag region) and nothing clips;
    //   - 10px inline is the column's own `px-2.5`, so the switch is exactly as
    //     wide as the cards underneath instead of wider than them.
    `${STRIP_HOOK} {`,
    '  height: auto;',
    '  padding: 0 0.625rem;',
    '}',
    // The history panel gives up a little floor, so a short window yields list
    // height to the switch instead of clipping it.
    "[data-sessions-mode] [class~='min-h-32'] {",
    '  min-height: 7rem;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'] {`,
    '  position: relative;',
    '  width: 100%;',
    '  min-height: 1.75rem;',
    '  margin-inline: auto;',
    // No inset at all: the pill covers a whole half of the track, edge to edge,
    // so the switch has no uncovered sliver at either end.
    '  padding: 0;',
    '  border: none;',
    '  border-radius: 999px;',
    // Recessed: a well, not a card, so the pill on top reads as the raised
    // piece instead of a card on a card.
    '  background: var(--atr-well);',
    '  box-shadow: inset 0 0 0 1px var(--atr-edge);',
    '  overflow: hidden;',
    '}',
    `${SWITCH_HOOK} > [role='tablist']::after {`,
    "  content: '';",
    '  position: absolute;',
    '  top: 0;',
    '  bottom: 0;',
    '  left: 0;',
    // Half the track, edge to edge, so a halt is the whole side and nothing is
    // left uncovered at either end.
    '  width: 50%;',
    '  border-radius: 999px;',
    '  background: var(--atr-glass-hover);',
    '  box-shadow: none;',
    '  transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1);',
    '  pointer-events: none;',
    '}',
    // The far halt: the SECOND label is the active one, so the pill rides over.
    `${SWITCH_HOOK} > [role='tablist']:has(> [data-slot='pane-tab']:last-child[data-active='true'])::after {`,
    '  transform: translateX(100%);',
    '}',
    // The labels: equal halves over the track, bare — no box, no underline, no
    // hover wash — and above the pill in paint order.
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'] {`,
    '  flex: 1 1 0;',
    '  min-width: 0;',
    '  position: relative;',
    '  z-index: 1;',
    '  margin: 0;',
    '  border: none;',
    '  border-radius: 999px;',
    '  background: transparent;',
    '  box-shadow: none;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab']:hover,`,
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'][data-active='true'] {`,
    '  background: transparent;',
    '  box-shadow: none;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'] [class~='pane-tab-content'] {`,
    '  justify-content: center;',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    `  ${SWITCH_HOOK} > [role='tablist']::after { transition: none; }`,
    '}',
    // The history scrolls without a scrollbar. `scrollbar-gutter: stable`
    // reserved a lane for a bar that is now hidden, and that reserved lane is
    // what made the column look uneven. Same idiom the app uses on its own
    // strip scrollers, so it stays consistent with the rest of the chrome.
    '[data-sessions-mode],',
    '[data-sessions-mode] [class~="scrollbar-fade"] {',
    '  scrollbar-gutter: auto;',
    '  scrollbar-width: none;',
    '  -ms-overflow-style: none;',
    '}',
    '[data-sessions-mode]::-webkit-scrollbar,',
    '[data-sessions-mode] [class~="scrollbar-fade"]::-webkit-scrollbar {',
    '  display: none;',
    '  width: 0;',
    '  height: 0;',
    '}',
    // Inset history items away from card borders with balanced breathing room
    '[data-sessions-mode] {',
    '  padding: 0.375rem 0.375rem 0.25rem;',
    '  box-sizing: border-box;',
    '}',
    // Lessen awkwardly large dead space at the bottom of the history panel
    "[data-sessions-mode] [class~='pb-1.75'] {",
    '  padding-bottom: 0.25rem;',
    '}',
    // Center bottom bar elements vertically so they are never shifted high
    "[data-slot='sidebar-content'] > div:last-child {",
    '  display: flex;',
    '  align-items: center;',
    '  padding: 0.25rem 0.375rem !important;',
    '}',
    "[data-slot='sidebar-content'] > div:last-child > [data-slot='profile-rail'],",
    "[data-slot='profile-rail'] {",
    '  display: flex;',
    '  align-items: center;',
    '  width: 100%;',
    '  margin: auto 0;',
    '}',
    "[data-slot='profile-rail'] button, [data-slot='profile-rail'] [role='button'] {",
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  vertical-align: middle;',
    '  margin: auto 0;',
    '}',
    "footer[data-slot='statusbar'], [data-slot='statusbar'] {",
    '  display: flex;',
    '  align-items: center;',
    '}',
    "[data-slot='statusbar'] > div {",
    '  display: flex;',
    '  align-items: center;',
    '  height: 100%;',
    '}',
    "[data-slot='statusbar'] button, [data-slot='statusbar'] a, [data-slot='statusbar'] span {",
    '  display: inline-flex;',
    '  align-items: center;',
    '  vertical-align: middle;',
    '}',
    // The chat slide on session switch lives in the always-on motion sheet
    // (§5b) with the rest of the interface motion, so it survives the background off.
    // Spacious chat margins setting: apply margins symmetrically from both sides,
    // keeping composer-bounds and thread full-width so the quick-jump timeline is never compressed,
    // and make the input bar short and centered to match the spacious layout.
    // When messages exist, constrain thread content to a comfortable reading column.
    "html[data-atr-margins='spacious'] [data-slot='aui_thread-content']:not([data-atr-intro]) {",
    '  --composer-width: min(46rem, calc(100% - 7rem));',
    '  max-width: min(46rem, calc(100% - 7rem)) !important;',
    '  margin-left: auto !important;',
    '  margin-right: auto !important;',
    // no inner padding: the column's edges ARE the composer's edges, so the
    // chat and the input box line up (user bubbles already sit flush, and the
    // reply text keeps Hermes's own small indent, like the composer's pad)
    '  padding-left: 0 !important;',
    '  padding-right: 0 !important;',
    '  box-sizing: border-box !important;',
    '}',
    // When thread has messages, also constrain message groups
    "html[data-atr-margins='spacious'] [data-slot='aui_thread-content'][data-atr-msgs] {",
    '  --composer-width: min(46rem, calc(100% - 7rem));',
    '  max-width: min(46rem, calc(100% - 7rem)) !important;',
    '  margin-left: auto !important;',
    '  margin-right: auto !important;',
    // no inner padding: the column's edges ARE the composer's edges, so the
    // chat and the input box line up (user bubbles already sit flush, and the
    // reply text keeps Hermes's own small indent, like the composer's pad)
    '  padding-left: 0 !important;',
    '  padding-right: 0 !important;',
    '  box-sizing: border-box !important;',
    '}',
    // In spacious margins mode, when chat is empty (intro / wordmark shown),
    // thread content and intro remain full-width (100%), so the HERMES AGENT
    // display lettering spans the full canvas, exactly as in non-spacious mode.
    "html[data-atr-margins='spacious'] [data-slot='aui_thread-content'][data-atr-intro],",
    "[data-slot='aui_thread-content'][data-atr-intro] {",
    '  --composer-width: 100% !important;',
    '  max-width: 100% !important;',
    '  width: 100% !important;',
    '  padding-left: 1.5rem !important;',
    '  padding-right: 1.5rem !important;',
    '  box-sizing: border-box !important;',
    '}',
    "html[data-atr-margins='spacious'] [data-slot='aui_thread-content'][data-atr-intro] > *,",
    "[data-slot='aui_thread-content'][data-atr-intro] > * {",
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '}',
    "[data-slot='aui_intro'] {",
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '  margin-inline: auto !important;',
    '}',
    "[data-slot='aui_intro'] > div {",
    '  --composer-width: 100% !important;',
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '  margin-inline: auto !important;',
    '}',
    "[data-slot='aui_intro'] :is(.wordmark, [class*='wordmark']) {",
    '  width: calc(100% - 1rem) !important;',
    '  max-width: 100% !important;',
    '  margin-inline: auto !important;',
    '}',
    "[data-slot='aui_intro'] p:last-child {",
    '  color: rgba(255, 255, 255, 0.92) !important;',
    '  max-width: 34rem !important;',
    '  margin-inline: auto !important;',
    '  font-size: 0.875rem !important;',
    '  line-height: 1.45 !important;',
    '}',
    // measured fit (fitColumn): exact left edge and width of the composer surface
    "html[data-atr-margins='spacious'] [data-slot='aui_thread-content'][data-atr-col-fit] {",
    '  margin-left: var(--atr-col-left) !important;',
    '  margin-right: 0 !important;',
    '  width: var(--atr-col-w) !important;',
    '  max-width: var(--atr-col-w) !important;',
    '  --composer-width: var(--atr-col-w);',
    '}',
    "html[data-atr-margins='spacious'] [data-slot='composer-bounds'],",
    "html[data-atr-margins='spacious'] [data-slot='thread'],",
    "html[data-atr-margins='spacious'] [data-slot='aui_thread-viewport'] {",
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '}',
    // Make the input dock also short and centered when spacious margins are on
    "html[data-atr-margins='spacious'] [data-slot='composer-dock']:not([data-popped-out]),",
    "html[data-atr-margins='spacious'] [data-slot='composer-root']:not([data-popped-out]):not([data-slot='composer-dock'] *) {",
    // the surface is the dock minus its 5px grab margin each side, so it is
    // exactly the chat column's min(46rem, 100% - 7rem)
    '  width: calc(min(46rem, calc(100% - 7rem)) + 10px) !important;',
    '  max-width: calc(100% - 1rem) !important;',
    '  left: 0 !important;',
    '  right: 0 !important;',
    '  margin-left: auto !important;',
    '  margin-right: auto !important;',
    '  transform: none !important;',
    '  translate: none !important;',
    '}',
    // Ensure prompt quick-jump timeline stays parked at the right edge, completely uncompressed
    "html[data-atr-margins='spacious'] [data-slot='thread-timeline'] {",
    '  position: absolute !important;',
    '  right: 0.5rem !important;',
    '  z-index: 40 !important;',
    '}',
    // Work progress collapse on finished turns lives in the always-on motion
    // sheet (§5b), not here: folding is an interface behaviour, not part of a
    // look, so it must survive the background being off. Search for "THE WORK FOLD".
  ] : [], chrome ? [
    // Night is a TONE of the same material now: the tint itself turns neutral
    // as the light goes (see atrMaterial), so there is no separate opaque
    // palette to switch on. What still needs saying over a dark ground
    // is that the composer's inner layers must not paint the app's own grey
    // behind the glass, and that its text stays on the ink ramp.
    ...(isNight
      ? [
          "[data-slot='sidebar-content'] > [data-sessions-mode],",
          "[data-slot='sidebar-content'] > [data-slot='sidebar-group'],",
          "[data-slot='sidebar-content'] > div:has(input),",
          "[data-slot='sidebar-content'] > div:last-child { opacity: 1 !important; }",
          "[data-slot='composer-root'] { --composer-fill: var(--atr-glass) !important; }",
          "[data-slot='composer-dock'],",
          "[data-slot='composer-root'],",
          "[class~='group/composer'] {",
          '  background: transparent !important;',
          '  background-color: transparent !important;',
          '}',
          ":is([data-slot='composer-surface'], [class~='group/composer-surface'], .composer-fallback-surface) {",
          '  --composer-fill: var(--atr-glass) !important;',
          '  background-color: var(--atr-glass) !important;',
          '  background: var(--atr-glass) !important;',
          '  border-radius: var(--atr-radius) !important;',
          '  overflow: hidden !important;',
          '  opacity: 1 !important;',
          '}',
          ":is([data-slot='composer-surface'], [class~='group/composer-surface']) > div:first-child,",
          ":is([data-slot='composer-surface'], [class~='group/composer-surface']) [class*='composerInputBacking'] {",
          '  background-color: var(--atr-glass) !important;',
          '  background: var(--atr-glass) !important;',
          '  border-radius: var(--atr-radius) !important;',
          '  opacity: 1 !important;',
          '}',
          "[data-slot='composer-status-stack'] > div[class*='rounded-t-'] { background: var(--atr-glass) !important; }",
          "form[data-slot='composer'] :is(textarea, input),",
          "[data-slot='composer-root'] :is(textarea, input, [contenteditable='true']) {",
          '  color: var(--atr-ink-0) !important;',
          '}',
          "form[data-slot='composer'] :is(textarea, input)::placeholder,",
          "[data-slot='composer-root'] :is(textarea, input, [contenteditable='true'])::placeholder,",
          "[data-slot='composer-root'] [data-placeholder]::before {",
          '  color: var(--atr-ink-3) !important;',
          '}',
          "form[data-slot='composer'] svg,",
          "[data-slot='composer-root'] svg {",
          '  color: var(--atr-ink-2) !important;',
          '}',
          ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is(.composer-human-message, [class*='composer-human-message']),",
          ":is(.composer-human-message, [class*='composer-human-message'], .composer-human-message-container) {",
          '  background: var(--atr-glass-hover) !important;',
          '  background-color: var(--atr-glass-hover) !important;',
          '  border-radius: var(--atr-radius) !important;',
          '  border: none !important;',
          '}',
          ":is(.composer-human-message, [class*='composer-human-message']):hover {",
          '  background: var(--atr-glass-hover) !important;',
          '}',
          ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) [class*='group-hover/user-message'] {",
          '  background: transparent !important;',
          '}'
        ]
      : []),
    '@media (prefers-reduced-motion: reduce) { body::before { transition: none; } }',
    // ── Tool output on the picture ──────────────────────────────────────────
    // An open tool block (a command, its output, a payload) sat straight on
    // the backdrop with tertiary ink, and vanished over a bright passage
    // It now gets the sidebar-card ground, its command
    // and output step up to ink-1, and the transcript line sits in a well.
    // Closed rows keep the open picture; over a bright one they get a soft shadow.
    "[data-slot='tool-block'][data-tool-open] { background: var(--atr-side-card) !important; border: 0 !important; border-radius: var(--atr-radius) !important; box-shadow: var(--atr-lift) !important; }",
    "[data-slot='tool-block'][data-tool-open] :is(pre, code) { color: var(--atr-ink-1) !important; }",
    "[data-slot='tool-block'][data-tool-open] div:has(> code) { background: var(--atr-well) !important; border-color: var(--atr-edge) !important; }",
    "[data-slot='tool-block'][data-tool-open] [class*='tracking-[0.08em]'] { color: var(--atr-ink-2) !important; }",
    ...(isNight ? [] : ["[data-slot='tool-block']:not([data-tool-open]), .atr-work-summary { text-shadow: 0 1px 0.5rem rgba(0, 0, 0, 0.35); }"]),
  ] : [], chrome ? [
    // ── Atrium material ─────────────────────────────────────────────────────
    // One glass for every surface, tinted by the look itself: the skin's ground
    // pulled toward its own card and bubble tints, so the sidebar, the composer
    // and the menus are one material rather than two that appear to swap as you
    // move between them. Large surfaces get NO backdrop-filter: the painting
    // behind them is a still image, so re-blurring it is pure GPU cost. Only
    // small, transient surfaces (menus, popovers, tooltips) frost live.
    ':root {',
    `  --atr-tint: ${cssRgb(zf.tint)};`,
    `  --atr-tint-hi: ${cssRgb(zf.tintHi)};`,
    `  --atr-glass: color-mix(in srgb, var(--atr-tint) ${glassPct(84 + 12 * NIGHT)}, transparent);`,
    `  --atr-glass-hover: color-mix(in srgb, var(--atr-tint-hi) ${glassPct(88 + 8 * NIGHT)}, transparent);`,
    `  --atr-glass-strong: color-mix(in srgb, var(--atr-tint) ${glassPct(94 + 4 * NIGHT)}, transparent);`,
    `  --atr-glass-sunk: color-mix(in srgb, var(--atr-tint) ${glassPct(50 + 30 * NIGHT)}, transparent);`,
    `  --atr-well: rgba(0, 0, 0, ${(0.16 + 0.08 * NIGHT).toFixed(3)});`,
    // Prompt/command wells need more than a black wash over an already dark
    // sheet: an opaque mix of the hour's tint and black gives a real step.
    '  --atr-well-prompt: color-mix(in srgb, var(--atr-tint) 50%, #000);',
    '  --atr-edge: rgba(255, 255, 255, 0.07);',
    // every card in the sessions column paints this one fill
    // Every card, the composer and the sidebar are the same tier now; the
    // night grey is carried by `--atr-tint` itself, so a material can never be
    // opaque on one surface and translucent on the next after dark.
    // Sidebar cards are the exception: they are the Sidebar opacity slider's
    // surface, so they read the card fill rather than the tint.
    `  --atr-side-card: ${sideCard};`,
    '  --atr-side-card-hi: var(--atr-glass-hover);',
    '  --atr-edge-strong: rgba(255, 255, 255, 0.11);',
    '  --atr-hover: rgba(255, 255, 255, 0.065);',
    '  --atr-lift: inset 0 0 0 1px var(--atr-edge), inset 0 1px 0 rgba(255, 255, 255, 0.045);',
    '  --atr-lift-high: inset 0 0 0 1px var(--atr-edge-strong), inset 0 1px 0 rgba(255, 255, 255, 0.06);',
    // One shadow for anything that floats above the app: dialogs, menus,
    // popovers, the drawer, the dock and the floating sidebar. It used to be
    // five different recipes (14px/36px, 24px/60px, 30px/80px, ...).
    '  --atr-lift-float: 0 0 0 1px var(--atr-edge-strong), 0 16px 40px rgba(0, 0, 0, 0.34), 0 2px 8px rgba(0, 0, 0, 0.18);',
    '  --atr-frost: blur(1.25rem) saturate(1.35);',
    // Radii live in polishCss's token block (`--atr-r-1..4`), which is always
    // emitted after this one; keeping a second copy here only invited drift.
    `  --atr-ink-0: ${cssRgb(zf.ink[0])};`,
    `  --atr-ink-1: ${cssRgb(zf.ink[1])};`,
    `  --atr-ink-2: ${cssRgb(zf.ink[2])};`,
    `  --atr-ink-3: ${cssRgb(zf.ink[3])};`,
    `  --atr-accent: ${SKIN.accent};`,
    '}',
    // Outside the :root block, on purpose: these are rules, not custom
    // properties, and a stray `{` inside a declaration block makes the parser
    // swallow everything after it.
    ...materialVars(),
  ] : [], chrome ? [
    ...SESSION_TAB_CSS,
    ...gruvboxTextCss(),
    ...polishCss(),
    // Sidebar cards, the composer and the switch pill share the material.
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'],",
    "[data-slot='sidebar-content'] > [data-sessions-mode],",
    "[data-slot='sidebar-content'] > div:has(input),",
    "[data-slot='sidebar-content'] > div:last-child {",
    '  box-shadow: none !important;',
    '}',
    // One gutter and one row shape inside every sidebar card. The nav card used
    // to be flush (padding 0, square rows) while the sessions card was inset,
    // so two card languages sat in the same 250px column.
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'],",
    "[data-slot='sidebar-content'] > [data-sessions-mode],",
    "[data-slot='sidebar-content'] > div:has(input),",
    "[data-slot='sidebar-content'] > div:last-child {",
    '  padding: 4px !important;',
    '}',
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'] [data-slot='sidebar-menu'] { gap: 1px !important; }",
    "[data-slot='sidebar-content'] [data-slot='sidebar-group'] [data-slot='sidebar-menu-button'],",
    "[data-slot='sidebar-content'] [data-sessions-mode] [data-slot='sidebar-menu-button'] {",
    '  border-radius: var(--atr-r-2, 8px) !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button']):hover {",
    '  background-color: var(--atr-hover) !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button'])[data-active='true'] {",
    '  background-color: color-mix(in srgb, var(--atr-accent) 14%, transparent) !important;',
    '}',
    // The top nav rows (New session, Capabilities, Messaging, …) mark their
    // active page with a class, not data-active, so they kept the app's grey
    // fill. They take the same time-of-day accent as the session rows, and
    // their icons pick it up on hover and when active.
    "[data-slot='sidebar-menu-button'][data-atr-nav][class*='bg-(--ui-control-active-background)'] {",
    '  background-color: color-mix(in srgb, var(--atr-accent) 14%, transparent) !important;',
    '  border-color: color-mix(in srgb, var(--atr-accent) 22%, transparent) !important;',
    '  color: var(--atr-ink-0) !important;',
    '}',
    "[data-slot='sidebar-menu-button'][data-atr-nav] > svg,",
    "[data-slot='sidebar-menu-button'][data-atr-nav] > i {",
    '  transition: color 120ms ease;',
    '}',
    "[data-slot='sidebar-menu-button'][data-atr-nav]:is(:hover, [class*='bg-(--ui-control-active-background)']) > :is(svg, i, [class*='codicon']) {",
    '  color: var(--atr-ink-0) !important;',
    '}',
    ":is([data-slot='composer-surface'], [class~='group/composer-surface'], .composer-fallback-surface) {",
    '  background: var(--atr-glass) !important;',
    '  box-shadow: var(--atr-lift) !important;',
    '  transition: box-shadow 160ms ease;',
    '}',
    ":is([data-slot='composer-surface'], [class~='group/composer-surface'], .composer-fallback-surface):focus-within {",
    '  box-shadow: var(--atr-lift) !important;',
    '}',
    // No focus ring on the input bar: the caret is enough.
    "[data-slot='composer-root'] :is(textarea, input, [contenteditable='true']):is(:focus, :focus-visible) {",
    '  outline: none !important;',
    '  box-shadow: none !important;',
    '}',
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is(.composer-human-message, [class*='composer-human-message']):not(.composer-human-message-container),",
    ":is(.composer-human-message, [class*='composer-human-message']):not(.composer-human-message-container) {",
    '  box-shadow: var(--atr-lift) !important;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'],`,
    `${SWITCH_HOOK} > [role='tablist']::after {`,
    '  box-shadow: none;',
    '}',
    // ── The rest of the app ────────────────────────────────────────────────
    // Pages in the workspace (Artifacts, Skills, Messaging…) are full-height
    // sections painted with the chat token, which glass mode clears; with the
    // body cleared for the picture they had no ground at all. They get the glass.
    "section[class*='bg-(--ui-chat-surface-background)']:not([data-chat-surface]) {",
    '  background: var(--atr-glass) !important;',
    '  color: var(--atr-ink-1);',
    '}',
    // …and float like every other card: inset from the window, rounded, edged.
    "section[class*='bg-(--ui-chat-surface-background)']:not([data-chat-surface]):not(section *) {",
    '  margin: var(--atr-page-gap, 0.5rem) !important;',
    '  height: calc(100% - 2 * var(--atr-page-gap, 0.5rem)) !important;',
    '  max-height: calc(100% - 2 * var(--atr-page-gap, 0.5rem));',
    '  border-radius: var(--atr-radius-lg) !important;',
    '  overflow: hidden !important;',
    '  box-shadow: var(--atr-lift) !important;',
    '  box-sizing: border-box !important;',
    '}',
    "section[class*='bg-(--ui-chat-surface-background)']:not([data-chat-surface]) :is(footer, section)[class*='bg-(--ui-chat-surface-background)'] {",
    '  background: transparent !important;',
    '}',
    // Overlays (Settings, Command Center, Agents, Cron, Profiles…): a light
    // scrim so the painting stays present, and one raised glass card on it.
    '[data-overlay-surface] {',
    '  background: rgba(3, 6, 14, 0.2) !important;',
    '  backdrop-filter: none !important;',
    '  -webkit-backdrop-filter: none !important;',
    '}',
    '[data-overlay-surface] [data-glass-raised] {',
    '  --ui-chat-surface-background: transparent;',
    '  --ui-sidebar-surface-background: var(--atr-well);',
    '  background: var(--atr-glass-strong) !important;',
    '  border-color: transparent !important;',
    '  border-radius: var(--atr-radius-lg) !important;',
    '  box-shadow: var(--atr-lift-float) !important;',
    '  color: var(--atr-ink-1);',
    '}',
    '[data-overlay-surface] [data-glass-raised] aside {',
    '  background: var(--atr-well) !important;',
    '  box-shadow: inset -1px 0 0 var(--atr-edge);',
    '}',
    // The right sidebar (files, review, terminal host) matches the left column.
    "aside[class*='bg-(--ui-sidebar-surface-background)'][class*='pt-(--titlebar-height)'] {",
    '  background: var(--atr-glass) !important;',
    '  border-color: var(--atr-edge) !important;',
    '  box-shadow: none !important;',
    '}',
    // Persistent frost off. Hermes ships backdrop-blur on the composer surface
    // and the status-stack cards (composerSurfaceGlass, 0.75rem) plus a few
    // Tailwind utilities. Every one of them re-samples and re-blurs its backdrop
    // on each scroll frame over the picture, and each carries an 88%+ fill, so
    // the frost was invisible work. Only the short-lived surfaces below keep it.
    ":is([class*='backdrop-'], [data-slot='composer-surface'], [data-slot='composer-status-stack'] *):not(:is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [data-slot='menubar-content'], [data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content'], [data-slot='tooltip-content'])) {",
    '  backdrop-filter: none !important;',
    '  -webkit-backdrop-filter: none !important;',
    '}',
    // Menus, popovers, selects, tooltips, dialogs and the command palette:
    // small and short-lived, so these are the ones that frost live.
    ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [data-slot='menubar-content']) {",
    '  background: var(--atr-glass-strong) !important;',
    '  border-color: transparent !important;',
    '  border-radius: var(--atr-radius) !important;',
    '  box-shadow: var(--atr-lift-float) !important;',
    '  backdrop-filter: var(--atr-frost);',
    '  -webkit-backdrop-filter: var(--atr-frost);',
    '  color: var(--atr-ink-1);',
    '}',
    ":is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content'], [data-slot='select-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-sub-content']) :is([role='menuitem'], [role='option'], [role='menuitemcheckbox'], [role='menuitemradio']):is(:hover, [data-highlighted], :focus-visible),",
    // cmdk pickers (model, station, command palette) mark their row with data-selected, not focus
    ":is([data-slot='popover-content'], [data-slot='dialog-content'], [data-slot='command']) :is([cmdk-item], [data-slot='command-item'])[data-selected='true'] {",
    '  background: var(--atr-hover) !important;',
    '  color: var(--atr-ink-0) !important;',
    '}',
    // ── One menu kit ──
    // Hermes already routes every floating list through one class set; these
    // pin its pieces to Atrium's tokens so Hermes menus, cmdk pickers and the
    // status card read as one family: concentric radii, one ink ramp, one
    // edge colour, one icon size, accent only on the check.
    `${MENU_SURFACES} { padding: 0.25rem !important; }`,
    `${MENU_SURFACES} ${MENU_ROWS} {`,
    '  border-radius: var(--atr-r-2, 8px) !important;',
    '  color: var(--atr-ink-1);',
    '  gap: 0.5rem;',
    '}',
    `${MENU_SURFACES} ${MENU_ROWS} svg:not([class*='text-destructive']):not([class*='text-red']) { color: var(--atr-ink-2); }`,
    `${MENU_SURFACES} ${MENU_ROWS}:is(:hover, [data-highlighted], [data-selected='true'], :focus-visible) svg:not([class*='text-destructive']):not([class*='text-red']) { color: var(--atr-ink-0); }`,
    `${MENU_SURFACES} :is([data-slot$='-label'], [cmdk-group-heading]) { color: var(--atr-ink-3) !important; }`,
    `${MENU_SURFACES} :is([data-slot$='-separator'], [role='separator'], [cmdk-separator]) { background: var(--atr-edge) !important; }`,
    `${MENU_SURFACES} :is([data-slot$='-shortcut'], kbd, [data-slot='kbd']) { color: var(--atr-ink-3) !important; background: transparent !important; border-color: var(--atr-edge) !important; }`,
    `${MENU_SURFACES} :is([data-slot$='-item-indicator'], [data-state='checked'] > span:first-child) svg { color: var(--atr-ink-0) !important; }`,
    `${MENU_SURFACES} [data-slot='command-input-wrapper'] { border-color: var(--atr-edge) !important; }`,
    `${MENU_SURFACES} [data-slot='command-input'] { background: transparent !important; color: var(--atr-ink-0); }`,
    "[data-slot='tooltip-content'] { border-radius: var(--atr-r-2, 8px) !important; }",
    ":is([data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content']) {",
    '  background: var(--atr-glass-strong) !important;',
    '  border-color: transparent !important;',
    '  box-shadow: var(--atr-lift-float) !important;',
    // Large sheets do not frost live: this was the one remaining big-surface
    // backdrop blur, and a still picture gains nothing from re-blurring it.
    '  backdrop-filter: none;',
    '  -webkit-backdrop-filter: none;',
    '  color: var(--atr-ink-1);',
    '}',
    "[data-slot='sheet-content'] { border-radius: var(--atr-radius-lg) !important; }",
    ":is([data-slot='dialog-content'], [data-slot='alert-dialog-content']) { border-radius: var(--atr-radius-lg) !important; }",
    // ── The command prompt: the sheet, its well, its actions ──────────────
    // A command is content INSIDE the dialog, not a second dialog. The host's
    // LogView was a hairline box with no fill at the sheet's own edge, and its
    // `rounded-lg` resolved against the app's .2 radius scalar (2.4px) while
    // the sheet sits at 16px, so it read as a cramped, square-cornered cut-out.
    // One step down the surface ladder: a recessed well, its own breathing
    // room, and the control radius shared with the password field.
    // The `html body …[class]` shape is deliberate: the app's global hairline
    // rule is more specific than a bare `[data-slot]` selector, so these
    // declarations have to outrank it or the well keeps the app's border.
    "html body [data-slot='dialog-content'][class][data-state],",
    "html body [data-slot='alert-dialog-content'][class][data-state],",
    "html body [data-slot='sheet-content'][class][data-state] {",
    '  border-color: transparent !important;',
    '}',
    // A 20px gutter keeps the well's curve clear of the 16px sheet corner.
    "[data-slot='dialog-content'] > div[class*='grid'] {",
    '  padding: 1.25rem !important;',
    '}',
    "html body [data-slot='dialog-content'] [role='region'][data-selectable-text='true'] {",
    '  margin: 0.25rem 0 0.5rem !important;',
    '  padding: 0.5rem 0.75rem !important;',
    '  min-height: 2.25rem !important;',
    '  background: var(--atr-well-prompt) !important;',
    '  border: 1px solid var(--atr-edge) !important;',
    '  border-radius: var(--atr-r-2, 8px) !important;',
    '  color: var(--atr-ink-1) !important;',
    '  font-size: 0.75rem !important;',
    '  line-height: 1.55 !important;',
    '  overflow-wrap: anywhere;',
    '  scrollbar-gutter: stable;',
    '  scrollbar-width: thin;',
    '}',
    // The password field is the same control family as the well above: one
    // fill, one hairline, one radius. Focus owns the ring; the base state does
    // not paint a second inset shadow.
    "html body [data-slot='dialog-content'][class] :is(input:not([type='checkbox']):not([type='radio']):not([type='range']), textarea)[class] {",
    '  background: var(--atr-well-prompt) !important;',
    '  border-radius: var(--atr-r-2, 8px) !important;',
    '  min-height: 2.25rem;',
    '  padding: 0.5rem 0.75rem !important;',
    '  color: var(--atr-ink-0) !important;',
    '  font-size: 0.8125rem !important;',
    '  caret-color: var(--atr-ink-0);',
    '}',
    // Border and shadow live in the two state rules, so the focused state can
    // never lose its ring to the base declaration (both are the same selector
    // plus one pseudo-class).
    "html body [data-slot='dialog-content'][class] :is(input:not([type='checkbox']):not([type='radio']):not([type='range']), textarea)[class]:not(:focus-visible) {",
    '  border: 1px solid var(--atr-edge) !important;',
    '  box-shadow: none !important;',
    '}',
    "html body [data-slot='dialog-content'][class] :is(input:not([type='checkbox']):not([type='radio']):not([type='range']), textarea)[class]:focus-visible {",
    '  border: 1px solid color-mix(in srgb, var(--atr-accent) 60%, transparent) !important;',
    '  box-shadow: 0 0 0 3px color-mix(in srgb, var(--atr-accent) 16%, transparent) !important;',
    '  outline: none !important;',
    '}',
    "html body [data-slot='dialog-content'][class] :is(input, textarea)[aria-invalid='true']:not(:focus-visible) {",
    '  border-color: var(--dt-destructive, #cf2d56) !important;',
    '}',
    "html body [data-slot='dialog-content'] :is(input, textarea)::placeholder {",
    '  color: var(--atr-ink-3) !important;',
    '  opacity: 1;',
    '}',
    // Chromium paints autofill with its own yellow/blue slab over the well.
    "html body [data-slot='dialog-content'] input:-webkit-autofill,",
    "html body [data-slot='dialog-content'] input:-webkit-autofill:hover,",
    "html body [data-slot='dialog-content'] input:-webkit-autofill:focus {",
    '  -webkit-box-shadow: 0 0 0 1000px var(--atr-well-prompt) inset !important;',
    '  -webkit-text-fill-color: var(--atr-ink-0) !important;',
    '  caret-color: var(--atr-ink-0);',
    '}',
    // The always-allow confirmation shows the command in a plain <pre> rather
    // than a LogView; it belongs to the same well family.
    "html body [data-slot='dialog-content'][class] pre[class] {",
    '  margin: 0.25rem 0 0.5rem !important;',
    '  padding: 0.5rem 0.75rem !important;',
    '  background: var(--atr-well-prompt) !important;',
    '  border: 1px solid var(--atr-edge) !important;',
    '  border-radius: var(--atr-r-2, 8px) !important;',
    '  color: var(--atr-ink-1) !important;',
    '  font-size: 0.75rem !important;',
    '  line-height: 1.55 !important;',
    '  overflow-wrap: anywhere;',
    '}',
    // A footer is an action bar, not another row of content: one hairline and
    // a little air put Cancel/Send apart from the form above.
    "html body [data-slot='dialog-content'][class] [data-slot='dialog-footer'] {",
    '  margin-top: 0.1rem;',
    '  padding-top: 0.75rem;',
    '  border-top: 1px solid var(--atr-edge);',
    '  border-top-color: var(--atr-edge) !important;',
    '  gap: 0.5rem;',
    '}',
    "[data-slot='dialog-footer'] [data-slot='button'] {",
    '  min-height: 2rem;',
    '  border-radius: var(--atr-r-control) !important;',
    '}',
    // ── Command approval (the transcript card) ────────────────────────────
    // The host paints this card with the chat-surface token, so it was the one
    // card in a conversation that did not wear Atrium's material. One 12px
    // frame around header + code + actions, one well for the command, and the
    // actions on their own band.
    "html body :is([data-slot='card-stack-surface'], [data-slot='card-stack-edge'])[class] {",
    '  background: var(--atr-side-card) !important;',
    '  border: 0 !important;',
    '  border-radius: var(--atr-radius) !important;',
    '  box-shadow: var(--atr-lift) !important;',
    '}',
    "[data-slot='tool-approval-card'] {",
    '  padding: 0.75rem 0.75rem 0.5rem;',
    '}',
    "[data-slot='tool-approval-card'] > div:first-child {",
    '  padding: 0 0 0.5rem !important;',
    '  color: var(--atr-ink-2) !important;',
    '}',
    "[data-slot='tool-approval-card'] > pre {",
    '  margin: 0 0 0.5rem !important;',
    '  padding: 0.75rem !important;',
    '  background: var(--atr-well-prompt) !important;',
    '  border: 1px solid var(--atr-edge-strong) !important;',
    '  border-radius: var(--atr-r-1, 4px) !important;',
    '  color: var(--atr-ink-1) !important;',
    '  font-size: 0.75rem !important;',
    '  line-height: 1.55 !important;',
    '  overflow-wrap: anywhere;',
    '  scrollbar-gutter: stable;',
    '}',
    "[data-slot='tool-approval-actions'] {",
    '  padding: 0.5rem 0 0 !important;',
    '  border-top: 1px solid var(--atr-edge);',
    '  gap: 0.35rem !important;',
    '}',
    "[data-slot='tool-approval-actions'] [data-slot='button'] {",
    '  min-height: 1.75rem;',
    '  border-radius: var(--atr-r-control) !important;',
    '}',
    "[data-slot='tool-approval-actions'] [data-variant='secondary'] {",
    '  background: var(--atr-hover) !important;',
    '  color: var(--atr-ink-1) !important;',
    '}',
    "[data-slot='tool-approval-actions'] [data-variant='secondary']:hover {",
    '  background: color-mix(in srgb, var(--atr-ink-0) 10%, transparent) !important;',
    '}',
    ":is([data-slot='dialog-content'], [data-slot='popover-content']) [data-slot='command'] { background: transparent !important; }",
    "[data-slot='tooltip-content'] {",
    '  background: var(--atr-glass-strong) !important;',
    '  color: var(--atr-ink-0) !important;',
    '  border: none !important;',
    '  box-shadow: var(--atr-lift) !important;',
    '  backdrop-filter: var(--atr-frost);',
    '  -webkit-backdrop-filter: var(--atr-frost);',
    '}',
    "[data-slot='tooltip-content'] svg[class*='fill-'] { fill: var(--atr-glass-strong) !important; }",
    // Inline widgets in the transcript (approvals, clarify prompts, code and
    // diff cards) sit on the picture too, so they wear the same card.
    ":is([data-slot='aui_thread-content'], [data-slot='thread']) :is([data-slot='clarify-inline'], [data-slot='code-card'], [data-slot='file-diff-panel'], [class*='bg-(--ui-widget-surface-background)'], [class*='bg-(--ui-chat-surface-background)']) {",
    '  background: var(--atr-glass) !important;',
    '  border-color: transparent !important;',
    '  border-radius: var(--atr-radius) !important;',
    '  box-shadow: var(--atr-lift) !important;',
    '}',
    // Form controls inside any Atrium surface: a recessed well, accent focus.
    ":is([data-overlay-surface], section[class*='bg-(--ui-chat-surface-background)'], [data-slot='dialog-content']) :is(input:not([type='checkbox']):not([type='radio']):not([type='range']), textarea, [data-slot='select-trigger'], [data-slot='searchable-select-trigger']) {",
    '  background: var(--atr-well) !important;',
    '  border-color: var(--atr-edge) !important;',
    '}',
    ":is([data-overlay-surface], section[class*='bg-(--ui-chat-surface-background)'], [data-slot='dialog-content']) :is(input, textarea, [data-slot='select-trigger']):focus-visible {",
    '  border-color: color-mix(in srgb, var(--atr-accent) 55%, transparent) !important;',
    '  box-shadow: 0 0 0 3px color-mix(in srgb, var(--atr-accent) 14%, transparent) !important;',
    '  outline: none !important;',
    '}',
    ...groupedFieldCss(),
    // Scrollbars everywhere: thin and tinted, never the platform grey slab.
    '* { scrollbar-color: rgba(255, 255, 255, 0.14) transparent; scrollbar-width: thin; }',
    ...SIDEBAR_CSS,
    ...MORPH_CSS,
    // Tint tokens and scrollbars must win over the shared chrome above.
    ...(glass ? glassChromeCss() : []),
  ] : []].map(lines => lines.join('\n'))
  // Two style elements by contract: `paintSheet` installs exactly the two
  // entries in SHEET_IDS and silently drops anything past that. The array above
  // is assembled as five cascade-ordered groups (backdrop, the chrome tokens,
  // the tool/media rules, the widget tokens and the big rule block) and the
  // first two of those carry almost none of Atrium's own custom properties:
  // --atr-side-card, --theme-neutral-card and the rest live in the later
  // groups. Returning them raw meant every sidebar card read an undefined
  // variable and painted nothing, and Card opacity changed a token that was
  // never installed. Fold the groups into two halves: everything up to and
  // including the widget-token group is the base sheet, the rule block is the
  // details sheet. Keep them in order, because the rule block has to win.
  if (split) {
    const defined = sections.filter(Boolean)
    const details = defined[defined.length - 1] || ''
    return [defined.slice(0, -1).join('\n'), details]
  }
  const header = glass
    ? `/* Hermes Atrium · glass. Tint ${GLASS.ground} at ${Number((1 - GLASS.tint).toFixed(4))} over the native window material. */`
    : LOOK_MODE === 'custom'
      ? `/* Hermes Atrium · custom. Your own picture and colours, from hermes-atrium-theme.json. */`
      : `/* Hermes Atrium · gruvbox. ${PAINTING_FILE}, full ${4096}×${2428}, cover-fitted. */`
  return [header, ...sections.filter(Boolean)].join('\n')
}

// ══ §5 APP MOTION (fold + interface animation, independent of the look) ════

// Interface motion is not part of the painted sheet: it must survive both the
// Background switch and Hermes Atrium styling being off, so it lives in its own
// always-on <style> (like the snippet sheet), never in sheetCss — that
// sheet is rewritten whenever a look changes (which would restart keyframes)
// and is removed when nothing of Atrium is on screen.
//
// The rules are deliberately cheap: opacity and transform only (compositor),
// plus paint-only colour swaps for hover and press. Nothing here animates a
// layout property, nothing runs continuously, and every duration is a token,
// so "Motion off" and reduced-motion both collapse the whole sheet to 1ms.
const MOTION_CSS = [
  // ── Tokens ──────────────────────────────────────────────────────────────
  // Three beats: t-1 for exits and presses, t-2 for hovers and small
  // entrances, t-3 for the moments worth watching (the fold, dialogs).
  // The pacing is deliberately unhurried: at 90ms an exit read as a hard cut,
  // so the floor is ~140ms everywhere and nothing exceeds 280ms.
  ':root {',
  '  --atr-t-1: 140ms;',
  '  --atr-t-2: 200ms;',
  '  --atr-t-3: 280ms;',
  // A calmer deceleration than a fast-start curve: eases reach their settle
  // without the initial snap that read as jarring on hovers and exits.
  '  --atr-ease: cubic-bezier(0.33, 1, 0.68, 1);',
  '  --atr-ease-out: cubic-bezier(0.16, 1, 0.3, 1);',
  '}',
  // The Motion switch (Settings > Hermes Atrium) and the OS setting both zero the
  // tokens; @starting-style and allow-discrete still apply instantly, so
  // nothing is left half-faded.
  "html[data-atr-motion='off'] {",
  '  --atr-t-1: 1ms;',
  '  --atr-t-2: 1ms;',
  '  --atr-t-3: 1ms;',
  '}',
  '@media (prefers-reduced-motion: reduce) {',
  '  :root {',
  '    --atr-t-1: 1ms;',
  '    --atr-t-2: 1ms;',
  '    --atr-t-3: 1ms;',
  '  }',
  '}',
  // ── THE WORK FOLD (opening and closing the reasoning chain) ─────────────
  // A pure dissolve: compositor-only opacity, no drift. Motion that fought
  // the layout snap read as ghosting — the geometry now moves either before
  // the fade (opening) or after it (closing), never during. `display` joins
  // through allow-discrete so the box survives its own fade; the reveal
  // declares its from-state with @starting-style. Engines without
  // allow-discrete simply get the old instant snap.
  //
  // The duration split is what makes one transition read per direction: the
  // collapsed destination carries fast (t-1, the close), the base state slow
  // (t-3, the open). On close the shape only collapses when the fade ends,
  // so the settle that keeps the transcript still is deferred to that moment
  // (see pinWhileFolding in §9).
  "html[data-atr-collapse-work='on'] [data-atr-work-collapsed='true'] [data-conversation-scaffold],",
  "html[data-atr-collapse-work='on'] [data-atr-work-collapsed='true'] > :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-tool-group], [data-tool-summary]),",
  // Prose said between tool calls folds with them; only the reply that
  // follows the last work block is exempt (marked by markInterimProse).
  "html[data-atr-collapse-work='on'] [data-atr-work-collapsed='true'] .aui-md[data-atr-work-interim='true'],",
  "html[data-atr-collapse-work='on'] [data-atr-work-collapsed='true'] > *:not(.atr-work-summary):not(.aui-md):not([data-slot*='actions']):not([data-slot*='feedback']):not([data-slot*='composer']) {",
  '  display: none !important;',
  '  opacity: 0;',
  // the fading work must not take a click meant for what is below it
  '  pointer-events: none;',
  '  transition-duration: var(--atr-t-1);',
  '}',
  "[data-slot='aui_assistant-message-content'] [data-conversation-scaffold],",
  "[data-slot='aui_assistant-message-content'] > :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-tool-group], [data-tool-summary]),",
  "[data-slot='aui_assistant-message-content'] > *:not(.atr-work-summary):not(.aui-md):not([data-slot*='actions']):not([data-slot*='feedback']):not([data-slot*='composer']),",
  ".aui-md[data-atr-work-interim='true'] {",
  '  transition: opacity var(--atr-t-3) var(--atr-ease), display var(--atr-t-3) allow-discrete;',
  '}',
  // Transitions never start from display:none on their own, so the reveal
  // needs its from-state declared. It only ever fires when a fold opens.
  '@starting-style {',
  "  [data-slot='aui_assistant-message-content'] [data-conversation-scaffold],",
  "  [data-slot='aui_assistant-message-content'] > :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-tool-group], [data-tool-summary]),",
  "  [data-slot='aui_assistant-message-content'] > *:not(.atr-work-summary):not(.aui-md):not([data-slot*='actions']):not([data-slot*='feedback']):not([data-slot*='composer']),",
  "  .aui-md[data-atr-work-interim='true'] {",
  '    opacity: 0;',
  '  }',
  '}',
  "html[data-atr-collapse-work='on'] [data-atr-work-collapsed='true'] {",
  '  row-gap: 0.25rem !important;',
  '  gap: 0.25rem !important;',
  '}',
  // Tight natural margin between work summary and model response text
  "html[data-atr-collapse-work='on'] [data-atr-work-collapsed='true'] > .aui-md,",
  "html[data-atr-collapse-work='on'] [data-atr-work-collapsed='true'] .aui-md {",
  '  margin-top: 0.25rem !important;',
  '  padding-top: 0 !important;',
  '}',
  "html[data-atr-collapse-work='on'] [data-atr-work-collapsed='true'] > .aui-md > *:first-child,",
  "html[data-atr-collapse-work='on'] [data-atr-work-collapsed='true'] .aui-md > *:first-child {",
  '  margin-top: 0 !important;',
  '  padding-top: 0 !important;',
  '}',
  ".atr-work-summary[data-live] .atr-work-summary-label {",
  // no pulse animation: it would re-composite the glass window every frame;
  // the once-a-second count is the sign of life
  '  color: var(--atr-ink-1, currentColor);',
  '}',
  '.atr-work-summary {',
  '  display: inline-flex;',
  '  align-items: center;',
  '  gap: 0.25rem;',
  '  padding: 0.125rem 0 !important;',
  '  margin: 0 0 0.15rem 0 !important;',
  '  border: none !important;',
  '  background: transparent !important;',
  '  box-shadow: none !important;',
  '  font-family: inherit;',
  '  font-size: var(--conversation-tool-font-size, 0.75rem);',
  '  line-height: var(--conversation-line-height, 1.4);',
  '  color: var(--conversation-scaffold-text, var(--ui-text-tertiary, var(--atr-ink-3)));',
  '  cursor: pointer;',
  '  user-select: none;',
  '  transition: color var(--atr-t-2) var(--atr-ease);',
  '  vertical-align: middle;',
  // A <button> centres its own text (user-agent default), so a label that
  // wrapped to a second line centred that line under the first and the row
  // read as two ragged halves. The button is the only box here, so one
  // declaration on it puts every line flush left.
  '  text-align: left;',
  '}',
  '.atr-work-summary:hover {',
  '  color: var(--ui-text-primary, var(--atr-ink-0));',
  '}',
  '.atr-work-icon-stack {',
  '  display: inline-flex;',
  '  align-items: center;',
  '  flex-direction: row;',
  '  gap: 4px;',
  '  margin-right: 0.35rem;',
  '  vertical-align: middle;',
  '}',
  '.atr-work-icon-item {',
  '  display: inline-flex;',
  '  align-items: center;',
  '  justify-content: center;',
  '  width: 14px;',
  '  height: 14px;',
  '  margin: 0 !important;',
  '  position: relative;',
  '  color: #ffffff !important;',
  '  fill: #ffffff !important;',
  '  opacity: 1 !important;',
  '  flex-shrink: 0;',
  '  border: none !important;',
  '  border-radius: 0 !important;',
  '  background: transparent !important;',
  '  box-shadow: none !important;',
  '  filter: none !important;',
  '}',
  '.atr-work-icon-item svg {',
  '  display: block;',
  '  width: 14px;',
  '  height: 14px;',
  '  fill: #ffffff !important;',
  '  color: #ffffff !important;',
  '}',
  '.atr-work-summary-caret {',
  '  display: inline-block;',
  '  margin-left: 0.2rem;',
  '  font-size: 0.75rem;',
  '  opacity: 0.5;',
  '  transition: transform var(--atr-t-2) var(--atr-ease), opacity var(--atr-t-2) var(--atr-ease);',
  '}',
  '.atr-work-summary:hover .atr-work-summary-caret {',
  '  opacity: 0.9;',
  '}',
  ".atr-work-summary[data-expanded='true'] .atr-work-summary-caret {",
  '  transform: rotate(90deg);',
  '}',
  ".atr-work-summary[data-expanded='true'] {",
  '  margin-bottom: 0.25rem !important;',
  '}',
  'html:not([data-theme*="night"]):not([data-theme*="dark"]) .atr-work-summary {',
  '  color: var(--conversation-scaffold-text, var(--ui-text-tertiary, #64748b));',
  '}',
  'html:not([data-theme*="night"]):not([data-theme*="dark"]) .atr-work-summary:hover {',
  '  color: var(--ui-text-primary, #0f172a);',
  '}',
  "html:not([data-atr-collapse-work='on']) .atr-work-summary {",
  '  display: none !important;',
  '}',
  // ── [motion:switch] ─────────────────────────────────────────────────────
  // Session switch: core holds data-session-switching on [data-chat-surface]
  // until rows are placed and scroll is restored. The transcript stays
  // invisible for that window (the plugin folds and formats behind it) and
  // the attribute lifting is the single fade-in. Only the attribute is read;
  // core owns toggling it.
  "[data-chat-surface] :is([data-slot='aui_thread-viewport'], [data-slot='thread']) {",
  '  transition: opacity var(--atr-t-2) var(--atr-ease-out);',
  '}',
  "[data-chat-surface][data-session-switching] :is([data-slot='aui_thread-viewport'], [data-slot='thread']) {",
  '  opacity: 0;',
  '  transition: none;',
  '}',
  // The plugin's own settle curtain, held after core's marker lifts until the
  // transcript stops changing (the backfill commits, highlighting and font
  // swaps all land after core's two quiet frames). Same paint-only hide.
  "[data-chat-surface][data-atr-settling] :is([data-slot='aui_thread-viewport'], [data-slot='thread']) {",
  '  opacity: 0;',
  '  transition: none;',
  '}',
  // ── [motion:ghosts] ─────────────────────────────────────────────────────
  // Exit ghosts for floating surfaces the app unmounts before their exit can
  // play. A clone of the closed surface is positioned at its last rect and
  // runs the same exit keyframes; it is inert and never interactive.
  //
  // Measured on the Hermes desktop build: a React commit unmounts a closing
  // floating surface ~45-60ms after data-state flips to closed, cutting the
  // 140ms exit mid-fade; a Presence-managed close keeps the node for the full
  // keyframes (>=140ms before removal). The JS ghosting has already filtered
  // by that timing, so this sheet only has to replay the exit. The clone is
  // normalised to data-state='closed' by the JS, so the sheet's own exit rules
  // match it too; these declarations are byte-identical to those, and the
  // cascade order between the two does not matter. No keyframes are redefined
  // here. The JS may set a negative animation-delay to resume the exit at the
  // phase it had reached when the real node vanished.
  '.atr-ghost { position: fixed !important; margin: 0 !important; pointer-events: none !important; z-index: 2147483000 !important; }',
  ":is(.atr-ghost[data-slot='dropdown-menu-content'], .atr-ghost[data-slot='dropdown-menu-sub-content'], .atr-ghost[data-slot='context-menu-content'], .atr-ghost[data-slot='context-menu-sub-content'], .atr-ghost[data-slot='popover-content'], .atr-ghost[data-slot='select-content'], .atr-ghost[data-slot='menubar-content']) {",
  '  animation: atr-pop-out var(--atr-t-1) var(--atr-ease) both;',
  '}',
  ":is(.atr-ghost[data-slot='dialog-content'], .atr-ghost[data-slot='alert-dialog-content'], .atr-ghost[data-slot='sheet-content']) {",
  '  animation: atr-dlg-out var(--atr-t-1) var(--atr-ease) both;',
  '}',
  ":is(.atr-ghost[data-slot='tooltip-content'], .atr-ghost[data-slot='hover-card-content']) {",
  '  animation: atr-tip-out var(--atr-t-1) var(--atr-ease) both;',
  '}',
  ".atr-ghost[data-slot$='-overlay'] {",
  '  animation: atr-ovl-out var(--atr-t-1) var(--atr-ease) both;',
  '}',
  // ── [motion:menus] ──────────────────────────────────────────────────────
  // Mechanism: Radix Presence holds closing content mounted until its exit
  // animation's `animationend`; exits must therefore stay keyframes (never
  // transitions), and closed rules must keep the `both` fill mode plus
  // `pointer-events: none`. The app's animate-in/out classes emit no CSS.
  //
  // Menus, selects, popovers, dialogs and tooltips. Floating surfaces enter
  // 6px from the trigger at a hair under full size, leave along the same path
  // faster; rows and triggers only tint. Every duration is a token, so the
  // Motion switch and reduced-motion collapse the whole kit to 1ms.
  //
  // The direction comes from data-side: a surface anchored below its trigger
  // starts 6px above and settles down onto it, and so on around the ring.
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content']) {",
  '  --atr-pop-dx: 0px;',
  '  --atr-pop-dy: 0px;',
  '  transform-origin: center;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-side='bottom'] {",
  '  --atr-pop-dy: -6px;',
  '  transform-origin: top;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-side='top'] {",
  '  --atr-pop-dy: 6px;',
  '  transform-origin: bottom;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-side='left'] {",
  '  --atr-pop-dx: 6px;',
  '  transform-origin: right;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-side='right'] {",
  '  --atr-pop-dx: -6px;',
  '  transform-origin: left;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-state='open'] {",
  '  animation: atr-pop-in var(--atr-t-2) var(--atr-ease-out) both;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-state='closed'] {",
  '  animation: atr-pop-out var(--atr-t-1) var(--atr-ease) both;',
  '  pointer-events: none;',
  '}',
  // Submenus open on hover, so their entrance stays out of the pointer's way;
  // at t-1 their exit matches their entrance rather than beating it.
  ":is([data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-sub-content'])[data-state='open'] {",
  '  animation-duration: var(--atr-t-1);',
  '}',
  '@keyframes atr-pop-in {',
  '  from {',
  '    opacity: 0;',
  '    transform: translate(var(--atr-pop-dx), var(--atr-pop-dy)) scale(0.97);',
  '  }',
  '}',
  '@keyframes atr-pop-out {',
  '  to {',
  '    opacity: 0;',
  '    transform: translate(var(--atr-pop-dx), var(--atr-pop-dy)) scale(0.97);',
  '  }',
  '}',
  // Rows: hover and highlight are a paint swap, never a move.
  ":is([role='menuitem'], [role='option'], [role='menuitemcheckbox'], [role='menuitemradio'], [cmdk-item], [data-slot='command-item']) {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), color var(--atr-t-2) var(--atr-ease);',
  '}',
  // Dialogs, alert dialogs and sheets: a beat slower than a menu, a whisker
  // under full size, and the same path out at exit speed.
  ":is([data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content'])[data-state='open'] {",
  '  animation: atr-dlg-in var(--atr-t-3) var(--atr-ease-out) both;',
  '}',
  ":is([data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content'])[data-state='closed'] {",
  '  animation: atr-dlg-out var(--atr-t-1) var(--atr-ease) both;',
  '  pointer-events: none;',
  '}',
  '@keyframes atr-dlg-in {',
  '  from {',
  '    opacity: 0;',
  '    transform: scale(0.985);',
  '  }',
  '}',
  '@keyframes atr-dlg-out {',
  '  to {',
  '    opacity: 0;',
  '    transform: scale(0.985);',
  '  }',
  '}',
  // Scrims fade only; harmless on installs where a slot is never emitted.
  ":is([data-slot='dialog-overlay'], [data-slot='alert-dialog-overlay'], [data-slot='sheet-overlay'])[data-state='open'] {",
  '  animation: atr-ovl-in var(--atr-t-2) var(--atr-ease-out) both;',
  '}',
  ":is([data-slot='dialog-overlay'], [data-slot='alert-dialog-overlay'], [data-slot='sheet-overlay'])[data-state='closed'] {",
  '  animation: atr-ovl-out var(--atr-t-1) var(--atr-ease) both;',
  '  pointer-events: none;',
  '}',
  '@keyframes atr-ovl-in {',
  '  from {',
  '    opacity: 0;',
  '  }',
  '}',
  '@keyframes atr-ovl-out {',
  '  to {',
  '    opacity: 0;',
  '  }',
  '}',
  // Tooltips and hover cards follow the pointer, so they only dissolve.
  ":is([data-slot='tooltip-content'], [data-slot='hover-card-content'])[data-state='open'] {",
  '  animation: atr-tip-in var(--atr-t-1) var(--atr-ease-out) both;',
  '}',
  ":is([data-slot='tooltip-content'], [data-slot='hover-card-content'])[data-state='closed'] {",
  '  animation: atr-tip-out var(--atr-t-1) var(--atr-ease) both;',
  '  pointer-events: none;',
  '}',
  '@keyframes atr-tip-in {',
  '  from {',
  '    opacity: 0;',
  '  }',
  '}',
  '@keyframes atr-tip-out {',
  '  to {',
  '    opacity: 0;',
  '  }',
  '}',
  // Select triggers wear the tint of the menu they opened; !important sits on
  // the two colour properties only, to beat app styles without touching motion.
  ":is([data-slot='select-trigger'], [data-slot='searchable-select-trigger']) {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), border-color var(--atr-t-2) var(--atr-ease);',
  '}',
  ":is([data-slot='select-trigger'], [data-slot='searchable-select-trigger']):is([data-state='open'], [aria-expanded='true']) {",
  "  background-color: color-mix(in srgb, var(--atr-accent, var(--ui-accent, #9dc4e8)) 14%, transparent) !important;",
  "  border-color: color-mix(in srgb, var(--atr-accent, var(--ui-accent, #9dc4e8)) 30%, transparent) !important;",
  '}',
  // ── [motion:history] ────────────────────────────────────────────────────
  // History panel rows, search and switch (owner: motion-history agent).
  // §5 already owns the hover/active paints; these rules only let the colour
  // swap breathe. No entrance fades on rows: the list is virtualized, so an
  // entry animation would replay on every scroll re-render.
  ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button']) {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), color var(--atr-t-2) var(--atr-ease);',
  '}',
  // While a scroll is in flight, rows slide under a stationary pointer and
  // every newly hovered row would restart a main-thread colour transition
  // mid-gesture. The attribute is set by the capture-phase scroll listener and
  // clears 150ms after the last event, so hover still animates at rest. The
  // rule's own specificity beats the transition declarations above it.
  "html[data-atr-scrolling] :is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button'], [data-row-actions] button svg) {",
  '  transition: none;',
  '}',
  // Press: a slightly stronger accent wash while the pointer is down. The
  // html prefix buys one specificity step over §5's hover/active fills, which
  // are equally important and can land after this sheet once the look sheet is
  // re-created (toggle the background off and on), so order alone must not decide.
  "html :is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button']):active {",
  '  background-color: color-mix(in srgb, var(--atr-accent, #9dc4e8) 18%, transparent) !important;',
  '}',
  // Row icons and the kebab/mini-actions.
  ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-row-actions] button, [data-slot='sidebar-menu-action'], [data-row-actions] button svg, [data-slot='sidebar-menu-action'] svg) {",
  '  transition: color var(--atr-t-2) var(--atr-ease), background-color var(--atr-t-2) var(--atr-ease);',
  '}',
  // Search: the app's focus ring is already stripped, so the accent halo is
  // the focus indicator.
  "[data-slot='sidebar-content'] input {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), box-shadow var(--atr-t-2) var(--atr-ease);',
  '}',
  "[data-slot='sidebar-content'] input:focus-visible {",
  '  box-shadow: 0 0 0 3px color-mix(in srgb, var(--atr-accent, #9dc4e8) 14%, transparent) !important;',
  '}',
  // SESSIONS | BOTS labels: colour only; the sliding pill is not touched.
  `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'] {`,
  '  transition: color var(--atr-t-2) var(--atr-ease);',
  '}',
  // ── [motion:composer] ───────────────────────────────────────────────────
  // Composer, status bar and status dock (owner: motion-composer agent).
  ":is([data-slot='composer-root'], [data-slot='composer-surface'], form[data-slot='composer']) :is(button, [role='button']) {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), color var(--atr-t-2) var(--atr-ease), transform var(--atr-t-1) var(--atr-ease);',
  '}',
  ":is([data-slot='composer-root'], [data-slot='composer-surface'], form[data-slot='composer']) :is(button, [role='button']):not([aria-haspopup]):not([data-slot='select-trigger']):not([data-slot='searchable-select-trigger']):active {",
  '  transform: scale(0.96);',
  '}',
  ":is([data-slot='composer-root'], [data-slot='composer-status-stack'], [data-slot='statusbar']) :is([data-slot='select-trigger'], [data-slot='searchable-select-trigger'], button[aria-haspopup], [role='button'][aria-haspopup]) {",
  // border-color included: this rule outranks the menus block's trigger rule,
  // so a shorter list here would snap the open-state border instead of fading.
  '  transition: background-color var(--atr-t-2) var(--atr-ease), border-color var(--atr-t-2) var(--atr-ease), color var(--atr-t-2) var(--atr-ease);',
  '}',
  ":is([data-slot='composer-root'], [data-slot='composer-status-stack'], [data-slot='statusbar']) :is([data-slot='select-trigger'], [data-slot='searchable-select-trigger'], button[aria-haspopup], [role='button'][aria-haspopup]):is([data-state='open'], [aria-expanded='true']) {",
  '  background-color: color-mix(in srgb, var(--atr-accent, var(--ui-accent, #9dc4e8)) 14%, transparent) !important;',
  '  color: var(--atr-ink-0, var(--ui-text-primary)) !important;',
  '}',
  ":is([data-slot='statusbar'], [data-slot='composer-status-stack']) :is(button, [role='button'], a) {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), color var(--atr-t-2) var(--atr-ease);',
  '}',
  // The Simple-mode dock tab is styled by DOCK_CSS, which is written after
  // this sheet: its transitions are tokenized there instead of duplicated
  // here, where they would lose the cascade anyway.
  // ── [motion:tools] ──────────────────────────────────────────────────────
  // Tool blocks, thinking disclosure, message actions (owner: motion-tools agent).
  // Chrome only: an open/close eases paint (bg, border, shadow), never size.
  // Deliberately absent until a live DOM sample lands: any content-expand or
  // caret-rotate (the disclosure's open state may announce via aria-expanded
  // or data-state — unverified), and the exact assistant action-cluster class
  // (the selector below follows the proven user-message convention and is
  // inert when that class is not emitted).
  "[data-slot='tool-block'] {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), border-color var(--atr-t-2) var(--atr-ease), box-shadow var(--atr-t-2) var(--atr-ease);',
  '}',
  "[data-slot='tool-block'] :is(button, [role='button'], summary) {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), color var(--atr-t-2) var(--atr-ease);',
  '}',
  "[data-slot='aui_thinking-disclosure'] {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), border-color var(--atr-t-2) var(--atr-ease), box-shadow var(--atr-t-2) var(--atr-ease);',
  '}',
  "[data-slot='aui_thinking-disclosure'] :is(button, [role='button'], summary) {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), color var(--atr-t-2) var(--atr-ease);',
  '}',
  ":is([data-slot='aui_assistant-message-root'], [data-slot='assistant-message']) :is(button, [role='button'], a) {",
  '  transition: background-color var(--atr-t-2) var(--atr-ease), color var(--atr-t-2) var(--atr-ease), opacity var(--atr-t-2) var(--atr-ease);',
  '}',
  ":is([data-slot='aui_assistant-message-root'], [data-slot='assistant-message']) :is([class*='group-hover/assistant-message'], [class*='group-hover/message']) {",
  '  transition: opacity var(--atr-t-2) var(--atr-ease);',
  '}',
].join('\n')

const ensureMotionStyle = () => {
  if (typeof document === 'undefined' || document.getElementById('atr-motion-style')) return
  const el = document.createElement('style')
  el.id = 'atr-motion-style'
  el.textContent = MOTION_CSS
  document.head.appendChild(el)
}

// ── Inline preview measurement (the transcript's HTML widgets) ────────────

// Hermes's `::preview{file="…"}` widget measures itself with
// `Math.max(html.scrollHeight, body.scrollHeight)`. The ROOT element's
// scrollHeight is the scrolling area, which is floored at the frame's own
// height: a 133px card inside the default 280px frame reports 280, so the
// transcript keeps a 147px empty band under the card and the frame can never
// shrink again (the reported number equals the frame height from then on).
// Hermes owns that script, but it lives in the `srcdoc` string, which is an
// ordinary attribute. Rewriting it at insertion — before the frame starts
// navigating — makes Hermes's own measurement read the body box instead.
// The shim is guarded on the exact source line and does nothing if Hermes
// changes it; a future host fix simply makes this a no-op.
//
const PREVIEW_MEASURE_OLD = 'var h=Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0);'
const PREVIEW_MEASURE_NEW = 'var h=b?Math.max(b.scrollHeight,Math.ceil(b.getBoundingClientRect().height)):(d?d.scrollHeight:0);'
const PREVIEW_FRAME_SEL = 'iframe[sandbox~="allow-scripts"][srcdoc*="hermes-inline-preview-size"]'

const ensurePreviewMeasureShim = () => {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function' || !document.body) return () => {}
  const fixFrame = el => {
    if (!el || el.tagName !== 'IFRAME' || !el.matches?.(PREVIEW_FRAME_SEL)) return
    const doc = el.getAttribute('srcdoc')
    if (!doc || !doc.includes(PREVIEW_MEASURE_OLD)) return
    el.setAttribute('srcdoc', doc.split(PREVIEW_MEASURE_OLD).join(PREVIEW_MEASURE_NEW))
  }
  const scan = root => {
    if (!root) return
    if (root.tagName === 'IFRAME') fixFrame(root)
    root.querySelectorAll?.(PREVIEW_FRAME_SEL).forEach(fixFrame)
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') { fixFrame(record.target); continue }
      for (const node of record.addedNodes) if (node.nodeType === 1) scan(node)
    }
  })
  // Frames already mounted when Atrium loads (a transcript restored from
  // history) are patched once here; the observer covers every later mount.
  scan(document.body)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['srcdoc'] })
  return () => observer.disconnect()
}

// ══ §6 PAINTING, THEMES & ACCENT ═══════════════════════════════════════════

// The sheet is one of two looks and never changes on its own: paint it when a
// switch moves, when the skin changes, or when the picture finishes loading.
const SHEET_IDS = ['atr-chrome-base', 'atr-chrome-details']

const paintSheet = (date, gl = false, opts = {}) => {
  if (typeof document === 'undefined') return
  const backdrop = opts.backdrop !== false
  const chrome = opts.chrome !== false
  if (!backdrop && !chrome) { clearSheet(); return }
  const sections = sheetCss(date, gl, { backdrop, chrome, split: true })
  SHEET_IDS.forEach((id, i) => {
    const existing = document.getElementById(id)
    if (existing) {
      if (existing.textContent !== sections[i]) existing.textContent = sections[i]
    } else {
      const el = document.createElement('style')
      el.id = id
      el.textContent = sections[i]
      document.head.appendChild(el)
    }
  })
}

const clearSheet = () => {
  if (typeof document === 'undefined') return
  for (const id of SHEET_IDS) document.getElementById(id)?.remove()
}

// One stable host entry; the look itself lives in Atrium settings.
const THEME_NAME = 'hermes-atrium'
const APPEARANCE_LOOKS = [
  { id: 'gruvbox', label: 'Gruvbox', description: 'Painting or desktop tint', preview: 'linear-gradient(165deg, #767b52 35%, #aa9a6d 36%, #aa9a6d 56%, #4d593c 57%, #353a2e)' },
  { id: 'custom', label: 'Custom', description: 'Your picture & colours', preview: 'var(--ui-widget-surface-background)' }
]
// Every theme name Hermes Atrium owns; anything else is the user's own pick.
// The legacy names are the ones this plugin published before it was renamed
// (`zephyr-sky` pre-Atrium, `atrium` in the first Atrium build). An install
// that upgrades keeps whichever it had in the app's appearance store until the
// next pick, so they must keep counting as ours or the plugin would park itself
// on the first launch after a rename.
const LEGACY_THEMES = ['zephyr-sky', 'atrium']
const isOurTheme = name => name === THEME_NAME || name === GROUND_THEME || LEGACY_THEMES.includes(name)

// ── Snippet card ───────────────────────────────────────────────────────────
// `::snippet{title="…" value="…" note="…" tone="accent"}`
// A leaf directive on its own line: attrs only, so the card stays a summary and
// the prose around it stays prose. One calm box, no chrome, in Hermes tokens.

// ══ §7 SNIPPET CARDS & LOOK CHIP ═══════════════════════════════════════════

const TONES = { accent: 'accent', plain: 'plain' }

// Geometry and colour live in INLINE styles, deliberately. Tailwind compiles
// only the classes the app's own sources use, so a runtime plugin's novel
// utilities (`rounded-[0.875rem]`, `max-w-[34rem]`) never reach the stylesheet
// and silently do nothing — the first cut of this card rendered full-width and
// square because of exactly that. The tokens below are the app's real CSS vars.

// Minimal pass. One calm
// strip in the sidebar-card material: the title in Hermes's section-label face
// (as PINNED / SESSIONS), the value large, the note and source quieter. The
// actions are two icons that surface on hover/focus; a pinned card keeps its
// pin lit. Accent shows only in the label colour. Classes plus one tiny
// always-on stylesheet (SNIPPET_CSS), because hover cannot be inline.
const SNIPPET_CSS = [
  '.atr-snip { position: relative; display: flex; flex-direction: column; gap: 0.2rem; max-width: 34rem; margin: 0.5rem 0;',
  '  padding: 0.75rem; border-radius: var(--atr-radius, 12px); box-sizing: border-box;',
  '  background: var(--atr-side-card, var(--ui-widget-surface-background)); color: var(--atr-ink-1, var(--ui-text-secondary)); }',
  '.atr-snip-head { display: flex; align-items: center; gap: 0.5rem; min-height: 1rem; }',
  '.atr-snip-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
  '  font-size: 0.64rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  ".atr-snip[data-tone='accent'] .atr-snip-title { color: var(--atr-ink-0); }",
  '.atr-snip-acts { margin-left: auto; display: flex; gap: 0.1rem; opacity: 0; transition: opacity 140ms ease; }',
  '.atr-snip:is(:hover, :focus-within) .atr-snip-acts, .atr-snip-acts:has([data-on]) { opacity: 1; }',
  '.atr-snip-act { display: grid; place-items: center; width: 1.4rem; height: 1.4rem; padding: 0; border: 0; border-radius: var(--atr-r-1, 4px);',
  '  background: transparent; color: var(--atr-ink-3, var(--ui-text-tertiary)); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }',
  '.atr-snip-act:hover, .atr-snip-act:focus-visible { background: var(--atr-hover, color-mix(in srgb, var(--ui-text-primary) 8%, transparent)); color: var(--atr-ink-0, var(--ui-text-primary)); outline: none; }',
  '.atr-snip-act[data-on] { color: var(--atr-accent, var(--ui-accent)); }',
  '.atr-snip-act .atr-snip-done { display: none; }',
  '.atr-snip-act[data-done] .atr-snip-idle { display: none; }',
  '.atr-snip-act[data-done] .atr-snip-done { display: inline-flex; color: var(--atr-ink-1); }',
  '.atr-snip-value { font-size: 0.95rem; line-height: 1.45; color: var(--atr-ink-0, var(--ui-text-primary)); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
  '.atr-snip-note { font-size: 0.8125rem; line-height: 1.55; color: var(--atr-ink-2, var(--ui-text-secondary)); }',
  '.atr-snip-source { font-size: 0.6875rem; color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  // no title: the actions ride the value line instead of an empty head
  '.atr-snip:not(:has(.atr-snip-title)) .atr-snip-head { position: absolute; top: 0.45rem; right: 0.5rem; }',
  '.atr-snip:not(:has(.atr-snip-title)) { padding-right: 3.4rem; }',
  '.atr-snip { cursor: pointer; user-select: none; touch-action: none; transition: background-color 120ms ease; }',
  '.atr-snip:hover { background: var(--atr-side-card-hi, var(--atr-side-card, var(--ui-widget-surface-background))); }',
  // ── Shelf, sidebar Pins, preview, drag (all plugin-owned nodes in <body>) ──
  '.atr-shelf { position: fixed; z-index: 30; left: var(--atr-sh-x); top: var(--atr-sh-y); width: var(--atr-sh-w); height: var(--atr-sh-h);',
  '  display: flex; justify-content: center; align-items: stretch; gap: 0.5rem; box-sizing: border-box; border-radius: var(--atr-radius, 12px);',
  '  transition: background-color 140ms ease, opacity 160ms ease; }',
  '.atr-shelf[hidden] { display: none; }',
  // drop zones while dragging: dashed outlines, no fill
  ":root[data-atr-dragging] .atr-shelf { outline: 1px dashed color-mix(in srgb, var(--atr-ink-3, var(--ui-text-tertiary)) 55%, transparent); outline-offset: 0.3rem; }",
  ".atr-shelf[data-empty] { align-items: center; }",
  ":root[data-atr-dragging] .atr-shelf[data-drop='over'] { outline-color: color-mix(in srgb, var(--atr-accent, #9cf) 80%, transparent); }",
  ".atr-shelf[data-drop='over'] .atr-shelf-hint, .atr-shelf[data-preview] .atr-shelf-hint { display: none; }",
  '.atr-shelf-hint { font-size: var(--atr-sd-lab-size, 0.64rem); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--atr-ink-3, var(--ui-text-tertiary)); pointer-events: none; }',
  '.atr-tile { position: relative; flex: 0 1 11.5rem; min-width: 6.5rem; display: flex; flex-direction: column; justify-content: center; gap: 0.2rem;',
  // fully clear at rest: the face floats on the painting; a light
  // glass fill comes up only on hover, so the tile still reads as grabbable
  '  --atr-tile-bg: transparent;',
  '  --atr-tile-bg-hi: color-mix(in srgb, color-mix(in srgb, var(--atr-side-card, rgb(20,22,28)) 76%, #fff) 64%, transparent);',
  '  padding: 0.45rem 0.85rem; box-sizing: border-box; border-radius: var(--atr-radius, 12px); background: var(--atr-tile-bg);',
  '  cursor: pointer; user-select: none; touch-action: none; text-align: left; outline: none; transition: background-color 120ms ease, opacity 140ms ease; }',
  '.atr-tile:hover, .atr-tile:focus-visible { background: var(--atr-tile-bg-hi); }',
  '.atr-tile:focus-visible { box-shadow: inset 0 0 0 1px var(--atr-accent, rgba(255,255,255,.3)); }',
  '.atr-tile[data-stale] { opacity: 0.6; }',
  '.atr-tile-label { font-size: var(--atr-sd-lab-size, 0.64rem); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--atr-ink-3, var(--ui-text-tertiary));',
  '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  ".atr-tile[data-kind='status'] .atr-tile-label { color: var(--atr-sd-lab-color, var(--atr-ink-3, var(--ui-text-tertiary))); }",
  '.atr-tile-value { display: flex; align-items: center; gap: 0.4rem; min-width: 0; font-size: 0.9rem; color: var(--atr-ink-0, var(--ui-text-primary)); font-variant-numeric: tabular-nums; }',
  '.atr-tile-value .truncate { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  // a status tile centres its content: the shelf pins sit in
  // fixed-width tiles, so a short reading ("Backend ready") used to hang off
  // the left edge with all the slack on the right. The clone is only as wide
  // as its own content and shrinks to the tile, so centring both boxes moves
  // the row to the middle without letting it overflow either edge.
  ".atr-tile[data-kind='status'] .atr-tile-value { justify-content: center; }",
  ".atr-tile[data-kind='status'] .atr-tile-face { justify-content: center; text-align: center; }",
  // a snippet tile wraps its value (up to 3 lines) and the shelf grows to fit
  '.atr-tile-text { min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.3; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }',
  '.atr-tile-value svg { width: 0.85rem; height: 0.85rem; flex: none; color: var(--atr-ink-2, var(--ui-text-secondary)); }',
  // a status tile wears its row's own face: one line, centred, no label
  '.atr-tile-face { display: flex !important; align-items: center; min-width: 0; max-width: 100%; height: auto !important; padding: 0 !important; margin: 0 !important;',
  '  background: none !important; border: 0 !important; box-shadow: none !important; overflow: hidden; white-space: nowrap; font-size: 0.9rem; cursor: pointer; }',
  // the row's own buttons inside a tile light up like they do in the bar
  '.atr-tile-face button:hover, .atr-tile-face [role=button]:hover { color: var(--atr-ink-0, var(--ui-text-primary)); background: color-mix(in srgb, var(--atr-ink-0, var(--ui-text-primary)) 10%, transparent); border-radius: 0.3rem; }',
  ".atr-tile-face button { cursor: pointer; }",
  // resize grip: the tile's right edge
  '.atr-tile-grip { position: absolute; top: 18%; bottom: 18%; right: 0; width: 0.55rem; cursor: ew-resize; touch-action: none; }',
  ".atr-tile-grip::after { content: ''; position: absolute; top: 25%; bottom: 25%; right: 0.2rem; width: 2px; border-radius: 1px; background: var(--atr-ink-3, var(--ui-text-tertiary)); opacity: 0; transition: opacity 120ms ease; }",
  '.atr-tile:hover .atr-tile-grip::after, .atr-tile[data-resizing] .atr-tile-grip::after { opacity: 0.7; }',
  ':root[data-atr-dragging] .atr-tile-grip { display: none; }',
  ':root[data-atr-resizing], :root[data-atr-resizing] * { cursor: ew-resize !important; user-select: none !important; }',
  '.atr-tile-face > * { flex-shrink: 1; min-width: 0; }',
  '.atr-tile-face > svg { flex: none; }',
  // the thing being dragged, previewed where it would land
  ".atr-tile[data-phantom] { opacity: 0.75; pointer-events: none; background: color-mix(in srgb, var(--atr-side-card, color-mix(in srgb, var(--ui-bg-secondary) 86%, transparent)) 70%, transparent);",
  "  outline: 1px dashed color-mix(in srgb, var(--atr-accent, #9cf) 70%, transparent); outline-offset: -1px; }",
  ".atr-tile[data-lifted] { opacity: 0.3; }",
  ":root[data-atr-dragging] .atr-tile, :root[data-atr-dragging] .atr-snip { cursor: grabbing; }",
  // the snippet library: its own sidebar card, same material and faces as STATUS
  '#atr-snips { position: fixed; z-index: 40; left: var(--atr-lib-x); top: var(--atr-lib-y); width: var(--atr-lib-w); height: var(--atr-lib-h);',
  '  display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; border-radius: var(--atr-radius, 12px);',
  '  background: var(--atr-side-card, color-mix(in srgb, var(--ui-bg-secondary) 86%, transparent)); color: var(--atr-ink-1, var(--ui-text-primary)); user-select: none;',
  '  transition: height var(--atr-sd-dur, 280ms) var(--atr-sd-ease, cubic-bezier(.32,.72,0,1)), top var(--atr-sd-dur, 280ms) var(--atr-sd-ease, cubic-bezier(.32,.72,0,1)); }',
  '#atr-snips[hidden] { display: none; }',
  "#atr-snips[data-drop='over'] { outline: 1px dashed color-mix(in srgb, var(--atr-accent, #9cf) 75%, transparent); outline-offset: -1px; }",
  ":root[data-atr-dragging='snip'] #atr-snips:not([data-drop]), :root[data-atr-dragging='tile'] #atr-snips:not([data-drop]) { outline: 1px dashed color-mix(in srgb, var(--atr-ink-3, var(--ui-text-tertiary)) 55%, transparent); outline-offset: -1px; }",
  '#atr-snips .atr-lib-head { flex: none; display: flex; align-items: center; gap: 0.5rem; height: var(--atr-lib-head, 1.85rem); padding: 0 0.7rem 0 0.75rem; cursor: pointer; outline: none;',
  '  font-size: var(--atr-sd-lab-size, 0.64rem); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;',
  '  color: var(--atr-sd-lab-color, var(--theme-primary, var(--atr-ink-2, var(--ui-text-secondary)))); transition: color 150ms ease; }',
  '#atr-snips .atr-lib-head:hover, #atr-snips .atr-lib-head:focus-visible { color: var(--atr-ink-0, var(--ui-text-primary)); }',
  '#atr-snips .atr-lib-head svg { width: 0.75rem; height: 0.75rem; flex: none; }',
  '#atr-snips .atr-lib-count { color: var(--atr-ink-3, var(--ui-text-tertiary)); letter-spacing: 0.04em; }',
  '#atr-snips .atr-lib-chev { margin-left: auto; transition: transform var(--atr-sd-dur, 280ms) var(--atr-sd-ease, ease); transform: rotate(-90deg); }',
  '#atr-snips[data-open] .atr-lib-chev { transform: none; }',
  '#atr-snips .atr-lib-rows { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 0.1rem; padding: 0 4px 0.35rem; overflow: hidden auto; scrollbar-width: none;',
  '  opacity: 0; transition: opacity 180ms ease; }',
  '#atr-snips[data-open] .atr-lib-rows { opacity: 1; transition: opacity 200ms ease 60ms; }',
  '#atr-snips .atr-lib-row { flex: none; display: flex; align-items: center; gap: 0.5rem; min-height: var(--atr-sd-rowh, 1.75rem); padding: 0 0.5rem; box-sizing: border-box;',
  '  border-radius: var(--atr-r-2, 8px); font-size: var(--atr-sd-font, 0.8125rem); color: var(--atr-ink-1, var(--ui-text-primary));',
  '  cursor: pointer; touch-action: none; outline: none; white-space: nowrap; overflow: hidden; transition: background-color 120ms ease, opacity 120ms ease; }',
  '#atr-snips .atr-lib-row:hover, #atr-snips .atr-lib-row:focus-visible { background: var(--atr-hover, color-mix(in srgb, var(--ui-text-primary) 8%, transparent)); color: var(--atr-ink-0, var(--ui-text-primary)); }',
  '#atr-snips .atr-lib-row[data-phantom] { opacity: 0.7; outline: 1px dashed color-mix(in srgb, var(--atr-accent, #9cf) 65%, transparent); outline-offset: -1px; }',
  '#atr-snips .atr-lib-title { flex: none; color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  '#atr-snips .atr-lib-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; }',
  '#atr-snips .atr-lib-hint { flex: none; display: flex; align-items: center; min-height: var(--atr-sd-rowh, 1.75rem); padding: 0 0.5rem; font-size: var(--atr-sd-font, 0.8125rem); color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  "[data-atr-lib-room] { margin-top: calc(var(--atr-sd-room, 0px) + var(--atr-lib-room, 0px)) !important; transition: margin-top var(--atr-sd-dur, 280ms) var(--atr-sd-ease, cubic-bezier(.32,.72,0,1)); }",
  // the library drawer: slides off the sidebar edge, no scrim, chat stays live
  '#atr-snip-drawer { position: fixed; z-index: 45; left: var(--atr-dw-x, 0.75rem); top: var(--atr-dw-y, 3.5rem); width: min(24rem, calc(100vw - var(--atr-dw-x, 0.75rem) - 1rem));',
  '  max-height: var(--atr-dw-maxh, 70vh); display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; border-radius: var(--atr-radius, 12px);',
  '  background: var(--atr-glass-strong, color-mix(in srgb, var(--ui-bg-primary) 94%, transparent)); box-shadow: var(--atr-lift-float, 0 16px 40px rgba(0,0,0,.34));',
  '  color: var(--atr-ink-1, var(--ui-text-primary)); animation: atr-dw-in 240ms cubic-bezier(.32,.72,0,1); outline: none; }',
  '#atr-snip-drawer[data-leaving] { animation: atr-dw-out 160ms ease forwards; pointer-events: none; }',
  '@keyframes atr-dw-in { from { opacity: 0; transform: translateX(-0.75rem); } }',
  '@keyframes atr-dw-out { to { opacity: 0; transform: translateX(-0.5rem); } }',
  '#atr-snip-drawer .atr-dw-head { flex: none; display: flex; align-items: center; gap: 0.5rem; height: 2rem; padding: 0 0.35rem 0 0.8rem;',
  '  font-size: var(--atr-sd-lab-size, 0.64rem); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--atr-sd-lab-color, var(--atr-ink-2, var(--ui-text-secondary))); }',
  '#atr-snip-drawer .atr-dw-count { color: var(--atr-ink-3, var(--ui-text-tertiary)); letter-spacing: 0.04em; }',
  '#atr-snip-drawer .atr-dw-keys { margin-left: auto; letter-spacing: 0.04em; text-transform: none; font-weight: 400; color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  '#atr-snip-drawer .atr-dw-icon { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; padding: 0; border: 0; cursor: pointer; flex: none;',
  '  border-radius: var(--atr-r-2, 8px); background: transparent; color: var(--atr-ink-3, var(--ui-text-tertiary)); transition: background-color 120ms ease, color 120ms ease; }',
  '#atr-snip-drawer .atr-dw-icon:hover, #atr-snip-drawer .atr-dw-icon:focus-visible { background: var(--atr-hover, color-mix(in srgb, var(--ui-text-primary) 8%, transparent)); color: var(--atr-ink-0, var(--ui-text-primary)); outline: none; }',
  '#atr-snip-drawer .atr-dw-icon[data-on] { color: var(--atr-accent, #9cf); }',
  '#atr-snip-drawer .atr-dw-icon svg { width: 0.85rem; height: 0.85rem; }',
  '#atr-snip-drawer .atr-dw-list { flex: 1; min-height: 0; overflow: hidden auto; overscroll-behavior: contain; scrollbar-width: none; padding: 0 0.35rem 0.4rem;',
  '  display: flex; flex-direction: column; gap: 0.1rem; -webkit-mask: linear-gradient(transparent, #000 0.5rem, #000 calc(100% - 0.75rem), transparent); mask: linear-gradient(transparent, #000 0.5rem, #000 calc(100% - 0.75rem), transparent); }',
  '#atr-snip-drawer .atr-dw-item { flex: none; border-radius: var(--atr-r-2, 8px); cursor: pointer; transition: background-color 200ms ease, opacity 200ms ease; opacity: 0.62; }',
  '#atr-snip-drawer .atr-dw-item:hover { opacity: 0.9; }',
  '#atr-snip-drawer .atr-dw-item[data-focus] { opacity: 1; cursor: default; background: var(--atr-hover, color-mix(in srgb, var(--ui-text-primary) 8%, transparent)); }',
  '#atr-snip-drawer .atr-dw-line { display: flex; align-items: baseline; gap: 0.5rem; min-height: 1.9rem; padding: 0.45rem 0.55rem 0; box-sizing: border-box; white-space: nowrap; overflow: hidden; }',
  '#atr-snip-drawer .atr-dw-item:not([data-focus]) .atr-dw-line { padding-bottom: 0.45rem; align-items: center; }',
  '#atr-snip-drawer .atr-dw-title { flex: none; font-size: 0.64rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  '#atr-snip-drawer .atr-dw-short { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 0.8125rem; color: var(--atr-ink-1, var(--ui-text-primary)); transition: opacity 160ms ease; }',
  '#atr-snip-drawer .atr-dw-item[data-focus] .atr-dw-short { opacity: 0; }',
  '#atr-snip-drawer .atr-dw-loose { font-size: 0.6rem; letter-spacing: 0.06em; color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  '#atr-snip-drawer .atr-dw-more { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 260ms cubic-bezier(.32,.72,0,1); }',
  '#atr-snip-drawer .atr-dw-item[data-focus] .atr-dw-more { grid-template-rows: 1fr; }',
  '#atr-snip-drawer .atr-dw-inner { min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 0.3rem; padding: 0 0.55rem; }',
  '#atr-snip-drawer .atr-dw-item[data-focus] .atr-dw-inner { padding-bottom: 0.5rem; }',
  '#atr-snip-drawer .atr-dw-full { font-size: 1rem; line-height: 1.45; color: var(--atr-ink-0, var(--ui-text-primary)); white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; cursor: text;',
  '  max-height: 12rem; overflow: auto; scrollbar-width: thin; font-variant-numeric: tabular-nums; }',
  '#atr-snip-drawer .atr-dw-note { font-size: 0.8rem; line-height: 1.45; color: var(--atr-ink-2, var(--ui-text-secondary)); white-space: pre-wrap; user-select: text; }',
  '#atr-snip-drawer .atr-dw-source { font-size: 0.6875rem; color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  '#atr-snip-drawer .atr-dw-foot { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.15rem; }',
  '#atr-snip-drawer .atr-dw-btn { height: 1.6rem; padding: 0 0.65rem; border: 0; cursor: pointer; font: inherit; font-size: 0.75rem;',
  '  border-radius: var(--atr-r-2, 8px); background: var(--atr-hover, color-mix(in srgb, var(--ui-text-primary) 8%, transparent)); color: var(--atr-ink-1, var(--ui-text-primary)); transition: background-color 120ms ease, color 120ms ease; }',
  '#atr-snip-drawer .atr-dw-btn:hover, #atr-snip-drawer .atr-dw-btn:focus-visible { background: var(--atr-edge-strong, rgba(255,255,255,.11)); color: var(--atr-ink-0, var(--ui-text-primary)); outline: none; }',
  '#atr-snip-drawer .atr-dw-primary { background: color-mix(in srgb, var(--atr-accent, #9cf) 22%, transparent); color: var(--atr-ink-0, var(--ui-text-primary)); }',
  '#atr-snip-drawer .atr-dw-primary:hover, #atr-snip-drawer .atr-dw-primary:focus-visible { background: color-mix(in srgb, var(--atr-accent, #9cf) 32%, transparent); }',
  '#atr-snip-drawer .atr-dw-btn:disabled { opacity: 0.6; cursor: default; }',
  '#atr-snips .atr-lib-row[data-current] { background: var(--atr-hover, color-mix(in srgb, var(--ui-text-primary) 8%, transparent)); color: var(--atr-ink-0, var(--ui-text-primary)); }',
  '@media (prefers-reduced-motion: reduce) { #atr-snip-drawer, #atr-snip-drawer[data-leaving] { animation: none; } #atr-snip-drawer .atr-dw-more { transition: none; } }',
  // the drag ghost, for every source (the dock's own copy covers status rows)
  '#atr-statusdock-ghost { position: fixed; z-index: 2147483000; left: 0; top: 0; pointer-events: none; display: inline-flex; align-items: center; gap: 0.45rem;',
  '  padding: 0.3rem 0.65rem; border-radius: var(--atr-r-2, 8px); font-size: 0.75rem; white-space: nowrap; max-width: 16rem; overflow: hidden;',
  '  background: var(--atr-glass-strong, color-mix(in srgb, var(--ui-bg-primary) 94%, transparent)); color: var(--atr-ink-0, var(--ui-text-primary)); box-shadow: 0 6px 18px rgba(0,0,0,.35); }',
  '#atr-statusdock-ghost svg { width: 0.75rem; height: 0.75rem; flex: none; }',
  '#atr-statusdock-ghost .atr-ghost-title { font-size: 0.6rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  '#atr-statusdock-ghost > span:last-child { overflow: hidden; text-overflow: ellipsis; }',
  // over a drop zone the chip melts into the preview that grew out of it
  '#atr-statusdock-ghost { transition: opacity 140ms ease, scale 160ms cubic-bezier(.32,.72,0,1); }',
  '#atr-statusdock-ghost[data-docked] { opacity: 0; scale: 0.85; }',
  '@media (prefers-reduced-motion: reduce) { #atr-statusdock-ghost { transition: none; } }'
].join('\n')

// The new-tab shelf is plugin UI, not scenery. It keeps its own always-on
// sheet so it survives Atrium being away (another theme, or a switch off): the fill
// is the plugin's own sidebar-card material (`--atr-side-card`, the same glass
// the snippet and tool cards wear) and the host's widget surface when no Atrium
// look is active. Shape, edge and shadow follow the rest of the plugin: one
// `--atr-edge` hairline, `--atr-radius-lg`, no white wash over the fill. No live
// backdrop-filter: like every other large Atrium surface, the card sits on a
// material, not on a blurred copy of the picture.
const HOME_CSS = [
  '#atr-home {',
  '  --atr-home-ink-0: var(--atr-ink-0, var(--ui-text-primary, inherit));',
  '  --atr-home-ink-2: var(--atr-ink-2, var(--ui-text-secondary, inherit));',
  '  --atr-home-ink-3: var(--atr-ink-3, var(--ui-text-tertiary, inherit));',
  '  --atr-home-hi: var(--atr-hi, 255, 255, 255);',
  // The cards cast a 24-32px shadow. A plain hidden clip turns that into a hard
  // edge at the shelf's right and bottom; clip, but 48px past the box, so the
  // shadow can finish. Placement leaves 88px below the shelf for it.
  '  position: fixed; z-index: 2; display: none; flex-direction: column; gap: 18px; pointer-events: none; overflow: clip; overflow-clip-margin: 48px;',
  '}',
  "#atr-home[data-on='1'] { display: flex; animation: atr-home-in 420ms cubic-bezier(0.22, 1, 0.36, 1) 160ms both; }",
  '@keyframes atr-home-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }',
  '#atr-home h3 { margin: 0 0 14px 4px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--atr-home-ink-0); opacity: 0.92; text-shadow: 0 1px 2px rgba(0,0,0,0.7), 0 0 14px rgba(0,0,0,0.55); }',
  // Over the picture the label needs the shadow. In a light host
  // theme it sits on a flat page, where the same black halo reads as dirt.
  'html:not(.dark) #atr-home h3 { text-shadow: none; }',
  '#atr-home .atr-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }',
  '@media (max-width: 640px) { #atr-home .atr-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',
  '#atr-home .atr-card { position: relative; pointer-events: auto; min-width: 0; }',
  '#atr-home .atr-card-open { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; width: 100%; min-width: 0; padding: 16px 38px 16px 16px; border-radius: var(--atr-radius, var(--atr-r-card, 12px)); cursor: pointer; transition: background-color 140ms ease, box-shadow 140ms ease; }',
  // Matte: the plugin's own card material worn the way the sidebar, snippet and
  // tool cards wear it. One flat fill, no ring, no drop shadow, no white wash -
  // nothing that picks up the backdrop behind it, so it cannot read as reflective.
  "#atr-home[data-cards='matte'] .atr-card-open { background: var(--atr-m-solid, rgb(17, 18, 24)); }",
  "#atr-home[data-cards='matte'] .atr-card-open:hover { background: color-mix(in srgb, var(--atr-m-solid, rgb(17, 18, 24)) 90%, #fff); }",
  // Glass: the sidebar-card glass, edged and lifted off the page.
  "#atr-home[data-cards='glass'] .atr-card-open { background: var(--atr-side-card, var(--ui-widget-surface-background, rgba(20, 22, 28, 0.55))); box-shadow: 0 0 0 1px var(--atr-edge, rgba(255, 255, 255, 0.07)), 0 10px 26px rgba(0, 0, 0, 0.24); }",
  "#atr-home[data-cards='glass'] .atr-card-open:hover { background: var(--atr-side-card-hi, var(--atr-side-card, var(--ui-widget-surface-background, rgba(20, 22, 28, 0.55)))); box-shadow: 0 0 0 1px color-mix(in srgb, var(--atr-hi, 255, 255, 255) 16%, transparent), 0 14px 32px rgba(0, 0, 0, 0.3); }",
  '#atr-home .atr-card-open:focus-visible { box-shadow: 0 0 0 2px rgba(var(--atr-home-hi), 0.7); }',
  '#atr-home .atr-card-title { font-size: 15.5px; font-weight: 600; letter-spacing: 0.005em; color: var(--atr-home-ink-0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  '#atr-home .atr-card-why { font-size: 12.5px; color: var(--atr-home-ink-2); opacity: 0.72; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  '#atr-home .atr-card-x { all: unset; position: absolute; top: 8px; right: 8px; width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; font-size: 15px; line-height: 1; cursor: pointer; color: var(--atr-home-ink-3); opacity: 0; transition: opacity 120ms ease, background 120ms ease; }',
  '#atr-home .atr-card:hover .atr-card-x, #atr-home .atr-card:focus-within .atr-card-x { opacity: 0.7; }',
  '#atr-home .atr-card-x:hover { opacity: 1; background: rgba(var(--atr-home-hi), 0.14); }',
    '@media (prefers-reduced-motion: reduce) { #atr-home[data-on="1"] { animation: none; } #atr-home .atr-card-open { transition: none; } }'
].join('\n')

const ensureHomeStyle = () => {
  if (typeof document === 'undefined') return
  // a hot-reloaded plugin finds its old sheet still in place; refresh it
  const old = document.getElementById('atr-home-style')
  if (old) { if (old.textContent !== HOME_CSS) old.textContent = HOME_CSS; return }
  const el = document.createElement('style')
  el.id = 'atr-home-style'
  el.textContent = HOME_CSS
  document.head.appendChild(el)
}
const ensureSnippetStyle = () => {
  if (typeof document === 'undefined' || document.getElementById('atr-snippet-style')) return
  const el = document.createElement('style')
  el.id = 'atr-snippet-style'
  el.textContent = SNIPPET_CSS
  document.head.appendChild(el)
}

const SNIP_PIN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>'
const SNIP_PIN_SOLID = SNIP_PIN.replace('fill="none"', 'fill="currentColor"')

function SnippetCard({ attrs, pins, onPin, onCopy, onGrab }) {
  const title = attrs.title || ''
  const value = attrs.value || ''
  const note = attrs.note || ''
  const source = attrs.source || ''
  const accent = TONES[attrs.tone] === 'accent'
  const id = `${title}|${value}|${note}`.slice(0, 300)
  const pinned = useValue(pins).some(p => p.id === id)

  const body = [title, value, note, source].filter(Boolean).join(' — ')

  const act = (label, svg, run, extra) =>
    jsx('button', Object.assign({
      'aria-label': label,
      className: 'atr-snip-act',
      onClick: run,
      title: label,
      type: 'button',
      dangerouslySetInnerHTML: { __html: svg }
    }, extra))

  const copy = event => {
    onCopy(body)
    // a check for a beat, without React state
    const btn = event.currentTarget
    btn.setAttribute('data-done', '')
    setTimeout(() => btn.removeAttribute('data-done'), 1200)
  }

  return jsxs('div', {
    className: 'atr-snip',
    'data-tone': accent ? 'accent' : 'plain',
    // a click opens the preview, a drag carries it to the Pins or the Shelf
    onPointerDown: event => {
      if (event.target.closest?.('button')) return
      onGrab?.(event, { id, title, value, note, source, body })
    },
    title: 'Click to preview, drag to Snippets or the Shelf',
    'data-atr-snippet': id,
    children: [
      jsxs('div', {
        className: 'atr-snip-head',
        children: [
          title ? jsx('div', { className: 'atr-snip-title', children: title }) : null,
          jsxs('div', {
            className: 'atr-snip-acts',
            children: [
              jsx('button', {
                'aria-label': 'Copy',
                className: 'atr-snip-act',
                onClick: copy,
                title: 'Copy',
                type: 'button',
                children: [
                  jsx('span', { className: 'atr-snip-idle', children: jsx(Codicon, { name: 'copy', size: '0.85rem' }) }),
                  jsx('span', { className: 'atr-snip-done', children: jsx(Codicon, { name: 'check', size: '0.85rem' }) })
                ]
              }),
              act(pinned ? 'Unpin' : 'Pin to Snippets', pinned ? SNIP_PIN_SOLID : SNIP_PIN,
                () => onPin({ id, title, value, note, source, body }), pinned ? { 'data-on': '' } : null)
            ]
          })
        ]
      }),
      value ? jsx('div', { className: 'atr-snip-value', children: value }) : null,
      note ? jsx('div', { className: 'atr-snip-note', children: note }) : null,
      source ? jsx('div', { className: 'atr-snip-source', children: source }) : null
    ]
  })
}

// ── Clock chip ─────────────────────────────────────────────────────────────
// Inline styles again (same reason as the card), plus one accent dot: a chip
// this quiet was invisible at the far end of the bar, and a lamp reads faster
// than a word.

function PhaseChip({ appearance, onSelect }) {
  const selected = useValue(appearance)
  const choices = [['gruvbox', 'Gruvbox'], ['custom', 'Custom'], ['hermes', 'Hermes appearance']]
  return jsxs(Select, { value: selected, onValueChange: onSelect, children: [
    jsx(SelectTrigger, { 'aria-label': 'Hermes Hermes Atrium appearance', className: 'h-7 w-auto text-xs', children: jsx(SelectValue, {}) }),
    jsx(SelectContent, { children: choices.map(([id, label]) => jsx(SelectItem, { value: id, children: label }, id)) })
  ] })
}

/* ── recents/engine.js ──────────────────────────────────────── generated by scripts/build-recents.mjs, edit recents/engine.js instead */
const RECENTS = (() => {
/* Which sessions to put in front of you on a new tab.

   Pure functions over plain data: no DOM, no Hermes, no clock of their own (every
   function takes `now`). That keeps the rules testable and keeps the adapter in
   plugin.js a thin layer that only records visits and draws the result.

   The constants come from replaying real history: the score is ranked at the start
   of each day using only earlier data, and the question is how often the session
   actually opened that day was in the top six.
     - a 3 day half-life put it there on 81% of days (plain recency: 65%); a 30 day
       half-life with a lifetime-count multiplier, the Firefox shape, fell to 53%.
       Heavy sessions come back within days, not months.
     - no session with one or two user turns was ever reopened on a later day. */

const DAY = 86400000
const HALF_LIFE_DAYS = 3
const VISIT_GAP_MS = 45 * 60 * 1000     // a pause longer than this starts a new visit
const QUICK_MAX_MESSAGES = 6            // at most this many messages in total...
const QUICK_MAX_TURNS = 3               // ...and you spoke at most this many times
const QUICK_GRACE_MS = DAY              // a fresh quick chat stays where it is for a day
const REGULAR_MIN_DAYS = 3              // distinct days opened before a session counts as a regular
const REGULAR_WINDOW_DAYS = 45          // a regular unseen this long drops off
const MAX_RECORDS = 500
const MAX_VISITS = 40
const MAX_DAYS = 120

const dayOf = t => Math.floor(t / DAY)
const finite = n => typeof n === 'number' && Number.isFinite(n)

const emptyRecord = id => ({ id, visits: [], days: [], dismissed: 0, keep: false, never: false })

/* ── recording ──────────────────────────────────────────────────────────── */

/* A visit is {t: start, last: latest sign of life, turns: times you sent something,
   seeded: true when it was inferred from the session list, not watched}. */
const currentVisit = (rec, now) => {
  const v = rec.visits[rec.visits.length - 1]
  return v && now - v.last <= VISIT_GAP_MS && now >= v.t ? v : null
}

function recordFocus(rec, now) {
  let v = currentVisit(rec, now)
  if (!v) {
    v = { t: now, last: now, turns: 0 }
    rec.visits.push(v)
    if (rec.visits.length > MAX_VISITS) rec.visits.splice(0, rec.visits.length - MAX_VISITS)
  } else v.last = now
  const d = dayOf(now)
  if (!rec.days.includes(d)) {
    rec.days.push(d)
    rec.days.sort((a, b) => a - b)
    if (rec.days.length > MAX_DAYS) rec.days.splice(0, rec.days.length - MAX_DAYS)
  }
  return rec
}

function recordTurn(rec, now) {
  recordFocus(rec, now)
  currentVisit(rec, now).turns++
  return rec
}

/* A session never watched still has a last-active time: give it one inferred
   visit so the first day is not empty. It does not count as a day opened (that
   would pass for a return), and it is weighted down. */
function seedFromSession(rec, session) {
  if (rec.visits.length || !finite(session.last_active)) return rec
  const t = session.last_active * 1000
  rec.visits.push({ t, last: t, turns: (session.message_count || 0) >= 10 ? 4 : 1, seeded: true })
  return rec
}

/* ── reading ────────────────────────────────────────────────────────────── */

const lastTouch = (rec, session) => {
  const v = rec && rec.visits[rec.visits.length - 1]
  const fromSession = session && finite(session.last_active) ? session.last_active * 1000 : 0
  return Math.max(v ? v.last : 0, fromSession)
}

const turnsOf = rec => (rec ? rec.visits.reduce((n, v) => n + (v.seeded ? 0 : v.turns), 0) : 0)
const daysOf = rec => (rec ? rec.days.length : 0)

/* Quick chat: a small errand. Only the shape of the conversation decides, never
   how much the agent did: "clean up this directory" can run 40 tool calls and
   still be an errand, and a C++ deep dive can be pure talk. */
function isQuick(session, rec, now) {
  if (session.pinned || (rec && (rec.keep || rec.never))) return false
  if ((session.message_count || 0) > QUICK_MAX_MESSAGES) return false
  if (turnsOf(rec) > QUICK_MAX_TURNS || daysOf(rec) >= 2) return false
  return now - lastTouch(rec, session) > QUICK_GRACE_MS
}

const visitWeight = v => {
  if (v.seeded) return v.turns >= 4 ? 0.6 : 0.25
  return v.turns < 2 ? 0.2 : v.turns < 4 ? 0.6 : 1
}

function scoreRecent(rec, now) {
  const lambda = Math.LN2 / (HALF_LIFE_DAYS * DAY)
  let s = 0
  for (const v of rec.visits) if (v.last <= now) s += visitWeight(v) * Math.exp(-lambda * (now - v.last))
  return s
}

const median = xs => {
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/* The usual gap, in days, between the days a session was opened. null with too
   little history to say. */
function cadence(rec) {
  if (rec.days.length < REGULAR_MIN_DAYS) return null
  const gaps = []
  for (let i = 1; i < rec.days.length; i++) gaps.push(rec.days[i] - rec.days[i - 1])
  return Math.max(1, Math.round(median(gaps)))
}

function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 2) return 'just now'
  if (m < 60) return m + 'm ago'
  const h = Math.round(m / 60)
  if (h < 24) return h + 'h ago'
  const d = Math.round(h / 24)
  return d < 14 ? d + 'd ago' : Math.round(d / 7) + 'w ago'
}

const candidates = (sessions, records, now, exclude) =>
  sessions.filter(s => s && s.id && !s.hidden && !s.archived && !exclude.has(s.id) && !s.is_internal_child)
    .map(s => ({ s, rec: records[s.id] || null }))

/* "Pick up where you left off": fast recency. Pinned sessions are already one
   click away, quick chats are noise, and a dismissed one stays gone until you
   open it again. */
const PICK_UP_COUNT = 3   // one row of three on the new tab

function pickUp(sessions, records, now, { exclude = new Set(), limit = PICK_UP_COUNT } = {}) {
  const out = []
  for (const { s, rec } of candidates(sessions, records, now, exclude)) {
    if (!rec || s.pinned || rec.never || isQuick(s, rec, now)) continue
    if (rec.dismissed && rec.dismissed >= lastTouch(rec, null)) continue
    const score = scoreRecent(rec, now)
    if (score < 0.05) continue
    const touched = lastTouch(rec, s)
    const lately = rec.days.filter(d => d > dayOf(now) - 30).length
    out.push({ id: s.id, session: s, score, touched,
      reason: lately >= 3 ? `Opened on ${lately} of the last 30 days` : 'Left off ' + ago(now - touched) })
  }
  out.sort((a, b) => b.score - a.score || b.touched - a.touched)
  return out.slice(0, limit)
}

/* "Your regulars": the few you keep coming back to, however rarely. Ordered by
   whether you are due, then by how many days you have opened them. They never
   compete with recency, so this row does not churn. */
function regulars(sessions, records, now, { exclude = new Set(), limit = 4 } = {}) {
  const out = []
  for (const { s, rec } of candidates(sessions, records, now, exclude)) {
    if (!rec || rec.never) continue
    const days = daysOf(rec)
    if (!rec.keep && (days < REGULAR_MIN_DAYS || now - lastTouch(rec, s) > REGULAR_WINDOW_DAYS * DAY)) continue
    const gap = cadence(rec)
    const since = Math.floor((now - lastTouch(rec, s)) / DAY)
    const due = gap !== null && gap >= 2 && since >= Math.round(gap * 0.7)
    const reason = due ? `Usually every ~${gap} days, last ${since === 0 ? 'today' : since + ' days ago'}`
      : rec.keep ? 'Kept by you' : `Opened on ${days} days`
    out.push({ id: s.id, session: s, due, days, touched: lastTouch(rec, s), reason })
  }
  out.sort((a, b) => Number(b.due) - Number(a.due) || b.days - a.days || b.touched - a.touched)
  return out.slice(0, limit)
}

/* ── storage ────────────────────────────────────────────────────────────── */

/* Stored data is read back through this: a damaged or hand-edited value yields
   fewer records, never an exception or a poisoned score. */
function sanitize(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const id of Object.keys(raw)) {
    const r = raw[id]
    if (!r || typeof r !== 'object' || typeof id !== 'string' || id.length > 200 || id === '__proto__') continue
    const rec = emptyRecord(id)
    for (const v of Array.isArray(r.visits) ? r.visits.slice(-MAX_VISITS) : []) {
      if (v && finite(v.t) && finite(v.last) && v.last >= v.t && finite(v.turns) && v.turns >= 0)
        rec.visits.push({ t: v.t, last: v.last, turns: Math.min(v.turns, 1e4), ...(v.seeded ? { seeded: true } : {}) })
    }
    rec.days = (Array.isArray(r.days) ? r.days : []).filter(d => finite(d) && d > 0).slice(-MAX_DAYS).sort((a, b) => a - b)
    rec.dismissed = finite(r.dismissed) ? r.dismissed : 0
    rec.keep = r.keep === true
    rec.never = r.never === true
    out[id] = rec
  }
  return out
}

/* Keep the most recently touched MAX_RECORDS. */
function prune(records) {
  const ids = Object.keys(records)
  if (ids.length <= MAX_RECORDS) return records
  const last = id => (records[id].visits.at(-1) || { last: 0 }).last
  ids.sort((a, b) => last(b) - last(a))
  const out = {}
  for (const id of ids.slice(0, MAX_RECORDS)) out[id] = records[id]
  return out
}
return { DAY, HALF_LIFE_DAYS, VISIT_GAP_MS, QUICK_MAX_MESSAGES, QUICK_MAX_TURNS, QUICK_GRACE_MS, REGULAR_MIN_DAYS, REGULAR_WINDOW_DAYS, MAX_RECORDS, MAX_VISITS, MAX_DAYS, emptyRecord, recordFocus, recordTurn, seedFromSession, lastTouch, isQuick, scoreRecent, cadence, ago, PICK_UP_COUNT, pickUp, regulars, sanitize, prune }
})()
/* ── end recents/engine.js ── */

// ══ §8 PLUGIN REGISTRATION (register: settings, timers, observers) ═════════


// ── The Atrium mark ─────────────────────────────────────────────────────────
// An atrium is the open, day-lit room at the heart of a house: a square court
// with a column at each corner. The glyph is that plan — four columns round an
// open centre — which also reads as a card in a frame, the plugin's own shape.
// Two cuts of one drawing: a one-colour glyph for the Settings rail (it rides
// the codicon slot as a CSS mask, so it takes the rail's own colour and hover
// states like every core icon), and the same plan stroked bare for the top of
// the settings page.
const ATRIUM_GLYPH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
  + '<path fill="#000" fill-opacity=".38" d="M2.6 2.6h18.8v18.8H2.6zm1.8 1.8v15.2h15.2V4.4z"/>'
  + '<path fill="#000" d="M6.2 6.2h3.8v3.8H6.2zM14 6.2h3.8v3.8H14zM6.2 14h3.8v3.8H6.2zM14 14h3.8v3.8H14z"/>'
  + '</svg>'
// the same plan, stroked bare in currentColor, for the top of the settings page
const ATRIUM_MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" style="display:block" aria-hidden="true">'
  + '<path fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2" d="M2.6 2.6h18.8v18.8H2.6z"/>'
  + '<g fill="currentColor"><rect x="6.2" y="6.2" width="3.8" height="3.8"/><rect x="14" y="6.2" width="3.8" height="3.8"/><rect x="6.2" y="14" width="3.8" height="3.8"/><rect x="14" y="14" width="3.8" height="3.8"/></g>'
  + '</svg>'

const ATRIUM_ICON_CSS = [
  '.codicon.codicon-atrium::before {',
  "  content: ''; display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em;",
  '  background-color: currentColor;',
  `  -webkit-mask: url("data:image/svg+xml,${encodeURIComponent(ATRIUM_GLYPH_SVG)}") center / contain no-repeat;`,
  `  mask: url("data:image/svg+xml,${encodeURIComponent(ATRIUM_GLYPH_SVG)}") center / contain no-repeat;`,
  '}'
].join('\n')

const TRANSPARENT_HERMES_WINDOWS = new Set(['overlay', 'hud', 'quick', 'wake'])

function isTransparentHermesWindow(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    return TRANSPARENT_HERMES_WINDOWS.has(new URLSearchParams(search || '').get('win'))
  } catch {
    return false
  }
}

export default {
  id: 'hermes-atrium',
  name: 'Hermes Atrium',
  description: 'A painting or your own picture behind Hermes, tinted glass over it, reply panels, snippet cards and calmer chat.',

  register(ctx) {
    // Hermes's transparent helper windows (the popped-out pet, the HUD, quick
    // entry, the wake indicator) load every plugin too. They must show the
    // desktop behind them, so Atrium paints nothing there: no picture, no glass.
    // Keep this list in step with TRANSPARENT_WINDOWS in Hermes's main.tsx.
    if (isTransparentHermesWindow()) return

    const stored = key => ctx.storage.get(key, undefined)

    // the rail glyph (see "The Atrium mark")
    let iconStyle = null
    if (typeof document !== 'undefined' && document.head) {
      document.getElementById('atr-icon-style')?.remove()
      iconStyle = document.createElement('style')
      iconStyle.id = 'atr-icon-style'
      iconStyle.textContent = ATRIUM_ICON_CSS
      document.head.appendChild(iconStyle)
    }

    // Our own leftovers from an instance that died before registering its
    // disposer: a stale canvas or starfield is a full-screen layer at z-index
    // -1, so it would sit on top of the sheet.
    for (const staleId of ['atr-gl-sky', 'atr-gl-sky-style', 'atr-aurora-stars', 'zephyr-sky-style', 'zephyr-chrome-base', 'zephyr-chrome-details', ...SHEET_IDS]) {
      let stale = document.getElementById(staleId)
      while (stale) {
        if (stale.parentNode) stale.parentNode.removeChild(stale)
        stale = document.getElementById(staleId)
      }
    }

    // ── Tabs: ⌘⌥←/→, and the labels of a collapsed pane ───────────────────
    // ⌘⌥←/→ walks the session tabs. It is a contributed keybind, not a window
    // listener: it shows in Settings > Keybinds, it can be rebound, and it
    // collides with nothing the app already binds. A capture-phase listener
    // stays as the fallback for an app build that predates contributed
    // keybinds, and it stands down for a moment whenever the keybind fired so
    // the two can never both step the strip.
    if (typeof window !== 'undefined') {
      // Session tabs, not the pane tabs: the rows in the tree that each hold one
      // session (workspace + session-tile:<id>), which is what "the session
      // tabs" means. Pane tabs are [data-slot='pane-tab'] and are excluded.
      // Session tabs, not the pane tabs: the rows in the tree that each hold one
      // session (workspace + session-tile:<id>). Pane tabs are [data-slot='pane-tab']
      // and the sidebar's copies sit inside [data-atr-arc-col]; both are excluded.
      const sessionTabs = () => Array.from(document.querySelectorAll("[role='tab'][data-tree-tab]"))
        .filter(tab => tab.dataset.slot !== 'pane-tab' && !tab.closest('[data-atr-arc-col]') && tab.getClientRects().length > 0)
      // With a split there is one strip per pane: use the strip above the thing you are working in.
      const stripOf = tabs => {
        const strips = new Map()
        for (const tab of tabs) {
          const strip = tab.closest("[role='tablist']") || tab.parentElement
          strips.set(strip, [...(strips.get(strip) || []), tab])
        }
        const lists = [...strips.values()]
        if (lists.length < 2) return lists[0] || []
        const focus = document.activeElement
        const box = focus && focus !== document.body ? focus.getBoundingClientRect() : null
        const cx = box && box.width ? box.left + box.width / 2 : null
        if (cx !== null) {
          for (const list of lists) {
            const rect = (list[0].closest("[role='tablist']") || list[0]).getBoundingClientRect()
            if (cx >= rect.left && cx <= rect.right) return list
          }
        }
        return lists.find(list => list.some(tab => tab.getAttribute('aria-selected') === 'true')) || lists[0]
      }
      // A tab selects on pointer down and up. A bare click() does nothing on the app build
      // this was written against, and a full mouse sequence would start the tab's drag.
      const pressTab = tab => {
        const r = tab.getBoundingClientRect()
        const at = { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
        const pointer = { ...at, pointerId: 1, isPrimary: true, pointerType: 'mouse' }
        tab.dispatchEvent(new PointerEvent('pointerdown', pointer))
        tab.dispatchEvent(new PointerEvent('pointerup', pointer))
      }
      let lastKeybind = 0
      const stepTab = dir => {
        const tabs = stripOf(sessionTabs())
        if (tabs.length < 2) return false
        const at = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true')
        const next = tabs[((at < 0 ? 0 : at) + dir + tabs.length) % tabs.length]
        pressTab(next)
        next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
        return true
      }
      for (const [id, dir, label, combo] of [
        ['hermes-atrium.tabPrev', -1, 'Previous session tab', 'mod+alt+left'],
        ['hermes-atrium.tabNext', 1, 'Next session tab', 'mod+alt+right']
      ]) {
        ctx.register({
          id,
          area: 'keybinds',
          data: { id, category: 'navigation', defaults: [combo], label, run: () => { lastKeybind = Date.now(); return stepTab(dir) } }
        })
      }
      // The fallback for an app build without contributed keybinds. It also works with the
      // cursor in the composer: ⌘⌥← has no text-editing meaning, and the composer is where
      // the cursor usually is.
      const onTabChord = event => {
        if (Date.now() - lastKeybind < 250) return
        if (!event.metaKey || !event.altKey || event.ctrlKey || event.shiftKey || event.isComposing) return
        const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (!dir || !stepTab(dir)) return
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      window.addEventListener('keydown', onTabChord, true)
      ctx.onDispose?.(() => window.removeEventListener('keydown', onTabChord, true))
    }

    // A collapsed pane collapses to a sliver; the app clips rather than hides its
    // tab labels, which leaves a word stacked one letter per line. Measure the
    // tabs, mark the narrow ones, and let this sheet drop the word.
    if (typeof document !== 'undefined' && typeof ResizeObserver !== 'undefined') {
      const PANE_RAIL_CSS = [
        // Collapsed, the pane tabs are a few pixels wide. A wrapped "Sessions", one
        // letter per line, is what that used to look like. Now the label goes away
        // entirely and the tab becomes a small bar: dim when it is not the pane you
        // are in, ink-bright when it is. Nothing to wrap, nothing to clip.
        "[data-slot='pane-tab'][data-atr-rail='true'] {",
        '  justify-content: center !important;',
        '  align-items: center !important;',
        '  padding: 0 !important;',
        '  gap: 0 !important;',
        '  overflow: hidden !important;',
        '  white-space: nowrap !important;',
        '  border: 0 !important;',
        '  box-shadow: none !important;',
        '  background: transparent !important;',
        '}',
        "[data-slot='pane-tab'][data-atr-rail='true'] > * {",
        '  display: none !important;',
        '}',
        "[data-slot='pane-tab'][data-atr-rail='true']::before {",
        "  content: ''; width: 3px; height: 16px; border-radius: 999px;",
        '  background: var(--atr-ink-3, rgba(255, 255, 255, 0.32));',
        '  transition: background-color 120ms ease, height 120ms ease;',
        '}',
        "[data-slot='pane-tab'][data-atr-rail='true']:is([aria-selected='true'], [data-active='true'])::before {",
        '  height: 22px;',
        '  background: var(--atr-ink-0, #fbf1c7);',
        '}'
      ]
      document.getElementById('atr-pane-rail')?.remove()
      const railStyle = document.createElement('style')
      railStyle.id = 'atr-pane-rail'
      railStyle.textContent = PANE_RAIL_CSS.join('\n')
      document.head.appendChild(railStyle)
      const seenTabs = new WeakSet()
      const railObs = new ResizeObserver(entries => {
        for (const entry of entries) {
          const tab = entry.target
          const rail = entry.contentRect.width < 56 ? 'true' : 'false'
          if (tab.dataset.atrRail !== rail) {
            tab.dataset.atrRail = rail
            // collapsed, the label is gone, so the hover title has to carry it
            if (rail === 'true') {
              const label = (tab.textContent || '').trim()
              if (label && !tab.dataset.atrTitle) {
                tab.dataset.atrTitle = label
                tab.setAttribute('title', label)
              }
            } else if (tab.dataset.atrTitle) {
              tab.removeAttribute('title')
              delete tab.dataset.atrTitle
            }
          }
        }
      })
      const paneTab = "[data-slot='pane-tab']"
      const observeTab = tab => {
        if (!tab.isConnected || seenTabs.has(tab)) return
        seenTabs.add(tab)
        railObs.observe(tab)
      }
      const unobserveTab = tab => {
        if (tab.isConnected || !seenTabs.delete(tab)) return
        railObs.unobserve(tab)
      }
      const visitTabs = (node, visit) => {
        if (node.nodeType !== 1) return
        if (node.matches(paneTab)) visit(node)
        node.querySelectorAll(paneTab).forEach(visit)
      }
      document.querySelectorAll(paneTab).forEach(observeTab)
      const tabObserver = new MutationObserver(records => {
        for (const record of records) {
          record.addedNodes.forEach(node => visitTabs(node, observeTab))
          record.removedNodes.forEach(node => visitTabs(node, unobserveTab))
        }
      })
      tabObserver.observe(document.documentElement, { childList: true, subtree: true })
      ctx.onDispose?.(() => {
        tabObserver.disconnect()
        railObs.disconnect()
        railStyle.remove()
      })
    }

    const pins = atom((() => { const v = stored(STORE_KEYS.pins); return Array.isArray(v) ? v.filter(p => p && typeof p.id === 'string') : [] })())
    const auto = atom(stored(STORE_KEYS.auto) !== false)
    // Picking another theme in Appearance must really switch to it:
    // while one is selected, Hermes Atrium draws no painting and asks for no theme. Picking
    // a Hermes Atrium theme, the status chip or a look wakes it again. Remembered across restarts.
    let away = false
    if (typeof document !== 'undefined') {
      const now = document.documentElement.dataset.hermesTheme || ''
      away = (stored('away') === true || stored(STORE_KEYS.auto) === false) && Boolean(now) && !isOurTheme(now)
    }
    const migratedTint = migrateGruvboxTint(stored(STORE_KEYS.look), stored('glass'))
    setGlass(migratedTint || stored('gruvboxTint'), migratedTint ? LEGACY_GLASS_DEFAULTS : GLASS_DEFAULTS)
    if (migratedTint) {
      // Write the palette first so an interrupted migration can safely run again.
      ctx.storage.set('gruvboxTint', { ...GLASS })
      ctx.storage.set(STORE_KEYS.look, 'gruvbox')
    }
    const appearance = atom(away ? 'hermes' : stored(STORE_KEYS.look) === 'custom' ? 'custom' : 'gruvbox')
    const appearanceAssets = atom(0)
    const wake = () => { away = false; ctx.storage.set('away', false) }
    const tint = atom(stored(STORE_KEYS.tint) === true)
    // Two independent switches. `backdropOn` shows the picture (the painting, or
    // with a tint, the desktop); `chrome` is Atrium's sheet of glass, type and
    // controls. They were once welded together because both lived in one <style>.
    const backdropOn = atom(stored(STORE_KEYS.sky) !== false)
    const chromeOn = atom(stored(STORE_KEYS.chrome) !== false)
    const replyGround = atom(stored(STORE_KEYS.replyGround) !== false)
    // 'gruvbox' = the built-in skin at its shipped defaults; 'custom'
    // = the same skin driven by your own picture and knobs
    // (hermes-atrium-theme.json). The two differ only in which values the sheet reads.
    const LOOKS = ['gruvbox', 'custom']
    const lookStore = stored(STORE_KEYS.look)
    const look = atom(LOOKS.includes(lookStore) ? lookStore : 'gruvbox')
    setLookMode(look.get())
    // The panel's own dials (solid / max / tone / edge / pad), live in
    // Settings -> Hermes Atrium -> Chat & motion. `panel` (the module-level copy every
    // pure helper reads) is kept in step below, so no function re-reads the atom.
    const panelSettings = atom((() => {
      const raw = stored(STORE_KEYS.panel)
      const out = { ...PANEL_DEFAULTS }
      if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) {
        const n = Number(v)
        if (Object.hasOwn(PANEL_DEFAULTS, k) && Number.isFinite(n)) out[k] = n
      }
      return out
    })())
    const syncPanel = () => { panel = { ...panelSettings.get() } }
    syncPanel()
    let panelUnsub = null
    // Keep the local `panel` copy in step without touching render state from the
    // callback: the subscription may fire synchronously at registration, before
    // the render-scoped `let`s exist. The settings handlers and the refresh key
    // (which serialises panelSettings) do the repaint.
    try { panelUnsub = panelSettings.subscribe?.(() => syncPanel()) } catch {}
    const margins = atom(stored(STORE_KEYS.margins) === true)
    const collapseWork = atom(stored(STORE_KEYS.collapseWork) !== false)
    const motion = atom(stored(STORE_KEYS.motion) !== false)
    const statusDock = atom(stored(STORE_KEYS.statusDock) !== false)
    const library = atom(stored(STORE_KEYS.library) !== false)
    const homeOn = atom(stored(STORE_KEYS.home) !== false)
    const homeCard = atom(stored(STORE_KEYS.homeCard) === 'glass' ? 'glass' : 'matte')
    let homeApi = { reset() {} }

    const persist = () => {
      ctx.storage.set(STORE_KEYS.pins, pins.get())
      ctx.storage.set(STORE_KEYS.auto, auto.get())
      ctx.storage.set(STORE_KEYS.tint, tint.get())
      ctx.storage.set(STORE_KEYS.sky, backdropOn.get())
      ctx.storage.set(STORE_KEYS.chrome, chromeOn.get())
      ctx.storage.set(STORE_KEYS.replyGround, replyGround.get())
      ctx.storage.set(STORE_KEYS.look, look.get())
      ctx.storage.set(STORE_KEYS.margins, margins.get())
      ctx.storage.set(STORE_KEYS.collapseWork, collapseWork.get())
      ctx.storage.set(STORE_KEYS.motion, motion.get())
      ctx.storage.set(STORE_KEYS.panel, panelSettings.get())
      ctx.storage.set(STORE_KEYS.statusDock, statusDock.get())
      ctx.storage.set(STORE_KEYS.library, library.get())
      ctx.storage.set(STORE_KEYS.home, homeOn.get())
      ctx.storage.set(STORE_KEYS.homeCard, homeCard.get())
    }

    const applyMargins = on => {
      if (typeof document === 'undefined' || !document.documentElement) return
      if (!document.documentElement.dataset) document.documentElement.dataset = {}
      if (on) {
        document.documentElement.dataset.atrMargins = 'spacious'
      } else {
        delete document.documentElement.dataset.atrMargins
      }
    }
    // The Motion switch: every duration in the always-on sheet (§5b) reads a
    // token, so one attribute zeroes the whole app's animation.
    const applyMotion = on => {
      if (typeof document === 'undefined' || !document.documentElement) return
      if (!document.documentElement.dataset) document.documentElement.dataset = {}
      if (on) delete document.documentElement.dataset.atrMotion
      else document.documentElement.dataset.atrMotion = 'off'
    }
    // ── Wordmark keeps its size in spacious mode ─────────────────────────────
    // The HERMES AGENT wordmark sizes itself from its container (container
    // units / percentage widths), so anything that narrows an ancestor in
    // spacious mode shrinks it. Rather than chase every ancestor, measure the
    // wordmark with spacious margins briefly lifted (same frame, never painted),
    // then lock that exact size on it while spacious is on.
    const WORDMARK_SEL = "[data-slot='aui_intro'] :is(.wordmark, [class*='wordmark'])"
    let wordmarkKey = ''

    const unpinWordmark = () => {
      if (typeof document === 'undefined') return
      wordmarkKey = ''
      document.querySelectorAll?.('[data-atr-wordmark-pinned]').forEach(el => {
        el.removeAttribute('data-atr-wordmark-pinned')
        for (const p of ['width', 'max-width', 'min-width', 'height', 'font-size', 'letter-spacing', 'margin-inline', 'flex-shrink']) el.style.removeProperty(p)
      })
    }

    const pinWordmark = () => {
      if (typeof document === 'undefined' || typeof window === 'undefined' || !document.documentElement) return
      // The margins check comes first: the wordmark query below uses a
      // substring class match, which Blink cannot hash, and this runs on
      // every scan (up to ~16x/s while the transcript streams).
      if (!margins.get()) {
        if (wordmarkKey) unpinWordmark()
        return
      }
      const mark = document.querySelector?.(WORDMARK_SEL)
      if (!mark) {
        if (wordmarkKey) unpinWordmark()
        return
      }
      const root = document.documentElement
      // Re-measure only when the window size changes or a new wordmark mounts.
      const key = `${window.innerWidth}x${window.innerHeight}`
      if (wordmarkKey === key && mark.hasAttribute('data-atr-wordmark-pinned')) return

      const targets = [mark, ...mark.querySelectorAll('svg, img')]
      unpinWordmark()
      delete root.dataset.atrMargins
      const sizes = targets.map(el => {
        const rect = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { width: rect.width, height: rect.height, fontSize: cs.fontSize, letterSpacing: cs.letterSpacing }
      })
      root.dataset.atrMargins = 'spacious'

      targets.forEach((el, i) => {
        const m = sizes[i]
        if (!m.width) return
        el.setAttribute('data-atr-wordmark-pinned', 'true')
        el.style.setProperty('width', `${m.width}px`, 'important')
        el.style.setProperty('min-width', `${m.width}px`, 'important')
        el.style.setProperty('max-width', 'none', 'important')
        el.style.setProperty('flex-shrink', '0', 'important')
        if (el.tagName === 'svg' || el.tagName === 'IMG') {
          el.style.setProperty('height', `${m.height}px`, 'important')
        } else {
          el.style.setProperty('font-size', m.fontSize, 'important')
          el.style.setProperty('letter-spacing', m.letterSpacing, 'important')
          // Centre it even when the column is narrower than the mark.
          el.style.setProperty('margin-inline', `calc((100% - ${m.width}px) / 2)`, 'important')
        }
      })
      wordmarkKey = key
    }

    // ── Chat column fits the composer exactly (spacious mode) ───────────────
    // CSS alone gets within a few px: the thread scrolls in a viewport whose
    // scrollbar eats its right edge, so a centred column sits half a scrollbar
    // left of the composer (which is portaled elsewhere and centred on the
    // full pane). Measure the composer's visible surface and pin the column to
    // its exact left edge and width.
    let colObs = null
    let colWatched = []
    let colKey = ''
    const unfitColumn = () => {
      colKey = ''
      document.querySelectorAll?.('[data-atr-col-fit]').forEach(el => {
        el.removeAttribute('data-atr-col-fit')
        el.style.removeProperty('--atr-col-left')
        el.style.removeProperty('--atr-col-w')
      })
    }
    const fitColumn = () => {
      if (typeof document === 'undefined') return
      if (!margins.get()) {
        if (colKey) unfitColumn()
        return
      }
      const content = document.querySelector?.("[data-slot='aui_thread-content']")
      const viewport = content?.closest?.("[data-slot='aui_thread-viewport']")
      const surface = document.querySelector?.("[data-slot='composer-dock']:not([data-popped-out]) [data-slot='composer-surface']")
      const intro = content?.querySelector?.("[data-slot='aui_intro'], .wordmark, [class*='wordmark']")
      if (!content || !viewport || !surface || intro) {
        if (colKey) unfitColumn()
        return
      }
      const watch = [viewport, surface]
      if (typeof ResizeObserver === 'function' && (colWatched[0] !== viewport || colWatched[1] !== surface)) {
        colObs?.disconnect()
        colObs = new ResizeObserver(() => fitColumn())
        watch.forEach(el => colObs.observe(el))
        colWatched = watch
      }
      const v = viewport.getBoundingClientRect()
      const c = surface.getBoundingClientRect()
      if (!c.width || !v.width) return
      const left = Math.round((c.left - v.left - viewport.clientLeft) * 2) / 2
      const width = Math.round(c.width * 2) / 2
      if (left < 0 || left + width > viewport.clientWidth + 1) { if (colKey) unfitColumn(); return }
      const key = `${left}|${width}`
      if (key === colKey && content.hasAttribute('data-atr-col-fit')) return
      if (colKey && !content.hasAttribute('data-atr-col-fit')) unfitColumn()
      content.setAttribute('data-atr-col-fit', 'true')
      content.style.setProperty('--atr-col-left', `${left}px`)
      content.style.setProperty('--atr-col-w', `${width}px`)
      colKey = key
    }


    // ── Status dock: Advanced's bottom bar, as a left panel in Simple ────────
    // Simple mode unmounts the statusbar (footer[data-slot=statusbar]). The SDK
    // has no door to $statusbarVisible, but Hermes's own `view.toggleStatusbar`
    // keybind (mod+shift+s) writes a SESSION reveal while Simple shadows the
    // bar: it shows now, the user's Simple preference is never written, and
    // the reveal clears on any mode change. So in Simple we press that keybind
    // once, then lift the real bar (live items, menus, polls and all) out of
    // the flow into a collapsible glass panel on the left edge. In Advanced
    // the bar is left exactly where Hermes puts it.
    const DOCK_ATTR = 'data-atr-dock'
    const DOCK_OPEN_ATTR = 'data-atr-dock-open'
    const DOCK_SIDE_ATTR = 'data-atr-dock-side'
    const DOCK_ROOM_ATTR = 'data-atr-dock-room'
    const DOCK_POP_ATTR = 'data-atr-dock-pop'
    const SIDE_MIN_SESSIONS = 6
    const MODE_KEY = 'hermes.desktop.interfaceMode.v1'
    const IS_MAC = typeof navigator !== 'undefined' &&
      /mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '')
    const dock = { mode: '', revealed: false, pressed: false, tries: 0, lastTry: 0, head: null, style: null,
      side: null, room: null, sideOpen: false, manual: null, lastAuto: null, sideKey: '', ro: null, roWatched: [], popObs: null }
    const interfaceMode = () => {
      try {
        const raw = window.localStorage?.getItem(MODE_KEY) || ''
        return raw.includes('simple') ? 'simple' : 'advanced'
      } catch { return 'advanced' }
    }
    const DOCK_CSS = [
      `footer[data-slot='statusbar'][${DOCK_ATTR}] {`,
      '  position: fixed !important; z-index: 45; left: 0.5rem; top: 50%;',
      '  width: 15rem; height: auto !important; max-height: min(34rem, 72vh);',
      '  flex-direction: column !important; justify-content: flex-start !important; align-items: stretch !important; gap: 0.35rem !important;',
      '  padding: 0.45rem !important; overflow: hidden auto;',
      '  background: var(--atr-glass-strong, color-mix(in srgb, var(--ui-bg-primary) 94%, transparent)) !important;',
      '  border-radius: var(--atr-radius-lg, 16px);',
      '  box-shadow: var(--atr-lift-float, 0 16px 40px rgba(0,0,0,.34));',
      '  transform: translate(calc(-100% - 1rem), -50%); opacity: 0; visibility: hidden; pointer-events: none;',
      '  transition: transform var(--atr-t-3, 220ms) var(--atr-ease, ease), opacity var(--atr-t-2, 180ms) var(--atr-ease, ease), visibility 0s linear var(--atr-t-3, 220ms);',
      '}',
      `footer[data-slot='statusbar'][${DOCK_ATTR}][${DOCK_OPEN_ATTR}] {`,
      '  transform: translate(0, -50%); opacity: 1; visibility: visible; pointer-events: auto;',
      '  transition: transform var(--atr-t-3, 220ms) var(--atr-ease, ease), opacity var(--atr-t-2, 180ms) var(--atr-ease, ease), visibility 0s;',
      '}',
      // the bar's two halves become two stacked lists of full-width rows
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div {`,
      '  flex-direction: column !important; align-items: stretch !important; overflow: visible !important; gap: 0.1rem !important;',
      '}',
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div:empty { display: none; }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div + div:not(:empty) {`,
      '  border-top: 1px solid var(--atr-edge, rgba(255,255,255,.07)); padding-top: 0.25rem; margin-top: 0.1rem;',
      '}',
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > * {`,
      '  height: auto !important; min-height: var(--atr-sd-rowh, 1.75rem); width: 100%; justify-content: flex-start !important; box-sizing: border-box;',
      '  padding: 0 0.5rem !important; border-radius: var(--atr-r-2, 8px) !important;',
      '  transition: background-color var(--atr-t-2, 140ms) var(--atr-ease, ease), color var(--atr-t-2, 140ms) var(--atr-ease, ease);',
      // same face as the session rows (read off them at layout time)
      '  font-size: var(--atr-sd-font, 0.8125rem) !important; gap: 0.5rem !important; color: var(--atr-ink-1, var(--ui-text-primary)); background: transparent; border: 0;',
      '}',
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > * svg { width: 0.875rem !important; height: 0.875rem !important; flex: none; color: var(--atr-ink-2, var(--ui-text-secondary)); }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > * .truncate { min-width: 0; }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > *:hover { background: var(--atr-hover, color-mix(in srgb, var(--ui-text-primary) 8%, transparent)) !important; color: var(--atr-ink-0, var(--ui-text-primary)); }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > * > * { height: auto !important; }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] :is(.truncate) { white-space: nowrap; }`,
      // ── in the sessions sidebar: a card between the sessions and the rail ──
      // The card itself is our header button (it paints the glass and takes
      // the click); the real footer floats over its lower part when open.
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}] {`,
      '  left: var(--atr-sd-x) !important; top: var(--atr-sd-y) !important; width: var(--atr-sd-w) !important;',
      '  max-height: var(--atr-sd-max) !important; transform: none !important;',
      '  background: transparent !important; box-shadow: none !important; border-radius: 0 0 var(--atr-radius, 12px) var(--atr-radius, 12px);',
      // the same 4px gutter as the sessions card's rows
      '  box-sizing: border-box !important; padding: 0 4px 0.35rem !important; z-index: 41;',
      '  overflow: hidden auto !important; scrollbar-width: none;',
      '  clip-path: inset(0 0 100% 0);',
      // translate: the floating sidebar's slide (see SIDEBAR_CSS), 0ms otherwise
      '  transition: clip-path var(--atr-sd-dur) var(--atr-sd-ease), opacity var(--atr-t-2, 200ms) var(--atr-ease, ease) 40ms, visibility 0s linear var(--atr-sd-dur), translate var(--atr-arc-dur, 0ms) var(--atr-arc-ease, ease) !important;',
      '}',
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}]::-webkit-scrollbar { display: none; }`,
      // opening unrolls the rows from under the header, top to bottom
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}][${DOCK_OPEN_ATTR}] { transform: none !important; clip-path: inset(0 0 0 0); transition: clip-path var(--atr-sd-dur) var(--atr-sd-ease), opacity var(--atr-t-2, 180ms) var(--atr-ease, ease), visibility 0s, translate var(--atr-arc-dur, 0ms) var(--atr-arc-ease, ease) !important; }`,
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}] > div > * { transition: transform var(--atr-sd-dur) var(--atr-sd-ease), opacity var(--atr-t-2, 200ms) var(--atr-ease, ease), background-color var(--atr-t-2, 120ms) var(--atr-ease, ease); }`,
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}]:not([${DOCK_OPEN_ATTR}]) > div > * { transform: translateY(-0.4rem); opacity: 0; }`,
      ':root { --atr-sd-dur: 280ms; --atr-sd-ease: cubic-bezier(.32,.72,0,1); }',
      // the Motion switch reaches the dock's own duration token too
      "html[data-atr-motion='off'] { --atr-sd-dur: 0ms; }",
      `[${DOCK_ROOM_ATTR}] { margin-top: calc(var(--atr-sd-room, 0px) + var(--atr-lib-room, 0px)) !important; transition: margin-top var(--atr-sd-dur) var(--atr-sd-ease); }`,
      '#atr-statusdock-head {',
      '  position: fixed; z-index: 40; left: var(--atr-sd-x); top: var(--atr-sd-y-head); width: var(--atr-sd-w); height: var(--atr-sd-h);',
      '  display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch;',
      '  padding: 0; margin: 0; border: 0; text-align: left; cursor: pointer; color: var(--atr-ink-3, var(--ui-text-tertiary));',
      '  font: inherit; background: var(--atr-side-card, color-mix(in srgb, var(--ui-bg-secondary) 86%, transparent)); border-radius: var(--atr-radius, 12px); overflow: hidden;',
      '  transition: height var(--atr-sd-dur) var(--atr-sd-ease), color var(--atr-t-2, 150ms) var(--atr-ease, ease), box-shadow var(--atr-t-2, 150ms) var(--atr-ease, ease);',
      '  user-select: none;',
      '}',
      '#atr-statusdock-head[hidden] { display: none; }',
      // a status dragged over the title: the drop zone lights up
      "#atr-statusdock-head[data-drop='over'] { outline: 1px dashed color-mix(in srgb, var(--atr-accent, #9cf) 75%, transparent); outline-offset: -1px; }",
      '#atr-statusdock-head .atr-sd-label { flex: none; }',
      "#atr-statusdock-head[data-pinned] .atr-sd-label { display: none; }",
      '#atr-statusdock-head .atr-sd-pin {',
      '  display: none; min-width: 0; flex: 0 1 auto; align-items: center; gap: 0.4rem; padding: 0; margin: 0;',
      '  background: none; border: 0; color: var(--atr-ink-1, var(--ui-text-primary)); font-weight: 500;',
      '  font-size: var(--atr-sd-font, 0.8125rem); letter-spacing: 0; text-transform: none; cursor: grab; white-space: nowrap; overflow: hidden;',
      '}',
      "#atr-statusdock-head[data-pinned] .atr-sd-pin { display: inline-flex; }",
      '#atr-statusdock-head .atr-sd-pin > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; }',
      '#atr-statusdock-head .atr-sd-pin svg { width: 0.75rem; height: 0.75rem; }',
      // the pinned row in the list carries a small accent dot
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}] [data-atr-pinned]::after {`,
      "  content: ''; flex: none; width: 0.75rem; height: 0.75rem; margin-left: auto; background: currentColor; opacity: 0.6;",
      `  -webkit-mask: ${PIN_MASK_URL} center / contain no-repeat; mask: ${PIN_MASK_URL} center / contain no-repeat;`,
      '}',
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}] > div > * { touch-action: none; }`,
      '#atr-statusdock-ghost {',
      '  position: fixed; z-index: 2147483000; left: 0; top: 0; pointer-events: none; display: inline-flex; align-items: center; gap: 0.4rem;',
      '  padding: 0.3rem 0.65rem; border-radius: var(--atr-r-2, 8px); font-size: 0.75rem; white-space: nowrap; max-width: 14rem; overflow: hidden;',
      '  background: var(--atr-glass-strong, color-mix(in srgb, var(--ui-bg-primary) 94%, transparent)); color: var(--atr-ink-0, var(--ui-text-primary)); box-shadow: 0 6px 18px rgba(0,0,0,.35);',
      '}',
      '#atr-statusdock-ghost svg { width: 0.75rem; height: 0.75rem; flex: none; }',
      '#atr-statusdock-head .atr-sd-row {',
      '  display: flex; flex: none; align-items: center; gap: 0.5rem; height: var(--atr-sd-head, 1.85rem); padding: 0 0.7rem 0 0.75rem; min-width: 0;',
      // the same face as the PINNED / SESSIONS labels, copied off them at layout
      '  font-size: var(--atr-sd-lab-size, 0.64rem); font-weight: var(--atr-sd-lab-weight, 600); letter-spacing: var(--atr-sd-lab-track, 0.16em); text-transform: uppercase;',
      '  color: var(--atr-sd-lab-color, var(--theme-primary, var(--atr-ink-2, var(--ui-text-secondary))));',
      '}',
      '#atr-statusdock-head:hover .atr-sd-row, #atr-statusdock-head:focus-visible .atr-sd-row { color: var(--atr-ink-0, var(--ui-text-primary)); }',
      '#atr-statusdock-head:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--atr-accent, rgba(255,255,255,.3)); }',
      '#atr-statusdock-head svg { width: 0.75rem; height: 0.75rem; flex: none; }',
      '#atr-statusdock-head .atr-sd-pinico { display: none; }',
      "#atr-statusdock-head[data-pinned] .atr-sd-eq { display: none; }",
      "#atr-statusdock-head[data-pinned] .atr-sd-pinico { display: block; }",
      '#atr-statusdock-head .atr-sd-chev { margin-left: auto; width: 0.7rem; height: 0.7rem; transition: transform var(--atr-sd-dur, 280ms) var(--atr-sd-ease, ease); }',
      "#atr-statusdock-head[aria-expanded='true'] .atr-sd-chev { transform: rotate(180deg); }",
      // menus opened from the docked bar open beside it, not above it
      `[${DOCK_POP_ATTR}] {`,
      '  transform: translate(var(--atr-pop-x, 0px), var(--atr-pop-y, 0px)) !important; left: 0 !important; top: 0 !important;',
      '  --radix-popper-available-height: calc(100vh - 1rem) !important;',
      '  --radix-popper-transform-origin: var(--atr-pop-origin, left top) !important;',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      ':root { --atr-sd-dur: 0ms; }',
      '  #atr-statusdock-head, #atr-statusdock-head .atr-sd-chev { transition: none !important; }',
      `  footer[data-slot='statusbar'][${DOCK_ATTR}] { transition: none !important; }`,
      '}'
    ].join('\n')

    // The status panel only exists inside the sessions sidebar. With no
    // sidebar on screen the lifted bar stays hidden (no edge tab, no
    // free-floating panel), and it comes back with the sidebar.
    const ensureDockChrome = () => {
      if (!dock.style) {
        dock.style = document.createElement('style')
        dock.style.id = 'atr-statusdock-style'
        dock.style.textContent = DOCK_CSS
        document.head.appendChild(dock.style)
      }
    }
    const unside = () => {
      // The 1s dock timer calls this every second while the panel is not
      // sided; only a real un-side changes the geometry, so only then is the
      // library's layout cache dropped (otherwise layoutLibrary() re-measures
      // the sidebar — forced layout — once a second for nothing).
      const wasSided = Boolean(dock.side || dock.room)
      document.querySelectorAll(`[${DOCK_SIDE_ATTR}]`).forEach(el => {
        el.removeAttribute(DOCK_SIDE_ATTR)
        ;['--atr-sd-x', '--atr-sd-y', '--atr-sd-w', '--atr-sd-max'].forEach(v => el.style.removeProperty(v))
      })
      document.querySelectorAll(`[${DOCK_ROOM_ATTR}]`).forEach(el => { el.removeAttribute(DOCK_ROOM_ATTR); el.style.removeProperty('--atr-sd-room') })
      if (dock.head) dock.head.hidden = true
      document.querySelectorAll('[data-atr-pinned]').forEach(el => el.removeAttribute('data-atr-pinned'))
      document.querySelectorAll("footer[data-slot='statusbar'] [data-atr-full]").forEach(el => {
        if (el.dataset.atrCrop && el.firstChild?.nodeValue === el.dataset.atrCrop) el.firstChild.nodeValue = el.dataset.atrFull
        delete el.dataset.atrCrop; delete el.dataset.atrFull; el.removeAttribute('title')
      })
      dock.side = null
      dock.room = null
      dock.sideKey = ''
      if (wasSided) lib.key = ''
    }
    const undock = () => {
      unside()
      document.querySelectorAll(`[${DOCK_ATTR}]`).forEach(el => { el.removeAttribute(DOCK_ATTR); el.removeAttribute(DOCK_OPEN_ATTR) })
    }

    // ── In the sessions sidebar ────────────────────────────────────────────
    // When the sessions sidebar is on screen the bar becomes a card at its
    // foot, between the session list and the profile rail. We never move
    // Hermes's DOM: the list's scroller gets a bottom margin (the card's
    // room), our header button paints the card in that gap, and the real
    // footer is pinned over the card's lower part. Open or shut follows the
    // height: open only while the list still shows SIDE_MIN_SESSIONS rows
    // (plus about two rows of section headings); a click overrides that
    // until the fit itself flips.
    const sidebarParts = () => {
      const side = document.querySelector("[data-tour='sessions-sidebar']")
      const room = side?.querySelector?.('[data-sessions-mode]')
      if (!side || !room) return null
      const r = side.getBoundingClientRect()
      if (r.width < 160 || r.height < 240 || !room.getClientRects().length) return null
      return { side, room, r }
    }
    // ── Pin one status to the title ───────────────────────────────────────
    // Drag a row from the open card onto the STATUS title and it stays on the
    // title, live, open or shut, until it is dragged off again. Rows are keyed
    // by their lucide icon (text changes as the value does), else by their
    // letters. Pointer-based rather than HTML5 drag: Radix opens a row's menu
    // on pointerdown, so we hold the pointerdown until we know it is a tap,
    // and replay it then.
    const pinDrag = { el: null, key: '', x: 0, y: 0, id: -1, moving: false, ghost: null, endedAt: 0, replay: false }
    const statusRows = bar => bar ? [...bar.querySelectorAll(':scope > div > *')] : []
    // A row's own icon: not one inside a nested control (a radio's
    // play/pause icon flips as you press it, which would lose the key).
    const ROW_CONTROL = "button, a, [role='button'], [role='switch'], [role='slider']"
    const ownIcon = el => {
      for (const svg of el.querySelectorAll('svg')) {
        const c = svg.closest(ROW_CONTROL)
        if (c && c !== el && el.contains(c) && el.querySelectorAll(ROW_CONTROL).length > 1) continue
        const lc = [...svg.classList].find(k => k.startsWith('lucide-'))
        if (lc) return lc
      }
      return ''
    }
    // the first word of the row's first text, never of the whole row
    const firstWord = el => {
      const w = document.createTreeWalker(el, 4)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.nodeValue.replace(/[^A-Za-z]+/g, ' ').trim()
        if (t) return t.split(' ')[0].toLowerCase()
      }
      return ''
    }
    const statusKey = (el, rows) => {
      const lc = ownIcon(el)
      const base = lc || 'txt:' + firstWord(el)
      // same icon twice: the second becomes base#2
      let n = 0
      if (lc) for (const r of rows) { if (r === el) break; if (ownIcon(r) === lc) n++ }
      return n ? `${base}#${n + 1}` : base
    }
    // ── Smart crop ────────────────────────────────────────────────────────
    // A status too long for its row is cut at the end of the last whole
    // piece that fits (a word, or a segment before · | / , : ; -) with an
    // ellipsis, never mid-word. Only the text node's value changes (React
    // owns the span and rewrites that value on its next update, which we
    // notice and re-crop); the full text stays in data-atr-full and the title.
    let cropCanvas = null
    const textWidth = (text, el) => {
      cropCanvas = cropCanvas || document.createElement('canvas')
      const c = cropCanvas.getContext('2d')
      const cs = getComputedStyle(el)
      c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const track = parseFloat(cs.letterSpacing) || 0
      return c.measureText(text).width + track * text.length
    }
    const cropText = (text, budget, el) => {
      if (textWidth(text, el) <= budget) return text
      const cuts = []
      for (let i = 1; i < text.length; i++) {
        if (/\s/.test(text[i]) || /[·•|/,:;\-–—)]/.test(text[i - 1])) cuts.push(i)
      }
      for (let k = cuts.length - 1; k >= 0; k--) {
        const head = text.slice(0, cuts[k]).replace(/[\s·•|/,:;\-–—(]+$/, '')
        if (head && textWidth(head + '…', el) <= budget) return head + '…'
      }
      return null // one long word: leave it to the CSS ellipsis
    }
    const cropSpans = (spans, avail) => {
      // spans: [{ el, node, full }] in row order; crop from the last one back
      let rest = avail - spans.reduce((a, s) => a + textWidth(s.full, s.el), 0)
      for (let i = spans.length - 1; i >= 0; i--) {
        const s = spans[i]
        const w = textWidth(s.full, s.el)
        let out = s.full
        if (rest < 0) {
          const budget = Math.max(0, w + rest)
          const c = cropText(s.full, budget, s.el)
          out = c == null ? s.full : c
          rest += w - (c == null ? w : textWidth(c, s.el))
        }
        if (s.node.nodeValue !== out) s.node.nodeValue = out
        if (out !== s.full) { s.el.dataset.atrCrop = out; s.el.title = s.full } else if (s.el.dataset.atrCrop) { delete s.el.dataset.atrCrop; s.el.removeAttribute('title') }
      }
    }
    const croppable = root => [...root.querySelectorAll('.truncate')].filter(el =>
      el.childNodes.length === 1 && el.firstChild.nodeType === 3)
    const spanInfo = el => {
      const node = el.firstChild
      // a value that isn't ours is React's new text
      if (el.dataset.atrFull == null || node.nodeValue !== (el.dataset.atrCrop || el.dataset.atrFull)) el.dataset.atrFull = node.nodeValue
      return { el, node, full: el.dataset.atrFull }
    }
    const innerWidth = el => {
      const cs = getComputedStyle(el)
      return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
    }
    const fitLine = (box, spans, extra = 0) => {
      if (!spans.length || !box.clientWidth) return
      const cs = getComputedStyle(box)
      const gap = parseFloat(cs.columnGap) || 0
      const kids = [...box.children]
      const others = kids.filter(k => !spans.some(s => s.el === k)).reduce((a, k) => a + k.getBoundingClientRect().width, 0)
      const avail = innerWidth(box) - others - gap * Math.max(0, kids.length - 1) - extra - 1
      cropSpans(spans, avail)
    }
    const cropRows = bar => {
      for (const row of statusRows(bar)) {
        const els = croppable(row)
        if (!els.length) continue
        const box = els[0].parentElement
        // only the simple shape: the label spans sit in the row (or its one child)
        if (box !== row && !(box.parentElement === row && row.children.length === 1)) continue
        const pinW = row.hasAttribute('data-atr-pinned') ? 12 + 8 : 0
        const spans = els.filter(e => e.parentElement === box).map(spanInfo)
        if (box === row) fitLine(row, spans, pinW)
        else fitLine(box, spans, pinW + (row.clientWidth - box.getBoundingClientRect().width > 0 ? 0 : 0))
      }
    }
    const cropChip = () => {
      const head = dock.head
      const chip = head?.querySelector('.atr-sd-pin')
      if (!chip || !head.hasAttribute('data-pinned')) return
      const row = head.querySelector('.atr-sd-row')
      const cs = getComputedStyle(row)
      const gap = parseFloat(cs.columnGap) || 0
      const fixed = [...row.children].filter(k => k !== chip && getComputedStyle(k).display !== 'none')
      const room = innerWidth(row) - fixed.reduce((a, k) => a + k.getBoundingClientRect().width, 0) - gap * fixed.length - 6
      chip.style.maxWidth = `${Math.max(0, Math.floor(room))}px`
      const els = croppable(chip).filter(e => e.parentElement === chip)
      els.forEach(e => { if (e.dataset.atrFull != null) { e.firstChild.nodeValue = e.dataset.atrFull; delete e.dataset.atrCrop } })
      const spans = els.map(spanInfo)
      const cg = parseFloat(getComputedStyle(chip).columnGap) || 0
      const others = [...chip.children].filter(k => !els.includes(k)).reduce((a, k) => a + k.getBoundingClientRect().width + cg, 0)
      cropSpans(spans, room - others - cg * Math.max(0, spans.length - 1) - 1)
    }

    const pinnedKey = () => { const k = stored(STORE_KEYS.statusPin); return typeof k === 'string' ? k : '' }
    const setPinned = key => {
      ctx.storage.set(STORE_KEYS.statusPin, key || '')
      dock.pinSig = ''
      refreshPin()
    }
    const refreshPin = () => {
      const head = dock.head
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_ATTR}]`)
      if (!head) return
      const key = pinnedKey()
      const rows = statusRows(bar)
      let src = null
      for (const r of rows) {
        const hit = key && statusKey(r, rows) === key
        r.toggleAttribute('data-atr-pinned', Boolean(hit))
        if (hit) src = r
      }
      head.toggleAttribute('data-pinned', Boolean(src))
      try { cropRows(bar) } catch {}
      const chip = head.querySelector('.atr-sd-pin')
      if (!src) { if (chip.firstChild) chip.textContent = ''; dock.pinSig = ''; return }
      const sig = src.innerHTML
      if (sig !== dock.pinSig) {
        dock.pinSig = sig
        chip.replaceChildren(...[...src.childNodes].map(n => n.cloneNode(true)))
        chip.querySelectorAll('[id], [title]').forEach(n => { n.removeAttribute('id'); n.removeAttribute('title') })
      }
      try { cropChip() } catch {}
    }
    const overHead = (x, y) => {
      const h = dock.head
      if (!h || h.hidden) return false
      const r = h.getBoundingClientRect()
      const rowH = parseFloat(h.style.getPropertyValue('--atr-sd-head')) || 30
      return x >= r.left && x <= r.right && y >= r.top - 6 && y <= r.top + rowH + 6
    }
    const inRect = (el, x, y, pad = 0) => {
      if (!el || el.hidden || !el.isConnected) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
    }
    // ── One drag for everything that moves ──────────────────────────────
    // Sources: a status row, the pinned chip, a sidebar pin, a snippet card in
    // the chat, a Shelf tile. Targets: the STATUS title, the sidebar Pins
    // group, the two Shelf slots. A drop nowhere takes the thing off wherever
    // it was (unpin, off the Shelf). A tap (no movement) does the thing's own
    // click: a status row gets its pointerdown back, a snippet opens its
    // preview, a status tile opens that status's menu beside the tile.
    // Pointer-based rather than HTML5 drag: Radix opens a row's menu on
    // pointerdown, so we hold the pointerdown until we know it is a tap.
    const dropAt = (x, y) => {
      const shelfHit = shelfSlotAt(x, y)
      if (shelfHit) return Object.assign({ kind: 'shelf' }, shelfHit)
      if (overHead(x, y)) return { kind: 'head' }
      if (inRect(dock.head, x, y)) return { kind: 'card' } // the status card's body
      if (inRect(lib.el, x, y, 4)) return { kind: 'lib' }
      return null
    }
    const shelfFull = (src, hit) => shelf[hit.slot].length >= SHELF_MAX && !(src.type === 'tile' && src.slot === hit.slot)
    const accepts = (src, hit) => {
      if (!hit) return false
      const t = src.type
      const tile = t === 'tile' ? src.ref.kind : ''
      if (hit.kind === 'shelf') return !shelfFull(src, hit)
      if (hit.kind === 'head') return t === 'status' || tile === 'status'
      if (hit.kind === 'card') return tile === 'status'
      if (hit.kind === 'lib') return t === 'snip' || tile === 'snip'
      return false
    }
    const dropEl = hit => !hit ? null : (hit.kind === 'head' || hit.kind === 'card') ? dock.head : hit.kind === 'lib' ? lib.el : hit.kind === 'shelf' ? shelfEls[hit.slot] : null
    let litEl = null
    const light = el => {
      if (litEl === el) return
      litEl?.removeAttribute('data-drop')
      litEl = el
      el?.setAttribute('data-drop', 'over')
    }
    const applyDrop = (src, hit) => {
      const k = hit?.kind || ''
      if (hit && !accepts(src, hit) && !(src.type === 'pin' || src.type === 'chip')) return
      switch (src.type) {
        case 'status':
          if (k === 'head') setPinned(src.key)
          else if (k === 'shelf') shelfPut({ kind: 'status', key: src.key, last: src.text }, hit)
          break
        case 'chip':
          if (k === 'shelf' && accepts(src, hit)) shelfPut({ kind: 'status', key: pinnedKey(), last: src.text }, hit)
          else if (!hit || k === 'card' || k === 'lib') setPinned('')
          break
        case 'pin':
          if (k === 'shelf' && accepts(src, hit)) shelfPut({ kind: 'snip', entry: src.entry }, hit)
          else if (!hit) unpinSnip(src.entry.id)
          break
        case 'snip':
          if (k === 'lib') pinSnip(src.entry)
          else if (k === 'shelf') shelfPut({ kind: 'snip', entry: src.entry }, hit)
          break
        case 'tile':
          if (k === 'shelf') shelfMove(src.slot, src.idx, hit)
          // back where it came from: off the Shelf (a snippet stays in the library)
          else if (k === 'head' || k === 'card') shelfRemove(src.slot, src.idx)
          else if (k === 'lib') { pinSnip(src.ref.entry); shelfRemove(src.slot, src.idx) }
          else if (!hit) shelfRemove(src.slot, src.idx)
          break
      }
    }
    const onTap = (src, el, e) => {
      if (src.type === 'status') {
        pinDrag.replay = true
        try {
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, pointerId: e.pointerId, pointerType: e.pointerType || 'mouse', isPrimary: true, clientX: e.clientX, clientY: e.clientY }))
        } finally { pinDrag.replay = false }
      } else if (src.type === 'pin' || src.type === 'snip') openPreview(src.entry)
      else if (src.type === 'tile') {
        if (src.ref.kind === 'snip') openPreview(src.ref.entry)
        else if (!tapStatusTile(src.ref, el, src.at)) openStatusFrom(src.ref.key, el, e)
      }
    }
    const ghostFor = (src, el) => {
      const g = document.createElement('div')
      g.id = 'atr-statusdock-ghost'
      const entry = src.entry || src.ref?.entry
      if (entry) {
        const t = document.createElement('span'); t.className = 'atr-ghost-title'; t.textContent = entry.title || ''
        const v = document.createElement('span'); v.textContent = entry.value || entry.note || ''
        g.append(...(entry.title ? [t, v] : [v]))
      } else {
        const from = el.querySelector?.('.atr-tile-value') || el
        g.replaceChildren(...[...from.childNodes].map(n => n.cloneNode(true)))
      }
      return g
    }
    const endPinDrag = () => {
      window.removeEventListener('pointermove', onPinMove, true)
      window.removeEventListener('pointerup', onPinUp, true)
      window.removeEventListener('pointercancel', onPinCancel, true)
      pinDrag.ghost?.remove()
      pinDrag.ghost = null
      light(null)
      showShelfPhantom(null)
      showLibPhantom(null)
      pinDrag.el?.removeAttribute?.('data-lifted')
      const was = pinDrag.moving
      pinDrag.el = null
      pinDrag.src = null
      pinDrag.moving = false
      if (was) {
        document.documentElement.removeAttribute('data-atr-dragging')
        layoutShelf()
      }
    }
    const onPinMove = e => {
      if (e.pointerId !== pinDrag.id || !pinDrag.el) return
      if (e.buttons === 0 && e.pointerType === 'mouse') { endPinDrag(); return }
      const src = pinDrag.src
      if (!pinDrag.moving) {
        if (Math.hypot(e.clientX - pinDrag.x, e.clientY - pinDrag.y) < 6) return
        pinDrag.moving = true
        document.documentElement.setAttribute('data-atr-dragging', src.type)
        pinDrag.ghost = ghostFor(src, pinDrag.el)
        document.body.appendChild(pinDrag.ghost)
        if (src.type === 'tile') pinDrag.el.setAttribute('data-lifted', '')
        layoutShelf()
      }
      e.preventDefault()
      pinDrag.ghost.style.transform = `translate(${Math.round(e.clientX + 10)}px, ${Math.round(e.clientY + 8)}px)`
      const hit = dropAt(e.clientX, e.clientY)
      const ok = accepts(src, hit)
      light(ok ? dropEl(hit) : null)
      // show the thing where it would land
      pinDrag.ghost.toggleAttribute('data-docked', !!(ok && (hit.kind === 'shelf' || hit.kind === 'lib')))
      showShelfPhantom(ok && hit.kind === 'shelf' ? hit : null, src)
      showLibPhantom(ok && hit.kind === 'lib' ? (src.entry || src.ref?.entry) : null)
    }
    const onPinUp = e => {
      if (e.pointerId !== pinDrag.id || !pinDrag.el) return
      const { el, src, moving } = pinDrag
      const hit = moving ? dropAt(e.clientX, e.clientY) : null
      endPinDrag()
      if (!moving) { onTap(src, el, e); return }
      pinDrag.endedAt = Date.now()
      applyDrop(src, hit)
    }
    const onPinCancel = e => { if (e.pointerId === pinDrag.id) endPinDrag() }
    function startDrag (e, src, el, hold) {
      if (e.button !== 0 || pinDrag.el) return
      pinDrag.el = el
      pinDrag.src = src
      pinDrag.key = src.key || ''
      pinDrag.x = e.clientX
      pinDrag.y = e.clientY
      pinDrag.id = e.pointerId
      pinDrag.moving = false
      if (hold) { e.stopPropagation(); e.preventDefault() } // hold Radix's pointerdown until we know
      window.addEventListener('pointermove', onPinMove, true)
      window.addEventListener('pointerup', onPinUp, true)
      window.addEventListener('pointercancel', onPinCancel, true)
    }
    const rowText = el => (el?.textContent || '').replace(/\s+/g, ' ').trim()
    function startPinDrag (e, row) {
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}]`)
      if (row && !bar) return
      if (row) startDrag(e, { type: 'status', key: statusKey(row, statusRows(bar)), text: rowText(row) }, row, true)
      else {
        const chip = dock.head.querySelector('.atr-sd-pin')
        startDrag(e, { type: 'chip', text: rowText(chip) }, chip, false)
      }
    }
    const onRowPointerDown = e => {
      if (pinDrag.replay || !dock.side) return
      const row = e.target?.closest?.(`footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}][${DOCK_OPEN_ATTR}] > div > *`)
      if (row) startPinDrag(e, row)
    }
    if (typeof document !== 'undefined') document.addEventListener('pointerdown', onRowPointerDown, true)

    // ── Snippet pins ──────────────────────────────────────────────────────
    const pinSnip = entry => {
      if (!entry?.id || pins.get().some(p => p.id === entry.id)) return
      pins.set([...pins.get(), entry])
      persist()
      onPinsChanged()
    }
    const unpinSnip = id => {
      pins.set(pins.get().filter(p => p.id !== id))
      persist()
      onPinsChanged()
    }
    const snipText = e => [e.title && e.value ? `${e.title}: ${e.value}` : (e.value || e.title), e.note, e.source ? `(${e.source})` : ''].filter(Boolean).join('\n')
    // Attach: Hermes's own composer door (host.composer, read off the SDK
    // global so an older Hermes without it still loads the plugin). Active
    // composer first, then the fresh new-chat draft; failing both, the text
    // goes to the clipboard and the button says so.
    const attachSnip = async entry => {
      const text = snipText(entry)
      try {
        const c = globalThis.__HERMES_PLUGIN_SDK__?.host?.composer
        if (c?.insertText) {
          if (await c.insertText(null, text, { mode: 'block' })) return true
          if (await c.insertText('new', text, { mode: 'block' })) return true
        }
      } catch {}
      try { await navigator.clipboard?.writeText(text) } catch {}
      return false
    }

    // ── Library drawer ────────────────────────────────────────────────────
    // A click on any snippet (the chat card, a library row, a Shelf tile)
    // slides the library out beside the sidebar: every pinned snippet in one
    // column, the chosen one open with Copy / Attach / unpin, the rest as
    // quiet lines around it. Arrows or the wheel walk the column; Attach keeps
    // the drawer open so you can drop several in a row. No scrim: the chat
    // stays live, a click outside or Esc puts it away. A snippet that is not
    // pinned yet rides at the top, marked, with a pin to keep it.
    const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>'
    const ICON_PIN_SOLID = ICON_PIN.replace('fill="none"', 'fill="currentColor"')
    const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
    const drawer = { el: null, items: [], focus: -1, loose: null, prevFocus: null, wheel: 0, wheelAt: 0 }
    const isPinned = id => pins.get().some(p => p.id === id)
    const placeDrawer = () => {
      const el = drawer.el
      if (!el) return
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const parts = sidebarParts()
      let x = 0.75 * rem, y = 3.5 * rem
      if (parts) {
        x = Math.round(parts.r.right + 0.5 * rem)
        const lr = lib.el && !lib.el.hidden ? lib.el.getBoundingClientRect() : null
        y = Math.round(lr ? lr.top : parts.r.top + 3.5 * rem)
      }
      y = Math.max(0.5 * rem, Math.min(y, innerHeight - 12 * rem))
      el.style.setProperty('--atr-dw-x', `${x}px`)
      el.style.setProperty('--atr-dw-y', `${y}px`)
      el.style.setProperty('--atr-dw-maxh', `${Math.round(innerHeight - y - 0.75 * rem)}px`)
    }
    const drawerItem = (entry, loose) => {
      const it = document.createElement('div')
      it.className = 'atr-dw-item'
      it.dataset.id = entry.id
      it.innerHTML = '<div class="atr-dw-line"><span class="atr-dw-title"></span><span class="atr-dw-short"></span></div>'
        + '<div class="atr-dw-more"><div class="atr-dw-inner"><div class="atr-dw-full"></div><div class="atr-dw-note"></div><div class="atr-dw-source"></div>'
        + '<div class="atr-dw-foot"><button type="button" class="atr-dw-icon" data-act="pin"></button><span style="flex:1"></span>'
        + '<button type="button" class="atr-dw-btn" data-act="copy" tabindex="-1">Copy</button>'
        + '<button type="button" class="atr-dw-btn atr-dw-primary" data-act="attach" tabindex="-1">Attach to chat</button></div></div></div>'
      const q = c => it.querySelector(c)
      const fill = (c, t) => { const el = q(c); el.textContent = t || ''; el.hidden = !t }
      fill('.atr-dw-title', entry.title || (entry.value ? '' : 'Snippet'))
      fill('.atr-dw-short', entry.value || entry.note)
      fill('.atr-dw-full', entry.value)
      fill('.atr-dw-note', entry.note)
      fill('.atr-dw-source', entry.source)
      if (loose) {
        const tag = document.createElement('span'); tag.className = 'atr-dw-loose'; tag.textContent = 'not in library'
        q('.atr-dw-line').appendChild(tag)
      }
      const pin = q("[data-act='pin']")
      const on = !loose
      pin.toggleAttribute('data-on', on)
      pin.innerHTML = on ? ICON_PIN_SOLID : ICON_PIN
      pin.title = on ? 'Unpin from Snippets' : 'Pin to Snippets'
      pin.setAttribute('aria-label', pin.title)
      pin.tabIndex = -1
      return it
    }
    const renderDrawer = () => {
      const el = drawer.el
      if (!el) return
      const keep = drawer.items[drawer.focus]?.id
      if (drawer.loose && isPinned(drawer.loose.id)) drawer.loose = null
      drawer.items = [...(drawer.loose ? [drawer.loose] : []), ...pins.get()]
      const list = el.querySelector('.atr-dw-list')
      list.replaceChildren(...drawer.items.map((p, i) => drawerItem(p, i === 0 && !!drawer.loose)))
      el.querySelector('.atr-dw-count').textContent = pins.get().length ? String(pins.get().length) : ''
      if (!drawer.items.length) { closePreview(); return }
      const i = drawer.items.findIndex(p => p.id === keep)
      setDrawerFocus(i >= 0 ? i : Math.min(Math.max(drawer.focus, 0), drawer.items.length - 1), true)
    }
    const setDrawerFocus = (i, instant) => {
      const el = drawer.el
      if (!el || i < 0 || i >= drawer.items.length) return
      drawer.focus = i
      const rows = [...el.querySelectorAll('.atr-dw-item')]
      rows.forEach((r, k) => {
        const on = k === i
        r.toggleAttribute('data-focus', on)
        r.querySelectorAll('button').forEach(b => { b.tabIndex = on ? 0 : -1 })
      })
      const id = drawer.items[i].id
      lib.el?.querySelectorAll('.atr-lib-row').forEach(r => r.toggleAttribute('data-current', r.dataset.id === id))
      // centre the open one, measuring it at its opened height
      const list = el.querySelector('.atr-dw-list')
      const row = rows[i]
      const h = row.querySelector('.atr-dw-line').offsetHeight + row.querySelector('.atr-dw-inner').scrollHeight
      const top = row.offsetTop - list.offsetTop - Math.max(0, (list.clientHeight - h) / 2)
      list.scrollTo({ top: Math.max(0, top), behavior: instant || reducedMotion() ? 'auto' : 'smooth' })
    }
    const say = (btn, text, ms = 1400) => {
      const was = btn.dataset.label || btn.textContent
      btn.dataset.label = was
      btn.textContent = text
      setTimeout(() => { if (btn.isConnected) btn.textContent = was }, ms)
    }
    const onDrawerKey = e => {
      if (!drawer.el) return
      const inDrawer = drawer.el.contains(document.activeElement) || document.activeElement === document.body
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closePreview(); return }
      if (!inDrawer) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setDrawerFocus(drawer.focus + (e.key === 'ArrowDown' ? 1 : -1))
      } else if (e.key === 'Enter' && !e.target.closest?.('button')) {
        e.preventDefault()
        drawer.el.querySelector('.atr-dw-item[data-focus] [data-act=attach]')?.click()
      }
    }
    const onDrawerOutside = e => {
      if (!drawer.el || drawer.el.contains(e.target)) return
      // a snippet elsewhere re-aims the drawer instead of closing it
      if (e.target.closest?.('#atr-snips .atr-lib-row, .atr-snip, .atr-tile')) return
      closePreview()
    }
    const closePreview = () => {
      const el = drawer.el
      if (!el) return
      drawer.el = null
      drawer.loose = null
      document.removeEventListener('keydown', onDrawerKey, true)
      document.removeEventListener('pointerdown', onDrawerOutside, true)
      window.removeEventListener('resize', placeDrawer)
      lib.el?.querySelectorAll('.atr-lib-row[data-current]').forEach(r => r.removeAttribute('data-current'))
      if (reducedMotion()) el.remove()
      else { el.setAttribute('data-leaving', ''); setTimeout(() => el.remove(), 170) }
      try { if (el.contains(document.activeElement)) drawer.prevFocus?.focus?.() } catch {}
    }
    const openPreview = entry => {
      if (!entry || typeof document === 'undefined') return
      if (!isPinned(entry.id)) drawer.loose = entry
      else if (drawer.loose?.id !== entry.id) drawer.loose = drawer.el ? drawer.loose : null
      if (!drawer.el) {
        drawer.prevFocus = document.activeElement
        const el = document.createElement('div')
        el.id = 'atr-snip-drawer'
        el.tabIndex = -1
        el.setAttribute('role', 'dialog')
        el.setAttribute('aria-label', 'Snippets')
        el.innerHTML = '<div class="atr-dw-head"><span>Snippets</span><span class="atr-dw-count"></span><span class="atr-dw-keys">↑ ↓</span>'
          + `<button type="button" class="atr-dw-icon" data-act="close" aria-label="Close" title="Close (Esc)">${ICON_X}</button></div><div class="atr-dw-list"></div>`
        el.addEventListener('click', e => {
          const btn = e.target.closest?.('[data-act]')
          const row = e.target.closest?.('.atr-dw-item')
          if (!btn) { if (row && !row.hasAttribute('data-focus')) setDrawerFocus([...el.querySelectorAll('.atr-dw-item')].indexOf(row)); return }
          const act = btn.dataset.act
          if (act === 'close') { closePreview(); return }
          const it = drawer.items[[...el.querySelectorAll('.atr-dw-item')].indexOf(row)]
          if (!it) return
          if (act === 'pin') { if (isPinned(it.id)) { drawer.loose = it; unpinSnip(it.id) } else pinSnip(it); renderDrawer() }
          else if (act === 'copy') { void navigator.clipboard?.writeText(snipText(it)); say(btn, 'Copied') }
          else if (act === 'attach') {
            btn.disabled = true
            attachSnip(it).then(ok => { btn.disabled = false; say(btn, ok ? 'Attached' : 'Copied, paste it in', ok ? 1400 : 2200) })
          }
        })
        // the wheel walks the column one snippet at a time
        el.querySelector('.atr-dw-list').addEventListener('wheel', e => {
          if (e.target.closest?.('.atr-dw-full') && e.target.closest('.atr-dw-full').scrollHeight > e.target.closest('.atr-dw-full').clientHeight) return
          e.preventDefault()
          const now = Date.now()
          if (now - drawer.wheelAt > 300) drawer.wheel = 0
          drawer.wheelAt = now
          drawer.wheel += e.deltaY
          if (Math.abs(drawer.wheel) >= 60) { setDrawerFocus(drawer.focus + Math.sign(drawer.wheel)); drawer.wheel = 0 }
        }, { passive: false })
        document.body.appendChild(el)
        drawer.el = el
        placeDrawer()
        document.addEventListener('keydown', onDrawerKey, true)
        document.addEventListener('pointerdown', onDrawerOutside, true)
        window.addEventListener('resize', placeDrawer)
      }
      drawer.items = []
      renderDrawer()
      setDrawerFocus(drawer.items.findIndex(p => p.id === entry.id), !drawer.el.dataset.shown)
      drawer.el.dataset.shown = '1'
      if (!drawer.el.contains(document.activeElement)) drawer.el.focus({ preventScroll: true })
    }

    // ── Snippet library (its own sidebar card) ────────────────────────────
    // Pinned snippets live in a SNIPPETS card under the status card (or under
    // search when there is none), toggled in Settings > Snippets. Header click
    // folds it. A row: click = preview, drag onto the Shelf, drag off = unpin.
    // A snippet dragged over the card shows as a ghost row where it will land.
    const LIB_MAX_ROWS = 6
    const ICON_BOOKMARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>'
    const ICON_CHEV = '<svg class="atr-lib-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6"/></svg>'
    const lib = { el: null, sig: '', phantom: null, open: stored(STORE_KEYS.libraryOpen) !== false, h: 0, key: '', room: null }
    const ensureLib = () => {
      if (lib.el) return lib.el
      const el = document.createElement('div')
      el.id = 'atr-snips'
      el.hidden = true
      el.innerHTML = `<div class="atr-lib-head" role="button" tabindex="0">${ICON_BOOKMARK}<span class="atr-lib-label">Snippets</span><span class="atr-lib-count"></span>${ICON_CHEV}</div><div class="atr-lib-rows"></div>`
      const head = el.firstElementChild
      const toggle = () => {
        lib.open = !lib.open
        ctx.storage.set(STORE_KEYS.libraryOpen, lib.open)
        lib.key = ''
        layoutLibrary()
      }
      head.addEventListener('click', () => { if (Date.now() - pinDrag.endedAt > 250) toggle() })
      head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } })
      const rows = el.lastElementChild
      rows.addEventListener('pointerdown', e => {
        const row = e.target.closest?.('.atr-lib-row[data-id]')
        if (!row) return
        const entry = pins.get().find(p => p.id === row.dataset.id)
        if (entry) startDrag(e, { type: 'pin', entry }, row, true)
      })
      rows.addEventListener('keydown', e => {
        const row = e.target.closest?.('.atr-lib-row[data-id]')
        if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPreview(pins.get().find(p => p.id === row.dataset.id)) }
      })
      document.body.appendChild(el)
      lib.el = el
      return el
    }
    const libRow = (p, phantom) => {
      const row = document.createElement('div')
      row.className = 'atr-lib-row'
      if (phantom) row.setAttribute('data-phantom', '')
      else { row.dataset.id = p.id; row.tabIndex = 0; row.setAttribute('role', 'button'); row.title = [p.title, p.value].filter(Boolean).join(': ') + '. Click to preview' }
      if (p.title) { const t = document.createElement('span'); t.className = 'truncate atr-lib-title'; t.textContent = p.title; row.appendChild(t) }
      const v = document.createElement('span'); v.className = 'truncate atr-lib-value'; v.textContent = p.value || p.note || ''
      row.appendChild(v)
      return row
    }
    const renderLib = () => {
      const el = ensureLib()
      const list = pins.get()
      const ph = lib.phantom && !list.some(p => p.id === lib.phantom.id) ? lib.phantom : null
      const sig = JSON.stringify(list.map(p => p.id)) + (ph ? '+' + ph.id : '')
      const count = list.length ? String(list.length) : ''
      const countEl = el.querySelector('.atr-lib-count')
      if (countEl && countEl.textContent !== count) countEl.textContent = count
      if (sig === lib.sig) return
      lib.sig = sig
      const rows = el.querySelector('.atr-lib-rows')
      rows.replaceChildren(...list.map(p => libRow(p, false)), ...(ph ? [libRow(ph, true)] : []))
      if (!list.length && !ph) {
        const hint = document.createElement('div')
        hint.className = 'atr-lib-hint'
        hint.textContent = 'Drag a snippet here, or pin one'
        rows.appendChild(hint)
      }
    }
    const cropLib = () => {
      if (!lib.el || lib.el.hidden) return
      for (const row of lib.el.querySelectorAll('.atr-lib-row')) {
        const spans = [...row.querySelectorAll('.truncate')].filter(sp => sp.firstChild?.nodeType === 3).map(spanInfo)
        try { fitLine(row, spans) } catch {}
      }
    }
    const unlib = () => {
      if (lib.el) lib.el.hidden = true
      if (lib.room) { lib.room.removeAttribute('data-atr-lib-room'); lib.room.style.removeProperty('--atr-lib-room'); lib.room = null }
      lib.h = 0
      lib.key = ''
    }
    const layoutLibrary = () => {
      if (typeof document === 'undefined' || !document.body) return
      const parts = library.get() ? sidebarParts() : null
      if (!parts) { unlib(); return }
      const { side, room, r } = parts
      const el = ensureLib()
      renderLib()
      if (lib.room && lib.room !== room) unlib()
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const gap = 0.5 * rem
      const headH = Math.round(1.85 * rem)
      const srow = room.querySelector("[data-slot='sidebar-menu-item']")
      const rowH = Math.round(Math.max(22, Math.min(64, srow?.getBoundingClientRect().height || 1.85 * rem)))
      const btn = srow?.querySelector?.("[data-slot='sidebar-menu-button']")
      const content = side.querySelector("[data-slot='sidebar-content']")
      const cs = content ? getComputedStyle(content) : null
      const flexGap = cs ? parseFloat(cs.rowGap) || 0 : 0
      const prev = room.previousElementSibling
      const ceiling = prev ? prev.getBoundingClientRect().bottom + flexGap : (content ? content.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0) : r.top)
      const statusOn = dock.side && dock.head && !dock.head.hidden
      const statusH = statusOn ? (parseFloat(dock.head.style.getPropertyValue('--atr-sd-h')) || 0) + gap : 0
      const n = pins.get().length + (lib.sig.includes('+') ? 1 : 0)
      // the estimate from the sessions row height, or the rows as they actually
      // render if that's taller (a bigger font, a hint line), so nothing clips
      const estH = Math.round(Math.max(1, Math.min(n, LIB_MAX_ROWS)) * (rowH + 0.1 * rem) + 0.45 * rem)
      const libRows = el.querySelector('.atr-lib-rows')
      const shown = libRows ? [...libRows.children].slice(0, LIB_MAX_ROWS) : []
      const realH = shown.length ? Math.ceil(shown.reduce((a, k) => a + Math.max(rowH, k.getBoundingClientRect().height), 0) + (shown.length - 1) * 0.1 * rem + 0.45 * rem) : 0
      const bodyH = Math.max(estH, realH)
      const h = headH + (lib.open ? bodyH : 0)
      const padX = cs ? parseFloat(cs.paddingLeft) || 10 : 10
      const x = Math.round(r.left + padX)
      const w = Math.round(r.width - 2 * padX)
      const top = Math.round(ceiling + statusH)
      const key = [x, w, top, h, lib.open, lib.sig, rowH].join('|')
      if (key === lib.key && !el.hidden) return
      lib.key = key
      el.hidden = false
      el.toggleAttribute('data-open', lib.open)
      el.firstElementChild.setAttribute('aria-expanded', String(lib.open))
      el.firstElementChild.title = lib.open ? 'Collapse snippets' : 'Expand snippets'
      el.style.setProperty('--atr-lib-x', `${x}px`)
      el.style.setProperty('--atr-lib-y', `${top}px`)
      el.style.setProperty('--atr-lib-w', `${w}px`)
      el.style.setProperty('--atr-lib-h', `${h}px`)
      el.style.setProperty('--atr-lib-head', `${headH}px`)
      el.style.setProperty('--atr-sd-rowh', `${rowH}px`)
      if (btn) el.style.setProperty('--atr-sd-font', getComputedStyle(btn).fontSize)
      const lab = side.querySelector("[class*='tracking-[0.16em]']")
      if (lab) { const c = getComputedStyle(lab); el.style.setProperty('--atr-sd-lab-size', c.fontSize); el.style.setProperty('--atr-sd-lab-color', c.color) }
      room.setAttribute('data-atr-lib-room', '')
      room.style.setProperty('--atr-lib-room', `${h + gap}px`)
      lib.room = room
      lib.h = h + gap
      requestAnimationFrame(cropLib)
    }
    const showLibPhantom = entry => {
      const id = entry?.id || ''
      if ((lib.phantom?.id || '') === id) return
      lib.phantom = entry || null
      if (!lib.el || lib.el.hidden) return
      if (entry && !lib.open) { lib.open = true; lib.reopen = true }
      if (!entry && lib.reopen) { lib.open = false; lib.reopen = false }
      lib.key = ''
      layoutLibrary()
      if (entry) morphFrom(lib.el.querySelector('.atr-lib-row[data-phantom]'), ghostRect(), 260)
    }
    const onPinsChanged = () => {
      if (drawer.el) renderDrawer()
      lib.key = ''
      layoutLibrary()
      layoutShelf()
    }

    // ── The Shelf ─────────────────────────────────────────────────────────
    // Two slots on the new-chat screen, above and below the Hermes wordmark.
    // Empty, they show only while something is being dragged; once they hold
    // tiles they stay. Status tiles mirror their row live; snippet tiles
    // show the value large and the title small. Fixed in <body> over the
    // intro (Hermes's DOM is never touched), placed off the wordmark's box.
    const SHELF_SLOTS = ['above', 'below']
    const SHELF_MAX = 4
    const refId = r => r.kind === 'status' ? 's:' + r.key : 'n:' + r.entry.id
    const loadShelf = () => {
      const v = stored(STORE_KEYS.shelf)
      const ok = a => Array.isArray(a)
        ? a.filter(r => r && ((r.kind === 'status' && typeof r.key === 'string' && r.key) || (r.kind === 'snip' && r.entry && typeof r.entry.id === 'string'))).slice(0, SHELF_MAX)
        : []
      return { above: ok(v?.above), below: ok(v?.below) }
    }
    let shelf = loadShelf()
    const shelfEls = {}
    const shelfSig = { above: '', below: '' }
    const saveShelf = () => {
      ctx.storage.set(STORE_KEYS.shelf, shelf)
      shelfSig.above = shelfSig.below = ''
      layoutShelf()
    }
    const shelfPut = (ref, hit) => {
      if (!ref || (ref.kind === 'status' && !ref.key)) return
      const id = refId(ref)
      let at = hit.index
      for (const sl of SHELF_SLOTS) {
        const i = shelf[sl].findIndex(r => refId(r) === id)
        if (i >= 0) { shelf[sl].splice(i, 1); if (sl === hit.slot && i < at) at-- }
      }
      const list = shelf[hit.slot]
      if (list.length >= SHELF_MAX) { saveShelf(); return }
      list.splice(Math.max(0, Math.min(at, list.length)), 0, ref)
      saveShelf()
    }
    const shelfMove = (slot, idx, hit) => {
      const ref = shelf[slot][idx]
      if (!ref) return
      if (hit.slot !== slot && shelf[hit.slot].length >= SHELF_MAX) return
      shelfPut(ref, hit)
    }
    const shelfRemove = (slot, idx) => { shelf[slot].splice(idx, 1); saveShelf() }
    // Resize: drag a tile's right edge. The width is kept on the tile's ref
    // (so it rides along when the tile moves); double-click resets it.
    const startResize = (e, tile, ref) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const shelfW = tile.parentElement.getBoundingClientRect().width
      const x0 = e.clientX
      const w0 = tile.getBoundingClientRect().width
      const min = 4.5 * rem
      let w = w0
      tile.setAttribute('data-resizing', '')
      document.documentElement.setAttribute('data-atr-resizing', '')
      const move = ev => {
        if (ev.pointerId !== e.pointerId) return
        // tiles are centred, so the edge moves half as fast as the width
        w = Math.round(Math.max(min, Math.min(shelfW, w0 + (ev.clientX - x0) * 2)))
        tile.style.flex = `0 1 ${w}px`
        cropTile(tile)
      }
      const up = ev => {
        if (ev.pointerId !== e.pointerId) return
        window.removeEventListener('pointermove', move, true)
        window.removeEventListener('pointerup', up, true)
        window.removeEventListener('pointercancel', up, true)
        tile.removeAttribute('data-resizing')
        document.documentElement.removeAttribute('data-atr-resizing')
        pinDrag.endedAt = Date.now()
        if (Math.abs(w - w0) >= 2) { ref.w = w; saveShelf() }
      }
      window.addEventListener('pointermove', move, true)
      window.addEventListener('pointerup', up, true)
      window.addEventListener('pointercancel', up, true)
    }
    // A tap on a status tile lands on the same part of the real row: the
    // clone mirrors the row node for node, so the tapped node's child-index
    // path finds its twin. A control there (pause, skip) gets a real click;
    // anywhere else opens the row's own menu, placed beside the tile.
    const CONTROL = "button, a, input, select, [role='button'], [role='switch'], [role='checkbox'], [role='slider'], [role='menuitem']"
    const twinOf = (face, row, node) => {
      const path = []
      for (let n = node; n && n !== face; n = n.parentElement) {
        const p = n.parentElement
        if (!p) return null
        path.unshift([...p.children].indexOf(n))
      }
      let t = row
      for (const i of path) { t = t?.children[i]; if (!t) return null }
      return t
    }
    const realClick = (el, near) => {
      const r = el.getBoundingClientRect()
      const x = r.width ? r.left + r.width / 2 : (near?.left ?? 0), y = r.height ? r.top + r.height / 2 : (near?.top ?? 0)
      const base = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: x, clientY: y, view: window }
      const pe = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }
      pinDrag.replay = true
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', { ...pe, buttons: 1 }))
        el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }))
        el.dispatchEvent(new PointerEvent('pointerup', { ...pe, buttons: 0 }))
        el.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }))
        el.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0, detail: 1 }))
      } finally { pinDrag.replay = false }
    }
    const tapStatusTile = (ref, tile, at) => {
      const row = statusRowFor(ref.key)
      const face = tile.querySelector('.atr-tile-face')
      if (!row || !face) return false
      const hit = at && face.contains(at) ? at.closest(CONTROL) : null
      const twin = hit && face.contains(hit) ? twinOf(face, row, hit) : null
      // the control tapped, if it is a control of its own (not the whole row)
      if (twin && twin !== row) {
        dock.popAnchor = { el: tile, at: Date.now() } // in case it opens a menu
        realClick(twin, tile.getBoundingClientRect())
        // let React re-render the row, then mirror it
        setTimeout(() => { shelfSig.above = shelfSig.below = ''; layoutShelf() }, 60)
        return true
      }
      // the box: the row's own menu. The row itself when it is the trigger,
      // else the trigger inside it (a plugin's rendered item), else the
      // first control in it.
      const trig = row.matches('[aria-haspopup], button, a') ? row
        : row.querySelector('[aria-haspopup]') || row.querySelector(CONTROL) || row
      dock.popAnchor = { el: tile, at: Date.now() }
      realClick(trig, tile.getBoundingClientRect())
      return true
    }
    const ensureShelf = () => {
      for (const sl of SHELF_SLOTS) {
        if (shelfEls[sl]) continue
        const el = document.createElement('div')
        el.id = `atr-shelf-${sl}`
        el.className = 'atr-shelf'
        el.dataset.slot = sl
        el.hidden = true
        el.addEventListener('pointerdown', e => {
          const tile = e.target.closest?.('.atr-tile')
          if (!tile) return
          const idx = [...el.querySelectorAll('.atr-tile')].indexOf(tile)
          const ref = shelf[sl][idx]
          if (!ref) return
          if (e.target.closest('.atr-tile-grip')) { startResize(e, tile, ref); return }
          startDrag(e, { type: 'tile', ref, slot: sl, idx, at: e.target }, tile, true)
        })
        el.addEventListener('dblclick', e => {
          const tile = e.target.closest?.('.atr-tile')
          if (!tile || !e.target.closest('.atr-tile-grip')) return
          const ref = shelf[sl][[...el.querySelectorAll('.atr-tile')].indexOf(tile)]
          if (ref?.w) { delete ref.w; saveShelf() }
        })
        // the clone's own controls are dead DOM: never let one act natively
        el.addEventListener('click', e => { if (e.target.closest?.('.atr-tile-face')) e.preventDefault() })
        el.addEventListener('keydown', e => {
          const tile = e.target.closest?.('.atr-tile')
          if (!tile || !(e.key === 'Enter' || e.key === ' ')) return
          e.preventDefault()
          const ref = shelf[sl][[...el.querySelectorAll('.atr-tile')].indexOf(tile)]
          if (ref?.kind === 'snip') openPreview(ref.entry)
          else if (ref && !tapStatusTile(ref, tile, null)) openStatusFrom(ref.key, tile, null)
        })
        document.body.appendChild(el)
        shelfEls[sl] = el
      }
    }
    const shelfSlotAt = (x, y) => {
      if (!pinDrag.moving) return null
      for (const sl of SHELF_SLOTS) {
        const el = shelfEls[sl]
        if (!el || el.hidden || !inRect(el, x, y, 10)) continue
        const tiles = [...el.querySelectorAll('.atr-tile:not([data-phantom])')]
        const index = tiles.filter(t => { const r = t.getBoundingClientRect(); return r.left + r.width / 2 < x }).length
        return { slot: sl, index }
      }
      return null
    }
    // the dragged thing, drawn as a ghost tile where it would land
    const phantom = { el: null, slot: '', index: -1 }
    // FLIP: grow an element out of a rect (the drag chip, or where it just was)
    const MORPH_EASE = 'cubic-bezier(.32,.72,0,1)'
    const morphFrom = (el, from, ms = 240) => {
      if (!el || !from || !el.animate || reducedMotion()) return
      const to = el.getBoundingClientRect()
      if (!to.width || !to.height) return
      const dx = from.left - to.left, dy = from.top - to.top
      const sx = from.width / to.width, sy = from.height / to.height
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) return
      el.animate([
        { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.35 },
        { transformOrigin: '0 0', transform: 'none', opacity: getComputedStyle(el).opacity }
      ], { duration: ms, easing: MORPH_EASE })
    }
    const ghostRect = () => pinDrag.ghost?.getBoundingClientRect() || null
    const phantomRef = src => src.type === 'tile' ? src.ref
      : (src.type === 'status' || src.type === 'chip') ? { kind: 'status', key: src.key || pinnedKey(), last: src.text }
      : { kind: 'snip', entry: src.entry }
    const showShelfPhantom = (hit, src) => {
      if (!hit) {
        phantom.el?.remove()
        phantom.el = null
        phantom.slot = ''
        phantom.index = -1
        SHELF_SLOTS.forEach(sl => shelfEls[sl]?.removeAttribute('data-preview'))
        return
      }
      if (phantom.slot === hit.slot && phantom.index === hit.index && phantom.el) return
      const fresh = !phantom.el || phantom.slot !== hit.slot
      const was = phantom.el?.getBoundingClientRect() || null
      if (!phantom.el) {
        phantom.el = tileFor(phantomRef(src))
        phantom.el.setAttribute('data-phantom', '')
        phantom.el.removeAttribute('tabindex')
      }
      const el = shelfEls[hit.slot]
      SHELF_SLOTS.forEach(sl => shelfEls[sl]?.toggleAttribute('data-preview', sl === hit.slot))
      const tiles = [...el.querySelectorAll('.atr-tile:not([data-phantom])')]
      el.insertBefore(phantom.el, tiles[hit.index] || null)
      phantom.slot = hit.slot
      phantom.index = hit.index
      cropTile(phantom.el)
      // the chip under the cursor grows into the tile; a reorder slides it
      morphFrom(phantom.el, fresh ? ghostRect() : was, fresh ? 260 : 180)
    }
    // the live row for a status key (null when the dock is off)
    const statusRowFor = key => {
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_ATTR}]`)
      const rows = statusRows(bar)
      return rows.find(r => statusKey(r, rows) === key) || null
    }
    const statusLast = {}
    const tileFor = (ref, w) => {
      const tile = document.createElement('div')
      tile.className = 'atr-tile'
      tile.dataset.kind = ref.kind
      tile.tabIndex = 0
      tile.setAttribute('role', 'button')
      const label = document.createElement('span')
      label.className = 'atr-tile-label'
      const value = document.createElement('span')
      value.className = 'atr-tile-value'
      if (ref.kind === 'snip') {
        const e = ref.entry
        label.textContent = e.title || 'Snippet'
        const t = document.createElement('span'); t.className = 'atr-tile-text'; t.textContent = e.value || e.note || ''
        value.appendChild(t)
        tile.title = [e.title, e.value].filter(Boolean).join(': ') + '. Click to preview, drag off to remove'
      } else {
        // a status tile is the row itself, no label: Hermes's own markup
        // cloned whole, so its spacing and muted parts ("Backend ready")
        // survive; inert, since a click on the tile opens the row's menu
        const row = statusRowFor(ref.key)
        if (row) {
          const face = row.cloneNode(true)
          face.querySelectorAll('[id], [title]').forEach(n => { n.removeAttribute('id'); n.removeAttribute('title') })
          face.removeAttribute('id')
          face.removeAttribute('title')
          ;[...face.attributes].filter(a => a.name.startsWith('data-atr-') || a.name.startsWith('aria-')).forEach(a => face.removeAttribute(a.name))
          // the sidebar's smart crop rides along in the clone: undo it
          face.querySelectorAll('[data-atr-full]').forEach(n => { if (n.firstChild?.nodeType === 3) n.firstChild.nodeValue = n.dataset.atrFull; delete n.dataset.atrFull; delete n.dataset.atrCrop })
          face.classList.add('atr-tile-face')
          // live-looking but dead: a tap on any part is replayed on the same
          // part of the real row (pause, the menu...), see tapStatusTile
          ;[face, ...face.querySelectorAll('*')].forEach(n => [...n.attributes].forEach(at => { if (/^on/i.test(at.name)) n.removeAttribute(at.name) }))
          face.querySelectorAll('button, a, input, [tabindex]').forEach(n => { n.setAttribute('tabindex', '-1'); n.removeAttribute('href') })
          if (face.matches('button, a, [tabindex]')) { face.setAttribute('tabindex', '-1'); face.removeAttribute('href') }
          face.removeAttribute('disabled')
          value.appendChild(face)
          statusLast[ref.key] = rowText(row)
          tile.title = statusLast[ref.key] + '. Click for its menu, drag off to remove'
        } else {
          tile.setAttribute('data-stale', '')
          const t = document.createElement('span'); t.className = 'truncate'; t.textContent = statusLast[ref.key] || ref.last || ref.key.replace(/^lucide-|^txt:/, '')
          value.appendChild(t)
          tile.title = t.textContent + ' (status bar hidden)'
        }
      }
      if (ref.kind === 'snip') tile.append(label, value)
      else tile.append(value)
      // a sized tile keeps its width (it still shrinks if the shelf is full)
      if (ref.w > 0) tile.style.flex = `0 1 ${ref.w}px`
      const grip = document.createElement('span')
      grip.className = 'atr-tile-grip'
      grip.title = 'Drag to resize. Double-click to reset'
      tile.appendChild(grip)
      return tile
    }
    const cropTile = tile => {
      const v = tile?.querySelector('.atr-tile-value')
      if (!v) return
      const face = v.querySelector('.atr-tile-face')
      if (!face && !v.querySelector('.truncate')) return
      try { fitLine(face || v, (face ? croppable(face) : [...v.querySelectorAll('.truncate')]).map(spanInfo)) } catch {}
    }
    const shelf$ = { ro: null, watched: null, raf: 0 }
    const layoutShelf = () => {
      if (typeof document === 'undefined' || !document.body) return
      ensureShelf()
      const intro = document.querySelector("[data-slot='aui_intro']")
      const box = intro?.firstElementChild
      const br = box?.getBoundingClientRect()
      const hideAll = () => SHELF_SLOTS.forEach(sl => { if (!shelfEls[sl].hidden) shelfEls[sl].hidden = true })
      if (!intro || !br || br.width < 120 || !intro.getClientRects().length) { hideAll(); return }
      if (typeof ResizeObserver === 'function' && shelf$.watched !== intro) {
        shelf$.ro?.disconnect()
        shelf$.ro = new ResizeObserver(() => { if (!shelf$.raf) shelf$.raf = requestAnimationFrame(() => { shelf$.raf = 0; layoutShelf() }) })
        shelf$.ro.observe(intro)
        shelf$.watched = intro
      }
      const mark = box.querySelector(".wordmark, [class*='wordmark']") || box.firstElementChild
      const para = box.querySelector('p:last-child') || mark
      const mr = mark.getBoundingClientRect()
      const pr = para.getBoundingClientRect()
      const ir = intro.getBoundingClientRect()
      const input = document.querySelector("[data-slot='composer-rich-input']")
      const form = input?.closest('form') || input?.parentElement
      const floor = Math.min(window.innerHeight - 8, form ? form.getBoundingClientRect().top - 12 : Infinity)
      // the intro is only as tall as its copy: measure up to the pane it sits in
      let pane = intro.parentElement
      while (pane && pane !== document.body && pane.getBoundingClientRect().height < ir.height + 120) pane = pane.parentElement
      const ceil = Math.max(8, (pane && pane !== document.body ? pane.getBoundingClientRect().top : 0) + 8)
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const H = Math.round(3.1 * rem)
      const gap = Math.round(1.25 * rem)
      const dragging = pinDrag.moving
      const w = Math.min(Math.round(br.width), Math.round(40 * rem))
      const x = Math.round(br.left + (br.width - w) / 2)
      for (const sl of SHELF_SLOTS) {
        const el = shelfEls[sl]
        const items = shelf[sl]
        const top = sl === 'above' ? Math.round(mr.top - gap - H) : Math.round(pr.bottom + gap)
        const fits = sl === 'above' ? top >= ceil : top + H <= floor
        if (!(items.length || dragging) || !fits) {
          if (!el.hidden) el.hidden = true
          if (!items.length && el.firstChild) { el.replaceChildren(); shelfSig[sl] = '' }
          continue
        }
        if (el.hidden) el.hidden = false
        el.style.setProperty('--atr-sh-x', `${x}px`)
        el.style.setProperty('--atr-sh-y', `${top}px`)
        el.style.setProperty('--atr-sh-w', `${w}px`)
        el.style.setProperty('--atr-sh-h', `${H}px`)
        el.toggleAttribute('data-empty', !items.length)
        // render first, measure after (below), so the slot fits its tallest tile
        const live = items.map(r => r.kind === 'status' ? (statusRowFor(r.key)?.innerHTML || '') : '').join('|')
        const sig = JSON.stringify(items.map(r => refId(r) + '@' + (r.w || 0))) + live + w + (items.length ? '' : dragging ? 'D' : '')
        if (sig !== shelfSig[sl]) {
          shelfSig[sl] = sig
          if (!items.length) {
            const hint = document.createElement('div')
            hint.className = 'atr-shelf-hint'
            hint.textContent = sl === 'above' ? 'Drop here' : 'Or here'
            el.replaceChildren(hint)
          } else {
            el.replaceChildren(...items.map(r => tileFor(r, w)))
            // smart-crop each value line to its tile
            el.querySelectorAll('.atr-tile').forEach(cropTile)
          }
        }
        // grow to the tallest tile (a wrapped snippet), never below the base
        // height; the upper slot grows upward so it keeps its gap to the mark
        if (items.length) {
          el.style.setProperty('--atr-sh-h', 'auto')
          const Hs = Math.max(H, Math.ceil(el.getBoundingClientRect().height))
          const topS = sl === 'above' ? Math.round(mr.top - gap - Hs) : top
          const fitsS = sl === 'above' ? topS >= ceil : topS + Hs <= floor
          el.style.setProperty('--atr-sh-y', `${fitsS ? topS : top}px`)
          el.style.setProperty('--atr-sh-h', `${fitsS ? Hs : H}px`)
        }
      }
    }
    // A status tile's click: open that status's own menu, placed beside the
    // tile (placeDockPop reads dock.popAnchor).
    const openStatusFrom = (key, tile, e) => {
      const row = statusRowFor(key)
      if (!row) return
      dock.popAnchor = { el: tile, at: Date.now() }
      const r = row.getBoundingClientRect()
      pinDrag.replay = true
      try {
        row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, pointerId: e?.pointerId ?? 1, pointerType: e?.pointerType || 'mouse', isPrimary: true, clientX: r.left + 4, clientY: r.top + 4 }))
        if (!e) row.click?.()
      } finally { pinDrag.replay = false }
    }
    let pinsUnsub = null
    try { pinsUnsub = pins.subscribe?.(() => { if (lib.el) onPinsChanged() }) } catch {}

    const ensureSideHead = () => {
      if (dock.head) return dock.head
      const head = document.createElement('div')
      head.id = 'atr-statusdock-head'
      // a atr- class opts the card out of the global control radius (8px), so
      // it keeps the 12px of every other sidebar card
      head.className = 'atr-sd-card'
      head.setAttribute('role', 'button')
      head.tabIndex = 0
      head.innerHTML = '<span class="atr-sd-row">'
        + '<svg class="atr-sd-eq" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6v4M8 3.5v9M12 5.5v5"/></svg>'
        + '<svg class="atr-sd-pinico" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>'
        + '<span class="atr-sd-label">Status</span><span class="atr-sd-pin" title="Pinned. Drag off the title to unpin"></span>'
        + '<svg class="atr-sd-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6"/></svg>'
        + '</span>'
      const toggle = () => {
        dock.manual = { open: !dock.sideOpen, auto: dock.lastAuto }
        dock.sideKey = ''
        layoutSideDock()
      }
      head.addEventListener('click', () => {
        if (Date.now() - pinDrag.endedAt < 250) return // the click that ends a drag
        toggle()
      })
      head.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
      })
      head.querySelector('.atr-sd-pin').addEventListener('pointerdown', e => startPinDrag(e, null))
      document.body.appendChild(head)
      dock.head = head
      return head
    }
    const watchSide = els => {
      if (typeof ResizeObserver !== 'function') return
      if (els.length === dock.roWatched.length && els.every((el, i) => el === dock.roWatched[i])) return
      dock.ro?.disconnect()
      dock.ro = new ResizeObserver(() => requestAnimationFrame(() => layoutSideDock()))
      els.forEach(el => dock.ro.observe(el))
      dock.roWatched = els
    }
    const layoutSideDock = () => {
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_ATTR}]`)
      const parts = bar && sidebarParts()
      if (!parts) { if (dock.side) unside(); return false }
      const { side, room, r } = parts
      const head = ensureSideHead()
      if (head.hidden) head.hidden = false
      if (dock.room && dock.room !== room) unside()
      dock.side = side
      dock.room = room
      put(bar, DOCK_SIDE_ATTR, '')
      put(room, DOCK_ROOM_ATTR, '')
      watchSide([side, bar])

      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const gap = 0.5 * rem
      const headH = Math.round(1.85 * rem)
      const row = room.querySelector("[data-slot='sidebar-menu-item']")
      const rowH = Math.max(22, Math.min(64, row?.getBoundingClientRect().height || 1.85 * rem))
      const need = (SIDE_MIN_SESSIONS + 2) * rowH
      // borrow the session rows' and section labels' faces so the card matches
      const btn = row?.querySelector?.("[data-slot='sidebar-menu-button']") || room.querySelector("[data-slot='sidebar-menu-button']")
      const lab = side.querySelector("[class*='tracking-[0.16em]']")
      const face = [btn && getComputedStyle(btn).fontSize, Math.round(rowH), lab && (() => { const c = getComputedStyle(lab); return [c.fontSize, c.fontWeight, c.letterSpacing, c.color].join('|') })()].join('/')
      if (face !== dock.face) {
        dock.face = face
        const set = (el, k, v) => { if (v) el.style.setProperty(k, v); else el.style.removeProperty(k) }
        for (const el of [head, bar]) {
          set(el, '--atr-sd-font', btn && getComputedStyle(btn).fontSize)
          set(el, '--atr-sd-rowh', row ? `${Math.round(rowH)}px` : '')
        }
        if (lab) {
          const c = getComputedStyle(lab)
          set(head, '--atr-sd-lab-size', c.fontSize); set(head, '--atr-sd-lab-weight', c.fontWeight)
          set(head, '--atr-sd-lab-track', c.letterSpacing === 'normal' ? '' : c.letterSpacing); set(head, '--atr-sd-lab-color', c.color)
        }
      }
      const maxBody = Math.round(r.height * 0.5)
      const body = Math.min(bar.scrollHeight || 0, maxBody)
      // Measure from the fixed ends (the list's top and the rail's top), so
      // a list mid-resize never feeds back into the verdict.
      const content = side.querySelector("[data-slot='sidebar-content']")
      const cs = content ? getComputedStyle(content) : null
      const flexGap = cs ? parseFloat(cs.rowGap) || 0 : 0
      const rail = room.parentElement?.lastElementChild !== room ? room.parentElement?.lastElementChild : null
      const floor = rail
        ? rail.getBoundingClientRect().top - flexGap
        : (content ? content.getBoundingClientRect().bottom - (parseFloat(cs.paddingBottom) || 0) : r.bottom)
      // The card sits at the TOP of the list, just under the search box, so
      // its header stays put and opening grows it downward.
      const prev = room.previousElementSibling
      const ceiling = prev
        ? prev.getBoundingClientRect().bottom + flexGap
        : (content ? content.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0) : r.top)
      // the list's height with the card shut, then with it open
      const shutList = floor - ceiling - (headH + gap)
      const auto = shutList - body - lib.h >= need
      refreshPin()
      if (dock.manual && dock.manual.auto !== auto) dock.manual = null
      dock.lastAuto = auto
      const open = dock.manual ? dock.manual.open : auto
      const cardH = headH + (open ? body : 0)
      const key = `${open}|${cardH}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}`
      if (key === dock.sideKey) return true
      dock.sideKey = key
      dock.sideOpen = open
      room.style.setProperty('--atr-sd-room', `${cardH + gap}px`)
      const padX = cs ? parseFloat(cs.paddingLeft) || 10 : 10
      const x = Math.round(r.left + padX)
      const w = Math.round(r.width - 2 * padX)
      const top = Math.round(ceiling)
      for (const el of [head, bar]) {
        el.style.setProperty('--atr-sd-x', `${x}px`)
        el.style.setProperty('--atr-sd-w', `${w}px`)
      }
      head.style.setProperty('--atr-sd-y-head', `${top}px`)
      head.style.setProperty('--atr-sd-h', `${cardH}px`)
      head.style.setProperty('--atr-sd-head', `${headH}px`)
      bar.style.setProperty('--atr-sd-y', `${top + headH}px`)
      bar.style.setProperty('--atr-sd-max', `${maxBody}px`)
      bar.toggleAttribute(DOCK_OPEN_ATTR, open)
      head.setAttribute('aria-expanded', String(open))
      head.title = open ? 'Collapse status' : 'Expand status'
      lib.key = ''
      layoutLibrary()
      return true
    }

    // Menus from the docked bar: Radix opens them above the trigger (the bar
    // was at the bottom). Docked, they open beside the panel instead, toward
    // the middle of the window. Only the wrapper whose content the trigger
    // controls is moved; submenus anchor to their parent and follow it.
    const placeDockPop = (wrap, trigger) => {
      const bar = trigger.closest('footer')
      if (!bar || !wrap.isConnected) return
      // opened from a Shelf tile: drop it under the tile instead
      const pa = dock.popAnchor
      if (pa && pa.el.isConnected && Date.now() - pa.at < 1500) {
        if (!wrap.dataset.atrAnchored) { wrap.dataset.atrAnchored = '1'; pa.at = 0; wrap.atrAnchor = pa.el }
      }
      if (wrap.atrAnchor?.isConnected) {
        const a = wrap.atrAnchor.getBoundingClientRect()
        const h = wrap.offsetHeight || 0
        const w = wrap.offsetWidth || 0
        const x = Math.max(8, Math.min(a.left + a.width / 2 - w / 2, window.innerWidth - w - 8))
        const below = a.bottom + 6 + h <= window.innerHeight - 8
        const y = below ? a.bottom + 6 : Math.max(8, a.top - 6 - h)
        wrap.style.setProperty('--atr-pop-x', `${Math.round(x)}px`)
        wrap.style.setProperty('--atr-pop-y', `${Math.round(y)}px`)
        wrap.style.setProperty('--atr-pop-origin', below ? 'center top' : 'center bottom')
        return
      }
      const b = bar.getBoundingClientRect()
      const t = trigger.getBoundingClientRect()
      const h = wrap.offsetHeight || 0
      const w = wrap.offsetWidth || 0
      const toRight = b.left + b.width / 2 < window.innerWidth / 2
      const x = toRight ? b.right + 8 : b.left - 8 - w
      const y = Math.max(8, Math.min(t.top, window.innerHeight - h - 8))
      wrap.style.setProperty('--atr-pop-x', `${Math.round(x)}px`)
      wrap.style.setProperty('--atr-pop-y', `${Math.round(y)}px`)
      wrap.style.setProperty('--atr-pop-origin', toRight ? 'left top' : 'right top')
    }
    const adoptDockPop = wrap => {
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_ATTR}]`)
      if (!bar || wrap.hasAttribute(DOCK_POP_ATTR)) return
      const content = wrap.firstElementChild
      const slot = content?.getAttribute?.('data-slot') || ''
      if (/tooltip|sub-content|hover-card/.test(slot)) return
      const open = [...bar.querySelectorAll("[aria-expanded='true']")]
      const trigger = (content?.id && open.find(el => el.getAttribute('aria-controls') === content.id)) ||
        (open.length === 1 ? open[0] : null)
      if (!trigger) return
      wrap.setAttribute(DOCK_POP_ATTR, '')
      placeDockPop(wrap, trigger)
      requestAnimationFrame(() => placeDockPop(wrap, trigger))
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => { if (wrap.isConnected) placeDockPop(wrap, trigger); else ro.disconnect() })
        ro.observe(wrap)
      }
    }
    const watchDockPops = () => {
      if (dock.popObs || typeof MutationObserver !== 'function' || !document.body) return
      dock.popObs = new MutationObserver(records => {
        if (!document.querySelector(`[${DOCK_ATTR}]`)) return
        for (const rec of records) {
          for (const node of rec.addedNodes) {
            if (node.nodeType !== 1) continue
            if (node.matches?.('[data-radix-popper-content-wrapper]')) adoptDockPop(node)
            else node.querySelectorAll?.('[data-radix-popper-content-wrapper]').forEach(adoptDockPop)
          }
        }
      })
      dock.popObs.observe(document.body, { childList: true })
    }
    const pressStatusbarKeybind = () => {
      const init = { key: 'S', code: 'KeyS', shiftKey: true, bubbles: true, cancelable: true, composed: true }
      init[IS_MAC ? 'metaKey' : 'ctrlKey'] = true
      window.dispatchEvent(new KeyboardEvent('keydown', init))
      window.dispatchEvent(new KeyboardEvent('keyup', init))
    }
    const syncStatusDock = () => {
      if (typeof document === 'undefined' || !document.body) return
      const mode = interfaceMode()
      if (mode !== dock.mode) {
        // a mode change clears Hermes's session reveals, so start over
        dock.mode = mode
        dock.revealed = false
        dock.pressed = false
        dock.tries = 0
      }
      const bar = document.querySelector("footer[data-slot='statusbar']")
      if (mode !== 'simple' || !statusDock.get()) {
        undock()
        return
      }
      ensureDockChrome()
      if (!bar) {
        if (dock.side) unside()
        // once it was up, its going away is the user hiding it (⌘⇧S or the
        // bar's own menu): respect that until the mode changes again
        if (dock.revealed) return
        const t = Date.now()
        if (dock.tries < 2 && t - dock.lastTry > 4000) {
          dock.tries += 1
          dock.lastTry = t
          pressStatusbarKeybind()
          dock.pressed = true
          if (dock.tries === 2) console.info?.('[hermes-atrium] status dock: the status-bar keybind did not answer (rebound?), leaving it')
        }
        return
      }
      dock.revealed = true
      watchDockPops()
      if (!bar.hasAttribute(DOCK_ATTR)) bar.setAttribute(DOCK_ATTR, '')
      // no sidebar on screen: the bar stays lifted but hidden until it returns
      if (!layoutSideDock() && bar.hasAttribute(DOCK_OPEN_ATTR)) bar.removeAttribute(DOCK_OPEN_ATTR)
    }
    // Maintenance passes that measure layout (the dock, the snippet library,
    // the status stack's fillets, the live work tiles) pause while the user
    // scrolls: a forced layout landing mid-gesture is exactly the hitch they
    // would cause, and the next tick after the gesture recomputes everything
    // anyway. The transcript is excluded: it writes scrollTop every frame while
    // a reply streams, and treating that as a gesture would freeze the timers
    // for the whole turn. The same flag also switches hover transitions off
    // mid-gesture (see [motion:history]).
    let lastScrollAt = 0
    let scrollIdleTimer = 0
    const onAnyScroll = event => {
      const target = event?.target
      if (target?.nodeType === 1 && target.closest?.('[data-chat-surface]')) return
      lastScrollAt = Date.now()
      const root = document.documentElement
      if (root && !root.hasAttribute('data-atr-scrolling')) root.setAttribute('data-atr-scrolling', '')
      if (scrollIdleTimer) clearTimeout(scrollIdleTimer)
      scrollIdleTimer = setTimeout(() => {
        scrollIdleTimer = 0
        document.documentElement?.removeAttribute?.('data-atr-scrolling')
      }, 150)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener?.('scroll', onAnyScroll, { capture: true, passive: true })
    }
    const scrollSettled = () => Date.now() - lastScrollAt >= 150
    const dockTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.hidden || !scrollSettled()) return
      syncStatusDock()
      if (!pinDrag.moving) { layoutLibrary(); layoutShelf() }
    }, 1000)
    setTimeout(syncStatusDock, 600)

    let resizeRaf = 0
    const onResize = () => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        wordmarkKey = ''
        pinWordmark()
        fitColumn()
        if (dock.side) layoutSideDock()
        lib.key = ''
        layoutLibrary()
        layoutShelf()
      })
    }
    if (typeof window !== 'undefined') window.addEventListener?.('resize', onResize)

    const applyMarginsAndMark = on => {
      applyMargins(on)
      pinWordmark()
      fitColumn()
    }
    applyMarginsAndMark(margins.get())

    // ── Work progress collapsing for finished turns ──────────────────────────
    // Turn times. Hermes stamps a turn's duration (the ⏱ badge) only in memory
    // when it finishes streaming, so it is missing for any history reloaded
    // from the backend (after a restart, or a session reopened later). Each
    // time we see a badge, we remember its seconds keyed by a hash of the
    // reply's own text, which survives a reload where message ids don't.
    const TURN_TIMES_KEY = 'turnTimes'
    const TURN_TIMES_MAX = 3000
    const turnTimes = (() => {
      const v = ctx.storage.get(TURN_TIMES_KEY, null)
      return v && typeof v === 'object' ? v : {}
    })()
    let turnTimesTimer = 0
    const saveTurnTimes = () => {
      if (turnTimesTimer) return
      turnTimesTimer = setTimeout(() => {
        turnTimesTimer = 0
        const keys = Object.keys(turnTimes)
        for (let i = 0; i < keys.length - TURN_TIMES_MAX; i++) delete turnTimes[keys[i]]
        try { ctx.storage.set(TURN_TIMES_KEY, turnTimes) } catch {}
      }, 1500)
    }
    /* The reply's prose (not the work scaffolds, whose text changes between a
       live turn and a reloaded one), whitespace-folded, FNV-1a hashed. */
    const turnKey = contentEl => {
      if (typeof document === 'undefined' || !document.createTreeWalker) return ''
      const walker = document.createTreeWalker(contentEl, 4 /* SHOW_TEXT */)
      let text = ''
      for (let n = walker.nextNode(); n && text.length < 800; n = walker.nextNode()) {
        const host = n.parentElement
        if (host?.closest?.('[data-conversation-scaffold], .atr-work-summary')) continue
        text += n.nodeValue
      }
      text = text.replace(/\s+/g, ' ').trim().slice(0, 800)
      if (text.length < 12) return ''
      let h = 0x811c9dc5
      for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
      return h.toString(36) + '.' + text.length
    }

    const formatDuration = secs => {
      const s = Math.max(0, Math.round(secs))
      if (s < 60) return `${s} second${s === 1 ? '' : 's'}`
      const m = Math.floor(s / 60)
      const r = s % 60
      return `${m} minute${m === 1 ? '' : 's'}${r ? ` ${r} second${r === 1 ? '' : 's'}` : ''}`
    }

    /* "Thought", "Thought and searched", "Thought, searched and used tools" */
    const joinVerbs = verbs => {
      if (verbs.length === 0) return 'Working'
      const v = verbs.slice()
      v[0] = v[0][0].toUpperCase() + v[0].slice(1)
      return v.length === 1 ? v[0] : `${v.slice(0, -1).join(', ')} and ${v[v.length - 1]}`
    }

    const readBadgeSecs = root => {
      // The last badge in the container is the settled turn's: earlier
      // messages of a multi-message turn can carry their own step badges.
      const durEls = root.querySelectorAll?.("[data-slot='aui_turn-duration']") || []
      const durEl = durEls.length ? durEls[durEls.length - 1] : null
      if (!durEl) return null
      const durRaw = (durEl.getAttribute?.('title') || durEl.textContent || '').trim()
      // Hermes prints anything past a minute as m:ss ("1:20"), not "1m 20s"
      const clock = durRaw.match(/(?:(\d+):)?(\d+):(\d{2})\b/)
      if (clock) return parseInt(clock[1] || '0', 10) * 3600 + parseInt(clock[2], 10) * 60 + parseInt(clock[3], 10)
      const minMatch = durRaw.match(/(\d+)\s*m(?:in(?:utes?)?)?\b(?:\s*(\d+)\s*s)?/i)
      if (minMatch) return parseInt(minMatch[1], 10) * 60 + parseInt(minMatch[2] || '0', 10)
      const secMatch = durRaw.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?\b/i)
      return secMatch ? parseFloat(secMatch[1]) : null
    }

    /* What the turn did, in the order it reads best, plus per-kind counts for
       the tooltip. */
    const classifyWork = scaffolds => {
      const n = { think: 0, search: 0, cmd: 0, file: 0, tool: 0 }
      for (const el of scaffolds) {
        const slot = el.getAttribute?.('data-slot') || ''
        const text = (el.textContent || '').toLowerCase()
        if (slot === 'aui_thinking-disclosure' || /^\s*(thought|thinking)\b/.test(text)) n.think++
        else if (/\b(web_)?search(ed|ing)?\b|\bquer(y|ied|ies)\b/.test(text)) n.search++
        else if (/\b(commands?|ran|terminal|scripts?|exec(uted)?|bash|shell)\b/.test(text)) n.cmd++
        else if (/\b(files?|patch(ed)?|read|edit(ed)?|wr(ite|ote))\b/.test(text)) n.file++
        else if (/\b(tools?|skills?|mcp)\b/.test(text) || slot === 'tool-block' || el.matches?.('[data-tool-group], [data-tool-summary]')) n.tool++
      }
      const verbs = []
      const icons = []
      if (n.think) verbs.push('thought')
      if (n.search) { verbs.push('searched'); icons.push('search') }
      if (n.cmd) { verbs.push('ran commands'); icons.push('terminal') }
      if (n.file) { verbs.push('worked on files'); icons.push('file') }
      if (n.tool) { verbs.push('used tools'); icons.push('tool') }
      const plural = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : '')
      const detail = [
        plural(n.search, 'search', 'searches'), plural(n.cmd, 'command', 'commands'),
        plural(n.file, 'file step', 'file steps'), plural(n.tool, 'tool call', 'tool calls')
      ].filter(Boolean).join(', ')
      return { verbs, icons, detail }
    }

    /* Live turns: when each started (keyed by the user message it answers,
       whose id holds steady through the turn even across a chat switch), so
       the tile can count up from the first moment the agent works. */
    // Hermes renames a message while it is in flight (user-queued-… becomes the
    // real id), and a session you left and came back to is rebuilt from scratch,
    // so an id is not a steady name for a turn. The text of the prompt is: the
    // key is the session plus a hash of the prompt. Starts are kept in storage
    // too, so leaving a running session from the sidebar and coming back does
    // not count from zero. A turn that stops looking live is only marked done:
    // a short gap between steps picks the same start back up, while the same
    // prompt typed again later starts a new count.
    const LIVE_STARTS_KEY = 'liveStarts'
    const LIVE_START_TTL = 12 * 3600 * 1000
    const LIVE_DONE_GRACE = 90 * 1000
    const savedStarts = (() => {
      const v = ctx.storage.get(LIVE_STARTS_KEY, null)
      if (!v || typeof v !== 'object') return {}
      for (const k of Object.keys(v)) if (typeof v[k] === 'number') v[k] = { t: v[k] }
      return v
    })()
    let savedStartsTimer = 0
    const saveStarts = () => {
      if (savedStartsTimer) return
      savedStartsTimer = setTimeout(() => {
        savedStartsTimer = 0
        const now = Date.now()
        for (const k of Object.keys(savedStarts)) if (!savedStarts[k] || now - savedStarts[k].t > LIVE_START_TTL) delete savedStarts[k]
        const keys = Object.keys(savedStarts)
        for (let i = 0; i < keys.length - 60; i++) delete savedStarts[keys[i]]
        try { ctx.storage.set(LIVE_STARTS_KEY, savedStarts) } catch {}
      }, 1000)
    }
    const liveKey = root => {
      const pair = root.closest?.("[data-slot='aui_turn-pair']")
      const user = pair?.querySelector?.("[data-slot='aui_user-message-root']")
      if (!user) return null
      const text = (user.textContent || '').replace(/\s*\d{1,2}:\d{2}\s?[AP]M\s*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 400)
      if (!text) return user.getAttribute('data-message-id')
      let h = 0x811c9dc5
      for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
      const session = typeof location !== 'undefined' ? String(location.hash || '').replace(/^#\/?/, '').split(/[?/#]/)[0] : ''
      return `${session}|${h.toString(36)}.${text.length}`
    }
    // the start for a key, unless that turn finished a while ago (a repeat prompt)
    const savedStart = key => {
      const e = key ? savedStarts[key] : null
      if (!e) return undefined
      const now = Date.now()
      if (now - e.t > LIVE_START_TTL) return undefined
      if (e.d && now - e.d > LIVE_DONE_GRACE) return undefined
      return e.t
    }
    const rememberStart = (key, t) => { savedStarts[key] = { t }; saveStarts() }
    const markLive = root => {
      const e = savedStarts[liveKey(root)]
      if (e && e.d) { delete e.d; saveStarts() }
    }
    const markDone = root => {
      const e = savedStarts[liveKey(root)]
      if (e && !e.d) { e.d = Date.now(); saveStarts() }
    }
    const startOf = root => {
      if (root.dataset.atrStart) return Number(root.dataset.atrStart)
      const key = liveKey(root)
      let t = savedStart(key)
      if (t === undefined) {
        // Hermes's own pre-first-token timer counts from the turn's start
        const timer = root.querySelector?.("[data-slot='aui_response-loading']")
        const m = (timer?.textContent || '').match(/(?:(\d+):)?(\d+)(?::(\d{2})|s)/)
        const ago = m ? (m[3] ? (parseInt(m[1] || '0', 10) * 60 + parseInt(m[2], 10)) * 60 + parseInt(m[3], 10) : parseInt(m[2], 10)) : 0
        t = Date.now() - ago * 1000
        if (key) rememberStart(key, t)
      }
      root.dataset.atrStart = String(t)
      return t
    }

    const streamingMarkers = [
      "[data-message-streaming='true']", "[data-slot='aui_message-streaming-marker'][data-message-streaming]",
      "[data-slot='aui_response-loading']", "[data-slot='aui_turn-activity'][data-state='active']",
      ".shimmer", "[aria-label='Running']", "[data-slot='glyph-spinner']"
    ].join(', ')
    const isStreamingRoot = root => Boolean(root.querySelector?.(streamingMarkers))

    const setToggleExpanded = (toggle, contentEls, expanded) => {
      for (const contentEl of contentEls) {
        if (contentEl) put(contentEl, 'data-atr-work-collapsed', expanded ? 'false' : 'true')
      }
      put(toggle, 'data-expanded', expanded ? 'true' : 'false')
      put(toggle, 'aria-expanded', expanded ? 'true' : 'false')
    }

    /* Hermes renders every assistant prose segment — the ones said between
       tool calls included — as .aui-md, so the CSS exemption that keeps the
       final reply visible would keep the middle chatter too. A segment that
       precedes the last work block is interim and folds with the tools; the
       prose that follows all the work is the reply and stays. */
    const WORK_MARKERS = "[data-conversation-scaffold], [data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-tool-group], [data-tool-summary]"
    // Set on a tile that Atrium opened itself for a running turn, so the fold can
    // close it when the model stops without overriding a click.
    const AUTO_OPEN_ATTR = 'data-atr-auto-open'
    // Node is absent from the CSS test rigs, so fall back to the spec's values.
    const DOC_FOLLOWING = typeof Node !== 'undefined' ? Node.DOCUMENT_POSITION_FOLLOWING : 4
    const DOC_CONTAINED = typeof Node !== 'undefined' ? Node.DOCUMENT_POSITION_CONTAINED_BY : 16
    // The chain's last work block anchors the interim marking across every
    // root of that chain: prose before it is chatter, prose after it is the
    // reply. One root's markers are compared against the whole chain, so a
    // later message's tool call also folds an earlier message's chatter.
    const markInterimProse = (parts, lastWork) => {
      for (const { content } of parts) {
        for (const md of content.querySelectorAll?.('.aui-md') || []) {
          // strictly before the last work block: follows it in document order,
          // without containing it (a wrapper holding the work is not before it)
          const interim = Boolean(lastWork) &&
            (md.compareDocumentPosition(lastWork) & (DOC_FOLLOWING | DOC_CONTAINED)) === DOC_FOLLOWING
          if (interim) put(md, 'data-atr-work-interim', 'true')
          else if (md.hasAttribute?.('data-atr-work-interim')) md.removeAttribute('data-atr-work-interim')
        }
      }
    }

    /* One response group can carry more than one response chain. A background
       delivery — a finished process, an async result — is folded into the
       same group, and the model's answer to it becomes a new assistant root,
       so the group reads [answer 1][delivery][answer 2]. The interim anchor
       must not reach across a delivery: once a chain has answered, a later
       chain's work would otherwise mark that answer as chatter, and folding
       the turn would hide the actual response in favour of the update. */
    const chainsOf = (container, parts) => {
      const deliveries = Array.from(container.querySelectorAll?.("[data-slot='aui_background-result']") || [])
      if (deliveries.length === 0 || parts.length < 2) return [parts]
      const between = (a, b, el) =>
        Boolean((a.compareDocumentPosition(el) & DOC_FOLLOWING) && (el.compareDocumentPosition(b) & DOC_FOLLOWING))
      const chains = []
      let chain = []
      for (let i = 0; i < parts.length; i += 1) {
        if (i > 0 && deliveries.some(el => between(parts[i - 1].root, parts[i].root, el))) {
          chains.push(chain)
          chain = []
        }
        chain.push(parts[i])
      }
      chains.push(chain)
      return chains
    }

    /* The chain's last real work block anchors the interim marking. A settled
       turn keeps its own status row mounted as the tail of the content (empty,
       sr-only, data-state='idle') so the live region survives a flip — it is
       not work, and letting it anchor would mark the reply above it as
       chatter and fold the reply away the moment the turn settles. */
    const lastWorkBlockOf = chain => {
      const work = chain.flatMap(part => Array.from(part.content.querySelectorAll?.(WORK_MARKERS) || []))
      for (let i = work.length - 1; i >= 0; i -= 1) {
        const el = work[i]
        const idleStatus = el.getAttribute?.('data-slot') === 'aui_turn-activity' && el.getAttribute?.('data-state') === 'idle'
        if (!idleStatus) return el
      }
      return null
    }

    /* The nearest ancestor that actually scrolls; null means the page does. */
    const scrollParentOf = node => {
      if (typeof getComputedStyle !== 'function') return null
      let n = node
      while (n && n !== document.documentElement) {
        const s = getComputedStyle(n)
        if (s && s.overflowY !== 'visible' && s.overflowY !== 'clip') return n
        n = n.parentElement
      }
      return null
    }

    /* Opening a fold used to shove the transcript below it down: the revealed
       work lands between the summary and the reply, so every later turn paid
       for the height. Pin the bottom of the turn across the flip instead —
       the work eats the space above it, and only what sits above moves. At
       the end of the conversation (or with nothing but padding left under the
       turn) there is no chat below to protect, so the fold grows down and the
       chat above stays put. */
    const FOLD_END_SLACK = 96
    const pinWhileFolding = anchorEl => {
      const bottom = () => anchorEl.getBoundingClientRect?.().bottom ?? 0
      const before = bottom()
      const box = scrollParentOf(anchorEl) || (typeof document !== 'undefined' ? document.scrollingElement || document.documentElement : null)
      const scrollTop = box?.scrollTop || 0
      const scrollHeight = box?.scrollHeight || 0
      const atEnd = Boolean(box) && scrollTop + (box?.clientHeight || 0) >= scrollHeight - FOLD_END_SLACK
      const slackUnderTurn = scrollHeight - (before + scrollTop)
      return () => {
        const delta = bottom() - before
        if (!box || !delta || atEnd || slackUnderTurn <= FOLD_END_SLACK) return
        box.scrollTop += delta
      }
    }

    const ASSISTANT_ROOT = "[data-slot='aui_assistant-message-root']"
    const RESPONSE_GROUP = "[data-slot='aui_response-group']"
    const TURN_PAIR = "[data-slot='aui_turn-pair']"
    const contentOf = root => root?.querySelector?.("[data-slot='aui_assistant-message-content']") || null
    const groupContainerOf = root =>
      root?.closest?.(RESPONSE_GROUP) ||
      root?.closest?.(TURN_PAIR) ||
      root ||
      null
    const partsOf = container => {
      if (!container?.querySelectorAll) return []
      const roots = container.getAttribute?.('data-slot') === 'aui_assistant-message-root'
        ? [container]
        : Array.from(container.querySelectorAll(ASSISTANT_ROOT))
      return roots.map(root => ({ root, content: contentOf(root) })).filter(part => part.content)
    }

    /* One turn can arrive as several assistant messages (one per model step),
       each with its own content root. The fold is a turn-level idea: one
       summary serves the whole turn, and it is hosted by the FIRST part, so
       it sits at the top of the work tree — above every step — instead of in
       the middle of it. Parts only ever arrive below the first one, so the
       top stays the top for the whole stream; the last part that carries work
       (or is live) is the owner, which supplies the turn's settled prose and
       the scroll pin's anchor, not the tile's home. */
    const processTurn = (container, isEnabled) => {
      const parts = partsOf(container)
      if (!parts.length) return

      if (!isEnabled) {
        for (const { content } of parts) {
          if (content.hasAttribute?.('data-atr-work-collapsed')) content.removeAttribute('data-atr-work-collapsed')
          content.querySelector?.('.atr-work-summary')?.remove()
          content.querySelectorAll?.('[data-atr-work-interim]').forEach(el => el.removeAttribute?.('data-atr-work-interim'))
        }
        return
      }

      const info = parts.map(part => ({
        ...part,
        live: isStreamingRoot(part.root),
        scaffolds: Array.from(part.content.querySelectorAll?.('[data-conversation-scaffold]') || []),
        toggle: part.content.querySelector?.('.atr-work-summary') || null
      }))
      const scaffolds = info.flatMap(part => part.scaffolds)
      // The owner is the last part with something to fold: work, a live
      // stream, or the tile the turn already wears. It supplies the turn's
      // answer (whose prose keys the duration memory) and the scroll anchor.
      let owner = null
      for (const part of info) if (part.live || part.scaffolds.length || part.toggle) owner = part
      // A finished reply with no work to fold needs no tile; a live one gets
      // it from the first moment, so the work never flashes open and shut.
      if (!owner) return
      // A tool-continuation part that only waits on an approval rests at
      // display:none until a result is opened; the tile is hosted by the
      // first part the app actually shows, or it would vanish with the work.
      const hiddenPart = part => Boolean(part.root.hasAttribute?.('data-approval-activity-only') && !part.root.querySelector?.('[data-tool-open]'))
      const host = info.find(part => !hiddenPart(part)) || info[0]

      // Both live and finished turns keep the fold honest across the whole
      // response: prose that precedes the chain's newest tool call is interim
      // the moment that call appears, even when it sat in an earlier message.
      // Each response chain is marked on its own, and the idle status row a
      // settled turn keeps mounted is not work: a late update's tools cannot
      // fold the answer that preceded them.
      for (const chain of chainsOf(container, parts)) {
        markInterimProse(chain, lastWorkBlockOf(chain))
      }

      // One tile per turn, hosted by the first part. A tile a later part
      // still wears (an older render, a part that used to host it) is moved
      // up rather than duplicated.
      let toggle = info.map(part => part.toggle).find(Boolean) || null
      if (!toggle) {
        toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'atr-work-summary'
        put(toggle, 'data-atr-work-toggle', 'true')
        toggle.addEventListener('click', e => {
          e.preventDefault()
          e.stopPropagation()
          // Both the anchor and the current state are read live: a streaming
          // turn moves its owner, so a part captured at creation would go
          // stale under the tile.
          const clickParts = partsOf(container)
          const settle = pinWhileFolding((clickParts[clickParts.length - 1] || owner).root)
          // A click is his decision: the automatic fold stands down from here on.
          toggle.removeAttribute(AUTO_OPEN_ATTR)
          const expandedNow = toggle.getAttribute('data-expanded') === 'true'
          setToggleExpanded(toggle, clickParts.map(part => part.content), !expandedNow)
          if (!expandedNow) {
            // Opening: the space arrives immediately, so pin now.
            settle()
            return
          }
          // Closing: the shape only collapses when the display fade ends, so
          // the pin has to wait for that moment or the transcript lurches.
          // The fade runs on --atr-t-1; read it so Motion off settles at once,
          // and keep a timeout fallback in case transitionend is swallowed.
          const fadeRoot = toggle.parentElement || owner.content
          const ms = parseFloat(getComputedStyle?.(fadeRoot)?.getPropertyValue('--atr-t-1')) || 90
          let done = false
          const finish = () => {
            if (done) return
            done = true
            fadeRoot.removeEventListener?.('transitionend', onEnd)
            clearTimeout(fallback)
            settle()
          }
          const onEnd = event => { if (event.propertyName === 'display') finish() }
          fadeRoot.addEventListener?.('transitionend', onEnd)
          const fallback = setTimeout(finish, ms + 80)
        })
        host.content.insertBefore(toggle, host.content.firstChild)
        // The work stays open while the turn runs: a fold that snaps shut the
        // moment the first tool lands hides what he just asked to watch. The
        // tile starts expanded on a live turn and processTurn folds it when the
        // stream stops; a finished turn (a session switch, a scroll back) still
        // arrives folded. A click in between hands control to him for good.
        const liveNow = info.some(part => part.live)
        setToggleExpanded(toggle, parts.map(part => part.content), liveNow)
        if (liveNow) put(toggle, AUTO_OPEN_ATTR, 'true')
      } else if (toggle.parentElement !== host.content || host.content.firstChild !== toggle) {
        host.content.insertBefore(toggle, host.content.firstChild)
      }

      // Every other tile is retired, and each part mirrors the surviving
      // tile's state, so one click folds or reveals the whole response. The
      // state lives on the tile: a part that joins later (a new step, a
      // swapped-in root) reads it from there instead of arriving open.
      const expanded = toggle.getAttribute('data-expanded') === 'true'
      for (const stray of container.querySelectorAll?.('.atr-work-summary') || []) if (stray !== toggle) stray.remove?.()
      for (const part of info) {
        const foldable = part.scaffolds.length || Boolean(part.content.querySelector?.(WORK_MARKERS))
        if (foldable) put(part.content, 'data-atr-work-collapsed', expanded ? 'false' : 'true')
        else if (part.content.hasAttribute?.('data-atr-work-collapsed')) part.content.removeAttribute('data-atr-work-collapsed')
      }

      const livePart = info.find(part => part.live) || null
      if (livePart) {
        put(toggle, 'data-live', 'true')
        const { verbs, icons, detail } = classifyWork(scaffolds)
        const secs = (Date.now() - startOf(livePart.root)) / 1000
        markLive(livePart.root)
        paintToggle(toggle, icons, `${joinVerbs(verbs)} for ${formatDuration(secs)}`, detail)
        return
      }

      // Just finished: if Hermes stamped no badge, keep the time we counted.
      const started = info.map(part => part.root.dataset.atrStart).find(Boolean)
      const counted = toggle.getAttribute('data-live') === 'true' && started
        ? (Date.now() - Number(started)) / 1000 : null
      toggle.removeAttribute('data-live')
      // The model stopped talking: fold the work the running turn kept open.
      // Anything he clicked during the turn cleared the marker and stays as he
      // left it.
      if (toggle.getAttribute(AUTO_OPEN_ATTR) === 'true') {
        toggle.removeAttribute(AUTO_OPEN_ATTR)
        const settleFold = pinWhileFolding(owner.root)
        setToggleExpanded(toggle, info.map(part => part.content), false)
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(settleFold)
        else setTimeout(settleFold, 0)
      }
      if (counted !== null) markDone(info[0].root)

      // Finished turns don't change: once summarised with the same scaffold
      // count, skip the text heuristics entirely.
      const badge = readBadgeSecs(container)
      const scaffoldKey = `${scaffolds.length}|${badge}`
      if (toggle.dataset.scaffolds === scaffoldKey && toggle.dataset.signature && counted === null) return
      putData(toggle, 'scaffolds', scaffoldKey)

      const { verbs, icons, detail } = classifyWork(scaffolds)
      const key = turnKey(owner.content)
      let secs = badge
      if (secs === null && counted !== null && counted >= 1) secs = Math.round(counted)
      if (secs !== null) {
        if (key && turnTimes[key] !== secs) { turnTimes[key] = secs; saveTurnTimes() }
      } else if (key && typeof turnTimes[key] === 'number') {
        secs = turnTimes[key]                  // remembered from when it ran
      } else {
        // last resort: the reasoning blocks' own "Thought for 12s"
        let total = 0
        for (const el of scaffolds) {
          const m = (el.textContent || '').match(/thought for (\d+(?:\.\d+)?)\s*s/i)
          if (m) total += parseFloat(m[1])
        }
        if (total > 0) secs = total
      }
      const verbText = verbs.length ? joinVerbs(verbs) : 'Worked'
      paintToggle(toggle, icons, secs !== null ? `${verbText} for ${formatDuration(secs)}` : verbText, detail)
    }

    function paintToggle(toggle, icons, labelText, detail) {
      const signature = `${icons.join(',')}|${labelText}`
      if (toggle.dataset.signature === signature) return
      const iconsKey = icons.join(',')
      if (toggle.dataset.icons !== iconsKey || !toggle.querySelector('.atr-work-summary-label')) {
        putData(toggle, 'icons', iconsKey)
        const iconStackHtml = icons.length > 0 ? [
          '<span class="atr-work-icon-stack" aria-hidden="true">',
          ...icons.map(k => `<span class="atr-work-icon-item">${WORK_ICONS[k] || ''}</span>`),
          '</span>'
        ].join('') : ''
        toggle.innerHTML = [
          iconStackHtml,
          '<span class="atr-work-summary-label"></span>',
          '<span class="atr-work-summary-caret" aria-hidden="true">\u203A</span>'
        ].join('')
      }
      // only the text node changes while the timer ticks: no icon re-parse
      putText(toggle.querySelector('.atr-work-summary-label'), labelText)
      const wantTitle = detail ? `${detail}. Click to ${toggle.getAttribute('data-expanded') === 'true' ? 'hide' : 'show'} the steps.` : ''
      if (toggle.title !== wantTitle) toggle.title = wantTitle
      putData(toggle, 'signature', signature)
    }

    const scanWorkProgress = () => {
      if (typeof document === 'undefined') return
      const isEnabled = collapseWork.get()
      const seen = new Set()
      const messages = document.querySelectorAll?.(ASSISTANT_ROOT) || []
      for (const root of messages) {
        const group = groupContainerOf(root)
        if (!group || seen.has(group)) continue
        seen.add(group)
        processTurn(group, isEnabled)
      }
    }

    const dirtyTurns = new Set()
    let fullWorkScan = false
    let workLayout = false
    const runScanWork = (full = false) => {
      if (collapseWork.get()) {
        if (full || fullWorkScan) scanWorkProgress()
        else for (const group of dirtyTurns) {
          if (group.isConnected) processTurn(group, true)
        }
      }
      dirtyTurns.clear()
      if (full || fullWorkScan || workLayout) {
        pinWordmark()
        fitColumn()
      }
      fullWorkScan = workLayout = false
    }

    const hasRaf = typeof requestAnimationFrame === 'function'
    let workThrottle = null
    let workFrame = null
    const flushWork = () => {
      workFrame = null
      runScanWork()
    }
    const scheduleScanWork = (full = false) => {
      fullWorkScan ||= full
      if (workFrame !== null) return
      // While core holds the session-switch curtain on the chat surface the
      // transcript is invisible, so the 60ms throttle only delays the fold
      // toward the reveal. Coalesce to the next frame instead; normal
      // streaming keeps the throttle below. A throttle already pending from
      // just before the switch is dropped, so the frame is the only run.
      if (typeof document !== 'undefined' && hasRaf && document.querySelector?.('[data-chat-surface][data-session-switching]')) {
        if (workThrottle) {
          clearTimeout(workThrottle)
          workThrottle = null
        }
        workFrame = requestAnimationFrame(flushWork)
        return
      }
      if (workThrottle) return
      workThrottle = setTimeout(() => {
        workThrottle = null
        runScanWork()
      }, 60)
    }

    const applyCollapseWork = on => {
      if (typeof document === 'undefined' || !document.documentElement) return
      if (!document.documentElement.dataset) document.documentElement.dataset = {}
      if (on) {
        document.documentElement.dataset.atrCollapseWork = 'on'
      } else {
        delete document.documentElement.dataset.atrCollapseWork
      }
      scanWorkProgress()
    }
    applyCollapseWork(collapseWork.get())
    applyMotion(motion.get())

    // ── Chat switch ─────────────────────────────────────────────────────────
    // The switch is animated by core's own data-session-switching window on
    // [data-chat-surface]: the transcript stays hidden while rows land and
    // the scroll restores, and the plugin does its folding behind that
    // curtain (see the [motion:switch] CSS and the scan scheduling below).
    // The old JS slide was retired: it raced this window and animated a
    // transcript the user was not looking at yet.
    const queueGroup = root => dirtyTurns.add(groupContainerOf(root))
    const queueTurn = node => {
      const part = node.closest?.(ASSISTANT_ROOT)
      if (collapseWork.get()) {
        const turn = part || node.closest?.(RESPONSE_GROUP)
        if (turn) queueGroup(turn)
        else node.closest?.(TURN_PAIR)?.querySelectorAll(ASSISTANT_ROOT).forEach(queueGroup)
      }
      return part
    }

    const onDocClick = event => {
      const target = event?.target
      if (target?.nodeType !== 1 || !target.closest?.('[data-chat-surface]')) return
      if (!queueTurn(target)) workLayout = true
      scheduleScanWork()
    }

    const onNavChange = () => { scheduleScanWork(true); runRescanHooks() }

    // Core lifts data-session-switching once the new transcript's rows are
    // placed and the scroll has settled. Attribute MutationObserver callbacks
    // run before the browser paints, so this is the one chance to fold and
    // re-anchor the transcript in the frame the curtain opens.
    //
    // But that early stability is not completion: the render-budget backfill
    // commits more pages, Shiki highlights after mount, the code plugin
    // re-renders markdown, fonts swap and tables apply widths — all after
    // core's two quiet frames. So the plugin holds its own curtain
    // (data-atr-settling, paint-only via CSS) until the transcript is
    // actually quiet, bounded by SETTLE_MAX_MS and lifted on any user input.
    const SETTLE_QUIET_MS = 160
    const SETTLE_MAX_MS = 1400
    const SETTLE_INPUT = ['wheel', 'pointerdown', 'keydown', 'touchstart']
    const settleRunners = new Map()

    const finishSettle = surface => {
      const runner = settleRunners.get(surface)
      if (runner) {
        settleRunners.delete(surface)
        try { runner.stop() } catch {}
      }
      surface?.removeAttribute?.('data-atr-settling')
    }

    const finishAllSettles = () => {
      if (!settleRunners.size) return
      for (const surface of [...settleRunners.keys()]) finishSettle(surface)
    }

    const startSettleCurtain = (surface, viewport, atBottom) => {
      if (!surface || !viewport) return
      // A re-armed switch restarts clean rather than stacking runners.
      finishSettle(surface)
      surface.setAttribute?.('data-atr-settling', '')
      if (typeof requestAnimationFrame !== 'function' || viewport.isConnected === false) {
        finishSettle(surface)
        return
      }
      const now = () => performance.now?.() ?? Date.now()
      const started = now()
      let lastChange = started
      let frames = 0
      let frame = 0
      let stopped = false
      let resizeObserver = null
      let mutationObserver = null
      const content = surface.querySelector?.("[data-slot='aui_thread-content']")
      const onChange = () => { lastChange = now() }
      // A running turn never goes quiet; the curtain would hold until the cap.
      // It only exists to hide the load's parse and backfill, so a streaming
      // transcript gets a much shorter leash.
      const streaming = Boolean(surface.querySelector?.("[data-message-streaming='true'], [data-slot='aui_message-streaming-marker'][data-message-streaming], [data-slot='aui_response-loading'], [data-slot='aui_turn-activity'][data-state='active']"))
      const quietMs = streaming ? 80 : SETTLE_QUIET_MS
      const maxMs = streaming ? 500 : SETTLE_MAX_MS

      const runner = {
        stop() {
          if (stopped) return
          stopped = true
          if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
          frame = 0
          resizeObserver?.disconnect?.()
          mutationObserver?.disconnect?.()
          viewport.removeEventListener?.('scroll', onChange)
        }
      }
      settleRunners.set(surface, runner)

      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(onChange)
        if (content) resizeObserver.observe?.(content)
        if (viewport !== content) resizeObserver.observe?.(viewport)
      }
      if (typeof MutationObserver !== 'undefined' && content) {
        mutationObserver = new MutationObserver(onChange)
        mutationObserver.observe(content, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'data-status', 'data-streaming', 'data-state', 'data-message-streaming']
        })
      }
      viewport.addEventListener?.('scroll', onChange, { passive: true })

      const tick = () => {
        frame = 0
        if (stopped) return
        frames += 1
        // No scrollHeight compare here: reading it forces a layout flush on a
        // transcript that is still committing, every frame, for the whole
        // settle. The ResizeObserver, the mutation observer and the scroll
        // listener are the witnesses that already reset lastChange — the
        // per-frame read only duplicated them at full layout cost.
        const t = now()
        const fontsReady =
          typeof document === 'undefined' ||
          typeof document.fonts?.status !== 'string' ||
          document.fonts.status === 'loaded' ||
          t - started >= 350
        const quiet = t - lastChange >= quietMs && frames >= 2 && fontsReady
        if (quiet || t - started >= maxMs) {
          finishSettle(surface)
          if (atBottom) viewport.scrollTop = viewport.scrollHeight
          return
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    const settleSwitch = surface => {
      if (!surface) return
      const viewport = surface.querySelector?.("[data-slot='aui_thread-viewport']") || surface
      // Measure first: scanWorkProgress changes the transcript height, so only
      // the pre-fold geometry can say whether the session was anchored to the
      // bottom. Re-pin after the fold so the reveal does not jump.
      const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 24
      // A frame-coalesced pass armed just before the switch would duplicate
      // this synchronous one; drop it.
      if (workFrame !== null) {
        cancelAnimationFrame?.(workFrame)
        workFrame = null
      }
      if (workThrottle) {
        clearTimeout(workThrottle)
        workThrottle = null
      }
      runScanWork(true)
      if (atBottom) viewport.scrollTop = viewport.scrollHeight
      // The curtain keeps the transcript hidden past the fold until the late
      // work lands; its lift re-pins a bottom-anchored viewport again.
      startSettleCurtain(surface, viewport, atBottom)
    }

    /* Re-scan hooks. The page marks and the rail are measured off surfaces that
       the app mounts and unmounts, so their observers are scoped to those
       surfaces and re-attached here. A session switch or a route change is what
       can move them; a streamed token cannot, and the transcript commits one per
       chunk. Before this, both observers watched document.body and every chunk
       woke a full-document sweep. */
    const rescanHooks = []
    const runRescanHooks = () => { for (const hook of rescanHooks) { try { hook() } catch {} } }

    let chatObserver = null
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      // Streaming fires this on every token; all the real work is batched
      // into one throttled pass. The session-switch attribute is observed too,
      // so its removal is caught pre-paint and settled in that same frame.
      chatObserver = new MutationObserver(mutations => {
        let settled = false
        // One batch can carry the removal record once per observed holder;
        // settling a surface twice in the same batch is wasted work.
        const settledSurfaces = new Set()
        for (const mutation of mutations) {
          if (mutation?.type === 'attributes') {
            const name = mutation.attributeName
            if (name === 'data-session-switching') {
              const surface = mutation.target
              if (!surface?.hasAttribute?.('data-chat-surface') || surface.hasAttribute('data-session-switching')) continue
              if (settledSurfaces.has(surface)) continue
              settledSurfaces.add(surface)
              settled = true
              settleSwitch(surface)
              runRescanHooks()
            } else if (name === 'data-message-streaming') {
              queueTurn(mutation.target)
            }
            continue
          }
          if (mutation?.type !== 'childList') continue
          const target = mutation.target
          if (target.nodeType !== 1 || target.closest?.('.atr-work-summary')) continue
          // Streamed children can affect any part of their response group,
          // but leave the composer and other turns alone.
          if (queueTurn(target)) continue
          if (target === document.body || target.closest?.('[data-chat-surface]')) workLayout = true
          if (!collapseWork.get()) continue
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1 || !node.isConnected) continue
            if (node.matches(ASSISTANT_ROOT)) queueGroup(node)
            else node.querySelectorAll(ASSISTANT_ROOT).forEach(queueGroup)
          }
        }
        // settleSwitch ran the pass synchronously for this frame; everything
        // else inside the transcript still gets the throttled one.
        if (!settled && (workLayout || dirtyTurns.size)) scheduleScanWork()
      })
      const observeTarget = document.body || document.documentElement
      if (observeTarget) {
        chatObserver.observe(observeTarget, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-message-streaming', 'data-session-switching']
        })
      }
    }

    // ── Exit ghosts ─────────────────────────────────────────────────────────
    // Measured on the Hermes desktop build: React commits the unmount of a
    // closing floating surface ~45-60ms after its data-state flips to closed,
    // so the 140ms exit keyframes are cut mid-fade. A Presence-managed close
    // holds the node >=140ms before removal and has already animated fully,
    // so only the fast removals (or those removed while still open) get a
    // ghost: a deep clone fixed at the last rect, running the same exit
    // keyframes, inert. The clone continues from the phase the real exit had
    // reached via a matching negative animation-delay. Hidden windows may
    // never deliver animationend, so a timeout fallback removes the ghost.
    const GHOST_SLOTS = "[data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'], [data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content'], [data-slot='tooltip-content'], [data-slot='hover-card-content'], [data-slot$='-overlay']"
    const ghostInfo = new WeakMap()
    const liveGhosts = []
    // Open surfaces are tracked every frame: the app can commit the close and
    // the unmount in one batch, so by the time the observer runs the node is
    // already detached and unmeasurable — the last frame's rect is the only
    // truthful geometry a ghost can be pinned to. Surfaces are few and
    // short-lived, so one getBoundingClientRect per frame is cheap.
    const trackedSurfaces = new Set()
    let surfaceTracker = 0
    let ghostObserver = null

    const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

    const boxOf = el => {
      try {
        const box = el.getBoundingClientRect?.()
        if (box && box.width > 0.5 && box.height > 0.5) return { left: box.left, top: box.top, width: box.width, height: box.height }
      } catch {}
      return null
    }

    const rememberGhostSource = el => {
      if (!el || el.nodeType !== 1) return
      const prev = ghostInfo.get(el)
      const rect = boxOf(el) || prev?.rect || null
      const closedAt = el.getAttribute?.('data-state') === 'closed' ? (prev?.closedAt ?? nowMs()) : null
      try { ghostInfo.set(el, { rect, closedAt }) } catch {}
    }

    // Only a surface that opens and closes (Radix stamps data-state on it) can
    // need a ghost. `[data-slot$='-overlay']` also matches overlays the app
    // keeps mounted for good, such as the chat's drag-and-drop target, and
    // tracking one of those kept the loop below measuring layout on every
    // display refresh for the life of the window: the whole app redrew at
    // 120 fps while sitting still.
    const isGhostSurface = el => Boolean(el?.hasAttribute?.('data-state'))

    const trackSurfaces = () => {
      if (surfaceTracker || typeof requestAnimationFrame !== 'function') return
      const step = () => {
        surfaceTracker = 0
        if (!trackedSurfaces.size) return
        for (const el of trackedSurfaces) {
          // Disconnected entries are dropped here (the removal branch below
          // consumes them; a removal we never saw still stops the loop).
          if (!el.isConnected || !isGhostSurface(el)) { trackedSurfaces.delete(el); continue }
          const rect = boxOf(el)
          if (rect) {
            const prev = ghostInfo.get(el)
            try { ghostInfo.set(el, { rect, closedAt: prev?.closedAt ?? null }) } catch {}
          }
        }
        if (!trackedSurfaces.size) return
        surfaceTracker = requestAnimationFrame(step)
      }
      surfaceTracker = requestAnimationFrame(step)
    }

    const dropGhost = ghost => {
      if (!ghost) return
      const at = liveGhosts.indexOf(ghost)
      if (at !== -1) liveGhosts.splice(at, 1)
      try { ghost.removeEventListener?.('animationend', ghost.__atrOnEnd) } catch {}
      if (ghost.__atrTimeout != null) clearTimeout(ghost.__atrTimeout)
      try { ghost.remove?.() } catch {}
      try { ghost.parentNode?.removeChild?.(ghost) } catch {}
    }

    const spawnGhost = (el, info, sinceClose) => {
      let ghost = null
      try { ghost = el.cloneNode(true) } catch {}
      if (!ghost || ghost.nodeType !== 1) return
      ghost.classList?.add('atr-ghost')
      try { ghost.removeAttribute('id') } catch {}
      try { ghost.removeAttribute('tabindex') } catch {}
      try { ghost.querySelectorAll?.('[id], [tabindex]').forEach(node => { node.removeAttribute('id'); node.removeAttribute('tabindex') }) } catch {}
      try { ghost.setAttribute('aria-hidden', 'true') } catch {}
      // Normalise to the closed state: a surface removed while it was still
      // open would otherwise replay the ENTRANCE keyframes (the open rules
      // match the clone), and the whole clone is inert for keyboard too.
      try { ghost.setAttribute('data-state', 'closed') } catch {}
      try { ghost.setAttribute('inert', '') } catch {}
      const rect = info?.rect
      if (rect && rect.width > 0.5 && rect.height > 0.5) {
        ghost.style.left = Math.round(rect.left) + 'px'
        ghost.style.top = Math.round(rect.top) + 'px'
        ghost.style.width = Math.round(rect.width) + 'px'
        ghost.style.height = Math.round(rect.height) + 'px'
      } else {
        ghost.style.inset = '0'
      }
      if (sinceClose > 0) ghost.style.animationDelay = '-' + Math.round(sinceClose) + 'ms'
      const body = document.body
      if (!body || typeof body.appendChild !== 'function') return
      body.appendChild(ghost)
      liveGhosts.push(ghost)
      while (liveGhosts.length > 6) dropGhost(liveGhosts[0])
      let ms = 0.14
      try {
        const raw = getComputedStyle(ghost).animationDuration || '0.14s'
        const value = parseFloat(raw) || 0.14
        ms = /ms/.test(raw) ? value / 1000 : value
      } catch {}
      const durMs = Math.max(120, ms * 1000 + 80)
      ghost.__atrOnEnd = event => {
        // A descendant's own animation ending bubbles up; only the ghost's
        // exit (fired on the ghost itself) may drop it.
        if (event && event.target !== ghost) return
        if (ghost.__atrTimeout != null) { clearTimeout(ghost.__atrTimeout); ghost.__atrTimeout = null }
        dropGhost(ghost)
      }
      ghost.__atrDrop = () => {
        if (ghost.__atrTimeout != null) { clearTimeout(ghost.__atrTimeout); ghost.__atrTimeout = null }
        dropGhost(ghost)
      }
      ghost.addEventListener?.('animationend', ghost.__atrOnEnd, { once: true })
      ghost.__atrTimeout = setTimeout(ghost.__atrDrop, durMs)
    }

    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
      ghostObserver = new MutationObserver(records => {
        let removedAny = false
        for (const record of records) {
          if (record?.type === 'attributes') {
            const target = record.target
            if (!target?.matches?.(GHOST_SLOTS)) continue
            if (target.getAttribute?.('data-state') === 'closed') rememberGhostSource(target)
            else {
              const info = ghostInfo.get(target)
              if (info) info.closedAt = null
            }
            continue
          }
          if (record?.type !== 'childList') continue
          const target = record.target
          // Floating surfaces are portaled to <body> or into a portal wrapper
          // (`data-slot$="-portal"`, e.g. a popover opened inside a dialog), so
          // a subtree added anywhere else — a virtualized history row scrolling
          // into view, say — is never scanned for them. The node itself is
          // still checked: a surface added in place matches directly.
          const portalMount = target === document.body ||
            (target?.nodeType === 1 && Boolean(target.closest?.('[data-slot$="-portal"]')))
          for (const node of record.addedNodes || []) {
            if (node?.nodeType !== 1) continue
            // Our own ghosts are clones of surfaces; never track them.
            if (node.classList?.contains?.('atr-ghost')) continue
            // Every ghost slot is a data-slot; this skips the 13-selector
            // match for the plain wrapper divs a virtual row commit adds.
            if (!node.hasAttribute?.('data-slot')) continue
            const hits = []
            if (node.matches?.(GHOST_SLOTS)) hits.push(node)
            else if (portalMount) {
              // Only a subtree that could contain a floating surface is worth
              // the look, and only its hits are measured (getBoundingClientRect).
              try { node.querySelectorAll?.(GHOST_SLOTS).forEach(el => hits.push(el)) } catch {}
            }
            for (const el of hits) {
              if (!isGhostSurface(el)) continue
              rememberGhostSource(el)
              trackedSurfaces.add(el)
            }
            if (hits.length) trackSurfaces()
          }
          if (record.removedNodes?.length) removedAny = true
        }
        // Removals are matched against the surfaces we tracked rather than
        // against every removed subtree. Added records come before removal
        // records in a batch, so a same-batch mount-and-unmount is already
        // tracked and its last measured rect is on hand.
        if (!removedAny || !trackedSurfaces.size) return
        const now = nowMs()
        for (const el of [...trackedSurfaces]) {
          if (el.isConnected) continue
          trackedSurfaces.delete(el)
          const info = ghostInfo.get(el)
          const sinceClose = info?.closedAt != null ? now - info.closedAt : null
          if (sinceClose === null || sinceClose < 110) spawnGhost(el, info, sinceClose)
          ghostInfo.delete(el)
        }
      })
      ghostObserver?.observe?.(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
      // A surface that was already open when the plugin loaded (a hot reload,
      // or the plugin enabled while a menu is up) never fires an add record;
      // pick it up so its close still gets a ghost.
      try {
        document.querySelectorAll(GHOST_SLOTS).forEach(el => {
          if (!isGhostSurface(el)) return
          rememberGhostSource(el)
          trackedSurfaces.add(el)
        })
        if (trackedSurfaces.size) trackSurfaces()
      } catch {}
    }
    ctx.onDispose?.(() => {
      ghostObserver?.disconnect?.()
      if (surfaceTracker) cancelAnimationFrame?.(surfaceTracker)
      surfaceTracker = 0
      trackedSurfaces.clear()
      for (const ghost of liveGhosts.slice()) ghost.__atrDrop?.()
    })

    if (typeof window !== 'undefined') {
      window.addEventListener?.('popstate', onNavChange)
      window.addEventListener?.('hashchange', onNavChange)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener?.('click', onDocClick, true)
    }

    // Any input means the user is engaged with the transcript now: drop every
    // curtain immediately rather than hold it for quiet that may never come.
    const onSettleInput = () => finishAllSettles()
    if (typeof document !== 'undefined') {
      for (const type of SETTLE_INPUT) {
        document.addEventListener?.(type, onSettleInput, { capture: true, passive: true })
      }
    }
    ctx.onDispose?.(() => {
      if (typeof document !== 'undefined') {
        for (const type of SETTLE_INPUT) {
          document.removeEventListener?.(type, onSettleInput, { capture: true, passive: true })
        }
      }
      finishAllSettles()
    })

    // The look is one still picture and one palette, so "now" is simply now;
    // there is no held moment, no sun position and no clock to follow.
    const nowAt = () => new Date()
    let atrDisposed = false
    let replyRefreshKey = ''
    let replyPictureVersion = 0

    // ── Reply panels ────────────────────────────────────────────────────────
    // One style element, rebuilt only when something it reads has moved. The
    // panel's own tone is solved against the picture behind the reading column,
    // so the same numbers work on the painting and on your own screenshot.
    const renderReplyGround = () => {
      if (typeof document === 'undefined' || !document.head) return
      const sheet = document.getElementById('atr-reply-ground')
      if (!replyGround.get()) { sheet?.remove(); replyRefreshKey = ''; return }
      if (document.hidden) return
      const key = [away, chromeOn.get(), backdropOn.get(), look.get(), replyPictureVersion, pictureRevision,
        JSON.stringify(panelSettings.get()),
        ...SKIN_SLIDERS.map(([k]) => SKIN[k]), ...SKIN_COLORS.map(([k]) => SKIN[k]), SKIN.fit, SKIN.posX, SKIN.posY,
        document.documentElement.className, window.innerWidth, window.innerHeight].join(':')
      if (key === replyRefreshKey) return
      replyRefreshKey = key
      const native = replyHostGround()
      const styled = !away && chromeOn.get() && document.documentElement.classList?.contains?.('dark')
      const material = gruvboxMaterial()
      const ink = styled ? hexRgb(SKIN.ink) : native.ink
      let samples = native.samples
      if (!away && backdropOn.get()) {
        if (gruvboxTinted()) samples = [hexRgb(GLASS.ground)]
        else {
          preparePictureBackdrop(String(SKIN.image || PAINTING_URL))
          samples = pictureBackdrop(native.bounds, chromeOn.get())
        }
      }
      if (!samples.length) samples = [hexRgb(SKIN.ground)]
      const css = replyGroundCss(replyMaterial(ink, styled ? material.tint : native.tint, samples))
      if (!css) { sheet?.remove(); return }
      if (!sheet) {
        const el = document.createElement('style')
        el.id = 'atr-reply-ground'
        document.head.appendChild(el)
      }
      const target = document.getElementById('atr-reply-ground')
      if (target.textContent !== css) target.textContent = css
    }

    const repaint = () => {
      if (away) { clearSheet(); renderReplyGround(); return }
      const backdrop = backdropOn.get()
      const chrome = chromeOn.get()
      if (!backdrop && !chrome) { clearSheet(); renderReplyGround(); return }
      paintSheet(nowAt(), false, { backdrop, chrome })
      renderReplyGround()
    }

    // Repaint when the skin, the look or the picture changes. Nothing here runs
    // on a clock: a still picture cannot drift.
    const apply = () => {
      repaint()
      if (away) return
      requestTheme(THEME_NAME)
      if (tint.get()) setAccentOverride(gruvboxTinted() ? GLASS.accent : GRUVBOX_ACCENT)
    }
    // The status stack's concave corners read the layout, so they are refreshed
    // on a cheap interval rather than from a paint pass.
    let flareStyle = null
    if (typeof document !== 'undefined') {
      flareStyle = document.createElement('style')
      flareStyle.id = 'atr-stack-flare'
      flareStyle.textContent = STACK_FLARE_CSS
      document.head.appendChild(flareStyle)
    }
    // Live work tiles count up once a second. Only the turns that are still
    // running (and the newest reply, which may have just started) are touched.
    // The newest reply is the last thing in the transcript, so walk down its
    // last-child chain: scanning every message root in the document, once a
    // second for the whole session, was the one thing here that grew with the
    // length of the conversation.
    const newestMessageRoot = () => {
      let el = document.querySelector?.("[data-slot='aui_thread-content']")
      for (let depth = 0; el && depth < 6; depth += 1) {
        if (el.matches?.("[data-slot='aui_assistant-message-root']")) return el
        el = el.lastElementChild
      }
      return null
    }
    const liveTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.hidden || !collapseWork.get() || !scrollSettled()) return
      const groups = new Set()
      document.querySelectorAll?.('.atr-work-summary[data-live]').forEach(el => {
        const g = groupContainerOf(el.closest?.("[data-slot='aui_assistant-message-root']")); if (g) groups.add(g)
      })
      const newest = newestMessageRoot()
      if (newest) { const g = groupContainerOf(newest); if (g) groups.add(g) }
      groups.forEach(g => processTurn(g, true))
    }, 1000)
    const flareTimer = setInterval(() => { if (typeof document !== 'undefined' && !document.hidden && scrollSettled()) fitStatusStack() }, 1000)
    apply()

    // ── themes: one stable host entry ──────────────────────────────────────
    // Hermes Atrium publishes a single theme name and re-registers it with the current
    // look's colours, so the pick in Appearance never changes as the look does.
    function registerLive() {
      const key = gruvboxTinted() ? 'gruvbox-tint:' + GLASS_KEYS.filter(k => k !== 'thumb').map(k => GLASS[k]).join() : look.get()
      if (liveFor === key) return
      liveFor = key
      ctx.register({ id: 'hermes-atrium.theme', area: THEMES_AREA, order: 38, data: {
        name: THEME_NAME, label: 'Hermes Atrium',
        description: 'Choose Gruvbox or Custom in Settings → Hermes Atrium.',
        colors: gruvboxTinted() ? glassGrounds() : GRUVBOX_GROUNDS
      } })
    }
    let liveFor = null
    registerLive()

    // One stable host theme. Picking any other Hermes theme parks Atrium.
    let themeObs = null
    if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
      const onTheme = () => {
        const picked = document.documentElement.dataset.hermesTheme || ''
        if (!picked) return
        if (!isOurTheme(picked)) {
          ctx.storage.set('hermesTheme', picked)
          if (!away) { away = true; ctx.storage.set('away', true); clearSheet(); setAccentOverride(null) }
          appearance.set('hermes')
          replyRefreshKey = ''
          renderReplyGround()
          return
        }
        if (picked === THEME_NAME) {
          if (away) { wake(); appearance.set(look.get()) ; apply() }
        }
      }
      themeObs = new MutationObserver(onTheme)
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme'] })
    }

    // ── snippet cards: the medium for "small boxes I can copy and pin" ──
    ensureSnippetStyle()
    ensureHomeStyle()
    ensureMotionStyle()
    const stopPreviewMeasure = ensurePreviewMeasureShim()
    ctx.register({
      id: 'snippet',
      area: DIRECTIVE_AREA,
      data: {
        name: 'snippet',
        render: ({ attrs }) =>
          jsx(SnippetCard, {
            attrs,
            pins,
            onCopy: text => void navigator.clipboard?.writeText(text),
            onGrab: (event, entry) => startDrag(event.nativeEvent || event, { type: 'snip', entry }, event.currentTarget, true),
            onPin: entry => {
              if (pins.get().some(p => p.id === entry.id)) unpinSnip(entry.id)
              else pinSnip(entry)
            }
          })
      }
    })

    // ── one quiet status-bar readout, so the mode is never a mystery ──
    ctx.register({
      id: 'phase-chip',
      area: 'statusBar.right',
      order: 96,
      render: () => jsx(PhaseChip, { appearance, onSelect: selectAppearance })
    })

    // ── settings ─────────────────────────────────────────────────────────────
    // Look is the short, front page: the appearance gallery, the background and
    // Hermes Atrium styling switches. Picture knobs appear only on Custom, and the long
    // Chat/Snippets sections stay folded until asked for.
    // `collapse` keeps the long, occasional sections (chat, snippets) to one
    // line until they are opened. Native <details>/<summary> needs no state and
    // keeps the app's own disclosure marker.
    const section = (icon, title, rows, opts = {}) => {
      const body = rows.filter(Boolean)
      if (opts.collapse) {
        return jsxs('details', {
          className: 'mb-3',
          open: opts.open || undefined,
          children: [
            jsx('summary', {
              className: 'mb-1 cursor-pointer pt-2 text-[length:var(--conversation-text-font-size)] font-medium',
              children: jsxs('span', {
                className: 'inline-flex items-center gap-2',
                children: [
                  jsx(Codicon, { className: 'text-muted-foreground', name: icon, size: '1rem' }),
                  jsx('span', { children: title })
                ]
              })
            }),
            ...body
          ]
        })
      }
      return jsxs('section', {
        className: 'mb-5',
        children: [
          jsxs('div', {
            className: 'mb-1 flex items-center gap-2 pt-2 text-[length:var(--conversation-text-font-size)] font-medium',
            children: [
              jsx(Codicon, { className: 'text-muted-foreground', name: icon, size: '1rem' }),
              jsx('span', { children: title })
            ]
          }),
          ...body
        ]
      })
    }

    // ── the skin as state: wallpaper + every knob the editor exposes ──────────
    // The image is stored under its own key because a full-resolution picture
    // can be megabytes; the rest is one small object.
    const storedSkin = stored(STORE_KEYS.skin)
    const customSkin = storedSkin && typeof storedSkin === 'object' ? { ...SKIN_DEFAULTS, ...storedSkin } : { ...SKIN_DEFAULTS }
    const storedPicture = stored(STORE_KEYS.skinImage)
    if (typeof storedPicture === 'string' && storedPicture.length > 32) customSkin.image = storedPicture
    // Zero tint always restores the shipped painting and panel values.
    setSkin(look.get() === 'custom' ? customSkin : gruvboxTinted() ? glassSkin() : { ...SKIN_DEFAULTS })
    pictureReady = () => { if (!atrDisposed) { replyPictureVersion += 1; renderReplyGround(nowAt()) } }

    ensurePictureStyle(SKIN.image)
    const skin = atom({ ...customSkin })
    const selectAppearance = next => {
      if (!['gruvbox', 'custom', 'hermes'].includes(next)) return
      if (next === 'hermes') {
        away = true
        ctx.storage.set('away', true)
        appearance.set('hermes')
        clearSheet(); setAccentOverride(null)
        requestTheme(stored('hermesTheme') && !isOurTheme(stored('hermesTheme')) ? stored('hermesTheme') : 'nous')
        replyRefreshKey = ''
        renderReplyGround()
        return
      }
      if (typeof document !== 'undefined') {
        const current = document.documentElement.dataset.hermesTheme
        if (current && !isOurTheme(current)) ctx.storage.set('hermesTheme', current)
      }
      wake()
      auto.set(true)
      look.set(next)
      appearance.set(next)
      setLookMode(look.get())
      setSkin(next === 'custom' ? { ...skin.get() } : gruvboxTinted() ? glassSkin() : { ...SKIN_DEFAULTS })
      ensurePictureStyle(SKIN.image)
      if (gruvboxTinted()) ensureWindowGlass()
      persist()
      syncBackdrop()
      apply()
    }


    // Glass needs the window itself to be see-through: Hermes's own glass
    // setting (Settings → Appearance → Translucency). If it is off, turn it on
    // for the dark palette at a light tint; ours paints the colour. The app's
    // store listens for this key's storage event, so it applies live.
    const TRANSLUCENCY_KEY = 'hermes.desktop.translucency.v2'
    const ensureWindowGlass = () => {
      if (typeof document === 'undefined' || !window.hermesDesktop?.glassSupported || backdrop) return
      let book = {}
      try { book = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || '{}') || {} } catch {}
      // Like a terminal's background-blur: the whole window, on the thinnest
      // material ('under-window'; 'titlebar' frosts everything grey), and the
      // sidebar-only scope would leave the chat column a solid slab.
      const dark = { ...(book.dark || {}) }
      if (!(Number(dark.intensity) > 0)) dark.intensity = 20
      if (book.mode === 'glass' && dark.material === 'under-window' && dark.scope === 'window') return
      dark.material = 'under-window'
      dark.scope = 'window'
      const next = { ...book, mode: 'glass', dark }
      try {
        localStorage.setItem(TRANSLUCENCY_KEY, JSON.stringify(next))
        window.dispatchEvent(new StorageEvent('storage', { key: TRANSLUCENCY_KEY, newValue: JSON.stringify(next) }))
      } catch {}
    }
    // ── Glass backdrop ──
    // macOS window materials blur hard and lay their own fill over the desktop,
    // so through them the wallpaper is a dark smear. A terminal's
    // background-blur is a light blur with no fill. To get that exactly, the
    // wallpaper itself is baked once (blurred 20px at screen size, a JPEG) and
    // painted behind the tint, slid by the window's position on screen so it
    // lines up with the real desktop. One static image: no per-frame blur and
    // no native material, which is also far cheaper than vibrancy.
    // Narrow rails are hover overlays, not persistent pins over the chat.
    // The host pins them after a titlebar / keyboard reveal; explicitly close
    // that reveal after the pointer leaves their combined chrome + guest area.
    // One event-driven timeout, no polling and no work when the pane is closed.
    let narrowHideTimer = 0
    const clearNarrowHide = () => { clearTimeout(narrowHideTimer); narrowHideTimer = 0 }
    const outsideNarrowRail = event => {
      const overlay = document.querySelector('[data-narrow-overlay]')
      if (!overlay || window.innerWidth >= 640) { clearNarrowHide(); return }
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-narrow-overlay], [data-pane-overlay], [role="dialog"], [role="menu"], [data-radix-popper-content-wrapper], div.fixed[data-atr-sbbtn]')) {
        clearNarrowHide()
        return
      }
      if (narrowHideTimer) return
      const id = overlay.getAttribute('data-narrow-overlay')
      narrowHideTimer = setTimeout(() => {
        narrowHideTimer = 0
        if (window.innerWidth < 640 && document.querySelector('[data-narrow-overlay]')?.getAttribute('data-narrow-overlay') === id) {
          window.dispatchEvent(new CustomEvent('hermes:pane-toggle-reveal', { detail: { id, mode: 'close' } }))
        }
      }, 180)
    }
    document.addEventListener('pointermove', outsideNarrowRail, { passive: true })
    ctx.onDispose?.(() => {
      clearNarrowHide()
      document.removeEventListener('pointermove', outsideNarrowRail)
    })

    const BACKDROP_STYLE = 'atr-glass-backdrop'
    let backdrop = ''
    try { const b = ctx.storage.get('glassBackdrop'); if (typeof b === 'string' && b.startsWith('data:image/')) backdrop = b } catch {}
    let bx = NaN, by = NaN, trackTimer = 0, trackRaf = 0, still = 0
    const placeBackdrop = () => {
      const x = window.screenX - (window.screen.left || 0)
      const y = window.screenY - (window.screen.top || 0)
      if (x === bx && y === by) return false
      bx = x; by = y
      const root = document.documentElement.style
      root.setProperty('--atr-bx', `${-x}px`)
      root.setProperty('--atr-by', `${-y}px`)
      root.setProperty('--atr-bw', `${window.screen.width}px`)
      root.setProperty('--atr-bh', `${window.screen.height}px`)
      return true
    }
    const stopTracking = () => { clearTimeout(trackTimer); cancelAnimationFrame(trackRaf); trackTimer = 0; trackRaf = 0 }
    // While focused, a cheap 4 Hz position check; once the window is moving,
    // follow it every frame until it has sat still for half a second. Unfocused
    // or hidden: no timers at all.
    const trackBackdrop = () => {
      stopTracking()
      if (!backdrop || !gruvboxTinted() || document.hidden || !document.hasFocus()) return
      if (placeBackdrop()) still = 0
      const burst = () => {
        if (placeBackdrop()) still = 0
        else still += 1
        if (still < 30) trackRaf = requestAnimationFrame(burst)
        else { trackRaf = 0; trackTimer = setTimeout(poll, 250) }
      }
      const poll = () => { if (placeBackdrop()) { still = 0; trackRaf = requestAnimationFrame(burst) } else trackTimer = setTimeout(poll, 250) }
      trackTimer = setTimeout(poll, 250)
    }
    const syncBackdrop = () => {
      const on = !!backdrop && gruvboxTinted()
      const root = document.documentElement
      if (on) root.setAttribute('data-atr-backdrop', '')
      else root.removeAttribute?.('data-atr-backdrop')
      let el = document.getElementById(BACKDROP_STYLE)
      if (!on) { el?.remove(); stopTracking(); return }
      windowGlassOff()
      if (!el) { el = document.createElement('style'); el.id = BACKDROP_STYLE; document.head.appendChild(el) }
      const css = `html:root[data-atr-backdrop] body { background: linear-gradient(rgba(var(--atr-glass-rgb), var(--atr-glass-a)), rgba(var(--atr-glass-rgb), var(--atr-glass-a))) fixed, url("${backdrop}") var(--atr-bx, 0px) var(--atr-by, 0px) / var(--atr-bw, 100vw) var(--atr-bh, 100vh) no-repeat fixed, #000 !important; }`
      if (el.textContent !== css) el.textContent = css
      bx = by = NaN
      placeBackdrop()
      trackBackdrop()
    }
    const onBackdropResize = () => { if (backdrop && gruvboxTinted()) { bx = NaN; placeBackdrop() } }
    window.addEventListener('focus', trackBackdrop)
    window.addEventListener('blur', stopTracking)
    document.addEventListener('visibilitychange', trackBackdrop)
    window.addEventListener('resize', onBackdropResize)
    ctx.onDispose?.(() => {
      stopTracking()
      window.removeEventListener('focus', trackBackdrop)
      window.removeEventListener('blur', stopTracking)
      document.removeEventListener('visibilitychange', trackBackdrop)
      window.removeEventListener('resize', onBackdropResize)
      document.getElementById(BACKDROP_STYLE)?.remove()
      document.documentElement.removeAttribute('data-atr-backdrop')
    })
    // Bake: cover-fit to the screen's size in points, blurred like a terminal's
    // background-blur. Drawn oversize so the blur doesn't darken the edges.
    const bakeBackdrop = img => {
      const W = window.screen.width, H = window.screen.height, pad = 60
      const c = document.createElement('canvas')
      c.width = W; c.height = H
      const g = c.getContext('2d')
      const k = Math.max((W + pad * 2) / img.naturalWidth, (H + pad * 2) / img.naturalHeight)
      const dw = img.naturalWidth * k, dh = img.naturalHeight * k
      g.filter = 'blur(20px)'
      g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
      return c.toDataURL('image/jpeg', 0.82)
    }
    // With the wallpaper painted here the window is opaque, so the native
    // material underneath would be pure GPU cost: turn the app's glass off
    // (its tint slider goes to 0; the user's other glass settings are kept).
    const windowGlassOff = () => {
      if (!document.documentElement.hasAttribute('data-hermes-glass-on')) return
      let book = {}
      try { book = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || '{}') || {} } catch {}
      const next = { ...book, dark: { ...(book.dark || {}), intensity: 0 } }
      try {
        localStorage.setItem(TRANSLUCENCY_KEY, JSON.stringify(next))
        window.dispatchEvent(new StorageEvent('storage', { key: TRANSLUCENCY_KEY, newValue: JSON.stringify(next) }))
      } catch {}
    }

    const glassState = atom({ ...GLASS })
    if (gruvboxTinted()) { ensureWindowGlass(); syncBackdrop() }
    const pushGlass = patch => {
      setGlass({ ...GLASS, ...patch })
      glassState.set({ ...GLASS })
      ctx.storage.set('gruvboxTint', { ...GLASS })
      if (look.get() !== 'gruvbox') { selectAppearance('gruvbox'); return }
      setSkin(gruvboxTinted() ? glassSkin() : { ...SKIN_DEFAULTS })
      if (gruvboxTinted()) ensureWindowGlass()
      apply()
      syncBackdrop()
    }
    // Sample a picture small (the palette needs colour, not detail) and derive
    // every glass colour from it. A tiny copy is kept for the picker swatch.
    const matchPicture = file => new Promise(resolve => {
      if (!file) return resolve(false)
      const url = typeof file === 'string' ? file : URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          const c = document.createElement('canvas')
          c.width = 64; c.height = 36
          const g = c.getContext('2d')
          g.drawImage(img, 0, 0, 64, 36)
          const pal = glassPaletteFrom(g.getImageData(0, 0, 64, 36).data)
          const t = document.createElement('canvas')
          t.width = 160; t.height = 90
          t.getContext('2d').drawImage(img, 0, 0, 160, 90)
          backdrop = bakeBackdrop(img)
          try { ctx.storage.set('glassBackdrop', backdrop) } catch {}
          pushGlass({ ...pal, tint: GLASS.tint || 0.08, thumb: t.toDataURL('image/jpeg', 0.7) })
          resolve(true)
        } catch { resolve(false) } finally { if (typeof file !== 'string') URL.revokeObjectURL(url) }
      }
      img.onerror = () => { if (typeof file !== 'string') URL.revokeObjectURL(url); resolve(false) }
      img.src = url
    })
    const pushSkin = patch => {
      const next = { ...skin.get(), ...patch }
      // Touching a knob means "I want my own version": switch onto Custom so the
      // change is actually on screen, rather than silently stored for later.
      if (look.get() !== 'custom') {
        selectAppearance('custom')
      }
      for (const key of Object.keys(next)) if (next[key] === undefined) next[key] = SKIN_DEFAULTS[key]
      skin.set(next)
      setSkin(next)
      ctx.storage.set(STORE_KEYS.skin, next)
      if (!fromFile) writeConfig(next)
      if (patch.image !== undefined) {
        ctx.storage.set(STORE_KEYS.skinImage, next.image)
        ensurePictureStyle(next.image)
      }
      apply()
    }
    const resetSkin = () => {
      skin.set({ ...SKIN_DEFAULTS })
      setSkin({ ...SKIN_DEFAULTS })
      ctx.storage.set(STORE_KEYS.skin, { ...SKIN_DEFAULTS })
      ctx.storage.set(STORE_KEYS.skinImage, SKIN_DEFAULTS.image)
      ensurePictureStyle(SKIN_DEFAULTS.image)
      writeConfig(SKIN_DEFAULTS)
      apply()
    }
    // ── files: the painting, and ~/.hermes/hermes-atrium-theme.json ─────────────
    // The theme file IS the Custom look. Every key is optional; anything left
    // out keeps its default. Edit it in any editor and the app follows within
    // a couple of seconds; moving a knob in Settings writes it back.
    const desk = typeof window !== 'undefined' ? window.hermesDesktop : null
    let configPath = null
    let homeDir = ''
    // Windows hands us `C:\Users\...`; a file URL needs `file:///C:/Users/...`.
    const fileUrl = p => {
      let s = String(p || '').replace(/\\/g, '/')
      if (!s) return s
      if (!s.startsWith('/')) s = '/' + s
      return 'file://' + encodeURI(s)
    }
    let lastConfigText = null
    const pathToUrl = v => {
      const t = String(v || '').trim()
      if (!t || /^(file|https?|data|blob):/i.test(t)) return t
      const abs = t.startsWith('~/') ? homeDir + t.slice(1) : t
      return /^(?:[A-Za-z]:[\\/]|\/)/.test(abs) ? fileUrl(abs) : t
    }
    const urlToPath = v => {
      const t = String(v || '')
      if (t.startsWith('data:')) return 'uploaded'
      if (!t.startsWith('file://')) return t
      const abs = decodeURI(t.slice(7))
      return homeDir && abs.startsWith(homeDir + '/') ? '~' + abs.slice(homeDir.length) : abs
    }
    const CONFIG_HELP = 'Hermes Atrium Custom look. Edit and save; Hermes follows. image: a path (~/Pictures/x.jpg), a URL, or "uploaded" to keep the picture from Settings. Colours are hex; opacities and filters are numbers. Delete a key to get its default.'
    const configText = sk => {
      const out = { _help: CONFIG_HELP }
      for (const key of Object.keys(SKIN_DEFAULTS)) out[key] = key === 'image' ? urlToPath(sk.image) : sk[key]
      return JSON.stringify(out, null, 2) + '\n'
    }
    const writeConfig = sk => {
      if (!configPath || !desk?.writeTextFile) return
      const text = configText(sk)
      if (text === lastConfigText) return
      lastConfigText = text
      desk.writeTextFile(configPath, text).catch?.(() => {})
    }
    const readConfig = async (switchTo = true) => {
      if (!configPath || !desk?.readFileText) return
      let res = null
      try { res = await desk.readFileText(configPath) } catch { return }
      const text = res && res.ok !== false && typeof res.text === 'string' ? res.text : null
      if (text === null || text === lastConfigText) return
      lastConfigText = text
      let data
      try { data = JSON.parse(text) } catch (error) { console.warn('[hermes-atrium] hermes-atrium-theme.json is not valid JSON:', String(error)); return }
      if (!data || typeof data !== 'object') return
      const patch = {}
      for (const key of Object.keys(SKIN_DEFAULTS)) if (data[key] !== undefined && data[key] !== null && data[key] !== '') patch[key] = data[key]
      if (patch.image === 'uploaded') delete patch.image
      else if (patch.image) patch.image = pathToUrl(patch.image)
      const next = { ...SKIN_DEFAULTS, ...(patch.image ? {} : { image: skin.get().image }), ...patch }
      if (!switchTo && look.get() !== 'custom') {
        // startup: seed Custom quietly, without changing what is on screen
        skin.set(next)
        ctx.storage.set(STORE_KEYS.skin, next)
        return
      }
      fromFile = true
      try { pushSkin(next) } finally { fromFile = false }
    }
    let fromFile = false
    // ── Shipping pictures ───────────────────────────────────────────────────
    // Every picture the plugin draws comes from its own `assets/` folder, and
    // nowhere else. `gruvbox.jpg` is preferred; any other image dropped in
    // there is used if it is missing, so swapping the painting is one file copy.
    const IMAGE_RE = /\.(?:jpe?g|png|webp|avif)$/i
    const PICTURE_NAMES = ['gruvbox.jpg', 'gruvbox.jpeg', 'gruvbox.png', 'gruvbox.webp']
    const pluginDirName = 'hermes-atrium'

    const resolvePluginFiles = async () => {
      if (!desk?.desktopPluginsRoot || !desk?.readDir) {
        console.warn('[hermes-atrium] no desktop file bridge; the painting stays unloaded')
        return
      }
      const root = await desk.desktopPluginsRoot()
      // The bridge reports the native separator, so build paths with it.
      const sep = root.includes('\\') ? '\\' : '/'
      homeDir = root.replace(/[\\/]\.hermes[\\/]desktop-plugins[\\/]?$/, '')
      configPath = root.replace(/[\\/]desktop-plugins[\\/]?$/, '') + sep + 'hermes-atrium-theme.json'
      const names = async dir => {
        try { return ((await desk.readDir(dir)) || {}).entries || [] } catch { return [] }
      }
      // Which folder is ours? The install directory is usually named after the
      // plugin, but a user may rename it, so a folder also counts when its
      // plugin.js declares our id. Nothing else is ever read: a picture is
      // only taken from THIS plugin's own assets/ folder, never a neighbour's.
      const isMine = async dir => {
        if (dir.name.toLowerCase() === pluginDirName) return true
        if (!desk?.readFileText) return false
        try {
          const res = await desk.readFileText(dir.path.replace(/[\\/]+$/, '') + sep + 'plugin.js')
          const text = typeof res === 'string' ? res : res?.text ?? res?.content ?? ''
          return /id:\s*['"]hermes-atrium['"]/.test(String(text))
        } catch { return false }
      }
      const tops = await names(root)
      const dirs = [...tops.filter(e => e.isDirectory && e.name.toLowerCase() === pluginDirName),
        ...tops.filter(e => e.isDirectory && e.name.toLowerCase() !== pluginDirName)]
      let found = null
      let owner = null
      for (const dir of dirs) {
        if (!(await isMine(dir))) continue
        const here = await names(dir.path)
        if (!here.some(e => e.name === 'plugin.js')) continue
        const assetsDir = here.find(e => e.name === 'assets' && e.isDirectory)
        if (!assetsDir) continue
        const assets = await names(assetsDir.path)
        const image = assets.find(e => PICTURE_NAMES.includes(e.name.toLowerCase()))
          || assets.find(e => IMAGE_RE.test(e.name))
        if (!image) continue
        found = image.path
        owner = dir.name
        break
      }
      if (found) {
        const url = fileUrl(found)
        const was = PAINTING_URL
        PAINTING_URL = url
        SKIN_DEFAULTS.image = url
        // Replace a stale pointer in every place it may have been remembered:
        // an earlier release resolved the same file from the plugin root, and
        // its absolute path is now wrong.
        const stale = img => !img || img === was || img === 'data:,'
          || /[\\/]backwater\.(?:jpe?g|png|webp)$/i.test(String(img))
        if (stale(SKIN.image)) setSkin({ ...SKIN, image: url })
        if (stale(skin.get().image)) skin.set({ ...skin.get(), image: url })
        ensurePictureStyle(SKIN.image)
        appearanceAssets.set(appearanceAssets.get() + 1)
        apply()
        console.info(`[hermes-atrium] painting: ${owner}/assets/${found.split(/[\\/]/).pop()}`)
      } else {
        console.warn(`[hermes-atrium] no picture in <plugin>/assets (looked for ${PICTURE_NAMES[0]} or any image)`)
      }
      await readConfig(false)
    }
    resolvePluginFiles().catch(error => console.warn('[hermes-atrium] plugin files:', String(error)))
    // hermes-atrium-theme.json is read through the desktop bridge, so a poll is an IPC
    // plus a file read, not a property access. 2s while you are looking at the
    // window (an edit lands live), 30s while you are not (an edit is followed by
    // coming back here anyway).
    let configTicks = 0
    const configTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      configTicks += 1
      if (configTicks % 15 !== 0 && !document.hasFocus?.()) return
      readConfig(true)
    }, 2000)
    const openConfig = async () => {
      if (!configPath) return
      let exists = false
      try { const r = await desk.readFileText(configPath); exists = Boolean(r && r.ok !== false) } catch {}
      if (!exists) { lastConfigText = null; writeConfig(skin.get()); await new Promise(r => setTimeout(r, 200)) }
      desk.revealPath?.(configPath)
    }
    const readAsDataUrl = file => new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
    // Keep the original bytes whenever the store can take them; only re-encode
    // when a picture is too big for the browser's storage, and then once.
    const shrinkDataUrl = (dataUrl, max = 2560) => new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        if (!img.naturalWidth || img.naturalWidth <= max) return resolve(dataUrl)
        const scale = max / img.naturalWidth
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.92))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
    const useImageFile = async file => {
      if (!file) return
      const raw = await readAsDataUrl(file)
      if (!raw) return
      const fitted = raw.length > 3_200_000 ? await shrinkDataUrl(raw) : raw
      pushSkin({ image: fitted })
    }


    // ── Chat or empty page ───────────────────────────────────────────────────
    // The picture is sharp on an empty page and frosted behind a conversation:
    // mark which one is on screen, and let the sheet do the rest. The app only
    // draws its intro for the very first draft, so every other empty tab gets
    // the same wordmark from here.
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') try {
      const root = document.documentElement
      let pageDead = false
      document.querySelectorAll('#atr-landing').forEach(el => el.remove())
      const landing = document.createElement('div')
      landing.id = 'atr-landing'
      landing.setAttribute('aria-hidden', 'true')
      const LINES = ['Where should we begin?', 'What are we making today?', 'Bring the stuck part. We will work it out.', 'Drop in a task, a file, or a rough idea.', 'What should Hermes tackle?']
      landing.innerHTML = '<div class="atr-land-mark">HERMES AGENT</div><div class="atr-land-line"></div>'
      landing.lastElementChild.textContent = LINES[Math.floor(Math.random() * LINES.length)]
      document.body.appendChild(landing)
      // borrow the app's own intro (font-fitted wordmark and all) once seen
      const borrowIntro = intro => {
        if (landing.dataset.cloned || !intro) return
        const copy = intro.cloneNode(true)
        copy.removeAttribute('data-slot')
        copy.querySelectorAll('[data-slot]').forEach(el => el.removeAttribute('data-slot'))
        landing.replaceChildren(copy)
        landing.dataset.cloned = '1'
        for (const x of extraLandings) x.replaceChildren(copy.cloneNode(true))
      }
      const extraLandings = []
      let rootTimer = 0
      let rootTries = 0
      // ── New-tab shelf ──────────────────────────────────────────────────────
      // What to open next, drawn on the empty page. The rules live in RECENTS
      // (recents/engine.js, tested on their own); this only records visits and
      // draws what the rules return. Nothing is sent anywhere: the history is a
      // small record per session in this plugin's own storage.
      const home = (() => {
        const none = { sync() {}, reset() {}, dispose() {} }
        if (typeof host === 'undefined' || !host.state || typeof host.listPersistedSessions !== 'function') return none
        const SEED_WINDOW = 30 * 86400
        const REFRESH_MS = 20000
        let records = RECENTS.sanitize(ctx.storage.get(STORE_KEYS.recents, {}))
        let sessions = []
        let fetchedAt = 0
        let fetching = null
        let saveTimer = 0
        let dead = false
        let shown = false
        let anchorPane = null, anchorTagline = null
        let token = 0
        const unbind = []
        const keyOf = s => s._lineage_root_id || s.id
        const rootOfStored = id => {
          const s = sessions.find(x => x.id === id || (Array.isArray(x._lineage_ids) && x._lineage_ids.includes(id)))
          return s ? keyOf(s) : id
        }
        const flush = () => { clearTimeout(saveTimer); saveTimer = 0; try { ctx.storage.set(STORE_KEYS.recents, RECENTS.prune(records)) } catch {} }
        const queueSave = () => { if (!saveTimer && !dead) saveTimer = setTimeout(flush, 2000) }

        // ── recording ──
        const touch = turn => {
          if (dead || !homeOn.get()) return
          const id = host.state.focusedStoredSessionId.get()
          if (!id || typeof id !== 'string') return
          const key = rootOfStored(id)
          const rec = records[key] || (records[key] = RECENTS.emptyRecord(key))
          if (turn) RECENTS.recordTurn(rec, Date.now())
          else RECENTS.recordFocus(rec, Date.now())
          queueSave()
        }
        let sending = false
        unbind.push(host.state.focusedStoredSessionId.subscribe(() => touch(false)))
        unbind.push(host.state.awaitingResponse.subscribe(v => { if (v && !sending) touch(true); sending = Boolean(v) }))
        ctx.setInterval?.(() => { if (document.visibilityState === 'visible' && document.hasFocus()) touch(false) }, 60000)

        // ── reading ──
        const refresh = () => {
          if (fetching) return fetching
          if (sessions.length && Date.now() - fetchedAt < REFRESH_MS) return Promise.resolve()
          fetching = (async () => {
            try {
              // The host always sorts by started_at, newest first, and caps the page
              // (`order: 'created'` is hard-coded in the SDK). Ask for the endpoint's
              // whole page: at 200, a long-lived session you started months ago but
              // still open daily falls outside the window and is never suggested.
              const r = await host.listPersistedSessions(null, { profile: host.state.profile.get(), limit: 500 })
              if (dead) return
              sessions = Array.isArray(r && r.sessions) ? r.sessions.filter(s => s && typeof s.id === 'string') : []
              fetchedAt = Date.now()
              let added = false
              for (const s of sessions) {
                const k = keyOf(s)
                if (!records[k] && Date.now() / 1000 - s.last_active < SEED_WINDOW) { records[k] = RECENTS.seedFromSession(RECENTS.emptyRecord(k), s); added = true }
              }
              if (added) queueSave()
            } catch { /* no gateway yet: the shelf stays away */ } finally { fetching = null }
          })()
          return fetching
        }
        const choose = () => {
          const now = Date.now()
          const byRow = {}
          for (const s of sessions) byRow[s.id] = records[keyOf(s)]
          const focused = host.state.focusedStoredSessionId.get()
          const exclude = new Set(focused ? sessions.filter(s => s.id === focused || (s._lineage_ids || []).includes(focused)).map(s => s.id) : [])
          return RECENTS.pickUp(sessions, byRow, now, { exclude })
        }

        // ── drawing ──
        const el = document.createElement('div')
        el.id = 'atr-home'
        el.setAttribute('aria-label', 'Suggested sessions')
        el.dataset.cards = homeCard.get()
        document.body.appendChild(el)
        unbind.push(homeCard.subscribe?.(v => { el.dataset.cards = v }))
        const open = id => { try { Promise.resolve(host.openSession(id)).catch(() => {}) } catch {} }
        const card = (item, dropTitle, drop) => {
          const wrap = document.createElement('div')
          wrap.className = 'atr-card'
          const b = document.createElement('button')
          b.type = 'button'
          b.className = 'atr-card-open'
          const t = document.createElement('span')
          t.className = 'atr-card-title'
          t.textContent = (item.session.title || '').trim() || 'Untitled'
          const r = document.createElement('span')
          r.className = 'atr-card-why'
          r.textContent = item.reason
          b.append(t, r)
          b.addEventListener('click', () => open(item.id))
          const x = document.createElement('button')
          x.type = 'button'
          x.className = 'atr-card-x'
          x.title = dropTitle
          x.setAttribute('aria-label', dropTitle)
          x.textContent = '×'
          x.addEventListener('click', e => { e.stopPropagation(); drop(item); wrap.remove(); if (!el.querySelector('.atr-card')) el.replaceChildren() })
          wrap.append(b, x)
          return wrap
        }
        const row = (label, items, dropTitle, drop) => {
          if (!items.length) return null
          const sec = document.createElement('section')
          const h = document.createElement('h3')
          h.textContent = label
          const cards = document.createElement('div')
          cards.className = 'atr-cards'
          for (const it of items) cards.appendChild(card(it, dropTitle, drop))
          sec.append(h, cards)
          return sec
        }
        const draw = () => {
          const pick = choose()
          const ensure = item => records[keyOf(item.session)] || (records[keyOf(item.session)] = RECENTS.emptyRecord(keyOf(item.session)))
          const parts = [
            row('Pick up where you left off', pick, 'Not this one', item => { ensure(item).dismissed = Date.now(); queueSave() }),
          ].filter(Boolean)
          el.replaceChildren(...parts)
          el.dataset.on = parts.length ? '1' : ''
        }
        const hide = () => { shown = false; token++; el.dataset.on = ''; el.replaceChildren() }
        const place = (r, tagline) => {
          const width = Math.max(260, Math.min(920, r.width - 48))
          // Sit just under the tagline's real bottom edge (it can wrap to two lines); fall back to a fixed fraction.
          const tb = tagline && tagline.getBoundingClientRect()
          let top = tb && tb.height > 0 && tb.bottom > r.top && tb.bottom < r.top + r.height ? tb.bottom + 44 : r.top + r.height * 0.6
          // the pinned status shelf sits right under the tagline: start below it when it is showing
          const pinned = document.getElementById('atr-shelf-below')
          const sb = pinned && !pinned.hidden ? pinned.getBoundingClientRect() : null
          if (sb && sb.height > 0 && sb.bottom + 28 > top && sb.top < r.top + r.height) top = sb.bottom + 28
          const next = { left: Math.round(r.left + (r.width - width) / 2) + 'px', top: Math.round(top) + 'px', width: Math.round(width) + 'px', maxHeight: Math.max(0, Math.round(r.top + r.height - top - 88)) + 'px' }
          for (const k in next) if (el.style[k] !== next[k]) el.style[k] = next[k]
        }

        return {
          // called on every page pass with the empty pane's box, or null
          sync(rect, tagline, pane) {
            if (dead) return
            anchorPane = pane
            anchorTagline = tagline
            if (!rect || !homeOn.get()) { if (shown) hide(); return }
            place(rect, tagline)
            if (shown) return
            shown = true
            const mine = ++token
            if (sessions.length) draw()
            refresh().then(() => { if (shown && mine === token && !el.querySelector('.atr-card')) draw() })
          },
          // Re-measure directly during a view-transition update: hit testing
          // in syncPage can see the transition snapshot rather than the pane.
          layout() {
            if (!dead && shown && anchorPane?.isConnected) place(anchorPane.getBoundingClientRect(), anchorTagline)
          },
          poke() { if (shown && !homeOn.get()) hide() },
          reset() { records = {}; flush(); if (shown) draw() },
          dispose() {
            dead = true
            unbind.forEach(u => { try { u() } catch {} })
            flush()
            el.remove()
          },
        }
      })()

      homeApi = home
      const syncPage = () => {
        if (pageDead) return
        // several tabs keep their thread mounted in the same spot; only the one
        // the pointer would actually hit counts (a page like Capabilities sits
        // on top of a still-mounted thread)
        const vps = Array.from(document.querySelectorAll("[data-slot='aui_thread-viewport']")).filter(el => el.getClientRects().length && el.getBoundingClientRect().width > 200)
        const shown = []
        let rootOnly = false
        for (const v of vps) {
          const r = v.getBoundingClientRect()
          // looking through <html>: during a view transition it is the transition's own snapshot layer
          const hits = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height * 0.3).filter(h => h !== document.documentElement && h !== landing && !landing.contains(h))
          if (hits.length && v.contains(hits[0])) {
            const intro = v.querySelector("[data-slot='aui_intro']")
            const introShown = Boolean(intro && intro.getClientRects().length)
            const hasMsg = Boolean(v.querySelector("[data-slot*='message']"))
            shown.push({ r, v, intro, introShown, empty: introShown || !hasMsg })
          } else if (!hits.length && !v.closest('[data-pane-hidden]')) rootOnly = true
        }
        // nothing but the transition layer: say nothing yet, keep the old state, look again shortly
        if (!shown.length && rootOnly && rootTries++ < 24) { clearTimeout(rootTimer); rootTimer = setTimeout(schedulePage, 90); return }
        rootTries = 0
        const chats = shown.filter(p => !p.empty)
        const empties = shown.filter(p => p.empty)
        // no pane found at all (a page like Capabilities on top) frosts as it always did
        const chat = chats.length > 0 || !shown.length
        if (chat) { if (root.dataset.atrChat !== '1') root.dataset.atrChat = '1' }
        else if (root.dataset.atrChat) delete root.dataset.atrChat
        // a split with a conversation and an empty pane: cut the empty pane out of the frost
        if (chat && chats.length && empties.length) {
          const W = Math.round(window.innerWidth), H = Math.round(window.innerHeight)
          const hole = p => `M${Math.round(p.r.left)} ${Math.round(p.r.top)}h${Math.round(p.r.width)}v${Math.round(p.r.height)}h${-Math.round(p.r.width)}z`
          const clip = `path(evenodd, 'M0 0h${W}v${H}h${-W}z${empties.map(hole).join('')}')`
          if (root.style.getPropertyValue('--atr-chat-clip') !== clip) root.style.setProperty('--atr-chat-clip', clip)
          if (root.dataset.atrClip !== '1') root.dataset.atrClip = '1'
        } else if (root.dataset.atrClip) {
          delete root.dataset.atrClip
          root.style.removeProperty('--atr-chat-clip')
        }
        borrowIntro((shown.find(p => p.intro) || {}).intro || document.querySelector("[data-slot='aui_intro']"))
        const landPanes = empties.filter(p => !p.introShown)
        // the first pane uses the landing element itself; each further empty pane gets a clone
        while (extraLandings.length < landPanes.length - 1) {
          const copy = landing.cloneNode(true)
          copy.removeAttribute('id')
          copy.className = 'atr-landing-x'
          document.body.appendChild(copy)
          extraLandings.push(copy)
        }
        while (extraLandings.length > Math.max(0, landPanes.length - 1)) extraLandings.pop().remove()
        if (landPanes.length) {
          const place = (el, r) => {
            const next = { left: Math.round(r.left) + 'px', top: Math.round(r.top) + 'px', width: Math.round(r.width) + 'px', height: Math.round(r.height * 0.82) + 'px' }
            for (const k in next) if (el.style[k] !== next[k]) el.style[k] = next[k]
          }
          landPanes.forEach((p, i) => place(i === 0 ? landing : extraLandings[i - 1], p.r))
          if (root.dataset.atrLanding !== '1') {
            if (!landing.dataset.cloned) landing.lastElementChild.textContent = LINES[Math.floor(Math.random() * LINES.length)]
            root.dataset.atrLanding = '1'
          }
        } else if (root.dataset.atrLanding) {
          delete root.dataset.atrLanding
        }
        home.sync(empties.length ? empties[0].r : null, [...document.querySelectorAll("[data-slot='aui_intro'] p, #atr-landing p")].filter(e => !/wordmark/.test(String(e.className)) && e.getClientRects().length).pop(), empties[0]?.v)
      }
      let pageQueued = false
      // The sheet matched 13 things with :has(). Scrolling mounts rows, and each
      // mount made Blink re-evaluate those over a large subtree (40ms per row
      // insert). The plugin marks the handful of elements once; the CSS matches
      // an attribute instead.
      const markStrips = () => {
        const want = new Map()
        document.querySelectorAll("[role='tablist']").forEach(tl => {
          const p = tl.parentElement
          if (!p || !p.classList.contains('bg-(--ui-sidebar-surface-background)')) return
          const two = tl.children.length === 2 && tl.children[1].getAttribute('data-slot') === 'pane-tab'
          want.set(p, (want.get(p) || false) || two)
        })
        document.querySelectorAll('[data-atr-strip]').forEach(el => {
          if (!want.has(el)) { el.removeAttribute('data-atr-strip'); el.removeAttribute('data-atr-switch') }
        })
        want.forEach((two, el) => {
          if (!el.hasAttribute('data-atr-strip')) el.setAttribute('data-atr-strip', '')
          if (two && !el.hasAttribute('data-atr-switch')) el.setAttribute('data-atr-switch', '')
          else if (!two && el.hasAttribute('data-atr-switch')) el.removeAttribute('data-atr-switch')
        })
      }

      // one-time marks, so nothing has to be discovered by :has() again
      const flag = (el, name, on) => { if (!el) return; if (on) { if (!el.hasAttribute(name)) el.setAttribute(name, '') } else if (el.hasAttribute(name)) el.removeAttribute(name) }
      const sweep = (name, found) => {
        document.querySelectorAll('[' + name + ']').forEach(el => { if (!found.has(el)) el.removeAttribute(name) })
        found.forEach(el => flag(el, name, true))
      }
      const markHas = () => {
        const tc = document.querySelector("[data-slot='aui_thread-content']")
        if (tc) {
          flag(tc, 'data-atr-intro', !!tc.querySelector("[data-slot='aui_intro'], .wordmark, [class*='wordmark']"))
          flag(tc, 'data-atr-msgs', !!tc.querySelector("[data-slot*='message'], [data-slot='aui_turn-pair'], [data-slot='aui_message-group']"))
        }
        const grid = document.querySelector("[class*='grid-cols-[13rem_minmax(0,1fr)]']")
        flag(document.documentElement, 'data-atr-settings', !!grid)
        const boxes = new Set()
        if (grid) for (let p = grid.parentElement, d = 0; p && d < 2; p = p.parentElement, d++) if (p.matches('div.rounded-xl')) boxes.add(p)
        sweep('data-atr-setbox', boxes)
        const fx = new Set()
        document.querySelectorAll("div.fixed > button[aria-label*='sidebar' i]").forEach(b => fx.add(b.parentElement))
        sweep('data-atr-sbbtn', fx)
        const nav = new Set()
        document.querySelectorAll("[data-tour^='sidebar-nav-']").forEach(n => { const b = n.closest("[data-slot='sidebar-menu-button']"); if (b) nav.add(b) })
        sweep('data-atr-nav', nav)
      }
      const schedulePage = () => {
        if (pageQueued) return
        pageQueued = true
        requestAnimationFrame(() => { pageQueued = false; if (pageDead) return; markStrips(); markHas(); syncPage() })
      }
      const pageObs = new MutationObserver(schedulePage)
      // The tab strips, the sidebar rows and the settings grid are what these
      // marks measure. Watching document.body put a full-document sweep on every
      // chunk the transcript committed; the transcript itself is covered by the
      // rescan hook (a session switch or a route change is what moves a mark).
      const PAGE_TARGETS = ["[data-panel-header]", "[data-slot='sidebar-content']", "[class*='grid-cols-[13rem_minmax(0,1fr)]']"]
      const attachPageObs = () => {
        const targets = PAGE_TARGETS.map(sel => document.querySelector(sel)).filter(Boolean)
        pageObs.disconnect()
        for (const target of targets.length ? targets : [document.body]) {
          pageObs.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'data-state', 'hidden'] })
        }
      }
      attachPageObs()
      // Sidebar docking and split resizing change pane geometry without a
      // window resize or a mutation in the sidebar content.
      const pageSizeObs = typeof ResizeObserver === 'function' ? new ResizeObserver(schedulePage) : null
      const attachPageSizeObs = () => {
        if (pageDead) return
        pageSizeObs?.disconnect()
        document.querySelectorAll("[data-slot='aui_thread-viewport']").forEach(el => pageSizeObs?.observe(el))
      }
      attachPageSizeObs()
      rescanHooks.push(attachPageSizeObs)
      rescanHooks.push(() => { attachPageObs(); schedulePage() })
      window.addEventListener('resize', schedulePage)
      markStrips()
      markHas()
      syncPage()
      ctx.onDispose?.(() => {
        pageDead = true
        home.dispose()
        clearTimeout(rootTimer)
        delete root.dataset.atrClip
        root.style.removeProperty('--atr-chat-clip')
        document.querySelectorAll('[data-atr-strip]').forEach(el => { el.removeAttribute('data-atr-strip'); el.removeAttribute('data-atr-switch') })
        for (const a of ['data-atr-intro', 'data-atr-msgs', 'data-atr-settings', 'data-atr-setbox', 'data-atr-sbbtn', 'data-atr-nav']) document.querySelectorAll('[' + a + ']').forEach(el => el.removeAttribute(a))
        pageObs.disconnect()
        pageSizeObs?.disconnect()
        window.removeEventListener('resize', schedulePage)
        delete root.dataset.atrChat
        delete root.dataset.atrLanding
        landing.remove()
        for (const x of extraLandings) x.remove()
        extraLandings.length = 0
      })
    } catch (err) {
      console.error('[hermes-atrium] page state failed: ' + (err && err.stack || err))
    }

    // ── Session clicks ───────────────────────────────────────────────────────
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      // A session clicked in the sidebar opens in the tab you are in. The app
      // always routes a row click to the first (workspace) tab; when a session
      // tab is active, open the row as a tab through the row's own menu and
      // retire the tab it replaces.
      const topTabs = () => Array.from(document.querySelectorAll("[role='tab'][data-tree-tab]")).filter(t => !t.closest('[data-atr-arc-col]'))
      let swapping = false
      let replaying = false
      const onRowClick = event => {
        if (replaying || swapping || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        // the whole row counts (it is ~62px tall; the title button is 18px),
        // except its own controls: the actions menu and the reorder handle
        const t = event.target
        if (!t.closest || !t.closest("[data-slot='sidebar']")) return
        if (t.closest("button:not([data-slot='row-button']), [aria-label^='Reorder'], input, [role='menu']")) return
        const row = t.closest("[data-slot='context-menu-trigger']")
        const btn = row && row.querySelector("button[data-slot='row-button']")
        if (!btn) return
        const active = topTabs().find(t => t.getAttribute('aria-selected') === 'true')
        const oldId = active && active.dataset.treeTab
        if (!row || !oldId || !oldId.startsWith('session-tile:')) return
        event.preventDefault()
        event.stopImmediatePropagation()
        swapping = true
        root.dataset.atrGhostMenu = '1'
        const r = btn.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + r.height / 2, button: 2 }))
        const finish = () => { swapping = false; delete root.dataset.atrGhostMenu }
        // pick and retire run on animation frames, which a hidden window never delivers
        setTimeout(() => { if (swapping) finish() }, 3000)
        let tries = 0
        const pick = () => {
          const items = Array.from(document.querySelectorAll("[role='menuitem']"))
          if (!items.length && tries++ < 20) { requestAnimationFrame(pick); return }
          const item = items.find(i => /new tab/i.test(i.textContent))
          if (!item) {
            // already open somewhere: close the menu, let the app route it
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            setTimeout(() => { finish(); replaying = true; try { btn.click() } finally { replaying = false } }, 60)
            return
          }
          const before = new Set(topTabs().map(t => t.dataset.treeTab))
          item.click()
          let waits = 0
          const retire = () => {
            const fresh = topTabs().find(t => !before.has(t.dataset.treeTab))
            if (!fresh && waits++ < 40) { setTimeout(retire, 25); return }
            finish()
            const old = topTabs().find(t => t.dataset.treeTab === oldId)
            const close = old && old.querySelector("button[aria-label='Close']")
            if (fresh && close) {
              close.click()
              // a running tab asks first; keep it rather than surprise anyone
              setTimeout(() => {
                const dlg = document.querySelector("[role='alertdialog'], [role='dialog'][data-state='open']")
                if (dlg && /running/i.test(dlg.textContent)) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
              }, 120)
            }
          }
          retire()
        }
        requestAnimationFrame(pick)
      }
      document.addEventListener('click', onRowClick, true)
      ctx.onDispose?.(() => document.removeEventListener('click', onRowClick, true))
    }

    // ── the picture + glass editor ───────────────────────────────────────────
    // Plain inputs on purpose: a range, a colour swatch, a file picker and a URL
    // box cover every knob the skin has, and none of them depend on a Tailwind
    // class that may not exist in the app's compiled sheet.
    const SkinRow = (label, control) =>
      jsxs('div', { className: 'flex items-center justify-between gap-3 py-1', children: [
        jsx('span', { className: 'text-[length:var(--conversation-text-font-size)] text-(--ui-text-secondary)', children: label }),
        control
      ]})

    // ── Panel dials ───────────────────────────────────────────────────────────
    // Five sliders rather than a single opacity: `solid` is the floor everyone
    // wants, but a dial that only sets a floor cannot stop the tone matching the
    // backdrop or the edge disappearing. `tone`/`edge` are what make the panel a
    // card; they are exposed because a Custom picture can need a nudge.
    const PANEL_SLIDERS = [
      ['solid', 'Solidity', 0, 1, 0.01, v => `${Math.round(v * 100)}% floor`],
      ['max', 'Maximum opacity', 0, 1, 0.01, v => `${Math.round(v * 100)}% ceiling`],
      ['tone', 'Panel tone', 0, 1, 0.01, v => v === 0 ? 'matches backdrop' : `${Math.round(v * 100)}% away`],
      ['edge', 'Edge definition', 1, 3, 0.05, v => `${v.toFixed(2)}:1`],
      ['pad', 'Inner padding', 0, 1.6, 0.05, v => `${v.toFixed(2)} rem`]
    ]
    const PanelTuning = ({ onDone }) => {
      const cfg = useValue(panelSettings)
      const push = patch => {
        panelSettings.set({ ...panelSettings.get(), ...patch })
        persist()
        onDone?.()
      }
      return jsxs('div', {
        className: 'mt-1 mb-2 flex flex-col gap-0.5',
        style: { paddingInlineStart: '1.25rem' },
        children: [
          ...PANEL_SLIDERS.map(([key, label, min, max, step, fmt]) =>
            SkinRow(`${label} — ${fmt(cfg[key])}`, jsx('input', {
              type: 'range', min, max, step, value: cfg[key],
              'aria-label': label,
              style: { width: '10rem', accentColor: 'var(--atr-accent, var(--ui-accent, currentColor))' },
              onChange: event => push({ [key]: Number(event.target.value) })
            }))
          ),
          jsx('div', {
            className: 'flex justify-end pt-1',
            children: jsx(Button, {
              size: 'sm',
              variant: 'ghost',
              onClick: () => { panelSettings.set({ ...PANEL_DEFAULTS }); persist(); onDone?.() },
              children: 'Reset panel'
            })
          })
        ]
      })
    }

    const SkinPicture = () => {
      const cfg = useValue(skin)
      const isUpload = typeof cfg.image === 'string' && cfg.image.startsWith('data:')
      return jsxs('div', { className: 'mt-1 flex flex-wrap items-center gap-2 pb-2', children: [
        jsx('label', {
          className: 'cursor-pointer rounded-md px-2 py-1 text-[0.75rem]',
          style: { border: '1px solid var(--atr-edge, var(--ui-stroke-tertiary, rgba(255,255,255,0.16)))' },
          children: [
            'Choose image…',
            jsx('input', {
              type: 'file', accept: 'image/*', style: { display: 'none' },
              onChange: event => {
                const file = event.target.files && event.target.files[0]
                void useImageFile(file)
                event.target.value = ''
              }
            })
          ]
        }),
        jsx('input', {
          type: 'text',
          value: isUpload ? '' : String(cfg.image || ''),
          placeholder: isUpload ? '(uploaded image)' : 'image URL or file path',
          className: 'rounded-md bg-transparent px-2 py-1 text-[0.75rem]',
          style: { flex: '1 1 12rem', minWidth: '10rem', border: '1px solid var(--atr-edge, var(--ui-stroke-tertiary, rgba(255,255,255,0.16)))' },
          onChange: event => {
            const value = event.target.value.trim()
            if (value) pushSkin({ image: value })
          }
        }),
        jsx('button', {
          type: 'button',
          className: 'rounded-md px-2 py-1 text-[0.75rem]',
          style: { border: '1px solid var(--atr-edge, var(--ui-stroke-tertiary, rgba(255,255,255,0.16)))' },
          onClick: () => resetSkin(),
          children: 'Reset'
        }),
        jsx('button', {
          type: 'button',
          className: 'rounded-md px-2 py-1 text-[0.75rem]',
          style: { border: '1px solid var(--atr-edge, var(--ui-stroke-tertiary, rgba(255,255,255,0.16)))' },
          title: '~/.hermes/hermes-atrium-theme.json: every colour, opacity and filter of the Custom look, as one editable file',
          onClick: () => { openConfig() },
          children: 'Theme file'
        })
      ]})
    }

    const GruvboxTintEditor = () => {
      const g = useValue(glassState)
      const btn = { border: '1px solid var(--atr-edge, var(--ui-stroke-tertiary, rgba(255,255,255,0.16)))' }
      const chip = hex => jsx('span', { title: hex, style: { display: 'inline-block', width: '1.1rem', height: '1.1rem', borderRadius: '4px', background: hex, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' } }, hex)
      return jsxs('div', { className: 'flex flex-col gap-2 py-2', children: [
        jsx(ListRow, {
          title: 'Your wallpaper',
          description: 'Pick your wallpaper: it shows through the window, blurred like a terminal, and every colour is drawn from it.',
          action: jsxs('div', { className: 'flex items-center gap-2', children: [
            jsx('label', { className: 'cursor-pointer rounded-md px-2 py-1 text-[0.75rem]', style: btn, children: ['Choose wallpaper…',
              jsx('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: e => { const f = e.target.files && e.target.files[0]; void matchPicture(f); e.target.value = '' } })] }),
            jsx('button', { type: 'button', className: 'rounded-md px-2 py-1 text-[0.75rem]', style: btn, onClick: () => { backdrop = ''; try { ctx.storage.set('glassBackdrop', '') } catch {}; pushGlass({ ...GLASS_DEFAULTS }) }, children: 'Reset' })
          ] })
        }),
        jsx(ListRow, {
          title: 'Tint', description: '0 keeps the painting. Higher values reveal more of the desktop; wallpaper colours are kept for next time.',
          action: jsx('input', { type: 'range', 'aria-label': 'Gruvbox tint', 'aria-valuetext': Math.round(g.tint * 100) + '% transparency', min: 0, max: 0.92, step: 0.01, value: g.tint, style: { width: '10rem', accentColor: 'var(--atr-accent, currentColor)' }, onChange: e => pushGlass({ tint: Number(e.target.value) }) })
        }),
        jsx('div', { className: 'flex flex-wrap gap-1.5', 'aria-label': 'Gruvbox tint palette', children: ['ground', 'cardTint', 'bubbleTint', 'edge', 'accent', 'ink', 'ink2', 'quiet', 'link', 'code', 'quote'].map(k => chip(g[k])) })
      ] })
    }

    const SkinEditor = () => {
      const cfg = useValue(skin)
      const slider = ([key, label, min, max, step]) =>
        SkinRow(label, jsx('input', {
          type: 'range', min, max, step, value: cfg[key],
          style: { width: '10rem', accentColor: 'var(--atr-accent, var(--ui-accent, currentColor))' },
          onChange: event => pushSkin({ [key]: Number(event.target.value) })
        }))
      const swatch = ([key, label]) =>
        SkinRow(label, jsx('input', {
          type: 'color', value: cfg[key],
          style: { width: '2.25rem', height: '1.5rem', padding: '0', border: '1px solid var(--atr-edge, var(--ui-stroke-tertiary, rgba(255,255,255,0.16)))', borderRadius: '0.375rem', background: 'transparent' },
          onChange: event => pushSkin({ [key]: event.target.value })
        }))
      return jsxs('div', { className: 'mt-1 flex flex-col gap-0.5', children: [
        ...SKIN_SLIDERS.map(slider),
        ...SKIN_COLORS.map(swatch)
      ]})
    }

    ctx.registerSettingsPage?.({
      id: 'hermes-atrium',
      title: 'Hermes Atrium',
      icon: 'atrium',
      render: function HermesAtriumSettings() {
        useValue(appearanceAssets)
        useValue(skin)
        useValue(glassState)
        const selectedLook = useValue(appearance)
        const isTint = useValue(tint)
        const isBackdrop = useValue(backdropOn)
        const isChrome = useValue(chromeOn)
        const isReplyGround = useValue(replyGround)
        const isMargins = useValue(margins)
        const isHome = useValue(homeOn)
        const isHomeCard = useValue(homeCard)
        const isCollapseWork = useValue(collapseWork)
        const isMotion = useValue(motion)
        const isStatusDock = useValue(statusDock)
        const isLibrary = useValue(library)
        const lookNow = useValue(look)
        const list = useValue(pins)

        const status = selectedLook === 'hermes'
          ? 'Hermes appearance · Hermes Atrium appearance paused'
          : lookNow === 'custom'
            ? ['Custom picture', isChrome ? 'Hermes Atrium styling' : 'Hermes styling'].join('  ·  ')
            : ['Gruvbox', gruvboxTinted() ? Math.round(GLASS.tint * 100) + '% desktop transparency' : 'our painting, gruvbox.jpg · 4096 × 2428 at full size', isChrome ? 'Hermes Atrium styling' : 'Hermes styling'].join('  ·  ')

        const header = jsxs('div', {
          className: 'mb-6 flex items-start gap-4 rounded-[0.9rem] p-4',
          style: { background: 'var(--atr-glass-sunk, var(--ui-bg-tertiary))', boxShadow: 'var(--atr-lift, none)' },
          children: [
            // the bare mark, in the page's own ink: no card, no shadow
            jsx('div', {
              className: 'shrink-0 text-foreground',
              style: { width: '2.5rem', height: '2.5rem', flex: 'none', marginTop: '0.15rem' },
              dangerouslySetInnerHTML: { __html: ATRIUM_MARK_SVG }
            }),
            jsxs('div', {
              className: 'min-w-0',
              children: [
                jsx('div', { className: 'text-[1.05rem] font-semibold text-foreground', children: 'Hermes Atrium' }),
                jsx('p', {
                  className: 'mt-1 text-[0.8125rem] leading-5 text-(--ui-text-secondary)',
                  children: 'A glossy Atrium for Hermes: a painting or a picture of your own behind the app, '
                    + 'tints every panel to match, and gives each reply a panel of its own. It also adds a floating '
                    + 'sidebar, wide tabs, folded work steps and snippet cards you can pin.'
                }),
                jsx('p', { className: 'mt-2 text-[0.75rem] text-(--ui-text-tertiary)', children: `Now: ${status}` })
              ]
            })
          ]
        })

        const lookSection = section('paintcan', 'Appearance', [
          jsx('div', {
            role: 'group', 'aria-label': 'Hermes Atrium looks',
            style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', margin: '1rem 0' },
            children: APPEARANCE_LOOKS.map(item => jsx(Button, {
              variant: selectedLook === item.id ? 'secondary' : 'outline',
              'aria-pressed': selectedLook === item.id, 'aria-label': item.label,
              style: { height: 'auto', minWidth: 0, padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem', whiteSpace: 'normal', textAlign: 'left', ...(selectedLook === item.id ? { outline: '2px solid var(--ui-accent)', outlineOffset: '2px' } : {}) },
              onClick: () => selectAppearance(item.id),
              children: [
                jsx('span', { 'aria-hidden': true, style: { display: 'block', height: '4rem', borderRadius: 'var(--atr-r-control, 8px)', background: item.id === 'gruvbox' && gruvboxTinted() ? (GLASS.thumb ? `linear-gradient(rgba(${hexTriple(GLASS.ground)}, ${Number((1 - GLASS.tint).toFixed(4))}), rgba(${hexTriple(GLASS.ground)}, ${Number((1 - GLASS.tint).toFixed(4))})), center / cover url("${GLASS.thumb}")` : `linear-gradient(135deg, ${GLASS.ground} 40%, ${GLASS.bubbleTint} 70%, ${GLASS.accent})`) : item.id === 'gruvbox' ? `center / cover url("${PAINTING_URL}")` : item.id === 'custom' && skin.get().image ? `center / cover url("${String(skin.get().image).replace(/"/g, '%22')}")` : item.preview } }),
                jsxs('span', { style: { display: 'flex', justifyContent: 'space-between' }, children: [item.label, selectedLook === item.id ? jsx(Codicon, { name: 'check', size: '1rem' }) : null] }),
                jsx('span', { className: 'text-xs text-muted-foreground', children: item.description })
              ]
            }, item.id))
          }),
          selectedLook === 'hermes' ? jsx('p', { className: 'text-sm text-muted-foreground', children: 'Hermes appearance is active. Choose a look above to resume Hermes Atrium styling.' }) : null,
          selectedLook === 'gruvbox' ? jsx(GruvboxTintEditor, {}) : null,
          selectedLook !== 'hermes' ? jsx(ToggleRow, {
            checked: isBackdrop, label: 'Background', description: 'Show the painting or picture behind the app. Off keeps the colours and Hermes Atrium styling.',
            onChange: on => { backdropOn.set(on); persist(); repaint() }
          }) : null,
          selectedLook !== 'hermes' ? jsx(ToggleRow, {
            checked: isChrome,
            description: 'Atrium’s glass panels, floating sidebar, cards and type. Off keeps Hermes’s own chrome and only the background you chose.',
            label: 'Hermes Atrium styling',
            onChange: on => {
              chromeOn.set(on)
              persist()
              repaint()
            }
          }) : null,
          jsx(ListRow, { description: 'Use your last Hermes theme and pause Hermes Atrium appearance.', action: jsx(Button, { size: 'sm', variant: 'outline', disabled: selectedLook === 'hermes', onClick: () => selectAppearance('hermes'), children: 'Use Hermes appearance' }) })
        ])

        const skinSection = selectedLook === 'custom'
          ? section('paintcan', 'Picture & glass', [
            jsx(SkinPicture, {}),
            jsx('details', {
              className: 'mb-2',
              children: [
                jsx('summary', {
                  className: 'cursor-pointer py-1 text-[0.75rem] text-(--ui-text-tertiary)',
                  children: 'Colour, glass and fit'
                }),
                jsx(SkinEditor, {})
              ]
            })
          ])
          : null

        const lightSection = selectedLook !== 'hermes' ? section('symbol-color', 'Fine-tune appearance', [
          jsx(ToggleRow, {
            checked: isTint,
            description: 'Use this look’s accent for links, buttons and selection.',
            label: 'Tint the accent',
            onChange: on => {
              tint.set(on)
              persist()
              if (on) apply(); else setAccentOverride(null)
            }
          })
        ], { collapse: true }) : null

        const chatSection = section('comment-discussion', 'Chat & motion', [
          jsx(ToggleRow, {
            checked: isHome,
            description: 'On a new tab: the sessions you are most likely to want, and the ones you keep coming back to. It learns only from when you open sessions and send messages, keeps that on this computer, and shows why each one is there. The x on a card removes it.',
            label: 'Suggest sessions on new tabs',
            onChange: on => {
              homeOn.set(on)
              persist()
              homeApi.poke?.()
            }
          }),
          isHome
            ? jsx(ListRow, {
                title: 'Suggestion card material',
                description: 'Matte is the flat fill the sidebar, snippet and tool cards wear, with no edge or shadow. Glass is the translucent sidebar glass, edged and lifted.',
                action: jsx(SegmentedControl, {
                  value: isHomeCard,
                  options: [
                    { id: 'matte', label: 'Matte' },
                    { id: 'glass', label: 'Glass' }
                  ],
                  onChange: next => {
                    homeCard.set(next)
                    persist()
                  }
                })
              })
            : null,
          isHome
            ? jsx(ListRow, {
                description: 'Clears what Atrium has learned about which sessions you open.',
                title: 'Forget my session history',
                action: jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => homeApi.reset(), children: 'Forget' })
              })
            : null,
          jsx(ToggleRow, {
            checked: isReplyGround,
            description: 'Give every reply a solid panel of its own, so the text never sits directly on the picture. Off leaves the prose bare.',
            label: 'Reply panels',
            onChange: on => { replyGround.set(on); persist(); repaint() }
          }),
          isReplyGround ? jsx(PanelTuning, { onDone: () => repaint() }) : null,
          jsx(ToggleRow, {
            checked: isMargins,
            description: 'A narrower reading column with wide margins, lined up with the message box.',
            label: 'Spacious margins',
            onChange: on => {
              margins.set(on)
              persist()
              applyMarginsAndMark(on)
            }
          }),
          jsx(ToggleRow, {
            checked: isCollapseWork,
            description: 'When a reply finishes, fold its thinking and tool steps into one line with the time it took. Click the line to open the steps.',
            label: 'Fold finished work',
            onChange: on => {
              collapseWork.set(on)
              persist()
              applyCollapseWork(on)
            }
          }),
          jsx(ToggleRow, {
            checked: isMotion,
            description: 'Short fades and slides on menus, the history list, the composer, message actions and opening the folded work. Off makes every interaction instant. Also follows your system\'s reduced-motion setting.',
            label: 'App animations',
            onChange: on => {
              motion.set(on)
              persist()
              applyMotion(on)
            }
          }),
          jsx(ToggleRow, {
            checked: isStatusDock,
            description: 'In Simple mode, the status bar (model, context, agents, radio) becomes a card at the foot of the sessions sidebar. It opens when there is room for at least six sessions, and a click on its header opens or closes it. It hides with the sidebar and comes back with it. Advanced mode keeps the bar at the bottom.',
            label: 'Status panel in Simple mode',
            onChange: on => {
              statusDock.set(on)
              persist()
              // put Simple back as it was: hide the bar we revealed
              if (!on && dock.pressed && interfaceMode() === 'simple' && document.querySelector("footer[data-slot='statusbar']")) {
                pressStatusbarKeybind()
                dock.pressed = false
              }
              syncStatusDock()
            }
          })
        ], { collapse: true })

        const pinSection = section('bookmark', list.length ? `Snippets (${list.length})` : 'Snippets', [
          jsx(ToggleRow, {
            checked: isLibrary,
            description: 'Your snippet library: a Snippets card in the sessions sidebar that holds every snippet you pin. Click one to preview it, copy it or attach it to the chat; drag one onto the new-chat Shelf; drag it off the card to unpin it.',
            label: 'Snippet library',
            onChange: on => {
              library.set(on)
              persist()
              lib.key = ''
              layoutLibrary()
            }
          }),
          ...list.map(entry =>
            jsx(ListRow, {
              description: [entry.value, entry.note].filter(Boolean).join(' — '),
              title: entry.title || entry.value || 'snippet',
              action: jsx(Button, {
                size: 'sm',
                variant: 'ghost',
                onClick: () => unpinSnip(entry.id),
                children: 'Unpin'
              })
            })
          ),
          list.length > 1
            ? jsx('div', {
                className: 'flex justify-end pt-1',
                children: jsx(Button, {
                  size: 'sm',
                  variant: 'ghost',
                  onClick: () => { pins.set([]); persist(); onPinsChanged() },
                  children: 'Unpin all'
                })
              })
            : null
        ], { collapse: true })

        return jsxs('div', { children: [header, lookSection, skinSection, lightSection, chatSection, pinSection].filter(Boolean) })
      }
    })

    // ── The floating sidebar ─────────────────────────────────────────────────────────────
    // The app unmounts the whole sidebar tree when it collapses, and remounting
    // it on every hover was the lag. So the app's sidebar is kept open, and
    // "collapsed" is ours: the column is lifted out of the flow and parked
    // off-screen, and a touch on the left edge slides it in. The app's own
    // toggle (button or shortcut) flips between this and a pinned sidebar.
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') try {
      window.__atrRailGen = (window.__atrRailGen || 0) + 1
      const railGen = window.__atrRailGen
      let railDead = false
      const alive = () => !railDead && window.__atrRailGen === railGen
      const root = document.documentElement
      const ARC_KEY = 'hermes-atrium.arc.v1'
      let arc = (() => { try { return localStorage.getItem(ARC_KEY) !== '0' } catch { return true } })()
      let open = false
      let autoUntil = 0
      let closeTimer = 0

      document.querySelectorAll('#atr-rail-hot').forEach(el => el.remove())

      document.querySelectorAll('#atr-mode-btn').forEach(el => el.remove())
      const modeBtn = document.createElement('button')
      modeBtn.type = 'button'
      modeBtn.id = 'atr-mode-btn'
      modeBtn.className = 'atr-mode-btn'
      modeBtn.setAttribute('aria-label', 'Toggle sidebar mode')
      document.body.appendChild(modeBtn)
      const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>'
      const ICON_FLOAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><rect x="6" y="7" width="5" height="10" rx="1.5"/></svg>'
      // the chord is the platform's own: Cmd on macOS, Ctrl everywhere else
      const CHORD = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '') ? '\u2318S' : 'Ctrl+S'
      const paintMode = () => {
        modeBtn.innerHTML = arc ? ICON_PIN : ICON_FLOAT
        modeBtn.title = arc ? `Pin sidebar (${CHORD})` : `Float sidebar (${CHORD})`
        modeBtn.setAttribute('aria-label', modeBtn.title)
      }
      modeBtn.addEventListener('click', e => {
        e.stopPropagation(); e.preventDefault()
        if (arc) { morph(() => setArc(false)); return }
        morph(() => { setArc(true); setOpen(true, true) })
      })
      modeBtn.addEventListener('keydown', e => e.stopPropagation())

      const hot = document.createElement('div')
      hot.id = 'atr-rail-hot'
      hot.setAttribute('aria-hidden', 'true')
      document.body.appendChild(hot)

      // The sidebar switch is drawn by SIDEBAR_CSS, which is part of the
      // styling sheet. With Hermes Atrium styling off there is no sheet to position or
      // hide it, so keep the raw button and the edge sensor out of the way.
      const syncChromeControls = () => {
        const show = chromeOn.get()
        modeBtn.style.display = show ? '' : 'none'
        hot.style.display = show ? '' : 'none'
      }
      const chromeUnsub = chromeOn.subscribe?.(syncChromeControls)
      syncChromeControls()

      const toggleBtn = () => Array.from(document.querySelectorAll('button'))
        .find(el => /^(show|hide) sidebar/i.test(el.getAttribute('aria-label') || ''))
      const press = el => {
        autoUntil = Date.now() + 400
        el.click()
      }
      // The snippet card and the status-dock head are placed by the app's own
      // layout from the column's box. A CSS slide moves that box, so once the
      // slide settles the app gets one resize to re-measure against the new
      // one: ordered, not fighting.
      const column = () => {
        const side = document.querySelector("[data-slot='sidebar']")
        let node = side
        while (node && node.parentElement && !node.parentElement.hasAttribute('data-tree-split')) node = node.parentElement
        return node && node.parentElement ? node : null
      }

      // Cmd+S / the mode button morph between pinned and floating: the column
      // and the main pane are captured and glide to their new boxes.
      const morph = fn => {
        const update = () => { fn(); layoutShelf(); homeApi.layout?.() }
        if (document.hidden || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return }
        const col = column()
        const split = col && col.parentElement
        const main = split && Array.from(split.children).filter(c => c !== col && c.getClientRects().length).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]
        if (col) col.style.viewTransitionName = 'atr-side'
        if (main) main.style.viewTransitionName = 'atr-main'
        const home = document.getElementById('atr-home')
        if (home) home.style.viewTransitionName = 'atr-home'
        root.dataset.atrMorph = '1'
        // The toggle must not wait on the animation: a view transition holds its callback until a
        // frame is presented, which can take seconds under load, and a second press then undoes the first.
        let ran = false
        const once = () => { if (!ran) { ran = true; update() } }
        const t = document.startViewTransition(once)
        setTimeout(once, 400)
        t.finished.finally(() => {
          if (col) col.style.viewTransitionName = ''
          if (main) main.style.viewTransitionName = ''
          if (home) home.style.viewTransitionName = ''
          delete root.dataset.atrMorph
          window.dispatchEvent(new Event('atr-morph-end'))
        })
      }

      const setArc = value => {
        arc = value
        try { localStorage.setItem(ARC_KEY, value ? '1' : '0') } catch {}
        setOpen(false, true)
        sync()
      }
      const setOpen = (value, instant) => {
        clearTimeout(closeTimer)
        if (open === value) return
        open = value
        if (value) root.dataset.atrArcOpen = '1'
        else delete root.dataset.atrArcOpen
        if (instant) {
          const col = column()
          const els = [col].filter(Boolean)
          els.forEach(el => { el.style.transition = 'none' })
          requestAnimationFrame(() => els.forEach(el => { el.style.transition = '' }))
        }
      }

      const sync = () => {
        if (!alive()) return
        // Native narrow overlays own their own lifecycle. Do not interpret
        // their dismissal as a desktop pin/float toggle and reopen them.
        if (window.innerWidth < 640) {
          clearTimeout(closeTimer)
          modeBtn.style.display = 'none'
          hot.style.display = 'none'
          delete root.dataset.atrArc
          delete root.dataset.atrArcOpen
          document.querySelectorAll('[data-atr-arc-col]').forEach(el => { delete el.dataset.atrArcCol })
          return
        }
        syncChromeControls()
        const side = document.querySelector("[data-slot='sidebar']")
        if (!side) {
          // the app collapsed it (button, shortcut, or our own first run):
          // that is a toggle of the sidebar, then the tree comes back
          if (Date.now() > autoUntil) {
            const btn = toggleBtn()
            if (btn && /^show sidebar/i.test(btn.getAttribute('aria-label') || '')) {
              arc = !arc || !root.dataset.atrArcSeen ? true : !arc
              try { localStorage.setItem(ARC_KEY, arc ? '1' : '0') } catch {}
              setOpen(false, true)
              press(btn)
            }
          }
          return
        }
        if (root.dataset.atrArcSeen !== '1') root.dataset.atrArcSeen = '1'
        const col = column()
        document.querySelectorAll('[data-atr-arc-col]').forEach(el => { if (el !== col) delete el.dataset.atrArcCol })
        if (col && !col.dataset.atrArcCol) col.dataset.atrArcCol = '1'
        if (col && modeBtn.parentElement !== col) col.appendChild(modeBtn)
        if (arc) { if (root.dataset.atrArc !== '1') root.dataset.atrArc = '1' }
        else if (root.dataset.atrArc) delete root.dataset.atrArc
        if (modeBtn.dataset.arc !== String(arc)) { modeBtn.dataset.arc = String(arc); paintMode() }

        if (!root.dataset.atrArcReady) root.dataset.atrArcReady = '1'
        // the floating card's inner x, so the fixed layers above can sit on it
        const content = side.querySelector("[data-slot='sidebar-content']")
        if (content) {
          const padX = parseFloat(getComputedStyle(content).paddingLeft) || 10
          const x = Math.round(10 + padX)
          const w = Math.round(272 - 2 * padX)
          if (root.style.getPropertyValue('--atr-rail-x') !== x + 'px') root.style.setProperty('--atr-rail-x', x + 'px')
          if (root.style.getPropertyValue('--atr-rail-w') !== w + 'px') root.style.setProperty('--atr-rail-w', w + 'px')
        }
      }
      let queued = false
      const schedule = () => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => { queued = false; sync() })
      }
      const railObs = new MutationObserver(records => {
        if (records.some(({ target }) => !target.closest?.("[data-slot='aui_thread-content']"))) schedule()
      })
      // The wrapper also owns the transcript. Its content must not wake the
      // sidebar measurement, but the wrapper still sees sidebar remounts.
      const attachRailObs = () => {
        railObs.disconnect()
        railObs.observe(document.querySelector("[data-slot='sidebar-wrapper']") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'data-state', 'hidden'] })
      }
      attachRailObs()
      rescanHooks.push(() => { attachRailObs(); schedule() })
      window.addEventListener('resize', schedule)
      sync()

      // Cmd+S: hide / show the sidebar (pinned <-> sidebar)
      const onCmdS = event => {
        if (!alive()) return
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && (event.key === 's' || event.key === 'S')) {
          event.preventDefault()
          event.stopImmediatePropagation()
          if (!document.querySelector("[data-slot='sidebar']")) {
            const btn = toggleBtn()
            if (btn) press(btn)
            setArc(false)
            return
          }
          morph(() => setArc(!arc))
        }
      }
      window.addEventListener('keydown', onCmdS, true)

      // the app's toggle flips sidebar <-> pinned instead of unmounting the tree
      const onToggleClick = event => {
        if (!alive() || !event.isTrusted || window.innerWidth < 640) return
        const btn = event.target instanceof Element ? event.target.closest('button') : null
        if (!btn || !/^(show|hide) sidebar/i.test(btn.getAttribute('aria-label') || '')) return
        if (!document.querySelector("[data-slot='sidebar']")) return
        event.preventDefault()
        event.stopImmediatePropagation()
        morph(() => setArc(!arc))
      }
      window.addEventListener('click', onToggleClick, true)

      // reveal / tuck away
      hot.addEventListener('mouseenter', () => { if (alive() && arc) setOpen(true) })
      const busy = () => Boolean(document.querySelector('[data-radix-popper-content-wrapper], [role=menu], [role=dialog][data-state=open]'))
      const onArcMove = event => {
        if (!alive() || !arc || !open) return
        const limit = 10 + 272 + 6
        if (event.clientX <= limit) { clearTimeout(closeTimer); closeTimer = 0; return }
        if (closeTimer || busy()) return
        closeTimer = setTimeout(() => { closeTimer = 0; if (!busy()) setOpen(false) }, 40)
      }
      document.addEventListener('mousemove', onArcMove, { passive: true })
      const onArcLeave = () => {
        if (!alive() || !arc || !open || busy()) return
        clearTimeout(closeTimer)
        closeTimer = setTimeout(() => { closeTimer = 0; setOpen(false) }, 60)
      }
      document.documentElement.addEventListener('mouseleave', onArcLeave)
      const onArcEsc = event => {
        if (alive() && arc && open && event.key === 'Escape' && !busy()) setOpen(false)
      }
      window.addEventListener('keydown', onArcEsc)

      ctx.onDispose?.(() => {
        railDead = true
        railObs.disconnect()
        window.removeEventListener('resize', schedule)
        window.removeEventListener('keydown', onCmdS, true)
        window.removeEventListener('click', onToggleClick, true)
        document.removeEventListener('mousemove', onArcMove)
        document.documentElement.removeEventListener('mouseleave', onArcLeave)
        window.removeEventListener('keydown', onArcEsc)
        clearTimeout(closeTimer)
        try { chromeUnsub?.() } catch {}
        hot.remove(); modeBtn.remove()
        for (const k of ['atrArc', 'atrArcOpen', 'atrArcReady', 'atrArcSeen', 'atrMorph']) delete root.dataset[k]
        document.querySelectorAll('[data-atr-arc-col]').forEach(el => { delete el.dataset.atrArcCol })
      })
    } catch (err) {
      console.error('[atr-rail] failed: ' + (err && err.stack || err))
    }

    // A plugin is a guest: leave the host as we found it when it unloads.
    ctx.onDispose?.(() => {
      atrDisposed = true
      themeObs?.disconnect()
      stopPreviewMeasure?.()
      clearInterval(configTimer)
      clearInterval(flareTimer)
      clearInterval(dockTimer)
      iconStyle?.remove()
      if (typeof document !== 'undefined') { document.removeEventListener('pointerdown', onRowPointerDown, true); endPinDrag(); undock(); dock.ro?.disconnect(); dock.popObs?.disconnect(); document.querySelectorAll(`[${DOCK_POP_ATTR}]`).forEach(el => el.removeAttribute(DOCK_POP_ATTR)); document.getElementById('atr-statusdock-tab')?.remove(); dock.head?.remove(); dock.style?.remove(); document.getElementById('atr-snippet-style')?.remove(); document.getElementById('atr-motion-style')?.remove(); closePreview(); unlib(); lib.el?.remove(); SHELF_SLOTS.forEach(sl => shelfEls[sl]?.remove()); shelf$.ro?.disconnect(); try { pinsUnsub?.() } catch {}; document.documentElement.removeAttribute('data-atr-dragging') }
      clearInterval(liveTimer)
      colObs?.disconnect()
      if (typeof document !== 'undefined') unfitColumn()
      flareStyle?.remove()
      document.querySelector?.(`[${STACK_FLARE_ATTR}]`)?.removeAttribute(STACK_FLARE_ATTR)
      clearSheet()
      try { panelUnsub?.() } catch {}
      document.getElementById('atr-reply-ground')?.remove()
      pictureReady = () => {}
      setAccentOverride(null)
      unpinWordmark()
      if (typeof window !== 'undefined') window.removeEventListener?.('resize', onResize)
      if (workThrottle) clearTimeout(workThrottle)
      if (workFrame !== null) cancelAnimationFrame?.(workFrame)
      dirtyTurns.clear()
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.removeProperty('--atr-sun')
        if (document.documentElement.dataset) {
          delete document.documentElement.dataset.atrMargins
          delete document.documentElement.dataset.atrCollapseWork
          delete document.documentElement.dataset.atrMotion
        }
        document.querySelectorAll?.('.atr-work-summary').forEach(el => el.remove?.())
        document.querySelectorAll?.('[data-atr-work-collapsed]').forEach(el => el.removeAttribute?.('data-atr-work-collapsed'))
        document.querySelectorAll?.('[data-atr-work-interim]').forEach(el => el.removeAttribute?.('data-atr-work-interim'))
        document.removeEventListener?.('click', onDocClick, true)
        document.removeEventListener?.('scroll', onAnyScroll, { capture: true })
        if (scrollIdleTimer) clearTimeout(scrollIdleTimer)
        scrollIdleTimer = 0
        document.documentElement?.removeAttribute?.('data-atr-scrolling')
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener?.('popstate', onNavChange)
        window.removeEventListener?.('hashchange', onNavChange)
      }
      if (chatObserver) chatObserver.disconnect()
    })

  }
}
