import { makeElementNode } from 'flat-svg';
import { createIDMLTransform, ensureArray, ensureBoolean, ensureEnumArray, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, parseIDMLTransform, serializeElement, normalizeTransformForGivenOrigin } from '../../helpers.js';
import { ColorInput, GeometricBounds, Transform } from '../../types/index.js';
import { KeyMap } from '../../util/keyMap.js';
import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { RectangleSprite } from './Rectangle.js';
import { OvalSprite } from './Oval.js';
import { PolygonSprite } from './Polygon.js';
import { GroupSprite } from './Group.js';

export type SpriteWithChildren = RectangleSprite | OvalSprite | PolygonSprite | GroupSprite;

export type BlendingSetting = {
  opacity: number;
};
export type DropShadowSetting = {
  mode: 'drop';
  xOffset: number;
  yOffset: number;
  size: number;
  effectColorId: string;
  spread: number;
};
export type TransparencySetting = {
  blendingSetting?: BlendingSetting;
  dropShadowSetting?: DropShadowSetting;
};

export type DropShadowInput = {
  mode: 'drop';
  xOffset: number;
  yOffset: number;
  size: number;
  effectColor: ColorInput;
  spread: number;
};

export type SpriteOpts = {
  name?: string;
  appliedObjectStyleId?: string;
  itemTransform: Transform;
  storyTitle?: string;
  contentType?: string;
  visible?: boolean;
  horizontalLayoutConstraints?: HorizontalLayoutConstraints;
  verticalLayoutConstraints?: VerticalLayoutConstraints;
  fillColorId?: string;
  gradientStart?: [number, number];
  gradientFillLength?: number;
  gradientFillAngle?: number;
  gradientStrokeStart?: [number, number];
  gradientStrokeLength?: number;
  gradientStrokeAngle?: number;

  strokeColorId?: string;
  strokeWeight?: number;

  frameFittingOption?: FrameFittingOption;
  objectExportOption?: ObjectExportOption;
  textWrapPreference?: TextWrapPreference;
  inCopyExportOption?: InCopyExportOption;

  transparencySetting?: TransparencySetting;
};

export type LayoutDimension = 'fixedDimension' | 'flexibleDimension';
export type HorizontalLayoutConstraints = [LayoutDimension, LayoutDimension, LayoutDimension];
export type VerticalLayoutConstraints = [LayoutDimension, LayoutDimension, LayoutDimension];

const layoutDimensionMap = new KeyMap({
  FixedDimension: 'fixedDimension',
  FlexibleDimension: 'flexibleDimension',
} as const);

const dropShadowSettingModeMap = new KeyMap({
  Drop: 'drop',
} as const);

export type FrameFittingOption = {
  sourceElement: Element;
};
export type ObjectExportOption = {
  sourceElement: Element;
};
export type TextWrapPreference = {
  sourceElement: Element;
};
export type InCopyExportOption = {
  sourceElement: Element;
};

export abstract class Sprite {
  private name?: string;
  private appliedObjectStyleId?: string;
  private itemTransform: Transform;
  private storyTitle?: string;
  private contentType?: string;
  private visible?: boolean;
  private horizontalLayoutConstraints?: HorizontalLayoutConstraints;
  private verticalLayoutConstraints?: VerticalLayoutConstraints;
  private fillColorId?: string;
  private gradientStart?: [number, number];
  private gradientFillLength?: number;
  private gradientFillAngle?: number;
  private gradientStrokeStart?: [number, number];
  private gradientStrokeLength?: number;
  private gradientStrokeAngle?: number;

  private strokeColorId?: string;
  private strokeWeight?: number;

  private frameFittingOption?: FrameFittingOption;
  private objectExportOption?: ObjectExportOption;
  private textWrapPreference?: TextWrapPreference;
  private inCopyExportOption?: InCopyExportOption;

  private transparencySetting?: TransparencySetting;

