import { ElementNode } from 'flat-svg';

export abstract class SuperController {
  abstract serialize(): ElementNode;
  static elementsImplemented: string[] = [];
}
