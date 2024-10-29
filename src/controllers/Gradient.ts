import {
  createIDMLTransform,
  ensureNumber,
  flattenIDMLProperties,
  getIDMLElementProperties,
  parseIDMLTransform,
  serializeElement,
  Transform,
} from '../helpers.js';
import { makeElementNode } from '../util/xml.js';
import { KeyMap } from '../util/keyMap.js';
import { IDMLGraphicContext } from './Graphic.js';

export type GradientType = 'linear' | 'radial';
export type GradientColorStop = {
  colorId: string;
  position: number;
  midpoint?: number;
};

const gradienTypeMap = new KeyMap({
  Linear: 'linear',
  Radial: 'radial',
} as const);

export class Gradient {
  private length?: number;
  private angle?: number;
  private transform: Transform;
  constructor(
    private id: string,
    private type: GradientType,
    private colorStops: GradientColorStop[],
    options: {
      length?: number;
      angle?: number;
      transform: Transform;
    },
    private context: IDMLGraphicContext
  ) {
    this.length = options.length;
    this.angle = options.angle;
    this.transform = options.transform;
  }
  serialize() {
    return serializeElement(
      'Gradient',
      {
        GradientType: gradienTypeMap.getExternal(this.type),
        Length: this.length,
        Angle: this.angle,
        GradientTransform: createIDMLTransform(this.transform).join(' '),
      },
      this.id,
      this.context.graphicRoot,
      ['Properties'],
      this.colorStops.map((colorStop) =>
        makeElementNode('GradientStop', {
          StopColor: colorStop.colorId,
          Location: colorStop.position.toString(),
          MidPoint: colorStop.midpoint,
        })
      )
    );
  }
  static parseElement(element: Element, context: IDMLGraphicContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const id = props.Self;
    if (!id) {
      throw new Error('Gradient element must have a Self attribute');
    }
    const type = gradienTypeMap.getInternal(props.GradientType);
    const length = ensureNumber(props.Length);
    const angle = ensureNumber(props.Angle);
    const transform = parseIDMLTransform(props.GradientTransform ?? '1 0 0 1 0 0');
    const colorStopElements = Array.from(element.getElementsByTagName('GradientStop'));
    const colorStops = colorStopElements.map<GradientColorStop>((colorStopElement) => {
      const id = colorStopElement.getAttribute('Self');
      if (!id) throw new Error('GradientStop element must have a Self attribute');
      const colorId = colorStopElement.getAttribute('StopColor');
      if (!colorId) throw new Error('GradientStop element must have a StopColor attribute');
      const location = ensureNumber(colorStopElement.getAttribute('Location'));
      if (location === undefined) throw new Error('GradientStop element must have a Location attribute');
      const midpoint = ensureNumber(colorStopElement.getAttribute('MidPoint'));
      return {
        colorId,
        position: location,
        midpoint,
      };
    });

    return new Gradient(
      id,
      type,
      colorStops,
      {
        length,
        angle,
        transform,
      },
      context
    );
  }
}
