import { ensureArray, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../helpers.js';
import { KeyMap } from '../util/keyMap.js';
import { IDMLGraphicContext } from './Graphic.js';

export type StrokeType = 'solid' | 'dashed' | 'dotted';
export type JoinType = 'miter' | 'round' | 'bevel';
export type CapType = 'butt' | 'round' | 'square';
export type CornerAdjustment = 'none' | 'beveled' | 'mitered' | 'rounded';

const strokeTypeMap = new KeyMap({
  Solid: 'solid',
  Dashed: 'dashed',
  Dotted: 'dotted',
} as const);

const joinTypeMap = new KeyMap({
  Miter: 'miter',
  Round: 'round',
  Bevel: 'bevel',
} as const);
const capTypeMap = new KeyMap({
  Butt: 'butt',
  Round: 'round',
  Projecting: 'square',
} as const);
const cornerAdjustmentMap = new KeyMap({
  None: 'none',
  Beveled: 'beveled',
  Mitered: 'mitered',
  Rounded: 'rounded',
} as const);

export class StrokeStyle {
  private name?: string;
  private type: StrokeType;
  private weight?: number; // Can be defined in <properties> of element too
  private joinType?: JoinType; // Can be defined in <properties> of element too
  private capType?: CapType; // Can be defined in <properties> of element too
  private strokeArray?: number[];
  private dotArray?: number[];
  private cornerAdjustment?: CornerAdjustment;
  private miterLimit?: number;
  constructor(
    private id: string,
    options: {
      name?: string;
      type: StrokeType;
      weight?: number;
      joinType?: JoinType;
      capType?: CapType;
      strokeArray?: number[];
      dotArray?: number[];
      cornerAdjustment?: CornerAdjustment;
      miterLimit?: number;
    },
    private context: IDMLGraphicContext
  ) {
    this.name = options.name;
    this.type = options.type;
    this.weight = options.weight;
    this.joinType = options.joinType;
    this.capType = options.capType;
    this.strokeArray = options.strokeArray;
    this.dotArray = options.dotArray;
    this.cornerAdjustment = options.cornerAdjustment;
    this.miterLimit = options.miterLimit;
  }
  static parseElement(element: Element, context: IDMLGraphicContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const id = props.Self;
    if (!id) {
      throw new Error('StrokeStyle element must have a Self attribute');
    }
    const name = props.Name;
    const type = strokeTypeMap.getInternal(props.Category);
    const weight = ensureNumber(props.StrokeWeight);
    const joinType = joinTypeMap.getInternal(props.StrokeJoinType);
    const capType = capTypeMap.getInternal(props.StrokeCapType);
    const miterLimit = ensureNumber(props.MiterLimit);
    const cornerAdjustment = cornerAdjustmentMap.getInternal(props.StrokeCornerAdjustment);
    const strokeArray = ensureArray(props.StrokeArray);
    const dotArray = ensureArray(props.DotArray);

    return new StrokeStyle(
      id,
      {
        name,
        type,
        weight,
        joinType,
        capType,
        strokeArray,
        dotArray,
        cornerAdjustment,
        miterLimit,
      },
      context
    );
  }
  serialize() {
    return serializeElement(
      'StrokeStyle',
      {
        Name: this.name,
        Category: strokeTypeMap.getExternal(this.type),
        Class: 'Custom',
        StrokeWeight: this.weight,
        StrokeJoinType: joinTypeMap.getExternal(this.joinType),
        StrokeCapType: capTypeMap.getExternal(this.capType),
        StrokeCornerAdjustment: cornerAdjustmentMap.getExternal(this.cornerAdjustment),
        MiterLimit: this.miterLimit,
        StrokeArray: this.strokeArray?.join(' '),
        DotArray: this.dotArray?.join(' '),
      },
      this.id,
      this.context.graphicRoot,
      ['Properties']
    );
  }
}
