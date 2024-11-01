import { IDMLDocumentContext } from '../idml.js';
import { ElementNode, nodeToNode, parseXML } from 'flat-svg';
import { Story } from './Story.js';
import { SuperController } from './SuperController.js';

export type IDMLStoryPackageContext = IDMLDocumentContext & {
  storyPackageRoot: HTMLElement;
};

export class StoryPackage extends SuperController {
  static elementsImplemented = ['Story'];
  context: IDMLStoryPackageContext;
  story: Story;
  constructor(public src: string, raw: string, topContext: IDMLDocumentContext) {
    super();

    const doc = parseXML(raw);

    this.context = {
      ...topContext,
      storyPackageRoot: doc,
    };

    const storyElement = doc.getElementsByTagName('Story')[0];
    if (!storyElement) {
      throw new Error('Story element not found');
    }
    this.story = Story.parseElement(storyElement, this.context);
  }
  serialize() {
    const document = nodeToNode(this.context.storyPackageRoot) as ElementNode;
    document.children = document.children ?? [];
    document.children = document.children.filter((child) => child.type === 'text' || child.type === 'cdata' || !StoryPackage.elementsImplemented.includes(child.tagName));

    document.children.push(this.story.serialize('Story'));

    return document;
  }
}
