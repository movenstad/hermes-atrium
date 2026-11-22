# Hermes Atrium

A desktop plugin for Hermes Agent. It puts a painting, or any picture you
choose, behind the app. It lays tinted glass over it.

One look, two ways: the already present Gruvbox preset, and three Custom slots of your own looks.

- **Gruvbox**: a landscape behind dark, warm glass. Tints from the painting
  itself. A slider can trade the painting for your desktop wallpaper.
- **Custom 1, 2 and 3**: the same machinery driven by your own pictures and
  colours. Each slot keeps its own picture, palette and opacities, so three
  setups can sit ready and be switched from the status bar. They also arrive
  finished: **Watersky**, **Goldensky** and **Nightsky** are three designed
  looks over the pictures below, and you can change any of it.

**No network access of any kind**. Nothing in
this plugin leaves your computer.

## Install

Copy this folder to your Hermes desktop-plugins directory:

```
~/.hermes/desktop-plugins/hermes-atrium/
├── plugin.js
└── assets/
    ├── backwater.jpg
    ├── watersky.jpg
    ├── goldensky.jpg
    └── nightsky.jpg
```

On Windows that is `%USERPROFILE%\.hermes\desktop-plugins\hermes-atrium\`. Then restart
Hermes, or toggle the plugin in **Settings -> Plugins**.

The folder must keep this shape: `plugin.js` at the top, pictures in `assets/`.
The plugin finds itself by the id it declares, `hermes-atrium`, so the folder
itself can be renamed.

## Pictures

Every picture comes from `assets/`, and only from `assets/`:

- `backwater.jpg` is the painting the theme ships with, and it wins by name. It
  is what Gruvbox paints, and what any look falls back to.
- `watersky.jpg`, `goldensky.jpg` and `nightsky.jpg` are the three Custom
  presets' pictures. Each is named by its slot rather than picked by order, so a
  slot keeps its picture even when you add files to the folder.
- Any other image dropped in `assets/` is used only if those files are missing,
  so the folder can hold test pictures without them becoming the default (`.jpg`,
  `.png`, `.webp`, `.avif`). Those four are committed; the rest are ignored by
  git.
- A picture sitting next to `plugin.js`, or in another plugin's folder, is
  never picked up. A slot whose picture has gone falls back to `backwater.jpg`
  rather than painting nothing.


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

Each one arrives as a designed look rather than an empty slot:

| Look | Starts as | Picture | Reads as |
| --- | --- | --- | --- |
| Custom 1 | Watersky | `watersky.jpg` | Pale blue concrete behind cool navy glass, sky blue accent |
| Custom 2 | Goldensky | `goldensky.jpg` | Dusk clouds behind warm plum-brown glass, apricot accent |
| Custom 3 | Nightsky | `nightsky.jpg` | A starfield behind indigo glass, warm gold accent |

Every value is still yours to change, and **Reset** returns a slot to the look
it started as. A slot that already holds values of its own is left alone by an
upgrade, so a picture you chose survives.

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

- Wide, legible tabs.
- Snippet cards with a copy button.

## Credits

The three photographs in `assets/` are third-party work, used under the Canva
free-content licence. `backwater.jpg` is a reproduction of a public-domain
painting. None of them is covered by this repository's own licence.

| File | Used by | Artist | Source |
| --- | --- | --- | --- |
| `watersky.jpg` | Custom 1, Watersky | Kseniya Lapteva, via Pexels | [Canva](https://www.canva.com/photos/MAEn9AE87zQ-close-up-shot-of-a-blue-concrete-wall/) |
| `goldensky.jpg` | Custom 2, Goldensky | Pozhidaeva, via Pixabay | [Canva](https://www.canva.com/photos/MAFONKRvWLM/) |
| `nightsky.jpg` | Custom 3, Nightsky | StockSnap, via Pixabay | [Canva](https://www.canva.com/photos/MADQ5BgDQLU-starry-night-sky/) |
| `backwater.jpg` | Gruvbox, and every fallback | Charles William Wyllie, *The Backwater* | [WikiArt](https://www.wikiart.org/en/charles-william-wyllie/the-backwater) |

`backwater.jpg` is a photograph of a painting rather than a scan. The three
`Canva` pictures are also copies rather than originals: each was resized to 3200
pixels wide and re-encoded as a JPEG so the repository stays a sane size.

Each preset's design leans on its own photograph: the palette, scrim and glass
weights were measured against that picture's pixels rather than chosen in the
abstract. `watersky.jpg` is the blue concrete wash, `goldensky.jpg` the dusk
sky, `nightsky.jpg` the starfield over the treeline.
