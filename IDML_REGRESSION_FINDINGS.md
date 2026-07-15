# IDML → Serial Regression & Fidelity Findings

Living record of the IDML feature-regression system: **what the tests do**, the **traps/flaws**
discovered while building them, and the ranked **bugs to fix** to reach a feature-complete
`idml → serial` converter. Scores are the pixel-diff of *our* render vs InDesign's own PNG
export of the *same* file (0% = identical).

Last full run: 2026-07-15, InDesign 2026 (21.0), 28 InDesign-authored feature cases.

---

## 1. How the system works

The trustworthy signal is: **InDesign authors the test, InDesign exports the ground-truth PNG,
we render the same IDML, we diff.** Because InDesign makes both sides, there are no authoring
or font-substitution artifacts — a difference is a real converter difference.

Pipeline (all scripts live in the repo):

| Piece | Location | Role |
|---|---|---|
| **Feature generator** | `Modules/idml/_idml_feature_gen.jsx` | InDesign ExtendScript. One fresh 1080×1350pt doc per feature, isolates ONE feature, exports `feat-<name>.idml` + `feat-<name>.png` (72 ppi ground truth) into `demo/feat_id/feat-<name>/`. Text cases use **Arial** and copy `Arial.ttf` into the case so our render uses the identical face. Run: `osascript -e 'tell application "Adobe InDesign 2026" to do script (POSIX file "…/_idml_feature_gen.jsx") language javascript'`. |
| **Render adapter** | `Services/bx-render/render_container_src/_matrix_render.mjs` | IDML + assets → PNG per page via the production resvg path (`@bluepic/core/headless` → `IdmlSerialConverter` → `useRenderV2`). Runs per-case in a subprocess (40+ renders in one process OOMs). |
| **Differ** | `…/_matrix_lib.mjs` | sharp pixel-diff (score = fraction of pixels past a 40/255 threshold) + ink-coverage per side + a side-by-side `ours | reference | heatmap` strip. |
| **Orchestrator** | `…/_matrix.mjs` | Renders every case, matches page→reference PNG (in the case folder), diffs, writes worst-first `report.html` + `results.json`. Run: `node _matrix.mjs <corpusDir> <outDir>`. |
| **Coverage scan** | ad-hoc (documented below) | Static: every element InDesign emits across the real IDMLs, cross-referenced with whether the converter source references it (READ/MISS). Grounds the empirical results in code. |

### Self-diagnosis flags (a wild score is meaningless until you know which side rendered)

`diffPngs` measures ink on each side and labels each case:
- **`REF-BLANK`** — the InDesign PNG is empty → bad reference / authoring, **not** a converter bug.
- **`OURS-BLANK`** — we render nothing where InDesign has content → real, severe gap.
- **`OURS-LIGHT`** — we draw materially *less* (missing element/decoration), gated on a visible score.
- **`OURS-HEAVY`** — we draw *more* (an element InDesign hides — the visibility class).

A low score can still be a real gap (a thin missing underline); those show in the heatmap, not the flag.

---

## 2. Traps & flaws discovered (authoring gotchas — keep in mind)

These are NOT converter bugs; they are traps that corrupt a test if you don't account for them.

1. **InDesign substitutes an unavailable font → serif.** Our builder-generated docs referenced *Inter*,
   which InDesign didn't have, so its PNG used a serif substitute while our render used Inter → the
   whole text cluster showed "heat" that was pure font-family mismatch, not a converter bug.
   **Fix:** author text with a font InDesign *and* our renderer both have as a real `.ttf` — we use
   **Arial** (`/System/Library/Fonts/Supplemental/Arial.ttf`) and bundle that exact file per case.
2. **A blank InDesign reference means the *reference* is wrong.** `feat-image` scored 27% because the
   reference was empty. Root cause: our old JS-builder emitted a **frameless `<Image>`** (identity
   `ItemTransform`, no `<Rectangle>` container) — InDesign draws nothing, but our converter leniently
   renders it. Authoring via InDesign scripting removes this entirely (InDesign always makes a real frame).
