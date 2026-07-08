import type * as Template from '../../serial/serial-types';
import { TextFrame } from '../../controllers/sprites/TextFrame';
import { DecomposedTransform } from '../../util/layout';
import { makeRectangle, makeLineBackgroundRectangle, identityTransform, makeText, makeGroup, Box, RichTextRun, TextBounding } from '../../serial/builders';
import { IDENTITY_DECOMP } from '../constants';
import { ConvertSettings } from '../types';
import { AssetCollector } from '../assets';
import { surfaceOf } from '../paint';
import { cornerRadii } from '../shapes';
import { EffectiveTextStyle, ALIGN_TO_FRACTION, JUSTIFY_ALIGNS, effectiveTextStyle, sameTextStyle, sameLetterSpacing } from './style';
import { TextRun, TextChunk, chunkText, splitRunsIntoChunks } from './split';

/**
 * Text measurement/layout comes from @bluepic/core (single source of truth
 * with the renderer) and needs a canvas, which plain Node lacks — so it is
 * loaded lazily on the first frame that actually wants splitting, and on
 * failure conversion degrades gracefully to unsplit text elements.
 */
let textLayoutModulePromise: Promise<typeof import('@bluepic/core/text') | null> | undefined;
export function loadTextLayout() {
  textLayoutModulePromise ??= import('@bluepic/core/text').catch((error) => {
    console.warn('[idml2serial] @bluepic/core/text unavailable (no canvas in this environment?) — text frames will not be split at line breaks.', error);
    return null;
  });
  return textLayoutModulePromise;
}

/** Build one text element from runs (uniform runs collapse to plaintext). */
export function textElementFromRuns(id: string, runs: TextRun[], box: Box, align: number, justify: boolean, verticalAlign: number, lineHeightPercent: number, transform: DecomposedTransform, bounding?: TextBounding): Template.Elements.Text {
  const base = runs[0].style;
  const uniform = runs.every((r) => sameTextStyle(r.style, base));
  const plainText = runs.map((r) => r.text).join('');
  // `uppercase` is element-level (no per-run equivalent in the richText format).
  // Set it only when EVERY run is AllCaps, so a mixed element never force-caps a
  // normal run — since `uppercase` is part of sameTextStyle, uniform elements are
  // consistently all-caps or all-not anyway; splitting keeps them apart.
  const uppercase = runs.length > 0 && runs.every((r) => r.style.uppercase);
  const richText: RichTextRun[] = runs.map((r) => {
    const format: Record<string, unknown> = {};
    if (r.style.fontFamily !== base.fontFamily) format.fontFamily = r.style.fontFamily;
    if (r.style.fontSize !== base.fontSize) format.fontSize = r.style.fontSize;
    if (r.style.fontWeight !== base.fontWeight) format.fontWeight = r.style.fontWeight;
    if (r.style.fontStyle !== base.fontStyle) format.fontStyle = r.style.fontStyle;
    if (!sameLetterSpacing(r.style.letterSpacing, base.letterSpacing)) format.letterSpacing = r.style.letterSpacing;
    if (r.style.color !== base.color) format.color = r.style.color;
    return { text: r.text, format };
  });

  return makeText(
    id,
    {
      box,
      textMode: uniform ? 'plaintext' : 'richtext',
      text: plainText,
      richText,
      fontFamily: base.fontFamily,
      fontSize: base.fontSize,
      fontWeight: base.fontWeight,
      fontStyle: base.fontStyle,
      lineHeight: lineHeightPercent,
      letterSpacing: base.letterSpacing,
      textAlign: align,
      justifyText: justify,
      verticalAlign,
      bounding,
      autoLinebreaks: true,
      uppercase,
      fill: base.color,
    },
    transform
  );
}

// The canvas 'hanging' baseline sits a fixed 0.8*ascent above the alphabetic
// baseline for every font without a BASE table (all Latin fonts; verified across
// Barlow/Minion/Arial/Georgia/Times). The normal text path now emits the 'font'
// bounding (alphabetic baseline = fontAscent below the box top, which matches
// InDesign's Ascent first-baseline directly), so this only remains for the vertical
// -justify path's optional 'fontSize' mode, whose hanging baseline needs the factor.
export const HANGING_BASELINE_FRACTION = 0.8;

/** Canvas `fontBoundingBoxAscent` for a style at a given size (default the style's
 * own) — the metric InDesign's Ascent first-baseline and core both read. 0 if no
 * canvas / unmeasurable. */
export function fontAscent(core: typeof import('@bluepic/core/text'), style: EffectiveTextStyle, fontSize: number = style.fontSize): number {
  try {
    const metrics = core.textInfo('Mg', { fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize, letterSpacing: style.letterSpacing }, 'alphabetic', false);
    const ascent = metrics?.fontBoundingBoxAscent;
    return ascent && Number.isFinite(ascent) ? ascent : 0;
  } catch {
    return 0;
  }
}

