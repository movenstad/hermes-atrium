# Atrium

A desktop plugin for Hermes Agent. It puts a painting — or any picture you
choose — behind the app, lays tinted glass over it, and gives every reply a
panel of its own.

Two looks, no more:

- **Gruvbox** — a landscape behind dark, warm glass. Tints from the painting
  itself; a slider can trade the painting for your desktop wallpaper.
- **Custom** — the same machinery driven by your own picture and colours.

There is no sky, no weather and **no network access of any kind**. Nothing in
this plugin leaves your computer.

## Install

Copy this folder to your Hermes desktop-plugins directory:

```
~/.hermes/desktop-plugins/atrium/
├── plugin.js
└── assets/
    └── gruvbox.jpg
```

On Windows that is `%USERPROFILE%\.hermes\desktop-plugins\atrium\`. Then restart
Hermes, or toggle the plugin in **Settings ▸ Plugins**.

The folder must keep this shape: `plugin.js` at the top, pictures in `assets/`.
The plugin finds itself by its id, so the folder itself can be renamed.

## Pictures

Every picture comes from `assets/`, and only from `assets/`:

- `gruvbox.jpg` is preferred.
- Any other image dropped in `assets/` is used if `gruvbox.jpg` is missing, so
  swapping the painting is a single file copy (`.jpg`, `.png`, `.webp`, `.avif`).
- A picture sitting next to `plugin.js`, or in another plugin's folder, is
  never picked up.

To use your own wallpaper instead, open **Settings ▸ Atrium** and switch on
**Tint** under Gruvbox: the painting fades out and the desktop shows through the
glass. The painting's own colours are kept for when you switch back.

## Reply panels

**Settings ▸ Atrium ▸ Chat & motion ▸ Reply panels** gives every reply a solid
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

`~/.hermes/atrium-theme.json` *is* the Custom look. Every key is optional;
anything left out keeps its default. Edit it in any editor and the app follows
within a couple of seconds; moving a knob in Settings writes it back.

## What it also adds

- A floating sessions sidebar that slides open and shut.
- Wide, legible tabs, with keyboard bindings to move between them.
- Finished turns fold their thinking and tool steps into one line.
- Snippet cards you can pin, drag onto a shelf, or keep in a library.
- A status panel at the foot of the sidebar in Simple mode.
- Suggestions on a new tab, learned only from local session activity.

Every one of those is a switch in **Settings ▸ Atrium**.
