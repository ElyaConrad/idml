import { ImageSrcResolver } from './assets';
import { TextBounding } from '../serial/builders';

/** Options for {@link convertIDML2Serial}. */
export type ConvertIDML2SerialOptions = {
  /**
   * Emit a page-sized background rectangle filled with the document's InDesign
   * "Paper" swatch (`Color/Paper`) behind every populated page, so the serial
   * reproduces the page background InDesign paints implicitly. Default `true`.
   */
  paperBackground?: boolean;
  /**
   * How aggressively a text frame is split into SEPARATE text elements (so each
   * can be connected to its own input field), instead of one element carrying
   * the whole frame's text:
   *
   *  - `'strict'` — every PARAGRAPH break (IDML `<Br/>`, Enter) starts a new
   *    element; a forced line break (U+2028, Shift+Enter) does too when the
   *    style changes across it. Maximises field-connectable elements, but
   *    also splits same-style stacked lines (e.g. a hyphenated "Firmen-\nlogo").
   *  - `'format-and-paragraph-only'` — a break starts a new element only when
   *    the style genuinely differs across it, OR it forms a visual GAP (a blank
   *    line between content). Same-style consecutive lines with no blank line
   *    between stay together as one multi-line element. **Default.**
   *  - `'never'` — never split; the frame is one element, and genuinely mixed
   *    styling is preserved via richText (the pre-split behaviour).
   *
   * When splitting, each element's box starts exactly where the merged frame
   * would render that line, and together the boxes tile the original frame.
   * Splitting needs a canvas for text measurement (browser, or Node with the
   * `@bluepic/core/headless` globals) — without one it degrades to `'never'`.
   */
  textSplittingHeuristic?: TextSplittingHeuristic;
  /**
   * Optional preview-src provider for image elements (by id). The asset-aware
   * converter passes this to inject blob/data previews for displayable images;
   * omitted for a bare kernel convert (embedded rasters/SVG still get data URLs).
   */
  resolveImageSrc?: ImageSrcResolver;
  /**
   * Which core line-box model reproduces InDesign's `VerticalJustification="JustifyAlign"`
   * (lines distributed to fill the frame height). All emit uniform baseline gaps by
   * widening the line advance; they differ only in where the FIRST baseline is drawn
   * relative to the box top (the advance calibration is measured, so it's identical):
   *
   *  - `'font'` — the alphabetic baseline sits at exactly `fontBoundingBoxAscent` below
   *    the box top, matching the rest of the converter (see the bounding=font migration)
   *    and InDesign's "Ascent" first-baseline with NO approximation constant. **Default.**
   *  - `'fontSize'` — advance = fontSize × lineHeight, first baseline placed via the
   *    canvas *hanging* offset (`0.8·ascent` constant — off by the font's real
   *    `hangingBaseline − 0.8·ascent`). The old default; kept as a fallback.
   *  - `'actual-outer'` — outer lines capped to their real ink, inner lines to the
   *    font box, so the block auto-anchors on the first line's actual cap-top. Needs a
   *    taller grown box; never relies on any hanging-offset constant.
   */
  verticalJustifyImplementationBounding?: VerticalJustifyBounding;
  /**
   * How the vertical-justify element reconciles InDesign's behaviour (last line's
   * baseline at the frame bottom, descenders hanging *past* it) with core's rule that
   * text is shrunk to never overflow its box:
   *
   *  - `'grow'` — emit an element a few px TALLER than the IDML frame (= the natural
   *    block height) so the descenders overflow the frame just like InDesign and the
   *    font is never shrunk. Matches InDesign's gap exactly. **Default.**
   *  - `'contain'` — keep the element at the IDML frame height. No shrink, descenders
   *    stay inside, but gaps come out ~3–5% tighter than InDesign (the last line's
   *    descent is reserved instead of overflowing).
   */
  verticalJustifyImplementationFit?: VerticalJustifyFit;
  /**
   * Horizontal padding of the "Bauchbinde" line-background bar (reconstructed from a
   * thick offset underline — see the text converter), as a fraction of the run's font
   * size, applied to each side. InDesign's underline spans the run's leading/trailing
   * spaces; core trims trailing whitespace from the line width, so a small inset restores
   * that visible margin. Default `0.3`. `0` = hug the measured line box. Vertical extent
   * stays the underline weight (already taller than the text). */
  lineBackgroundPaddingEm?: number;
};
/** See {@link ConvertIDML2SerialOptions.textSplittingHeuristic}. */
export type TextSplittingHeuristic = 'strict' | 'format-and-paragraph-only' | 'never';
/** See {@link ConvertIDML2SerialOptions.verticalJustifyImplementationBounding}. */
export type VerticalJustifyBounding = 'font' | 'fontSize' | 'actual-outer';
/** See {@link ConvertIDML2SerialOptions.verticalJustifyImplementationFit}. */
export type VerticalJustifyFit = 'grow' | 'contain';
/** Resolved options, threaded through the sprite walk. */
export type ConvertSettings = { textSplittingHeuristic: TextSplittingHeuristic; verticalJustifyBounding: VerticalJustifyBounding; verticalJustifyFit: VerticalJustifyFit; lineBackgroundPaddingEm: number };
