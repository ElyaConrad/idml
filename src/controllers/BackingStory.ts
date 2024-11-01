import { IDMLDocumentContext } from '../idml.js';
import { ElementNode, nodeToNode, parseXML } from 'flat-svg';
import { Story } from './Story.js';
import { SuperController } from './SuperController.js';

export type IDMLBackingStoryContext = IDMLDocumentContext & {
  storyPackageRoot: HTMLElement;
};

export class BackingStory extends SuperController {
  static elementsImplemented = ['XmlStory'];
  context: IDMLBackingStoryContext;
  story: Story;
  constructor(public src: string, raw: string, topContext: IDMLDocumentContext) {
    super();

    const doc = parseXML(raw);

    this.context = {
      ...topContext,
      storyPackageRoot: doc,
    };

    const xmlStoryElement = doc.getElementsByTagName('XmlStory')[0];
    if (!xmlStoryElement) {
      throw new Error('XmlStory element not found');
    }
    this.story = Story.parseElement(xmlStoryElement, this.context);
  }
  serialize() {
    const document = nodeToNode(this.context.storyPackageRoot) as ElementNode;
    document.children = document.children ?? [];
    document.children = document.children.filter((child) => child.type === 'text' || child.type === 'cdata' || !BackingStory.elementsImplemented.includes(child.tagName));

    document.children.push(this.story.serialize('XmlStory'));

    return document;
  }
}
