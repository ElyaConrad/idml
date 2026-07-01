import { ElementNode, makeElementNode, makeTextNode, nodeToNode } from 'flat-svg';
import { ensureNumber, flattenIDMLProperties, getIDMLElementProperties } from '../helpers.js';
import { ColorInput } from '../types/index.js';
import { IDMLStylesContext } from './Styles.js';

/**
 * The fully-resolved, derived view of an object style's surface properties.
 *
 * This is Layer 2: it is COMPUTED by walking the `BasedOn` chain down to the
 * `[None]` root. It is never stored on the `ObjectStyle` instances themselves —
 * those stay faithful to the XML. Every field here is concrete because `[None]`
 * always supplies a base value (and we fall back to InDesign's documented
 * `[None]` defaults if the chain can't be resolved at all).
 */
export type MergedObjectStyle = {
  fillColorId: string;
  fillTint: number;
  strokeColorId: string;
  strokeWeight: number;
  strokeTint: number;
  strokeAlignment: string; // raw IDML enum (CenterAlignment|InsideAlignment|OutsideAlignment)
  gradientFillAngle?: number;
  gradientStrokeAngle?: number;
};

/**
 * InDesign's built-in `[None]` object style defaults. Used as the resolution
 * floor so a `MergedObjectStyle` is always concrete, even for malformed files
 * that lack a `[None]` style or reference a missing object style.
 */
export const NONE_OBJECT_STYLE: MergedObjectStyle = {
  fillColorId: 'Swatch/None',
  fillTint: -1,
  strokeColorId: 'Swatch/None',
  strokeWeight: 0,
  strokeTint: -1,
  strokeAlignment: 'CenterAlignment', // InDesign's default stroke alignment
  gradientFillAngle: undefined,
  gradientStrokeAngle: undefined,
};

/**
 * Layer 1 — a faithful mirror of a single `<ObjectStyle>` element.
 *
 * It exposes ONLY what the element literally carries: its own attributes
 * (`undefined` when an attribute is genuinely absent) and `BasedOn` as a
 * *relation* (a reference id, resolved on demand via the IDML registry — the
 * same idiom as `getStrokeColor()` → `getColorById()`). It does NOT fold in
 * the parent's properties; that flattening is the derived `getResolved()` view.
 *
 * Read-only by design: object styles are intentionally NOT registered in
 * `IDMLStylesController.elementsImplemented`, so serialization passes the
 * original `RootObjectStyleGroup` through untouched. This whole class is pure
 * abstraction on top of the preserved original structure.
 */
export class ObjectStyle {
  public name?: string;
  public fillColorId?: string;
  public fillTint?: number;
  public strokeColorId?: string;
  public strokeWeight?: number;
  public strokeTint?: number;
  public strokeAlignment?: string;
  public gradientFillAngle?: number;
  public gradientStrokeAngle?: number;
  public appliedParagraphStyleId?: string;

  // The BasedOn relation, stored as a raw reference id (resolved via getBasedOn()).
  private basedOnId?: string;

  /**
   * The original `<ObjectStyle>` DOM node, when parsed from a file. It is the
   * single faithful source for serialization: object styles carry ~15 kinds of
   * nested children (TransformAttributeOption, ObjectExportOption, effects
   * categories, …) that a property-only rebuild would silently drop, so we
   * NEVER rebuild from typed fields — we patch this node in place on edit and
   * round-trip it untouched. The typed fields above are a parsed read view kept
   * in sync by the setters.
   */
  private sourceElement?: Element;

