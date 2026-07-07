# IDML → Serial Regression Testing

How we debug and safely change `idml2serial` (and the controllers it walks)
without regressing the files that already work.

## The core principle

**The parser must be correct for _every_ IDML file, not just the one in front of
us.** IDML is a general format; our converter is a general converter. A "fix"
that hard-codes around one document's quirk, or that improves one file while
quietly shifting another, is not a fix — it's a trade we have to make
consciously and verify.

So the rule for any change to the parse / conversion is:

> Improve the file under test **without** introducing unexplained changes in the
> other files.

### "No changes elsewhere" is the goal, but not an absolute law

Two nuances matter:

1. **A previously "working" file was never _proven_ correct — it just never
   showed an obvious problem.** Many positioning bugs (a few px of text drift, a
   slightly wrong crop) were always present; they only became visible on a file
   where they produced a large, eye-catching gap. So when a change moves
   something in another file, that movement is **not automatically a
   regression** — it may be the _more correct_ result finally applied
   everywhere.

2. Therefore every difference in another file must be **classified**, not just
   detected. A diff is a question ("is this better or worse?"), not a verdict.

## Where the test material lives

All under `demo/` in this module. Every case is a folder containing the `.idml`
plus its unzipped twin (`*_UNPACKED/`) so the raw XML (designmap, `Spreads/`,
`Stories/`, `Resources/`, `MasterSpreads/`) can be read directly.

| Folder | Role |
| --- | --- |
| `demo/working_demos/` | **Battle-tested baselines.** These render acceptably today. They are the regression guard — after any parser change they must not change in unexplained ways. |
| `demo/idml demos/` | **Cases under investigation.** Files with known or suspected problems, each in its own `<name>/` folder holding the `.idml`, `.indd`, `.pdf`, `..._UNPACKED/`, `Document fonts/`, and `Links/`. Reference PNG exports (the "expected" render) usually sit one level up, named after the file (`<name>.png`, `<name>2.png`, … one per spread). |

The convention for a new case is always the same: a folder named after the
template, containing the `.idml` and its `..._UNPACKED/` directory (plus
whatever InDesign packaged alongside it — fonts, links, PDF).

### The `working_demos` baseline set (as of writing)

- `ART_26_Bluepic-Banner_1080x1080px_MB_DE_EN`
- `ISM_2026_28982_Bluepic_Speaker_Master_1080x1920px_v02`
- `RATL_25_Bluepic-Banner_1080x1080px`
- `gc_2026_Hallenplan_2026_1920x1080`

When a case from `idml demos/` is fully fixed and verified, it can graduate into
`working_demos/` so it's protected from future regressions.

## The tools

Two helper scripts live at the module root (both run with `npx tsx`):

- **`_run-idml.mjs <file.idml>`** — quick human-readable dump of one file's
  serial element tree, fonts, and image-asset counts. For eyeballing a single
  case.
- **`_snapshot.mjs <outDir> [folder ...]`** — the regression workhorse. Converts
  every `.idml` under the given folders (default `demo/working_demos`) and
  writes one **normalized, deterministic** snapshot per file into `<outDir>`.
  Every float is rounded to 2 decimals, identity transforms are dropped, and
  only geometry/appearance/text keys are recorded — so the snapshot is stable
  and any `diff` is a real signal, not float noise. Output determinism is
  guaranteed (same input ⇒ byte-identical snapshot).

Snapshots are written under `_snapshots/` (git-ignored).

## Node runtime

Since the **flat-svg removal (v0.1.16+)** the module has no native dependency of
its own — XML parsing is `linkedom` (pure JS) in Node, native `DOMParser` in the
browser. So **geometry mode runs on any Node, including the default node 25** —
no more node@22 requirement for it.

The one remaining native dep is **`skia-canvas`, and only for _full mode_**
(below), which needs a canvas for text measurement.

- **Geometry mode → default node 25, zero setup.**
- **Full mode → Homebrew node@22.** `skia-canvas@3` is N-API (ABI-stable), but on
  this machine its binary resolves cleanly under node@22; use it for full-mode
  runs:
  ```
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
  ```

## Two run modes (this affects what a run can prove)

Text layout/splitting comes from `@bluepic/core/text`, which needs a canvas.

- **Geometry mode (default, zero setup).** Plain Node has no canvas, so text
  splitting **degrades to `'never'`** (one element per text frame) — you'll see
  the warning `@bluepic/core/text unavailable … text frames will not be split`.
  All non-text geometry, crops, colors, masks, z-order, fonts collection, etc.
  are fully exercised and deterministic. Good for the majority of regressions.
