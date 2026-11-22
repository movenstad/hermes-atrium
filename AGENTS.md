# AGENTS.md

Guidance for anyone changing this repo, human or agent.

## This repo

One file, `plugin.js`, is the whole plugin: plain ESM that the Hermes desktop app
loads at runtime from `<HERMES_HOME>/desktop-plugins/hermes-atrium/` and registers
through its own contribution areas. There is no build step and no bundler.

It ships a Gruvbox preset and three independent Custom slots, each with its own
record and theme file. The Custom slots are born as designed looks of their own
(Watersky, Goldensky, Nightsky, seeded from `LOOK_PRESETS`), so a fresh install
has four finished appearances. It paints a picture from `assets/` behind the
window, and solves a readable panel tone per reply. It makes no network requests.

## Ground rules

- **Ask before committing or pushing.** Stage and show the diff first.
- Don't reformat or rename regions you aren't changing. The file is big enough
  that a wide diff is expensive to review.
- Don't commit generated output, screenshots or test scaffolding.

## Hard constraints

Each of these has already caused a silent failure here.

1. **Imports are restricted.** The loader maps only `@hermes/plugin-sdk` and
   `react*`. A relative path, a bare package name or a URL is refused when the
   plugin loads, and the refusal is not obvious at a glance. Everything the
   plugin needs must live in `plugin.js`.

2. **Never put a picture in a CSS custom property.** Chromium discards a custom
   property whose value reaches 2 MiB, and does it silently: the declaration
   disappears, `var()` falls through to its fallback, and the UI looks like your
   change was ignored. This is why the background picture is written inline in
   `background-image` rather than through a variable. `background-image` itself
   has no such limit.

3. **`ctx.storage` writes fail silently.** The host catches quota and permission
   errors and discards them, so an oversized value simply never persists. The
   picture data URL is the one large value stored, and three looks can each hold
   one, so it is capped at a share of the ~5 MB origin store rather than at a
   fixed size (`pictureBudget` in plugin.js). A changed picture is read back once
   to prove it landed, because the alternative is a look that shows a picture it
   will not have next launch. Size anything else before you store it.

4. **`assets/` is the only picture source.** The resolver looks inside this
   plugin's own `assets/` and nowhere else. Don't add a fallback to the plugin
   root, to a sibling plugin, or to a URL. A look names a shipped picture as the
   marker `assets/<file>`, which `resolvePluginFiles` turns into a file URL once
   it has scanned the folder (see `ASSET_IMAGES`). The indirection exists because
   a look's record is built before the desktop bridge has answered, so an
   absolute path cannot exist yet, and because an unresolved marker must fall
   back to the shipped painting rather than paint nothing. Never store a resolved
   path where a marker will do: a path goes stale when the folder moves.

5. **Renaming the plugin id or theme name is a migration.** The app remembers the
   last chosen theme. If the plugin stops recognising that name at launch it
   treats it as a Hermes theme and parks itself, so `isOurTheme` must keep
   accepting every name the plugin has published (`zephyr-sky`, `atrium`, now
   `hermes-atrium`).

## How to change things

**Adding a setting.** Add the key to `STORE_KEYS`, an atom inside `register()`, a
line in `persist()`, and a row in the settings page. Once released, never change
a stored key string: users have data under it.

**Adding a look.** A look is a saved skin, not a code path. Add its id to
`LOOK_IDS`, its label to `LOOK_LABELS`, an entry to `SKIN_STORES` (its own record
key, picture key and theme file name), and a preview to `APPEARANCE_LOOKS`. The
gallery, the status chip, the theme-file button and the picture heal all read
those, so nothing else needs a branch. Never rename `custom`: that id, its
`skin`/`skinImage` keys and its `hermes-atrium-theme.json` file are what every
install that already has a Custom look is holding.

