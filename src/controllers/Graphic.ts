import { IDMLDocumentContext } from '../main.js';
import { ElementNode, nodeToNode, parseXML } from '../util/xml.js';
import { Color } from './Color.js';
import { Gradient } from './Gradient.js';
import { Ink } from './Ink.js';
import { PastedSmoothShade } from './PastedSmoothShade.js';
import { StrokeStyle } from './StrokeStyle.js';
import { SuperController } from './SuperController.js';

export type IDMLGraphicContext = IDMLDocumentContext & {
  graphicRoot: HTMLElement;
};

export class IDMLGraphicController extends SuperController {
  static elementsImplemented = ['Color', 'StrokeStyle', 'Gradient', 'Ink', 'PastedSmoothShade'];
  colors: Color[];
  strokeStyles: StrokeStyle[];
  gradients: Gradient[];
  inks: Ink[];
  pastedSmoothShades: PastedSmoothShade[];
  context: IDMLGraphicContext;
  constructor(public src: string, raw: string, topContext: IDMLDocumentContext) {
    super();
    const doc = parseXML(raw);

    this.context = {
      ...topContext,
      graphicRoot: doc,
    };

    const colorElements = Array.from(doc.getElementsByTagName('Color'));
    this.colors = colorElements.map((element) => Color.parseElement(element, this.context));

    const strokeStyleElements = Array.from(doc.getElementsByTagName('StrokeStyle'));
    this.strokeStyles = strokeStyleElements.map((element) => StrokeStyle.parseElement(element, this.context));

    const gradientElements = Array.from(doc.getElementsByTagName('Gradient'));
    this.gradients = gradientElements.map((element) => Gradient.parseElement(element, this.context));

    const inkElements = Array.from(doc.getElementsByTagName('Ink'));
    this.inks = inkElements.map((element) => Ink.parseElement(element, this.context));

    const pastedSmoothShadeElements = Array.from(doc.getElementsByTagName('PastedSmoothShade'));
    this.pastedSmoothShades = pastedSmoothShadeElements.map((element) => PastedSmoothShade.parseElement(element, this.context));
  }
  serialize() {
    // console.log('SERIALIZING GRAPHIC', IDMLGraphicController.elementsImplemented);

    const document = nodeToNode(this.context.graphicRoot) as ElementNode;
    document.children = document.children ?? [];
    document.children = document.children.filter(
      (child) =>
        child.type === 'text' || child.type === 'cdata' || !IDMLGraphicController.elementsImplemented.includes(child.tagName)
    );

    for (const color of this.colors) {
      document.children.push(color.serialize());
    }
    for (const ink of this.inks) {
      document.children.push(ink.serialize());
    }
    for (const pastedSmoothShade of this.pastedSmoothShades) {
      document.children.push(pastedSmoothShade.serialize());
    }
    for (const strokeStyle of this.strokeStyles) {
      document.children.push(strokeStyle.serialize());
    }
    for (const gradient of this.gradients) {
      document.children.push(gradient.serialize());
    }

    return document;
  }
}
