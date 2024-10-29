import { IDMLDocumentContext } from '../main.js';
import { ElementNode, nodeToNode, parseXML } from '../util/xml.js';
import { SuperController } from './SuperController.js';

export type IDMLPreferencesContext = IDMLDocumentContext & {
  preferencesRoot: HTMLElement;
};

export class IDMLPreferencesController extends SuperController {
  static elementsImplemented: string[] = [];
  context: IDMLPreferencesContext;
  constructor(public src: string, raw: string, topContext: IDMLDocumentContext) {
    super();
    const doc = parseXML(raw);

    this.context = {
      ...topContext,
      preferencesRoot: doc,
    };
  }
  serialize() {
    const document = nodeToNode(this.context.preferencesRoot) as ElementNode;
    document.children = document.children ?? [];
    document.children = document.children.filter(
      (child) =>
        child.type === 'text' ||
        child.type === 'cdata' ||
        !IDMLPreferencesController.elementsImplemented.includes(child.tagName)
    );

    return document;
  }
}
