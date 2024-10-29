import {
  createIDMLTransform,
  ensureArray,
  ensureBoolean,
  ensureEnumArray,
  ensureNumber,
  flattenIDMLProperties,
  getIDMLElementProperties,
  parseIDMLTransform,
  serializeElement,
  Transform,
} from '../../helpers.js';
import { KeyMap } from '../../util/keyMap.js';
import { ElementNode } from '../../util/xml.js';
import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';

export type SpriteOpts = {
  name?: string;
  appliedObjectStyleId?: string;
  itemTransform?: Transform;
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
};

export type LayoutDimension = 'fixedDimension' | 'flexibleDimension';
export type HorizontalLayoutConstraints = [LayoutDimension, LayoutDimension, LayoutDimension];
export type VerticalLayoutConstraints = [LayoutDimension, LayoutDimension, LayoutDimension];

const layoutDimensionMap = new KeyMap({
  FixedDimension: 'fixedDimension',
  FlexibleDimension: 'flexibleDimension',
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
  private itemTransform?: Transform;
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
  }
  abstract serialize(): ElementNode;
  serializeSprite() {
    return serializeElement(
      this.type,
      {
        Name: this.name,
        AppliedObjectStyle: this.appliedObjectStyleId,
        ItemTransform: this.itemTransform ? createIDMLTransform(this.itemTransform).join(' ') : undefined,
        StoryTitle: this.storyTitle,
        ContentType: this.contentType,
        Visible: this.visible,
        HorizontalLayoutConstraints: this.horizontalLayoutConstraints
          ? this.horizontalLayoutConstraints.map((v) => layoutDimensionMap.getExternal(v)).join(' ')
          : undefined,
        VerticalLayoutConstraints: this.verticalLayoutConstraints
          ? this.verticalLayoutConstraints.map((v) => layoutDimensionMap.getExternal(v)).join(' ')
          : undefined,
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
      [
        this.frameFittingOption
          ? serializeElement('FrameFittingOption', {}, this.frameFittingOption?.sourceElement, this.context.spreadPackageRoot, [
              'Properties',
            ])
          : undefined,
        this.objectExportOption
          ? serializeElement('ObjectExportOption', {}, this.objectExportOption?.sourceElement, this.context.spreadPackageRoot, [
              'Properties',
            ])
          : undefined,
        this.textWrapPreference
          ? serializeElement('TextWrapPreference', {}, this.textWrapPreference?.sourceElement, this.context.spreadPackageRoot, [
              'Properties',
            ])
          : undefined,
        this.inCopyExportOption
          ? serializeElement('InCopyExportOption', {}, this.inCopyExportOption?.sourceElement, this.context.spreadPackageRoot, [
              'Properties',
            ])
          : undefined,
      ].filter((v) => v !== undefined)
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
    const horizontalLayoutConstraints = props.HorizontalLayoutConstraints
      ? (ensureEnumArray(props.HorizontalLayoutConstraints).map((v) =>
          layoutDimensionMap.getInternal(v)
        ) as HorizontalLayoutConstraints)
      : undefined;
    const verticalLayoutConstraints = props.VerticalLayoutConstraints
      ? (ensureEnumArray(props.VerticalLayoutConstraints).map((v) =>
          layoutDimensionMap.getInternal(v)
        ) as VerticalLayoutConstraints)
      : undefined;
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
    };
  }
}
