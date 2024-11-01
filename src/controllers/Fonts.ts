import { IDMLDocumentContext } from '../idml.js';
import { ElementNode, nodeToNode, parseXML } from 'flat-svg';
import { FontFamily } from './FontFamily.js';
import { SuperController } from './SuperController.js';

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