  constructor(private id: string, private type: string, opts: SpriteOpts, public context: IDMLSpreadPackageContext) {
    this.name = opts.name;
    this.appliedObjectStyleId = opts.appliedObjectStyleId;
    this.itemTransform = opts.itemTransform;
    this.storyTitle = opts.storyTitle;
    this.contentType = opts.contentType;
    this.visible = opts.visible;
    this.horizontalLayoutConstraints = opts.horizontalLayoutConstraints;
    this.verticalLayoutConstraints = opts.verticalLayoutConstraints;
    this.fillColorId = opts.fillColorId;
    this.gradientStart = opts.gradientStart;
    this.gradientFillLength = opts.gradientFillLength;
    this.gradientFillAngle = opts.gradientFillAngle;
    this.gradientStrokeStart = opts.gradientStrokeStart;
    this.gradientStrokeLength = opts.gradientStrokeLength;
    this.gradientStrokeAngle = opts.gradientStrokeAngle;

    this.frameFittingOption = opts.frameFittingOption;
    this.objectExportOption = opts.objectExportOption;
    this.textWrapPreference = opts.textWrapPreference;
    this.inCopyExportOption = opts.inCopyExportOption;

    this.strokeColorId = opts.strokeColorId;
    this.strokeWeight = opts.strokeWeight;

    this.transparencySetting = opts.transparencySetting;
  }
  // abstract serialize(): ElementNode;
  abstract getGeometricBounds(): GeometricBounds;
  // Return the parent spread
  get parentSpread() {
    const parentSpread = this.context.idml.getSpreads().find((spread) => spread.getAllSprites().includes(this));
    if (!parentSpread) {
      throw new Error('Parent spread not found');
    }
    return parentSpread;
  }
  getFillColor() {
    return this.fillColorId ? this.context.idml.getColorById(this.fillColorId) : undefined;
  }
  getStrokeColor() {
    return this.strokeColorId ? this.context.idml.getColorById(this.strokeColorId) : undefined;
  }
  getStrokeWeight() {
    return this.strokeWeight;
  }
  setFillColor(color: ColorInput) {
    this.fillColorId = this.context.idml.assumeColor(color).id;
  }
  setStrokeColor(color: ColorInput) {
    this.strokeColorId = this.context.idml.assumeColor(color).id;
  }
  setStrokeWeight(weight: number) {
    this.strokeWeight = weight;
  }
  getOpacity() {
    return this.transparencySetting?.blendingSetting?.opacity ?? 100;
  }
  setOpacity(opacity: number) {
    if (!this.transparencySetting) {
      this.transparencySetting = {};
    }
    if (!this.transparencySetting.blendingSetting) {
      this.transparencySetting.blendingSetting = {
        opacity,
      };
    } else {
      this.transparencySetting.blendingSetting.opacity = opacity;
    }
  }
  getDropShadow() {
    if (!this.transparencySetting) {
      return undefined;
    }
    if (!this.transparencySetting.dropShadowSetting) {
      return undefined;
    }
    return {
      mode: 'drop',
      xOffset: this.transparencySetting.dropShadowSetting.xOffset,
      yOffset: this.transparencySetting.dropShadowSetting.yOffset,
      size: this.transparencySetting.dropShadowSetting.size,
      effectColor: this.context.idml.getColorById(this.transparencySetting.dropShadowSetting.effectColorId)!,
      spread: this.transparencySetting.dropShadowSetting.spread,
    };
  }
  setDropShadow(dropShadow: DropShadowInput) {
    if (!this.transparencySetting) {
      this.transparencySetting = {};
    }
    this.transparencySetting.dropShadowSetting = {
      mode: 'drop',
      xOffset: dropShadow.xOffset,
      yOffset: dropShadow.yOffset,
      size: dropShadow.size,
      effectColorId: dropShadow.effectColor ? this.context.idml.assumeColor(dropShadow.effectColor).id : 'Color/Black',
      spread: dropShadow.spread,
    };
  }
  getVisible() {
    return this.visible;
  }
  setVisible(visible: boolean) {
    this.visible = visible;
  }

