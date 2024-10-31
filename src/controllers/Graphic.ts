import { IDMLDocumentContext } from '../main.js';
import { ColorInput } from '../types/index.js';
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
  createColor(color: ColorInput) {
    const id = `Color/${this.context.idml.getUniqueID()}`;
    const opts = {
      name: `Color ${this.context.idml.getColors().length + 1}`,
      editable: true,
      removable: true,
      swatchCreatorId: this.context.idml.swatchCreatorId,
      swatchGroupReference: this.context.idml.swatchGroupReference,
      visible: true,
    };
    const newColor = (() => {
      if (color.type === 'rgb') {
        return new Color(id, 'process', 'rgb', [color.red, color.green, color.blue], opts, this.context);
      } else if (color.type === 'cmyk') {
        return new Color(id, 'process', 'cmyk', [color.cyan, color.magenta, color.yellow, color.black], opts, this.context);
      } else {
        throw new Error('Invalid color type');
      }
    })();

    this.colors.push(newColor);

    return newColor;
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
