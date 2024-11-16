import { FontTable, IDMLDocumentContext } from '../idml.js';
import { ElementNode, nodeToNode, parseXML } from 'flat-svg';
import { Font, FontFamily, FontStatus } from './FontFamily.js';
import { SuperController } from './SuperController.js';

export type FontFamilyInput = {
  name: string;
  fontStyles: string[];
  status: FontStatus;
  type: string;
};

export type IDMLFontsContext = IDMLDocumentContext & {
  fontsRoot: HTMLElement;
};

export class IDMLFontsController extends SuperController {
  static elementsImplemented = ['FontFamily'];
  context: IDMLFontsContext;
  fontFamilies: FontFamily[];
  constructor(public src: string, raw: string, topContext: IDMLDocumentContext) {
    super();
    const doc = parseXML(raw);

    this.context = {
      ...topContext,
      fontsRoot: doc,
    };

    const fontFamilyElements = Array.from(doc.getElementsByTagName('FontFamily'));

    this.fontFamilies = fontFamilyElements.map((element) => FontFamily.parseElement(element, this.context));
  }
  // addFontFamily(input: FontFamilyInput) {
  //   const id = this.context.idml.getUniqueID();
  //   const fonts: Font[] = input.fontStyles.map((fontStyleName) => {
  //     const fontFamily = input.name;
  //     const name = `${input.name} ${fontStyleName}`;
  //     const fontId = `${id}Fontn${name}`;

  //     return {
  //       id: fontId,
  //       fontFamily,
  //       name,
  //       fontStyleName,
  //       status: input.status,
  //       type: input.type,
  //     };
  //   });

  //   const fontFamily = new FontFamily(id, input.name, fonts, {}, this.context);

  //   this.fontFamilies.push(fontFamily);

  //   return fontFamily;
  // }
  addFont(fontTable: FontTable, type: string) {
    let fontFamily = this.fontFamilies.find((fontFamily) => fontFamily.name === fontTable.fontFamily);
    if (!fontFamily) {
      const id = this.context.idml.getUniqueID();
      fontFamily = new FontFamily(id, fontTable.fontFamily, [], {}, this.context);
      this.fontFamilies.push(fontFamily);
    }
    const font = fontFamily.addFontStyle(fontTable.fullName, fontTable.styleName, fontTable.postScriptName, 'installed', type);

    return font;
  }
  serialize() {
    const document = nodeToNode(this.context.fontsRoot) as ElementNode;
    document.children = document.children ?? [];
    document.children = document.children.filter((child) => child.type === 'text' || child.type === 'cdata' || !IDMLFontsController.elementsImplemented.includes(child.tagName));

    for (const fontFamily of this.fontFamilies) {
      document.children.push(fontFamily.serialize());
    }

    return document;
  }
}