- **Full mode (exercises text splitting + real font metrics).** Set
  `IDML_HEADLESS=1`, which imports `@bluepic/core/headless` first to install the
  `happyDOM` + `SkiaCanvas` globals the text module uses in Node. **Requires
  `happy-dom` and `skia-canvas`** (declared by `@bluepic/core`, not present here
  by default). Because both are optional peers, plain `npm i` reports "up to
  date" and skips them — install with **`--force`** under node@22:
  ```
  npm i --no-save --force skia-canvas@3.0.8 happy-dom@20.9.0
  ```
  Since the flat-svg removal, XML (linkedom, no globals) and text measurement
  (happy-dom + skia) **coexist in one process** — the old paper-jsdom stack
  couldn't (double DOM). idml's XML layer picks its parser by whether a native
  `DOMParser` global exists, NOT by `window`, so happy-dom defining `window`
  no longer forces the browser path.

> ⚠️ When you compare a baseline and a candidate snapshot, **both must be
> produced in the same mode.** A geometry-mode baseline vs. a full-mode candidate
> will show every text frame "changing" for the wrong reason. Any bug about text
> _splitting_ specifically must be investigated in full mode.

Also note: linked images (in a case's `Links/` folder) are **not embedded**, so
locally they convert to gray placeholders and land in `missingImages`. Their
_geometry / crop_ is still correct and testable; only the actual pixels are
placeholder. In the real import wizard those links resolve.

## The process

### 0. Reproduce & locate (before touching any code)

1. Run `_run-idml.mjs` (or `_snapshot.mjs`) on the case file and read the serial
   tree.
2. Cross-reference the raw XML in the case's `..._UNPACKED/` for the specific
   frame (find its `Self` id in `Spreads/Spread_*.xml`, its text in
   `Stories/Story_*.xml`).
3. Pin the defect to a concrete element id + a concrete step in the pipeline
   (geometry bake, crop math, text chunking, color/tint, mask decision, …).
   Confirm what's wrong **and why** before proposing a change.

### 1. Capture the baseline

```
npx tsx _snapshot.mjs _snapshots/before demo/working_demos "demo/idml demos"
```

This records the current behaviour of **both** the guard set and the case under
test. (Add `IDML_HEADLESS=1` in front if the bug is about text splitting — and
then use it for every step below too.)

### 2. Make the change

Edit the parser / `idml2serial` / a controller. Keep the change principled and
general — driven by what IDML _means_, not by one file's numbers.

### 3. Capture the candidate & diff

```
npx tsx _snapshot.mjs _snapshots/after demo/working_demos "demo/idml demos"
diff -ru _snapshots/before _snapshots/after
```

### 4. Classify every diff

For each changed file, decide which bucket the change falls into:

| Bucket | Meaning | Action |
| --- | --- | --- |
| ✅ **Intended fix** | The case under test now matches its reference PNG / InDesign. | Keep. Verify visually against the reference. |
| ✅ **Latent-bug correction** | Another file changed, and the new output is _more_ correct (the old value was subtly wrong but unnoticed). | Keep — but **write down why** it's more correct, and re-check that file's reference render. |
| ⚠️ **Acceptable drift** | Another file moved by a visually negligible amount (sub-pixel, rounding). | Keep, but note it. If it's large, treat as a regression until explained. |
| ❌ **Regression** | Another file is now worse, or changed for a reason you can't explain. | Do **not** ship. Refine the change until the diff is explainable, or narrow its scope. |

The bar: **no diff ships unexplained.** "It changed and I don't know why" is a
blocker, whether or not the change looks harmless.

### 5. Verify visually, not just structurally

Snapshots catch structural/numeric change; they don't prove the render is
_right_. For the case under test (and any baseline that changed), compare the
actual render against the reference PNG / the `.pdf` in the case folder. A
green snapshot diff with a wrong-looking render means the snapshot isn't
capturing the failing dimension — extend `_snapshot.mjs` to record it.

## Quick checklist

- [ ] Defect reproduced and pinned to an element id + pipeline step, with a
      root-cause explanation (not just symptoms).
- [ ] `before` snapshot captured over `working_demos` **and** the case folder,
      in the correct run mode.
- [ ] Change is general (motivated by IDML semantics, not one file's numbers).
- [ ] `after` snapshot diffed against `before`.
- [ ] **Every** diff classified (fix / latent-correction / acceptable / regression).
- [ ] No unexplained change in `working_demos`.
- [ ] Case verified visually against its reference render.
- [ ] If fully fixed, consider promoting the case into `working_demos/`.