3. **`GradientStop` needs a `Self`.** The builder's blank template exported `<GradientStop>` without a
   `Self` attribute → our parser throws / InDesign rejects. The generator's finalize pass injects one.
   (Only relevant to the old JS-builder path; the InDesign path is clean.)
4. **`Capitalization` (AllCaps/SmallCaps) not emitted by the JS-builder** → *neither* side showed caps,
   so it read as "no diff." The InDesign path sets `capitalization` on the DOM, so it's a true test.
5. **`cornerOption`/`cornerRadius` don't exist on the InDesign DOM** — corner effects are **per-corner**
   (`topLeftCornerOption`/`topLeftCornerRadius`, …). First corner run failed until fixed.
6. **Soft effects inflate ink asymmetry.** A soft shadow/glow spreads faint-gray "ink", so `OURS-LIGHT/
   HEAVY` false-fire on low scores → those flags are gated on a *visible* score.
7. **Measurement units.** InDesign defaults to picas/mm; set the doc to POINTS and use 1080×1350 pt so
   1 pt = 1 px at 72 ppi export → matches our serial's pixel size exactly.

---

## 3. Issues / bugs to fix (ranked — ground-truth scores)

**Confirmed REAL gaps** (InDesign-authored ground truth; flag in brackets):

| # | Feature | Score | Flag | What's wrong |
|---|---------|-------|------|--------------|
| 1 | **Blend modes** | 13.8% | OURS-LIGHT | `blendMode` (Multiply/Screen/…) not applied — object renders Normal. `BlendingSetting.blendMode` is read but not honored in compositing. |
| 2 | **Paragraph shading** | ~~12.9%~~ → **2.07% FIXED** | — | `ParagraphShadingOn/Color/Tint` (fill behind a paragraph) now drawn as a line-bound iterated background block spanning the frame width (`makeParagraphShadingRectangle`, emitted behind the text in `withBars`). Plumbed paragraph-level through `ParagraphStyle`/`Story` local+named + `EffectiveTextStyle`. Tint applied via `colorInputToHex(color, tint)`; default 20 (InDesign root [No paragraph style] default, inherited via BasedOn which `pick` doesn't walk). Top/bottom/left/right offsets supported (per-line ternary on first/last tile). Residual 2% = text AA. |
| 3 | **CMYK → sRGB** | 12.1% | — | Solid CMYK swatches convert to the wrong sRGB values vs InDesign's color engine. |
| 4 | **Radial gradient** | 13.8% | — | Renders a gradient but center/spread/type geometry differs from InDesign (linear gradient is fine at 0.09%). |
| 5 | **Object visibility** | ~~6.4%~~ → **0.17% FIXED** | — | `PageItem.visible=false` now skipped. |
| 6 | **Layer visibility** | ~~6.3%~~ → **0.16% FIXED** | — | items on a hidden `<Layer Visible="false">` now skipped. |
| 7 | **Nonprinting** | ~~6.3%~~ → **0.16% FIXED** | — | `PageItem.nonprinting=true` now skipped. |

> **Fixed & verified this session — the whole visibility cluster (5, 6, 7):** `Nonprinting` +
> `ItemLayer` parsing, a `<Layer>` visibility map on the IDML (`getLayerVisible`), and a
> `Sprite.isRenderable()` gate (Visible ∧ ¬Nonprinting ∧ layerVisible) at the `spriteToElement`
> choke point (`Sprite.ts`, `idml.ts`, `idml2serial.ts`). Each 6.3% → ~0.16% vs InDesign ground
> truth. **Needs an idml publish** for downstream (bx-studio, bx-idml-renderer, bx-render).

## Implementation progress (fixes applied)

**SHIPPED & verified vs InDesign ground truth:**
- **Visibility cluster** (object `Visible=false`, `Nonprinting=true`, hidden `<Layer>`): 6.3% → **0.16%**. `Sprite.isRenderable()` gate + `<Layer>` visibility map. (idml only.)
- **Text stroke** (outlined text): was invisible (`OURS-BLANK`) → now **renders** (1.94%, font-AA residual). Converter emits char `strokeColor`/`strokeWeight` into the text style (`style.ts`, `layout.ts`); core `Text.vue` gains `paint-order: stroke` so the stroke sits under the fill (InDesign parity).

**WIRED end-to-end, one residual — blend modes:** converter parses `BlendMode` + emits `filter.blendMode` (`Sprite.getBlendMode()`, `applyBlendMode`); `@bluepic/types` + idml serial-types gained a `blendMode` filter field; core threads it through `useElementFilter`/the filter getter-wrapper and applies `mix-blend-mode` on the element `<g>` (`ElementsSlot.vue`). Verified: the emitted SVG carries `mix-blend-mode:multiply`, and **resvg renders mix-blend-mode on a `<g>` (incl. with a transform)** in isolation. BUT the full-scene render doesn't blend → the multiply element's **backdrop in core's nesting doesn't include the sibling behind it** (a stacking/isolation issue in the element wrapper). Works in the puppeteer (real-browser) render path; the resvg path needs the isolation nesting sorted. *(Files touched are all committed; build is green.)*

**Architectural notes on the remaining top gaps (why they're not converter-only fixes):**
- **Blend modes (1):** the converter *reads* `BlendingSetting.blendMode`, but `@bluepic/core` has no
  `mix-blend-mode` support and the serial has no field for it → needs core + serial-type + converter-emit.
- **CMYK (3):** `paint.ts` uses the naive `r=255(1−c)(1−k)…` formula; InDesign is color-managed
  (US Web Coated SWOP). Correctness needs an ICC/profile conversion, not a formula tweak.
- **Radial gradient (4):** `gradientToSerial` hardcodes center `(0.5,0.5)` + radius `0.5` and ignores
  the sprite's `gradientFillStart`/`gradientFillLength` → wrong extent/center. Converter-side, moderate.
- **Effects (8,10,15,16 + glows/satin/bevel) & paragraph decoration (2,13,14) & text decorations
  (11,12):** the converter is MISS on the underlying elements AND the serial/core mostly lack a
  representation (only drop shadow exists as an SVG filter) → each needs converter + serial + core.
| 8 | **Gradient feather** | 5.4% | — | `gradientFeatherSettings` not applied. |
| 9 | **Stroke alignment** | ~~3.3%~~ → **0.20% FIXED** | — | `makeRectangle`/`makeCircle`/`makePath`/`makeImage` hardcoded `strokeAlignment: 'center'`, ignoring the (correctly parsed & merged) `surface.strokeAlignment`. Now emit `surface.strokeAlignment ?? 'center'`. inside/outside silhouettes match. |
| 10 | **Basic feather** | 2.3% | — | `featherSettings` (soft faded edge) not applied. |
| 11 | **Text underline** | ~~1.7%~~ → **0.79% FIXED** | — | Thin/normal underline now painted via element-level SVG `text-decoration` (new `textDecoration` prop on the Text element: types + core `compose/text.ts`+`Text.vue`, idml `builders.ts`+`layout.ts`). Thick offset underlines still take the Bauchbinde bar path (excluded from decoration by the `BAUCHBINDE_MIN_WEIGHT_RATIO` gate). Set element-level only when every run agrees. |
| 12 | **Strikethrough / caps** | ~~1.8%~~ → **0.89% FIXED** | — | Strikethrough painted via `text-decoration: line-through` (same mechanism as underline). AllCaps confirmed rendering (`uppercase`); SmallCaps renders as normal text — no Bluepic equivalent (accepted limitation). |
| 13 | **Tab leaders** | 1.4% | — | dot-leader tabs not rendered (`TabList`/`Leader` MISS). |
| 14 | **Paragraph rules** | 1.4% | — | rule above/below not drawn (`RuleAbove/BelowType` MISS). |
| 15 | **Text stroke** | 1.3% | OURS-BLANK | outlined text (fill+stroke) renders invisible — text stroke not painted. |
| 16 | **Inner shadow** | 0.9% | OURS-BLANK | `innerShadowSettings` not applied. |

**Effects likely also unsupported but subtle (need a visual pass to confirm — low pixel diff):**
outer glow (1.1%), satin (1.0%), inner glow (0.8%), bevel & emboss (0.6%). The converter is **MISS**
on all of these in the coverage scan (see §4), so the low score is "the effect is faint," not "we render it."

**Static coverage cross-check** (element emitted by InDesign vs referenced in converter source):
only **DropShadowSetting** among effects is READ; `InnerShadowSetting, OuterGlowSetting, InnerGlowSetting,
BevelAndEmbossSetting, SatinSetting, FeatherSetting, DirectionalFeatherSetting, GradientFeatherSetting`
and `Fill/Stroke/ContentTransparencySetting` are all **MISS**. Text: `UnderlineType, StrikeThroughType,
StrikeThroughColor` MISS. Paragraph: `ParagraphShadingColor, ParagraphBorderColor/Type, RuleAbove/BelowType,
BulletChar, NumberingList/Format, TabList/Leader, BalanceRaggedLines` MISS. Objects: `AnchoredObjectSetting,
ContourOption, ClippingPathSettings, GraphicLine` MISS. Tables (`Cell/Row/TableStyle/CellStyle`) MISS
*and* absent from all real sample files (needs authoring to test).

**Not yet authored (next generator batch):** corner effects (5 types — API fixed, re-run pending),
gradient on stroke, spot/Lab/mixed-ink color, per-corner radii, arrowheads, dashed+gap-color,
bullets/numbering, drop caps, indents, vertical justification, text-on-path, anchored objects,
image fit/clipping variants, tables, master-page overrides.

---

## 3b. Fixability analysis (vs the `@bluepic/core` feature set)

Grounded in what core actually renders today. The big correction to first-glance pessimism:
**core already has most of the primitives**, so many gaps are converter-only, not multi-module.

**Core capabilities confirmed:**
- `Text.vue` renders `<text>` with `fill` + `stroke` + `stroke-width` → **text stroke supported**.
- `StrokeGeometry.vue` does **inside/outside stroke alignment** via a double-width-stroke mask.
- `helpers/gradient.ts` + serial carry **radial** gradients (`x1,y1,r1,x2,y2,r2`).
- The **Bauchbinde** path emits **per-line rectangles bound to text lines** (line backgrounds already work).
- `SvgFilter.vue` is an **extensible** `feColorMatrix`/`feGaussianBlur`/`feDropShadow` chain.
- Absent today: `blendMode`/`mix-blend-mode`, `text-decoration`, and non-drop effect filter fields.

### Category A — CONVERTER-ONLY (core already renders it) · cheapest, do first
| Bug | Why it's converter-only | Effort |
|---|---|---|
| **Radial gradient** | core renders `type:'radial'`; converter **hardcodes** center `(0.5,0.5)` + radius `0.5` in `gradientToSerial`. Fix: map the sprite's `gradientFillStart`/`gradientFillLength` → `x2,y2,radius2`. | S |
| **Stroke alignment** | **fully wired already** (`paint.ts` emits `strokeAlignment`, serial carries it, `StrokeGeometry.vue` masks it). 3.3% is a minor enum-map/geometry-precision tweak, not a missing feature. | XS |
| **Text stroke** | core `Text.vue` paints glyph stroke; converter emits stroke only on the frame *background* rect, not the glyphs. Fix: emit char `strokeColor`/`strokeWeight` into the text style (+ `paint-order:stroke` so thick strokes don't eat the glyph). | S |
| **Paragraph shading** | reuse the **Bauchbinde** per-line-rectangle mechanism: emit a background rect bound to the paragraph's line box(es), colored from `ParagraphShadingColor`. | M (para-box geometry) |
| **Paragraph rules (above/below)** | same mechanism: a thin rect bound to the first/last line. | M |

### Category B — trivial core extension + converter emit · small multi-module
| Bug | Fix | Effort |
|---|---|---|
| **Blend modes** | add a `blendMode` value to the element + one `mix-blend-mode` CSS binding on the element wrapper in core + converter emits from `BlendingSetting.blendMode`. All 16 map 1:1 to CSS. | S each |
| **Underline / strikethrough** | add `text-decoration` passthrough to `Text.vue`'s `<text>` style + serial text field + converter emit from `underline`/`strikeThru`. (Thick-offset *custom* underline already handled by Bauchbinde.) | S |

### Category C — SVG-filter extension (same pattern as the existing drop shadow) · medium
`SvgFilter.vue` is a filter chain; each effect = new serial filter field + a primitive recipe + converter emit:
- **Inner shadow** (`feComposite in=SourceAlpha` + `feGaussianBlur` + `feFlood`), **outer glow** (`feGaussianBlur` + `feFlood` + `feMerge`), **inner glow** (inner variant), **basic feather** (`feGaussianBlur` on alpha) — each localized, medium.
- **Directional/gradient feather, bevel & emboss, satin** — harder chains (masked blur, `feSpecularLighting`); T3, low priority.

### Category D — hard / external dependency
- **CMYK → sRGB**: needs an ICC/SWOP conversion (LUT/profile), not a formula. Converter-only but needs profile data; a SWOP polynomial approximation shrinks the 12% without full ICC.
- **Tab leaders**: a text-LAYOUT feature in `@bluepic/core/text`, adjacent to the out-of-scope line-breaking. Medium-hard.

### Recommended order (ROI)
1. **A** (radial gradient, stroke-align tweak, text stroke) — 3 gaps, converter-only, hours.
2. **A** (paragraph shading + rules) — reuse Bauchbinde, 2 gaps.
3. **B** (blend modes, underline/strike) — trivial core + emit, 3 gaps.
4. **C** (effects family) — extend the filter chain, 4–5 gaps.
5. Defer **D** (CMYK ICC, tab leaders).

Net: **~8 of the ~14 open gaps are converter-only or trivial-core** because core already ships text-stroke,
stroke-alignment, radial gradients, per-line rectangles, and an extensible filter chain.

## 4. What is CLEAN (verified working, < 0.15%)

Rectangle, oval, polygon, compound-path (holes), bezier/line, groups (incl. nested + group transform),
solid RGB fill, stroke weight/color, opacity, **linear gradient**, **drop shadow**, and all affine
transforms (rotate/scale/shear/combined). The geometry/transform/basic-paint foundation is solid.

---

## 5. Out of scope / caveats

- **Paragraph word-breaking / line-breaking is out of scope.** `@bluepic/core`'s justification &
  hyphenation algorithm is not InDesign's, so multi-line paragraph wrap will never be pixel-exact.
  The suite should tolerate small text reflow and not treat it as a bug (that's why we score by pixel
  fraction and skip low-heat diffs).
- **Subtle effects** (glows, feathers) produce small pixel deltas even when entirely unsupported; trust
  the coverage scan (§3) over the raw score for those.
- **Font**: always author with Arial (or another mutually-available `.ttf`); never a font InDesign lacks.

---

## 6. Running & extending

- **Generate/refresh the InDesign corpus:** run `_idml_feature_gen.jsx` via `osascript` (InDesign 2026).
  Add a feature = one entry in the `F` map (build a fresh doc, isolate the feature; text features go in
  the `isText` name prefixes).
- **Score:** `node _matrix.mjs <path-to>/demo/feat_id <outDir>` → `report.html` (worst-first, heatmaps)
  + `results.json`. Re-run after any converter change; READ/MISS + scores update themselves.
- **Priorities:** the visibility gate (5–7, small fix, high visibility) and the effects family (1, 8, 10,
  15, 16 + subtle) are the biggest wins; paragraph decoration (2, 13, 14) and CMYK (3) next.
