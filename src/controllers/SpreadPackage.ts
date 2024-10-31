import { IDMLDocumentContext } from '../main.js';
import { domNodeToXMLNode, parseXML } from '../util/xml.js';
import { Spread } from './Spread.js';
import { SuperController } from './SuperController.js';

export type IDMLSpreadPackageContext = IDMLDocumentContext & {
  spreadPackageRoot: HTMLElement;
};

export class SpreadPackage extends SuperController {
  static elementsImplemented = ['Spread'];
  public context: IDMLSpreadPackageContext;
  // Spread Package should only have one spread
  private spreads: Spread[] = [];
  constructor(public src: string, raw: string, topContext: IDMLDocumentContext) {
    super();
    const doc = parseXML(raw);
    this.context = {
      ...topContext,
      spreadPackageRoot: doc,
    };

    const spreadElements = Array.from(doc.getElementsByTagName('Spread'));
    for (const spreadElement of spreadElements) {
      this.spreads.push(Spread.parseElement(spreadElement, this.context));
    }
  }
  serialize() {
    const document = domNodeToXMLNode(this.context.spreadPackageRoot, SpreadPackage.elementsImplemented);

    for (const spread of this.spreads) {
      document.children.push(spread.serialize());
    }

    return document;
  }
  // Get the spread
  getSpread() {
    return this.spreads[0];
  }
  setSpread(spread: Spread) {
    this.spreads = [spread];
  }
}
