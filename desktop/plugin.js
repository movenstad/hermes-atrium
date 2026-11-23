/**
 * Hermes Atrium — a better UI for Hermes Agent, over a painting of your own.
 *
 * Loaded as a RUNTIME plugin from <HERMES_HOME>/desktop-plugins/hermes-atrium/plugin.js:
 * plain ESM, imports rewritten to the app's SDK/react shims, registered through
 * the same contribution areas the built-in UI uses. Nothing here forks the app,
 * so an update cannot revert it.
 *
 * Four looks, one editor: **Gruvbox** is a preset (the shipped painting, palette
 * and opacities) and **Custom 1**, **Custom 2** and **Custom 3** are three
 * independent records of the same knobs, kept as you leave them, each optionally
 * driven by its own hermes-atrium-theme*.json. The three Custom slots are also
 * born as designed looks of their own (Watersky, Goldensky, Nightsky, see
 * LOOK_PRESETS), so a fresh install has four finished appearances rather than
 * one and three blank ones. There is no weather, no feed and
 * no network access of any kind: nothing leaves the computer, ever.
 *
 * Each feature rides the cheapest existing mechanism:
 *   appearance        -> contributed themes (one stable "Hermes Atrium" entry whose
 *                        colours follow the chosen look) + CSS over the app
 *   reply panels      -> five live dials that solve a panel tone against the
 *                        picture behind the reading column (§2)
 *   snippet cards     -> a `::snippet{...}` transcript directive (copy)
 *   calmer chat       -> CSS over the app's own surfaces
 *
 * CONTENTS (search for the tag, e.g. "══ §5"):
 *   §1  SETUP, SKIN, PAINTING & MATERIALS
 *   §2  REPLY PANELS (tone solver)
 *   §3  SIDEBAR SWITCH HOOKS
 *   §4  APP CSS (sheetCss: layout, glass material, every surface)
 *   §5  APP MOTION (always-on interface animation)
 *   §6  PAINTING, THEMES & ACCENT
 *   §7  SNIPPET CARDS & LOOK CHIP
 *   §8  PLUGIN REGISTRATION (register: settings, timers, observers)
 */

import { atom, Button, Codicon, host, requestTheme, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, setAccentOverride, ToggleRow, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

// ══ §1 SETUP, SKIN, PAINTING & MATERIALS ═══════════════════════════════════

const THEMES_AREA = 'themes'
const DIRECTIVE_AREA = 'transcript.directives'

// Stored key strings are permanent: users have data under them. Each look has
// its own record, so every look keeps an independent picture and palette.
// `skin`/`skinImage` are Custom 1's, and they can never move: they are the keys
// the first Custom preset has always written. Custom 2 and 3 are numbered.
const STORE_KEYS = { auto: 'auto', tint: 'tint', sky: 'sky', chrome: 'chrome', replyGround: 'replyGround', panel: 'panel', look: 'look', margins: 'margins', motion: 'motion', skin: 'skin', skinImage: 'skinImage', skin2: 'skin2', skinImage2: 'skinImage2', skin3: 'skin3', skinImage3: 'skinImage3', gruvboxSkin: 'gruvboxSkin', gruvboxSkinImage: 'gruvboxSkinImage' }

// Keys earlier builds stored and nothing reads any more. They are removed at
// load because the app and every plugin share one local store of about 10 MB,
// and Hermes saves its open tabs and pane layout there. Its writes fail
// silently when the store is full, so a full store means a relaunch forgets
// which sessions were open. The old ids are the names this plugin published
// before (see LEGACY_THEMES); their records held whole pictures as data URLs,
// several megabytes that no build reads. Only keys these builds are known to
// have written are removed, never a whole prefix, so a different plugin that
// happens to share an old id keeps its data.
const RETIRED_KEYS = ['pins', 'collapseWork', 'statusDock', 'statusDockOpen', 'statusPin', 'shelf', 'library', 'libraryOpen', 'home', 'homeCard', 'recents', 'liveStarts', 'turnTimes', 'glassBackdrop', 'gruvboxTint']
const LEGACY_STORE_IDS = ['atrium', 'zephyr']
const LEGACY_STORE_KEYS = [...Object.values(STORE_KEYS), ...RETIRED_KEYS, 'away', 'hermesTheme', 'aurora', 'glSky', 'liveWeather', 'lookWeather', 'phasePin', 'previewPanels', 'quality', 'skyPhase', 'solar', 'weather']

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
// Resolved at startup from wherever the plugin is installed (assets/ in a
// clone, or next to plugin.js); see resolvePluginFiles.
let PAINTING_URL = 'data:,'
const PAINTING_FILE = 'backwater.jpg'

// The one colour that is not a skin value: gruvbox's red, kept for destructive
// actions so a delete button reads as a warning in either look. Everything
// else a surface paints now comes from SKIN_DEFAULTS, which is why the old
// palette table (gruvbox.vim's `s:gb`) is gone: it was a second source of truth
// for colours the skin already names, and a Custom look could not reach it.
const DESTRUCTIVE = '#fb4934'

// ── The skin, as data ───────────────────────────────────────────────────────
// ONE set of knobs for every look. A look is a named preset of this data: the
// values below are what Gruvbox ships, and each Custom look starts from the same
// place and keeps whatever you change. There is no second material and no
// desktop tint, so a control that exists for one look exists for all of them.
const SKIN_DEFAULTS = {
  image: PAINTING_URL,
  fit: 'cover',
  posX: 46,
  posY: 45,
  scrim: 0.31,
  // No blur and no sidebar wash by default. A still picture gains nothing from
  // being blurred behind the reading column, and the blur was a full-window
  // compositor pass on every scroll. The sidebar's zero is the same idea for
  // the rail: the gaps between the cards show the picture at full strength,
  // which is what makes the cards float.
  blur: 0,
  saturate: 1.3,
  brightness: 0.90,
  chrome: 0.74,
  sidebar: 0,
  card: 0.78,
  bubble: 0.78,
  // Page panes (a plugin route, the Bots roster, a preview) paint no ground of
  // their own, so the sheet gives them this one. 0.86 is the same weight the
  // app's own full-page views wear, which is why a plugin page and Artifacts
  // read as one window rather than two materials.
  //
  // The value is eyedropper honest: the shipped painting's brightest pixel
  // under the main pane is rgb(201,200,182), and a 0.86 fill still lands the
  // faintest ink tier at 4.46:1 there (4.83:1 over 90% of the pane). Below
  // about 0.90 it is a panel you can see the painting through; above about
  // 0.94 it is a slab. It starts at the tier the host itself uses.
  page: 0.86,
  ground: '#16261e',
  deeper: '#0c1612',
  cardTint: '#1d3328',
  bubbleTint: '#2b4636',
  edge: '#4f7360',
  accent: '#fe8019',
  ink: '#fbf1c7',
  ink2: '#ebdbb2',
  // The prose and label colours were hard-coded gruvbox tokens, which meant a
  // Custom picture still got gruvbox's blue links and purple code. They are
  // skin values now, so every look can be palette-complete.
  //
  // ink3 and ink4 are the two faintest text tiers, and they are named rather
  // than derived: deriving them from ink2 and quiet produced colours a shade
  // off gruvbox's own fg2 and fg4, which repainted every section label and
  // timestamp in the shipped look. A palette that names them can reproduce
  // that look and a Custom one can change them.
  quiet: '#bdae93',
  ink3: '#d5c4a1',
  ink4: '#a89984',
  link: '#83a598',
  code: '#d3869b',
  quote: '#8ec07c'
}
const SKIN_SLIDERS = [
  ['scrim', 'Picture scrim', 0, 0.9, 0.01],
  ['blur', 'Glass blur (px)', 0, 40, 1],
  ['saturate', 'Glass saturation', 0.5, 2, 0.05],
  ['brightness', 'Glass brightness', 0.5, 1.1, 0.01],
  ['chrome', 'Chat pane opacity', 0.4, 1, 0.01],
  // Sidebar opacity starts at zero, and zero means clear: the rail behind the
  // cards is transparent and the gaps show the picture. The range is 0..1 and
  // the wash is `sidebar * 0.5`, so the old 0.74 position is still reachable at
  // 0.74 and now reads as the 0.37 wash it always painted. It used to start at
  // 0.4 with the floor remapped to clear, which meant the number under the
  // slider was never the number it used, and zero was not selectable at all.
  ['sidebar', 'Sidebar opacity', 0, 1, 0.01],
  ['card', 'Card opacity', 0.4, 1, 0.01],
  ['bubble', 'Your message opacity', 0.4, 1, 0.01],
  // The floor is 0.5 rather than 0: a page carries dense small type with no
  // reply panel solving a tone for it, so a clear page would put labels
  // straight back on the picture, which is the bug this surface exists to fix.
  // 1 is a solid sheet for anyone who wants the pages opaque.
  ['page', 'Page opacity', 0.5, 1, 0.01]
]
const SKIN_COLORS = [
  ['ground', 'Chat ground'],
  ['deeper', 'Sidebar ground'],
  ['cardTint', 'Card'],
  ['bubbleTint', 'Your messages'],
  ['edge', 'Edges'],
  ['accent', 'Accent'],
  ['ink', 'Text'],
  ['ink2', 'Quiet text'],
  ['ink3', 'Faint text'],
  ['quiet', 'Labels'],
  ['ink4', 'Faintest text'],
  ['link', 'Links'],
  ['code', 'Inline code'],
  ['quote', 'Quotes']
]
let SKIN = { ...SKIN_DEFAULTS }

// ── The looks ──────────────────────────────────────────────────────────────
// One list, read by the settings gallery, the status chip, the sheet header and
// the editable files. Gruvbox is the shipped preset; each Custom look is a
// record of the same knobs. `custom` keeps the id, the stored keys and the file
// name the first Custom preset has always had, so an install that upgrades keeps
// its picture and palette without a migration.
const LOOK_IDS = ['gruvbox', 'custom', 'custom2', 'custom3']
const CUSTOM_LOOKS = LOOK_IDS.filter(id => id !== 'gruvbox')
const LOOK_LABELS = { gruvbox: 'Gruvbox', custom: 'Custom 1', custom2: 'Custom 2', custom3: 'Custom 3' }
const lookLabel = id => LOOK_LABELS[id] || LOOK_LABELS.custom
const isCustomLook = id => id !== 'gruvbox'

// ── What a Custom slot is born as ───────────────────────────────────────────
// Each Custom slot starts as a designed look instead of a copy of Gruvbox, and
// stays an ordinary editable record: this table is only the seed a slot is born
// with, and anything you change is stored and wins from then on. A slot that
// already has a record is never touched, so an upgrade keeps the picture and
// palette it had.
//
// The pictures are referenced as `assets/<file>`, a marker resolvePluginFiles
// turns into a file URL once it has found the folder. Two reasons for the
// indirection: the records are built before the desktop bridge has answered, so
// an absolute path cannot exist yet, and a clone that ships plugin.js without
// these pictures then falls back to the shipped painting instead of painting
// nothing.
//
// The palettes are measured rather than picked by eye, against each picture's
// own pixels, through the same compositing the reply-panel solver runs. At the
// shipped panel dials, ink on the solved reply panel reaches 9.4:1 on Watersky,
// 12.3:1 on Goldensky and 9.7:1 on Nightsky, and no faint tier is quieter than
// Gruvbox's own on the chrome ground (the closest is Goldensky's faintest at
// 3.70:1 against Gruvbox's 3.66:1). `npm --prefix dev run measure` reproduces
// every one of those numbers and fails the run if a change drops below them, so
// treat this comment as the summary and that script as the source.
//
// The scrims are heavier than Gruvbox's 0.31 because two of these pictures are
// bright: Watersky is a 190-250 luma wash of blue concrete, and behind the
// reading column it measures 110 luma before the scrim. Without the scrim the
// solved panel would be the only thing separating prose from its picture, and
// the sidebar cards would read as lit panels rather than glass. Blur stays at 0
// like every other look: a still picture gains nothing from a full-window
// compositor pass on every scroll.
const LOOK_PRESETS = {
  custom: {
    name: 'Watersky',
    description: 'Blue concrete, cool glass',
    skin: {
      image: 'assets/watersky.jpg', fit: 'cover', posX: 50, posY: 46,
      scrim: 0.34, chrome: 0.86, card: 0.90, bubble: 0.82, page: 0.92,
      ground: '#1b3350', deeper: '#0a182e', cardTint: '#24445f', bubbleTint: '#2e567a',
      edge: '#5480a8', accent: '#7fc6fa',
      ink: '#f6fbff', ink2: '#dbe8f6', ink3: '#c4d6e9', quiet: '#a9bed4', ink4: '#8ea4bb',
      link: '#96d2f9', code: '#f6cc9e', quote: '#9ee3d8'
    }
  },
  custom2: {
    name: 'Goldensky',
    description: 'Dusk clouds, warm glass',
    skin: {
      image: 'assets/goldensky.jpg', fit: 'cover', posX: 50, posY: 50,
      scrim: 0.26, chrome: 0.78, card: 0.82, bubble: 0.78, page: 0.87,
      ground: '#2e2022', deeper: '#150d0f', cardTint: '#3e2d2e', bubbleTint: '#4e3737',
      edge: '#75564f', accent: '#eeae8a',
      ink: '#faf1ea', ink2: '#e9d8cd', ink3: '#d6c0b3', quiet: '#c4aa9c', ink4: '#aa968c',
      link: '#c3b6dd', code: '#eabf92', quote: '#d2b0cb'
    }
  },
  custom3: {
    name: 'Nightsky',
    description: 'Starfield, indigo glass',
    skin: {
      image: 'assets/nightsky.jpg', fit: 'cover', posX: 50, posY: 32,
      scrim: 0.24, chrome: 0.78, card: 0.82, bubble: 0.78, page: 0.88,
      ground: '#211d3d', deeper: '#0b0a1c', cardTint: '#2c274e', bubbleTint: '#3a3363',
      edge: '#585086', accent: '#f4d08a',
      ink: '#f0edff', ink2: '#d6d0f0', ink3: '#bdb5dd', quiet: '#c0b8db', ink4: '#a49cc0',
      link: '#b0c8fb', code: '#eeaff0', quote: '#93e0d3'
    }
  }
}
// The record a slot starts from: the shipped knobs, then whatever its preset
// names. Spelled out in one place so readLookSkin, resetSkin and the previous
// record all agree on what "before you touched it" means.
const presetSkin = which => ({ ...SKIN_DEFAULTS, ...(LOOK_PRESETS[which]?.skin || {}) })

// Whether a stored Custom record holds nothing but the shipped Gruvbox defaults,
// which is what the previous build wrote the first time any knob moved. Only the
// knobs are judged: `image` lives under its own per-look key, so a picture the
// user chose is not part of this record and cannot be mistaken for an edit here.
// A record whose only difference is the previous build's resolved path for our
// own painting therefore still counts as untouched, and readLookSkin puts the
// preset's picture back.
const isShippedDefaults = record => Object.keys(SKIN_DEFAULTS).every(key => {
  if (key === 'image') return true
  const a = record[key], b = SKIN_DEFAULTS[key]
  if (a === undefined) return true
  if (typeof b === 'number') return Number(a) === b
  return String(a) === String(b)
})

// A picture that names a file in the plugin's own assets/ is resolved here, at
// paint time, from whatever the folder scan found. Anything else (an upload, a
// path, a URL) passes through untouched, which is why this is a prefix test and
// not a general path resolver. An unresolved marker returns '' so the caller
// falls back (to the shipped painting, or to a tile's gradient) rather than
// handing the marker string to CSS as if it were a url.
const ASSET_IMAGES = {}   // lower-case file name -> file URL
const assetImage = image => {
  const s = String(image || '')
  const hit = /^assets[\\/]([^\\/]+)$/i.exec(s)
  if (!hit) return s
  return ASSET_IMAGES[hit[1].toLowerCase()] || ''
}
// What is actually painted: the skin's image, with an unloaded or unresolved
// picture falling back to the painting the folder scan found.
const skinImage = () => assetImage(SKIN.image) || PAINTING_URL

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
// A darker/lighter variant of a skin colour, for the quiet tiers the skin does
// not name itself. Ordinary colour maths, no palette knowledge.
const hexFade = (hex, toward, t) => '#' + mixHex(hex, toward, t).map(v => v.toString(16).padStart(2, '0')).join('')
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

// The skin, as the host theme's tokens (menus, dialogs, inputs). ONE set for
// every look, because every look reads the same skin: Gruvbox is only the name
// of the preset the skin starts from. Deriving these from SKIN is also what
// makes a Custom palette reach the app's own menus, which used to stay gruvbox
// green under any picture.
//
// `sidebarBackground` is transparent on purpose, and `upstream` set it that way
// for the floating sidebar: the rail behind the cards must show the picture at
// full strength, or the gaps between the cards match their own tone and the
// column reads as one slab. The cards paint themselves from the skin.
const skinGrounds = () => {
  const a = (hex, alpha) => `rgba(${hexTriple(hex)}, ${alpha})`
  return {
    background: a(SKIN.ground, 0.88), foreground: SKIN.ink,
    card: a(SKIN.cardTint, 0.96), cardForeground: SKIN.ink,
    muted: a(SKIN.cardTint, 0.80), mutedForeground: SKIN.quiet,
    popover: a(SKIN.deeper, 0.98), popoverForeground: SKIN.ink,
    primary: SKIN.accent, primaryForeground: SKIN.deeper,
    secondary: a(SKIN.cardTint, 0.90), secondaryForeground: SKIN.ink2,
    accent: SKIN.accent, accentForeground: SKIN.deeper,
    border: SKIN.edge, input: a(SKIN.cardTint, 0.95),
    ring: SKIN.accent, destructive: DESTRUCTIVE, destructiveForeground: SKIN.deeper,
    sidebarBackground: 'transparent', sidebarBorder: SKIN.edge,
    userBubble: a(SKIN.bubbleTint, 0.95), userBubbleBorder: SKIN.edge
  }
}

// The pane material comes from the skin's ground and bubble tints, so every
// Atrium surface (sidebar cards, snippet cards, composer) is one material.
// The ink ramp follows the skin's own two ink levels.
const skinMaterial = () => ({
  tint: hexRgb(SKIN.ground),
  tintHi: hexRgb(SKIN.bubbleTint),
  // Four tiers, and every one of them is a named skin value, so a Custom
  // palette can set its own ramp and the shipped gruvbox one is reproduced
  // exactly. The shape is [text, quiet, faint, quiet]: the shipped look put
  // fg2 in the faint tier and fg1 again in the last, and `ink2` in the fourth
  // slot is what the theme file's readme has always meant by "quiet text".
  ink: [hexRgb(SKIN.ink), hexRgb(SKIN.ink2), hexRgb(SKIN.ink3), hexRgb(SKIN.ink2)],
  night: 0.2,
  accent: SKIN.accent
})

// The painting as the ground. The scrim is what makes the glass tinted rather
// than clear: it drops the picture's peak brightness so the panels above it can
// stay translucent without letting a highlight sit under a line of prose.
const pictureLayers = () => {
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
    // The artwork itself, inline. It used to ride a custom property (--atr-pic)
    // so that a swap touched one small <style> instead of re-emitting this
    // sheet. That reason died with the sky: the sheet is now rebuilt whenever a
    // look changes, which is exactly when a picture changes too.
    //
    // Inline is also the only thing that works. Chromium refuses to store a
    // custom property whose value exceeds 2 MiB, and it does so silently: the
    // declaration is dropped, var() falls through to its fallback, and the
    // shipped painting is what you see. Two of the pictures in use (a 2.3 MB
    // PNG and a 3.4 MB JPEG) sat over that line and could never be applied,
    // while every smaller one worked. background-image has no such limit.
    `    url("${String(skinImage()).replace(/"/g, '%22')}");`,
    `  background-size: 160px 160px, cover, cover, ${SKIN.fit === 'contain' ? 'contain' : 'cover'};`,
    `  background-position: 0 0, center, center, ${skinNumber(SKIN.posX, 46)}% ${skinNumber(SKIN.posY, 45)}%;`,
    '  background-repeat: repeat, no-repeat, no-repeat, no-repeat;',
    `  background-color: ${SKIN.deeper};`,
    '}',
    'body::before { content: none; }'
  ]
}

