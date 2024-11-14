import { ElementNode, makeElementNode, makeTextNode } from 'flat-svg';
import { ensureArray, ensureBoolean, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../helpers.js';
import { ColorInput } from '../types/index.js';
import { IDMLStylesContext } from './Styles.js';

export type CharacterStyleInput = {
  appliedFont?: string;
  fontStyle?: string;
  fontSize?: number;
  fillColor?: ColorInput;
  strokeColor?: ColorInput;
  underline?: boolean;
  strikeThrough?: boolean;
  tracking?: number;
  leading?: number;
};

export class CharacterStyle {
  public name?: string;
  public appliedFont?: string;
  public fontStyle?: string;
  public fontSize?: number;
  public fillColorId?: string;
  public strokeColorId?: string;
  public underline?: boolean;
  public strikeThrough?: boolean;
  public tracking?: number;
  public leading?: number;
  public extendedKeyboardShortcut?: number[];
  public includeClass?: boolean;
  public styleUID?: string;
  public imported?: boolean;
  public splitDocument?: boolean;
  public emitCss?: boolean;
  public rootCharacterStyleGroupId?: string;
  constructor(
    public id: string,
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
      strokeColorId?: string;
      underline?: boolean;
      strikeThrough?: boolean;
      tracking?: number;
      leading?: number;
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
    this.strokeColorId = opts.strokeColorId;
    this.underline = opts.underline;
    this.strikeThrough = opts.strikeThrough;
    this.tracking = opts.tracking;
    this.leading = opts.leading;
    this.rootCharacterStyleGroupId = opts.rootCharacterStyleGroupId;
  }
  toCharacterStyleInput() {
    return {
      appliedFont: this.appliedFont,
      fontStyle: this.fontStyle,
      fontSize: this.fontSize,
      fillColor: this.fillColorId ? this.context.idml.getColorById(this.fillColorId)?.toColorInput() : undefined,
      strokeColor: this.strokeColorId ? this.context.idml.getColorById(this.strokeColorId)?.toColorInput() : undefined,
      tracking: this.tracking,
      leading: this.leading,
      underline: this.underline,
      strikeThrough: this.strikeThrough,
    };
  }
  serialize() {
    const baseElement = serializeElement(
      'CharacterStyle',
      {
        Name: this.name,
        // AppliedFont: this.appliedFont,
        // Leading: this.leading,
        FontStyle: this.fontStyle,
        PointSize: this.fontSize,
        FillColor: this.fillColorId,
        StrokeColor: this.strokeColorId,
        Underline: this.underline,
        StrikeThru: this.strikeThrough,
        Tracking: this.tracking,
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
    let propertiesElement = baseElement.children?.find((child) => child.type === 'element' && child.tagName === 'Properties') as ElementNode | undefined;
    if (!propertiesElement) {
      propertiesElement = makeElementNode('Properties', {}, []);
      baseElement.children = [propertiesElement, ...(baseElement.children ?? [])];
    }
    const existingAppliedFontElement = propertiesElement.children?.find((child) => child.type === 'element' && child.tagName === 'AppliedFont') as ElementNode | undefined;
    const existingLeadingElement = propertiesElement.children?.find((child) => child.type === 'element' && child.tagName === 'Leading') as ElementNode | undefined;
    if (existingAppliedFontElement) {
      propertiesElement.children = propertiesElement.children?.filter((child) => child !== existingAppliedFontElement);
    }
    if (existingLeadingElement) {
      propertiesElement.children = propertiesElement.children?.filter((child) => child !== existingLeadingElement);
    }
    propertiesElement.children = [...(propertiesElement.children ?? []), ...(this.appliedFont ? [makeElementNode('AppliedFont', { type: 'string' }, [makeTextNode(this.appliedFont)])] : []), ...(this.leading !== undefined ? [makeElementNode('Leading', { type: 'unit' }, [makeTextNode(this.leading)])] : [])];

    return baseElement;
  }
  equals(input: CharacterStyleInput) {
    const appliedFontEquals = this.appliedFont === input.appliedFont;
    const fontStyleEquals = this.fontStyle === input.fontStyle;
    const fontSizeEquals = this.fontSize === input.fontSize;
    const fillColorEquals = this.fillColorId && input.fillColor ? this.context.idml.getColorById(this.fillColorId)?.equals(input.fillColor) : !this.fillColorId && !input.fillColor;
    const strokeColorEquals = this.strokeColorId && input.strokeColor ? this.context.idml.getColorById(this.strokeColorId)?.equals(input.strokeColor) : !this.strokeColorId && !input.strokeColor;
    const underlineEquals = !!this.underline === !!input.underline;
    const strikeThroughEquals = !!this.strikeThrough === !!input.strikeThrough;
    const trackingEquals = this.tracking === input.tracking;
    const leadingEquals = this.leading === input.leading;

    return appliedFontEquals && fontStyleEquals && fontSizeEquals && fillColorEquals && strokeColorEquals && underlineEquals && strikeThroughEquals && trackingEquals && leadingEquals;
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
    const strokeColorId = props.StrokeColor;
    const underline = ensureBoolean(props.Underline);
    const strikeThrough = ensureBoolean(props.StrikeThru);
    const tracking = ensureNumber(props.Tracking);
    const leading = ensureNumber(props.Leading);

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
        strokeColorId,
        underline,
        strikeThrough,
        tracking,
        leading,
        rootCharacterStyleGroupId,
      },
      context
    );
  }
}
