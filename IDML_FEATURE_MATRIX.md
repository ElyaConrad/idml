# IDML Feature Matrix & Support Scorecard

The exhaustive checklist of IDML / InDesign features, derived from the **Adobe IDML
Specification + Cookbook** (structural grammar) and the **InDesign Scripting DOM /
Object Model Reference** (per-property semantics). Every feature is a row; the suite's
job is to fill the **Support** and **Fidelity** columns with measured facts, not guesses.

## How to read this

- **Track** — how the test IDML is produced:
  - **A** = builder-auto (`createIDML` + finalize; I generate + commit a baseline render).
  - **B** = InDesign-authored (you author per the authoring brief; ships an InDesign reference PNG).
  - **C** = raw-XML / builder-extension (I emit it directly; parametric & tedious to hand-author).
- **Pri** — T1 = print/social essentials (do first), T2 = common, T3 = long-tail.
- **Support** — measured: `✓` full · `~` partial · `✗` broken/absent · `?` unknown (no test yet).
- **Fidelity** — worst-page pixel-diff vs the InDesign reference (filled by the matrix run).
- **Test** — the doc/page that exercises it (see the authoring brief for Track-B page numbers).

Known facts already established (this session) are pre-filled; everything else is `?`.

---

## A · Document / geometry / structure

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| A1 | Single page | size sweep (1080², 1200×627, 1920×1080, A4) | A | T1 | ✓ | verified on real templates |
| A2 | Multi-page document | 2–N spreads → N serials | A/B | T1 | ✓ | Anuga (4pp), SoMe (19pp) |
| A3 | Facing pages / spreads | left+right page on one spread | B | T2 | ? | |
| A4 | Master spread applied | inherited page items | B | T2 | ? | |
| A5 | Master item override | local override of a master item | B | T2 | ? | |
| A6 | Bleed / slug | non-zero bleed geometry | B | T3 | ? | do we clip to page or bleed? |
| A7 | **Layer visibility** | layer `Visible="false"` | B | **T1** | **✗** | see V-bug; items on hidden layers must not render |
| A8 | **Object visibility** | item `Visible`/hidden | B | **T1** | **✗** | ANUGA fork repro |
| A9 | **Nonprinting attribute** | `Nonprinting="true"` | B | **T1** | **✗** | Attributes-panel flag; suppress in render |
| A10 | Layer locked | should still render | B | T3 | ? | |
| A11 | Z-order / stacking | overlap order within/-across layers | A | T1 | ✓ | implicit in every case |

## B · Shapes & paths

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| B1 | Rectangle | plain | A | T1 | ✓ | |
| B2 | Oval / ellipse | circle + non-uniform | A | T1 | ✓ | |
| B3 | Polygon | N sides + star inset | C | T2 | ? | builder has no polygon-N helper |
| B4 | Graphic line | straight, angled | C | T2 | ? | |
| B5 | Open bezier path | curves | B | T2 | ? | |
| B6 | Compound path / hole | even-odd vs nonzero | A | T2 | ~ | holes render via nonzero winding |
| B7 | Corner: rounded | radius sweep | A | T1 | ~ | simple corners → radius |
| B8 | Corner: inset | | B | T2 | ? | |
| B9 | Corner: bevel | | B | T2 | ? | |
| B10 | Corner: fancy | | B | T3 | ? | |
| B11 | Corner: inverse rounded | | B | T3 | ? | |
| B12 | Mixed per-corner radii | 4 different corners | B | T2 | ? | |

## C · Fill & stroke

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| C1 | Solid RGB fill | | A | T1 | ✓ | |
| C2 | Solid CMYK fill | | C | T1 | ? | color conversion to sRGB |
| C3 | Lab color | | B | T3 | ? | |
| C4 | Spot / Pantone | + tint % | B | T2 | ? | |
| C5 | Tint of swatch | 0–100% | C | T2 | ? | |
| C6 | Gradient fill — linear | 2-stop, multi-stop, angle | C | T1 | ? | GradientStop `Self` finalize bug known |
| C7 | Gradient fill — radial | + focal point | C | T1 | ? | |
| C8 | Gradient midpoint | stop midpoint ≠ 50% | C | T2 | ? | |
| C9 | Stroke solid | weight sweep | A | T1 | ✓ | |
| C10 | Stroke alignment | center / inside / outside | C | T1 | ? | InDesign default = center |
| C11 | Stroke join / cap | miter/round/bevel · butt/round/proj | B | T2 | ? | |
| C12 | Dashed / dotted stroke | + custom dash | B | T2 | ? | |
| C13 | Custom stroke styles | stripe/wavy/etc. | B | T3 | ? | |
| C14 | Stroke gap color | dashed with gap color | B | T3 | ? | |
| C15 | Arrowheads | start/end styles | B | T2 | ? | |
| C16 | Gradient on stroke | | C | T2 | ? | |
| C17 | Overprint fill/stroke | | B | T3 | ? | usually visual no-op on-screen |
| C18 | Fill = [None] / [Paper] | | A | T1 | ✓ | paper background handled |