  // Get a transform object for a given origin
  getTransform(origin: [number, number]) {
    return normalizeTransformForGivenOrigin(this.itemTransform, this.parentSpread.pageRelatedTransformOrigin, origin);
  }
  // Set a transform object for a given origin
  setTranform(transform: Transform, origin: [number, number]) {
    this.itemTransform = normalizeTransformForGivenOrigin(transform, origin, this.parentSpread.pageRelatedTransformOrigin);
  }
  serializeTransparencySetting() {
    if (!this.transparencySetting) {
      return undefined;
    }
    return makeElementNode('TransparencySetting', {}, [
      ...(this.transparencySetting.blendingSetting
        ? [
            makeElementNode('BlendingSetting', {
              Opacity: this.transparencySetting.blendingSetting.opacity,
            }),
          ]
        : []),
      ...(this.transparencySetting.dropShadowSetting
        ? [
            makeElementNode('DropShadowSetting', {
              Mode: dropShadowSettingModeMap.getExternal(this.transparencySetting.dropShadowSetting.mode),
              XOffset: this.transparencySetting.dropShadowSetting.xOffset,
              YOffset: this.transparencySetting.dropShadowSetting.yOffset,
              Size: this.transparencySetting.dropShadowSetting.size,
              EffectColor: this.transparencySetting.dropShadowSetting.effectColorId,
              Spread: this.transparencySetting.dropShadowSetting.spread,
            }),
          ]
        : []),
    ]);
  }
  // Basic serialization of sprite
  serializeSprite() {
    console.log('SERIALIZE SPRITE', this.id, this.itemTransform, createIDMLTransform(this.itemTransform));

    return serializeElement(
      this.type,
      {
        Name: this.name,
        AppliedObjectStyle: this.appliedObjectStyleId,
        ItemTransform: this.itemTransform ? createIDMLTransform(this.itemTransform).join(' ') : undefined,
        StoryTitle: this.storyTitle,
        ContentType: this.contentType,
        Visible: this.visible,
        HorizontalLayoutConstraints: this.horizontalLayoutConstraints ? this.horizontalLayoutConstraints.map((v) => layoutDimensionMap.getExternal(v)).join(' ') : undefined,
        VerticalLayoutConstraints: this.verticalLayoutConstraints ? this.verticalLayoutConstraints.map((v) => layoutDimensionMap.getExternal(v)).join(' ') : undefined,
        FillColor: this.fillColorId,
        GradientStart: this.gradientStart?.join(' '),
        GradientFillLength: this.gradientFillLength,
        GradientFillAngle: this.gradientFillAngle,
        GradientStrokeStart: this.gradientStrokeStart?.join(' '),
        GradientStrokeLength: this.gradientStrokeLength,
        GradientStrokeAngle: this.gradientStrokeAngle,
        StrokeColor: this.strokeColorId,
        StrokeWeight: this.strokeWeight,
      },
      this.id,
      this.context.spreadPackageRoot,
      ['Properties'],
      [this.frameFittingOption ? serializeElement('FrameFittingOption', {}, this.frameFittingOption?.sourceElement, this.context.spreadPackageRoot, ['Properties']) : undefined, this.objectExportOption ? serializeElement('ObjectExportOption', {}, this.objectExportOption?.sourceElement, this.context.spreadPackageRoot, ['Properties']) : undefined, this.textWrapPreference ? serializeElement('TextWrapPreference', {}, this.textWrapPreference?.sourceElement, this.context.spreadPackageRoot, ['Properties']) : undefined, this.inCopyExportOption ? serializeElement('InCopyExportOption', {}, this.inCopyExportOption?.sourceElement, this.context.spreadPackageRoot, ['Properties']) : undefined, this.serializeTransparencySetting()].filter((v) => v !== undefined)
    );
  }

