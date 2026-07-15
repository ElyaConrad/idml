# IDML fidelity — architecture for CMYK, blend modes, feather, effects

Design doc for the four remaining high-value fidelity features, in the user's priority
order: **(1) CMYK → (2) blend modes → (3) feather → (4) effects family**.

## 0. Framing decisions (apply to all four)

**Target the puppeteer / Chromium pipeline.** It is the production default
(`api/idml.ts` — `engine ?? 'puppeteer'`), and it renders with full SVG-filter + CSS
support. resvg is opt-in and its filter/blend subset is limited — treat resvg parity as
best-effort, never a constraint. (The SVG-export path uses the same core `SvgFilter`
output, so it benefits for free where the consuming renderer supports it.)

**Two independent architectural threads.** These features split cleanly and should not
be conflated:

| Thread | Features | Where it lives | When it runs |
|---|---|---|---|
| **A — Color** | CMYK | `idml` `convert/paint.ts` | convert-time; bakes sRGB into the serial |
| **B — Compositing** | blend, feather, effects | `@bluepic/core` `SvgFilter.vue` + serial `Filter` | render-time; SVG filters/masks/`mix-blend-mode` in Chromium |

The serial is **always sRGB** (core, SVG, CSS are sRGB) — so all colour management
happens in idml at convert time and never leaks into core. Compositing is the opposite:
it is inherently a render-time concern and belongs in core's filter graph, which every
engine (puppeteer, SVG export, resvg) consumes.

**Reuse the discrete-field Filter model.** `Template.Filter` is a flat object of typed,
nullable fields (`blur`, `dropShadow`, `blendMode`, …) and `SvgFilter.vue` composes them
into one `<filter>`. This is type-safe and already proven — every new effect is a new
typed field + a primitive block, not a new subsystem.

**Deployment coupling (important).** The puppeteer path selects a *deployed* renderer
instance by `serial.bxCoreVersion` (`getRendererInstanceIdFromBxCoreVersion`). New core
effects only appear in puppeteer output once the sandbox/renderer for that version ships
the new `@bluepic/core`. Budget a core publish **and** a renderer redeploy per compositing
feature. (Thread A / CMYK has no such coupling — it is pure convert-time.)

---

## 1. CMYK  (priority 1 — `idml`-only, no core/renderer change)

### Problem
`colorInputToHex` uses the naive device formula `r = 255·(1−c)·(1−k)` …. InDesign converts
through the document's **`CMYKProfile="U.S. Web Coated (SWOP) v2"`** with
`RGBProfile="sRGB IEC61966-2.1"` (both declared in the IDML preferences). Naive vs SWOP
diverges most in rich blacks, saturated primaries, and mid-tones → the observed ~12%.

### Architecture — a `ColorManager` in idml
Introduce one owner of colour conversion; `colorToHex` / `colorInputToHex` delegate to it.

```
convert/color/ColorManager.ts
  - resolveDocumentProfiles(idml): { cmyk: 'swop-v2' | …, rgb: 'srgb', intent }
       reads Preferences / designmap CMYKProfile + RGBProfile + SolidColorIntent
  - cmykToSrgb(c,m,y,k): [r,g,b]      // profile-based; 0..100 in, 0..255 out
  - (rgb passes through as sRGB; spot/Lab handled here later if needed)
```

`paint.ts` keeps applying **tint after conversion** in sRGB (`applyTintChannel`, mixing
toward paper-white) — that already matches InDesign's on-screen tint and is orthogonal to
the colour-space transform.

### The transform — recommended: build-time SWOP→sRGB LUT
Three options, in decreasing recommendation:

- **(A, recommended) Precomputed 3-D LUT, generated at build time.** A Node build script
  runs the real SWOP v2 → sRGB ICC transform once over a grid (e.g. 17⁴ CMYK samples via
  a color-management lib), emits a compact binary table shipped in `src/assets/`. Runtime
  does **tetrahedral interpolation** — fast, deterministic, no runtime WASM, ICC-accurate,
  and the profile is a *build* input (no licensing at runtime). This is the same "bake the
  expensive thing at build time" pattern the repo already likes.