A Custom slot is born from `LOOK_PRESETS` (via `presetSkin`), not from
`SKIN_DEFAULTS`, and Reset returns it to its own preset rather than to the
shipped painting. Two rules follow. A stored record still holding nothing but the
shipped Gruvbox defaults counts as untouched (`isShippedDefaults`), because that
is what the previous build wrote the moment any knob moved; without the rule an
upgrade would keep three gruvbox-coloured slots. And an uploaded picture lives
under the slot's own picture key while the record keeps the `assets/<file>`
marker, so `writeLookSkin` must clear that key when a slot goes back to its
preset, or the old upload wins on the next read.

**Adding a class, property or attribute.** Internal names use the `atr-` prefix:
`--atr-*` custom properties, `.atr-*` classes, `data-atr-*` attributes, `atr-*`
ids. Check the prefix is unused by the host before introducing a new one.

**Adding a picture.** Drop it in `assets/`. `backwater.jpg` is the default and
wins by name; any other image is used only when it is absent, and the fallback
picks in sorted order so the choice cannot drift between launches.

Four pictures are committed: `backwater.jpg` plus the three the Custom presets
name (`watersky.jpg`, `goldensky.jpg`, `nightsky.jpg`). The rest are gitignored
for testing, so a new shipped picture needs a `!assets/<file>` line in
`.gitignore` and a credit in the README. Keep the shipped ones as sized JPEGs:
the originals were 8 to 22 MB PNGs, and a repository that carries four of them
at full resolution is one nobody wants to clone. A preset's picture is named by
its slot, so it must not be picked by sort order.

**Changing a preset's palette.** Measure it, don't pick it by eye. The panel
solver composites the scrim, the glass and the reply panel over the picture's
own pixels, so a palette that looks fine on a swatch can still land under AA
behind the reading column. `dev/measure-palettes.mjs` runs that same chain and
prints the worst contrast every surface reaches; it fails on body text under AA
and on a faint tier quieter than Gruvbox's own. It reads the palettes out of
`plugin.js`, so it measures what ships rather than a copy. When you change one of
`pictureBackdrop`, `replyPanelTone` or `replyMaterial` in `plugin.js`, change its
mirror there too.

**Changing the reply panel.** The dials solve a tone against samples of the
picture behind the reading column. Keep two properties, both testable: the ink
clears WCAG AA against the panel it sits on, and raising `solid` never makes the
panel thinner.

## Style

- `plugin.js` is organised into eight `§` sections. Put code in the right one and
  update the contents list at the top of the file.
- Comments should say why, especially where a value looks arbitrary. State the
  failure a rule prevents instead of restating the code.
- Plain words, no em-dashes in new prose or comments. The README is the model.
  The older comments in `plugin.js` predate the rule and contain them; leave
  those alone unless you are rewriting the line anyway.
- Use the host's own mechanisms (contributions, `ctx.storage`, the SDK
  components) rather than bespoke DOM plumbing, and don't add a dependency.

## Before you call it done

- `npm run check` runs `node --check` on `plugin.js`.
- `npm --prefix dev run test` loads the plugin in Chromium and checks that every
  look paints its own picture, that a knob persists, and that an upgrade keeps
  real edits. It also writes screenshots to `dev/.work/shots/`.
- Load it and read the console. A healthy load is not silent: it logs
  `[hermes-atrium] painting: <folder>/assets/<file>`. Missing that line means the
  file bridge or the picture did not resolve, which is the failure mode behind
  several past bugs.
- Look at the change on screen. The bugs that hurt were invisible in review: a
  picture silently falling back to the shipped painting, a panel matching its
  backdrop exactly, an icon turning to mush at 16px.
- Say what you verified and what you didn't.

## Known sharp edges

- `plugin.js` is about 5,100 lines. Read the `§` map at the top, then grep for
  the section tag rather than reading linearly.
- One `setInterval` loop runs for the life of the plugin: a 2s poll of
  `hermes-atrium-theme.json`. Don't add per-frame work to it.
- The style sheet is emitted as text and rebuilt when a look changes. Treat it as
  a string, not a live style.