  constructor(
    public id: string,
    opts: {
      name?: string;
      fillColorId?: string;
      fillTint?: number;
      strokeColorId?: string;
      strokeWeight?: number;
      strokeTint?: number;
      strokeAlignment?: string;
      gradientFillAngle?: number;
      gradientStrokeAngle?: number;
      appliedParagraphStyleId?: string;
      basedOnId?: string;
      sourceElement?: Element;
    },
    private context: IDMLStylesContext
  ) {
    this.name = opts.name;
    this.fillColorId = opts.fillColorId;
    this.fillTint = opts.fillTint;
    this.strokeColorId = opts.strokeColorId;
    this.strokeWeight = opts.strokeWeight;
    this.strokeTint = opts.strokeTint;
    this.strokeAlignment = opts.strokeAlignment;
    this.gradientFillAngle = opts.gradientFillAngle;
    this.gradientStrokeAngle = opts.gradientStrokeAngle;
    this.appliedParagraphStyleId = opts.appliedParagraphStyleId;
    this.basedOnId = opts.basedOnId;
    this.sourceElement = opts.sourceElement;
  }

  /** The original `<ObjectStyle>` DOM node (faithful structure), if parsed from a file. */
  getSourceElement(): Element | undefined {
    return this.sourceElement;
  }

  /** The parent object style this one is based on, resolved as a relation. */
  getBasedOn(): ObjectStyle | undefined {
    return this.basedOnId ? this.context.idml.getObjectStyleById(this.basedOnId) : undefined;
  }

