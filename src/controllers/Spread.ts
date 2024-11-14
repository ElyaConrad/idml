import { createIDMLTransform, ensureBoolean, flattenIDMLProperties, getIDMLElementProperties, parseIDMLTransform, serializeElement } from '../helpers.js';
import _ from 'lodash';
import { Page } from './Page.js';
import { IDMLSpreadPackageContext } from './SpreadPackage.js';
import { DropShadowInput, DropShadowSetting, Sprite, SpriteWithChildren, TransparencySetting } from './sprites/Sprite.js';
import { getElementAttributes, makeElementNode, parseXML, XMLNode } from 'flat-svg';
import { MasterSpread } from './MasterSpread.js';
import { GridDataInformation } from './GridDataInformation.js';
import { ColorInput, Transform } from '../types/index.js';
import { PathGeometry, PathPoint } from './sprites/GeometricSprite.js';
import { RectangleSprite } from './sprites/Rectangle.js';
import { GroupSprite } from './sprites/Group.js';
import { TextFrame } from './sprites/TextFrame.js';
import { OvalSprite } from './sprites/Oval.js';
import { PolygonSprite, PathCommand } from './sprites/Polygon.js';
import { ImageSprite } from './sprites/Image.js';
import { ParagraphInput } from './Story.js';

export type FlattenerPreference = {
  sourceElement: Element;
};

export class Spread {
  private hidden?: boolean;
  private itemTransform?: Transform;
  private flattenerPreference?: FlattenerPreference;
  constructor(
    private id: string,
    public pages: Page[],
    private sprites: Sprite[],
    opts: {
      hidden?: boolean;
      itemTransform?: Transform;
      flattenerPreference?: FlattenerPreference;
    },
    private context: IDMLSpreadPackageContext
  ) {
    this.hidden = opts.hidden;
    this.itemTransform = opts.itemTransform;
    this.flattenerPreference = opts.flattenerPreference;
  }
  serialize() {
    const sprites = this.sprites.map((sprite) => Spread.serializeSprite(sprite));

    const customChildNodes = [this.flattenerPreference ? serializeElement('FlattenerPreference', {}, this.flattenerPreference.sourceElement, this.context.spreadPackageRoot, ['Properties']) : undefined, ...this.pages.map((page) => page.serialize()), ...sprites].filter((x) => x !== undefined);
    const serializedSpread = serializeElement(
      'Spread',
      {
        Hidden: this.hidden,
        ItemTransform: this.itemTransform ? createIDMLTransform(this.itemTransform).join(' ') : undefined,
      },
      this.id,
      this.context.spreadPackageRoot,
      ['Properties'],
      customChildNodes
    );

    return serializedSpread;
  }
  static serializeSprite(sprite: Sprite) {
    {
      if (sprite instanceof GroupSprite) {
        return sprite.serialize();
      } else if (sprite instanceof RectangleSprite) {
        return sprite.serialize();
      } else if (sprite instanceof OvalSprite) {
        return sprite.serialize();
      } else if (sprite instanceof TextFrame) {
        return sprite.serialize();
      } else if (sprite instanceof PolygonSprite) {
        return sprite.serialize();
      } else if (sprite instanceof ImageSprite) {
        return sprite.serialize();
      } else {
        throw new Error(`Unknown sprite type: ${sprite}`);
      }
    }
  }
  static getDirectChildren(element: Element, tagName: string) {
    return Array.from(element.children).filter((child) => child.tagName === tagName);
  }
  static getChildSprites(element: Element, context: IDMLSpreadPackageContext): Sprite[] {
    return [...Spread.getDirectChildren(element, 'Group').map((groupElement) => GroupSprite.parseElement(groupElement, context)), ...Spread.getDirectChildren(element, 'Rectangle').map((rectangleElement) => RectangleSprite.parseElement(rectangleElement, context)), ...Spread.getDirectChildren(element, 'TextFrame').map((textFrameElement) => TextFrame.parseElement(textFrameElement, context)), ...Spread.getDirectChildren(element, 'Oval').map((ovalElement) => OvalSprite.parseElement(ovalElement, context)), ...Spread.getDirectChildren(element, 'Polygon').map((polygonElement) => PolygonSprite.parseElement(polygonElement, context)), ...Spread.getDirectChildren(element, 'Image').map((imageElement) => ImageSprite.parseElement(imageElement, context))];
  }
  static keepChildren(element: Element): XMLNode[] {
    const children = Array.from(element.childNodes);
    return children.map((child) => {
      if (child.nodeType === 1) {
        const childElement = child as Element;
        return makeElementNode(childElement.tagName, getElementAttributes(childElement), Spread.keepChildren(childElement));
      } else if (child.nodeType === 3) {
        return {
          type: 'text',
          text: child.nodeValue ?? '',
        };
      } else if (child.nodeType === 4) {
        return {
          type: 'cdata',
          data: child.nodeValue ?? '',
        };
      } else {
        throw new Error('Unexpected node type');
      }
    });
    // return Spread.getDirectChildren(element, '*').filter(child => child.tagName !== 'Content').map(child => makeElementNode(child.tagName, getElementAttributes(child), Spread.keepChildren(child)));
  }
  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const pages = Array.from(element.getElementsByTagName('Page')).map((pageElement) => Page.parseElement(pageElement, context));

