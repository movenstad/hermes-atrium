# AGENTS.md

Guidance for anyone changing this repo, human or agent.

## This repo

One file, `desktop/plugin.js`, is the whole plugin: plain ESM that the Hermes
desktop app loads at runtime and registers through its own contribution areas.
There is no build step and no bundler.

The repo is a Hermes plugin package: `plugin.yaml` at the root, the desktop half
in `desktop/` (`plugin.js` plus `assets/`). Hermes copies `desktop/` into
`<HERMES_HOME>/desktop-plugins/hermes-atrium/` at startup, so at runtime the
plugin sees `plugin.js` and `assets/` side by side. Work on a clone in
`<HERMES_HOME>/plugins/hermes-atrium/` and restart Hermes to load a change; the
app only loads a root-level `plugin.js` from `desktop-plugins/`, so a clone
placed there loads nothing.

It ships a Gruvbox preset and three independent Custom slots, each with its own
record and theme file. The Custom slots are born as designed looks of their own
(Watzmann, Stalheim, Dresden, seeded from `LOOK_PRESETS`), so a fresh install
has four finished appearances. It paints a picture from its `assets/` behind the
window, and solves a readable panel tone per reply. It makes no network requests.

The plugin is built to be listed in the Hermes plugin marketplace. Every change
has to keep it listable: read "Marketplace compliance" before adding anything
that touches the app.

## Ground rules

- **Ask before committing or pushing.** Stage and show the diff first.
- Don't reformat or rename regions you aren't changing. The file is big enough
  that a wide diff is expensive to review.
- Don't commit generated output, screenshots or test scaffolding. The one
  exception is `docs/images/`, which holds the README's pictures as sized JPEGs
  or PNGs (a few hundred KB each).

## Marketplace compliance

The catalog admits a plugin by PR, pinned to one commit, and a reviewer reads
that commit by hand. These rules are what got this version admitted; breaking
one gets it refused or delisted.

1. **SDK surface only (catalog rule 8).** Build features from the SDK's areas
   (`themes`, `transcript.directives`, settings, composer areas), `ctx.storage`,
   `host.state` and the theme APIs. Never:
   - query the app's own markup from JS (`data-slot`, `data-tour`,
     `data-sidebar`, `data-testid`, ...) to find something to drive;
   - observe `document.body`, or the whole document by another name
     (`documentElement`, a variable target, `?.observe?.(`);
   - click, rewrite, clone, move or re-title core UI, or add listeners that
     steer it (keyboard shortcuts on its controls, intercepted clicks);
   - use `eval`, `new Function`, dynamic `import()`, or inject `<script>`.

   `hermes plugins validate .` refuses the obvious forms. Don't route around
   its patterns: a reviewer reads the rest, and a disguised form is worse than
   an honest one. Read the app's state, not its markup. CSS over its surfaces
   is tolerated and reviewed; JS that drives them is not.

2. **The existing touchpoints are a fixed budget.** A few places still read the
   app's layout to decide what to paint: the page marks and the Sessions/Bots
   switch marks in §8, `fitColumn`, the wordmark and the narrow-overlay mask.
   They only set this plugin's own `data-atr-*` attributes and never act on the
   app. Don't add new ones, and don't widen these. If a feature needs more, ask
   Nous for an SDK hook instead.

3. **Removed features stay removed.** These were cut because they drove the
   app's own UI, and they must not come back in another form: the status dock
   and shelf, the floating sidebar, session-click tabs and their keybind, work
   folding, the chat-switch curtain, the "Pick up where you left off" cards, the
   menu exit ghosts, the snippet library, and the collapsed-pane title rewrite.
   The `classic` branch keeps them for reference only; never merge it.

4. **Disclose what it touches (catalog rule 13).** The README section "What it
   touches on your computer" must stay true. A change that adds a file it reads
   or writes, a storage key of real size, a timer, a new state it reads or any
   network use must update that section in the same commit. The answer to "does
   it make network requests" is no, and must stay no.

5. **Keep `requires_hermes` truthful (catalog rule 14).** `plugin.yaml` says
   `>=0.23.3`. Using an SDK export or host API newer than that means raising it
   in the same commit, or guarding the call so older hosts degrade quietly.

6. **Keep the package layout.** `plugin.yaml` at the root and the desktop half
   in `desktop/`. A root-level `plugin.js` fails the validator's `loadable`
   check.

7. **The raw file bridge has one job.** `window.hermesDesktop` is used only to
   find the plugin's own `assets/` folder and to read, write and reveal the
   three `hermes-atrium-theme*.json` files, because `ctx.files` cannot reach either
   place. The validator warns on it, and the README explains why. Don't use the
   bridge for anything else.

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

