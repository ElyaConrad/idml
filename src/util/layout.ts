import { transform, identity, inverse, Matrix } from 'transformation-matrix';
import { TransformMatrix } from '../helpers.js';
import { Sprite } from '../controllers/sprites/Sprite.js';

/**
 * Shared geometry layer consumed by BOTH idml2svg (dev preview) and
 * idml2serial (Bluepic import). Both serializers are projections of the same
 * resolved layout — the transform math lives here once, not duplicated.
 */

/** Convert an IDML 6-tuple item transform into a transformation-matrix Matrix. */
export function itemTransform2Matrix(itemTransform?: TransformMatrix): Matrix {
  if (!itemTransform) {
    return identity();
  }
  const [a, b, c, d, e, f] = itemTransform;
  return transform({ a, b, c, d, e, f });
}

/**
 * The sprite's transform re-expressed in its parent page's coordinate frame —
 * identical to what idml2svg renders. A sprite's itemTransform is originated in
 * the page coordinate system (at 0,0), so we inverse the page matrix, apply the
 * sprite transform, then re-apply the page matrix.
 */
export function bakeSpriteMatrix(sprite: Sprite, pageMatrix: Matrix): Matrix {
  return transform(inverse(pageMatrix), itemTransform2Matrix(sprite.itemTransform), pageMatrix);
}

/** A 2D affine decomposed into the component form Bluepic's Transform uses. */
export type DecomposedTransform = {
  translateX: number;
  translateY: number;
  rotate: number; // degrees
  skewX: number; // degrees
  skewY: number; // degrees (always 0 — single-skew decomposition)
  scaleX: number;
  scaleY: number;
};

/**
 * Decompose a matrix into `T · R · skewX · S` — exactly the order
 * @bluepic/core composes an element transform (with transform-origin at 0,0).
 * Handles rotation, non-uniform scale, flips, and shear (folded into skewX).
 */
export function decomposeMatrix(m: Matrix): DecomposedTransform {
  const { a, b, c, d, e, f } = m;
  const rotateRad = Math.atan2(b, a);
  const scaleX = Math.hypot(a, b);
  const cos = Math.cos(rotateRad);
  const sin = Math.sin(rotateRad);
  // Strip the rotation from the second column to recover skew + scaleY.
  const cPrime = c * cos + d * sin;
  const dPrime = -c * sin + d * cos;
  const scaleY = dPrime;
  const skewXRad = dPrime !== 0 ? Math.atan2(cPrime, dPrime) : 0;
  const toDeg = 180 / Math.PI;
  return {
    translateX: e,
    translateY: f,
    rotate: rotateRad * toDeg,
    skewX: skewXRad * toDeg,
    skewY: 0,
    scaleX,
    scaleY,
  };
}
