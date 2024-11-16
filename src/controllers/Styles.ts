import { IDMLDocumentContext } from '../idml.js';
import { ElementNode, makeElementNode, nodeToNode, parseXML, XMLDocumentExport } from 'flat-svg';
import { CharacterStyle, CharacterStyleInput } from './CharacterStyle.js';
import { ParagraphStyle, ParagraphStyleInput } from './ParagraphStyle.js';
import { SuperController } from './SuperController.js';
import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';

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
  createParagraphStyle(paragraphStyle: ParagraphStyleInput) {
    const id = `ParagraphStyle/${this.context.idml.getUniqueID()}`;
    const baseParagraphStyle = this.paragraphStyles.find((paragraphStyle) => paragraphStyle.id === 'ParagraphStyle/$ID/[No paragraph style]');
    const opts = {
      name: `Paragraph Style ${this.paragraphStyles.length + 1}`,
      extendedKeyboardShortcut: _.cloneDeep(baseParagraphStyle?.extendedKeyboardShortcut),
      includeClass: baseParagraphStyle?.includeClass,
      styleUID: uuidv4(),
      imported: false,
      splitDocument: baseParagraphStyle?.splitDocument,
      emitCss: baseParagraphStyle?.emitCss,

      appliedFont: paragraphStyle.appliedFont ?? baseParagraphStyle?.appliedFont,
      fontSize: paragraphStyle.fontSize ?? baseParagraphStyle?.fontSize,
      leading: paragraphStyle.leading ?? baseParagraphStyle?.leading,
      align: paragraphStyle.align ?? baseParagraphStyle?.align,
      fillColorId: paragraphStyle.fillColor ? this.context.idml.assumeColor(paragraphStyle.fillColor).id : baseParagraphStyle?.fillColorId,
      tint: baseParagraphStyle?.tint,
      strokeColorId: paragraphStyle.strokeColor ? this.context.idml.assumeColor(paragraphStyle.strokeColor).id : baseParagraphStyle?.strokeColorId,
      strokeWeight: paragraphStyle.strokeWeight ?? baseParagraphStyle?.strokeWeight,
      strokeTint: baseParagraphStyle?.strokeTint,
      skew: paragraphStyle.skew ?? baseParagraphStyle?.skew,
      capitalization: paragraphStyle.capitalization ?? baseParagraphStyle?.capitalization,
      fontStyle: paragraphStyle.fontStyle ?? baseParagraphStyle?.fontStyle,
      tracking: baseParagraphStyle?.tracking,
      baselineShift: baseParagraphStyle?.baselineShift,
      underline: paragraphStyle.underline ?? baseParagraphStyle?.underline,
      strikeThrough: paragraphStyle.strikeThrough ?? baseParagraphStyle?.strikeThrough,
      spaceBefore: baseParagraphStyle?.spaceBefore,
      spaceAfter: baseParagraphStyle?.spaceAfter,
      leftIndent: baseParagraphStyle?.leftIndent,
      rightIndent: baseParagraphStyle?.rightIndent,
      firstLineIndent: baseParagraphStyle?.firstLineIndent,

      hyphenation: baseParagraphStyle?.hyphenation,
      alignToBaseline: baseParagraphStyle?.alignToBaseline,

      rootParagraphStyleGroupId: baseParagraphStyle?.rootParagraphStyleGroupId,
    };

    const newParagraphStyle = new ParagraphStyle(id, opts, this.context);

    this.paragraphStyles.push(newParagraphStyle);

    return newParagraphStyle;
  }
  createCharacterStyle(characterStyle: CharacterStyleInput) {
    const id = `CharacterStyle/${this.context.idml.getUniqueID()}`;
    const baseCharacterStyle = this.characterStyles.find((characterStyle) => characterStyle.id === 'CharacterStyle/$ID/[No character style]');
    const opts = {
      imported: baseCharacterStyle?.imported,
      splitDocument: baseCharacterStyle?.splitDocument,
      emitCss: baseCharacterStyle?.emitCss,
      styleUID: uuidv4(),
      includeClass: baseCharacterStyle?.includeClass,
      extendedKeyboardShortcut: _.cloneDeep(baseCharacterStyle?.extendedKeyboardShortcut),
      name: `Character Style ${this.characterStyles.length + 1}`,
      appliedFont: characterStyle.appliedFont ?? baseCharacterStyle?.appliedFont,
      fontStyle: characterStyle.fontStyle ?? baseCharacterStyle?.fontStyle,
      strokeWeight: characterStyle.strokeWeight ?? baseCharacterStyle?.strokeWeight,
      fontSize: characterStyle.fontSize ?? baseCharacterStyle?.fontSize,
      fillColorId: characterStyle.fillColor ? this.context.idml.assumeColor(characterStyle.fillColor).id : baseCharacterStyle?.fillColorId,
      strokeColorId: characterStyle.strokeColor ? this.context.idml.assumeColor(characterStyle.strokeColor).id : baseCharacterStyle?.strokeColorId,
      underline: characterStyle.underline ?? baseCharacterStyle?.underline,
      strikeThrough: characterStyle.strikeThrough ?? baseCharacterStyle?.strikeThrough,
      tracking: characterStyle.tracking ?? baseCharacterStyle?.tracking,
      leading: characterStyle.leading ?? baseCharacterStyle?.leading,
      rootCharacterStyleGroupId: baseCharacterStyle?.rootCharacterStyleGroupId,
    };

    const newCharacterStyle = new CharacterStyle(id, opts, this.context);

    this.characterStyles.push(newCharacterStyle);

    return newCharacterStyle;
  }
  serialize() {
    const document = nodeToNode(this.context.stylesRoot) as ElementNode;
    document.children = document.children ?? [];
    document.children = document.children.filter((child) => child.type === 'text' || child.type === 'cdata' || !IDMLStylesController.elementsImplemented.includes(child.tagName));

    const characterStyleRootGroupIds = Array.from(new Set(this.characterStyles.map((characterStyle) => characterStyle.rootCharacterStyleGroupId).filter((id) => id !== undefined)));
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

    const paragraphStyleRootGroupIds = Array.from(new Set(this.paragraphStyles.map((paragraphStyle) => paragraphStyle.rootParagraphStyleGroupId).filter((id) => id !== undefined)));
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
