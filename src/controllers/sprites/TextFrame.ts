import { ensureNumber, flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../../helpers.js';
import { KeyMap } from '../../util/keyMap.js';
import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts } from './GeometricSprite.js';
import { RectangleSprite, CornerOptions, parseCornerOptions } from './Rectangle.js';
import { Sprite, SpriteOpts } from './Sprite.js';

/** Vertical text alignment within a frame (InDesign `VerticalJustification`). */
export type VerticalJustification = 'top' | 'center' | 'bottom' | 'justify';
// TopAlign first → the KeyMap default (InDesign's default when the attribute is absent).
const verticalJustificationMap = new KeyMap({
  TopAlign: 'top',
  CenterAlign: 'center',
  BottomAlign: 'bottom',
  JustifyAlign: 'justify',
} as const);

/**
 * Parsed `<TextFramePreference>` — the frame-level text layout settings, read
 * abstractly (typed fields) rather than by poking the raw XML at call sites. Only
 * the fields the converter consumes are modeled; `sourceElement` is retained so
 * {@link TextFrame.serialize} round-trips the attributes we don't model.
 */
export type TextFramePreference = {
  /** Vertical text alignment (default `'top'`). */
  verticalJustification: VerticalJustification;
  /** First-baseline offset mode, e.g. `'Ascent'`/`'AscentOffset'` (informational). */
  firstBaselineOffset?: string;
  /** Minimum first-baseline offset in pt. */
  minimumFirstBaselineOffset?: number;
  /** The raw element, kept so serialize preserves unmodeled attributes. */
  sourceElement: Element;
};

export class TextFrame extends GeometricSprite {
  textFramePreference?: TextFramePreference;
  private cornerOptions?: CornerOptions;
  constructor(
    id: string,
    private parentStoryId: string,
    opts: GeometricSpriteOpts & {
      textFramePreference?: TextFramePreference;
      cornerOptions?: CornerOptions;
    },
    context: IDMLSpreadPackageContext
  ) {
    super(id, 'TextFrame', opts, context);
    this.textFramePreference = opts.textFramePreference;
    this.cornerOptions = opts.cornerOptions;
  }
  /** Per-corner options — a text frame is a rectangular graphic frame too. */
  getCornerOptions() {
    return this.cornerOptions;
  }
  getDefaultFillColor() {
    return this.context.idml.getColorById('Color/Black');
  }
  getBBox() {
    return this.getGeometricBounds();
  }
  setBBox(x: number, y: number, width: number, height: number) {
    const path = [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ] as [number, number][];
    this.setPaths([{ open: false, pathPoints: path.map((point) => ({ anchor: point, leftDirection: point, rightDirection: point })) }]);
  }
  getStory() {
    return this.context.idml.getStoryById(this.parentStoryId);
  }
  /**
   * The frame's vertical text alignment as a 0..1 fraction (0 top, 0.5 center,
   * 1 bottom). Defaults to top. `justify` (distribute lines) has no core equivalent
   * for the anchor → treated as top (see {@link isVerticalJustify}).
   */
  getVerticalAlign(): number {
    switch (this.textFramePreference?.verticalJustification) {
      case 'center':
        return 0.5;
      case 'bottom':
        return 1;
      default:
        return 0;
    }
  }
  /**
   * `VerticalJustification="JustifyAlign"` — InDesign distributes the lines to fill
   * the frame height (equal gaps, first line at top, last at bottom). Core has no
   * such mode, so the converter reproduces it by WIDENING the line advance (see
   * idml2serial). Rendered top-anchored (getVerticalAlign stays 0).
   */
  isVerticalJustify(): boolean {
    return this.textFramePreference?.verticalJustification === 'justify';
  }

  serialize() {
    const baseElement = this.serializeGeometricSprite();
    baseElement.attributes = {
      ...baseElement.attributes,
      ParentStory: this.parentStoryId,
    };

    if (this.textFramePreference) {
      // Write the modeled fields back (so programmatic changes persist); all other
      // attributes ride through from the retained sourceElement.
      baseElement.children?.push(
        serializeElement(
          'TextFramePreference',
          {
            VerticalJustification: verticalJustificationMap.getExternal(this.textFramePreference.verticalJustification),
            FirstBaselineOffset: this.textFramePreference.firstBaselineOffset,
            MinimumFirstBaselineOffset: this.textFramePreference.minimumFirstBaselineOffset,
          },
          this.textFramePreference.sourceElement,
          this.context.spreadPackageRoot,
          ['Properties']
        )
      );
    }
    return baseElement;
  }
  /** Parse a `<TextFramePreference>` element into its typed representation. */
  static parseTextFramePreference(element: Element): TextFramePreference {
    return {
      verticalJustification: verticalJustificationMap.getInternal(element.getAttribute('VerticalJustification')),
      firstBaselineOffset: element.getAttribute('FirstBaselineOffset') ?? undefined,
      minimumFirstBaselineOffset: ensureNumber(element.getAttribute('MinimumFirstBaselineOffset')) ?? undefined,
      sourceElement: element,
    };
  }

  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const { id, ...opts } = Sprite.parseElementOptions(element, context);

    const {
      ParentStory: parentStoryId,
      PreviousTextFrame: previousTextFrame,
      NextTextFrame: nextTextFrame,
      ContentType: contentType,
      OverriddenPageItemProps: overriddenPageItemProps,
    } = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    if (parentStoryId === undefined) {
      throw new Error('ParentStory not found');
    }

    const pathGeometry = GeometricSprite.parsePathGeometry(element);

    const textFramePreferenceElement = Spread.getDirectChildren(element, 'TextFramePreference')[0];
    const textFramePreference = textFramePreferenceElement ? TextFrame.parseTextFramePreference(textFramePreferenceElement) : undefined;

    return new TextFrame(
      id,
      parentStoryId,
      {
        ...opts,
        pathGeometry,
        textFramePreference,
        cornerOptions: parseCornerOptions(element),
      },
      context
    );
  }
}
