// Run plugin.js in real Chromium and assert what the Custom presets actually do.
//
//   npm --prefix dev install     # once, for playwright-core
//   node dev/test-plugin.mjs
//
// The plugin is loaded with stubbed SDK modules (real DOM nodes, so the settings
// tree renders) and a fake desktop file bridge, which is the only way to test a
// runtime plugin: it has no test entry point and its storage and file paths all
// come from the host.
//
// What this proves, and why each one is here rather than eyeballed:
//   - each Custom slot paints its own picture and its own ground, so a preset
//     cannot quietly fall back to the shipped painting;
//   - the gallery names and previews the right look;
//   - a knob move persists the marker plus the palette, to the record and to the
//     theme file, and does not leak into another slot;
//   - Reset returns a slot to its own preset, and an upload under the picture
//     key is cleared rather than winning on the next read;
//   - an install from the previous build adopts the presets but keeps real edits.
import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildFakeInstall, findChrome, serve } from './lib/preset.mjs'

const HERE = import.meta.dirname
// Everything the run generates (stubs, harness page, screenshots, last result)
// goes here, so the tool's own folder stays two source files and a lib.
const WORK = path.join(HERE, '.work')
const WINDOW = { width: 1600, height: 1000 }

// The SDK stub returns REAL elements. A stub returning null or a plain object
// looks fine and then every appendChild of a settings page throws, because the
// plugin's tree never became nodes and every control assertion fails for the
// wrong reason.
const SDK = `
export const atom = (init) => {
  let v = init; const subs = new Set()
  return { get: () => v, set: (n) => { const o = v; v = n; for (const f of subs) f(n, o) }, subscribe: (f) => { subs.add(f); return () => subs.delete(f) } }
}
export const useValue = (a) => a.get()
export const host = { state: null }
const el = (tag) => (props) => {
  const p = props || {}
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(p)) {
    if (k === 'children' || k === 'key' || k === 'ref') continue
    if (k === 'className') node.className = v
    else if (k === 'style' && v && typeof v === 'object') Object.assign(node.style, v)
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v)
    else if (v !== undefined && v !== null && v !== false) { try { node.setAttribute(k, v === true ? '' : String(v)) } catch {} }
  }
  const add = (kid) => {
    if (kid === null || kid === undefined || kid === false || kid === true) return
    if (Array.isArray(kid)) return kid.forEach(add)
    node.appendChild(typeof kid === 'object' && kid.nodeType ? kid : document.createTextNode(String(kid)))
  }
  add(p.children)
  return node
}
export const Button = el('button'), ToggleRow = el('div'), Codicon = el('span'), ListRow = el('div'),
  SegmentedControl = el('div'), Select = el('div'), SelectContent = el('div'), SelectItem = el('div'),
  SelectTrigger = el('div'), SelectValue = el('span')
export const requestTheme = () => {}, setAccentOverride = () => {}
`

const JSX = `
// A real-DOM renderer for the plugin's jsx() calls. \`dangerouslySetInnerHTML\` is
// implemented because the plugin uses it for its own static SVG mark
// (ATRIUM_MARK_SVG, a module constant, no user input); a stub that skipped it
// would render an empty settings header and prove nothing about the tree.
const el = (tag) => (props) => {
  const p = props || {}
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(p)) {
    if (k === 'children' || k === 'key' || k === 'ref') continue
    if (k === 'className') node.className = v
    else if (k === 'style' && v && typeof v === 'object') Object.assign(node.style, v)
    else if (k === 'dangerouslySetInnerHTML' && v && v.__html) node.innerHTML = v.__html
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v)
    else if (v !== undefined && v !== null && v !== false) { try { node.setAttribute(k, v === true ? '' : String(v)) } catch {} }
  }
  const add = (kid) => {
    if (kid === null || kid === undefined || kid === false || kid === true) return
    if (Array.isArray(kid)) return kid.forEach(add)
    node.appendChild(typeof kid === 'object' && kid.nodeType ? kid : document.createTextNode(String(kid)))
  }
  add(p.children)
  return node
}
export const jsx = (tag, props) => (typeof tag === 'string' ? el(tag)(props) : (typeof tag === 'function' ? tag(props) : el(tag)(props)))
export const jsxs = jsx
export const Fragment = (props) => {
  const f = document.createDocumentFragment()
  const add = (k) => {
    if (k === null || k === undefined || k === false || k === true) return
    if (Array.isArray(k)) return k.forEach(add)
    f.appendChild(typeof k === 'object' && k.nodeType ? k : document.createTextNode(String(k)))
  }
  add(props && props.children)
  return f
}
`

