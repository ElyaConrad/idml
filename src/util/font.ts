import * as opentype from 'opentype.js';
import * as fontkit from 'fontkit';

export function toArrayBuffer(buffer: Buffer) {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return arrayBuffer;
}

export interface FontTable {
  fontFamily: string;
  fullName: string;
  styleName: string;
  postScriptName: string;
  weight: number;
  italic: boolean;
}

export function extractFontTable(fontBuffer: ArrayBufferLike): FontTable {
  const font = opentype.parse(fontBuffer);

  const fontFamily = font.names.fontFamily.en; // Englischer Name
  const fullName = font.names.fullName.en;
  const styleName = font.names.fontSubfamily.en;
  const postScriptName = font.names.postScriptName.en;

  const weightClass = font.tables.os2.usWeightClass; // Gewicht (z. B. 400 für Regular)
  const fsSelection = font.tables.os2.fsSelection; // Stil (Italic Bit gesetzt?)

  return {
    fontFamily,
    fullName,
    styleName,
    postScriptName,
    weight: weightClass,
    italic: (fsSelection & 0x01) !== 0,
  };
}

// export function determineFontType(fontBuffer: ArrayBuffer): string {
//   const font = opentype.parse(fontBuffer);

//   if (font.tables.cff) {
//     if (font.tables.cff.cidFont) {
//       return 'OpenTypeCID';
//     }
//     return 'OpenType';
//   } else {
//     return 'TrueType';
//   }
// }

export function determineFontType(fontBuffer: ArrayBufferLike): string {
  const font = fontkit.create(new Uint8Array(fontBuffer) as any);
  return font.type;
}

/**
 * The font's TYPOGRAPHIC ascender as a fraction of the em (`OS/2.sTypoAscender / unitsPerEm`).
 * This is the metric InDesign uses for its "Ascent" first-baseline offset. It is NOT always equal
 * to the canvas `fontBoundingBoxAscent` (which follows `winAscent`/`hhea` and can be inflated —
 * e.g. DIN-Bold: typo 0.712em vs win 1.015em). Returns null if unreadable.
 */
export function typoAscentRatio(fontBuffer: ArrayBufferLike): number | null {
  try {
    // Only TrueType-outline fonts: InDesign's "Ascent" first-baseline reads the OS/2
    // sTypoAscender for TrueType fonts, but the win/full ascent (= the canvas
    // fontBoundingBoxAscent core already uses) for CFF/OpenType (.otf) fonts. Applying the
    // typo correction to CFF fonts shifts them too high (e.g. DINPro), so gate on outline
    // format — `opentype.outlinesFormat` distinguishes them ('truetype' vs 'cff'); note
    // fontkit reports type 'TTF' for both, so it is NOT a reliable discriminator here.
    const font = opentype.parse(fontBuffer as ArrayBuffer);
    if (font.outlinesFormat !== 'truetype') return null;
    const os2 = font.tables.os2;
    const asc = os2?.sTypoAscender;
    const em = font.unitsPerEm;
    return asc && em ? asc / em : null;
  } catch {
    return null;
  }
}