/** Canvas `fontBoundingBoxDescent` for a style — the descent 'font' bounding places
 * below the baseline and adds to the line advance. Subtracted out of the emitted
 * lineHeight so the physical leading still equals InDesign's. 0 if no canvas. */
export function fontDescent(core: typeof import('@bluepic/core/text'), style: EffectiveTextStyle, fontSize: number = style.fontSize): number {
  try {
    const metrics = core.textInfo('Mg', { fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize, letterSpacing: style.letterSpacing }, 'alphabetic', false);
    const descent = metrics?.fontBoundingBoxDescent;
    return descent && Number.isFinite(descent) ? descent : 0;
  } catch {
    return 0;
  }
}

// A character underline this thick (relative to the em) is not a real underline
// but InDesign's idiom for a per-line highlight bar ("Bauchbinde") — reconstructed
// as a line-bound background rectangle rather than an actual text-decoration.
export const BAUCHBINDE_MIN_WEIGHT_RATIO = 0.5;

/**
 * Build the "Bauchbinde" highlight bar for a text element whose base run carries a
 * thick offset underline — an iterated rectangle bound to `<id>.lines[i]`, one bar
 * per rendered line, behind the text. Returns null unless the run is underlined
 * with a bar-thick stroke and the font ascent is measurable (needs a canvas).
 *
 * `scale` is the merged-fit factor (split path) so the bar's weight/offset and the
 * measured ascent all track the shrunken text; the emitted rectangle centres on the
 * baseline+offset (baseline = line top + ascent) with height = the underline weight.
 */
export function lineBackgroundBar(core: typeof import('@bluepic/core/text') | null, targetTextId: string, style: EffectiveTextStyle, scale: number, pad: number, leftAnchorX: number | null): Template.Elements.Rectangle | null {
  if (!style.underline) return null;
  const fontSize = style.fontSize * scale;
  const weight = (style.underlineWeight ?? 0) * scale;
  if (!(fontSize > 0 && weight >= BAUCHBINDE_MIN_WEIGHT_RATIO * fontSize)) return null;
  const offset = (style.underlineOffset ?? 0) * scale;
  // Exact baseline needs the font ascent (line top -> baseline for 'font' bounding).
  // Without a canvas, the builder falls back to a render-time 0.8*lineHeight estimate.
  const ascent = core ? fontAscent(core, style, fontSize) : null;
  // Underline color defaults to the text fill when the run gives none (InDesign).
  const fill = style.underlineColor ?? style.color;
  return makeLineBackgroundRectangle(`${targetTextId}_linebg`, targetTextId, { fill, weight, offset, ascent, pad, leftAnchorX });
}

/** A layout probe over the merged frame: `(lineHeight%, bounding, blockTopY, maxHeight)`.
 * Vertical justify uses it to read the natural (huge maxHeight = un-shrunk) block. */
export type ProbeLayout = (lineHeight: number, bounding: TextBounding, y: number, maxHeight: number) => import('@bluepic/core/text').TextLayoutResult;

/** actualBoundingBox ascent/descent of ONE rendered line's text at the base style — the
 * real ink extent (content-dependent), used to anchor vertical justify on InDesign's grid. */
export function lineActualMetrics(core: typeof import('@bluepic/core/text'), style: EffectiveTextStyle, text: string): { ascent: number; descent: number } {
  try {
    const m = core.textInfo(text || 'M', { fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize: style.fontSize, letterSpacing: style.letterSpacing }, 'alphabetic', false);
    const asc = m?.actualBoundingBoxAscent;
    const desc = m?.actualBoundingBoxDescent;
    return { ascent: asc && Number.isFinite(asc) ? asc : 0, descent: desc && Number.isFinite(desc) ? desc : 0 };
  } catch {
    return { ascent: 0, descent: 0 };
  }
}

/** Binary-search the lineHeight % whose natural (un-shrunk) block height equals `target`
 * — the widest line spread that still fits a frame without core shrinking the font. */