  /**
   * The inheritance chain, most-specific first: [self, parent, ..., [None]].
   * Guards against cycles (malformed files can self-reference).
   */
  getChain(): ObjectStyle[] {
    const chain: ObjectStyle[] = [];
    const visited = new Set<string>();
    let current: ObjectStyle | undefined = this;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.push(current);
      current = current.getBasedOn();
    }
    return chain;
  }

  /**
   * Layer 2 — flatten the BasedOn chain into a concrete surface style.
   * First-defined-wins scanning from the most specific style; the `[None]`
   * defaults fill any property no style in the chain defined.
   */
  getResolved(): MergedObjectStyle {
    const chain = this.getChain();
    const pick = <T>(get: (style: ObjectStyle) => T | undefined): T | undefined => {
      for (const style of chain) {
        const value = get(style);
        if (value !== undefined) {
          return value;
        }
      }
      return undefined;
    };
    return {
      fillColorId: pick((s) => s.fillColorId) ?? NONE_OBJECT_STYLE.fillColorId,
      fillTint: pick((s) => s.fillTint) ?? NONE_OBJECT_STYLE.fillTint,
      strokeColorId: pick((s) => s.strokeColorId) ?? NONE_OBJECT_STYLE.strokeColorId,
      strokeWeight: pick((s) => s.strokeWeight) ?? NONE_OBJECT_STYLE.strokeWeight,
      strokeTint: pick((s) => s.strokeTint) ?? NONE_OBJECT_STYLE.strokeTint,
      strokeAlignment: pick((s) => s.strokeAlignment) ?? NONE_OBJECT_STYLE.strokeAlignment,
      gradientFillAngle: pick((s) => s.gradientFillAngle),
      gradientStrokeAngle: pick((s) => s.gradientStrokeAngle),
    };
  }

  // ---- Editing -----------------------------------------------------------
  // Each setter updates the typed read view AND patches the source DOM node so
  // serialization (which round-trips the untouched node) reflects the change.
  // Pass `undefined` to clear an attribute and let the property inherit from
  // the BasedOn chain again.

  private patchAttribute(name: string, value: string | number | undefined) {
    if (value === undefined) {
      this.sourceElement?.removeAttribute(name);
    } else {
      this.sourceElement?.setAttribute(name, String(value));
    }
  }
  setName(name: string) {
    this.name = name;
    this.patchAttribute('Name', name);
  }
  setFillColorId(id?: string) {
    this.fillColorId = id;
    this.patchAttribute('FillColor', id);
  }
  setFillColor(color: ColorInput) {
    this.setFillColorId(this.context.idml.assumeColor(color).id);
  }
  setFillTint(tint?: number) {
    this.fillTint = tint;
    this.patchAttribute('FillTint', tint);
  }
  setStrokeColorId(id?: string) {
    this.strokeColorId = id;
    this.patchAttribute('StrokeColor', id);
  }
  setStrokeColor(color: ColorInput) {
    this.setStrokeColorId(this.context.idml.assumeColor(color).id);
  }
  setStrokeWeight(weight?: number) {
    this.strokeWeight = weight;
    this.patchAttribute('StrokeWeight', weight);
  }
  setStrokeTint(tint?: number) {
    this.strokeTint = tint;
    this.patchAttribute('StrokeTint', tint);
  }
  setStrokeAlignment(alignment?: string) {
    this.strokeAlignment = alignment;
    this.patchAttribute('StrokeAlignment', alignment);
  }
  setGradientFillAngle(angle?: number) {
    this.gradientFillAngle = angle;
    this.patchAttribute('GradientFillAngle', angle);
  }
  setGradientStrokeAngle(angle?: number) {
    this.gradientStrokeAngle = angle;
    this.patchAttribute('GradientStrokeAngle', angle);
  }
  /**
   * Re-parent this style in the cascade. `BasedOn` lives in a nested
   * `<Properties><BasedOn>` element, so we patch there (creating the nodes if
   * absent). Pass `undefined` to detach (the chain then terminates here).
   */
  setBasedOnId(id?: string) {
    this.basedOnId = id;
    const el = this.sourceElement;
    if (!el) {
      return;
    }
    const doc = el.ownerDocument;
    let properties = Array.from(el.children).find((child) => child.tagName === 'Properties');
    let basedOn = properties ? Array.from(properties.children).find((child) => child.tagName === 'BasedOn') : undefined;
    if (id === undefined) {
      basedOn?.remove();
      return;
    }
    if (!properties) {
      properties = doc.createElement('Properties');
      el.insertBefore(properties, el.firstChild);
    }
    if (!basedOn) {
      basedOn = doc.createElement('BasedOn');
      basedOn.setAttribute('type', 'object');
      properties.appendChild(basedOn);
    }
    basedOn.textContent = id;
  }

  /**
   * Faithful serialization: clone the original node so every nested child is
   * preserved exactly. (The controller round-trips object styles via the live
   * tree; this is exposed for completeness and for copying styles.) Styles
   * created from scratch with no source node fall back to a minimal element.
   */
  serialize(): ElementNode {
    if (this.sourceElement) {
      return nodeToNode(this.sourceElement) as ElementNode;
    }
    return makeElementNode(
      'ObjectStyle',
      {
        Self: this.id,
        Name: this.name,
        FillColor: this.fillColorId,
        FillTint: this.fillTint,
        StrokeColor: this.strokeColorId,
        StrokeWeight: this.strokeWeight,
        StrokeTint: this.strokeTint,
        StrokeAlignment: this.strokeAlignment,
        GradientFillAngle: this.gradientFillAngle,
        GradientStrokeAngle: this.gradientStrokeAngle,
        AppliedParagraphStyle: this.appliedParagraphStyleId,
      },
      this.basedOnId ? [makeElementNode('Properties', {}, [makeElementNode('BasedOn', { type: 'object' }, [makeTextNode(this.basedOnId)])])] : []
    );
  }

  static parseElement(element: Element, context: IDMLStylesContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const id = props.Self;
    if (!id) {
      throw new Error('ObjectStyle element must have a Self attribute');
    }

    return new ObjectStyle(
      id,
      {
        name: props.Name,
        fillColorId: props.FillColor,
        fillTint: ensureNumber(props.FillTint),
        strokeColorId: props.StrokeColor,
        strokeWeight: ensureNumber(props.StrokeWeight),
        strokeTint: ensureNumber(props.StrokeTint),
        strokeAlignment: props.StrokeAlignment,
        gradientFillAngle: ensureNumber(props.GradientFillAngle),
        gradientStrokeAngle: ensureNumber(props.GradientStrokeAngle),
        appliedParagraphStyleId: props.AppliedParagraphStyle,
        // BasedOn is a nested <Properties><BasedOn> element; its value is an
        // id like "$ID/[None]" which getObjectStyleById() normalizes.
        basedOnId: props.BasedOn,
        sourceElement: element,
      },
      context
    );
  }
}
