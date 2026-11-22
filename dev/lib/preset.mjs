// Shared plumbing for the dev tools: read the plugin's own preset tables out of
// plugin.js, find a browser, and serve a fake install.
//
// Everything here reads plugin.js rather than restating it. A tool that carries
// its own copy of a palette measures its copy, not the look you are shipping,
// and goes quietly out of date the first time someone edits the preset.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const REPO = path.resolve(import.meta.dirname, '..', '..')
// The plugin ships as a package's desktop half: desktop/plugin.js and its
// pictures. The fake install below is what Hermes copies that folder into.
export const PLUGIN = path.join(REPO, 'desktop', 'plugin.js')
export const ASSETS = path.join(REPO, 'desktop', 'assets')

const source = () => fs.readFile(PLUGIN, 'utf8')

// The source text of a literal assigned to `const <name> = { ... }` (or
// `[ ... ]`), found by bracket matching so a nested object or a brace inside a
// string cannot end it early.
function literal(file, name, open = '{', close = '}') {
  const start = file.search(new RegExp(`const\\s+${name}\\s*=\\s*\\${open}`))
  if (start < 0) throw new Error(`no \`const ${name} = ${open}\` in plugin.js`)
  let depth = 0
  for (let j = file.indexOf(open, start); j < file.length; j += 1) {
    const c = file[j]
    if (c === open) depth += 1
    else if (c === close) {
      depth -= 1
      if (depth === 0) return file.slice(file.indexOf(open, start), j + 1)
    }
  }
  throw new Error(`unbalanced ${open}${close} after \`const ${name}\``)
}

// A table's value, by writing the literal to a throwaway module and importing
// it. That is the same parse the app does when it loads plugin.js, so the tool
// cannot be more lenient or stricter than the real loader.
//
// Deliberately not eval or new Function: those accept expressions, and a tool
// that could execute plugin.js source would turn a stale palette into a much
// worse bug. If a table ever stops being a literal at all, the import fails
// with a SyntaxError, which is the loud outcome a measurement tool wants.
const cache = new Map()
async function table(name, open, close, stubs = {}) {
  const key = `${name}${open}`
  if (cache.has(key)) return cache.get(key)
  const file = await source()
  // A table may name a module-level constant (SKIN_DEFAULTS points `image` at
  // PAINTING_URL, which is resolved at runtime). Stub it with a value of the
  // same shape, so the literal stays the thing under test.
  const preamble = Object.entries(stubs)
    .map(([key, value]) => `const ${key} = ${JSON.stringify(value)}`)
    .join('\n')
  const text = `${preamble}\nexport default ${literal(file, name, open, close)}\n`
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atrium-tables-'))
  const filePath = path.join(dir, `${name}.mjs`)
  await fs.writeFile(filePath, text)
  try {
    const mod = await import(pathToFileURL(filePath).href)
    cache.set(key, mod.default)
    return mod.default
  } catch (error) {
    throw new Error(`${name} in plugin.js is not a plain literal: ${error.message}`)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

export async function readTables() {
  return {
    LOOK_PRESETS: await table('LOOK_PRESETS'),
    SKIN_DEFAULTS: await table('SKIN_DEFAULTS', '{', '}', { PAINTING_URL: 'data:,' }),
    PANEL_DEFAULTS: await table('PANEL_DEFAULTS'),
    LOOK_IDS: await table('LOOK_IDS', '[', ']')
  }
}

// The install directory the plugin expects: a folder called hermes-atrium with
// plugin.js at the top and pictures in assets/. The plugin finds itself by id,
// but the fake root keeps the real shape so path building is exercised.
export async function buildFakeInstall() {
  const root = path.join(os.tmpdir(), 'atrium-dev-install')
  const dir = path.join(root, 'hermes-atrium')
  await fs.rm(root, { recursive: true, force: true })
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true })
  let src = await source()
  src = src.split("from '@hermes/plugin-sdk'").join("from '/sdk.js'")
  src = src.split("from 'react/jsx-runtime'").join("from '/jsx.js'")
  await fs.writeFile(path.join(dir, 'plugin.js'), src)
  for (const f of await fs.readdir(ASSETS)) {
    await fs.copyFile(path.join(ASSETS, f), path.join(dir, 'assets', f))
  }
  return { root, dir, assets: path.join(dir, 'assets') }
}

// A browser, from the first place that has one. HERMES_CHROMIUM wins, then a
// Chromium the Hermes desktop already downloaded, then a system Chrome.
export async function findChrome() {
  const candidates = []
  if (process.env.HERMES_CHROMIUM) candidates.push(process.env.HERMES_CHROMIUM)
  const tools = path.join(os.homedir(), '.hermes', 'tools')
  const names = await fs.readdir(tools).catch(() => [])
  for (const n of names.filter(n => n.startsWith('chromium-'))) {
    candidates.push(path.join(tools, n, 'chrome-linux64', 'chrome'))
    candidates.push(path.join(tools, n, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
    candidates.push(path.join(tools, n, 'chrome-win64', 'chrome.exe'))
  }
  candidates.push(
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  )
  for (const c of candidates) {
    try { await fs.access(c); return c } catch {}
  }
  throw new Error('no Chromium found. Set HERMES_CHROMIUM to a browser binary.')
}

// A static server for the harness page. Routes are explicit because the fake
// install is addressed by paths that look real (/assets/<file>) while the plugin
// resolves them as file:// urls.
export async function serve(routes) {
  const http = await import('node:http')
  const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0]
    const hit = routes[url]
    if (!hit) { res.writeHead(404); return res.end('not found') }
    try {
      const body = await fs.readFile(hit)
      res.writeHead(200, { 'content-type': hit.endsWith('.js') ? 'text/javascript'
        : hit.endsWith('.html') ? 'text/html' : 'application/octet-stream' })
      res.end(body)
    } catch { res.writeHead(404); res.end('not found') }
  })
  const port = await new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)))
  return { server, port, origin: `http://127.0.0.1:${port}` }
}

// The plugin keeps its panel solver private, so a measurement tool has to
// restate it. Naming the functions here makes that debt visible: when one of
// them changes in plugin.js, change it here too.
export const MIRRORED = ['pictureBackdrop', 'replyMaterial', 'replyPanelTone']
