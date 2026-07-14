# IDML Authoring Brief (Track B)

Feature-isolation documents to author in InDesign and export, so the fidelity matrix
can score every feature the builder can't emit. IDs reference `IDML_FEATURE_MATRIX.md`.

## Global conventions (read once)

- **Canvas:** 1080 × 1350 px, RGB, 72 ppi effective (so 1 pt = 1 px; keeps our render
  and your reference at the same pixel scale). No bleed unless a test says so.
- **One feature per page.** Add pages within a doc; each page isolates ONE row of the
  matrix. Put a small caption on each page with the feature ID + variant
  (e.g. "C10 stroke-inside") in a neutral font — it makes the diff self-documenting and
  the caption's own text-diff is negligible.
- **Neutral base:** white page, one or two shapes/text frames, a single font
  (Inter or Unbounded — already in the corpus) unless the test is about fonts/OpenType.
- **Export references:** for each page, `File ▸ Export ▸ PNG`, **Selection off**,
  **Resolution = 72 ppi**, range = that page. This yields a pixel-for-pixel reference.
- **Package the doc:** `File ▸ Package` → gives a folder with the `.idml` (use
  `File ▸ Export ▸ IDML` inside it), `Document fonts/`, and `Links/`.
- **Naming (critical — the harness matches on it):**
  - Folder + IDML: `feat-<name>/feat-<name>.idml`
  - Reference PNGs at the CORPUS ROOT: `feat-<name>.png` (page 1), `feat-<name>2.png`
    (page 2), `feat-<name>3.png` … one per page, in order.
  - Drop the folder + PNGs into `Modules/idml/demo/idml demos/` (the corpus).
- If a page legitimately renders nothing new (e.g. a no-op like overprint on screen),
  still export it — a near-zero diff is a valid "we match" result.

Priority order to author: **feat-visibility first** (unblocks a known T1 bug), then the
rest of T1, then T2, then T3.

---

## feat-visibility  · A7–A10 · **T1, do first**

| Page | Feature | Author |
|------|---------|--------|
| 1 | A8 object hidden | Two rects; set the top one's **Visible = off** (Layers panel eye on the object). Only the bottom rect should show. |
| 2 | A7 layer hidden | Two layers; put a rect on "Layer 2", **hide Layer 2**. It must not render. |
| 3 | A9 nonprinting | A rect with **Window ▸ Output ▸ Attributes ▸ Nonprinting = on**. Must not render. |
| 4 | A10 locked visible | A locked rect (still visible). Must render normally. |

## feat-master · A3–A5 · T2

| Page | Feature | Author |
|------|---------|--------|
| 1 | A4 master applied | A master with a footer bar; a normal page using that master. |
| 2 | A5 master override | Same, but override + move the master footer on the page. |
| 3 | A3 facing pages | A 2-page spread (facing), one item bridging the spine. |

## feat-shapes · B3–B12 · T2

| Page | Feature | Author |
|------|---------|--------|
| 1 | B3 polygon | A 6-sided polygon (Polygon tool). |
| 2 | B3 star | A star (polygon w/ star inset 50%). |
| 3 | B4 graphic line | A thick angled line. |
| 4 | B5 bezier | An open curved path. |
| 5 | B8 corner inset | Rect, corner option = Inset, 40px. |
| 6 | B9 corner bevel | Rect, Bevel corner. |
| 7 | B10 corner fancy | Rect, Fancy corner. |
| 8 | B11 corner inverse-round | Rect, Inverse Rounded. |
| 9 | B12 mixed corners | Rect with 4 different corner types (Alt-drag in corner dialog). |

## feat-stroke · C10–C15 · T1/T2

| Page | Feature | Author |
|------|---------|--------|
| 1 | C10 align center | Rect, 20px stroke, alignment = center. |
| 2 | C10 align inside | same, inside. |
| 3 | C10 align outside | same, outside. |
| 4 | C11 join/cap | Angled thick open path: miter vs round join; round vs butt cap (two shapes). |
| 5 | C12 dashed | Dashed stroke. |
| 6 | C13 custom style | A striped or wavy custom stroke style. |
| 7 | C14 gap color | Dashed stroke with a gap color. |
| 8 | C15 arrowheads | A line with start + end arrowheads. |

## feat-color · C2–C5, I1–I6 · T1/T2

| Page | Feature | Author |
|------|---------|--------|
| 1 | C2 CMYK | Rect filled with a pure CMYK swatch (e.g. C=100). |
| 2 | C4 spot | Rect with a Pantone spot swatch, 100%. |
| 3 | C5 tint | Same spot at 40% tint. |
| 4 | C3 Lab | Rect with a Lab color. |
| 5 | I4 mixed ink | Rect with a mixed-ink swatch. |
| 6 | I6 gradient swatch | Two rects sharing one named gradient swatch. |

## feat-effects · E2, E4–E14 · T1–T3

