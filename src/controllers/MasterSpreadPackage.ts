import { IDMLDocumentContext } from '../idml.js';
import { domNodeToXMLNode, parseXML } from 'flat-svg';
import { MasterSpread } from './MasterSpread.js';
import { SuperController } from './SuperController.js';

export type IDMLMasterSpreadPackageContext = IDMLDocumentContext & {
  spreadPackageRoot: HTMLElement;
};

export class MasterSpreadPackage extends SuperController {
  static elementsImplemented = ['MasterSpread'];
  private context: IDMLMasterSpreadPackageContext;
  // Master spread package should only have one spread
  private masterSpreads: MasterSpread[] = [];
  constructor(public src: string, raw: string, topContext: IDMLDocumentContext) {
    super();
    const doc = parseXML(raw);
    this.context = {
      ...topContext,
      spreadPackageRoot: doc,
    };

    const masterSpreadElements = Array.from(doc.getElementsByTagName('MasterSpread'));
    for (const masterSpreadElement of masterSpreadElements) {
      this.masterSpreads.push(MasterSpread.parseElement(masterSpreadElement, this.context));
    }
  }
  serialize() {
    const document = domNodeToXMLNode(this.context.spreadPackageRoot, MasterSpreadPackage.elementsImplemented);

    for (const masterSpread of this.masterSpreads) {
      document.children.push(masterSpread.serialize());
    }

    return document;
  }
  // Get the master spread
  get masterSpread() {
    return this.masterSpreads[0];
  }
}
