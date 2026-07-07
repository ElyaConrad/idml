import { makeElementNode } from '../../util/xml.js';
import { createIDMLTransform, ensureArray, ensureBoolean, ensureEnumArray, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, parseIDMLTransform, serializeElement, normalizeTransformForGivenOrigin, TransformMatrix } from '../../helpers.js';
import { ColorInput, GeometricBounds, Transform } from '../../types/index.js';
import { KeyMap } from '../../util/keyMap.js';
import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { RectangleSprite } from './Rectangle.js';
import { OvalSprite } from './Oval.js';
import { PolygonSprite } from './Polygon.js';
import { GroupSprite } from './Group.js';
import { Color } from '../Color.js';
import { Gradient } from '../Gradient.js';
import { MergedObjectStyle, NONE_OBJECT_STYLE } from '../ObjectStyle.js';

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
  parentPageId?: string;
  appliedObjectStyleId?: string;
  itemTransform: TransformMatrix;
  storyTitle?: string;
  contentType?: string;
  visible?: boolean;
  horizontalLayoutConstraints?: HorizontalLayoutConstraints;
  verticalLayoutConstraints?: VerticalLayoutConstraints;
  fillColorId?: string;
  fillTint?: number;
  gradientStart?: [number, number];
  gradientFillLength?: number;
  gradientFillAngle?: number;
  gradientStrokeStart?: [number, number];
  gradientStrokeLength?: number;
  gradientStrokeAngle?: number;

  strokeColorId?: string;
  strokeTint?: number;
  strokeWeight?: number;
  strokeAlignment?: string; // raw IDML enum; mapped at getEffectiveStrokeAlignment

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