## D · Transforms

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| D1 | Rotation | angle sweep | A | T1 | ✓ | |
| D2 | Uniform scale | | A | T1 | ✓ | |
| D3 | Non-uniform scale | scaleX ≠ scaleY | A | T1 | ~ | interacts w/ embedded-SVG placement |
| D4 | Shear / skew | | A | T2 | ? | decomposeMatrix handles skew |
| D5 | Flip H / V | | A | T2 | ? | mirrorX/Y |
| D6 | Combined transform | rotate+scale+translate | A | T1 | ✓ | |

## E · Transparency & effects

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| E1 | Object opacity | 0–100% | A | T1 | ✓ | |
| E2 | Blend modes | all 16 (multiply…luminosity) | B | T1 | ? | shadow already uses Multiply implicitly |
| E3 | Drop shadow | offset/size/color/opacity/spread | A | T1 | ✓ | opacity-default bug fixed this session |
| E4 | Drop shadow blend mode | multiply vs normal | B | T2 | ~ | we render normal alpha, not multiply |
| E5 | Inner shadow | | B | T2 | ? | |
| E6 | Outer glow | | B | T2 | ? | |
| E7 | Inner glow | | B | T3 | ? | |
| E8 | Bevel & emboss | | B | T3 | ? | |
| E9 | Satin | | B | T3 | ? | |
| E10 | Basic feather | | B | T2 | ? | |
| E11 | Directional feather | | B | T3 | ? | |
| E12 | Gradient feather | | B | T2 | ? | |
| E13 | Effects on fill/stroke/text only | target sweep | B | T3 | ? | InDesign can target each |
| E14 | Knockout / isolate group | | B | T3 | ? | |

## F · Text — character

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| F1 | Font family / style | + weight per variant | A | T1 | ✓ | weight-resolution bug fixed earlier |
| F2 | Font size | sweep | A | T1 | ✓ | |
| F3 | Leading | auto + fixed | A | T1 | ✓ | |
| F4 | Tracking | | B | T1 | ? | letter-spacing |
| F5 | Kerning | metric / optical / manual | B | T2 | ? | |
| F6 | Baseline shift | | B | T2 | ? | |
| F7 | Horizontal / vertical scale | | B | T2 | ? | |
| F8 | Case | all-caps / small-caps | A | T1 | ~ | uppercase handled |
| F9 | Super / subscript | | B | T2 | ? | |
| F10 | Underline (default) | | B | T1 | ? | |
| F11 | Underline custom | weight/offset/color = Bauchbinde | A | T1 | ✓ | line-background reconstruction |
| F12 | Strikethrough | | B | T2 | ? | |
| F13 | Text fill color | RGB/CMYK/spot | A | T1 | ✓ | |
| F14 | Text stroke | outlined text | B | T2 | ? | |
| F15 | OpenType: ligatures | | B | T2 | ? | |
| F16 | OpenType: fractions/ordinals | | B | T3 | ? | |
| F17 | OpenType: stylistic sets | | B | T3 | ? | |
| F18 | OpenType: oldstyle/tabular figures | | B | T3 | ? | |
| F19 | No-break | | B | T3 | ? | |
| F20 | Language / hyphenation dictionary | | B | T3 | ? | |

## F · Text — paragraph

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| P1 | Alignment | L/R/C/justify + justify-all | A | T1 | ✓ | |
| P2 | Indents | left/right/first/last | B | T1 | ? | |
| P3 | Space before / after | | B | T1 | ? | |
| P4 | Drop caps | lines × chars | B | T2 | ? | |
| P5 | Hyphenation | on/off + settings | B | T2 | ? | |
| P6 | Justification settings | word/letter/glyph spacing | B | T2 | ~ | affects vertical-justify calc |
| P7 | Tabs | left/center/right/decimal + leader | B | T2 | ? | |
| P8 | Paragraph rules | above / below | B | T2 | ? | related to Bauchbinde |
| P9 | Bullets | | B | T2 | ? | |
| P10 | Numbering | + list styles | B | T2 | ? | |
| P11 | Nested styles | char style after N chars/words | B | T2 | ? | |
| P12 | GREP styles | regex-driven char style | B | T3 | ? | |
| P13 | Keep options | keep-with-next/lines | B | T3 | ? | layout-only |
| P14 | Balance ragged lines | | B | T3 | ? | |

