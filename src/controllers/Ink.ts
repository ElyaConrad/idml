import { ensureBoolean, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../helpers.js';
import { KeyMap } from '../util/keyMap.js';
import { IDMLGraphicContext } from './Graphic.js';

export type InkType = 'process' | 'spot';
export type InkConcreteType = 'normal' | 'registration' | 'transparent';

const inkConcreteTypeMap = new KeyMap({
  Normal: 'normal',
  Registration: 'registration',
  Transparent: 'transparent',
} as const);
const inkTypeMap = new KeyMap({
  Process: 'process',
  Spot: 'spot',
} as const);

export class Ink {
  private inkType: InkConcreteType;
  private name?: string;
  private neutralDensity?: number;
  private printingSequence?: number;
  private inkAlias?: number;
  private angle?: number;
  private convertToProcess?: boolean;
  private frequency?: number;
  private printInk?: boolean;
  private trapOrder?: number;
  constructor(
    private id: string,
    private type: InkType,
    options: {
      inkType: InkConcreteType;
      name?: string;
      neutralDensity?: number;
      printingSequence?: number;
      inkAlias?: string;
      angle?: number;
      convertToProcess?: boolean;
      frequency?: number;
      printInk?: boolean;
      trapOrder?: number;
    },
    private context: IDMLGraphicContext
  ) {
    this.inkType = options.inkType;
    this.name = options.name;
    this.neutralDensity = options.neutralDensity;
    this.printingSequence = options.printingSequence;
    this.angle = options.angle;
    this.convertToProcess = options.convertToProcess;
    this.frequency = options.frequency;
    this.printInk = options.printInk;
    this.trapOrder = options.trapOrder;
  }
  serialize() {
    return serializeElement(
      'Ink',
      {
        Name: this.name,
        Type: inkTypeMap.getExternal(this.type),
        InkType: inkConcreteTypeMap.getExternal(this.inkType),
        NeutralDensity: this.neutralDensity,
        PrintingSequence: this.printingSequence,
        InkAlias: this.inkAlias,
        Angle: this.angle,
        ConvertToProcess: this.convertToProcess,
        Frequency: this.frequency,
        PrintInk: this.printInk,
        TrapOrder: this.trapOrder,
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
      throw new Error('Ink element must have a Self attribute');
    }
    const type = inkTypeMap.getInternal(props.Type);
    if (!type) {
      throw new Error('Ink element must have a Type attribute');
    }
    const inkType = inkConcreteTypeMap.getInternal(props.InkType);
    if (!inkType) {
      throw new Error('Ink element must have an InkType attribute');
    }
    const name = props.Name;
    const neutralDensity = ensureNumber(props.NeutralDensity);
    const printingSequence = ensureNumber(props.PrintingSequence);
    const inkAlias = props.InkAlias;
    const angle = ensureNumber(props.Angle);
    const convertToProcess = ensureBoolean(props.ConvertToProcess);
    const frequency = ensureNumber(props.Frequency);
    const printInk = ensureBoolean(props.PrintInk);
    const trapOrder = ensureNumber(props.TrapOrder);

    return new Ink(
      id,
      type,
      {
        inkType,
        name,
        neutralDensity,
        printingSequence,
        inkAlias,
        angle,
        convertToProcess,
        frequency,
        printInk,
        trapOrder,
      },
      context
    );
  }
}
