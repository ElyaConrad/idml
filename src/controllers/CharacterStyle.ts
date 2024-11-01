import { ensureArray, ensureBoolean, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../helpers.js';
import { IDMLStylesContext } from './Styles.js';

export class CharacterStyle {
  private name?: string;
  private appliedFont?: string;
  private fontStyle?: string;
  private fontSize?: number;
  private fillColorId?: string;
  private underline?: boolean;
  private strikeThrough?: boolean;
  private extendedKeyboardShortcut?: number[];
  private includeClass?: boolean;
  private styleUID?: string;
  private imported?: boolean;
  private splitDocument?: boolean;
  private emitCss?: boolean;
  public rootCharacterStyleGroupId?: string;
  constructor(
    private id: string,
    opts: {
      imported?: boolean;
      splitDocument?: boolean;
      emitCss?: boolean;
      styleUID?: string;
      includeClass?: boolean;
      extendedKeyboardShortcut?: number[];
      name?: string;
      appliedFont?: string;
      fontStyle?: string;
      fontSize?: number;
      fillColorId?: string;
      underline?: boolean;
      strikeThrough?: boolean;
      rootCharacterStyleGroupId?: string;
    },
    private context: IDMLStylesContext
  ) {
    this.imported = opts.imported;
    this.splitDocument = opts.splitDocument;
    this.emitCss = opts.emitCss;
    this.styleUID = opts.styleUID;
    this.includeClass = opts.includeClass;
    this.extendedKeyboardShortcut = opts.extendedKeyboardShortcut;
    this.name = opts.name;
    this.appliedFont = opts.appliedFont;
    this.fontStyle = opts.fontStyle;
    this.fontSize = opts.fontSize;
    this.fillColorId = opts.fillColorId;
    this.underline = opts.underline;
    this.strikeThrough = opts.strikeThrough;
    this.rootCharacterStyleGroupId = opts.rootCharacterStyleGroupId;
  }
  serialize() {
    return serializeElement(
      'CharacterStyle',
      {
        Name: this.name,
        AppliedFont: this.appliedFont,
        FontStyle: this.fontStyle,
        PointSize: this.fontSize,
        FillColor: this.fillColorId,
        Underline: this.underline,
        StrikeThru: this.strikeThrough,
        ExtendedKeyboardShortcut: this.extendedKeyboardShortcut?.join(' '),
        IncludeClass: this.includeClass,
        StyleUniqueId: this.styleUID,
        Imported: this.imported,
        SplitDocument: this.splitDocument,
        EmitCss: this.emitCss,
      },
      this.id,
      this.context.stylesRoot,
      ['Properties']
    );
  }
  static parseElement(element: Element, context: IDMLStylesContext) {
    const rootCharacterStyleGroupId = element.parentElement?.getAttribute('Self') ?? undefined;
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const id = element.getAttribute('Self');
    if (!id) {
      throw new Error('CharacterStyle element must have a Self attribute');
    }

    const imported = ensureBoolean(props.Imported);
    const splitDocument = ensureBoolean(props.SplitDocument);
    const emitCss = ensureBoolean(props.EmitCss);
    const styleUID = props.StyleUniqueId;
    const includeClass = ensureBoolean(props.IncludeClass);
    const extendedKeyboardShortcut = ensureArray(props.ExtendedKeyboardShortcut);
    const name = props.Name;
    const appliedFont = props.AppliedFont;
    const fontStyle = props.FontStyle;
    const fontSize = ensureNumber(props.PointSize);
    const fillColorId = props.FillColor;
    const underline = ensureBoolean(props.Underline);
    const strikeThrough = ensureBoolean(props.StrikeThru);

    return new CharacterStyle(
      id,
      {
        imported,
        splitDocument,
        emitCss,
        styleUID,
        includeClass,
        extendedKeyboardShortcut,
        name,
        appliedFont,
        fontStyle,
        fontSize,
        fillColorId,
        underline,
        strikeThrough,
        rootCharacterStyleGroupId,
      },
      context
    );
  }
}
