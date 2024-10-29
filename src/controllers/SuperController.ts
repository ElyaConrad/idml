import { ElementNode } from '../util/xml';

export abstract class SuperController {
  abstract serialize(): ElementNode;
  static elementsImplemented: string[] = [];
}