    const id = props.Self;
    if (!id) {
      throw new Error('Spread element must have a Self attribute');
    }
    const hidden = ensureBoolean(props.Hidden);
    const itemTransform = parseIDMLTransform(props.ItemTransform);

    const flattenerPreferenceElement = element.getElementsByTagName('FlattenerPreference')[0];
    const flattenerPreference = {
      sourceElement: flattenerPreferenceElement,
    };

    const sprites = Spread.getChildSprites(element, context);

    return new Spread(
      id,
      pages,
      sprites,
      {
        hidden,
        itemTransform,
        flattenerPreference,
      },
      context
    );
  }
  static create(id: string, masterSpread: MasterSpread, context: IDMLSpreadPackageContext) {
    // We're assuming the name of the page is the index of the page in the whole document
    // So, this is actually the amount of pages in the document currently existing
    const pageNameIndexOffset = context.idml.getSpreads().reduce((acc, spread) => acc + spread.pages.length, 0);
    // Normally this will just be one page but we're going to create a page for each page in the master spread (which is technically correct)
    const newPages = masterSpread.pages.map((masterSpreadPage, masterPageIndex) => {
      // Get an ID for the page
      const id = context.idml.getUniqueID('Page');
      return new Page(
        id,
        {
          // The name of the page will be the inner index of the page in the master spread (normally just 0) + the offset of already existing pages in the document
          name: String(pageNameIndexOffset + 1 + masterPageIndex),
          // Now fill up the properties of the page with the properties of the master spread page
          pageColor: masterSpreadPage.pageColor,
          optionalPage: masterSpreadPage.optionalPage,
          gridStartingPoint: masterSpreadPage.gridStartingPoint,
          // Clone master spread page properties
          geometricBounds: _.cloneDeep(masterSpreadPage.geometricBounds),
          itemTransform: _.cloneDeep(masterSpreadPage.itemTransform),
          masterPageTransform: _.cloneDeep(masterSpreadPage.masterPageTransform),
          marginPreference: _.cloneDeep(masterSpreadPage.marginPreference),
          gridDataInformation: new GridDataInformation(
            {
              fontSize: masterSpreadPage.gridDataInformation.fontSize,
              fontStyle: masterSpreadPage.gridDataInformation.fontStyle,
              characterAki: masterSpreadPage.gridDataInformation.characterAki,
              lineAki: masterSpreadPage.gridDataInformation.lineAki,
              horizontalScale: masterSpreadPage.gridDataInformation.horizontalScale,
              verticalScale: masterSpreadPage.gridDataInformation.verticalScale,
              lineAlignment: masterSpreadPage.gridDataInformation.lineAlignment,
              characterAlignment: masterSpreadPage.gridDataInformation.characterAlignment,
              gridAlignment: masterSpreadPage.gridDataInformation.gridAlignment,
              appliedFont: masterSpreadPage.gridDataInformation.appliedFont,
            },
            context
          ),
        },
        context
      );
    });
    const newSpread = new Spread(
      id,
      newPages,
      [],
      {
        hidden: false,
        // Currently we're not really supporting flattener preferences , so we just using a xml-element based flattener preference
        flattenerPreference: {
          sourceElement: parseXML(`<FlattenerPreference LineArtAndTextResolution="300" GradientAndMeshResolution="150" ClipComplexRegions="false" ConvertAllStrokesToOutlines="false" ConvertAllTextToOutlines="false"><Properties><RasterVectorBalance type="double">50</RasterVectorBalance></Properties></FlattenerPreference>`),
        },
        itemTransform: _.cloneDeep(masterSpread.itemTransform),
      },
      context
    );

    return newSpread;
  }
  static getChildSprittes(sprites: Sprite[]): Sprite[] {
    return sprites.reduce((all, sprite) => {
      if (sprite instanceof GroupSprite) {
        return [...all, ...sprite.getAllSprites(), sprite];
      } else if (sprite instanceof PolygonSprite) {
        return [...all, ...sprite.getSprites(), sprite];
      } else {
        return [...all, sprite];
      }
    }, [] as Sprite[]);
  }
  get package() {
    return this.context.idml.spreadPackages.find((spreadPackage) => spreadPackage.getSpread() === this);
  }
  get pageRelatedItemTransform() {
    const page = this.pages[0];
    return page.itemTransform;
  }
  get pageRelatedTransformOrigin() {
    const { translateX, translateY } = this.pageRelatedItemTransform;
    return [-translateX, -translateY] as [number, number];
  }
  getSprites() {
    return this.sprites;
  }

  getAllSprites() {
    return Spread.getChildSprittes(this.sprites);
  }

  relativeCoords(x: number, y: number) {
    const { translateX, translateY } = this.pageRelatedItemTransform;
    return [x + translateX, y + translateY] as [number, number];
  }
  normalizeCoords(x: number, y: number) {
    const { translateX, translateY } = this.pageRelatedItemTransform;
    return [x - translateX, y - translateY] as [number, number];
  }
  createGroup(
    opts: {
      transform?: Transform;
    },
    targetGroup?: GroupSprite
  ) {
    const id = this.context.idml.getUniqueID('Group');

    const group = new GroupSprite(
      id,
      [],
      {
        itemTransform: opts.transform ?? { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
      },
      this.context
    );

    if (targetGroup) {
      targetGroup.addSprite(group);
    } else {
      this.sprites.push(group);
    }

    return group;
  }
  createTextFrame(opts: { x: number; y: number; width: number; height: number; fill?: ColorInput | string; stroke?: ColorInput | string; strokeWeight?: number; transform?: Transform; opacity?: number; dropShadow?: DropShadowInput; paragraphs: ParagraphInput[] }, targetSprite?: SpriteWithChildren) {
    const pathPoints: PathPoint[] = [this.relativeCoords(opts.x, opts.y), this.relativeCoords(opts.x + opts.width, opts.y), this.relativeCoords(opts.x + opts.width, opts.y + opts.height), this.relativeCoords(opts.x, opts.y + opts.height)].map(([x, y]) => {
      return {
        anchor: [x, y],
        leftDirection: [x, y],
        rightDirection: [x, y],
      };
    });

    const transparencySetting: TransparencySetting = {
      blendingSetting:
        opts.opacity !== undefined
          ? {
              opacity: opts.opacity,
            }
          : undefined,
      dropShadowSetting: opts.dropShadow
        ? {
            mode: opts.dropShadow.mode,
            size: opts.dropShadow.size,
            spread: opts.dropShadow.spread,
            xOffset: opts.dropShadow.xOffset,
            yOffset: opts.dropShadow.yOffset,
            effectColorId: opts.dropShadow.effectColor ? this.context.idml.assumeColor(opts.dropShadow.effectColor).id : 'Color/Black',
          }
        : undefined,
    };

    const id = this.context.idml.getUniqueID('TextFrame');

    const parentStory = this.context.idml.createStory(opts.paragraphs);

    const textFrame = new TextFrame(
      id,
      parentStory.id,
      {
        name: '$ID/',
        visible: true,
        horizontalLayoutConstraints: ['flexibleDimension', 'fixedDimension', 'flexibleDimension'],
        verticalLayoutConstraints: ['flexibleDimension', 'fixedDimension', 'flexibleDimension'],
        appliedObjectStyleId: 'ObjectStyle/$ID/[Normal Text Frame]',
        contentType: 'TextType',
        fillColorId: opts.fill ? this.context.idml.assumeColor(opts.fill).id : 'Color/None',
        strokeColorId: opts.stroke ? this.context.idml.assumeColor(opts.stroke).id : 'Color/None',
        strokeWeight: opts.strokeWeight ?? 0,

        gradientFillAngle: 0,
        gradientStart: [0, 0],
        gradientFillLength: 0,
        gradientStrokeStart: [0, 0],
        gradientStrokeLength: 0,
        gradientStrokeAngle: 0,
        itemTransform: opts.transform ?? { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
        storyTitle: '$ID/',
        pathGeometry: [
          {
            open: false,
            pathPoints,
            geometryPathType: 'normalPath',
          },
        ],
        frameFittingOption: {
          sourceElement: parseXML(`<FrameFittingOption AutoFit="false" LeftCrop="0" TopCrop="0" RightCrop="0" BottomCrop="0" FittingOnEmptyFrame="None" FittingAlignment="CenterAnchor" />`),
        },
        objectExportOption: {
          sourceElement: parseXML(`<ObjectExportOption AltTextSourceType="SourceXMLStructure" ActualTextSourceType="SourceXMLStructure" CustomAltText="$ID/" CustomActualText="$ID/" ApplyTagType="TagFromStructure" ImageConversionType="JPEG" ImageExportResolution="Ppi300" GIFOptionsPalette="AdaptivePalette" GIFOptionsInterlaced="true" JPEGOptionsQuality="High" JPEGOptionsFormat="BaselineEncoding" ImageAlignment="AlignLeft" ImageSpaceBefore="0" ImageSpaceAfter="0" UseImagePageBreak="false" ImagePageBreak="PageBreakBefore" CustomImageAlignment="false" SpaceUnit="CssPixel" CustomLayout="false" CustomLayoutType="AlignmentAndSpacing" EpubType="$ID/" SizeType="DefaultSize" CustomSize="$ID/" PreserveAppearanceFromLayout="PreserveAppearanceDefault"><Properties><AltMetadataProperty NamespacePrefix="$ID/" PropertyPath="$ID/" /><ActualMetadataProperty NamespacePrefix="$ID/" PropertyPath="$ID/" /></Properties></ObjectExportOption>`),
        },
        textWrapPreference: {
          sourceElement: parseXML(`<TextWrapPreference Inverse="false" ApplyToMasterPageOnly="false" TextWrapSide="BothSides" TextWrapMode="None"><Properties><TextWrapOffset Top="0" Left="0" Bottom="0" Right="0" /></Properties></TextWrapPreference>`),
        },
        inCopyExportOption: {
          sourceElement: parseXML(`<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false" />`),
        },
        textFramePreference: {
          sourceElement: parseXML(`
            <TextFramePreference FootnotesEnableOverrides="false" FootnotesSpanAcrossColumns="false" FootnotesMinimumSpacing="12" FootnotesSpaceBetween="6" TextColumnCount="1" TextColumnGutter="12" TextColumnFixedWidth="144" UseFixedColumnWidth="false" FirstBaselineOffset="AscentOffset" MinimumFirstBaselineOffset="0" VerticalJustification="TopAlign" VerticalThreshold="0" IgnoreWrap="false" VerticalBalanceColumns="false" UseFlexibleColumnWidth="false" TextColumnMaxWidth="0" AutoSizingType="Off" AutoSizingReferencePoint="CenterPoint" UseMinimumHeightForAutoSizing="false" MinimumHeightForAutoSizing="0" UseMinimumWidthForAutoSizing="false" MinimumWidthForAutoSizing="0" UseNoLineBreaksForAutoSizing="false" ColumnRuleOverride="false" ColumnRuleOffset="0" ColumnRuleTopInset="0" ColumnRuleInsetChainOverride="true" ColumnRuleBottomInset="0" ColumnRuleStrokeWidth="1" ColumnRuleStrokeColor="Color/Black" ColumnRuleStrokeType="StrokeStyle/$ID/Solid" ColumnRuleStrokeTint="100" ColumnRuleOverprintOverride="false">
              <Properties>
                <InsetSpacing type="list">
                  <ListItem type="unit">0</ListItem>
                  <ListItem type="unit">0</ListItem>
                  <ListItem type="unit">0</ListItem>
                  <ListItem type="unit">0</ListItem>
                </InsetSpacing>
              </Properties>
            </TextFramePreference>`),
        },
        transparencySetting,
      },
      this.context
    );

    if (targetSprite) {
      targetSprite.addSprite(textFrame);
    } else {
      this.sprites.push(textFrame);
    }

    return textFrame;
  }
  createImage(
    opts: {
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: ColorInput | string;
      stroke?: ColorInput | string;
      strokeWeight?: number;
      transform?: Transform;
      opacity?: number;
      dropShadow?: DropShadowInput;
      data: ArrayBuffer;
    },
    targetSprite?: SpriteWithChildren
  ) {
    const [left, top] = this.relativeCoords(opts.x, opts.y);
    const [right, bottom] = this.relativeCoords(opts.x + opts.width, opts.y + opts.height);

    const geometricBounds = { left, top, right, bottom };

    const transparencySetting: TransparencySetting = {
      blendingSetting:
        opts.opacity !== undefined
          ? {
              opacity: opts.opacity,
            }
          : undefined,
      dropShadowSetting: opts.dropShadow
        ? {
            mode: opts.dropShadow.mode,
            size: opts.dropShadow.size,
            spread: opts.dropShadow.spread,
            xOffset: opts.dropShadow.xOffset,
            yOffset: opts.dropShadow.yOffset,
            effectColorId: opts.dropShadow.effectColor ? this.context.idml.assumeColor(opts.dropShadow.effectColor).id : 'Color/Black',
          }
        : undefined,
    };

    const id = this.context.idml.getUniqueID('Image');

    const image = new ImageSprite(
      id,
      opts.data,
      geometricBounds,
      {
        appliedObjectStyleId: 'ObjectStyle/$ID/[None]',
        //contentType: 'GraphicType',
        itemTransform: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
        pathGeometry: [],
        textWrapPreference: {
          sourceElement: parseXML(`<TextWrapPreference Inverse="false" ApplyToMasterPageOnly="false" TextWrapSide="BothSides" TextWrapMode="None"><Properties><TextWrapOffset Top="0" Left="0" Bottom="0" Right="0" /></Properties></TextWrapPreference>`),
        },
        visible: true,
      },
      this.context
    );

    if (targetSprite) {
      targetSprite.addSprite(image);
    } else {
      this.sprites.push(image);
    }
    return image;
  }
  createPolygon(opts: { paths: PathCommand[][]; fill?: ColorInput | string; stroke?: ColorInput | string; strokeWeight?: number; transform?: Transform; opacity?: number; dropShadow?: DropShadowInput }, targetSprite?: SpriteWithChildren) {
    const pathGeometry = PolygonSprite.getPathsFromCommands(opts.paths).map<PathGeometry>(({ pathPoints, open }) => {
      return {
        geometryPathType: 'normalPath',
        open,
        pathPoints: pathPoints.map(({ anchor, leftDirection, rightDirection }) => {
          return {
            anchor: this.relativeCoords(anchor[0], anchor[1]),
            leftDirection: this.relativeCoords(leftDirection[0], leftDirection[1]),
            rightDirection: this.relativeCoords(rightDirection[0], rightDirection[1]),
          };
        }),
      };
    });

    const transparencySetting: TransparencySetting = {
      blendingSetting:
        opts.opacity !== undefined
          ? {
              opacity: opts.opacity,
            }
          : undefined,
      dropShadowSetting: opts.dropShadow
        ? {
            mode: opts.dropShadow.mode,
            size: opts.dropShadow.size,
            spread: opts.dropShadow.spread,
            xOffset: opts.dropShadow.xOffset,
            yOffset: opts.dropShadow.yOffset,
            effectColorId: opts.dropShadow.effectColor ? this.context.idml.assumeColor(opts.dropShadow.effectColor).id : 'Color/Black',
          }
        : undefined,
    };

    const id = this.context.idml.getUniqueID('Polygon');

    const polygon = new PolygonSprite(
      id,
      [],
      {
        name: '$ID/',
        visible: true,
        horizontalLayoutConstraints: ['flexibleDimension', 'fixedDimension', 'flexibleDimension'],
        verticalLayoutConstraints: ['flexibleDimension', 'fixedDimension', 'flexibleDimension'],
        appliedObjectStyleId: 'ObjectStyle/$ID/[Normal Graphics Frame]',
        contentType: 'Unassigned',
        fillColorId: opts.fill ? this.context.idml.assumeColor(opts.fill).id : 'Color/None',
        strokeColorId: opts.stroke ? this.context.idml.assumeColor(opts.stroke).id : 'Color/None',
        strokeWeight: opts.strokeWeight ?? 0,

        gradientFillAngle: 0,
        gradientStart: [0, 0],
        gradientFillLength: 0,
        gradientStrokeStart: [0, 0],
        gradientStrokeLength: 0,
        gradientStrokeAngle: 0,
        itemTransform: opts.transform ?? { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
        storyTitle: '$ID/',
        pathGeometry,
        frameFittingOption: {
          sourceElement: parseXML(`<FrameFittingOption AutoFit="false" LeftCrop="0" TopCrop="0" RightCrop="0" BottomCrop="0" FittingOnEmptyFrame="None" FittingAlignment="CenterAnchor" />`),
        },
        objectExportOption: {
          sourceElement: parseXML(`<ObjectExportOption AltTextSourceType="SourceXMLStructure" ActualTextSourceType="SourceXMLStructure" CustomAltText="$ID/" CustomActualText="$ID/" ApplyTagType="TagFromStructure" ImageConversionType="JPEG" ImageExportResolution="Ppi300" GIFOptionsPalette="AdaptivePalette" GIFOptionsInterlaced="true" JPEGOptionsQuality="High" JPEGOptionsFormat="BaselineEncoding" ImageAlignment="AlignLeft" ImageSpaceBefore="0" ImageSpaceAfter="0" UseImagePageBreak="false" ImagePageBreak="PageBreakBefore" CustomImageAlignment="false" SpaceUnit="CssPixel" CustomLayout="false" CustomLayoutType="AlignmentAndSpacing" EpubType="$ID/" SizeType="DefaultSize" CustomSize="$ID/" PreserveAppearanceFromLayout="PreserveAppearanceDefault"><Properties><AltMetadataProperty NamespacePrefix="$ID/" PropertyPath="$ID/" /><ActualMetadataProperty NamespacePrefix="$ID/" PropertyPath="$ID/" /></Properties></ObjectExportOption>`),
        },
        textWrapPreference: {
          sourceElement: parseXML(`<TextWrapPreference Inverse="false" ApplyToMasterPageOnly="false" TextWrapSide="BothSides" TextWrapMode="None"><Properties><TextWrapOffset Top="0" Left="0" Bottom="0" Right="0" /></Properties></TextWrapPreference>`),
        },
        inCopyExportOption: {
          sourceElement: parseXML(`<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false" />`),
        },
        transparencySetting,
      },
      this.context
    );

    if (targetSprite) {
      targetSprite.addSprite(polygon);
    } else {
      this.sprites.push(polygon);
    }

    return polygon;
  }
  createRectangle(opts: { x: number; y: number; width: number; height: number; fill?: ColorInput | string; stroke?: ColorInput | string; strokeWeight?: number; transform?: Transform; opacity?: number; dropShadow?: DropShadowInput }, targetSprite?: SpriteWithChildren) {
    const pathPoints: PathPoint[] = [this.relativeCoords(opts.x, opts.y), this.relativeCoords(opts.x + opts.width, opts.y), this.relativeCoords(opts.x + opts.width, opts.y + opts.height), this.relativeCoords(opts.x, opts.y + opts.height)].map(([x, y]) => {
      return {
        anchor: [x, y],
        leftDirection: [x, y],
        rightDirection: [x, y],
      };
    });

    const transparencySetting: TransparencySetting = {
      blendingSetting:
        opts.opacity !== undefined
          ? {
              opacity: opts.opacity,
            }
          : undefined,
      dropShadowSetting: opts.dropShadow
        ? {
            mode: opts.dropShadow.mode,
            size: opts.dropShadow.size,
            spread: opts.dropShadow.spread,
            xOffset: opts.dropShadow.xOffset,
            yOffset: opts.dropShadow.yOffset,
            effectColorId: opts.dropShadow.effectColor ? this.context.idml.assumeColor(opts.dropShadow.effectColor).id : 'Color/Black',
          }
        : undefined,
    };

    const id = this.context.idml.getUniqueID('Rectangle');
    const rectangle = new RectangleSprite(
      id,
      [],
      {
        name: '$ID/',
        visible: true,
        horizontalLayoutConstraints: ['flexibleDimension', 'fixedDimension', 'flexibleDimension'],
        verticalLayoutConstraints: ['flexibleDimension', 'fixedDimension', 'flexibleDimension'],
        appliedObjectStyleId: 'ObjectStyle/$ID/[Normal Graphics Frame]',
        contentType: 'Unassigned',
        fillColorId: opts.fill ? this.context.idml.assumeColor(opts.fill).id : 'Color/None',
        strokeColorId: opts.stroke ? this.context.idml.assumeColor(opts.stroke).id : 'Color/None',
        strokeWeight: opts.strokeWeight ?? 0,

        gradientFillAngle: 0,
        gradientStart: [0, 0],
        gradientFillLength: 0,
        gradientStrokeStart: [0, 0],
        gradientStrokeLength: 0,
        gradientStrokeAngle: 0,
        itemTransform: opts.transform ?? { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
        storyTitle: '$ID/',
        pathGeometry: [
          {
            open: false,
            pathPoints,
            geometryPathType: 'normalPath',
          },
        ],
        frameFittingOption: {
          sourceElement: parseXML(`<FrameFittingOption AutoFit="false" LeftCrop="0" TopCrop="0" RightCrop="0" BottomCrop="0" FittingOnEmptyFrame="None" FittingAlignment="CenterAnchor" />`),
        },
        objectExportOption: {
          sourceElement: parseXML(`<ObjectExportOption AltTextSourceType="SourceXMLStructure" ActualTextSourceType="SourceXMLStructure" CustomAltText="$ID/" CustomActualText="$ID/" ApplyTagType="TagFromStructure" ImageConversionType="JPEG" ImageExportResolution="Ppi300" GIFOptionsPalette="AdaptivePalette" GIFOptionsInterlaced="true" JPEGOptionsQuality="High" JPEGOptionsFormat="BaselineEncoding" ImageAlignment="AlignLeft" ImageSpaceBefore="0" ImageSpaceAfter="0" UseImagePageBreak="false" ImagePageBreak="PageBreakBefore" CustomImageAlignment="false" SpaceUnit="CssPixel" CustomLayout="false" CustomLayoutType="AlignmentAndSpacing" EpubType="$ID/" SizeType="DefaultSize" CustomSize="$ID/" PreserveAppearanceFromLayout="PreserveAppearanceDefault"><Properties><AltMetadataProperty NamespacePrefix="$ID/" PropertyPath="$ID/" /><ActualMetadataProperty NamespacePrefix="$ID/" PropertyPath="$ID/" /></Properties></ObjectExportOption>`),
        },
        textWrapPreference: {
          sourceElement: parseXML(`<TextWrapPreference Inverse="false" ApplyToMasterPageOnly="false" TextWrapSide="BothSides" TextWrapMode="None"><Properties><TextWrapOffset Top="0" Left="0" Bottom="0" Right="0" /></Properties></TextWrapPreference>`),
        },
        inCopyExportOption: {
          sourceElement: parseXML(`<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false" />`),
        },
        transparencySetting,
      },
      this.context
    );
    if (targetSprite) {
      targetSprite.addSprite(rectangle);
    } else {
      this.sprites.push(rectangle);
    }
    return rectangle;
  }
  createOval(opts: { x: number; y: number; radiusX: number; radiusY: number; fill?: ColorInput | string; stroke?: ColorInput | string; strokeWeight?: number; transform?: Transform; opacity?: number; dropShadow?: DropShadowInput }, targetSprite?: SpriteWithChildren) {
    const [x, y] = this.relativeCoords(opts.x, opts.y);
    const pathPoints = OvalSprite.calculateEllipsePathPoints(x - opts.radiusX, y - opts.radiusY, opts.radiusX, opts.radiusY);

    const transparencySetting: TransparencySetting = {
      blendingSetting:
        opts.opacity !== undefined
          ? {
              opacity: opts.opacity,
            }
          : undefined,
      dropShadowSetting: opts.dropShadow
        ? {
            mode: opts.dropShadow.mode,
            size: opts.dropShadow.size,
            spread: opts.dropShadow.spread,
            xOffset: opts.dropShadow.xOffset,
            yOffset: opts.dropShadow.yOffset,
            effectColorId: opts.dropShadow.effectColor ? this.context.idml.assumeColor(opts.dropShadow.effectColor).id : 'Color/Black',
          }
        : undefined,
    };

    const id = this.context.idml.getUniqueID('Oval');

    const oval = new OvalSprite(
      id,
      [],
      {
        name: '$ID/',
        visible: true,
        horizontalLayoutConstraints: ['flexibleDimension', 'fixedDimension', 'flexibleDimension'],
        verticalLayoutConstraints: ['flexibleDimension', 'fixedDimension', 'flexibleDimension'],
        appliedObjectStyleId: 'ObjectStyle/$ID/[Normal Graphics Frame]',
        contentType: 'Unassigned',
        fillColorId: opts.fill ? this.context.idml.assumeColor(opts.fill).id : 'Color/None',
        strokeColorId: opts.stroke ? this.context.idml.assumeColor(opts.stroke).id : 'Color/None',
        strokeWeight: opts.strokeWeight ?? 0,
        gradientFillAngle: 0,
        gradientStart: [0, 0],
        gradientFillLength: 0,
        gradientStrokeStart: [0, 0],
        gradientStrokeLength: 0,
        gradientStrokeAngle: 0,
        itemTransform: opts.transform ?? { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
        storyTitle: '$ID/',
        pathGeometry: [
          {
            open: false,
            pathPoints,
            geometryPathType: 'normalPath',
          },
        ],
        frameFittingOption: {
          sourceElement: parseXML(`<FrameFittingOption AutoFit="false" LeftCrop="0" TopCrop="0" RightCrop="0" BottomCrop="0" FittingOnEmptyFrame="None" FittingAlignment="CenterAnchor" />`),
        },
        objectExportOption: {
          sourceElement: parseXML(`<ObjectExportOption AltTextSourceType="SourceXMLStructure" ActualTextSourceType="SourceXMLStructure" CustomAltText="$ID/" CustomActualText="$ID/" ApplyTagType="TagFromStructure" ImageConversionType="JPEG" ImageExportResolution="Ppi300" GIFOptionsPalette="AdaptivePalette" GIFOptionsInterlaced="true" JPEGOptionsQuality="High" JPEGOptionsFormat="BaselineEncoding" ImageAlignment="AlignLeft" ImageSpaceBefore="0" ImageSpaceAfter="0" UseImagePageBreak="false" ImagePageBreak="PageBreakBefore" CustomImageAlignment="false" SpaceUnit="CssPixel" CustomLayout="false" CustomLayoutType="AlignmentAndSpacing" EpubType="$ID/" SizeType="DefaultSize" CustomSize="$ID/" PreserveAppearanceFromLayout="PreserveAppearanceDefault"><Properties><AltMetadataProperty NamespacePrefix="$ID/" PropertyPath="$ID/" /><ActualMetadataProperty NamespacePrefix="$ID/" PropertyPath="$ID/" /></Properties></ObjectExportOption>`),
        },
        textWrapPreference: {
          sourceElement: parseXML(`<TextWrapPreference Inverse="false" ApplyToMasterPageOnly="false" TextWrapSide="BothSides" TextWrapMode="None"><Properties><TextWrapOffset Top="0" Left="0" Bottom="0" Right="0" /></Properties></TextWrapPreference>`),
        },
        inCopyExportOption: {
          sourceElement: parseXML(`<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false" />`),
        },
        transparencySetting,
      },
      this.context
    );

    if (targetSprite) {
      targetSprite.addSprite(oval);
    } else {
      this.sprites.push(oval);
    }

    return oval;
  }
}