3. **The local store is shared, and full means broken.** `ctx.storage` writes go
   to one origin store that the app and every plugin share, and the host
   discards quota errors silently. Hermes saves its open tabs and pane layout
   there, so when the store fills, its saves fail too and a relaunch forgets the
   user's open chats. That happened here: old builds left megabytes of pictures
   behind. So:
   - The picture data URL is the one large value stored, and three looks can
     each hold one, so it is capped at a share of the store (`pictureBudget`).
     A changed picture is read back once to prove it landed.
   - Size anything else before you store it, and keep it small.
   - When a feature or key is retired, add its keys to `RETIRED_KEYS` so the
     load-time cleanup removes them from existing installs.

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
   accepting every name the plugin has published (`atrium`, now
   `hermes-atrium`). A renamed id also leaves the old id's storage behind; list
   it in `LEGACY_STORE_IDS` so the cleanup removes it.

## How to change things

**Adding a setting.** Add the key to `STORE_KEYS`, an atom inside `register()`, a
line in `persist()`, and a row in the settings page. Once released, never change
a stored key string: users have data under it.

**Removing a setting or feature.** Delete its code, move its keys from
`STORE_KEYS` to `RETIRED_KEYS`, and take it out of the README.

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
is what an earlier build wrote the moment any knob moved; without the rule an
upgrade would keep three gruvbox-coloured slots. And an uploaded picture lives
under the slot's own picture key while the record keeps the `assets/<file>`
marker, so `writeLookSkin` must clear that key when a slot goes back to its
preset, or the old upload wins on the next read.

**Adding a class, property or attribute.** Internal names use the `atr-` prefix:
`--atr-*` custom properties, `.atr-*` classes, `data-atr-*` attributes, `atr-*`
ids. Check the prefix is unused by the host before introducing a new one.

**Adding a picture.** Drop it in `desktop/assets/`. `charles-william-wyllie-the-backwater.jpg` is the
default and wins by name; any other image is used only when it is absent, and the
fallback picks in sorted order so the choice cannot drift between launches.

Four pictures are committed: `charles-william-wyllie-the-backwater.jpg` plus the three the Custom presets
name (`johan-christian-dahl-the-watzmann.jpg`, `johan-christian-dahl-stalheim.jpg`,
`johan-christian-dahl-view-of-dresden-by-moonlight.jpg`). The rest are gitignored
for testing, so a new shipped picture needs a `!desktop/assets/<file>` line in
`.gitignore` and a credit in the README with a licence that allows
redistribution. Keep the shipped ones as sized JPEGs, a few hundred KB to a few
MB each, so the repository stays easy to clone. A preset's picture is named by
its slot, so it must not be picked by sort order.

**Changing a preset's palette.** Measure it, don't pick it by eye. The panel
solver composites the scrim, the glass and the reply panel over the picture's
own pixels, so a palette that looks fine on a swatch can still land under AA
behind the reading column. `dev/measure-palettes.mjs` runs that same chain and
prints the worst contrast every surface reaches; it fails on body text under AA
and on a faint tier that breaks Gruvbox's hierarchy (Gruvbox's ratio for that
tier, scaled to how the look's own body text compares to Gruvbox's). A failing
tier is printed with the nearest colour that clears it, blended toward the
look's own ink. It reads the palettes out of
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
- No personal notes, names or handles in code or comments. Credits belong in
  the README.

## Before you call it done

- `npm run check` runs `node --check` on `desktop/plugin.js`.
- `hermes plugins validate .` is what the marketplace CI runs. It must pass with
  no refusals. Its "desktop surface review" warnings are what a reviewer will
  read, so a change should not add to them without a reason you would defend
  in review.
- `npm --prefix dev run test` loads the plugin in Chromium and checks that every
  look paints its own picture, that a knob persists, and that an upgrade keeps
  real edits. It also writes screenshots to `dev/.work/shots/`.
- Restart Hermes and read the console. A healthy load is not silent: it logs
  `[hermes-atrium] painting: <folder>/assets/<file>`. Missing that line means the
  file bridge or the picture did not resolve, which is the failure mode behind
  several past bugs.
- Look at the change on screen. The bugs that hurt were invisible in review: a
  picture silently falling back to the shipped painting, a panel matching its
  backdrop exactly, tabs forgotten after a relaunch.
- If the change touches what the plugin reads, writes or stores, check that the
  README disclosure still matches.
- Say what you verified and what you didn't.

## Known sharp edges

- `plugin.js` is about 4,900 lines. Read the `§` map at the top, then grep for
  the section tag rather than reading linearly.
- One `setInterval` loop runs for the life of the plugin: a 2s poll of the
  `hermes-atrium-theme*.json` files. Don't add per-frame work to it, and don't
  add another interval.
- The style sheet is emitted as text and rebuilt when a look changes. Treat it as
  a string, not a live style.
