import {
  ensureArray,
  ensureBoolean,
  ensureNumber,
  flattenIDMLProperties,
  getIDMLElementProperties,
  serializeElement,
} from '../helpers.js';
import { KeyMap } from '../util/keyMap.js';
import { IDMLStylesContext } from './Styles.js';

export type Align = 'left' | 'right' | 'center' | 'justify' | 'justifyLeft' | 'justifyRight' | 'justifyCenter' | 'justifyAll';
export type Capitalization = 'normal' | 'smallCaps' | 'allCaps';

const alignMap = new KeyMap({
  LeftAlign: 'left',
  RightALign: 'right',
  CenterAlign: 'center',
  Justify: 'justify',
  JustifyLeft: 'justifyLeft',
  JustifyRight: 'justifyRight',
  JustifyCenter: 'justifyCenter',
  JustifyAll: 'justifyAll',
} as const);

const capitalizationMap = new KeyMap({
  Normal: 'normal',
  SmallCaps: 'smallCaps',
  AllCaps: 'allCaps',
} as const);

export class ParagraphStyle {
  private name?: string;
  private extendedKeyboardShortcut?: number[];
  private includeClass?: boolean;
  private styleUID?: string;
  private imported?: boolean;
  private splitDocument?: boolean;
  private emitCss?: boolean;

  private appliedFont?: string;
  private fontSize?: number;
  private leading?: number;
  private align?: Align;
  private fillColorId?: string;
  private tint?: number;
  private strokeColorId?: string;
  private strokeWeight?: number;
  private strokeTint?: number;
  private skew?: number;
  private capitalization?: Capitalization;
  private fontStyle?: string;
  private tracking?: number;
  private baselineShift?: number;
  private underline?: boolean;
  private strikeThrough?: boolean;
  private spaceBefore?: number;
  private spaceAfter?: number;
  private leftIndent?: number;
  private rightIndent?: number;
  private firstLineIndent?: number;

  private hyphenation?: boolean;
  private alignToBaseline?: boolean;

  public rootParagraphStyleGroupId?: string;
  constructor(
    private id: string,
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
    return serializeElement(
      'ParagraphStyle',
      {
        Name: this.name,
        Imported: this.imported,
        SplitDocument: this.splitDocument,
        EmitCss: this.emitCss,
        StyleUniqueId: this.styleUID,
        IncludeClass: this.includeClass,
        ExtendedKeyboardShortcut: this.extendedKeyboardShortcut?.join(' '),

        AppliedFont: this.appliedFont,
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