- **(B) Runtime `lcms`-WASM.** Honours arbitrary *embedded* per-document profiles.
  Heavier (WASM + profile bytes), but idml already lazy-loads WASM engines (ghostscript,
  pdf.js) so it fits. Reserve for the rare non-SWOP document; not needed for the 95% case.
- **(C) Polynomial/matrix approximation of SWOP.** Compact, no assets, but least accurate.
  Only a fallback.

**Profile resolution:** map the declared `CMYKProfile` name → a bundled LUT; default to
SWOP v2; **unknown profile → current naive formula + a `log()`** (never silently wrong).

### Scope & verification
- Files: new `convert/color/*`, edits to `convert/paint.ts` only. Everything downstream
  (gradients, drop-shadow colour, text, rules, shading) already routes through
  `colorToHex` → gets correct CMYK for free.
- Verify against `feat-cmyk` (7 swatches: 0/0/0/100, 0/0/100/0, …, 100/90/10/0) — each has
  a known InDesign sRGB value; assert per-swatch ΔE, not just the pixel-diff score.

---

## 2. Blend modes  (priority 2 — **already works in Chromium**; small hardening)

### Finding
idml already emits `filter.blendMode`; core already sets `mix-blend-mode` on the element
`<g>` (`ElementsSlot.vue`). Chromium honours it — the 13.8% was **purely the resvg
limitation** (resvg drops `mix-blend-mode` on deeply nested `<g>`). On the puppeteer
pipeline this is effectively done.

### Remaining architectural work
1. **Verify** feat-blend through the *puppeteer* engine (not resvg) → expect ~0%.
2. **Isolation semantics (the one real subtlety).** `mix-blend-mode` blends against the
   *backdrop* — everything painted below in the same stacking context. InDesign blends an
   object against its **containing group / spread**, not the whole document. Without an
   isolation boundary, an object set to Multiply darkens against *all* content beneath it,
   which over-blends vs InDesign. Fix: emit `isolation: isolate` (CSS) / an isolated group
   on the boundary that matches InDesign's blend scope — the spread by default, or the
   parent group when the blend lives inside one. This is a targeted rule in the group/mask
   emit, not a new subsystem.
3. **Mode coverage:** map every IDML `BlendMode` to its CSS keyword; the handful with no
   CSS equivalent (rare) fall back to `normal` + a `log()`.

### Scope
Verification + an isolation rule in core's group emit (+ possibly idml marking blend-group
boundaries). Small. Core+types already carry `blendMode`.

---

## 3. Feather  (priority 3 — core filter/mask + idml emit)

Two distinct InDesign features, two distinct SVG mechanisms:

### 3a. Basic feather — a **filter**
IDML: `<FeatherSetting Mode="Standard" Width="40">` (+ corner mode Sharp/Rounded/Diffused,
noise). Uniform soft edge: the shape's alpha fades to transparent over `Width`.

SVG sub-graph (fits the `SvgFilter` composer):
```
feGaussianBlur in=SourceAlpha stdDeviation=Width/2 → blurredAlpha
feComponentTransfer on blurredAlpha (feFuncA to shape the falloff by corner mode)
feComposite in=SourceGraphic in2=shapedAlpha operator=in → soft-edged source
```
Add `feather: { width, corners, noise } | null` to `Filter`; render the block in
`SvgFilter.vue`. Corner mode tunes the `feFuncA` curve / an added `feMorphology` erode.

### 3b. Gradient feather — a **mask** (not a filter)
IDML: `<GradientFeatherSetting …>` with type (linear/radial), angle, and opacity stops.
This is a *directional* alpha ramp, not an edge effect — a `<mask>` with a
`linear/radialGradient` (white→black per stops) applied to the element via `mask=url(#…)`.

Architecture decision: masks live **outside** the `<filter>`. Core already has a clip
`Mask.vue`; introduce a parallel **soft alpha-mask** channel on the element wrapper
(`ElementsSlot.vue` emits `<mask>` in `<defs>` + `mask=url()` on the `<g>`), fed by a new
serial field `gradientFeather: { type, angle, stops } | null`. Keep it separate from the
clip-mask slot so the two compose (a shape can be clipped *and* gradient-feathered).

