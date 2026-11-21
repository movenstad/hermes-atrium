# Hermes Atrium

A desktop plugin for Hermes Agent. It puts a painting, or any picture you
choose, behind the app. It lays tinted glass over it.

Two looks, no more:

- **Gruvbox**: a landscape behind dark, warm glass. Tints from the painting
  itself. A slider can trade the painting for your desktop wallpaper.
- **Custom**: the same machinery driven by your own picture and colours.

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

## Custom look

`~/.hermes/hermes-atrium-theme.json` *is* the Custom look. Every key is optional.
Anything left out keeps its default. Edit it in any editor and the app follows
within a couple of seconds. Moving a knob in Settings writes it back.

## What it also adds

- A floating sessions sidebar that slides open and shut.
- Wide, legible tabs, with keyboard bindings to move between them.
- Finished turns fold their thinking and tool steps into one line.
- Snippet cards you can pin, drag onto a shelf, or keep in a library.
- A status panel at the foot of the sidebar in Simple mode.
- Suggestions on a new tab, learned only from local session activity.

Every one of those is a switch in **Settings --> Hermes Atrium**.
