# Hermes Atrium

A desktop plugin for Hermes Agent. It puts a painting, or any picture you
choose, behind the app. It lays tinted glass over it.

One look, two ways: the Gruvbox preset, and three Custom slots of your own.

- **Gruvbox**: a landscape behind dark, warm glass. Tints from the painting
  itself. A slider can trade the painting for your desktop wallpaper.
- **Custom 1, 2 and 3**: the same machinery driven by your own pictures and
  colours. Each slot keeps its own picture, palette and opacities, so three
  setups can sit ready and be switched from the status bar.

**No network access of any kind**. Nothing in
this plugin leaves your computer.

## Install

Copy this folder to your Hermes desktop-plugins directory:

```
~/.hermes/desktop-plugins/hermes-atrium/
├── plugin.js
└── assets/
    └── backwater.jpg
```

On Windows that is `%USERPROFILE%\.hermes\desktop-plugins\hermes-atrium\`. Then restart
Hermes, or toggle the plugin in **Settings ▸ Plugins**.

The folder must keep this shape: `plugin.js` at the top, pictures in `assets/`.
The plugin finds itself by the id it declares, `hermes-atrium`, so the folder
itself can be renamed.

## Pictures

Every picture comes from `assets/`, and only from `assets/`:

- `backwater.jpg` is the painting the theme ships with, and it wins by name.
- Any other image dropped in `assets/` is used only if that file is missing, so
  the folder can hold test pictures without them becoming the default (`.jpg`,
  `.png`, `.webp`, `.avif`). Only `backwater.jpg` is committed; the rest are
  ignored by git.
- A picture sitting next to `plugin.js`, or in another plugin's folder, is
  never picked up.

To use your own wallpaper instead, open **Settings --> Hermes Atrium** and switch on
**Tint** under Gruvbox: the painting fades out and the desktop shows through the
glass. The painting's own colours are kept for when you switch back.

## Reply panels

**Settings --> Hermes Atrium --> Chat & motion --> Reply panels** gives every reply a solid
panel, so prose never sits directly on the picture. With it on, five sliders
appear:

| Slider | What it does |
| --- | --- |
| Solidity | The floor: a panel is never thinner than this, so text stays readable in every light. |
| Maximum opacity | The ceiling, used only when the backdrop is bright enough to need it. |
| Panel tone | How far the panel steps away from the backdrop's own brightness. 0 matches it. |
| Edge definition | How visible the panel's edge must be against the picture, as a contrast ratio. |
| Inner padding | Breathing room between the text and the panel's edge. |

The panel's tone is solved against the picture actually behind the reading
column, not guessed, so the same numbers work on the shipped painting and on a
photograph you drop in. **Reset panel** returns all five to the shipped values.

## Custom looks

There are three Custom looks. Each one is a complete record of the same knobs:
its own picture, framing, colours, opacities, fit and panel dials. What you
change under Custom 2 stays under Custom 2, and the status bar chip switches
between them without touching anything else.

Each look also has its own editable file beside `plugin.js`:

| Look | File |
| --- | --- |
| Custom 1 | `~/.hermes/hermes-atrium-theme.json` |
| Custom 2 | `~/.hermes/hermes-atrium-theme-2.json` |
| Custom 3 | `~/.hermes/hermes-atrium-theme-3.json` |

**Theme file** in Settings opens the one for the look you have selected, and
creates it from that look's current values if it is not there yet. Every key is
optional. Anything left out keeps its default. Edit it in any editor and the app
follows within a couple of seconds. Moving a knob in Settings writes it back.

Pictures you upload are kept in the app's local storage, which holds about 5 MB
shared by everything, so one picture is fitted to roughly a third of that and
the three looks share the room. A picture that will not fit is reported in the
console rather than dropped without a word. A path to a file on disk
(`~/Pictures/x.jpg`) has no such limit and is the better choice for a large
photograph.

## What it also adds

- A floating sessions sidebar that slides open and shut.
- Wide, legible tabs, with keyboard bindings to move between them.
- Finished turns fold their thinking and tool steps into one line.
- Snippet cards you can pin, drag onto a shelf, or keep in a library.
- A status panel at the foot of the sidebar in Simple mode.
- Suggestions on a new tab, learned only from local session activity.

Every one of those is a switch in **Settings --> Hermes Atrium**.
