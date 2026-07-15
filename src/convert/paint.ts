import type * as Template from '../serial/serial-types';
import { Color } from '../controllers/Color';
import { Gradient } from '../controllers/Gradient';
import { ColorInput } from '../types/index';
import { Sprite } from '../controllers/sprites/Sprite';
import { Paint, SurfaceInput, DropShadowValue } from '../serial/builders';
import { cmykToSrgb } from './color/ColorManager.js';

// ---- color -----------------------------------------------------------------

export function channelHex(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}
export function rgbToHex(red: number, green: number, blue: number, alpha = 255): string {
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}${channelHex(alpha)}`;
}
/**
 * Apply an IDML tint (0..100 percentage; 100 = full color) to an RGB channel by
 * mixing toward paper-white, matching InDesign's on-screen tint: a 10% Black
 * becomes a light grey, 0% becomes white.
 */
export function applyTintChannel(channel: number, tint: number): number {
  return 255 - (255 - channel) * (tint / 100);
}
export function colorToHex(color: Color, tint = 100): string {
  // Delegates to colorInputToHex so BOTH rgb and cmyk swatches go through the one
  // colour-managed path below (color.getRBG()'s cmyk branch uses the old uncalibrated
  // formula and is left as-is for idml2svg, the only other caller).
  return colorInputToHex(color.toColorInput(), tint) ?? '#000000ff';
}
export function colorInputToHex(ci: ColorInput | undefined, tint = 100): string | undefined {
  if (!ci) return undefined;
  const t = (c: number) => applyTintChannel(c, tint); // tint mixes toward paper-white
  if (ci.type === 'rgb') return rgbToHex(t(ci.red), t(ci.green), t(ci.blue));
  // CMYK -> sRGB via the SWOP-profile LUT (see ColorManager) — colour-managed, matches
  // InDesign's actual on-screen/export conversion (not the old device-formula approximation).
  const [r, g, b] = cmykToSrgb(ci.cyan, ci.magenta, ci.yellow, ci.black);
  return rgbToHex(t(r), t(g), t(b));
}
export function gradientToSerial(gradient: Gradient, fillAngleDeg: number, tint = 100): Template.Elements.Gradient {
  // Bluepic ColorStop.position is a 0..100 percentage (core renders `${position}%`).
  // IDML stop Location is already 0..100 — do NOT divide.
  const stops = gradient
    .getColorStops()
    .filter((s) => s.color)
    .map((s) => ({ color: colorToHex(s.color!, tint), position: s.position }));
  if (gradient.getType() === 'radial') {
    return { type: 'radial', x1: 0.5, y1: 0.5, radius1: 0, x2: 0.5, y2: 0.5, radius2: 0.5, stops };
  }
  // The IDML gradient direction comes from the SPRITE's GradientFillAngle (θ),
  // whose direction is (cosθ, -sinθ) (see idml2svg/util/fill). Bluepic renders a
  // CSS `${angle}deg` whose direction is (sinφ, -cosφ), so φ = 90 - θ.
  return { type: 'linear', angle: 90 - fillAngleDeg, stops };
}
export function paintFrom(value: Color | Gradient | undefined, gradientAngleDeg = 0, tint = 100): Paint {
  if (!value) return null;
  return value instanceof Color ? colorToHex(value, tint) : gradientToSerial(value, gradientAngleDeg, tint);
}
export function surfaceOf(sprite: Sprite): SurfaceInput {
  return {
    fill: paintFrom(sprite.getEffectiveFill(), sprite.getGradientFillAngle() ?? 0, sprite.getEffectiveFillTint()),
    stroke: paintFrom(sprite.getEffectiveStroke(), 0, sprite.getEffectiveStrokeTint()),
    strokeWidth: sprite.getEffectiveStrokeWeight(),
    strokeAlignment: sprite.getEffectiveStrokeAlignment(),
    opacity: sprite.getOpacity() / 100,
  };
}

/**
 * Translate an InDesign drop shadow into the Bluepic `filter.dropShadow` value,
 * or null when the sprite has none. InDesign stores the offset (XOffset/YOffset)
 * and blur (Size) in the object's LOCAL, unscaled units; the serial applies them
 * in the element's local space and then scales/rotates by the element transform
 * — exactly how InDesign scales an effect with its object — so we pass them
 * through without compensation. The renderer wants a polar offset
 * (dx = sin(rot)·dist, dy = cos(rot)·dist), so cartesian -> (rotation°, distance).
 */
export function dropShadowValue(sprite: Sprite): DropShadowValue | null {
  const ds = sprite.getDropShadow();
  if (!ds) return null;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    rotation: round(Math.atan2(ds.xOffset, ds.yOffset) * (180 / Math.PI)),
    distance: round(Math.hypot(ds.xOffset, ds.yOffset)),
    color: ds.effectColor ? colorToHex(ds.effectColor) : '#000000',
    opacity: round((ds.opacity ?? 100) / 100),
    blur: round(ds.size),
    quality: 3, // InDesign's default shadow quality; not represented in IDML
  };
}