export function fitLineHeightForBlockHeight(probe: ProbeLayout, bounding: TextBounding, y: number, target: number): number {
  let lo = 50;
  let hi = 1000;
  for (let k = 0; k < 32; k++) {
    const mid = (lo + hi) / 2;
    if (probe(mid, bounding, y, 1e6).virtualBBox.height < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Reproduce InDesign `VerticalJustification="JustifyAlign"` as ONE Bluepic text
 * element: the lines are spread to a uniform baseline gap that fills the frame, with
 * the first baseline on InDesign's grid (frameTop + the first line's actual ascent).
 *
 * Core has no vertical-justify mode and ALWAYS shrinks text that would overflow its
 * box, so we widen the line advance (lineHeight) to the justified gap and place the
 * box ourselves. Two knobs, from {@link ConvertSettings}:
 *  - bounding `'fontSize'` (advance = fontSize×lineHeight; near-exact InDesign match,
 *    box grows the least) or `'actual-outer'` (block auto-anchors on the first line's
 *    real ink, never needs the hanging-offset constant).
 *  - fit `'grow'` (box a few px TALLER than the frame so the last line's descenders
 *    overflow it like InDesign and the font is never shrunk — gap exact) or `'contain'`
 *    (box = frame height; descenders kept inside, gap ~3–5% tighter).
 *
 * The baseline advance is linear in lineHeight with slope fontSize/100 in BOTH bounding
 * modes (verified), so one calibration probe fixes the constant offset and lets us solve
 * lineHeight for a target gap. Returns null (caller falls through to the normal path)
 * for a single line, a frame too short to spread into, or unusable measurements.
 */
export function buildVerticalJustifyElement(
  id: string,
  runs: TextRun[],
  box: Box,
  align: number,
  justify: boolean,
  transform: DecomposedTransform,
  core: typeof import('@bluepic/core/text'),
  base: EffectiveTextStyle,
  settings: ConvertSettings,
  probe: ProbeLayout
): Template.Elements.Text | null {
  const frameTop = box.y;
  const bounding = settings.verticalJustifyBounding;
  const naturalLineHeight = base.lineHeight * 100;
  const HUGE = 1e6;

  // How many lines the text naturally wraps to at its own leading (un-shrunk).
  const natural = probe(naturalLineHeight, bounding, frameTop, HUGE);
  const N = natural.lines.length;
  if (N < 2) return null; // one line: nothing to distribute — normal path applies.

  // InDesign anchors the justified block so the first line's ink cap-top meets the
  // frame top: first baseline = frameTop + that line's actual ascent.
  const mTop = lineActualMetrics(core, base, natural.lines[0]?.text ?? '').ascent;

  // BASELINE advance(lineHeight) = offset + (fontSize/100)*lineHeight — calibrate once.
  // Must be measured baseline-to-baseline (`y + ascent`), NOT box-top to box-top: in
  // 'actual-outer' the outer line's box is shorter, so its box-top gap differs from the
  // (uniform) baseline gap we target. For 'fontSize' ascent is 0, so the two coincide.
  const slope = base.fontSize / 100;
  const calib = probe(150, bounding, frameTop, HUGE);
  const baselineOf = (l: { y: number; ascent: number }) => l.y + l.ascent;
  const advRef = calib.lines.length > 1 ? baselineOf(calib.lines[1]) - baselineOf(calib.lines[0]) : base.fontSize * 1.5;
  const offset = advRef - slope * 150;
  // Where the first VISUAL baseline sits below the block top for this bounding mode:
  // 'actual-outer' reports it as the first line's ascent; 'fontSize' draws hanging.
  const firstBaselineOffset = bounding === 'actual-outer' ? (calib.lines[0]?.ascent ?? mTop) : HANGING_BASELINE_FRACTION * fontAscent(core, base);

  let lineHeightPercent: number;
  let boxHeight: number;
  if (settings.verticalJustifyFit === 'contain') {
    // Widest spread whose natural block still fits the frame (no shrink, descenders in).
    lineHeightPercent = fitLineHeightForBlockHeight(probe, bounding, frameTop, box.height);
    boxHeight = box.height;
  } else {
    // grow: uniform gap from the first baseline down to the frame bottom (descent overflows).
    const gap = (box.height - mTop) / (N - 1);
    lineHeightPercent = (gap - offset) / slope;
    // Grow the box to the natural block height so core never shrinks the overflowing text.
    const block = probe(lineHeightPercent, bounding, frameTop, HUGE).virtualBBox.height;
    boxHeight = Math.max(box.height, block + 0.5);
  }

  // Only justify when it actually SPREADS the lines (widens past their natural leading);
  // a frame shorter than the natural block would compress/shrink — leave that to the
  // normal path, which fits it the usual way.
  if (!Number.isFinite(lineHeightPercent) || lineHeightPercent <= naturalLineHeight) return null;

  const justifyBox = { ...box, y: frameTop + mTop - firstBaselineOffset, height: boxHeight };
  return textElementFromRuns(id, runs, justifyBox, align, justify, 0, lineHeightPercent, transform, bounding);
}

/**
 * Convert a text frame's story into one or more Bluepic text elements.
 *
 * Bluepic connects text elements to input fields, so a frame that stacks
 * several statements can become one element per statement. How eagerly that
 * happens is controlled by `settings.textSplittingHeuristic` — see
 * {@link splitRunsIntoChunks} for the split rules and {@link
 * ConvertIDML2SerialOptions.textSplittingHeuristic} for the modes.
 *
 * Geometry: the ORIGINAL merged frame is laid out ONCE via @bluepic/core/text
 * (the renderer's own fitting + line stacking, so positions are exactly what
 * bluepic-core will render). Each chunk's box then starts at its first line's
 * y, ends where the next emitted chunk starts (the last one at the frame
 * bottom), keeps the full frame width, and is top-anchored (verticalAlign 0)
 * — so every line renders exactly where the merged frame would have put it,
 * and together the boxes tile the frame's vertical extent. Line-x math is
 * width-invariant (offset = (max - line) * align), so alignment is preserved
 * per chunk. All chunks keep the MERGED element's lineHeight ratio — IDML
 * per-paragraph leading is (as before) not preserved — which keeps each
 * chunk's own rendering self-consistent with the merged layout above.
 *
 * The normal path emits `bounding: 'font'` (the system default): line advances
 * are (fontBoundingBox height) × lineHeight and the first line's alphabetic
 * baseline lands at frameTop + fontAscent = InDesign's "Ascent", so no box shift
 * is needed. 'font''s extra descent is subtracted out of the emitted lineHeight so
 * the physical leading still equals InDesign's. Without a canvas (fonts unmeasured)
 * the path falls back to the render-font-independent `'fontSize'`.
 *
 * When splitting is off, unnecessary (single statement) or unavailable (no
 * canvas), the result is a single element equal to the pre-split output —
 * except that U+2028 is now always normalized to '\n' (core only breaks
 * lines on '\n'; a raw U+2028 would render as a glyph, not a break).
 */
export async function buildTextElements(frame: TextFrame, box: Box, singleElementTransform: DecomposedTransform, collector: AssetCollector, id: string, settings: ConvertSettings): Promise<Template.Element[]> {
  const paragraphs = frame.getStory()?.getParagraphs() ?? [];
  if (paragraphs.length === 0) return [];

  // The document's root default font ([No paragraph style] AppliedFont), used
  // when a paragraph/character style defines none (it inherits via BasedOn).
  const defaultFont = frame.context.idml.getParagraphStyleById('ParagraphStyle/$ID/[No paragraph style]')?.appliedFont ?? 'Arial';

  // Paragraph spacing (local override wins over the applied style). InDesign adds
  // SpaceAfter(prev) + SpaceBefore(this) between paragraphs, and ignores SpaceBefore
  // on the very first paragraph of a frame.
  const paraSpaceBefore = (p: (typeof paragraphs)[number]) => p.localParagraphStyle?.spaceBefore ?? p.appliedParagraphStyle?.spaceBefore ?? 0;
  const paraSpaceAfter = (p: (typeof paragraphs)[number]) => p.localParagraphStyle?.spaceAfter ?? p.appliedParagraphStyle?.spaceAfter ?? 0;

  const runs: TextRun[] = [];
  let firstAlign = 0;
  let firstJustify = false;
  paragraphs.forEach((paragraph, pIndex) => {
    // Local paragraph alignment OVERRIDES the applied style's alignment.
    const alignName = (paragraph.localParagraphStyle?.align ?? paragraph.appliedParagraphStyle?.align ?? 'left') as string;
    const align = ALIGN_TO_FRACTION[alignName] ?? 0;
    const justify = JUSTIFY_ALIGNS.has(alignName);
    if (pIndex === 0) {
      firstAlign = align;
      firstJustify = justify;
    }
    const incomingSpace = pIndex === 0 ? 0 : paraSpaceAfter(paragraphs[pIndex - 1]) + paraSpaceBefore(paragraph);
    let firstRunOfPara = true;
    for (const feature of paragraph.features) {
      const style = effectiveTextStyle(paragraph, feature, defaultFont);
      // Resolve the concrete binary: family + IDML style -> Fonts.xml font (for
      // its PostScript name) -> XMP metadata (for the original file name).
      const idml = frame.context.idml;
      const font = idml.getFont(style.fontFamily, style.styleName);
      const documentFont = idml.resolveFontFile({ family: style.fontFamily, styleName: style.styleName, postScriptName: font?.postScriptName });
      collector.addFont(style.fontFamily, {
        weight: style.fontWeight,
        italic: style.fontStyle === 'italic',
        styleName: style.styleName,
        postScriptName: font?.postScriptName ?? documentFont?.fontName,
        fontFileName: documentFont?.fontFileName,
        fontType: documentFont?.fontType ?? font?.type,
      });
      runs.push({ text: feature.content ?? '', style, align, justify, spaceBefore: firstRunOfPara && incomingSpace > 0 ? incomingSpace : undefined });
      firstRunOfPara = false;
    }
    // Paragraph boundary = hard break. InDesign usually carries it as a
    // trailing <Br/> INSIDE the last CharacterStyleRange of the range (already
    // a '\n' in that run's content) — only add one when the paragraph's own
    // content didn't supply it, otherwise we'd emit a double break.
    const lastFeatureText = paragraph.features.length > 0 ? (paragraph.features[paragraph.features.length - 1].content ?? '') : '';
    if (pIndex < paragraphs.length - 1 && !lastFeatureText.endsWith('\n')) {
      runs.push({ text: '\n', style: runs[runs.length - 1]?.style ?? effectiveTextStyle(paragraph, paragraph.features[0], defaultFont), align, justify });
    }
  });

  const base = runs[0]?.style;
  if (!base) return [];
  const verticalAlign = frame.getVerticalAlign();
  const verticalJustify = frame.isVerticalJustify();
  let lineHeightPercent = base.lineHeight * 100; // relative %, e.g. 120 (widened below for vertical justify)

  // Drop a trailing empty paragraph: a final line break with no content after it
  // (often styled at the largest size) is an invisible last line for TOP-aligned
  // text, but core would count it in the frame fit and shrink the whole block to
  // make room — InDesign never shrinks visible text to fit it. For center/bottom
  // that empty line legitimately shifts the visible text, so leave it there.
  // Only trailing NEWLINES are stripped: trailing spaces stay (they can matter
  // for a right/center-aligned last line's position and never add a phantom line).
  // Leading of the trailing pilcrow(s) trimmed here. In InDesign the paragraph-end
  // character sits ON the last visible line, so a trailing empty range styled larger
  // than the last content (e.g. "Position"(14pt lead) followed by an empty 23pt range
  // → 24.85) raises that line's effective leading. Captured to fold into the last
  // chunk's leading when we position split lines on InDesign's baseline grid.
  let trimmedTrailingLeading = 0;
  if (verticalAlign === 0) {
    const isBlankLine = (t: string) => t === '' || (/[\n\u2028\u2029]/.test(t) && t.trim() === '');
    while (runs.length > 1 && isBlankLine(runs[runs.length - 1].text)) {
      const dropped = runs.pop()!;
      trimmedTrailingLeading = Math.max(trimmedTrailingLeading, dropped.style.lineHeight * dropped.style.fontSize);
    }
    const lastRun = runs[runs.length - 1];
    if (lastRun) lastRun.text = lastRun.text.replace(/[\n\u2028\u2029]+$/, '');
  }

  const fullText = runs.map((r) => r.text).join('');
  if (fullText.trim() === '') return []; // empty frame -> no text element (caller still draws any background)

  // `core` is null without a canvas (plain Node) — vertical justify and the 'font'
  // leading/baseline math both need measurement, so they no-op there and the frame
  // keeps its natural leading and the render-font-independent 'fontSize' fallback.
  const core = await loadTextLayout();

  // Prepend a line-background "Bauchbinde" bar for every emitted element whose base
  // run carries a thick offset underline (see lineBackgroundBar). Bars go BEFORE the
  // text in build order so the global z-reverse lands them behind it. The horizontal
  // pad is a FRAME-level constant (base font size, not each line's own), so a bigger
  // first line doesn't get a wider inset than the lines below it; and left-aligned bars
  // pin their left edge to the shared frame-left (boxX) for one clean edge like InDesign.
  const withBars = (pairs: Array<{ el: Template.Elements.Text; style: EffectiveTextStyle; scale: number; boxX: number; align: number }>): Template.Element[] => {
    const bars = pairs
      .map((p) => lineBackgroundBar(core, p.el.id, p.style, p.scale, settings.lineBackgroundPaddingEm * base.fontSize * p.scale, p.align < 0.25 ? p.boxX : null))
      .filter((b): b is Template.Elements.Rectangle => b !== null);
    return [...bars, ...pairs.map((p) => p.el)];
  };

  // Forced breaks normalized: core only breaks lines on '\n', so a raw U+2028 would
  // render as a glyph. Reused by every layout + emit path below.
  const normalizedRuns = runs.map((r) => ({ ...r, text: r.text.replace(/\u2028/g, '\n') }));

  // Lay out the merged frame exactly as bluepic-core would render it. `bounding`, block
  // top `y` and `maxHeight` are params: the split path uses the emit bounding at the
  // frame box, while vertical justify probes the natural (huge maxHeight = un-shrunk)
  // block and may measure 'actual-outer'. `lineHeight` is a param because justify widens it.
  const probeLayout: ProbeLayout = (lineHeight, bounding, y, maxHeight) =>
    core!.layoutText({
      // Measure AllCaps runs as uppercase — capitals are wider, so wrapping matches.
      features: normalizedRuns.map((r) => ({
        text: r.style.uppercase ? r.text.toUpperCase() : r.text,
        style: { fontFamily: r.style.fontFamily, fontSize: r.style.fontSize, fontWeight: r.style.fontWeight, fontStyle: r.style.fontStyle === 'italic' ? 'italic' : 'normal', letterSpacing: r.style.letterSpacing, color: r.style.color, rotate: 0, scale: 1 },
      })),
      fontSize: base.fontSize, x: box.x, y, maxWidth: box.width, maxHeight,
      anchor: [firstAlign, verticalAlign], lineHeight, bounding, textAlign: firstAlign, justifyText: firstJustify,
      autoLinebreaks: true, allowBreakChars: false, cachingEnabled: false,
    });

  // Vertical justify short-circuits to ONE distributed element: it owns its box.y (first
  // baseline on InDesign's grid) and box.height (grown past the frame, or contained), so
  // it runs BEFORE the generic top shift and INSTEAD of the split path. Returns null
  // (fall through) for <2 lines, too-short frames, or if measurement fails.
  if (verticalJustify && core) {
    const justified = buildVerticalJustifyElement(id, normalizedRuns, box, firstAlign, firstJustify, singleElementTransform, core, base, settings, probeLayout);
    if (justified) return withBars([{ el: justified, style: base, scale: 1, boxX: box.x, align: firstAlign }]);
  }

  // Emit with 'font' bounding (the system default). Its first line's alphabetic baseline
  // sits at frameTop + fontAscent = InDesign's "Ascent" first-baseline, so — unlike the
  // hanging 'fontSize' baseline — NO box shift is needed. 'font' widens the line advance by
  // fontBoundingBoxDescent, so subtract that out of lineHeight to keep the physical leading
  // equal to InDesign's. Without a canvas we can't measure the metric, so fall back to the
  // render-font-independent 'fontSize' (advance = fontSize × lineHeight, box unshifted).
  let emitBounding: TextBounding = 'fontSize';
  if (core) {
    emitBounding = 'font';
    lineHeightPercent = base.lineHeight * 100 - (fontDescent(core, base) / base.fontSize) * 100;
  }

  // The last line's font-box descent, added to a box height so 'font' bounding's fit
  // doesn't shrink text that InDesign would just let overflow (see the split loop).
  // Only meaningful with a canvas + 'font' bounding, and only for TOP-aligned frames
  // (centre/bottom anchoring would shift if we grew the box). 0 otherwise.
  const lastRunStyle = runs[runs.length - 1]?.style ?? base;
  const overflowPad = core && emitBounding === 'font' && verticalAlign === 0 ? fontDescent(core, lastRunStyle, lastRunStyle.fontSize) : 0;

  // The unsplit fallback: everything in one element (+ its line-background bar, if any).
  const singleElement = (): Template.Element[] => {
    const paddedBox: Box = { ...box, height: box.height + overflowPad };
    const el = textElementFromRuns(id, normalizedRuns, paddedBox, firstAlign, firstJustify, verticalAlign, lineHeightPercent, singleElementTransform, emitBounding);
    return withBars([{ el, style: base, scale: 1, boxX: box.x, align: firstAlign }]);
  };

  // Line-stacking layout for the split path: same bounding + lineHeight we emit. The
  // merged fit gets the same descent overflow allowance so the whole frame isn't
  // shrunk just because its last line's descent grazes past the frame bottom.
  const runLayout = (lineHeight: number) => probeLayout(lineHeight, emitBounding, box.y, box.height + overflowPad);

  // 'never' keeps the whole frame as one element (richText carries real diffs).
  if (settings.textSplittingHeuristic === 'never') return singleElement();

  const chunks = splitRunsIntoChunks(runs, settings.textSplittingHeuristic);
  const emittable = chunks.filter((chunk) => chunkText(chunk).trim() !== '');
  if (emittable.length <= 1) return singleElement();

  if (!core) return singleElement();

  // Lay out the merged frame (justify already widened lineHeightPercent above, so
  // split chunks distribute to fill the frame just like the single-element path).
  let layout: import('@bluepic/core/text').TextLayoutResult;
  try {
    layout = runLayout(lineHeightPercent);
  } catch (error) {
    console.warn(`[idml2serial] text layout failed for frame ${frame.getId()} — emitting it unsplit.`, error);
    return singleElement();
  }

  // The merged fit may have shrunk the text to fit the frame (uniformly — the
  // fitter multiplies every run by one factor). Chunks must inherit that
  // scale, otherwise a chunk with slack in its box would bounce back to the
  // original size and render bigger than its shrunken siblings. The maximum
  // run size is invariant under the uniform scale, so it recovers the factor.
  const originalMaxFontSize = Math.max(...runs.map((r) => r.style.fontSize));
  const fittedMaxFontSize = Math.max(...layout.lines.flatMap((line) => line.features.map((f) => f.style.fontSize)));
  const fitScale = Number.isFinite(fittedMaxFontSize) && originalMaxFontSize > 0 ? fittedMaxFontSize / originalMaxFontSize : 1;

  // Every '\n'-terminated piece of the merged text is one "segment"; the
  // layout marks each segment's last wrapped line via paragraphEnd. Record
  // where each segment starts vertically and how many lines it wrapped to.
  const segmentTops: number[] = [];
  const segmentLineCounts: number[] = [];
  let segmentOpen = false;
  let segLines = 0;
  for (const line of layout.lines) {
    if (!segmentOpen) {
      segmentTops.push(line.y);
      segmentOpen = true;
      segLines = 0;
    }
    segLines++;
    if (line.paragraphEnd) {
      segmentLineCounts.push(segLines);
      segmentOpen = false;
    }
  }
  if (segmentOpen) segmentLineCounts.push(segLines);
  // A chunk covers (inline '\n' count + 1) segments. Sanity: the totals must
  // agree with the layout, otherwise fall back to the unsplit element.
  const segmentCounts = chunks.map((chunk) => (chunkText(chunk).match(/\n/g)?.length ?? 0) + 1);
  if (segmentCounts.reduce((a, b) => a + b, 0) !== segmentTops.length) {
    console.warn(`[idml2serial] line/segment mismatch for frame ${frame.getId()} — emitting it unsplit.`);
    return singleElement();
  }

  // Per-segment effective leading = the max IDML leading of the runs on that
  // segment (auto-leading is already baked into run.lineHeight = leading/fontSize).
  // This is InDesign's baseline-to-baseline distance PER LINE, which core's single
  // frame line-height flattens — so a small subtitle under a big name (or vice
  // versa) mis-spaces. Built by mirroring splitRunsIntoChunks' segment cut so it
  // lines up 1:1 with segmentTops. The last visible segment also inherits the
  // trimmed trailing pilcrow's leading (its ¶ sits on that line: Anuga 14->24.85).
  // `segmentSpaceBefore` carries IDML paragraph spacing (SpaceAfter(prev) +
  // SpaceBefore(this)) as extra room above a paragraph's first line — kept 1:1 with
  // segmentLeadings and added into the baseline grid below.
  const runLeading = (r: TextRun) => r.style.lineHeight * r.style.fontSize;
  const segmentLeadings: number[] = [0];
  const segmentSpaceBefore: number[] = [0];
  for (const run of runs) {
    let spaceApplied = false;
    for (const part of run.text.split(/(\n|\u2028)/)) {
      if (part === '') continue;
      if (part === '\n' || part === '\u2028') {
        segmentLeadings.push(0);
        segmentSpaceBefore.push(0);
      } else {
        const i = segmentLeadings.length - 1;
        segmentLeadings[i] = Math.max(segmentLeadings[i], runLeading(run));
        if (run.spaceBefore && !spaceApplied) {
          segmentSpaceBefore[i] = Math.max(segmentSpaceBefore[i], run.spaceBefore);
          spaceApplied = true;
        }
      }
    }
  }
  segmentLeadings[segmentLeadings.length - 1] = Math.max(segmentLeadings[segmentLeadings.length - 1], trimmedTrailingLeading);

  // InDesign baseline grid (offset from segment 0's first line): each line advances
  // by its OWN leading; a wrapped segment's inner lines share that segment's
  // leading, then the next segment's first line advances by its leading PLUS any
  // paragraph spacing above it. All in original (pre-fitScale) units; scaled at use.
  const baselineGrid: number[] = new Array(segmentTops.length).fill(0);
  for (let s = 1; s < segmentTops.length; s++) {
    const prevWrapped = Math.max(0, (segmentLineCounts[s - 1] ?? 1) - 1);
    baselineGrid[s] = baselineGrid[s - 1] + prevWrapped * segmentLeadings[s - 1] + segmentLeadings[s] + segmentSpaceBefore[s];
  }

  // Top y of each chunk = its first segment's first line; skip empty chunks
  // (their vertical space folds into the preceding emitted chunk).
  const emitted: { chunk: TextChunk; top: number; segIndex: number }[] = [];
  let segmentCursor = 0;
  chunks.forEach((chunk, index) => {
    const segIndex = segmentCursor;
    const top = segmentTops[segmentCursor];
    segmentCursor += segmentCounts[index];
    if (chunkText(chunk).trim() !== '') emitted.push({ chunk, top, segIndex });
  });

  // Re-seat each chunk's first line onto the InDesign baseline grid instead of
  // core's single-line-height stacking. Two terms: the grid offset (per-line
  // leading), and the ascent float (a smaller line's alphabetic baseline sits at
  // fontAscent below its box top, so a size change shifts the box top by the ascent
  // difference). A frame with uniform size AND leading needs neither — skip it
  // entirely so its output stays byte-identical to the pre-grid behaviour.
  const firstContentStyle = (chunk: TextChunk) => chunk.runs.find((r) => r.text.trim() !== '')?.style ?? chunk.runs[0]?.style ?? base;
  const uniformSize = emitted.every((e) => firstContentStyle(e.chunk).fontSize === base.fontSize);
  const uniformLeading = segmentLeadings.every((l) => l === segmentLeadings[0]);
  const noParagraphSpacing = segmentSpaceBefore.every((s) => s === 0);
  // Vertical justify already widened the layout so segmentTops distribute the lines;
  // the natural-leading grid would undo that, so skip it for justify frames.
  const applyGrid = !verticalJustify && verticalAlign === 0 && segmentLeadings.length === segmentTops.length && emitted.length > 0 && !(uniformSize && uniformLeading && noParagraphSpacing);
  const refAscent = applyGrid ? fontAscent(core, base, base.fontSize * fitScale) : 0;

  const frameBottom = box.y + box.height;
  const elements: Template.Elements.Text[] = [];
  for (let i = 0; i < emitted.length; i++) {
    const { chunk, top, segIndex } = emitted[i];
    const bottom = emitted[i + 1]?.top ?? Math.max(frameBottom, top);
    if (bottom - top <= 0) {
      console.warn(`[idml2serial] non-positive chunk height for frame ${frame.getId()} — emitting it unsplit.`);
      return singleElement();
    }
    const first = firstContentStyle(chunk);
    let y = top;
    if (applyGrid) {
      const gridOffset = (baselineGrid[segIndex] - baselineGrid[emitted[0].segIndex]) * fitScale;
      // 'font' emits an alphabetic baseline at fontAscent below the box top (full ascent,
      // not the 0.8 hanging factor), so a chunk sized differently from the reference shifts
      // its box top by the whole ascent difference.
      const ascentFloat = refAscent - fontAscent(core, first, first.fontSize * fitScale);
      y = emitted[0].top + gridOffset + ascentFloat;
    }
    // The gap to the next chunk (bottom - top) is the baseline leading; but 'font'
    // bounding reserves the full font box (ascent + descent) per line in core's fit,
    // so a box sized only to that gap makes core SHRINK the text when leading is tight
    // (deficit = descent + nextAscent - leading). InDesign instead lets the last line's
    // descent overflow the gap (lines overlap, never shrink). Add that descent back so
    // the intended size renders — top-anchored, so the extra height hangs below and
    // never moves the text. Same principle as vertical-justify's "grow".
    const descentPad = fontDescent(core, first, first.fontSize * fitScale);
    const chunkBox: Box = { x: box.x, y, width: box.width, height: bottom - top + descentPad };
    const chunkRuns = fitScale === 1 ? chunk.runs : chunk.runs.map((r) => ({ ...r, style: { ...r.style, fontSize: r.style.fontSize * fitScale } }));
    // Children are positioned inside the caller's group -> identity transform.
    elements.push(textElementFromRuns(`${id}_${i + 1}`, chunkRuns, chunkBox, chunk.align, chunk.justify, 0, lineHeightPercent, IDENTITY_DECOMP, emitBounding));
  }
  // Each split element's bar binds to that element (its own lines), and the fit
  // scale is threaded so weight/offset/ascent track any merged-fit shrink. All split
  // elements share the frame's box.x, so left-aligned bars land on one clean left edge.
  return withBars(emitted.map((e, i) => ({ el: elements[i], style: firstContentStyle(e.chunk), scale: fitScale, boxX: box.x, align: e.chunk.align })));
}

/**
 * A text frame can also carry a fill/stroke (it's a graphic frame too). When it
 * does, emit a background rectangle under the text — mirroring idml2svg. The
 * cyan-filled "square" in 4-pages.idml is actually a filled, empty text frame.
 */
export async function textFrameElement(frame: TextFrame, transform: DecomposedTransform, collector: AssetCollector, settings: ConvertSettings): Promise<Template.Element | null> {
  const box = frame.getBBox();
  const surface = surfaceOf(frame);
  const hasBackground = Boolean(surface.fill || surface.stroke);

  // The text child is suffixed when a background shares the frame id (a serial
  // requires globally-unique element ids). A SINGLE text element carries the
  // frame transform itself when it stands alone; split elements always come
  // back identity-transformed and get wrapped in a transform-carrying group.
  const texts = await buildTextElements(frame, box, hasBackground ? IDENTITY_DECOMP : transform, collector, hasBackground ? `${frame.getId()}_text` : frame.getId(), settings);

  if (!hasBackground) {
    if (texts.length === 0) return null;
    if (texts.length === 1) return texts[0];
    // >1 is either split text (children already identity + id-suffixed) or a single text
    // plus its line-background bar. In the latter case the single text was built carrying
    // the frame transform (the standalone path) — but it's now inside a group that ALSO
    // carries it, so neutralise the children to identity and let the group own the
    // transform once (split children are already identity → no-op). The lone text also
    // keeps the frame id, so the wrapping group needs a distinct id to stay unique.
    for (const t of texts) t.transform = identityTransform();
    const collides = texts.some((t) => t.id === frame.getId());
    return makeGroup(collides ? `${frame.getId()}_g` : frame.getId(), texts, transform, surface.opacity ?? 1);
  }

  // Children in natural IDML paint order (background behind, text — and its
  // line-background bars — in front); reverseZOrder() flips the whole tree to
  // Bluepic's first-on-top convention.
  const background = makeRectangle(`${frame.getId()}_bg`, box, cornerRadii(frame.getCornerOptions(), box), IDENTITY_DECOMP, { fill: surface.fill, stroke: surface.stroke, strokeWidth: surface.strokeWidth, opacity: 1 });
  return makeGroup(frame.getId(), [background, ...texts], transform, surface.opacity ?? 1);
}
