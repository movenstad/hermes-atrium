# dev/

Two local tools for the parts of this plugin that cannot be checked by reading
the code. Neither is part of the plugin: the app loads `desktop/plugin.js` and
`desktop/assets/`, nothing here. They live in the repo because both were written twice
already, and the second time is where the arithmetic slips.

```
npm --prefix dev install    # once: the only dependency, playwright-core
npm --prefix dev run measure   # every look's palette, against its own picture
npm --prefix dev test          # load the plugin in Chromium and assert behaviour
```

Both find a browser by themselves: `HERMES_CHROMIUM` if you set it, then a
Chromium the Hermes desktop downloaded under `~/.hermes/tools/`, then a system
Chrome. Nothing downloads a browser.

## measure-palettes.mjs

Prints, for Gruvbox and every Custom preset, the worst contrast each surface
reaches anywhere in the window: the reply panel, the chrome pane, a sidebar
card, your own message, a page, and the accent text. Then the faint text tiers
on the chrome pane, against Gruvbox's own numbers as the bar.

It reads the palettes out of `plugin.js` rather than carrying a copy, so what it
measures is what ships. If you change a preset and this still prints the old
colours, you edited the wrong table.

The maths is a mirror of the plugin's: the picture is drawn into a 64px canvas
by Chromium (the same cap `preparePictureBackdrop` uses), sampled on the 16x16
grid `pictureBackdrop` uses over the reading column, and the reply panel's tone
and alpha are solved by the same walk `replyPanelTone` and `replyMaterial` do.
Those three are named in `MIRRORED` in `lib/preset.mjs`; when one changes in
`plugin.js`, change it here too, or the numbers stop meaning anything.

It fails the run on the two things that are bugs rather than taste: body text
under AA on the reading column, and a faint tier quieter than Gruvbox's own on
the same surface. Colour that is merely different is not a failure.

Pass a look to check just one: `npm --prefix dev run measure -- watersky`.

## test-plugin.mjs

Loads `plugin.js` in real Chromium with stubbed SDK modules and a fake desktop
file bridge, mounts the real settings page, and asserts 40 things: each Custom
slot paints its own picture and ground, the gallery names and previews the right
look, a knob move persists the marker and the palette to the record and the
theme file without leaking into another slot, Reset returns a slot to its own
preset and clears an uploaded picture key, and an install from the previous
build adopts the presets while keeping real edits.

The stubs matter. The SDK ones must return real DOM nodes: a stub returning
`null` or a plain object renders an empty tree, and every control assertion then
fails for the wrong reason. The bridge must carry the full shape
(`desktopPluginsRoot`, `readDir`, `readFileText`, `writeTextFile`, `revealPath`)
or the plugin bails out of path resolution and no look owns a theme file.

Screenshots of all four looks land in `.work/shots/` for a human eye. They are
not assertions: the tool proves a picture resolved, not that it looks good.

## Generated files

All of it goes in `dev/.work/`, which is gitignored along with `node_modules/`
and `package-lock.json`. Nothing here should ever be committed as output.
