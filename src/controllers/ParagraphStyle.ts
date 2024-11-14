import { ElementNode, makeElementNode, makeTextNode } from 'flat-svg';
import { ensureArray, ensureBoolean, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../helpers.js';
import { ColorInput } from '../types/index.js';
import { KeyMap } from '../util/keyMap.js';
import { IDMLStylesContext } from './Styles.js';

export type ParagraphStyleInput = {
  appliedFont?: string;
  fontSize?: number;
  leading?: number;
  align?: Align;
  fillColor?: ColorInput;
  strokeColor?: ColorInput;
  strokeWeight?: number;
  strokeTint?: number;
  skew?: number;
  capitalization?: Capitalization;
  fontStyle?: string;
  underline?: boolean;
  strikeThrough?: boolean;
};

export type Align = 'left' | 'right' | 'center' | 'justify' | 'justifyLeft' | 'justifyRight' | 'justifyCenter' | 'justifyAll';
export type Capitalization = 'normal' | 'smallCaps' | 'allCaps';

export const alignMap = new KeyMap({
  LeftAlign: 'left',
  RightALign: 'right',
  CenterAlign: 'center',
  Justify: 'justify',
  JustifyLeft: 'justifyLeft',
  JustifyRight: 'justifyRight',
  JustifyCenter: 'justifyCenter',
  JustifyAll: 'justifyAll',
} as const);

export const capitalizationMap = new KeyMap({
  Normal: 'normal',
  SmallCaps: 'smallCaps',
  AllCaps: 'allCaps',
} as const);

export class ParagraphStyle {
  public name?: string;
  public extendedKeyboardShortcut?: number[];
  public includeClass?: boolean;
  public styleUID?: string;
  public imported?: boolean;
  public splitDocument?: boolean;
  public emitCss?: boolean;

  public appliedFont?: string;
  public fontSize?: number;
  public leading?: number;
  public align?: Align;
  public fillColorId?: string;
  public tint?: number;
  public strokeColorId?: string;
  public strokeWeight?: number;
  public strokeTint?: number;
  public skew?: number;
  public capitalization?: Capitalization;
  public fontStyle?: string;
  public tracking?: number;
  public baselineShift?: number;
  public underline?: boolean;
  public strikeThrough?: boolean;
  public spaceBefore?: number;
  public spaceAfter?: number;
  public leftIndent?: number;
  public rightIndent?: number;
  public firstLineIndent?: number;

  public hyphenation?: boolean;
  public alignToBaseline?: boolean;

  public rootParagraphStyleGroupId?: string;
  constructor(
    public id: string,
    opts: {
      name?: string;
      extendedKeyboardShortcut?: number[];
      includeClass?: boolean;
      styleUID?: string;
      imported?: boolean;
      splitDocument?: boolean;
      emitCss?: boolean;

      appliedFont?: string;
      fontSize?: number;
      leading?: number;
      align?: Align;
      fillColorId?: string;
      tint?: number;
      strokeColorId?: string;
      strokeWeight?: number;
      strokeTint?: number;
      skew?: number;
      capitalization?: Capitalization;
      fontStyle?: string;
      tracking?: number;
      baselineShift?: number;
      underline?: boolean;
      strikeThrough?: boolean;
      spaceBefore?: number;
      spaceAfter?: number;
      leftIndent?: number;
      rightIndent?: number;
      firstLineIndent?: number;

      hyphenation?: boolean;
      alignToBaseline?: boolean;

      rootParagraphStyleGroupId?: string;
    },
    private context: IDMLStylesContext
  ) {
    this.name = opts.name;
    this.extendedKeyboardShortcut = opts.extendedKeyboardShortcut;
    this.includeClass = opts.includeClass;
    this.styleUID = opts.styleUID;
    this.imported = opts.imported;
    this.splitDocument = opts.splitDocument;
    this.emitCss = opts.emitCss;

    this.appliedFont = opts.appliedFont;
    this.fontSize = opts.fontSize;
    this.leading = opts.leading;
    this.align = opts.align;
    this.fillColorId = opts.fillColorId;
    this.tint = opts.tint;
    this.strokeColorId = opts.strokeColorId;
    this.strokeWeight = opts.strokeWeight;
    this.strokeTint = opts.strokeTint;
    this.skew = opts.skew;
    this.capitalization = opts.capitalization;
    this.fontStyle = opts.fontStyle;
    this.tracking = opts.tracking;
    this.baselineShift = opts.baselineShift;
    this.underline = opts.underline;
    this.strikeThrough = opts.strikeThrough;
    this.spaceBefore = opts.spaceBefore;
    this.spaceAfter = opts.spaceAfter;
    this.leftIndent = opts.leftIndent;
    this.rightIndent = opts.rightIndent;
    this.firstLineIndent = opts.firstLineIndent;

    this.hyphenation = opts.hyphenation;
    this.alignToBaseline = opts.alignToBaseline;

    this.rootParagraphStyleGroupId = opts.rootParagraphStyleGroupId;
  }
  serialize() {
    const baseElement = serializeElement(
      'ParagraphStyle',
      {
        Name: this.name,
        Imported: this.imported,
        SplitDocument: this.splitDocument,
        EmitCss: this.emitCss,
        StyleUniqueId: this.styleUID,
        IncludeClass: this.includeClass,
        ExtendedKeyboardShortcut: this.extendedKeyboardShortcut?.join(' '),

        // AppliedFont: this.appliedFont,
        PointSize: this.fontSize,
        Leading: this.leading,
        Justification: alignMap.getExternal(this.align),
        FillColor: this.fillColorId,
        Tint: this.tint,
        StrokeColor: this.strokeColorId,
        StrokeWeight: this.strokeWeight,
        StrokeTint: this.strokeTint,
        Skew: this.skew,
        Capitalization: capitalizationMap.getExternal(this.capitalization),
        FontStyle: this.fontStyle,
        Tracking: this.tracking,
        BaselineShift: this.baselineShift,
        Underline: this.underline,
        StrikeThru: this.strikeThrough,
        SpaceBefore: this.spaceBefore,
        SpaceAfter: this.spaceAfter,
        LeftIndent: this.leftIndent,
        RightIndent: this.rightIndent,
        FirstLineIndent: this.firstLineIndent,

        Hyphenation: this.hyphenation,
        AlignToBaselineGrid: this.alignToBaseline,
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
    propertiesElement.children = [...(propertiesElement.children ?? []), ...(this.appliedFont ? [makeElementNode('AppliedFont', { type: 'string' }, [makeTextNode(this.appliedFont)])] : [])];

    return baseElement;
  }
  toParagraphStyleInput() {
    return {
      appliedFont: this.appliedFont,
      fontSize: this.fontSize,
      leading: this.leading,
      align: this.align,
      fillColor: this.fillColorId ? this.context.idml.getColorById(this.fillColorId)?.toColorInput() : undefined,
      strokeColor: this.strokeColorId ? this.context.idml.getColorById(this.strokeColorId)?.toColorInput() : undefined,
      strokeWeight: this.strokeWeight,
      strokeTint: this.strokeTint,
      skew: this.skew,
      capitalization: this.capitalization,
      fontStyle: this.fontStyle,
      underline: this.underline,
      strikeThrough: this.strikeThrough,
    };
  }
  equals(input: ParagraphStyleInput) {
    const appliedFontEquals = this.appliedFont === input.appliedFont;
    const fontSizeEquals = this.fontSize === input.fontSize;
    const leadingEquals = this.leading === input.leading;
    const alignEquals = this.align === input.align;
    const fillColorEquals = this.fillColorId && input.fillColor ? this.context.idml.getColorById(this.fillColorId)?.equals(input.fillColor) : !this.fillColorId && !input.fillColor;
    const strokeColorEquals = this.strokeColorId && input.strokeColor ? this.context.idml.getColorById(this.strokeColorId)?.equals(input.strokeColor) : !this.strokeColorId && !input.strokeColor;
    const strokeWeightEquals = this.strokeWeight === input.strokeWeight;
    const strokeTintEquals = this.strokeTint === input.strokeTint;
    const skewEquals = this.skew === input.skew;
    const capitalizationEquals = this.capitalization === input.capitalization;
    const fontStyleEquals = this.fontStyle === input.fontStyle;
    const underlineEquals = !!this.underline === !!input.underline;
    const strikeThroughEquals = !!this.strikeThrough === !!input.strikeThrough;

    return appliedFontEquals && fontSizeEquals && leadingEquals && alignEquals && fillColorEquals && strokeColorEquals && strokeWeightEquals && strokeTintEquals && skewEquals && capitalizationEquals && fontStyleEquals && underlineEquals && strikeThroughEquals;
  }
  static parseElement(element: Element, context: IDMLStylesContext) {
    const rootParagraphStyleGroupId = element.parentElement?.getAttribute('Self') ?? undefined;

    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const id = props.Self;
    if (!id) {
      throw new Error('ParagraphStyle element must have a Self attribute');
    }
    const name = props.Name;
    const imported = ensureBoolean(props.Imported);
    const splitDocument = ensureBoolean(props.SplitDocument);
    const emitCss = ensureBoolean(props.EmitCss);
    const styleUID = props.StyleUniqueId;
    const includeClass = ensureBoolean(props.IncludeClass);
    const extendedKeyboardShortcut = ensureArray(props.ExtendedKeyboardShortcut);

    const appliedFont = props.AppliedFont;
    const fontSize = ensureNumber(props.PointSize);
    const leading = ensureNumber(props.Leading);
    const align = alignMap.getInternal(props.Justification);
    const fillColorId = props.FillColor;
    const tint = ensureNumber(props.Tint);
    const strokeColorId = props.StrokeColor;
    const strokeWeight = ensureNumber(props.StrokeWeight);
    const strokeTint = ensureNumber(props.StrokeTint);
    const skew = ensureNumber(props.Skew);
    const capitalization = capitalizationMap.getInternal(props.Capitalization);
    const fontStyle = props.FontStyle;
    const tracking = ensureNumber(props.Tracking);
    const baselineShift = ensureNumber(props.BaselineShift);
    const underline = ensureBoolean(props.Underline);
    const strikeThrough = ensureBoolean(props.StrikeThru);
    const spaceBefore = ensureNumber(props.SpaceBefore);
    const spaceAfter = ensureNumber(props.SpaceAfter);
    const leftIndent = ensureNumber(props.LeftIndent);
    const rightIndent = ensureNumber(props.RightIndent);
    const firstLineIndent = ensureNumber(props.FirstLineIndent);

    const hyphenation = ensureBoolean(props.Hyphenation);
    const alignToBaseline = ensureBoolean(props.AlignToBaselineGrid);

    return new ParagraphStyle(
      id,
      {
        extendedKeyboardShortcut,
        includeClass,
        styleUID,
        imported,
        splitDocument,
        emitCss,
        appliedFont,
        fontSize,
        leading,
        align,
        fillColorId,
        tint,
        strokeColorId,
        strokeWeight,
        strokeTint,
        skew,
        capitalization,
        fontStyle,
        tracking,
        baselineShift,
        underline,
        strikeThrough,
        spaceBefore,
        spaceAfter,
        leftIndent,
        rightIndent,
        firstLineIndent,
        hyphenation,
        alignToBaseline,
        rootParagraphStyleGroupId,
      },
      context
    );
  }
}
