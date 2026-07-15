import { ParagraphOutput } from '../../controllers/Story';
import { ColorInput } from '../../types/index';
import { colorInputToHex } from '../paint';

// ---- text ------------------------------------------------------------------

export type EffectiveTextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: string;
  /** Raw IDML FontStyle name (e.g. "Bold"), used to resolve the exact font binary. */
  styleName?: string;
  letterSpacing: number;
  lineHeight: number;
  color: string;
  /** IDML `Capitalization="AllCaps"` -> renders uppercase (serial `uppercase` prop). */
  uppercase: boolean;
  /** IDML character `Underline`. A thick, offset underline is InDesign's idiom for a
   * per-line highlight bar ("Bauchbinde") — see buildTextElements' line-background emit. */
  underline: boolean;
  /** Underline stroke thickness in px (pt at 72dpi). */
  underlineWeight?: number;
  /** Underline position relative to the baseline in px (negative = above the baseline). */
  underlineOffset?: number;
  /** Underline stroke color as hex (own swatch — e.g. Paper -> white). */
  underlineColor?: string;
  /** IDML character stroke (outlined text): stroke color as hex + weight in px. Core paints
   * `<text stroke stroke-width>`; we don't emit it today, so outlined text is invisible. */
  strokeColor?: string;
  strokeWeight?: number;
  /** IDML character `StrikeThru` — renders as `text-decoration: line-through`. */
  strikeThrough?: boolean;
  /** IDML paragraph shading (`ParagraphShadingOn`) — a fill drawn behind the WHOLE
   * paragraph. Paragraph-level, resolved from the applied/local paragraph style and
   * carried on every run's style; emitted as a line-bound background block behind the
   * text element (see buildTextElements' paragraph-shading emit). Offsets in px (pt@72). */
  paragraphShading?: { color: string; topOffset: number; bottomOffset: number; leftOffset: number; rightOffset: number };
};

// Bluepic textAlign is a 0..1 fraction: offset = (maxLineWidth - lineWidth) * textAlign.
export const ALIGN_TO_FRACTION: Record<string, number> = { left: 0, justifyLeft: 0, justify: 0, justifyAll: 0, center: 0.5, justifyCenter: 0.5, right: 1, justifyRight: 1 };
// The IDML *Justified alignments — core's `justifyText` stretches interior lines;
// the last / single-word line falls back to `textAlign` (the fraction above, which
// encodes each variant's last-line position: justifyLeft→0, Center→0.5, Right→1).
export const JUSTIFY_ALIGNS = new Set(['justify', 'justifyLeft', 'justifyRight', 'justifyCenter', 'justifyAll']);

export function weightFromFontStyle(fontStyle?: string): number {
  const s = (fontStyle ?? '').toLowerCase();
  if (s.includes('black') || s.includes('heavy')) return 900;
  if (s.includes('bold')) return 700;
  if (s.includes('semibold') || s.includes('demi')) return 600;
  if (s.includes('medium')) return 500;
  if (s.includes('light')) return 300;
  if (s.includes('thin')) return 100;
  return 400;
}
export function italicFromFontStyle(fontStyle?: string): string {
  return (fontStyle ?? '').toLowerCase().includes('italic') ? 'italic' : 'normal';
}

