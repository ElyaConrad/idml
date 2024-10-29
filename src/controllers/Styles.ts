import { IDMLDocumentContext } from '../main.js';
import { ElementNode, makeElementNode, nodeToNode, parseXML, XMLDocumentExport } from '../util/xml.js';
import { CharacterStyle } from './CharacterStyle.js';
import { ParagraphStyle } from './ParagraphStyle.js';
import { SuperController } from './SuperController.js';

export type IDMLStylesContext = IDMLDocumentContext & {
  stylesRoot: HTMLElement;
};

export class IDMLStylesController extends SuperController {
  static elementsImplemented = ['RootParagraphStyleGroup', 'RootCharacterStyleGroup'];
  characterStyles: CharacterStyle[];
  paragraphStyles: ParagraphStyle[];
  private context: IDMLStylesContext;
  constructor(public src: string, raw: string, topContext: IDMLDocumentContext) {
    super();
    const doc = parseXML(raw);

    this.context = {
      ...topContext,
      stylesRoot: doc,
    };

    const characterStyleElements = Array.from(doc.getElementsByTagName('CharacterStyle'));
    this.characterStyles = characterStyleElements.map((element) => CharacterStyle.parseElement(element, this.context));

    const paragraphStyleElements = Array.from(doc.getElementsByTagName('ParagraphStyle'));
    this.paragraphStyles = paragraphStyleElements.map((element) => ParagraphStyle.parseElement(element, this.context));
  }
  serialize() {
    const document = nodeToNode(this.context.stylesRoot) as ElementNode;
    document.children = document.children ?? [];
    document.children = document.children.filter(
      (child) =>
        child.type === 'text' || child.type === 'cdata' || !IDMLStylesController.elementsImplemented.includes(child.tagName)
    );

    const characterStyleRootGroupIds = Array.from(
      new Set(
        this.characterStyles.map((characterStyle) => characterStyle.rootCharacterStyleGroupId).filter((id) => id !== undefined)
      )
    );
    if (characterStyleRootGroupIds.length === 0) {
      characterStyleRootGroupIds.push(this.context.idml.getUniqueID());
    }

    const characterStyleRootGroups = characterStyleRootGroupIds.map((id) =>
      makeElementNode(
        'RootCharacterStyleGroup',
        { Self: id },
        this.characterStyles
          .filter((characterStyle) => {
            const rootCharacterStyleGroupId = characterStyle.rootCharacterStyleGroupId ?? characterStyleRootGroupIds[0];
            return rootCharacterStyleGroupId === id;
          })
          .map((characterStyle) => characterStyle.serialize())
      )
    );

    const paragraphStyleRootGroupIds = Array.from(
      new Set(
        this.paragraphStyles.map((paragraphStyle) => paragraphStyle.rootParagraphStyleGroupId).filter((id) => id !== undefined)
      )
    );
    if (paragraphStyleRootGroupIds.length === 0) {
      paragraphStyleRootGroupIds.push(this.context.idml.getUniqueID());
    }

    const paragraphStyleRootGroups = paragraphStyleRootGroupIds.map((id) =>
      makeElementNode(
        'RootParagraphStyleGroup',
        { Self: id },
        this.paragraphStyles
          .filter((paragraphStyle) => {
            const rootParagraphStyleGroupId = paragraphStyle.rootParagraphStyleGroupId ?? paragraphStyleRootGroupIds[0];
            return rootParagraphStyleGroupId === id;
          })
          .map((paragraphStyle) => paragraphStyle.serialize())
      )
    );

    document.children.push(...characterStyleRootGroups);
    document.children.push(...paragraphStyleRootGroups);

    return document;
  }
}
