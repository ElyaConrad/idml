import { ensureNumber, flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../helpers.js';
import { KeyMap } from '../util/keyMap.js';
import { IDMLSpreadPackageContext } from './SpreadPackage.js';

export type LineAlignment = 'leftOrTopLineJustify' | 'centerJustify' | 'rightOrBottomLineJustify' | 'fullJustify' | 'leftOrTopAlign' | 'centerAlign' | 'rightOrBottomAlign';

export type CharacterAlignment = 'alignEmCenter' | 'alignIcfTop' | 'alignIcfBottom' | 'alignBaseline';

export type GridAlignment = 'alignEmCenter' | 'alignIcfTop' | 'alignIcfBottom' | 'alignCapHeight' | 'alignBaseline' | 'alignLeading';

const lineAlignmentMap = new KeyMap({
  LeftOrTopLineJustify: 'leftOrTopLineJustify',
  CenterJustify: 'centerJustify',
  RightOrBottomLineJustify: 'rightOrBottomLineJustify',
  FullJustify: 'fullJustify',
  LeftOrTopAlign: 'leftOrTopAlign',
  CenterAlign: 'centerAlign',
  RightOrBottomAlign: 'rightOrBottomAlign',
} as const);

const characterAlignmentMap = new KeyMap({
  AlignEmCenter: 'alignEmCenter',
  AlignIcfTop: 'alignIcfTop',
  AlignIcfBottom: 'alignIcfBottom',
  AlignBaseline: 'alignBaseline',
} as const);

const gridAlignmentMap = new KeyMap({
  AlignEmCenter: 'alignEmCenter',
  AlignIcfTop: 'alignIcfTop',
  AlignIcfBottom: 'alignIcfBottom',
  AlignCapHeight: 'alignCapHeight',
  AlignBaseline: 'alignBaseline',
  AlignLeading: 'alignLeading',
} as const);

export class GridDataInformation {
  public fontStyle?: string;
  public fontSize?: number;

  public characterAki?: number;
  public lineAki?: number;

  public horizontalScale?: number;
  public verticalScale?: number;

  public lineAlignment?: LineAlignment;
  public characterAlignment?: CharacterAlignment;
  public gridAlignment?: GridAlignment;

  public appliedFont?: string;

  private sourceElement?: Element;
  constructor(
    opts: {
      fontStyle?: string;
      fontSize?: number;
      characterAki?: number;
      lineAki?: number;
      horizontalScale?: number;
      verticalScale?: number;
      lineAlignment?: LineAlignment;
      characterAlignment?: CharacterAlignment;
      gridAlignment?: GridAlignment;
      appliedFont?: string;
      sourceElement?: Element;
    },
    private context: IDMLSpreadPackageContext
  ) {
    this.fontStyle = opts.fontStyle;
    this.fontSize = opts.fontSize;
    this.characterAki = opts.characterAki;
    this.lineAki = opts.lineAki;
    this.horizontalScale = opts.horizontalScale;
    this.verticalScale = opts.verticalScale;
    this.lineAlignment = opts.lineAlignment;
    this.characterAlignment = opts.characterAlignment;
    this.gridAlignment = opts.gridAlignment;
    this.appliedFont = opts.appliedFont;
    this.sourceElement = opts.sourceElement;
  }
  serialize() {
    return serializeElement(
      'GridDataInformation',
      {
        FontStyle: this.fontStyle,
        PointSize: this.fontSize,
        CharacterAki: this.characterAki,
        LineAki: this.lineAki,
        HorizontalScale: this.horizontalScale,
        VerticalScale: this.verticalScale,
        LineAlignment: lineAlignmentMap.getExternal(this.lineAlignment),
        CharacterAlignment: characterAlignmentMap.getExternal(this.characterAlignment),
        GridAlignment: gridAlignmentMap.getExternal(this.gridAlignment),
        AppliedFont: this.appliedFont,
      },
      this.sourceElement,
      this.context.spreadPackageRoot,
      ['Properties']
    );

    // return makeElementNode(
    //   'GridDataInformation',
    //   {
    //     FontStyle: this.fontStyle,
    //     PointSize: this.fontSize,
    //     CharacterAki: this.characterAki,
    //     LineAki: this.lineAki,
    //     HorizontalScale: this.horizontalScale,
    //     VerticalScale: this.verticalScale,
    //     LineAlignment: lineAlignmentMap.getExternal(this.lineAlignment),
    //     CharacterAlignment: characterAlignmentMap.getExternal(this.characterAlignment),
    //     GridAlignment: gridAlignmentMap.getExternal(this.gridAlignment),
    //     AppliedFont: this.appliedFont,
    //   },
    //   this.appliedFont
    //     ? [
    //         makeElementNode('Properties', {}, [
    //           makeElementNode('AppliedFont', { type: 'string' }, [makeTextNode(this.appliedFont)]),
    //         ]),
    //       ]
    //     : []
    // );
  }
  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const fontStyle = props['FontStyle'];
    const fontSize = ensureNumber(props['PointSize']);
    const characterAki = ensureNumber(props['CharacterAki']);
    const lineAki = ensureNumber(props['LineAki']);
    const horizontalScale = ensureNumber(props['HorizontalScale']);
    const verticalScale = ensureNumber(props['VerticalScale']);
    const lineAlignment = lineAlignmentMap.getInternal(props['LineAlignment']);
    const characterAlignment = characterAlignmentMap.getInternal(props['CharacterAlignment']);
    const gridAlignment = gridAlignmentMap.getInternal(props['GridAlignment']);
    const appliedFont = props['AppliedFont'];

    return new GridDataInformation(
      {
        fontStyle,
        fontSize,
        characterAki,
        lineAki,
        horizontalScale,
        verticalScale,
        lineAlignment,
        characterAlignment,
        gridAlignment,
        appliedFont,
        sourceElement: element,
      },
      context
    );
  }
}