export function effectiveTextStyle(paragraph: ParagraphOutput, feature: ParagraphOutput['features'][number], defaultFont: string): EffectiveTextStyle {
  // Precedence (later wins): applied para -> local para -> applied char -> local char.
  const layers: Array<Record<string, unknown> | undefined> = [paragraph.appliedParagraphStyle, paragraph.localParagraphStyle, feature.appliedCharacterStyle, feature.localCharacterStyleInput];
  const pick = (key: string): unknown => {
    let value: unknown;
    for (const layer of layers) {
      const v = layer?.[key];
      if (v !== undefined) value = v;
    }
    return value;
  };
  const fontStyle = pick('fontStyle') as string | undefined;
  const fontSize = (pick('fontSize') as number | undefined) ?? 12;
  const leading = pick('leading') as number | undefined;
  const tracking = (pick('tracking') as number | undefined) ?? 0;
  const fillColor = pick('fillColor') as ColorInput | undefined;
  // Only AllCaps maps to the serial's boolean `uppercase`; SmallCaps has no
  // Bluepic equivalent, so it renders as-is (not forced to full caps).
  const capitalization = pick('capitalization') as string | undefined;
  const underline = pick('underline') as boolean | undefined;
  const underlineWeight = pick('underlineWeight') as number | undefined;
  const underlineOffset = pick('underlineOffset') as number | undefined;
  const underlineColor = pick('underlineColor') as ColorInput | undefined;
  const strokeColor = pick('strokeColor') as ColorInput | undefined;
  const strokeWeight = pick('strokeWeight') as number | undefined;
  const strikeThrough = pick('strikeThrough') as boolean | undefined;
  const paragraphShadingOn = pick('paragraphShadingOn') as boolean | undefined;
  const paragraphShadingColor = pick('paragraphShadingColor') as ColorInput | undefined;
  // Tint (0..100) mixes toward paper-white. InDesign's default paragraph-shading tint is
  // 20, and it lives on the ROOT [No paragraph style] — inherited via the BasedOn chain,
  // which `pick` (applied+local only) doesn't walk. So an explicit tint (named style or
  // local range override) is caught by `pick`; its absence means the inherited root
  // default, i.e. 20. (A document that re-defaults its root tint is an accepted edge case.)
  const paragraphShadingTint = (pick('paragraphShadingTint') as number | undefined) ?? 20;
  const paragraphShading =
    paragraphShadingOn === true
      ? {
          color: colorInputToHex(paragraphShadingColor, paragraphShadingTint) ?? '#000000ff',
          topOffset: (pick('paragraphShadingTopOffset') as number | undefined) ?? 0,
          bottomOffset: (pick('paragraphShadingBottomOffset') as number | undefined) ?? 0,
          leftOffset: (pick('paragraphShadingLeftOffset') as number | undefined) ?? 0,
          rightOffset: (pick('paragraphShadingRightOffset') as number | undefined) ?? 0,
        }
      : undefined;
  return {
    // No explicit font in any style layer -> the document's root default
    // ([No paragraph style] AppliedFont), which is what unstyled IDML text
    // inherits via the BasedOn chain.
    fontFamily: (pick('appliedFont') as string | undefined) ?? defaultFont,
    fontSize,
    fontWeight: weightFromFontStyle(fontStyle),
    fontStyle: italicFromFontStyle(fontStyle),
    styleName: fontStyle,
    // Bluepic letterSpacing is a RATIO: core applies (value - 1) * fontSize as
    // extra px, so 1 = normal (0 would mean -1em = catastrophic). IDML tracking
    // is in 1/1000 em, i.e. extra-em = tracking/1000.
    letterSpacing: 1 + tracking / 1000,
    lineHeight: leading && leading > 0 ? leading / fontSize : 1.2,
    color: colorInputToHex(fillColor) ?? '#000000ff',
    uppercase: capitalization === 'allCaps',
    underline: underline === true,
    underlineWeight,
    underlineOffset,
    underlineColor: colorInputToHex(underlineColor) ?? undefined,
    strokeColor: strokeWeight && strokeWeight > 0 ? (colorInputToHex(strokeColor) ?? undefined) : undefined,
    strokeWeight: strokeWeight && strokeWeight > 0 ? strokeWeight : undefined,
    strikeThrough: strikeThrough === true,
    paragraphShading,
  };
}

// InDesign optical fitting leaves tiny per-range Tracking values (e.g. 15/1000
// em to squeeze one line) that are visually negligible but would otherwise
// force the whole element into richtext mode. Bluepic prefers plaintext, so
// letterSpacing ratios within this distance count as equal — deliberate
// letterspacing (spaced caps etc.) uses much larger tracking (>= 50/1000 em).
export const LETTER_SPACING_TOLERANCE = 0.03;
export const sameLetterSpacing = (a: number, b: number) => Math.abs(a - b) <= LETTER_SPACING_TOLERANCE;
// NB: `uppercase` is deliberately NOT compared here. The serial's `uppercase` is
// an element-level flag with no per-run richText equivalent, so making it split
// runs would only churn plaintext->richtext without actually rendering mixed
// caps correctly. Element uppercase is instead derived from ALL runs (every), so
// a uniform AllCaps frame gets it; a mixed frame renders as-is (as before).
export const sameTextStyle = (a: EffectiveTextStyle, b: EffectiveTextStyle) =>
  a.fontFamily === b.fontFamily && a.fontSize === b.fontSize && a.fontWeight === b.fontWeight && a.fontStyle === b.fontStyle && a.color === b.color && sameLetterSpacing(a.letterSpacing, b.letterSpacing);

// Baseline-to-baseline distances (leading = lineHeight * fontSize) within this many
// points count as equal. Core has no per-LINE leading, so two lines that differ only
// in leading can't be spaced correctly inside one element — they must become separate
// elements, each positioned on the InDesign baseline grid. Used ONLY for the split
// decision, deliberately NOT part of `sameTextStyle` (which also gates plaintext vs
// richtext — leading has no per-run richText equivalent, so it must not churn that).
export const LEADING_TOLERANCE = 0.5;
export const sameLeading = (a: EffectiveTextStyle, b: EffectiveTextStyle) => Math.abs(a.lineHeight * a.fontSize - b.lineHeight * b.fontSize) <= LEADING_TOLERANCE;
