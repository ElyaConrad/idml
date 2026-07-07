import { ElementNode } from '../util/xml.js';

export abstract class SuperController {
  abstract serialize(): ElementNode;
  static elementsImplemented: string[] = [];
}
