import { ensureBoolean, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../helpers.js';
import { KeyMap } from '../util/keyMap.js';
import { makeElementNode, makeTextNode } from '../util/xml.js';
import { IDMLBackingStoryContext } from './BackingStory.js';
import { Spread } from './Spread.js';

export type FrameType = 'textFrame' | 'graphicFrame' | 'unassignedFrame';
export type StoryOrientation = 'horizontal' | 'vertical';
export type StoryDirection = 'leftToRight' | 'rightToLeft';

const frameTypeMap = new KeyMap({
  TextFrameType: 'textFrame',
  GraphicFrameType: 'graphicFrame',
  UnassignedFrameType: 'unassignedFrame',
} as const);

const storyOrientationMap = new KeyMap({
  Horizontal: 'horizontal',
  Vertical: 'vertical',
} as const);

const storyDirectionMap = new KeyMap({
  LeftToRightDirection: 'leftToRight',
  RightToLeftDirection: 'rightToLeft',
} as const);

export type StoryPreference = {
  opticalMarginAlignment: boolean;
  opticalMarginSize: number;
  frameType: FrameType;
  orientation: StoryOrientation;
  direction: StoryDirection;
};

export type InCopyExportOption = {
  includeGraphicProxies: boolean;
  includeAllResources: boolean;
};

export type CharacterStyleRange = {
  appliedCharacterStyle: string;
  otfContextualAlternate: boolean;
  content: string;
  sourceElement?: Element;
};

export type ParagraphStyleRange = {
  appliedParagraphStyle: string;
  features: CharacterStyleRange[];
  sourceElement?: Element;
};

export class Story {
  private userText?: boolean;
  private title?: string;
  private storyPreference?: StoryPreference;
  private inCopyExportOption?: InCopyExportOption;
  constructor(
    private id: string,
    private paragraphs: ParagraphStyleRange[],
    opts: {
      userText?: boolean;
      title?: string;
      storyPreference?: StoryPreference;
      inCopyExportOption?: InCopyExportOption;
    },
    private context: IDMLBackingStoryContext
  ) {
    this.userText = opts.userText;
    this.title = opts.title;
    this.storyPreference = opts.storyPreference;
    this.inCopyExportOption = opts.inCopyExportOption;
  }
  serialize(tagName: 'Story' | 'XmlStory') {
    return serializeElement(
      tagName,
      {
        UserText: this.userText,
        Title: this.title,
      },
      this.id,
      this.context.storyPackageRoot,
      ['Properties'],
      [
        this.storyPreference
          ? serializeElement(
              'StoryPreference',
              {
                OpticalMarginAlignment: this.storyPreference.opticalMarginAlignment,
                OpticalMarginSize: this.storyPreference.opticalMarginSize,
                FrameType: frameTypeMap.getExternal(this.storyPreference.frameType),
                StoryOrientation: storyOrientationMap.getExternal(this.storyPreference.orientation),
                StoryDirection: storyDirectionMap.getExternal(this.storyPreference.direction),
              },
              undefined,
              this.context.storyPackageRoot,
              ['Properties']
            )
          : undefined,
        this.inCopyExportOption
          ? serializeElement(
              'InCopyExportOption',
              {
                IncludeGraphicProxies: this.inCopyExportOption.includeGraphicProxies,
                IncludeAllResources: this.inCopyExportOption.includeAllResources,
              },
              undefined,
              this.context.storyPackageRoot,
              ['Properties']
            )
          : undefined,
        ...this.paragraphs.map((paragraph) =>
          serializeElement(
            'ParagraphStyleRange',
            {
              AppliedParagraphStyle: paragraph.appliedParagraphStyle,
            },
            paragraph.sourceElement,
            this.context.storyPackageRoot,
            ['Properties'],
            paragraph.features.map((feature) =>
              serializeElement(
                'CharacterStyleRange',
                {
                  AppliedCharacterStyle: feature.appliedCharacterStyle,
                  OTFContextualAlternate: feature.otfContextualAlternate,
                },
                feature.sourceElement,
                this.context.storyPackageRoot,
                ['Properties'],
                [
                  ...(feature.sourceElement
                    ? Spread.keepChildren(feature.sourceElement).filter(
                        (xmlNode) => xmlNode.type !== 'element' || xmlNode.tagName !== 'Content'
                      )
                    : []),
                  makeElementNode('Content', {}, [makeTextNode(feature.content)]),
                ]
              )
            )
          )
        ),
      ].filter((element) => element !== undefined)
    );
  }
  static parseInCopyExportOption(element: Element): InCopyExportOption {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    return {
      includeGraphicProxies: ensureBoolean(props.IncludeGraphicProxies),
      includeAllResources: ensureBoolean(props.IncludeAllResources),
    };
  }
  static storyPreferenceFromElement(element: Element): StoryPreference {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const opticalMarginAlignment = ensureBoolean(props.OpticalMarginAlignment);
    const opticalMarginSize = ensureNumber(props.OpticalMarginSize);
    if (opticalMarginSize === undefined) {
      throw new Error('Story element must have an OpticalMarginSize attribute');
    }
    const frameType = frameTypeMap.getInternal(props.FrameType);
    const orientation = storyOrientationMap.getInternal(props.StoryOrientation);
    const direction = storyDirectionMap.getInternal(props.StoryDirection);

    return {
      opticalMarginAlignment,
      opticalMarginSize,
      frameType,
      orientation,
      direction,
    };
  }
  static parseCharacterStyleRange(element: Element): CharacterStyleRange {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const appliedCharacterStyle = props.AppliedCharacterStyle;
    if (!appliedCharacterStyle) {
      throw new Error('CharacterStyleRange element must have an AppliedCharacterStyle attribute');
    }
    const otfContextualAlternate = ensureBoolean(props.OTFContextualAlternate);
    const content = element.textContent ?? '';

    return {
      appliedCharacterStyle,
      otfContextualAlternate,
      content,
      sourceElement: element,
    };
  }
  static parseParagraphStyleRange(element: Element): ParagraphStyleRange {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const appliedParagraphStyle = props.AppliedParagraphStyle;
    if (!appliedParagraphStyle) {
      throw new Error('ParagraphStyleRange element must have an AppliedParagraphStyle attribute');
    }
    const characterStyleRanges = Array.from(element.getElementsByTagName('CharacterStyleRange')).map(
      (characterStyleRangeElement) => Story.parseCharacterStyleRange(characterStyleRangeElement)
    );

    return {
      appliedParagraphStyle,
      features: characterStyleRanges,
      sourceElement: element,
    };
  }
  static parseElement(element: Element, context: IDMLBackingStoryContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const id = props.Self;
    if (!id) {
      throw new Error('Story element must have a Self attribute');
    }

    const userText = ensureBoolean(props.UserText);
    const title = props.Title;
    const storyPreferenceElement = element.getElementsByTagName('StoryPreference')[0];
    const storyPreference = storyPreferenceElement ? Story.storyPreferenceFromElement(storyPreferenceElement) : undefined;
    const inCopyExportOptionElement = element.getElementsByTagName('InCopyExportOption')[0];
    const inCopyExportOption = inCopyExportOptionElement ? Story.parseInCopyExportOption(inCopyExportOptionElement) : undefined;

    const paragraphStyleRangeElements = Array.from(element.getElementsByTagName('ParagraphStyleRange'));

    const paragraphs = paragraphStyleRangeElements.map((paragraphStyleRangeElement) =>
      Story.parseParagraphStyleRange(paragraphStyleRangeElement)
    );

    return new Story(id, paragraphs, { userText, title, storyPreference, inCopyExportOption }, context);
  }
}
