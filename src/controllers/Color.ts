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
  /**
   * Set when this swatch is an IDML `<Tint>` rather than a `<Color>`: a named
   * percentage OF another swatch ("R=0 G=131 B=172 20%"). Its colour is the
   * base swatch's, and the percentage is reported by `getSwatchTint()` for
   * consumers to fold into whatever object-level tint they already apply.
   */
  private tintBase?: { colorId: string; tintValue: number };
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
      tintBase?: { colorId: string; tintValue: number };
    },
    private context: IDMLGraphicContext
  ) {
    this.name = options.name;
    this.tintBase = options.tintBase;
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
  /**
   * Parse an IDML `<Tint>` swatch — a named percentage of another swatch, e.g.
   * `<Tint Self="Tint/R=0 G=131 B=172 20%" TintValue="20" BaseColor="Color/..."/>`.
   *
   * These were never registered, so ANY reference to a tint swatch resolved to
   * undefined: a gradient stop on a tint got filtered out (collapsing the whole
   * gradient to a single colour) and a frame filled with one came out unfilled.
   *
   * The base colour is resolved lazily rather than here, because a tint may be
   * declared before its base or in a different graphic resource file.
   */
  static parseTintElement(element: Element, context: IDMLGraphicContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };
    const id = props.Self;
    if (!id) {
      throw new Error('Tint element must have a Self attribute');
    }
    const colorId = props.BaseColor;
    if (!colorId) {
      throw new Error('Tint element must have a BaseColor attribute');
    }
    const tintValue = Number(props.TintValue);
    return new Color(
      id,
      'process',
      'rgb',
      [0, 0, 0], // placeholder: toColorInput() resolves through the base swatch
      {
        name: props.Name,
        editable: ensureBoolean(props.ColorEditable),
        removable: ensureBoolean(props.ColorRemovable),
        visible: ensureBoolean(props.Visible),
        swatchCreatorId: props.SwatchCreatorID,
        swatchGroupReference: props.SwatchColorGroupReference,
        tintBase: { colorId, tintValue: Number.isFinite(tintValue) ? tintValue : 100 },
      },
      context
    );
  }
  /**
   * The swatch's own tint as a 0..100 percentage — 100 for a plain colour, the
   * declared percentage for a `<Tint>`. Multiply it with any object-level tint.
   */
  getSwatchTint() {
    return this.tintBase?.tintValue ?? 100;
  }
  equals(color: ColorInput) {
    // A tint swatch is a percentage of another swatch, never an exact match for
    // a concrete colour input — saying otherwise would let authoring dedupe a
    // new colour onto a tint.
    if (this.tintBase) return false;
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
    if (this.tintBase) {
      return serializeElement(
        'Tint',
        {
          Name: this.name,
          TintValue: this.tintBase.tintValue,
          BaseColor: this.tintBase.colorId,
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
    if (this.tintBase) {
      // The tint PERCENTAGE is deliberately not applied here — it travels via
      // getSwatchTint() so it composes with the object's own tint in one place.
      const base = this.context.idml.getColorById(this.tintBase.colorId);
      if (base && base !== this) return base.toColorInput();
    }
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
