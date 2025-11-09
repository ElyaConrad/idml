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