## F · Text — frame / story

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| T1f | Columns | count + gutter | B | T1 | ? | |
| T2f | Inset spacing | uniform + per-side | B | T1 | ? | |
| T3f | Vertical justification | top/center/bottom/justify | A | T1 | ✓ | JustifyAlign reproduced |
| T4f | First-baseline offset | ascent/cap/leading/x/fixed | A | T1 | ~ | bounding=font migration |
| T5f | Text wrap — bounding box | + offsets | B | T2 | ? | |
| T6f | Text wrap — object shape | contour | B | T3 | ? | |
| T7f | Auto-size frame | | B | T3 | ? | |
| T8f | Threaded frames | story across frames | B | T2 | ? | |
| T9f | Overset text | more text than frame | B | T2 | ? | |
| T10f | Text on a path | + path effects/align | B | T2 | ? | |
| T11f | Anchored / inline object | inline / above-line / custom | B | T2 | ? | |
| T12f | Footnotes | | B | T3 | ? | |
| T13f | Conditional text | hidden conditions | B | T3 | ? | |
| T14f | Hyperlinks / cross-refs | visual only | B | T3 | ? | |
| T15f | Paragraph/character styles applied | named styles + overrides | A/B | T1 | ~ | default para style = Minion Pro caveat |

## G · Tables

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| G1 | Basic table | rows × cols | B | T2 | ? | |
| G2 | Cell fill | | B | T2 | ? | |
| G3 | Cell stroke | per-edge | B | T2 | ? | |
| G4 | Cell insets | | B | T2 | ? | |
| G5 | Header / footer rows | | B | T3 | ? | |
| G6 | Merged cells | row/col span | B | T2 | ? | |
| G7 | Alternating fills / strokes | | B | T3 | ? | |
| G8 | Cell / table styles | | B | T3 | ? | |
| G9 | Image in cell | | B | T3 | ? | |
| G10 | Diagonal lines | | B | T3 | ? | |

## H · Images / placed graphics

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| H1 | Placed raster (PNG/JPEG) | linked + embedded | A | T1 | ✓ | |
| H2 | Placed TIFF / PSD | | B | T2 | ? | needs rasterization |
| H3 | Placed EPS / AI | | B | T2 | ✗ | koelnmesse logo fails |
| H4 | Placed PDF | page selection | B | T2 | ? | |
| H5 | Placed SVG | embedded viewBox | A | T1 | ~ | frame-placement viewBox issue (known) |
| H6 | Fit: fill frame proportional | | A | T1 | ✓ | cover |
| H7 | Fit: fit content proportional | | A | T1 | ~ | contain |
| H8 | Fit: center content | | B | T2 | ? | |
| H9 | Image transform in frame | independent scale/rotate | A | T2 | ~ | crop mapping |
| H10 | Clipping path — path | | B | T3 | ? | |
| H11 | Clipping path — alpha | | B | T3 | ? | |
| H12 | Clipping path — detect edges | | B | T3 | ? | |
| H13 | Layered PSD visibility | | B | T3 | ? | |
| H14 | Image opacity / effects | | A | T2 | ? | |
| H15 | Frame shape ≠ rectangle (mask) | oval/polygon frame | A | T1 | ✓ | mask path |

## I · Color / print

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| I1 | Process CMYK swatch | | C | T1 | ? | → sRGB |
| I2 | Spot color | + tint | B | T2 | ? | |
| I3 | Lab color | | B | T3 | ? | |
| I4 | Mixed ink | | B | T3 | ? | |
| I5 | [Registration] | | B | T3 | ? | |
| I6 | Gradient swatch (named) | reused across items | C | T2 | ? | |
| I7 | Color group | organizational | B | T3 | ? | no visual effect |

## J · Grouping

| ID | Feature | Variants | Track | Pri | Support | Notes |
|----|---------|----------|-------|-----|---------|-------|
| J1 | Simple group | | A | T1 | ✓ | |
| J2 | Nested groups | | A | T2 | ✓ | |
| J3 | Group transform | rotate/scale group | A | T1 | ✓ | |
| J4 | Group opacity | | A | T2 | ? | |
| J5 | Group effects | shadow on group | B | T2 | ? | |

---

## Scorecard summary (regenerated by the matrix run)

> _Auto-populated from `results.json`. Placeholder until the full suite runs._

| Domain | Features | Tested | ✓ full | ~ partial | ✗ broken | ? unknown |
|--------|---------|--------|--------|-----------|----------|-----------|
| A–J | ~120 | — | — | — | — | — |

## Immediate known gaps (fix backlog, ranked)

1. **A7/A8/A9 — visibility & nonprinting** (T1): items on hidden layers / `Visible="false"` / `Nonprinting="true"` render when they must not. Live repro: ANUGA background fork. Likely small fix in the sprite walk.
2. **H3 — EPS/AI placement** (T2): conversion fails (koelnmesse). Accepted limitation for now.
3. **E4 — shadow blend mode** (T2): rendered as normal alpha, not Multiply.
4. **H5/D3 — embedded-SVG frame placement** (T1): factual-viewBox vs frame; known, deferred.