  static parseElementOptions(element: Element, context: IDMLSpreadPackageContext): SpriteOpts & { id: string } {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const id = props.Self;
    if (!id) {
      throw new Error('Sprite element must have a Self attribute');
    }
    const name = props.Name;
    const appliedObjectStyleId = props.AppliedObjectStyle;
    const itemTransform = parseIDMLTransform(props.ItemTransform);
    const storyTitle = props.StoryTitle;
    const contentType = props.ContentType;
    const visible = ensureBoolean(props.Visible, true);
    const horizontalLayoutConstraints = props.HorizontalLayoutConstraints ? (ensureEnumArray(props.HorizontalLayoutConstraints).map((v) => layoutDimensionMap.getInternal(v)) as HorizontalLayoutConstraints) : undefined;
    const verticalLayoutConstraints = props.VerticalLayoutConstraints ? (ensureEnumArray(props.VerticalLayoutConstraints).map((v) => layoutDimensionMap.getInternal(v)) as VerticalLayoutConstraints) : undefined;
    const fillColorId = props.FillColor;
    const gradientStart = ensureArray(props.GradientStart) as [number, number];
    const gradientFillLength = ensureNumber(props.GradientFillLength);
    const gradientFillAngle = ensureNumber(props.GradientFillAngle);
    const gradientStrokeStart = ensureArray(props.GradientStrokeStart) as [number, number];
    const gradientStrokeLength = ensureNumber(props.GradientStrokeLength);
    const gradientStrokeAngle = ensureNumber(props.GradientStrokeAngle);

    const strokeColorId = props.StrokeColor;
    const strokeWeight = ensureNumber(props.StrokeWeight);

    // TODO: Make a real implementation
    const frameFittingOptionElement = Spread.getDirectChildren(element, 'FrameFittingOption')[0] as Element | undefined;
    const frameFittingOption = frameFittingOptionElement
      ? {
          sourceElement: frameFittingOptionElement,
        }
      : undefined;

    // TODO: Make a real implementation
    const objectExportOptionElement = Spread.getDirectChildren(element, 'ObjectExportOption')[0] as Element | undefined;
    const objectExportOption = objectExportOptionElement
      ? {
          sourceElement: objectExportOptionElement,
        }
      : undefined;
    // TODO: Make a real implementation
    const textWrapPreferenceElement = Spread.getDirectChildren(element, 'TextWrapPreference')[0] as Element | undefined;
    const textWrapPreference = textWrapPreferenceElement
      ? {
          sourceElement: textWrapPreferenceElement,
        }
      : undefined;
    // TODO: Make a real implementation
    const inCopyExportOptionElement = Spread.getDirectChildren(element, 'InCopyExportOption')[0] as Element | undefined;
    const inCopyExportOption = inCopyExportOptionElement
      ? {
          sourceElement: inCopyExportOptionElement,
        }
      : undefined;

    const transparencySettingElement = Spread.getDirectChildren(element, 'TransparencySetting')[0] as Element | undefined;
    const transparencySetting = transparencySettingElement ? Sprite.parseTransparencySetting(transparencySettingElement) : undefined;

    return {
      id,
      name,
      appliedObjectStyleId,
      itemTransform,
      storyTitle,
      contentType,
      visible,
      horizontalLayoutConstraints,
      verticalLayoutConstraints,
      fillColorId,
      gradientStart,
      gradientFillLength,
      gradientFillAngle,
      gradientStrokeStart,
      gradientStrokeLength,
      gradientStrokeAngle,
      frameFittingOption,
      objectExportOption,
      textWrapPreference,
      inCopyExportOption,
      strokeColorId,
      strokeWeight,
      transparencySetting,
    };
  }
  static parseBlendingSetting(element: Element) {
    const opacity = ensureNumber(element.getAttribute('Opacity')) ?? 100;
    return {
      opacity,
    };
  }
  static parseDropShadowSetting(element: Element) {
    const mode = dropShadowSettingModeMap.getInternal(element.getAttribute('Mode')) ?? 'drop';
    const xOffset = ensureNumber(element.getAttribute('XOffset')) ?? 0;
    const yOffset = ensureNumber(element.getAttribute('YOffset')) ?? 0;
    const size = ensureNumber(element.getAttribute('Size')) ?? 0;
    const effectColorId = element.getAttribute('EffectColor') ?? 'Color/Black';
    const spread = ensureNumber(element.getAttribute('Spread')) ?? 0;

    return {
      mode,
      xOffset,
      yOffset,
      size,
      effectColorId,
      spread,
    };
  }
  static parseTransparencySetting(element: Element) {
    const blendingSettingElement = Spread.getDirectChildren(element, 'BlendingSetting')[0] as Element | undefined;
    const dropShadowSettingElement = Spread.getDirectChildren(element, 'DropShadowSetting')[0] as Element | undefined;
    const blendingSetting = blendingSettingElement ? Sprite.parseBlendingSetting(blendingSettingElement) : undefined;
    const dropShadowSetting = dropShadowSettingElement ? Sprite.parseDropShadowSetting(dropShadowSettingElement) : undefined;

    return {
      blendingSetting,
      dropShadowSetting,
    };
  }
}
