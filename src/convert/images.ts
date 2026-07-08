import type * as Template from '../serial/serial-types';
import { inverse, applyToPoint, Matrix } from 'transformation-matrix';
import { RectangleSprite } from '../controllers/sprites/Rectangle';
import { OvalSprite } from '../controllers/sprites/Oval';
import { PolygonSprite } from '../controllers/sprites/Polygon';
import { ImageSprite } from '../controllers/sprites/Image';
import { bakeSpriteMatrix, decomposeMatrix, DecomposedTransform } from '../util/layout';
import { arrayBufferToBase64 } from '../util/arrayBuffer';
import { isDisplayableImageMime } from '../util/imagePreview';
import { makeImage, makeMask, SerialImageValue } from '../serial/builders';
import { AssetCollector, ImageSrcResolver } from './assets';
import { surfaceOf } from './paint';
import { cornerRadii, cornersAreSimple, frameOutlineShape } from './shapes';

// ---- image ----------------------------------------------------------------

// Gray image-icon placeholder for linked images with no embedded source (same
// graphic the SVG preview uses).
const PLACEHOLDER_SVG = `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#EFF1F3"/><path fill-rule="evenodd" clip-rule="evenodd" d="M33.2503 38.4816C33.2603 37.0472 34.4199 35.8864 35.8543 35.875H83.1463C84.5848 35.875 85.7503 37.0431 85.7503 38.4816V80.5184C85.7403 81.9528 84.5807 83.1136 83.1463 83.125H35.8543C34.4158 83.1236 33.2503 81.957 33.2503 80.5184V38.4816ZM80.5006 41.1251H38.5006V77.8751L62.8921 53.4783C63.9172 52.4536 65.5788 52.4536 66.6039 53.4783L80.5006 67.4013V41.1251ZM43.75 51.6249C43.75 54.5244 46.1005 56.8749 49 56.8749C51.8995 56.8749 54.25 54.5244 54.25 51.6249C54.25 48.7254 51.8995 46.3749 49 46.3749C46.1005 46.3749 43.75 48.7254 43.75 51.6249Z" fill="#687787"/></svg>`;
const PLACEHOLDER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(PLACEHOLDER_SVG)}`;

async function imageDataUrl(image: ImageSprite, resolveImageSrc?: ImageSrcResolver): Promise<string | undefined> {
  // A converter-supplied preview (compressed blob for any displayable image,
  // embedded or wizard-provided) wins over the kernel's own bytes.
  const provided = resolveImageSrc?.({ imageId: image.getId(), linkURI: image.getLinkURI() });
  if (provided) return provided;

  // Embedded SVG: browser-renderable vector bytes. getRasterContents() returns
  // undefined for vector graphics, so read the raw contents explicitly.
  if (image.getGraphicType() === 'SVG') {
    const svg = image.getContents();
    if (svg) return `data:image/svg+xml;base64,${arrayBufferToBase64(svg)}`;
  }

  // Embedded raster — only when the browser can render the format. TIFF/PSD (also
  // graphicType 'Image') and the vector formats fall through to the placeholder,
  // and ride the upload + bx-files conversion path instead.
  const contents = image.getRasterContents();
  if (contents) {
    let mime = 'image/png';
    try {
      const type = await image.getImageType();
      if (type?.mime) mime = type.mime;
    } catch {
      /* keep default */
    }
    if (isDisplayableImageMime(mime)) return `data:${mime};base64,${arrayBufferToBase64(contents)}`;
  }

  return PLACEHOLDER_IMAGE; // linked with no supplied file, or non-displayable embedded
}

export function findImageChild(sprite: RectangleSprite | OvalSprite | PolygonSprite): ImageSprite | undefined {
  return sprite.getSprites().find((s): s is ImageSprite => s.type === 'Image');
}

export async function fullImageElement(image: ImageSprite, transform: DecomposedTransform, collector: AssetCollector): Promise<Template.Element | null> {
  const box = image.getBBox();
  if (!box) return null;
  const src = await imageDataUrl(image, collector.resolveImageSrc);
  if (!src) return null;
  await collector.addImage(image.getId(), image); // this element holds the image.src
  const value: SerialImageValue = { src, crop: null, cropMode: 'cover', innerAlign: 'center', mirrorX: false, mirrorY: false, innerRotate: 0 };
  return makeImage(image.getId(), box, [0, 0, 0, 0], value, transform, {});
}

/**
 * The Bluepic image value (src + source-pixel crop) for the region of `image`
 * visible through `frame`'s window. The crop maps the frame-window corners
 * frame-local -> image-content (via inverse of the image's placement, which is
 * relative to its frame since it's nested) -> source pixels. Both the image and
 * mask paths use this so they fit the FRAME box identically. A placeholder /
 * unknown-size image returns crop=null (cover the frame box).
 */
async function frameImageValue(frame: RectangleSprite | OvalSprite | PolygonSprite, image: ImageSprite, pageMatrix: Matrix, resolveImageSrc?: ImageSrcResolver): Promise<SerialImageValue | null> {
  const src = await imageDataUrl(image, resolveImageSrc);
  if (!src) return null;
  const base = { src, cropMode: 'cover' as const, innerAlign: 'center', mirrorX: false, mirrorY: false, innerRotate: 0 };

  // Natural pixel size: decode embedded bytes when we have them, else fall back to
  // the IDML metadata (GraphicBounds x ppi) so a LINKED image whose file the wizard
  // provided still gets the exact InDesign crop, not just a cover fit.
  let natural: { width: number; height: number };
  try {
    natural = await image.getNaturalSize();
  } catch {
    const metadata = image.getMetadataNaturalSize();
    if (!metadata) return { ...base, crop: null };
    natural = metadata;
  }

  const fb = frame.getGeometricBounds();
  const ib = image.getBBox();
  if (!ib || ib.width === 0 || ib.height === 0) return { ...base, crop: null };

  const frameToImage = inverse(bakeSpriteMatrix(image, pageMatrix));
  const corners = [
    { x: fb.x, y: fb.y },
    { x: fb.x + fb.width, y: fb.y },
    { x: fb.x + fb.width, y: fb.y + fb.height },
    { x: fb.x, y: fb.y + fb.height },
  ].map((c) => {
    const local = applyToPoint(frameToImage, c);
    return { x: ((local.x - ib.x) / ib.width) * natural.width, y: ((local.y - ib.y) / ib.height) * natural.height };
  });
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  // The crop is in `natural`-pixel space. Emit that reference size so a consumer that
  // downscales the asset (compress/rasterize) can rescale the crop by finalSize/natural —
  // the crop is really a placement RATIO, so the exact `natural` cancels and only needs to
  // be KNOWN. For a linked image at convert time this is the IDML metadata size.
  return { ...base, crop: { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }, naturalWidth: natural.width, naturalHeight: natural.height };
}

/**
 * Heuristic: a rectangular frame containing an axis-aligned image becomes a
 * Bluepic image element with per-corner radius + a source-pixel crop. Falls
 * back to a mask for rotated images / non-rounded corners (handled by caller).
 */
export async function imageFrameAsImage(frame: RectangleSprite, image: ImageSprite, pageMatrix: Matrix, transform: DecomposedTransform, collector: AssetCollector): Promise<Template.Element | null> {
  const imagePlacement = decomposeMatrix(bakeSpriteMatrix(image, pageMatrix));
  // Only the simple, representable case; otherwise let the caller use a mask.
  if (Math.abs(imagePlacement.rotate) > 0.5 || Math.abs(imagePlacement.skewX) > 0.5) return null;
  if (!cornersAreSimple(frame.getCornerOptions())) return null;

  const value = await frameImageValue(frame, image, pageMatrix, collector.resolveImageSrc);
  if (!value) return null;
  await collector.addImage(frame.getId(), image); // the frame IS the image element here
  const fb = frame.getBBox();
  return makeImage(frame.getId(), fb, cornerRadii(frame.getCornerOptions(), fb), value, transform, surfaceOf(frame));
}

/**
 * Mask fallback (oval / polygon / rotated frames): the frame outline clips the
 * image at its OWN placement (bbox + itemTransform), preserving IDML's intended
 * crop — the image is positioned against the mask shape, not refit to the frame.
 * The image's itemTransform is relative to the frame (nested), so its placement
 * is decompose(imageBaked) directly.
 */
export async function imageFrameAsMask(frame: RectangleSprite | OvalSprite | PolygonSprite, image: ImageSprite, pageMatrix: Matrix, transform: DecomposedTransform, collector: AssetCollector): Promise<Template.Element | null> {
  const imageEl = await fullImageElement(image, decomposeMatrix(bakeSpriteMatrix(image, pageMatrix)), collector);
  if (!imageEl) return null;
  const shape = frameOutlineShape(frame);
  if (!shape) return null;
  return makeMask(frame.getId(), [imageEl], [shape], transform, frame.getOpacity() / 100);
}
