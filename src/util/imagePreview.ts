// Preview sources for image assets — the browser-facing half of the hybrid image
// model. An IDML import needs every image asset's raw bytes (to upload, and to
// rasterize AI/EPS/PSD/PDF via bx-files), but for a good live preview we want the
// ones a browser CAN render wired straight into the serial, exactly like the
// fonts. This module turns bytes into a displayable preview URL; the converter
// injects that URL, and a persisting wizard later swaps it for a durable one.

import { ensureSvgIntrinsicSize } from './svgViewBox.js';

/**
 * MIME types a browser renders directly, so their bytes can become a preview src.
 * Everything else an IDML may place — TIFF, PSD (both arrive as graphicType
 * 'Image'), and the vector formats PDF/EPS/WMF — must be rasterized by bx-files
 * first, so it stays a placeholder in the serial and only rides the upload path.
 */
export const DISPLAYABLE_IMAGE_MIMES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml']);

export function isDisplayableImageMime(mime: string | undefined): boolean {
  return !!mime && DISPLAYABLE_IMAGE_MIMES.has(mime);
}

const isNode = typeof window === 'undefined';
// A placed full-res photo is pointless in the editor; cap the preview and let the
// real upload keep the original bytes. Matches the spirit of bx-studio's compress.
const PREVIEW_MAX_DIMENSION = 2048;
const PREVIEW_QUALITY = 0.85;

/**
 * A browser-displayable preview URL for image `bytes` of the given `mime`, or
 * `undefined` if the MIME isn't browser-renderable (caller keeps the placeholder).
 *
 * Browser: raster bytes are downscaled + recompressed with compressorjs (the same
 * knobs bx-studio uses — a real wizard re-compresses at upload, an accepted double)
 * into a blob URL; SVG passes through as a blob unchanged (rasterizing it would be
 * wrong). Node: no canvas, so a `data:` URL of the raw bytes (preview isn't the
 * point headless). Blob URLs are session-scoped — a persisting consumer must swap
 * them for durable URLs before saving the serial.
 */
export async function makeImagePreviewSrc(bytes: ArrayBuffer, mime: string): Promise<string | undefined> {
  if (!isDisplayableImageMime(mime)) return undefined;

  // SVG is text — never rasterize it. Pin its width/height to the viewBox first, so a browser
  // measures its intrinsic size AS the viewBox — that's the coordinate space a placed SVG's
  // crop is expressed in (see ensureSvgIntrinsicSize). Serve inline as-is in Node.
  if (mime === 'image/svg+xml') {
    const svg = ensureSvgIntrinsicSize(bytes);
    if (isNode) return `data:${mime};base64,${Buffer.from(svg).toString('base64')}`;
    return URL.createObjectURL(new Blob([svg as BlobPart], { type: mime }));
  }

  if (isNode) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const base64 = Buffer.from(bytes).toString('base64');
    return `data:${mime};base64,${base64}`;
  }

  try {
    // NOT @vite-ignore'd (unlike the node-only linkedom/sharp/skia imports):
    // compressorjs is a browser dependency the consumer's bundler SHOULD bundle, so
    // the dynamic import resolves at build time. This branch is browser-only (Node
    // returned above), so the import is never reached under Node.
    const { default: Compressor } = (await import('compressorjs')) as unknown as { default: new (file: Blob, opts: Record<string, unknown>) => void };
    const source = new Blob([bytes], { type: mime });
    const compressed = await new Promise<Blob>((resolve, reject) => {
      // eslint-disable-next-line no-new
      new Compressor(source, {
        quality: PREVIEW_QUALITY,
        maxWidth: PREVIEW_MAX_DIMENSION,
        maxHeight: PREVIEW_MAX_DIMENSION,
        mimeType: mime,
        // Preserve transparency: without this, compressorjs auto-converts PNGs over its
        // 5MB `convertSize` to JPEG and flattens alpha onto a white background. Only PNGs
        // are affected (`convertTypes`); downscaling to PREVIEW_MAX_DIMENSION still runs.
        convertSize: Infinity,
        success: (result: Blob) => resolve(result),
        error: (err: unknown) => reject(err),
      });
    });
    return URL.createObjectURL(compressed);
  } catch {
    // compressorjs missing or failed (e.g. a format it can't decode) — the raw
    // bytes still preview fine, just uncompressed.
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  }
}