### Scope
`Filter.feather` (filter) + a mask channel for `gradientFeather` + types + idml
`Sprite.getFeather()/getGradientFeather()` (parse the `*Setting` on the transparency
settings, mirroring `getDropShadow`) + `paint.ts` emit. Core + types + idml + redeploy.

---

## 4. Effects family  (priority 4 — the big one: a general effects composer)

Effects: **innerShadow, outerGlow, innerGlow, satin, bevelEmboss** (drop shadow already
exists and folds in). IDML data model (all on the object's transparency settings, like
drop shadow):

```
InnerShadowSetting  Applied EffectColor Opacity Angle Distance Size(=blur) [Spread Noise]
OuterGlowSetting    Applied EffectColor Opacity Size [Spread Technique Noise]   (no offset)
InnerGlowSetting    Applied EffectColor Opacity Size [Spread Source Noise]      (no offset)
SatinSetting        Applied EffectColor Opacity Angle Distance Size [Invert]
BevelAndEmbossSetting Applied Style Technique Direction Size Angle Altitude Depth …
```

### The key architectural decision — an ordered composer, not ad-hoc primitives
Multiple effects stack simultaneously, in InDesign's **canonical z-order**, and shadows/
glows sit *behind* or *inside* the source. The current `SvgFilter` chains primitives with
implicit `in` (fine for colour matrices) — that cannot express "merge this glow *under* the
source and that inner-shadow *on top, clipped to the alpha*." So refactor `SvgFilter.vue`
into an **EffectsComposer** that builds the graph with **explicit `in`/`result` wiring and a
final `feMerge`** in InDesign order:

```
feMerge (bottom → top):
  dropShadow      ── behind  (feGaussianBlur(SourceAlpha)+feFlood+feComposite, offset)
  outerGlow       ── behind  (same, dx=dy=0, spread via feMorphology dilate)
  SourceGraphic   ── the object itself
  innerShadow     ── inside  (feFlood → feComposite out SourceAlpha, offset+blur, in SourceAlpha)
  innerGlow       ── inside  (innerShadow with no offset)
  satin           ── inside  (SourceAlpha offset ±, blurred, XORed, masked by SourceAlpha)
  bevelEmboss     ── inside  (feSpecular/feDiffuseLighting + feDistantLight from angle/altitude,
                              or a highlight+shadow offset pair)
```

Data model: add discrete typed fields to `Filter` — `innerShadow`, `outerGlow`,
`innerGlow`, `satin`, `bevelEmboss` — each an object mirroring its `*Setting`. Each effect
is a **pure sub-graph builder** `(settings, ids) → filterPrimitives[]`, unit-testable in
isolation, so the composer just orders + merges them. Drop shadow migrates into the same
builder set (no behaviour change).

### Build incrementally, verify each vs its feat case
`innerShadow` → `outerGlow` → `innerGlow` → `satin` → `bevelEmboss`. Each lands with its
own `Filter` field + sub-graph + idml `Sprite.get<Effect>()` + emit, diffed against
`feat-<effect>`. Bevel is the hardest (lighting) — do it last; a highlight+shadow
approximation may be enough to clear its (small) heat.

### Scope
Largest of the four: `Filter` expansion + `SvgFilter`→`EffectsComposer` refactor + types +
idml effect parsing/emit. But it is *N repetitions of one clean pattern*, not N designs.

---

## Cross-cutting notes

- **Effect/feather colours** go through `colorToHex` → automatically get correct CMYK once
  Thread 1 lands. Do CMYK first (priority 1) so every later effect's colour is right.
- **Publish coupling:** CMYK = idml-only. Blend/feather/effects = `@bluepic/core` +
  `@bluepic/types` + `idml` together, **plus a renderer/sandbox redeploy** for the
  puppeteer path (see §0). Keep a `prepack`-style build guard on core too (idml already has
  one) so a stale `lib/` can't ship.
- **Order of work matches priority and dependency:** CMYK (unblocks correct effect colour) →
  blend (verify+isolate, cheap) → feather (medium) → effects (large, incremental).
- **Test harness:** the existing `_matrix_render.mjs` + per-`feat-*` diff already covers all
  of these; add per-swatch ΔE assertions for CMYK.
```