| Page | Feature | Author |
|------|---------|--------|
| 1–4 | E2 blend modes | 4 pages: a colored rect over a photo with blend = Multiply / Screen / Overlay / Luminosity (one per page). |
| 5 | E4 shadow multiply | Drop shadow with blend = Multiply over a colored bg (shows the multiply gap vs our alpha). |
| 6 | E5 inner shadow | |
| 7 | E6 outer glow | |
| 8 | E7 inner glow | |
| 9 | E8 bevel & emboss | |
| 10 | E9 satin | |
| 11 | E10 basic feather | |
| 12 | E11 directional feather | |
| 13 | E12 gradient feather | |
| 14 | E13 effect on stroke only | Object with an effect targeting Stroke, not Object. |
| 15 | E14 knockout group | A knockout group over a photo. |

## feat-text-char · F4–F20 · T1/T2

| Page | Feature | Author |
|------|---------|--------|
| 1 | F4 tracking | One line, tracking +200. |
| 2 | F5 kerning optical | A word, optical kerning. |
| 3 | F6 baseline shift | A superscript-like shifted run. |
| 4 | F7 h/v scale | Text at 80% horizontal scale. |
| 5 | F8 small caps | Small caps run. |
| 6 | F9 super/subscript | H₂O + x². |
| 7 | F10 underline | Default underline. |
| 8 | F12 strikethrough | |
| 9 | F14 text stroke | Outlined text (fill + 2px stroke). |
| 10 | F15 ligatures | "ffi fl" with ligatures on. |
| 11 | F16 fractions | "1/2 3/4" with fraction OT feature. |
| 12 | F17 stylistic set | A stylistic set on a font that has one. |
| 13 | F18 oldstyle figures | "0123456789" oldstyle. |

## feat-text-para · P2–P14 · T1/T2

| Page | Feature | Author |
|------|---------|--------|
| 1 | P2 indents | Paragraph with left/right/first-line indents. |
| 2 | P3 space before/after | Two paragraphs with space-after. |
| 3 | P4 drop cap | 3-line drop cap. |
| 4 | P5 hyphenation | A justified paragraph, hyphenation on. |
| 5 | P7 tabs | A tabbed list with a dot leader + a decimal tab. |
| 6 | P8 rules | Paragraph rule above + below (a heading bar). |
| 7 | P9 bullets | Bulleted list. |
| 8 | P10 numbering | Numbered list. |
| 9 | P11 nested styles | First word bold via nested style. |
| 10 | P12 GREP style | All digits colored via GREP style. |

## feat-text-frame · T1f–T11f · T1/T2

| Page | Feature | Author |
|------|---------|--------|
| 1 | T1f columns | A 2-column text frame with gutter. |
| 2 | T2f insets | Text frame with a 40px inset, visible fill. |
| 3 | T5f wrap bbox | A shape with bounding-box text wrap; body text flowing around it. |
| 4 | T6f wrap contour | Same but wrap = object shape (a non-rect shape). |
| 5 | T7f auto-size | An auto-size (grow) text frame. |
| 6 | T8f threading | Two threaded frames sharing one story. |
| 7 | T9f overset | A frame with more text than fits (overset). |
| 8 | T10f text on path | Text on a curved path. |
| 9 | T11f anchored inline | A small image anchored inline in a paragraph. |
| 10 | T11f anchored custom | An anchored object with custom position. |

## feat-tables · G1–G10 · T2/T3

| Page | Feature | Author |
|------|---------|--------|
| 1 | G1–G4 basic | 3×3 table: cell fills, per-edge strokes, insets. |
| 2 | G5 header | Table with a header row style. |
| 3 | G6 merged | Table with a merged 2-col header cell. |
| 4 | G7 alternating | Alternating row fills. |
| 5 | G9 image cell | An image placed in a cell. |
| 6 | G10 diagonal | A cell with a diagonal line. |

## feat-images · H2–H14 · T2/T3

| Page | Feature | Author |
|------|---------|--------|
| 1 | H2 PSD | A placed .psd. |
| 2 | H3 EPS | A placed .eps (known-failing — captures the gap). |
| 3 | H4 PDF | A placed multi-page PDF (page 2). |
| 4 | H8 center-fit | Image centered, not filling frame. |
| 5 | H10 clip path | Image with a clipping path from a Photoshop path. |
| 6 | H11 clip alpha | Image clipped by alpha channel. |
| 7 | H13 layered PSD | A .psd with one layer hidden. |
| 8 | H14 image effect | An image with a drop shadow + 60% opacity. |

## feat-text-misc · T12f–T14f · T3

| Page | Feature | Author |
|------|---------|--------|
| 1 | T12f footnote | A paragraph with a footnote. |
| 2 | T13f conditional | Text with a hidden condition (should not render). |
| 3 | T14f hyperlink | A hyperlinked run (renders as styled text). |

---

## When you've authored a batch

Drop the `feat-*/` folders + `feat-*.png` references into `Modules/idml/demo/idml demos/`
and I'll run the matrix — each new feature shows up as a scored row (with heatmap) and
its Support cell in the matrix flips from `?` to a measured value. We fix red cells in
priority order, starting with `feat-visibility`.
