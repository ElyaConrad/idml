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
      return this.model === 'process' && this.space === 'rgb' && this.value[0] === color.red && this.value[1] === color.green && this.value[2] === color.blue;
    } else if (color.type === 'cmyk') {
      return this.model === 'process' && this.space === 'cmyk' && this.value[0] === color.cyan && this.value[1] === color.magenta && this.value[2] === color.yellow && this.value[3] === color.black;
    } else {
      return false;
    }
  }
  getCSSColor() {
    return Color.colorInputToCSSColor(this.toColorInput());
  }
  getRBG() {
    const colorInput = this.toColorInput();
    if (colorInput.type === 'rgb') {
      return { red: colorInput.red, green: colorInput.green, blue: colorInput.blue };
    }
    else if (colorInput.type === 'cmyk') {
      return Color.cmykToRgb(colorInput.cyan, colorInput.magenta, colorInput.yellow, colorInput.black);
    }
    else {
      throw new Error('Unsupported color space for RGB conversion');
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
  toColorInput(): ColorInput {
    if (this.space === 'rgb') {
      return { type: 'rgb', red: this.value[0], green: this.value[1], blue: this.value[2] };
    } else if (this.space === 'cmyk') {
      return { type: 'cmyk', cyan: this.value[0], magenta: this.value[1], yellow: this.value[2], black: this.value[3] };
    } else {
      throw new Error('Unsupported color space');
    }
  }
  static cmykToRgb(cyan: number, magenta: number, yellow: number, black: number) {
    const r = 255 * (1 - cyan / 100) * (1 - black / 100);
    const g = 255 * (1 - magenta / 100) * (1 - black / 100);
    const b = 255 * (1 - yellow / 100) * (1 - black / 100);
    return { red: Math.round(r), green: Math.round(g), blue: Math.round(b) };
  }
  static colorInputToCSSColor(color: ColorInput): string {
    if (color.type === 'rgb') {
      return `rgb(${color.red}, ${color.green}, ${color.blue})`;
    } else if (color.type === 'cmyk') {
      const { red, green, blue } = Color.cmykToRgb(color.cyan, color.magenta, color.yellow, color.black);
      return `rgb(${red}, ${green}, ${blue})`;
    } else {
      throw new Error('Unsupported color space for CSS conversion');
    }
  }
}