// A picture change invalidates the cached sample grid the reply-panel solver
// reads, and the sheet that paints the background. There is no longer a
// separate style element for the picture: it is part of the sheet itself, so a
// multi-megabyte data URL lives in exactly one place.
const ensurePictureStyle = () => {
  pictureRevision += 1
  document.getElementById('atr-picture')?.remove()
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
  if (!source || source.url !== skinImage() || source.failed) return [[0, 0, 0], [255, 255, 255]]
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
// matte material the sidebar cards wear. The pane tabs (Sessions / Bots) are NOT
// these; they keep their own look.
const SESSION_TAB_CSS = [
  // Top tabs: soft pills, sentence case, no rules between them. The active tab
  // is a flat matte block of the same material as the cards; the rest stay
  // quiet until hovered.
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) {",
  '  position: relative;',
  '  height: 26px !important; min-height: 26px !important; margin: 4px 1px 0 !important;',
  '  padding-inline: 4px 6px !important;',
  '  border: 0 !important; border-radius: 8px !important;',
  '  background: transparent !important; box-shadow: none !important;',
  "  color: var(--atr-ink-2, #ebdbb2) !important; opacity: 0.78;",
  '  transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease, opacity 140ms ease;',
  '}',
  // An UNSELECTED session tab still wears a fill, so its label never sits on
  // the painting. Measured on the shipped picture, an idle tab's label landed
  // at 3.0:1 against its lightest patch and only 0.56 luma of ink, because the
  // tab had no ground AND was dimmed to 0.78 opacity; the two together are what
  // made a row of session names read as ghosts.
  //
  // It is the thinner end of the ladder on purpose: idle 48%, hover 68%,
  // active opaque.
  //
  // Alpha alone cannot carry this distinction, and that is worth writing down.
  // The tint and the painting are both very dark, so over a dark patch
  // `tint 58%` and `tint 32%` land within 0.001 luma of each other: fewer
  // percent of "almost the same colour" is still almost the same colour. The
  // separation therefore comes from the ACTIVE tab being lifted toward the ink
  // (see the aria-selected rule), not from thinning this one. Thinning still
  // matters on a light patch, where it is plainly visible, which is why the
  // number moved too.
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *):not([aria-selected='true']) {",
  '  opacity: 1;',
  '  color: var(--atr-ink-1, #ebdbb2) !important;',
  '  background: color-mix(in srgb, var(--atr-tint, #16261e) 48%, transparent) !important;',
  '  box-shadow: inset 0 0 0 1px var(--atr-edge) !important;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *):not([aria-selected='true']):hover {",
  '  color: var(--atr-ink-0, #fbf1c7) !important;',
  '  background: color-mix(in srgb, var(--atr-tint, #16261e) 68%, transparent) !important;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *)::before { display: none !important; }",
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) .uppercase {",
  '  text-transform: none !important; letter-spacing: 0 !important;',
  '  font-size: 12px !important; font-weight: 500 !important;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *):is(:hover, [aria-selected='true']) { opacity: 1; }",
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *):hover {",
  '  color: var(--atr-ink-1, #ebdbb2) !important;',
  '  background: rgba(var(--atr-hi), 0.06) !important;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *)[aria-selected='true'] {",
  '  color: var(--atr-ink-0, #fbf1c7) !important;',
  // The active tab is the one surface in this row that must never be confused
  // for the picture, so its fill is lifted strongly toward the ink: 28%, not
  // the 10% it used to carry.
  //
  // 10% put it at 0.0318 luma. The painting under the tab row runs up to 0.045
  // on its lighter patches, so the active tab was landing within 1.01:1 of the
  // bare picture there — indistinguishable from no tab at all, which is exactly
  // what made "which one is selected" hard to answer. 28% puts it at 0.0990,
  // clear of every patch the row covers, and a solid step above the idle fill.
  //
  // This is also why thinning the idle tabs cannot do this job on its own: the
  // tint and the painting are both dark, so fewer percent of the tint is still
  // dark. The active tab has to be genuinely lighter, not the others darker.
  '  background: color-mix(in srgb, var(--atr-m-solid, rgb(17, 18, 24)) 72%, rgb(var(--atr-hi, 255, 255, 255))) !important;',
  '  box-shadow: inset 0 0 0 1px color-mix(in srgb, rgb(var(--atr-hi, 251, 241, 199)) 22%, transparent) !important;',
  '}',
  // ── The fixed titlebar tools ───────────────────────────────────────────
  // Settings, layout, HUD and the two pane toggles are `fixed z-70` and paint no
  // ground of their own. Over the shipped painting their ink measured 1.19:1
  // against the patch underneath, so they were invisible wherever the picture
  // happened to be dark. Stock Hermes has them on a flat titlebar, which is why
  // they always read there.
  //
  // The look to match is the STOCK one: plain icons on a ground, no chip, no
  // pill. So rather than boxing the group, lift the band they sit on and give
  // the glyphs a floor. `html.dark body::after` already paints a 54px scrim down
  // the top of the window, but it is `z-index: 40` and this cluster is `z-70`,
  // so the scrim passes *under* them and does them no good. This rule lifts just
  // the titlebar row's share of it to the cluster's layer, which is the smallest
  // change that makes the band behave like a stock titlebar.
  //
  // `:has(> :is(button, a))` keeps the backdrop off an empty cluster: a
  // contributed page can park a slot here with nothing in it, and a flat band
  // over an empty row would read as a stray stripe.
  //
  // Painted as a background on the cluster itself, not as an ::before with
  // `z-index: -1`: the cluster is `position: fixed`, so a negative-z pseudo
  // element paints BEHIND the whole stacking context and lands under the
  // picture instead of over it (measured: 1.01:1, i.e. no band at all). A
  // background on the element is always above what is behind it.
  //
  // The box is exactly the buttons, so nothing here can push the cluster into
  // the native window controls: the app reserves `count * 24px` and the layout
  // box is unchanged by a background.
  "html.dark [data-titlebar-cluster='right']:has(> :is(button, a)) {",
  `  background: rgba(${hexTriple(SKIN.deeper)}, 0.34);`,
  '  border-radius: 10px;',
  '}',
  // The icons are `text-muted-foreground/85` on the app's token chain, which
  // Atrium has already pointed at its ink ramp; the /85 alpha is what pushed
  // them under the floor. Full ink, as stock draws them.
  "[data-titlebar-cluster='right'] > :is(button, a) {",
  '  color: var(--atr-ink-1, #ebdbb2) !important;',
  '}',
  "[data-titlebar-cluster='right'] > :is(button, a):hover {",
  '  color: var(--atr-ink-0, #fbf1c7) !important;',
  '  background: rgba(var(--atr-hi), 0.10) !important;',
  '}',
  "[data-titlebar-cluster='right'] > :is(button, a) :is(svg, i, [class*='codicon']) {",
  '  opacity: 1 !important;',
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
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) button { border-radius: 5px !important; opacity: 0; transition: opacity 120ms ease, background-color 120ms ease; }",
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *):is(:hover, [aria-selected='true']) button { opacity: 0.7; }",
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) button:hover { opacity: 1; background: rgba(var(--atr-hi), 0.10) !important; }",
  // Wider tabs: the app caps them at 12rem and sizes them to the title. Give
  // every tab a generous fixed span (Chrome-style), shrinking only when crowded.
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) { flex: 0 1 220px !important; width: 220px !important; min-width: 120px !important; max-width: 260px !important; height: 28px !important; padding-inline: 10px 6px !important; }",
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) .truncate { flex: 1 1 auto !important; min-width: 0 !important; }",
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) button[aria-label='Close'] { width: 18px !important; height: 18px !important; margin-left: 6px !important; flex: none !important; align-self: center !important; }",
  // the app hides the close slot (opacity 0, no pointer) until hover; show it on the active tab too
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *):is(:hover, [aria-selected='true']) span:has(> button[aria-label='Close']) { opacity: 1 !important; pointer-events: auto !important; z-index: 2; }",
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) .pane-tab-content { padding-right: 22px !important; }",
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) span:has(> button[aria-label='Close']) { align-items: center !important; padding-right: 6px; }",
  "[role='tab'][data-tree-tab]:not([data-atr-strip] *) button[aria-label='Close'] .codicon { opacity: 1 !important; visibility: visible !important; font-size: 12px !important; color: var(--atr-ink-2, #ebdbb2) !important; }",
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
  `  --ui-text-tertiary: ${SKIN.quiet} !important;`,
  `  --ui-text-quaternary: ${SKIN.ink4} !important;`,
  '}',
  // `--atr-` is the app's namespace too: it ships its own --atr-ink-2, which is
  // rgb(33 3 25) — near-black. Every rule of ours that said
  // var(--atr-ink-2, #d5c4a1) got the app's value instead of the fallback, which
  // is why pane-tab labels and timestamps stayed invisible. Reclaim the ramp.
  'html:root {',
  `  --atr-ink-0: ${SKIN.ink} !important;`,
  `  --atr-ink-1: ${SKIN.ink2} !important;`,
  `  --atr-ink-2: ${SKIN.ink2} !important;`,
  `  --atr-ink-3: ${SKIN.ink3} !important;`,
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
  "[role='tab'][data-tree-tab] [class*='rounded-full'][class*='bg-'] { background: var(--atr-ink-2, #cdc4b4) !important; }",
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
  // The composer and your own messages wear the gruvbox glass, the material
  // every other surface wears (--atr-glass): a plain white wash over the
  // painting reads as a different, lighter thing than the cards beside it.
  ...[
    "html body div[data-slot='composer-surface'][data-slot][class] { background: linear-gradient(var(--atr-m-comp-a), var(--atr-m-comp-b)) !important; backdrop-filter: blur(18px) saturate(1.25) brightness(1.08) !important; box-shadow: inset 0 1px 0 rgba(var(--atr-hi), 0.07), inset 0 0 0 1px rgba(var(--atr-hi), 0.06), 0 10px 30px rgba(0, 0, 0, 0.22) !important; }",
    "html body :is(.composer-human-message, [class*='composer-human-message']):not(.composer-human-message-container) { background: linear-gradient(var(--atr-m-bub-a), var(--atr-m-bub-b)) !important; box-shadow: inset 0 1px 0 rgba(var(--atr-hi), 0.07), inset 0 0 0 1px rgba(var(--atr-hi), 0.06), 0 6px 20px rgba(0, 0, 0, 0.16) !important; border-color: transparent !important; }",
  ],
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
  // The soft-focus layer is opt-in. At blur 0 there is nothing to filter, and
  // emitting `blur(0px)` still asks the compositor for a full-window
  // backdrop-filter pass on every scroll, so the whole rule is skipped and only
  // the scrim remains. Any blur above 0 brings the filter back.
  ...(() => {
    const blur = skinNumber(SKIN.blur, 0)
    const scrim = `  background: radial-gradient(120% 90% at 50% 40%, rgba(${hexTriple(SKIN.deeper)}, ${(skinNumber(SKIN.scrim, 0.44) * 0.45).toFixed(3)}), rgba(${hexTriple(SKIN.deeper)}, ${(skinNumber(SKIN.scrim, 0.44) * 0.95).toFixed(3)}));`
    if (!(blur > 0)) return []
    return [
      "html[data-atr-chat='1']::after {",
      "  content: '';",
      '  position: fixed; left: 0; right: 0; top: 0; bottom: 0; z-index: -1;',
      '  pointer-events: none;',
      scrim,
      `  backdrop-filter: blur(${blur}px) saturate(${skinNumber(SKIN.saturate, 1.35)}) brightness(${skinNumber(SKIN.brightness, 0.84)});`,
      '}',
    ]
  })(),
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
  `  color: ${SKIN.link} !important;`,
  '  text-decoration: underline !important;',
  `  text-decoration-color: rgba(${hexTriple(SKIN.link)}, 0.55) !important;`,
  '}',
  // Constant
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) :is(code, kbd, samp) {",
  `  color: ${SKIN.code} !important;`,
  `  background: rgba(${hexTriple(SKIN.deeper)}, 0.78) !important;`,
  `  border: 1px solid ${SKIN.edge} !important;`,
  '}',
  // String / Special in blocks: the fence keeps bg0_hard, the border is bg2
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) pre {",
  `  background: rgba(${hexTriple(SKIN.deeper)}, 0.9) !important;`,
  `  border: 1px solid ${SKIN.edge} !important;`,
  `  color: ${SKIN.ink2} !important;`,
  '}',
  // PreProc
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) blockquote {",
  `  border-left: 2px solid ${SKIN.quote} !important;`,
  `  color: ${SKIN.ink3} !important;`,
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

// Read by sheetCss, which stays a pure function of the switches. The looks
// differ only in which preset the skin holds, so the sheet needs to know which
// one is on screen for its comment header and nothing else.
let LOOK_MODE = 'gruvbox'
const setLookMode = mode => { LOOK_MODE = LOOK_IDS.includes(mode) ? mode : 'gruvbox' }

// ══ §2 REPLY PANELS (tone solver) ═══════════════════════════════════════

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
    shell + " :is(.aui-md, pre, pre code, table, thead, tbody, tr, th, td, blockquote, [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-slot='tool-block']:not([data-tool-open])) {",
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
    shell + " :is([data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-slot='tool-block']:not([data-tool-open]), [data-slot*='actions'], [data-slot*='feedback'], time) {",
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

// Read only theme state, never the app's markup or individual messages. Hermes
// themes can supply dark ink too, so inactive Hermes Atrium appearance shares
// the same solver. What the reading column wears under a Hermes theme is read
// off a probe of the plugin's own, painted with the host's own text and
// chat-surface tokens over the page ground. The column is not measured: the
// picture is sampled over the centred reading width (pictureBackdrop's own
// fallback region), which is where a reply sits whether or not the margins
// are spacious.
const replyCssRgb = value => {
  if (SKIN_HEX.test(String(value).trim())) return hexRgb(String(value).trim())
  const numbers = String(value).match(/[\d.]+/g)?.map(Number)
  // Computed color-mix values may stay in color(srgb …) notation; treating
  // their 0..1 channels as bytes reverses the native-theme polarity decision.
  if (/^color\(srgb\s/i.test(String(value).trim()) && numbers?.length >= 3) return numbers.slice(0, 3).map(v => v * 255)
  return numbers?.length >= 3 ? numbers.slice(0, 3) : null
}
const REPLY_PROBE_ID = 'atr-reply-probe'
const replyHostGround = () => {
  const fallback = { ink: [255, 255, 255], tint: ZF_NIGHT, samples: [ZF_NIGHT], bounds: null }
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined' || !document.body) return fallback
  let probe = document.getElementById(REPLY_PROBE_ID)
  if (!probe) {
    probe = document.createElement('div')
    probe.id = REPLY_PROBE_ID
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position: fixed; left: -10px; top: 0; width: 1px; height: 1px; visibility: hidden; pointer-events: none;'
      + ' color: var(--ui-text-primary, CanvasText); background-color: var(--ui-chat-surface-background, transparent);'
    document.body.appendChild(probe)
  }
  const ink = replyCssRgb(getComputedStyle(probe).color) || fallback.ink
  let ground = document.documentElement.classList?.contains?.('dark') ? ZF_NIGHT : [255, 255, 255]
  for (const el of [document.documentElement, document.body, probe]) {
    const color = getComputedStyle(el).backgroundColor
    const rgb = replyCssRgb(color)
    const values = String(color).match(/[\d.]+/g)?.map(Number)
    if (rgb) ground = replyComposite(ground, rgb, values?.[3] ?? 1)
  }
  return { ink, tint: replyLuminance(ink) > 0.18 ? ZF_NIGHT : [250, 251, 253], samples: [ground], bounds: null }
}

// ══ §3 SIDEBAR SWITCH HOOKS ════════════════════════════════════════════════

// The sidebar's own strip: the zone header whose tablist holds the Sessions
// tab (markStrips). The workspace tab bar, Files and Terminal do not match it.
const STRIP_HOOK = '[data-atr-strip]'

// A strip of two or three tabs becomes a switch: SESSIONS | BOTS, plus Bots'
// own Scheduled jobs while it is open. data-atr-switch holds the count, which
// sizes the pill. A longer strip falls back to the app's own tabs.
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
const SIDEBAR_CSS = [
  // The host replaces the desktop rail with a native overlay below its narrow
  // breakpoint, and it must mask the transcript even when the theme
  // deliberately makes pinned sidebar surfaces transparent.
  "html:root body [data-narrow-overlay] { background: var(--atr-m-solid, var(--ui-bg-chrome)) !important; background-image: none !important; }",
]

// ── Which zones paint their own ground ─────────────────────────────────────
// A zone's container is cleared to transparent so the picture is the ground
// everywhere. Only some panes back that with a surface of their own:
//
//   chat       the reply panels grade the ink against the picture (§2)
//   sessions   the sidebar cards paint themselves
//   files      the right sidebar's aside carries a surface token
//   app pages  Artifacts, Messaging, Capabilities wear the chat token, which
//              the sheet already fills as a floating card
//   terminal   xterm paints its own canvas, and the pane's body does not even
//              live in the zone (it is a keep-alive host), so it is named by
//              pane id rather than looked for
//
// Everything else is a page that draws no ground: a plugin route (Security,
// Memory Wiki), the Bots roster, a preview of a file or a patch. Their
// headings, rows and code sat straight on the wallpaper and disappeared over a
// light passage. `data-atr-page` is how the sheet gives them one.
//
// Two gates, both load-bearing:
//   * a keep-alive pane host carries `data-tree-group` too, but it is a sibling
//     laid OVER the zone rather than the zone itself; a fill there would paint
//     glass over a neighbour. `data-pane-host` names it.
//   * a surface inside a HIDDEN pane does not paint. An inactive tab stays
//     mounted with `data-pane-hidden`, so the sessions column is still in the
//     DOM while Bots is fronted. Counting it left the Bots roster on the
//     wallpaper, which is exactly the bug this fixes.
const PAGE_GROUND_MARKS = [
  '[data-chat-surface]',
  "[data-slot='sidebar']",
  '[data-slot="aui_thread-content"]',
  'aside[class*="bg-(--ui-sidebar-surface-background)"]',
  'section[class*="bg-(--ui-chat-surface-background)"]:not([data-chat-surface])'
]
// Panes whose content paints its own surface, or whose zone must stay clear.
const PAGE_GROUND_PANES = new Set(['terminal'])
const marksPageGround = zone => {
  if (!zone?.querySelector || zone.hasAttribute('data-pane-host')) return false
  const active = zone.querySelector('[data-tree-tab][aria-selected="true"]')
  if (active && PAGE_GROUND_PANES.has(active.getAttribute('data-tree-tab'))) return false
  return !PAGE_GROUND_MARKS.some(sel => [...zone.querySelectorAll(sel)].some(el => !el.closest('[data-pane-hidden]')))
}
// The element the page fill goes on: the zone's own body box. The
// `[data-zone-body]` wrapper is `display: contents` (it exists to carry the
// zone's context menu), so the fill belongs on the first element inside it,
// which is the flex body the pane renders into. Marking that element rather
// than writing a selector for it keeps the fill off the keep-alive anchors,
// which are absolutely positioned children of the same box.
const pageBodyOf = zone => zone?.querySelector?.('[data-zone-body]')?.firstElementChild || null

// `backdrop` paints the ground the app sits on (the painting or your picture);
// `chrome` paints Atrium's own panels, type and controls. They are separate
// switches in Settings, so a plain Hermes chrome can keep the picture, and the
// glass can stay without a backdrop behind it.
//
// Each look is the same skin: one set of colours and opacities, kept in a record
// per look. Nothing here reads the clock or anything live, and nothing here
// branches on which look is on screen except the comment at the top.
const sheetCss = (date, gl = false, { backdrop = true, chrome = true, split = false } = {}) => {
  // There is no day/night split any more: the look is one palette.
  const isNight = false
  // Panels are the skin's own opacities; there is no light level to follow.
  const zf = skinMaterial()
  // How much weight the pane material carries over a picture. A constant of the
  // look, not of the clock.
  const NIGHT = zf.night
  // The reading pane and the cards hold the picture back differently; the
  // sidebar's own numbers live in `sideCard` below.
  const density = String(skinNumber(SKIN.chrome, 0.88))
  const cardDensity = String(skinNumber(SKIN.card, 0.96))
  const glassPct = a => `${Math.round(a)}%`
  // The brightest ink the sheet asks for; the skin's own text colour.
  const solidInk = SKIN.ink
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
  // Which slider owns the sidebar cards: Card opacity, not Sidebar opacity.
  // Sidebar opacity was the original owner, which left the card slider only
  // touching the chat's own cards while every sidebar surface ignored it. The
  // slider is named for the cards it paints, and the reply panels' Solidity
  // floor is what gives it a genuinely solid end of the range.
  const sideAlpha = skinNumber(SKIN.card, 0.96)
  const sideCard = `rgba(${hexTriple(hexFade(SKIN.deeper, SKIN.ink, 0.04))}, ${String(sideAlpha)})`
  // Sidebar opacity is the column the cards sit on. The slider now runs 0..1
  // and zero is genuinely clear, which is the floating look: at 0 the gaps
  // between the cards are the bare picture. The top half of the range is the
  // useful part, so the wash is `sidebar * 0.5`: 0.74 lands on the 0.37 wash
  // this column has always painted, and 1.0 is a half wash.
  const sideSlider = skinNumber(SKIN.sidebar, 0)
  const sideWashAlpha = Math.max(0, Math.min(1, sideSlider)) * 0.5
  const sideWash = `rgba(${hexTriple(SKIN.deeper)}, ${sideWashAlpha.toFixed(3)})`
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
    `  background-color: #1d2021;`,
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
    // The picture IS the background.
    ...pictureLayers(),
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
    // Three halts: the pill is a third of the track.
    `${SWITCH_HOOK}[data-atr-switch='3'] > [role='tablist']::after {`,
    '  width: calc(100% / 3);',
    '}',
    // The pill rides to whichever label is active, one pill-width per halt.
    `${SWITCH_HOOK} > [role='tablist']:has(> [data-slot='pane-tab']:nth-child(2)[data-active='true'])::after {`,
    '  transform: translateX(100%);',
    '}',
    `${SWITCH_HOOK} > [role='tablist']:has(> [data-slot='pane-tab']:nth-child(3)[data-active='true'])::after {`,
    '  transform: translateX(200%);',
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
    // Three halts share the strip the host gives Bots (it drops the header to
    // the titlebar band there), so the labels lose their tracking and inner
    // padding to fit whole words where they can.
    `${SWITCH_HOOK}[data-atr-switch='3'] > [role='tablist'] > [data-slot='pane-tab'] {`,
    '  font-size: 0.625rem;',
    '  letter-spacing: 0;',
    '}',
    `${SWITCH_HOOK}[data-atr-switch='3'] > [role='tablist'] > [data-slot='pane-tab'] :is([class~='pane-tab-content'], [class~='pane-tab-content'] > span, [class~='tracking-wide']) {`,
    '  padding-inline: 0;',
    '  margin-inline: 0;',
    '  letter-spacing: 0;',
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
    "html[data-atr-margins='spacious']:not([data-atr-draft]) [data-slot='aui_thread-content'] {",
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
    "html[data-atr-draft] [data-slot='aui_thread-content'] {",
    '  --composer-width: 100% !important;',
    '  max-width: 100% !important;',
    '  width: 100% !important;',
    '  padding-left: 1.5rem !important;',
    '  padding-right: 1.5rem !important;',
    '  box-sizing: border-box !important;',
    '}',
    "html[data-atr-draft] [data-slot='aui_thread-content'] > * {",
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
    ...(isNight ? [] : ["[data-slot='tool-block']:not([data-tool-open]) { text-shadow: 0 1px 0.5rem rgba(0, 0, 0, 0.35); }"]),
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
    // Page panes: a plugin route, the Bots roster, a preview. Their own ink
    // lands on the picture because the zone container is cleared, so the sheet
    // gives the zone's body a fill. This is a tier of its own rather than
    // --atr-glass, so Page opacity moves the pages and leaves the composer,
    // the bubbles and the app's own pages alone.
    //
    // The default matches --atr-glass (86) so a page and the chat beside it
    // start as one window; the slider is what lets them separate.
    `  --atr-page-fill: color-mix(in srgb, var(--atr-tint) ${glassPct(100 * skinNumber(SKIN.page, 0.86))}, transparent);`,
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
    "[data-slot='sidebar-menu-button']:has([data-tour^='sidebar-nav-'])[class*='bg-(--ui-control-active-background)'] {",
    '  background-color: color-mix(in srgb, var(--atr-accent) 14%, transparent) !important;',
    '  border-color: color-mix(in srgb, var(--atr-accent) 22%, transparent) !important;',
    '  color: var(--atr-ink-0) !important;',
    '}',
    "[data-slot='sidebar-menu-button']:has([data-tour^='sidebar-nav-']) > svg,",
    "[data-slot='sidebar-menu-button']:has([data-tour^='sidebar-nav-']) > i {",
    '  transition: color 120ms ease;',
    '}',
    "[data-slot='sidebar-menu-button']:has([data-tour^='sidebar-nav-']):is(:hover, [class*='bg-(--ui-control-active-background)']) > :is(svg, i, [class*='codicon']) {",
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
    // ── Panes that hold a page, not a conversation ─────────────────────────
    // The zone container is cleared to transparent so the picture is the
    // ground everywhere (see "Every pane paints a surface" above). That is
    // right for the chat, whose ink the reply panels grade, and right for the
    // sidebar, whose cards paint themselves. It is wrong for everything else:
    // a plugin route (Security, Memory Wiki), the Bots roster, a preview of a
    // file or a patch paints no ground at all, so its headings, rows and code
    // sat straight on the wallpaper and disappeared over a light passage.
    //
    // The fill goes on the zone's BODY, not the zone: the body is the content
    // area below the pane's tab strip, so the strip keeps its clear ground and
    // the page becomes the same floating card the app's own pages get (inset,
    // rounded, lifted).
    //
    // The material is its own token, `--atr-page-fill`, not `--atr-glass`.
    // Glass is shared with the composer, the user bubbles and the app's own
    // full-page views, so moving it would drag all of them along. This one
    // belongs to Page opacity alone, and it starts at the same weight the
    // app's pages wear so a plugin page and Artifacts look like one window.
    //
    // `data-atr-pagebody` is set by the sweep rather than written as a selector
    // because the element is the host's own flex body: its classes and depth
    // are internals, and a selector for them would also catch the keep-alive
    // anchors, which are absolutely positioned children of the same box.
    '[data-atr-pagebody] {',
    '  background: var(--atr-page-fill) !important;',
    '  border-radius: var(--atr-radius-lg) !important;',
    '  box-shadow: var(--atr-lift) !important;',
    '  box-sizing: border-box !important;',
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
  const header = isCustomLook(LOOK_MODE)
    ? `/* Hermes Atrium · ${lookLabel(LOOK_MODE).toLowerCase()}. Your own picture, colours and opacities. */`
    : `/* Hermes Atrium · gruvbox preset. ${PAINTING_FILE} or your own picture, cover-fitted. */`
  return [header, ...sections.filter(Boolean)].join('\n')
}

// ══ §5 APP MOTION (interface animation, independent of the look) ═════════

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
  // entrances, t-3 for the moments worth watching (dialogs).
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
  // ── [motion:switch] ─────────────────────────────────────────────────────
  // Session switch: core holds data-session-switching on [data-chat-surface]
  // until rows are placed and scroll is restored. The transcript stays
  // invisible for that window and the attribute lifting is the single
  // fade-in. Only the attribute is read;
  // core owns toggling it.
  "[data-chat-surface] :is([data-slot='aui_thread-viewport'], [data-slot='thread']) {",
  '  transition: opacity var(--atr-t-2) var(--atr-ease-out);',
  '}',
  "[data-chat-surface][data-session-switching] :is([data-slot='aui_thread-viewport'], [data-slot='thread']) {",
  '  opacity: 0;',
  '  transition: none;',
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


// ══ §6 PAINTING, THEMES & ACCENT ═══════════════════════════════════════════

// The sheet is one of the looks and never changes on its own: paint it when a
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
// The gallery reads the same list the chip does, so a look can never show up in
// one and be missing from the other. Only Gruvbox needs a drawn preview: every
// Custom tile shows its own picture, and falls back to an empty material.
//
// The label names what a slot is, and the description says which designed look
// it starts as, because "Your own picture and colours" told a new user nothing
// about the three looks waiting there. A slot you have changed still carries its
// preset's name: it is the slot's identity, not a claim about its contents.
const APPEARANCE_LOOKS = LOOK_IDS.map(id => id === 'gruvbox'
  ? { id, label: lookLabel(id), description: 'The shipped painting & palette', preview: 'linear-gradient(165deg, #767b52 35%, #aa9a6d 36%, #aa9a6d 56%, #4d593c 57%, #353a2e)' }
  : { id, label: lookLabel(id), description: LOOK_PRESETS[id]?.name || 'Your own picture & colours', preview: 'var(--ui-widget-surface-background)' })
// What a look's tile paints: its picture, resolved through the assets marker, or
// the look's own fallback. Takes the picture rather than a look id, because the
// records live inside register() and this is a module-level helper.
const lookPreview = (image, fallback) => {
  const url = assetImage(image)
  return url ? `center / cover url("${String(url).replace(/"/g, '%22')}")` : fallback
}
// Every theme name Hermes Atrium owns; anything else is the user's own pick.
// The legacy names are the ones this plugin published before it was renamed
// (`zephyr-sky` pre-Atrium, `atrium` in the first Atrium build). An install
// that upgrades keeps whichever it had in the app's appearance store until the
// next pick, so they must keep counting as ours or the plugin would park itself
// on the first launch after a rename.
const LEGACY_THEMES = ['zephyr-sky', 'atrium']
// Hermes paints an accent override as a derived theme named
// `<base>-accent-<hex>` (accentedTheme in the app's themes/context.tsx), and a
// saved accent is installed under the same name. That is still our theme with
// our accent on it. Counting it as foreign froze the app at launch: the plugin
// parked and cleared the accent, the app repainted plain `hermes-atrium`, the
// plugin woke and set the accent again, and the two traded the attribute
// forever on the main thread.
const themeBase = name => String(name || '').replace(/-accent-[0-9a-f]{3,8}$/i, '')
const isOurTheme = name => {
  const base = themeBase(name)
  return base === THEME_NAME || base === GROUND_THEME || LEGACY_THEMES.includes(base)
}

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
// action is a copy icon that surfaces on hover/focus. Accent shows only in
// the label colour. Classes plus one tiny
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
  '.atr-snip:is(:hover, :focus-within) .atr-snip-acts { opacity: 1; }',
  '.atr-snip-act { display: grid; place-items: center; width: 1.4rem; height: 1.4rem; padding: 0; border: 0; border-radius: var(--atr-r-1, 4px);',
  '  background: transparent; color: var(--atr-ink-3, var(--ui-text-tertiary)); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }',
  '.atr-snip-act:hover, .atr-snip-act:focus-visible { background: var(--atr-hover, color-mix(in srgb, var(--ui-text-primary) 8%, transparent)); color: var(--atr-ink-0, var(--ui-text-primary)); outline: none; }',
  '.atr-snip-act .atr-snip-done { display: none; }',
  '.atr-snip-act[data-done] .atr-snip-idle { display: none; }',
  '.atr-snip-act[data-done] .atr-snip-done { display: inline-flex; color: var(--atr-ink-1); }',
  '.atr-snip-value { font-size: 0.95rem; line-height: 1.45; color: var(--atr-ink-0, var(--ui-text-primary)); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
  '.atr-snip-note { font-size: 0.8125rem; line-height: 1.55; color: var(--atr-ink-2, var(--ui-text-secondary)); }',
  '.atr-snip-source { font-size: 0.6875rem; color: var(--atr-ink-3, var(--ui-text-tertiary)); }',
  // no title: the actions ride the value line instead of an empty head
  '.atr-snip:not(:has(.atr-snip-title)) .atr-snip-head { position: absolute; top: 0.45rem; right: 0.5rem; }',
  '.atr-snip:not(:has(.atr-snip-title)) { padding-right: 3.4rem; }',
].join('\n')

const ensureSnippetStyle = () => {
  if (typeof document === 'undefined' || document.getElementById('atr-snippet-style')) return
  const el = document.createElement('style')
  el.id = 'atr-snippet-style'
  el.textContent = SNIPPET_CSS
  document.head.appendChild(el)
}

function SnippetCard({ attrs, onCopy }) {
  const title = attrs.title || ''
  const value = attrs.value || ''
  const note = attrs.note || ''
  const source = attrs.source || ''
  const accent = TONES[attrs.tone] === 'accent'

  const body = [title, value, note, source].filter(Boolean).join(' — ')

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
              })
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
  const choices = [...LOOK_IDS.map(id => [id, lookLabel(id)]), ['hermes', 'Hermes appearance']]
  return jsxs(Select, { value: selected, onValueChange: onSelect, children: [
    jsx(SelectTrigger, { 'aria-label': 'Hermes Hermes Atrium appearance', className: 'h-7 w-auto text-xs', children: jsx(SelectValue, {}) }),
    jsx(SelectContent, { children: choices.map(([id, label]) => jsx(SelectItem, { value: id, children: label }, id)) })
  ] })
}


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

    // Give back the space earlier builds took (see RETIRED_KEYS). The old ids
    // are outside ctx.storage's scope, so their keys are removed by full name.
    for (const key of RETIRED_KEYS) { try { ctx.storage.remove?.(key) } catch {} }
    try {
      const area = typeof window !== 'undefined' ? window.localStorage : null
      if (area) for (const id of LEGACY_STORE_IDS) for (const key of LEGACY_STORE_KEYS) area.removeItem(`hermes.plugin.${id}.${key}`)
    } catch { /* storage unavailable: nothing to give back */ }

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

    // ── The labels of a collapsed pane ──────────────────────────────────────
    // A minimized zone is drawn by the app as a narrow vertical rail: its tabs
    // carry `data-vertical` and set their label in vertical writing, so the old
    // failure (a word wrapped one letter per line in a sliver) no longer
    // happens and nothing here has to measure tabs or watch the page. What is
    // left is the look: the rail's tabs take the Atrium ink ramp instead of
    // the host's grey gutter, quiet when idle and full ink for the selected
    // tab, keyed on the app's own attributes.
    if (typeof document !== 'undefined') {
      const PANE_RAIL_CSS = [
        "[data-slot='pane-tab'][data-vertical] {",
        '  background: transparent !important;',
        '  box-shadow: none !important;',
        '  color: var(--atr-ink-3, var(--ui-text-tertiary)) !important;',
        '  transition: color 120ms ease;',
        '}',
        "[data-slot='pane-tab'][data-vertical]:hover {",
        '  color: var(--atr-ink-1, var(--ui-text-secondary)) !important;',
        '}',
        "[data-slot='pane-tab'][data-vertical]:is([aria-selected='true'], [data-active='true']) {",
        '  color: var(--atr-ink-0, var(--ui-text-primary)) !important;',
        '}'
      ]
      document.getElementById('atr-pane-rail')?.remove()
      const railStyle = document.createElement('style')
      railStyle.id = 'atr-pane-rail'
      railStyle.textContent = PANE_RAIL_CSS.join('\n')
      document.head.appendChild(railStyle)
      ctx.onDispose?.(() => railStyle.remove())
    }
    const auto = atom(stored(STORE_KEYS.auto) !== false)
    // Picking another theme in Appearance must really switch to it:
    // while one is selected, Hermes Atrium draws no painting and asks for no theme. Picking
    // a Hermes Atrium theme, the status chip or a look wakes it again. Remembered across restarts.
    let away = false
    if (typeof document !== 'undefined') {
      const now = document.documentElement.dataset.hermesTheme || ''
      away = (stored('away') === true || stored(STORE_KEYS.auto) === false) && Boolean(now) && !isOurTheme(now)
    }
    // The desktop tint is gone. An install that had used it still holds the
    // old `gruvboxTint` palette under its own key; that key is simply no longer
    // read, so the look falls back to the Gruvbox preset's own picture and
    // colours. Leave the data in place rather than deleting a user's palette:
    // a later install that understands it again would find it intact.
    // The stored look is whichever look was last chosen. An unknown value (a
    // downgrade, a hand-edited key) falls back to Gruvbox rather than leaving
    // the chip and the sheet with no look at all.
    const storedLook = () => (LOOK_IDS.includes(stored(STORE_KEYS.look)) ? stored(STORE_KEYS.look) : 'gruvbox')
    const appearance = atom(away ? 'hermes' : storedLook())
    const appearanceAssets = atom(0)
    const wake = () => { away = false; ctx.storage.set('away', false) }
    const tint = atom(stored(STORE_KEYS.tint) === true)
    // Two independent switches. `backdropOn` shows the picture; `chrome` is
    // Atrium's sheet of glass, type and controls. They were once welded together
    // because both lived in one <style>.
    const backdropOn = atom(stored(STORE_KEYS.sky) !== false)
    const chromeOn = atom(stored(STORE_KEYS.chrome) !== false)
    const replyGround = atom(stored(STORE_KEYS.replyGround) !== false)
    // gruvbox and every Custom look are the same skin with independent values:
    // Gruvbox starts at the shipped preset, each Custom starts there too and can
    // be driven by its own theme file. No look has a knob another lacks.
    const look = atom(storedLook())
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
    const motion = atom(stored(STORE_KEYS.motion) !== false)

    const persist = () => {
      ctx.storage.set(STORE_KEYS.auto, auto.get())
      ctx.storage.set(STORE_KEYS.tint, tint.get())
      ctx.storage.set(STORE_KEYS.sky, backdropOn.get())
      ctx.storage.set(STORE_KEYS.chrome, chromeOn.get())
      ctx.storage.set(STORE_KEYS.replyGround, replyGround.get())
      ctx.storage.set(STORE_KEYS.look, look.get())
      ctx.storage.set(STORE_KEYS.margins, margins.get())
      ctx.storage.set(STORE_KEYS.motion, motion.get())
      ctx.storage.set(STORE_KEYS.panel, panelSettings.get())
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


    // A scroll gesture switches hover transitions off until it settles (see
    // [motion:history]). The transcript is excluded: it writes scrollTop every
    // frame while a reply streams, and treating that as a gesture would hold
    // the flag for the whole turn.
    let scrollIdleTimer = 0
    const onAnyScroll = event => {
      const target = event?.target
      if (target?.nodeType === 1 && target.closest?.('[data-chat-surface]')) return
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

    let resizeRaf = 0
    const onResize = () => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        wordmarkKey = ''
        pinWordmark()
        fitColumn()
      })
    }
    if (typeof window !== 'undefined') window.addEventListener?.('resize', onResize)

    const applyMarginsAndMark = on => {
      applyMargins(on)
      pinWordmark()
      fitColumn()
    }
    applyMarginsAndMark(margins.get())

    applyMotion(motion.get())

    // ── Re-scan hooks ────────────────────────────────────────────────────────
    // The page marks are measured off surfaces the app mounts and unmounts, so
    // their observers are scoped to those surfaces and re-attached here. A
    // session switch or a route change is what can move them; the host's own
    // focus state and the window's navigation events say when one happened.
    const rescanHooks = []
    const runRescanHooks = () => { for (const hook of rescanHooks) { try { hook() } catch {} } }
    const onNavChange = () => runRescanHooks()
    const rescanUnsubs = []
    if (typeof window !== 'undefined') {
      window.addEventListener?.('popstate', onNavChange)
      window.addEventListener?.('hashchange', onNavChange)
    }
    if (typeof host !== 'undefined') {
      for (const a of [host?.state?.focusedSessionId, host?.state?.activeSessionId]) {
        const off = a?.subscribe?.(() => requestAnimationFrame(onNavChange))
        if (typeof off === 'function') rescanUnsubs.push(off)
      }
    }
    ctx.onDispose?.(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener?.('popstate', onNavChange)
        window.removeEventListener?.('hashchange', onNavChange)
      }
      rescanUnsubs.forEach(off => { try { off() } catch {} })
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
      const material = skinMaterial()
      const ink = styled ? hexRgb(SKIN.ink) : native.ink
      let samples = native.samples
      if (!away && backdropOn.get()) {
        preparePictureBackdrop(skinImage())
        samples = pictureBackdrop(native.bounds, chromeOn.get())
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
      if (tint.get()) setAccentOverride(SKIN.accent)
    }
    apply()

    // ── themes: one stable host entry ──────────────────────────────────────
    // Hermes Atrium publishes a single theme name and re-registers it with the
    // skin's current colours, so the pick in Appearance never changes as the
    // look does. Every look publishes from the same skin: Gruvbox is the shipped
    // preset, each Custom look is that data after your edits, and no look has a
    // palette another lacks.
    function registerLive() {
      const key = SKIN_COLORS.map(([k]) => SKIN[k]).join() + '|' + ['scrim', 'chrome', 'sidebar', 'card', 'bubble', 'page'].map(k => SKIN[k]).join()
      if (liveFor === key) return
      liveFor = key
      ctx.register({ id: 'hermes-atrium.theme', area: THEMES_AREA, order: 38, data: {
        name: THEME_NAME, label: 'Hermes Atrium',
        description: 'Choose Gruvbox or a Custom look in Settings → Hermes Atrium.',
        colors: skinGrounds()
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
        if (themeBase(picked) === THEME_NAME) {
          if (away) { wake(); appearance.set(look.get()) ; apply() }
        }
      }
      themeObs = new MutationObserver(onTheme)
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme'] })
    }

    // ── snippet cards: the medium for "small boxes I can copy" ──
    ensureSnippetStyle()
    ensureMotionStyle()
    ctx.register({
      id: 'snippet',
      area: DIRECTIVE_AREA,
      data: {
        name: 'snippet',
        render: ({ attrs }) =>
          jsx(SnippetCard, {
            attrs,
            onCopy: text => void navigator.clipboard?.writeText(text)
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

    // ── the skin as state: one record per look ───────────────────────────────
    // Every look holds the same knobs and the same controls; only the values
    // differ, and each keeps its own. A look is therefore a saved skin, not a
    // code path: pick Gruvbox and you edit the Gruvbox record, pick Custom 2 and
    // you edit Custom 2's. `SKIN_DEFAULTS` is what all of them start from, so a
    // fresh install paints the shipped painting under the shipped palette
    // whichever look you pick.
    //
    // The image lives under its own key per look because a full-resolution
    // picture can be megabytes; the rest is one small object. `custom` keeps the
    // key strings and the file name the first Custom preset published, so an
    // upgrade finds its picture and its palette where it left them.
    // What is known to be under each look's picture key right now. Kept in
    // memory so a slider drag never has to parse a multi-megabyte value back out
    // of storage to find out whether the picture changed.
    const STORED_PICTURE = {}
    const SKIN_STORES = {
      gruvbox: { object: STORE_KEYS.gruvboxSkin, image: STORE_KEYS.gruvboxSkinImage },
      custom: { object: STORE_KEYS.skin, image: STORE_KEYS.skinImage, file: 'hermes-atrium-theme.json' },
      custom2: { object: STORE_KEYS.skin2, image: STORE_KEYS.skinImage2, file: 'hermes-atrium-theme-2.json' },
      custom3: { object: STORE_KEYS.skin3, image: STORE_KEYS.skinImage3, file: 'hermes-atrium-theme-3.json' }
    }
    const readLookSkin = which => {
      const keys = SKIN_STORES[which] || SKIN_STORES.custom
      const raw = stored(keys.object)
      // A slot with a record of its own keeps every value in it. A slot without
      // one is born as its designed preset, not as a copy of Gruvbox, so a fresh
      // install opens onto three finished looks rather than three empty ones.
      //
      // A record that still holds exactly the shipped Gruvbox defaults counts as
      // no record at all. That is what the previous build wrote for every Custom
      // slot the moment one of its knobs moved, so without this rule an install
      // that upgraded would keep three gruvbox-coloured slots and the presets
      // would appear to have done nothing. Any real edit, however small, differs
      // from the defaults and is left alone.
      const preset = presetSkin(which)
      const untouched = !raw || typeof raw !== 'object' || isShippedDefaults(raw)
      const out = untouched ? { ...preset } : { ...preset, ...raw }
      const picture = stored(keys.image)
      if (typeof picture === 'string' && picture.length > 32) {
        out.image = picture
        STORED_PICTURE[which] = picture
      }
      // The record is healed here; the picture is not. Whether the value under
      // the picture key is this plugin's own default or a picture the user
      // chose cannot be known until the assets folder resolves, so the decision
      // waits for it (HEAL_SLOTS, applied in resolvePluginFiles). Gruvbox is
      // excluded: its preset IS the shipped record, so there is nothing to heal.
      if (untouched && raw && isCustomLook(which)) {
        HEAL_SLOTS.push(which)
        ctx.storage.set(keys.object, { ...out, image: preset.image })
      }
      return out
    }
    // Slots whose stored record was the previous build's Gruvbox copy. There is
    // nothing to rewrite in the record itself (it now holds the preset), so this
    // only tracks which slots may still be holding the previous build's resolved
    // painting under their picture key. Declared before readLookSkin runs, in
    // LOOK_SKINS below.
    const HEAL_SLOTS = []
    // The picture is the one large value this plugin stores, so it is written in
    // one place per look: its own key. The record holds only the small knobs,
    // and that key is only rewritten when the picture itself changed, so dragging
    // a slider never re-stores a megabyte.
    //
    // The host discards a failed write without a sound (quota, permissions).
    // A store that cannot take this picture cannot take it stored twice either,
    // so on failure the picture already under the key is left exactly where it
    // is and the new one is only on screen until the next launch. That is a
    // warning in the console, never a silent rollback: the alternative is a look
    // that quietly shows a picture it will not have next time.
    const writeLookSkin = (which, next) => {
      const keys = SKIN_STORES[which] || SKIN_STORES.custom
      const record = { ...next }
      // A preset picture is a marker, not a value: `assets/watersky.jpg` is
      // resolved at paint time, so it costs twenty bytes and belongs in the
      // record beside the other knobs, where a restart reads it back without a
      // second key to keep in step. Only a real picture (an upload, a path, a
      // URL) is large enough to want a key of its own.
      const presetPicture = /^assets[\\/]/i.test(String(next.image || ''))
      if (presetPicture) {
        // Going back to a preset picture has to clear whatever was under the
        // picture key, or readLookSkin would hand the old upload back and the
        // reset would look like it did nothing.
        if (STORED_PICTURE[which] !== undefined) {
          delete STORED_PICTURE[which]
          ctx.storage.set(keys.image, '')
        }
      } else {
        delete record.image
        if (next.image && STORED_PICTURE[which] !== next.image) {
          ctx.storage.set(keys.image, next.image)
          if (ctx.storage.get(keys.image, undefined) === next.image) {
            STORED_PICTURE[which] = next.image
          } else {
            console.warn(`[hermes-atrium] ${lookLabel(which)}'s new picture does not fit in this plugin's storage; it shows now but will not survive a restart until a smaller one is chosen`)
          }
        }
      }
      ctx.storage.set(keys.object, record)
    }
    // Every look is an ordinary skin: there is no built-in palette that a Custom
    // one cannot reach, and no Custom knob that Gruvbox lacks. Hold all the
    // records in memory so an edit is in hand the moment a slider moves, and
    // write through to each look's own keys.
    const LOOK_SKINS = Object.fromEntries(LOOK_IDS.map(id => [id, readLookSkin(id)]))
    const skinOf = which => LOOK_SKINS[which] || LOOK_SKINS.custom
    setSkin(skinOf(look.get()))
    pictureReady = () => { if (!atrDisposed) { replyPictureVersion += 1; renderReplyGround(nowAt()) } }

    ensurePictureStyle()
    const skin = atom({ ...skinOf(look.get()) })
    const selectAppearance = next => {
      if (next !== 'hermes' && !LOOK_IDS.includes(next)) return
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
      // Switch to the chosen look's own record, not to a shared one: the whole
      // point of separate presets is that each remembers what you did to it.
      const chosen = skinOf(next)
      skin.set({ ...chosen })
      setSkin(chosen)
      ensurePictureStyle()
      persist()
      registerLive()
      apply()
      // A file for this look may have changed while another was on screen: the
      // poll only follows the visible one. Re-read it now, quietly, so the first
      // paint is the file's values and not a stale record.
      if (isCustomLook(next)) readConfigOne(next, true)
    }


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

    // A knob writes to the record of the look you are looking at. That is the
    // whole difference between the looks now: which record the controls edit.
    // Nothing here switches looks behind your back.
    const pushSkin = patch => {
      const which = look.get()
      const next = { ...skin.get(), ...patch }
      for (const key of Object.keys(next)) if (next[key] === undefined) next[key] = SKIN_DEFAULTS[key]
      LOOK_SKINS[which] = next
      skin.set(next)
      setSkin(next)
      writeLookSkin(which, next)
      // Each Custom look owns its own file, so editing one must not rewrite what
      // another holds.
      if (isCustomLook(which) && !fromFile) writeConfig(which, next)
      if (patch.image !== undefined) ensurePictureStyle()
      // The host theme's colours are skin values, so a palette change has to
      // re-publish them and not just repaint the sheet.
      registerLive()
      apply()
    }
    // Reset means "what this look was born as": the shipped preset for Gruvbox,
    // the designed preset for a Custom slot. Returning a Custom slot to the
    // shipped painting would throw away the look it is named after.
    const resetSkin = () => {
      const which = look.get()
      const next = presetSkin(which)
      LOOK_SKINS[which] = next
      skin.set(next)
      setSkin(next)
      writeLookSkin(which, next)
      if (isCustomLook(which)) writeConfig(which, next)
      ensurePictureStyle()
      registerLive()
      apply()
    }
    // ── files: the painting, and one hermes-atrium-theme*.json per Custom look ─
    // A theme file IS a Custom look. Custom 1 keeps the name the first Custom
    // preset published (`hermes-atrium-theme.json`); Custom 2 and 3 get numbered
    // files beside it. Every key is optional; anything left out keeps its
    // default. Edit one in any editor and the app follows within a couple of
    // seconds; moving a knob in Settings writes it back.
    const desk = typeof window !== 'undefined' ? window.hermesDesktop : null
    // Where each Custom look's file lives, filled in once the plugin directory
    // resolves. Keyed by look id, so a look without a resolved path simply has
    // no file to read or write.
    const CONFIG_PATHS = {}
    let homeDir = ''
    // Windows hands us `C:\Users\...`; a file URL needs `file:///C:/Users/...`.
    const fileUrl = p => {
      let s = String(p || '').replace(/\\/g, '/')
      if (!s) return s
      if (!s.startsWith('/')) s = '/' + s
      return 'file://' + encodeURI(s)
    }
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
    // A skin key that needs its own sentence in the file. `page` is the one
    // knob whose name does not say what it paints: it is the ground under the
    // panes whose content draws none of its own (a plugin route, the Bots
    // roster, a preview), not the pages the app ships itself.
    const CONFIG_HELP = 'Hermes Atrium Custom look. Edit and save; Hermes follows. image: a path (~/Pictures/x.jpg), a URL, or "uploaded" to keep the picture from Settings. Colours are hex; opacities and filters are numbers. `page` is the ground under plugin pages and other panes that paint no surface of their own; it starts at 0.86, the same weight the app\'s own pages wear, and 1 is an opaque sheet. Delete a key to get its default.'
    const configText = sk => {
      const out = { _help: CONFIG_HELP }
      for (const key of Object.keys(SKIN_DEFAULTS)) out[key] = key === 'image' ? urlToPath(sk.image) : sk[key]
      return JSON.stringify(out, null, 2) + '\n'
    }
    // What was last read or written, per file. A poll compares the text it gets
    // against this, so an untouched file costs one read and no repaint.
    const LAST_CONFIG_TEXT = {}
    // Every knob move rewrites the look's file, and the poll reads that same
    // file. The two race in both directions: a read can start before a knob
    // moves, or return while the write it wrote is still landing and so hand
    // back the older text. Either way the file loses to the knob, because the
    // knob is the newer intent. So a read is discarded if any write on that look
    // started while it was in flight, and if a write is still in flight at all.
    const FILE_WRITES = {}   // which -> { started, pending }
    const fileWrites = which => (FILE_WRITES[which] ||= { started: 0, pending: 0 })
    const writeConfig = (which, sk) => {
      const path = CONFIG_PATHS[which]
      const state = fileWrites(which)
      state.started += 1
      if (!path || !desk?.writeTextFile) return
      const text = configText(sk)
      if (text === LAST_CONFIG_TEXT[which]) return
      LAST_CONFIG_TEXT[which] = text
      state.pending += 1
      desk.writeTextFile(path, text).then(
        () => { state.pending -= 1 },
        () => { state.pending -= 1 }
      )
    }
    // One Custom look's file. `switchTo` is false at startup, where the records
    // are seeded quietly and the screen is left alone.
    //
    // The poll reads only the Custom look on screen: that is the one whose edits
    // have to land live, and the other looks' records are already in memory for
    // the moment they are picked. Every file is read once at startup, so an edit
    // made while the app was closed is in hand too.
    const readConfigOne = async (which, switchTo) => {
      const path = CONFIG_PATHS[which]
      if (!path || !desk?.readFileText) return
      const state = fileWrites(which)
      const writesAtStart = state.started
      let res = null
      try { res = await desk.readFileText(path) } catch { return }
      // A knob moved, or a write is still landing, while this read was in flight:
      // the text is older than what the app already has.
      if (state.started !== writesAtStart || state.pending > 0) return
      const text = res && res.ok !== false && typeof res.text === 'string' ? res.text : null
      if (text === null || text === LAST_CONFIG_TEXT[which]) return
      LAST_CONFIG_TEXT[which] = text
      let data
      try { data = JSON.parse(text) } catch (error) { console.warn(`[hermes-atrium] ${SKIN_STORES[which].file} is not valid JSON:`, String(error)); return }
      if (!data || typeof data !== 'object') return
      const patch = {}
      for (const key of Object.keys(SKIN_DEFAULTS)) if (data[key] !== undefined && data[key] !== null && data[key] !== '') patch[key] = data[key]
      if (patch.image === 'uploaded') delete patch.image
      else if (patch.image) patch.image = pathToUrl(patch.image)
      // A file that still spells out nothing but the shipped Gruvbox defaults is
      // an untouched file the previous build wrote, not an instruction to paint
      // Gruvbox in a slot that is now a designed preset. Same rule as the stored
      // record, for the same reason: this is the other half of the same upgrade.
      // A real picture (the one under the look's own picture key) still wins,
      // because a slot someone put their own photograph in is not untouched.
      const untouched = isShippedDefaults(data)
      const keepPicture = STORED_PICTURE[which] ? { image: LOOK_SKINS[which].image || skin.get().image } : {}
      const next = untouched
        ? { ...presetSkin(which), ...keepPicture }
        : { ...presetSkin(which), ...(patch.image ? {} : { image: LOOK_SKINS[which].image || skin.get().image }), ...patch }
      if (!switchTo || look.get() !== which) {
        // Startup, or a look that is not on screen: seed the record and leave
        // what is painted alone. A look that IS on screen at startup still gets
        // its own values, because they are what should be painted.
        LOOK_SKINS[which] = next
        if (!switchTo && look.get() === which) { skin.set(next); setSkin(next) }
        writeLookSkin(which, next)
        return
      }
      fromFile = true
      try { pushSkin(next) } finally { fromFile = false }
    }
    const readConfig = async (switchTo = true) => {
      for (const which of CUSTOM_LOOKS) await readConfigOne(which, switchTo)
    }
    // The 2s poll: follow the file for the look you are looking at.
    const pollConfig = () => {
      const which = look.get()
      if (isCustomLook(which)) readConfigOne(which, true)
    }
    let fromFile = false
    // ── Shipping pictures ───────────────────────────────────────────────────
    // Every picture the plugin draws comes from its own `assets/` folder, and
    // nowhere else.
    //
    // `backwater.jpg` is the one the plugin ships with, and it wins by name.
    // Anything else in `assets/` is used only if that file is absent, so extra
    // images can sit there for testing without ever becoming the default.
    //
    // The fallback sorts before it picks. readdir order is not guaranteed, so
    // an unsorted `find` over several candidates can change answer between
    // launches, or between machines, which looks like the picture randomly
    // resetting itself.
    const IMAGE_RE = /\.(?:jpe?g|png|webp|avif)$/i
    const PICTURE_NAMES = ['backwater.jpg', 'backwater.jpeg', 'backwater.png', 'backwater.webp']
    const pluginDirName = 'hermes-atrium'
    // The directory part of a path, keeping the native separator.
    const assetsDirOf = p => String(p || '').replace(/[\\/][^\\/]*$/, '')

    const resolvePluginFiles = async () => {
      if (!desk?.desktopPluginsRoot || !desk?.readDir) {
        console.warn('[hermes-atrium] no desktop file bridge; the painting stays unloaded')
        return
      }
      const root = await desk.desktopPluginsRoot()
      // The bridge reports the native separator, so build paths with it.
      const sep = root.includes('\\') ? '\\' : '/'
      homeDir = root.replace(/[\\/]\.hermes[\\/]desktop-plugins[\\/]?$/, '')
      // Each Custom look's file sits beside the plugin directory, named for the
      // look: the first Custom preset's file keeps its published name.
      for (const which of CUSTOM_LOOKS) {
        CONFIG_PATHS[which] = root.replace(/[\\/]desktop-plugins[\\/]?$/, '') + sep + SKIN_STORES[which].file
      }
      const names = async dir => {
        try { return ((await desk.readDir(dir)) || {}).entries || [] } catch { return [] }
      }
      // Which folder is ours? Hermes names an installed plugin's folder after
      // the plugin, and copies a package's desktop/ half into a folder of the
      // same name, so ours is found by name alone. No other plugin's folder is
      // opened: a picture is only taken from THIS plugin's own assets/.
      const tops = await names(root)
      const dirs = tops.filter(e => e.isDirectory && e.name.toLowerCase() === pluginDirName)
      let found = null
      let owner = null
      let present = []
      for (const dir of dirs) {
        const here = await names(dir.path)
        if (!here.some(e => e.name === 'plugin.js')) continue
        const assetsDir = here.find(e => e.name === 'assets' && e.isDirectory)
        if (!assetsDir) continue
        const assets = await names(assetsDir.path)
        const files = assets
          .filter(e => !e.isDirectory && IMAGE_RE.test(e.name))
          .sort((a, b) => a.name.localeCompare(b.name))
        const image = files.find(e => PICTURE_NAMES.includes(e.name.toLowerCase())) || files[0]
        if (!image) continue
        found = image.path
        owner = dir.name
        present = files.map(e => e.name.toLowerCase())
        // Every image in the folder, by name, so a look whose picture is the
        // `assets/<file>` marker can find its own file without storing a path.
        // Filled here rather than guessed from the one that paints the ground:
        // the Custom presets ship three pictures of their own.
        for (const e of files) {
          ASSET_IMAGES[e.name.toLowerCase()] = fileUrl(e.path)
          ASSET_IMAGES[e.name.replace(/\.[^.]+$/, '').toLowerCase()] = fileUrl(e.path)
        }
        break
      }
      if (found) {
        const url = fileUrl(found)
        const was = PAINTING_URL
        PAINTING_URL = url
        SKIN_DEFAULTS.image = url
        // Replace a pointer that can no longer resolve.
        //   - `was` is a previous release's path for the same file: an earlier
        //     one looked in the plugin root, so its absolute path went stale.
        //   - `data:,` is the unloaded placeholder.
        //   - a path into OUR OWN assets/ naming a file that is not there any
        //     more. This is what a rename leaves behind: the old painting stored
        //     as the Custom picture would otherwise paint nothing, and the new
        //     default would never take over. Pictures from anywhere else (an
        //     upload, ~/Pictures) are never touched.
        const assetsDirUrl = fileUrl(assetsDirOf(found))
        const stale = img => {
          const s2 = String(img || '')
          if (!s2 || s2 === was || s2 === 'data:,') return true
          if (!s2.startsWith(assetsDirUrl)) return false
          const name = decodeURI(s2.slice(assetsDirUrl.length + 1)).toLowerCase()
          return name !== '' && !present.includes(name)
        }
        // Write the heal back, not just paint it: leaving a dangling path in
        // storage means every later load has to work it out again, and anything
        // reading a look's picture key directly keeps seeing a file that is not
        // there. Every look is healed, because every look can point at
        // `assets/`.
        if (stale(SKIN.image)) setSkin({ ...SKIN, image: url })
        for (const which of LOOK_IDS) {
          const rec = LOOK_SKINS[which]
          if (!rec || !stale(rec.image)) continue
          const next = { ...rec, image: url }
          LOOK_SKINS[which] = next
          if (look.get() === which) { skin.set(next); setSkin(next) }
          writeLookSkin(which, next)
        }
        // A slot the previous build seeded from Gruvbox still carries our
        // painting under its picture key, and its record no longer says which
        // slot it was. Its palette is now the preset's, so the picture has to
        // follow, or the slot paints a preset's colours over another look's
        // picture and reads as neither.
        //
        // Only these slots are touched. A slot with real edits keeps its own
        // picture even when that picture is our painting, because choosing a
        // picture and choosing a palette are separate acts and this must not
        // undo the first to apply the second.
        for (const which of CUSTOM_LOOKS) {
          if (!HEAL_SLOTS.includes(which)) continue
          const rec = LOOK_SKINS[which]
          if (!rec || /^assets[\\/]/i.test(String(rec.image || ''))) continue
          const next = { ...rec, image: presetSkin(which).image }
          LOOK_SKINS[which] = next
          delete STORED_PICTURE[which]
          ctx.storage.set(SKIN_STORES[which].image, '')
          if (look.get() === which) { skin.set(next); setSkin(next) }
          writeLookSkin(which, next)
        }
        ensurePictureStyle()
        appearanceAssets.set(appearanceAssets.get() + 1)
        apply()
        console.info(`[hermes-atrium] painting: ${owner}/assets/${found.split(/[\\/]/).pop()}`)
      } else {
        console.warn(`[hermes-atrium] no picture in <plugin>/assets (looked for ${PICTURE_NAMES[0]} or any image)`)
      }
      await readConfig(false)
    }
    resolvePluginFiles().catch(error => console.warn('[hermes-atrium] plugin files:', String(error)))
    // The theme files are read through the desktop bridge, so a poll is an IPC
    // plus a file read, not a property access. 2s while you are looking at the
    // window (an edit lands live), 30s while you are not (an edit is followed by
    // coming back here anyway). Only the look on screen is polled; an untouched
    // file costs one read and no repaint.
    let configTicks = 0
    const configTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      configTicks += 1
      if (configTicks % 15 !== 0 && !document.hasFocus?.()) return
      pollConfig()
    }, 2000)
    // Reveal the file for a Custom look, creating it from what that look holds
    // now if it is not there yet. A look on screen gets its record; another
    // Custom look gets its own saved values, never what is painted right now.
    const openConfig = async which => {
      if (!isCustomLook(which)) which = isCustomLook(look.get()) ? look.get() : 'custom'
      const path = CONFIG_PATHS[which]
      if (!path) return
      let exists = false
      try { const r = await desk.readFileText(path); exists = Boolean(r && r.ok !== false) } catch {}
      if (!exists) { LAST_CONFIG_TEXT[which] = null; writeConfig(which, skinOf(which)); await new Promise(r => setTimeout(r, 200)) }
      desk.revealPath?.(path)
    }
    const readAsDataUrl = file => new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
    // Keep the original bytes whenever the store can take them; only re-encode
    // when a picture is too big for the browser's storage, and then once.
    // Re-encode to a width and quality that fits the budget, and keep trying
    // until it does. The stored string is base64 (33% larger than the JPEG
    // bytes) inside a JSON string in localStorage, which fails silently when a
    // quota is hit, so a picture that merely "fit" could still go missing.
    //
    // Chromium allows about 5 million UTF-16 code units per origin, and every
    // key this app and this plugin store shares that one budget. One picture
    // used to be the only large value here; now a user can keep three, so no
    // single picture may take the whole store. Each upload is fitted to a share
    // of what is left after the other looks' pictures.
    //
    // Measured against the shipped 4096x2428 photograph: the re-encoder lands at
    // roughly 70% of whatever ceiling it is given, so the ceiling is a hard cap
    // rather than the size it aims for. Three pictures filled in turn cost about
    // 3.5 million of the store, leaving around 30% for every other key on the
    // origin (the app's own keys share it too).
    const STORE_SIZE = 5_000_000
    const PICTURE_SHARE = 0.25    // one look may take a quarter of the store
    const PICTURE_FLOOR = 600_000 // below this a photograph is visibly mush
    const STORE_RESERVE = 600_000 // room for the app's own keys and this plugin's
    const pictureBudget = which => {
      let used = 0
      for (const id of LOOK_IDS) if (id !== which) used += (STORED_PICTURE[id] || '').length
      return Math.max(PICTURE_FLOOR, Math.min(STORE_SIZE * PICTURE_SHARE, STORE_SIZE - used - STORE_RESERVE))
    }
    const shrinkDataUrl = (dataUrl, budget, max = 2560, quality = 0.92) => new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const encode = (width, q) => {
          const scale = Math.min(1, width / Math.max(1, img.naturalWidth))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
          const g = canvas.getContext('2d')
          if (!g) return dataUrl
          g.drawImage(img, 0, 0, canvas.width, canvas.height)
          try { return canvas.toDataURL('image/jpeg', q) } catch { return dataUrl }
        }
        if (!img.naturalWidth || dataUrl.length <= budget) return resolve(dataUrl)
        let width = max, q = quality, out = encode(width, q)
        // Halve the long edge and step the quality down: four rounds takes any
        // realistic photograph under a couple of megabytes.
        for (let i = 0; i < 8 && out.length > budget; i += 1) {
          if (i % 2 === 1) q = Math.max(0.62, q - 0.08)
          else width = Math.max(640, Math.round(width * 0.72))
          out = encode(width, q)
        }
        resolve(out)
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
    const useImageFile = async file => {
      if (!file) return
      const raw = await readAsDataUrl(file)
      if (!raw) return
      // Fit the picture to what this look can have, not to a fixed size: three
      // looks share one store.
      const budget = pictureBudget(look.get())
      const fitted = raw.length > budget ? await shrinkDataUrl(raw, budget) : raw
      pushSkin({ image: fitted })
    }


    // ── Chat or empty page ───────────────────────────────────────────────────
    // The picture is sharp on a fresh draft and frosted behind a conversation.
    // Which one is up comes from the host's own focus state, not from finding
    // the transcript in the app's markup: a fresh draft is a focused chat with
    // no session yet. A page such as Capabilities keeps the last chat's focus,
    // so it frosts as it always did. The marks are the plugin's own attributes
    // on <html>, which the sheet reads.
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') try {
      const root = document.documentElement
      let pageDead = false
      const focusAtom = typeof host !== 'undefined' ? host?.state?.focusedSessionId : null
      const syncChatMark = () => {
        if (pageDead) return
        // without the focus state (an older host) every view counts as a chat
        const draft = Boolean(focusAtom?.get) && !focusAtom.get()
        if (draft) {
          delete root.dataset.atrChat
          if (root.dataset.atrDraft !== '1') root.dataset.atrDraft = '1'
        } else {
          if (root.dataset.atrChat !== '1') root.dataset.atrChat = '1'
          delete root.dataset.atrDraft
        }
      }
      const focusUnsub = focusAtom?.subscribe?.(syncChatMark)
      syncChatMark()

      let pageQueued = false
      // The sheet matched 13 things with :has(). Scrolling mounts rows, and each
      // mount made Blink re-evaluate those over a large subtree (40ms per row
      // insert). The plugin marks the handful of elements once; the CSS matches
      // an attribute instead.
      // The sidebar's strip is the one whose tablist holds the Sessions tab. The
      // surface colour is not enough to find it: every zone header (the
      // workspace tabs, Files, Terminal) is painted with the sidebar surface,
      // and marking them all hid their Restore buttons and took the workspace
      // tabs out of their own look.
      const markStrips = () => {
        const want = new Map()
        document.querySelectorAll("[role='tablist']").forEach(tl => {
          const p = tl.parentElement
          if (!p || !tl.querySelector(":scope > [data-tree-tab='sessions']")) return
          // Sessions | Bots, and Bots' own Scheduled jobs when it is open: the
          // switch carries two or three halts. More falls back to plain tabs.
          const n = [...tl.children].filter(c => c.getAttribute('data-slot') === 'pane-tab').length
          want.set(p, n === 2 || n === 3 ? String(n) : '')
        })
        document.querySelectorAll('[data-atr-strip]').forEach(el => {
          if (!want.has(el)) { el.removeAttribute('data-atr-strip'); el.removeAttribute('data-atr-switch') }
        })
        want.forEach((n, el) => {
          if (!el.hasAttribute('data-atr-strip')) el.setAttribute('data-atr-strip', '')
          if (n && el.getAttribute('data-atr-switch') !== n) el.setAttribute('data-atr-switch', n)
          else if (!n && el.hasAttribute('data-atr-switch')) el.removeAttribute('data-atr-switch')
        })
      }

      // one-time marks, so nothing has to be discovered by :has() again
      const flag = (el, name, on) => { if (!el) return; if (on) { if (!el.hasAttribute(name)) el.setAttribute(name, '') } else if (el.hasAttribute(name)) el.removeAttribute(name) }
      const sweep = (name, found) => {
        document.querySelectorAll('[' + name + ']').forEach(el => { if (!found.has(el)) el.removeAttribute(name) })
        found.forEach(el => flag(el, name, true))
      }

      // A zone that paints nothing of its own. The chat grades its text with
      // the reply panels, the sessions column paints its cards and the terminal
      // paints xterm's canvas; every other pane (a plugin route, the Bots
      // roster, a file preview) draws no ground at all, so its headings, rows
      // and code sat straight on the wallpaper. Those get the page material,
      // on the zone's body box so the tab strip above it stays clear.
      //
      // The clearing half is not optional. A zone's body box outlives its
      // contents: it is the same element when you tab from Security back to the
      // chat. Marking only the page case left the fill behind on every body a
      // page had ever used, so after one visit the chat wore a card too. Keep
      // the set of bodies this pass marked and clear everything else.
      const markPageZones = () => {
        const marked = new Set()
        document.querySelectorAll('[data-tree-group]').forEach(zone => {
          const page = marksPageGround(zone)
          flag(zone, 'data-atr-page', page)
          if (!page) return
          const body = pageBodyOf(zone)
          if (body) { flag(body, 'data-atr-pagebody', true); marked.add(body) }
        })
        document.querySelectorAll('[data-atr-pagebody]').forEach(el => { if (!marked.has(el)) el.removeAttribute('data-atr-pagebody') })
      }

      const markHas = () => {
        markPageZones()
        const grid = document.querySelector("[class*='grid-cols-[13rem_minmax(0,1fr)]']")
        flag(document.documentElement, 'data-atr-settings', !!grid)
        const boxes = new Set()
        if (grid) for (let p = grid.parentElement, d = 0; p && d < 2; p = p.parentElement, d++) if (p.matches('div.rounded-xl')) boxes.add(p)
        sweep('data-atr-setbox', boxes)
      }
      const schedulePage = () => {
        if (pageQueued) return
        pageQueued = true
        requestAnimationFrame(() => { pageQueued = false; if (pageDead) return; markStrips(); markHas() })
      }
      const pageObs = new MutationObserver(schedulePage)
      // What these marks measure. The tab strips, the sidebar rows and the
      // settings grid were the original three, and they missed the case that
      // mattered: a zone's body box is a SIBLING of its `[data-panel-header]`,
      // not a descendant, so swapping the body's contents (a plugin page out,
      // the chat in on New session) mutated nothing being watched. The mark
      // then stayed on the zone until some unrelated sweep happened to run,
      // which is why the fill sometimes lingered for one try and cleared on
      // the next.
      //
      // Watching the body is cheap in the way that matters: it is one node per
      // zone, and it is NOT the transcript's subtree, so streaming a reply
      // still costs nothing here (the body's own children are the pane hosts,
      // which do not change per token). The transcript keeps its separate
      // rescan hook on a session switch.
      const PAGE_TARGETS = [
        '[data-panel-header]',
        '[data-zone-body]',
        "[data-slot='sidebar-content']",
        "[class*='grid-cols-[13rem_minmax(0,1fr)]']"
      ]
      // How many zones the observer set currently covers. Declared before the
      // attach function because that function writes it; a `let` below its own
      // writer is a TDZ trap for the next edit.
      let attachedZones = -1
      const attachPageObs = () => {
        const targets = PAGE_TARGETS.flatMap(sel => [...document.querySelectorAll(sel)])
        pageObs.disconnect()
        // none mounted yet: watch nothing, and let the next re-scan attach
        for (const target of targets) {
          pageObs.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'data-state', 'hidden'] })
        }
        attachedZones = document.querySelectorAll('[data-zone-body]').length
      }
      // Opening a preview SPLITS a new zone into the tree, and nothing above
      // re-attaches the observer for it: the split's children are a level the
      // page observer never saw. A zone that is never observed is a zone whose
      // mark can only change on an unrelated sweep, which is the same class of
      // staleness as the body swap (and the same "press it again" symptom).
      //
      // So watch the tree's own structure and re-attach when the ZONE COUNT
      // changes. The count is what matters: a split/merge/resize fires this
      // often, and re-attaching on all of them would put the whole set of
      // targets back together many times a second while a sash is dragged.
      const structureObs = new MutationObserver(() => {
        if (pageDead) return
        if (document.querySelectorAll('[data-zone-body]').length === attachedZones) return
        attachPageObs()
        schedulePage()
      })
      const attachStructureObs = () => {
        structureObs.disconnect()
        const tree = document.querySelector('[data-tree-split]')?.parentElement || document.querySelector('[data-tree-group]')?.parentElement
        if (tree) structureObs.observe(tree, { childList: true, subtree: true })
      }
      attachPageObs()
      attachStructureObs()
      rescanHooks.push(() => { attachPageObs(); attachStructureObs(); schedulePage() })
      window.addEventListener('resize', schedulePage)
      markStrips()
      markHas()
      ctx.onDispose?.(() => {
        pageDead = true
        try { focusUnsub?.() } catch {}
        document.querySelectorAll('[data-atr-strip]').forEach(el => { el.removeAttribute('data-atr-strip'); el.removeAttribute('data-atr-switch') })
        for (const a of ['data-atr-settings', 'data-atr-setbox', 'data-atr-page', 'data-atr-pagebody']) document.querySelectorAll('[' + a + ']').forEach(el => el.removeAttribute(a))
        pageObs.disconnect()
        structureObs.disconnect()
        window.removeEventListener('resize', schedulePage)
        delete root.dataset.atrChat
        delete root.dataset.atrDraft
      })
    } catch (err) {
      console.error('[hermes-atrium] page state failed: ' + (err && err.stack || err))
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
          title: 'Return this look to the shipped picture, colours and opacities. The other looks are untouched.',
          onClick: () => resetSkin(),
          children: 'Reset'
        }),
        // Every Custom look has a theme file of its own; under Gruvbox the
        // button would open a file that is not on screen, which is the
        // confusion this redesign is meant to end.
        isCustomLook(look.get()) ? jsx('button', {
          type: 'button',
          className: 'rounded-md px-2 py-1 text-[0.75rem]',
          style: { border: '1px solid var(--atr-edge, var(--ui-stroke-tertiary, rgba(255,255,255,0.16)))' },
          title: `~/.hermes/${SKIN_STORES[look.get()].file}: every colour, opacity and filter of ${lookLabel(look.get())}, as one editable file`,
          onClick: () => { openConfig(look.get()) },
          children: 'Theme file'
        }) : null
      ]})
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
        const activeSkin = useValue(skin)
        const selectedLook = useValue(appearance)
        const isTint = useValue(tint)
        const isBackdrop = useValue(backdropOn)
        const isChrome = useValue(chromeOn)
        const isReplyGround = useValue(replyGround)
        const isMargins = useValue(margins)
        const isMotion = useValue(motion)
        const lookNow = useValue(look)

        // One sentence for every look: they differ only in which saved skin they
        // show, so the status says which one and where its picture comes from,
        // not which code path is running.
        const ownPicture = typeof activeSkin.image === 'string' && activeSkin.image.startsWith('data:')
        const presetPicture = /^assets[\\/]([^\\/]+)$/i.exec(String(activeSkin.image || ''))
        const pictureNote = ownPicture
          ? 'your own picture'
          : presetPicture ? presetPicture[1] : 'backwater.jpg · 4096 x 2428'
        const status = selectedLook === 'hermes'
          ? 'Hermes appearance · Hermes Atrium appearance paused'
          : [lookNow === 'gruvbox' ? 'Gruvbox preset' : lookLabel(lookNow), pictureNote, isChrome ? 'Hermes Atrium styling' : 'Hermes styling'].join('  ·  ')

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
                    + 'tints every panel to match, and gives each reply a panel of its own. It also adds wide tabs '
                    + 'and snippet cards you can copy.'
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
                jsx('span', { 'aria-hidden': true, style: { display: 'block', height: '4rem', borderRadius: 'var(--atr-r-control, 8px)', background: lookPreview(skinOf(item.id).image, item.preview) } }),
                jsxs('span', { style: { display: 'flex', justifyContent: 'space-between' }, children: [item.label, selectedLook === item.id ? jsx(Codicon, { name: 'check', size: '1rem' }) : null] }),
                jsx('span', { className: 'text-xs text-muted-foreground', children: item.description })
              ]
            }, item.id))
          }),
          selectedLook === 'hermes' ? jsx('p', { className: 'text-sm text-muted-foreground', children: 'Hermes appearance is active. Choose a look above to resume Hermes Atrium styling.' }) : null,
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
          }) : null
        ])

        // The same editor for every look, because every look is the same
        // thing: a saved skin. Every control below edits whichever look is
        // selected, and the others keep their own values.
        //
        // The colour/glass block is a `section` with `collapse`, not a
        // hand-rolled <details>: that one helper is what gives the other menus
        // (Fine-tune appearance, Chat & motion, Snippets) their icon and type,
        // so building it by hand drifted to 0.75rem tertiary text with no
        // icon. Reusing the helper keeps every disclosure row the same shape.
        const skinSection = selectedLook !== 'hermes'
          ? section('paintcan', 'Picture & glass', [
            jsx(SkinPicture, {}),
            section('color-mode', 'Colour, glass and fit', [jsx(SkinEditor, {})], { collapse: true })
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
            checked: isMotion,
            description: 'Short fades and slides on menus, the history list, the composer, and message actions. Off makes every interaction instant. Also follows your system\'s reduced-motion setting.',
            label: 'App animations',
            onChange: on => {
              motion.set(on)
              persist()
              applyMotion(on)
            }
          })
        ], { collapse: true })

        return jsxs('div', { children: [header, lookSection, skinSection, lightSection, chatSection].filter(Boolean) })
      }
    })

    // A plugin is a guest: leave the host as we found it when it unloads.
    ctx.onDispose?.(() => {
      atrDisposed = true
      themeObs?.disconnect()
      clearInterval(configTimer)
      iconStyle?.remove()
      if (typeof document !== 'undefined') { document.getElementById('atr-snippet-style')?.remove(); document.getElementById('atr-motion-style')?.remove() }
      colObs?.disconnect()
      if (typeof document !== 'undefined') unfitColumn()
      clearSheet()
      try { panelUnsub?.() } catch {}
      document.getElementById('atr-reply-ground')?.remove()
      document.getElementById(REPLY_PROBE_ID)?.remove()
      pictureReady = () => {}
      setAccentOverride(null)
      unpinWordmark()
      if (typeof window !== 'undefined') window.removeEventListener?.('resize', onResize)
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.removeProperty('--atr-sun')
        if (document.documentElement.dataset) {
          delete document.documentElement.dataset.atrMargins
          delete document.documentElement.dataset.atrMotion
        }
        document.removeEventListener?.('scroll', onAnyScroll, { capture: true })
        if (scrollIdleTimer) clearTimeout(scrollIdleTimer)
        scrollIdleTimer = 0
        document.documentElement?.removeAttribute?.('data-atr-scrolling')
      }
    })

  }
}