// The host's own chain stands in as a few translucent grounds; what matters is
// that the plugin's sheet is installed over a page that looks like the app.
const page = (assetNames) => `<!doctype html><html class="dark" data-hermes-theme="hermes-atrium"><head><meta charset="utf-8"><style>
:root.dark { --ui-bg-tertiary: rgba(30,32,40,.6); --ui-widget-surface-background: rgba(30,32,40,.6); }
html, body { margin: 0; height: 100%; }
[data-slot='aui_assistant-message-content'] { max-width: 736px; margin: 120px auto; min-height: 300px; color: #eee; font: 15px/1.6 system-ui; }
[data-slot='sidebar'] { position: fixed; left: 0; top: 0; bottom: 0; width: 240px; }
</style></head><body>
<div data-slot="sidebar"></div>
<div data-slot="aui_assistant-message-content">A reply sitting in the reading column, long enough to occupy a few lines and to be measured against the picture behind it.</div>
<script type="module">
import plugin from '/plugin.js'
const PREFIX = 'hermes.plugin.hermes-atrium.'
const files = new Map()
window.__bridge = { calls: [], files }
window.hermesDesktop = {
  desktopPluginsRoot: async () => '/fake/home/.hermes/desktop-plugins',
  readDir: async (dir) => {
    window.__bridge.calls.push(['readDir', dir])
    const base = dir.replace(/\\\\/g, '/')
    if (base.endsWith('/desktop-plugins')) return { entries: [{ name: 'hermes-atrium', path: base + '/hermes-atrium', isDirectory: true }] }
    if (base.endsWith('/hermes-atrium')) return { entries: [
      { name: 'plugin.js', path: base + '/plugin.js', isDirectory: false },
      { name: 'assets', path: base + '/assets', isDirectory: true }] }
    if (base.endsWith('/hermes-atrium/assets')) {
      return { entries: ${JSON.stringify(assetNames)}.map(n => ({ name: n, path: base + '/' + n, isDirectory: false })) }
    }
    return { entries: [] }
  },
  readFileText: async (p) => { window.__bridge.calls.push(['readFileText', p]); return files.has(p) ? { ok: true, text: files.get(p) } : { ok: false, text: '' } },
  writeTextFile: async (p, t) => { window.__bridge.calls.push(['writeTextFile', p]); files.set(p, t); return { ok: true } },
  revealPath: async () => ({ ok: true })
}
const ctx = {
  storage: {
    get: (k, d) => { const raw = localStorage.getItem(PREFIX + k); return raw === null ? d : JSON.parse(raw) },
    set: (k, v) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)) } catch {} },
    remove: (k) => localStorage.removeItem(PREFIX + k)
  },
  register: () => {}, registerSettingsPage: (p) => { window.__settings = p }, registerDirective: () => {},
  onDispose: () => {}, setInterval: (f, ms) => setInterval(f, ms), setTimeout: (f, ms) => setTimeout(f, ms),
}
plugin.register(ctx)
window.__mountSettings = () => {
  if (!window.__settings) return false
  const host = document.createElement('div')
  host.id = 'atrium-settings'
  host.appendChild(window.__settings.render())
  document.body.appendChild(host)
  return true
}
window.__registered = true
</script></body></html>`

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`)
}

async function main() {
  const { dir, assets } = await buildFakeInstall()
  await fs.rm(WORK, { recursive: true, force: true })
  await fs.mkdir(WORK, { recursive: true })
  await fs.writeFile(path.join(WORK, 'sdk.js'), SDK)
  await fs.writeFile(path.join(WORK, 'jsx.js'), JSX)
  const assetNames = await fs.readdir(assets)
  await fs.writeFile(path.join(WORK, 'index.html'), page(assetNames))

  const { server, origin } = await serve({
    '/': path.join(WORK, 'index.html'),
    '/index.html': path.join(WORK, 'index.html'),
    '/sdk.js': path.join(WORK, 'sdk.js'),
    '/jsx.js': path.join(WORK, 'jsx.js'),
    '/plugin.js': path.join(dir, 'plugin.js'),
    // The page is http, so it may not load file:// urls. The plugin's own sheet
    // is rewritten to these routes in the screenshot pass at the end.
    ...Object.fromEntries(assetNames.map(n => [`/assets/${n}`, path.join(assets, n)]))
  })

  const browser = await chromium.launch({ executablePath: await findChrome(), args: ['--no-sandbox'] })
  const view = await browser.newPage({ viewport: WINDOW })
  const logs = []
  view.on('console', m => logs.push(`[${m.type()}] ${m.text()}`))
  view.on('pageerror', e => logs.push(`[pageerror] ${e.message}`))
  const open = async (url = '/index.html') => {
    await view.goto(`${origin}${url}?v=${Date.now()}`)
    await view.waitForFunction(() => window.__registered === true, null, { timeout: 20000 }).catch(() => {})
    await view.waitForTimeout(1200)
  }
  const setLook = look => view.evaluate(l => localStorage.setItem('hermes.plugin.hermes-atrium.look', JSON.stringify(l)), look)
  const readRecord = key => view.evaluate(k => {
    const raw = localStorage.getItem('hermes.plugin.hermes-atrium.' + k)
    return raw === null ? null : JSON.parse(raw)
  }, key)

  await open()

  check('plugin registers', await view.evaluate(() => window.__registered === true))
  check('settings page contributed', await view.evaluate(() => !!window.__settings))
  check('painting resolved', logs.some(l => l.includes('[hermes-atrium] painting:')), logs.find(l => l.includes('painting:')) || 'no line')
  check('no page errors', !logs.some(l => l.startsWith('[pageerror]')), logs.filter(l => l.startsWith('[pageerror]')).join(' | '))
  const sheet = await view.evaluate(() => [
    document.getElementById('atr-chrome-base')?.textContent.length || 0,
    document.getElementById('atr-chrome-details')?.textContent.length || 0
  ])
  check('both sheet sections installed', sheet[0] > 1000 && sheet[1] > 1000, `${sheet[0]} / ${sheet[1]} chars`)

  // Every Custom slot paints its own picture and its own ground.
  for (const [look, file, ground] of [
    ['custom', 'watersky.jpg', '#1b3350'],
    ['custom2', 'goldensky.jpg', '#2e2022'],
    ['custom3', 'nightsky.jpg', '#211d3d']
  ]) {
    await setLook(look)
    await open()
    const state = await view.evaluate(() => {
      const base = document.getElementById('atr-chrome-base')?.textContent || ''
      const bg = base.slice(base.indexOf('html::before'))
      const pic = /url\("(file:[^"]+)"\);/.exec(bg)
      const g = /--theme-neutral-chrome: rgba\((\d+), (\d+), (\d+)/.exec(base)
      return { pic: pic ? decodeURI(pic[1]) : null, ground: g ? '#' + [g[1], g[2], g[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : null }
    })
    check(`${look} paints ${file}`, !!state.pic && state.pic.endsWith('/assets/' + file), state.pic ? state.pic.split('/').pop() : 'no url')
    check(`${look} keeps its own ground`, state.ground === ground, String(state.ground))
    if (state.pic) {
      // The fake root is a temp dir; the bytes come from there, not from the
      // fake home the plugin was told about.
      const disk = decodeURIComponent(state.pic.replace('file://', '')).replace(/.*hermes-atrium/, path.join(dir, '..', 'hermes-atrium'))
      try {
        const bytes = await fs.readFile(disk)
        check(`${look} picture is a real JPEG`, bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.length > 100000, `${bytes.length} bytes`)
      } catch (e) { check(`${look} picture is a real JPEG`, false, String(e.message)) }
    }
  }

  // The gallery names and previews each look.
  await setLook('custom2')
  await open()
  await view.evaluate(() => window.__mountSettings())
  await view.waitForTimeout(200)
  const gallery = await view.evaluate(() => ['Gruvbox', 'Custom 1', 'Custom 2', 'Custom 3'].map(label => {
    const el = document.querySelector(`#atrium-settings [aria-label="${label}"]`)
    const swatch = el ? el.querySelector('span[aria-hidden]') : null
    return { label, present: !!el, text: el ? el.textContent : '', style: swatch ? swatch.getAttribute('style') || '' : '' }
  }))
  for (const g of gallery) check(`gallery tile ${g.label}`, g.present, g.text.replace(/\s+/g, ' ').slice(0, 70))
  check('Custom 1 names Watersky', gallery[1].text.includes('Watersky'), gallery[1].text.slice(0, 40))
  check('Custom 2 names Goldensky', gallery[2].text.includes('Goldensky'), gallery[2].text.slice(0, 40))
  check('Custom 3 names Nightsky', gallery[3].text.includes('Nightsky'), gallery[3].text.slice(0, 40))
  check('Custom 2 tile previews goldensky.jpg', gallery[2].style.includes('goldensky.jpg'), gallery[2].style.slice(0, 100))

  // A knob writes the marker and the palette to the record and the theme file.
  const moved = await view.evaluate(() => {
    const row = document.querySelector('#atrium-settings input[type=range][aria-label="Cards"]')
    if (!row) return false
    row.value = '0.95'
    row.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })
  check('found the Cards opacity control', moved)
  await view.waitForTimeout(400)
  const rec = await readRecord('skin2')
  check('record keeps the preset marker', rec?.image === 'assets/goldensky.jpg', String(rec?.image))
  check('record took the knob', Number(rec?.card) === 0.95, String(rec?.card))
  check('record keeps its own palette', rec?.ground === '#2e2022' && rec?.accent === '#eeae8a', `${rec?.ground} ${rec?.accent}`)
  // The page's dependent and retired controls.
  const controls = await view.evaluate(() => {
    const root = document.getElementById('atrium-settings')
    const range = label => root.querySelector(`input[type=range][aria-label="${label}"]`)
    return {
      blur: range('Glass blur')?.value,
      saturateOff: range('Glass saturation')?.hasAttribute('disabled'),
      brightnessOff: range('Glass brightness')?.hasAttribute('disabled'),
      tint: root.textContent.includes('Tint the accent'),
      chatPane: root.textContent.includes('Chat pane opacity')
    }
  })
  check('saturation and brightness are greyed out at blur 0', controls.blur === '0' && controls.saturateOff && controls.brightnessOff, JSON.stringify(controls))
  check('retired controls are gone', !controls.tint && !controls.chatPane)
  // A web address typed into the picture box is refused, not painted.
  await view.evaluate(() => {
    const box = document.querySelector('#atrium-settings input[aria-label="Picture path"]')
    box.value = 'https://example.com/x.jpg'
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  })
  await view.waitForTimeout(200)
  const afterUrl = await readRecord('skin2')
  check('a web address is refused as a picture', afterUrl?.image === 'assets/goldensky.jpg', String(afterUrl?.image))
  check('a preset picture stores no picture key',await view.evaluate(() => localStorage.getItem('hermes.plugin.hermes-atrium.skinImage2')) === null)
  const fileText = await view.evaluate(() => {
    const p = [...window.__bridge.files.keys()].find(k => k.endsWith('hermes-atrium-theme-2.json'))
    return p ? window.__bridge.files.get(p) : null
  })
  check('theme file written for the look', !!fileText)
  if (fileText) {
    let parsed = null
    try { parsed = JSON.parse(fileText) } catch {}
    check('theme file carries the preset', parsed?.ground === '#2e2022' && parsed?.image === 'assets/goldensky.jpg', parsed ? `${parsed.ground} ${parsed.image}` : 'unparsable')
  }

  // Reset returns the slot to its own preset.
  const reset = await view.evaluate(() => {
    const b = [...document.querySelectorAll('#atrium-settings button')].find(x => x.textContent.trim() === 'Reset look')
    if (!b) return false
    b.click(); return true
  })
  check('found the Reset button', reset)
  await view.waitForTimeout(500)
  const afterReset = await view.evaluate(() => {
    const base = document.getElementById('atr-chrome-base')?.textContent || ''
    const bg = base.slice(base.indexOf('html::before'))
    const pic = /url\("(file:[^"]+)"\);/.exec(bg)
    const raw = localStorage.getItem('hermes.plugin.hermes-atrium.skin2')
    return { rec: raw ? JSON.parse(raw) : null, pic: pic ? decodeURI(pic[1]).split('/').pop() : null }
  })
  check('Reset restores the preset picture', afterReset.rec?.image === 'assets/goldensky.jpg' && afterReset.pic === 'goldensky.jpg', `${afterReset.rec?.image} / ${afterReset.pic}`)
  check('Reset restores the preset opacity', Number(afterReset.rec?.card) === 0.82, String(afterReset.rec?.card))

  // An upload overrides the marker, and Reset clears it again.
  await view.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64
    const g = c.getContext('2d'); g.fillStyle = '#3355ff'; g.fillRect(0, 0, 64, 64)
    const rec = JSON.parse(localStorage.getItem('hermes.plugin.hermes-atrium.skin2') || '{}')
    delete rec.image
    // Exactly the shape writeLookSkin produces for a real picture.
    localStorage.setItem('hermes.plugin.hermes-atrium.skinImage2', JSON.stringify(c.toDataURL('image/png')))
    localStorage.setItem('hermes.plugin.hermes-atrium.skin2', JSON.stringify(rec))
  })
  await open()
  const uploaded = await view.evaluate(() => {
    const base = document.getElementById('atr-chrome-base')?.textContent || ''
    const bg = base.slice(base.indexOf('html::before'))
    return /url\("(data:image\/[a-z]+;base64,[^"]{20,40})/.exec(bg)?.[1] || null
  })
  check('an uploaded picture wins over the marker', !!uploaded && uploaded.startsWith('data:image'), String(uploaded).slice(0, 30))
  await view.evaluate(() => window.__mountSettings())
  const resetUpload = await view.evaluate(() => {
    const b = [...document.querySelectorAll('#atrium-settings button')].find(x => x.textContent.trim() === 'Reset look')
    if (!b) return false
    b.click(); return true
  })
  check('found Reset with an upload in place', resetUpload)
  await view.waitForTimeout(600)
  const cleared = await view.evaluate(() => ({
    key: localStorage.getItem('hermes.plugin.hermes-atrium.skinImage2'),
    rec: JSON.parse(localStorage.getItem('hermes.plugin.hermes-atrium.skin2') || 'null')
  }))
  check('Reset clears the uploaded picture key', cleared.key === null || cleared.key === JSON.stringify(''), String(cleared.key).slice(0, 20))
  check('Reset returns to the preset marker', cleared.rec?.image === 'assets/goldensky.jpg', String(cleared.rec?.image))

  // The upgrade path: an install from the previous build.
  const prevDefault = {
    image: 'file:///fake/home/.hermes/desktop-plugins/hermes-atrium/assets/backwater.jpg',
    fit: 'cover', posX: 46, posY: 45, scrim: 0.31, blur: 0, saturate: 1.3, brightness: 0.9,
    chrome: 0.74, sidebar: 0, card: 0.78, bubble: 0.78, page: 0.86,
    ground: '#16261e', deeper: '#0c1612', cardTint: '#1d3328', bubbleTint: '#2b4636',
    edge: '#4f7360', accent: '#fe8019', ink: '#fbf1c7', ink2: '#ebdbb2',
    quiet: '#bdae93', ink3: '#d5c4a1', ink4: '#a89984', link: '#83a598', code: '#d3869b', quote: '#8ec07c'
  }
  const prevEdited = { ...prevDefault, ground: '#101820', accent: '#ff8800', scrim: 0.5 }
  await view.evaluate(([a, b]) => {
    localStorage.setItem('hermes.plugin.hermes-atrium.skin2', JSON.stringify(a))
    localStorage.setItem('hermes.plugin.hermes-atrium.skin3', JSON.stringify(b))
    localStorage.setItem('hermes.plugin.hermes-atrium.look', JSON.stringify('custom2'))
  }, [prevDefault, prevEdited])
  await open()
  const upgraded = await view.evaluate(() => {
    const base = document.getElementById('atr-chrome-base')?.textContent || ''
    const bg = base.slice(base.indexOf('html::before'))
    const pic = /url\("(file:[^"]+)"\);/.exec(bg)
    return {
      r2: JSON.parse(localStorage.getItem('hermes.plugin.hermes-atrium.skin2') || 'null'),
      r3: JSON.parse(localStorage.getItem('hermes.plugin.hermes-atrium.skin3') || 'null'),
      pic: pic ? decodeURI(pic[1]).split('/').pop() : null
    }
  })
  check('upgrade adopts the preset in an untouched slot', upgraded.r2?.ground === '#2e2022' && upgraded.r2?.image === 'assets/goldensky.jpg', `${upgraded.r2?.ground} ${upgraded.r2?.image}`)
  check('upgrade paints the preset picture', upgraded.pic === 'goldensky.jpg', String(upgraded.pic))
  check('upgrade keeps a real edit', upgraded.r3?.ground === '#101820' && upgraded.r3?.accent === '#ff8800', `${upgraded.r3?.ground} ${upgraded.r3?.accent}`)
  check('upgrade keeps the edited slot\'s own picture', String(upgraded.r3?.image || '').endsWith('backwater.jpg'), String(upgraded.r3?.image))

  // Gruvbox moves from the old green surfaces to gruvbox's own greys, but only
  // where a surface was still at the old default.
  await view.evaluate(rec => {
    localStorage.setItem('hermes.plugin.hermes-atrium.gruvboxSkin', JSON.stringify(rec))
    localStorage.setItem('hermes.plugin.hermes-atrium.look', JSON.stringify('gruvbox'))
  }, { ...prevDefault, blur: 5, edge: '#123456' })
  await open()
  const gruv = await view.evaluate(() => {
    const base = document.getElementById('atr-chrome-base')?.textContent || ''
    const g = /--theme-neutral-chrome: rgba\((\d+), (\d+), (\d+)/.exec(base)
    return {
      rec: JSON.parse(localStorage.getItem('hermes.plugin.hermes-atrium.gruvboxSkin') || 'null'),
      painted: g ? '#' + [g[1], g[2], g[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : null
    }
  })
  check('Gruvbox upgrade takes the real gruvbox ground', gruv.rec?.ground === '#282828' && gruv.rec?.deeper === '#1d2021' && gruv.painted === '#282828', `${gruv.rec?.ground} ${gruv.rec?.deeper} painted ${gruv.painted}`)
  check('Gruvbox upgrade keeps a chosen surface and other knobs', gruv.rec?.edge === '#123456' && Number(gruv.rec?.blur) === 5, `${gruv.rec?.edge} blur ${gruv.rec?.blur}`)

  // Screenshots from clean storage, for a human eye. The page is http and the
  // sheet names file:// urls, so those are pointed at the server for the shot
  // only; this changes nothing the assertions above read.
  await view.evaluate(() => localStorage.clear())
  const shots = path.join(WORK, 'shots')
  await fs.mkdir(shots, { recursive: true })
  for (const look of ['gruvbox', 'custom', 'custom2', 'custom3']) {
    await setLook(look)
    await open()
    await view.evaluate(origin => {
      for (const s of document.querySelectorAll('style')) {
        if (s.textContent && s.textContent.includes('file://')) {
          s.textContent = s.textContent.replace(/file:\/\/\/fake\/home\/\.hermes\/desktop-plugins\/hermes-atrium\//g, origin + '/')
        }
      }
    }, origin)
    await view.waitForTimeout(900)
    await view.screenshot({ path: path.join(shots, `${look}.png`) })
  }
  console.log(`\nshots: ${path.relative(process.cwd(), shots)}/`)

  await browser.close()
  server.close()
  const failed = results.filter(r => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  await fs.writeFile(path.join(WORK, 'last-run.json'), JSON.stringify(results, null, 2))
  process.exit(failed.length ? 1 : 0)
}

main().catch(error => { console.error('harness error:', error); process.exit(2) })
