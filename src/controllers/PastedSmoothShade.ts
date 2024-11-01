import { createIDMLTransform, ensureBoolean, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, parseIDMLTransform, serializeElement } from '../helpers.js';
import { Transform } from '../types/index.js';
import { KeyMap } from '../util/keyMap.js';
import { IDMLGraphicContext } from './Graphic.js';

export type PastedSmoothShadeContentsType = 'constantShade' | 'gradientShade' | 'patternShade' | 'imageShade' | 'noiseShade' | 'meshShade' | 'functionShade';
export type PastedSmoothShadeContentsEndcoding = 'ascii64' | 'binary' | 'asciiHex';

const contentsTypeMap = new KeyMap({
  ConstantShade: 'constantShade',
  GradientShade: 'gradientShade',
  PatternShade: 'patternShade',
  ImageShade: 'imageShade',
  NoiseShade: 'noiseShade',
  MeshShade: 'meshShade',
  FunctionShade: 'functionShade',
} as const);

const contentsEncodingMap = new KeyMap({
  Ascii64Encoding: 'ascii64',
  BinaryEncoding: 'binary',
  AsciiHexEncoding: 'asciiHex',
} as const);

export class PastedSmoothShade {
  private name?: string;
  private contentsVersion: number;
  private contentsType: PastedSmoothShadeContentsType;
  private contentsEncoding: PastedSmoothShadeContentsEndcoding;
  private transform: Transform;
  private editable: boolean;
  private removable: boolean;
  private visible: boolean;
  private swatchCreatorId?: string;
  private swatchGroupReference?: string;
  constructor(
    private id: string,
    private contents: string | null,
    options: {
      name?: string;
      contentsVersion: number;
      contentsType: PastedSmoothShadeContentsType;
      contentsEncoding: PastedSmoothShadeContentsEndcoding;
      transform: Transform;
      editable: boolean;
      removable: boolean;
      visible: boolean;
      swatchCreatorId?: string;
      swatchGroupReference?: string;
    },
    private context: IDMLGraphicContext
  ) {
    this.name = options.name;
    this.contentsVersion = options.contentsVersion;
    this.contentsType = options.contentsType;
    this.contentsEncoding = options.contentsEncoding;
    this.transform = options.transform;
    this.editable = options.editable;
    this.removable = options.removable;
    this.visible = options.visible;
    this.swatchCreatorId = options.swatchCreatorId;
    this.swatchGroupReference = options.swatchGroupReference;
  }
  serialize() {
    return serializeElement(
      'PastedSmoothShade',
      {
        Name: this.name,
        ContentVersion: this.contentsVersion,
        ContentsType: contentsTypeMap.getExternal(this.contentsType),
        ContentsEncoding: contentsEncodingMap.getExternal(this.contentsEncoding),
        Transform: createIDMLTransform(this.transform).join(' '),
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
  static parseElement(element: Element, context: IDMLGraphicContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const id = props.Self;
    if (!id) {
      throw new Error('PastedSmoothShade element must have a Self attribute');
    }
    const contentsVersion = ensureNumber(props.ContentsVersion);
    if (contentsVersion === undefined) {
      throw new Error('PastedSmoothShade element must have a ContentsVersion attribute');
    }
    const contentsType = contentsTypeMap.getInternal(props.ContentsType);
    const contentsEncoding = contentsEncodingMap.getInternal(props.ContentsEncoding);
    if (!contentsEncoding) {
      throw new Error('PastedSmoothShade element must have a ContentsEncoding attribute');
    }
    const transform = parseIDMLTransform(props.Transform);
    const editable = ensureBoolean(props.ColorEditable);
    const removable = ensureBoolean(props.ColorRemovable);
    const visible = ensureBoolean(props.Visible);
    const swatchCreatorId = props.SwatchCreatorID;
    const swatchGroupReference = props.SwatchColorGroupReference;
    const contents = props.Contents;
    if (!contents) {
      throw new Error('PastedSmoothShade element must have a Contents property');
    }

    return new PastedSmoothShade(
      id,
      contents,
      {
        contentsVersion,
        contentsType,
        contentsEncoding,
        transform,
        editable,
        removable,
        visible,
        swatchCreatorId,
        swatchGroupReference,
      },
      context
    );
  }
}
