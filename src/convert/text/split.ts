import { EffectiveTextStyle, sameTextStyle, sameLeading } from './style';

// `spaceBefore` = extra vertical space (pt) above this run's FIRST line, from IDML
// paragraph spacing (SpaceAfter of the previous paragraph + SpaceBefore of this
// one). Set only on the first run of a paragraph (never the frame's first). It
// both forces a chunk split at that boundary and feeds the baseline grid.
export type TextRun = { text: string; style: EffectiveTextStyle; align: number; justify: boolean; spaceBefore?: number };
/** One future text element: a paragraph (or a style-delimited piece of one). */
export type TextChunk = { runs: TextRun[]; align: number; justify: boolean };

export const chunkText = (chunk: TextChunk) => chunk.runs.map((r) => r.text).join('');

/**
 * Split runs into chunks (= future text elements) at hard breaks. What counts
 * as "hard" (starts a new element) vs "soft" (kept as a `\n` inside the same
 * element) depends on the heuristic. A style OR leading change across a break is
 * always "differs" — differing leading forces a split because core has no per-line
 * leading, so the two lines can only be spaced correctly as separate elements:
 *
 *  - `'strict'`: every PARAGRAPH break (IDML `<Br/>`, Enter) is hard; a forced
 *    break (U+2028, Shift+Enter) is hard only when the style/leading differs.
 *  - `'format-and-paragraph-only'`: ANY break is hard only when the style/leading
 *    differs across it OR it forms a GAP (a blank line between content) — so
 *    same-style consecutive lines with no blank line between (a hyphenated
 *    "Firmen-\nlogo", a wrapped address) stay together as one element.
 *
 * `'never'` is handled by the caller (one element, richText for real diffs)
 * and never reaches here. Returned chunks are in order and may include empty
 * ones (blank-line gaps); callers skip those when emitting but need them for
 * line accounting.
 */
export function splitRunsIntoChunks(runs: TextRun[], heuristic: 'strict' | 'format-and-paragraph-only'): TextChunk[] {
  // 1. Cut the runs into segments at every hard-break character, tagging each
  //    with the kind of break that precedes it.
  type Segment = { runs: TextRun[]; breakBefore: 'paragraph' | 'forced' | null };
  const segments: Segment[] = [{ runs: [], breakBefore: null }];
  for (const run of runs) {
    // `spaceBefore` belongs to the run's FIRST line only (the paragraph's first
    // line). When a run spans several lines via internal forced breaks, the later
    // lines must not inherit it, or they'd look like spaced paragraph starts and
    // split spuriously (Anuga's "Cologne...Anuga..." is one run over two lines).
    let firstPart = true;
    for (const part of run.text.split(/(\n|\u2028)/)) {
      if (part === '') continue;
      if (part === '\n' || part === '\u2028') segments.push({ runs: [], breakBefore: part === '\n' ? 'paragraph' : 'forced' });
      else {
        segments[segments.length - 1].runs.push({ ...run, text: part, spaceBefore: firstPart ? run.spaceBefore : undefined });
        firstPart = false;
      }
    }
  }

  const lastContent = (chunk: TextChunk) => [...chunk.runs].reverse().find((r) => r.text.trim() !== '');
  const firstContent = (seg: Segment) => seg.runs.find((r) => r.text.trim() !== '');
  const isEmpty = (chunk: TextChunk) => chunk.runs.every((r) => r.text.trim() === '');

  // 2. Fold segments into chunks: a soft break joins with a `\n`, a hard break
  //    starts a new chunk.
  const chunks: TextChunk[] = [];
  let current: TextChunk = { runs: [], align: 0, justify: false };
  segments.forEach((seg, index) => {
    if (index > 0) {
      const prev = lastContent(current);
      const next = firstContent(seg);
      // A GAP is a break with no real content on one side = a blank line.
      const gap = !prev || !next;
      const styleDiffers = !!prev && !!next && (!sameTextStyle(prev.style, next.style) || !sameLeading(prev.style, next.style));
      // Paragraph spacing (SpaceBefore/After) can only be reproduced across
      // separate elements, so a spaced boundary is always a hard break.
      const spaced = !!next?.spaceBefore;
      const hard = spaced || (heuristic === 'strict' ? seg.breakBefore === 'paragraph' || styleDiffers : styleDiffers || gap);
      if (hard) {
        chunks.push(current);
        current = { runs: [], align: 0, justify: false };
      } else {
        // Soft break: keep it as a line break within the element.
        const styleSource = prev ?? next;
        if (styleSource) current.runs.push({ ...styleSource, text: '\n' });
      }
    }
    // The chunk inherits the alignment of the first paragraph that contributes
    // real content to it.
    const firstReal = firstContent(seg);
    if (firstReal && isEmpty(current)) {
      current.align = firstReal.align;
      current.justify = firstReal.justify;
    }
    current.runs.push(...seg.runs);
  });
  chunks.push(current);
  return chunks;
}
