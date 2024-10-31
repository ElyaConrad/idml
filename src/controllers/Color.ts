import { ensureArray, ensureBoolean, flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../helpers.js';
import { ColorInput } from '../types/index.js';
import { KeyMap } from '../util/keyMap.js';
import { IDMLGraphicContext } from './Graphic.js';

type ColorModel = 'process' | 'spot' | 'registration' | 'mixedInk';
type ColorSpace = 'rgb' | 'cmyk' | 'lab' | 'gray';

const colorModelMap = new KeyMap({
  Process: 'process',
  Spot: 'spot',
  Registration: 'registration',
  MixedInk: 'mixedInk',
} as const);

const colorSpaceMap = new KeyMap({
  RGB: 'rgb',
  CMYK: 'cmyk',
  Lab: 'lab',
  Gray: 'gray',
} as const);

export class Color {
  private name?: string;
  private editable: boolean;
  private removable: boolean;
  private visible: boolean;
  private swatchCreatorId?: string;
  private swatchGroupReference?: string;
  constructor(
    public id: string,
    private model: ColorModel,
    private space: ColorSpace,
    private value: number[],
    options: {
      name?: string;
      editable?: boolean;
      removable?: boolean;
      visible?: boolean;
      swatchCreatorId?: string;
      swatchGroupReference?: string;
    },
    private context: IDMLGraphicContext
  ) {
    this.name = options.name;
    this.editable = options.editable ?? true;
    this.removable = options.removable ?? true;
    this.visible = options.visible ?? true;
    this.swatchCreatorId = options.swatchCreatorId;
    this.swatchGroupReference = options.swatchGroupReference;
  }
  static parseElement(element: Element, context: IDMLGraphicContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const id = props.Self;
    if (!id) {
      throw new Error('Color element must have a Self attribute');
    }
    const model = colorModelMap.getInternal(props.Model);
    if (model === undefined) {
      throw new Error('Color element must have a Model attribute');
    }
    const space = colorSpaceMap.getInternal(props.Space);
    if (space === undefined) {
      throw new Error('Color element must have a Space attribute');
    }

    const value = ensureArray(props.ColorValue);
    if (value === undefined) {
      throw new Error('Color element must have a ColorValue attribute');
    }
    const editable = ensureBoolean(props.ColorEditable);
    const removable = ensureBoolean(props.ColorRemovable);
    const visible = ensureBoolean(props.Visible);
    const swatchCreatorId = props.SwatchCreatorID;
    const swatchGroupReference = props.SwatchColorGroupReference;
    return new Color(id, model, space, value, { editable, removable, visible, swatchCreatorId, swatchGroupReference }, context);
  }
  equals(color: ColorInput) {
    if (color.type === 'rgb') {
      return (
        this.model === 'process' &&
        this.space === 'rgb' &&
        this.value[0] === color.red &&
        this.value[1] === color.green &&
        this.value[2] === color.blue
      );
    } else if (color.type === 'cmyk') {
      return (
        this.model === 'process' &&
        this.space === 'cmyk' &&
        this.value[0] === color.cyan &&
        this.value[1] === color.magenta &&
        this.value[2] === color.yellow &&
        this.value[3] === color.black
      );
    } else {
      return false;
    }
  }
  serialize() {
    return serializeElement(
      'Color',
      {
        Name: this.name,
        Model: colorModelMap.getExternal(this.model),
        Space: colorSpaceMap.getExternal(this.space),
        ColorValue: this.value.join(' '),
        ColorEditable: this.editable,
        ColorRemovable: this.removable,
        Visible: this.visible,
        SwatchCreatorID: this.swatchCreatorId,
        SwatchColorGroupReference: this.swatchGroupReference,
      },
      this.id,
      this.context.graphicRoot,
      ['Properties']
    );
  }
}