/** Bluepic stroke alignment (matches @bluepic/types StrokeAlignment). */
export type StrokeAlignment = 'inside' | 'center' | 'outside';
const strokeAlignmentMap = new KeyMap({
  CenterAlignment: 'center',
  InsideAlignment: 'inside',
  OutsideAlignment: 'outside',
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
  private parentPageId?: string;
  getParentPage() {
    if (!this.parentPageId) {
      return this.parentSpread.pages[0];
    }
    else {
      const page = this.parentSpread.pages.find(page => page.id === this.parentPageId);
      if (!page) {
        throw new Error(`Parent page with id ${this.parentPageId} not found`);
      }
      return page;
    }
  }
  private appliedObjectStyleId?: string;
  public itemTransform: TransformMatrix;
  private storyTitle?: string;
  private contentType?: string;
  private visible?: boolean;
  private horizontalLayoutConstraints?: HorizontalLayoutConstraints;
  private verticalLayoutConstraints?: VerticalLayoutConstraints;
  private fillColorId?: string;
  private fillTint?: number;
  private gradientStart?: [number, number];
  private gradientFillLength?: number;
  private gradientFillAngle?: number;
  private gradientStrokeStart?: [number, number];
  private gradientStrokeLength?: number;
  private gradientStrokeAngle?: number;

  private strokeColorId?: string;
  private strokeTint?: number;
  private strokeWeight?: number;
  private strokeAlignment?: string; // raw IDML enum

  private frameFittingOption?: FrameFittingOption;
  private objectExportOption?: ObjectExportOption;
  private textWrapPreference?: TextWrapPreference;
  private inCopyExportOption?: InCopyExportOption;

  private transparencySetting?: TransparencySetting;

  constructor(private id: string, public type: string, opts: SpriteOpts, public context: IDMLSpreadPackageContext) {
    this.name = opts.name;
    this.parentPageId = opts.parentPageId;
    this.appliedObjectStyleId = opts.appliedObjectStyleId;
    this.itemTransform = opts.itemTransform;
    this.storyTitle = opts.storyTitle;
    this.contentType = opts.contentType;
    this.visible = opts.visible;
    this.horizontalLayoutConstraints = opts.horizontalLayoutConstraints;
    this.verticalLayoutConstraints = opts.verticalLayoutConstraints;
    this.fillColorId = opts.fillColorId;
    this.fillTint = opts.fillTint;
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
    this.strokeTint = opts.strokeTint;
    this.strokeWeight = opts.strokeWeight;
    this.strokeAlignment = opts.strokeAlignment;

    this.transparencySetting = opts.transparencySetting;
  }
  getId() {
    return this.id;
  }
  // abstract serialize(): ElementNode;
  abstract getGeometricBounds(): GeometricBounds;
  // Return the parent spread
  get parentSpread() {
    const parentSpread = this.context.idml.getSpreads().find((spread) => spread.getAllSprites().includes(this));
    if (!parentSpread) {
      console.log('parentSpread', this);
      
      throw new Error('Parent spread not found');
    }
    return parentSpread;
  }
  getFillColor() {
    return this.fillColorId ? this.context.idml.getColorById(this.fillColorId) : undefined;
  }
  getFillGradient() {
    return this.fillColorId ? this.context.idml.getGradientById(this.fillColorId) : undefined;
  }
  getGradientFillAngle() {
    return this.gradientFillAngle;
  }
  isStrokeNone() {
    return this.strokeColorId !== undefined && this.strokeColorId.endsWith('/None');
  }
  getStrokeColor() {
    return this.strokeColorId ? this.context.idml.getColorById(this.strokeColorId) : undefined;
  }
  getDefaulStrokeColor() {
    return this.context.idml.getColorById('Color/Black');
  }
  getStrokeGradient() {
    return this.strokeColorId ? this.context.idml.getGradientById(this.strokeColorId) : undefined;
  }
  getStrokeWeight() {
    return this.strokeWeight;
  }
  /** The applied object style as a relation (Layer 1), resolved via the registry. */
  getAppliedObjectStyle() {
    return this.context.idml.getObjectStyleById(this.appliedObjectStyleId);
  }
  /**
   * Layer 2 — the effective surface style for this item: the applied object
   * style's resolved cascade, with this item's own local attributes overlaid
   * on top (local always wins). Every field is concrete, so consumers never
   * need to invent defaults like `?? 1` or `getColors()[0]`.
   *
   * Computed on demand (not cached) because sprites are mutable via the
   * setStrokeColor / setStrokeWeight / setFillColor setters.
   */
  getMergedStyle(): MergedObjectStyle {
    const base = this.getAppliedObjectStyle()?.getResolved() ?? NONE_OBJECT_STYLE;
    return {
      fillColorId: this.fillColorId ?? base.fillColorId,
      fillTint: this.fillTint ?? base.fillTint,
      strokeColorId: this.strokeColorId ?? base.strokeColorId,
      strokeWeight: this.strokeWeight ?? base.strokeWeight,
      strokeTint: this.strokeTint ?? base.strokeTint,
      strokeAlignment: this.strokeAlignment ?? base.strokeAlignment,
      gradientFillAngle: this.gradientFillAngle ?? base.gradientFillAngle,
      gradientStrokeAngle: this.gradientStrokeAngle ?? base.gradientStrokeAngle,
    };
  }
  private static isNonePaint(colorId?: string) {
    return !colorId || colorId.endsWith('/None');
  }
  private resolvePaint(colorId: string): Color | Gradient | undefined {
    if (Sprite.isNonePaint(colorId)) {
      return undefined;
    }
    return this.context.idml.getColorById(colorId) ?? this.context.idml.getGradientById(colorId);
  }
  /** Effective fill (color or gradient), or undefined for a `[None]` fill. */
  getEffectiveFill(): Color | Gradient | undefined {
    return this.resolvePaint(this.getMergedStyle().fillColorId);
  }
  /**
   * Effective stroke (color or gradient), or undefined when the stroke is
   * `[None]` OR the effective weight is 0 (no visible stroke either way).
   */
  getEffectiveStroke(): Color | Gradient | undefined {
    const merged = this.getMergedStyle();
    if (merged.strokeWeight <= 0) {
      return undefined;
    }
    return this.resolvePaint(merged.strokeColorId);
  }
  /** Effective stroke weight in points (always concrete; 0 means no stroke). */
  getEffectiveStrokeWeight(): number {
    return this.getMergedStyle().strokeWeight;
  }
  /**
   * Effective fill tint as a 0..100 percentage (100 = full color). IDML stores
   * `-1` / unset to mean "no tint"; both normalize to 100 here so consumers can
   * multiply unconditionally.
   */
  getEffectiveFillTint(): number {
    const t = this.getMergedStyle().fillTint;
    return t < 0 ? 100 : t;
  }
  /** Effective stroke tint as a 0..100 percentage (100 = full color). */
  getEffectiveStrokeTint(): number {
    const t = this.getMergedStyle().strokeTint;
    return t < 0 ? 100 : t;
  }
  /**
   * Effective stroke alignment as the Bluepic value. Resolved through the full
   * cascade (local StrokeAlignment over the applied object style's, down to the
   * `[None]` default of CenterAlignment), then mapped to 'inside'|'center'|'outside'.
   */
  getEffectiveStrokeAlignment(): StrokeAlignment {
    return strokeAlignmentMap.getInternal(this.getMergedStyle().strokeAlignment) as StrokeAlignment;
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
    return this.parentSpread.cssifyTransformMatrix(this.itemTransform, origin);
  }
  // Set a transform object for a given origin
  setTranform(transform: Transform, origin: [number, number]) {
    this.itemTransform = this.parentSpread.matrixifyCSSTransform(transform, origin);
  }
  setTransformFromMatrix(matrix: TransformMatrix) {
    this.itemTransform = matrix;
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
  /** The XML tag to serialize as. Defaults to `type`; overridden by placed
   * graphics (PDF/EPS/WMF) parsed as ImageSprite to round-trip their real tag. */
  protected serializeTagName(): string {
    return this.type;
  }
  serializeSprite() {
    console.log('SERIALIZE SPRITE', this.id, this.itemTransform);

    return serializeElement(
      this.serializeTagName(),
      {
        Name: this.name,
        AppliedObjectStyle: this.appliedObjectStyleId,
        ItemTransform: this.itemTransform ? this.itemTransform.join(' ') : undefined,
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
    const parentPageId = props.ParentPage;
    const appliedObjectStyleId = props.AppliedObjectStyle;
    const itemTransform = parseIDMLTransform(props.ItemTransform);
    const storyTitle = props.StoryTitle;
    const contentType = props.ContentType;
    const visible = ensureBoolean(props.Visible, true);
    const horizontalLayoutConstraints = props.HorizontalLayoutConstraints ? (ensureEnumArray(props.HorizontalLayoutConstraints).map((v) => layoutDimensionMap.getInternal(v)) as HorizontalLayoutConstraints) : undefined;
    const verticalLayoutConstraints = props.VerticalLayoutConstraints ? (ensureEnumArray(props.VerticalLayoutConstraints).map((v) => layoutDimensionMap.getInternal(v)) as VerticalLayoutConstraints) : undefined;
    const fillColorId = props.FillColor;
    const fillTint = ensureNumber(props.FillTint);
    const gradientStart = ensureArray(props.GradientStart) as [number, number];
    const gradientFillLength = ensureNumber(props.GradientFillLength);
    const gradientFillAngle = ensureNumber(props.GradientFillAngle);
    const gradientStrokeStart = ensureArray(props.GradientStrokeStart) as [number, number];
    const gradientStrokeLength = ensureNumber(props.GradientStrokeLength);
    const gradientStrokeAngle = ensureNumber(props.GradientStrokeAngle);

    const strokeColorId = props.StrokeColor;
    const strokeTint = ensureNumber(props.StrokeTint);
    const strokeAlignment = props.StrokeAlignment; // raw IDML enum, merged & mapped later
    const strokeWeight = ensureNumber(props.StrokeWeight);

    if (element.getAttribute('Self') === 'u16e') {
      console.log('strokeWeight', strokeWeight);
    }

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
      parentPageId,
      appliedObjectStyleId,
      itemTransform,
      storyTitle,
      contentType,
      visible,
      horizontalLayoutConstraints,
      verticalLayoutConstraints,
      fillColorId,
      fillTint,
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
      strokeTint,
      strokeWeight,
      strokeAlignment,
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
