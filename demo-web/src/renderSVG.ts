// import png from 'pngjs';
// import { cropImage, getVisibleBBox } from './util/png';
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const [metadata, data] = dataUrl.split(',');

  if (!metadata || !data) {
    throw new Error('invalid data url');
  }
  const binaryString = atob(data);

  const buffer = new ArrayBuffer(binaryString.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binaryString.length; i++) {
    view[i] = binaryString.charCodeAt(i);
  }

  return buffer;
}

export function renderSVG(svg: SVGElement) {
  const viewBox = svg
    .getAttribute('viewBox')
    ?.split(' ')
    .map((v) => parseFloat(v)) ?? [0, 0, 100, 100];

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '-1000%';
    canvas.style.left = '-1000%';

    document.body.appendChild(canvas);
    canvas.width = viewBox[2];
    canvas.height = viewBox[3];

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return reject(new Error('Failed to get 2d context'));
    }

    const svgString = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.src = `data:image/svg+xml;base64,${btoa(svgString)}`;
    image.addEventListener('load', () => {
      ctx.drawImage(image, 0, 0);
      const buffer = dataUrlToArrayBuffer(canvas.toDataURL('image/png'));
      document.body.removeChild(canvas);
      resolve(buffer);
    });
  });
}
type ColorMatrix = number[];
function applyColorMatrixToColor({ r, g, b, a }: { r: number; g: number; b: number; a: number }, matrix: ColorMatrix): { r: number; g: number; b: number; a: number } {
  const newR = matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4] * 255;
  const newG = matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9] * 255;
  const newB = matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14] * 255;
  const newA = matrix[15] * r + matrix[16] * g + matrix[17] * b + matrix[18] * a + matrix[19] * 255;

  return {
    r: Math.min(255, Math.max(0, Math.round(newR))),
    g: Math.min(255, Math.max(0, Math.round(newG))),
    b: Math.min(255, Math.max(0, Math.round(newB))),
    a: Math.min(255, Math.max(0, Math.round(newA))),
  };
}

export async function applyColorMatricesToImage(imageData: ArrayBuffer, matrices: ColorMatrix[]): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([imageData], { type: 'image/png' });
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    img.addEventListener('load', () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('Canvas-Kontext konnte nicht erstellt werden.');
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const { data, width, height } = imageData;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          for (const matrix of matrices) {
            const [r, g, b, a] = [data[index], data[index + 1], data[index + 2], data[index + 3]];

            const { r: newR, g: newG, b: newB, a: newA } = applyColorMatrixToColor({ r, g, b, a }, matrix);

            data[index] = newR;
            data[index + 1] = newG;
            data[index + 2] = newB;
            data[index + 3] = newA;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              resolve(reader.result as ArrayBuffer);
            } else {
              reject('Fehler beim Lesen des Blob-Inhalts.');
            }
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(blob);
        } else {
          reject('Canvas konnte nicht in Blob konvertiert werden.');
        }
      }, 'image/png');
    });

    img.onerror = () => {
      reject('Bild konnte nicht geladen werden.');
    };
  });
}

export async function getVisibleBBox(arrayBuffer: ArrayBuffer): Promise<{ left: number; top: number; width: number; height: number } | undefined> {
  return new Promise((resolve, reject) => {
    // Erstelle ein Blob aus dem ArrayBuffer und setze es als Quelle für ein Image-Element
    const blob = new Blob([arrayBuffer], { type: 'image/png' });
    const img = new Image();
    img.src = URL.createObjectURL(blob);

    img.onload = () => {
      // Canvas erzeugen, um das Bild zu rendern und die Pixel zu analysieren
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('Canvas-Kontext konnte nicht erstellt werden.');
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const { data, width, height } = imageData;

      // Variablen für die Bounding-Box der sichtbaren (nicht transparenten) Bereiche
      let minX = width,
        minY = height,
        maxX = 0,
        maxY = 0;
      let hasVisiblePixel = false;

      // Durchlaufe alle Pixel und finde die Grenzen der sichtbaren Bereiche
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          const alpha = data[index + 3]; // Alpha-Wert (Transparenz)

          if (alpha > 0) {
            // Wenn der Pixel nicht vollständig transparent ist
            hasVisiblePixel = true;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      // Falls keine sichtbaren Pixel gefunden wurden, gibt es keine Bounding-Box
      if (!hasVisiblePixel) {
        resolve(undefined);
        return;
      }

      // Berechne die Breite und Höhe der sichtbaren Bounding-Box
      const bbox = {
        left: minX,
        top: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };

      resolve(bbox);
    };

    img.onerror = () => {
      reject('Bild konnte nicht geladen werden.');
    };
  });
}

export async function cropToVisibleBBox(arrayBuffer: ArrayBuffer, bbox: { left: number; top: number; width: number; height: number }): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    // Bild laden und auf das Canvas zeichnen
    const blob = new Blob([arrayBuffer], { type: 'image/png' });
    const img = new Image();
    img.src = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = bbox.width;
      canvas.height = bbox.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('Canvas-Kontext konnte nicht erstellt werden.');
        return;
      }

      // Zeichne nur den Bereich der Bounding-Box auf das Canvas
      ctx.drawImage(
        img,
        bbox.left,
        bbox.top,
        bbox.width,
        bbox.height, // Quelle: BBox
        0,
        0,
        bbox.width,
        bbox.height // Ziel: Volle Canvasgröße
      );

      // Konvertiere das Canvas in einen ArrayBuffer
      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              resolve(reader.result as ArrayBuffer);
            } else {
              reject('Fehler beim Lesen des Blob-Inhalts.');
            }
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(blob);
        } else {
          reject('Canvas konnte nicht in Blob konvertiert werden.');
        }
      }, 'image/png');
    };

    img.onerror = () => {
      reject('Bild konnte nicht geladen werden.');
    };
  });
}

export async function rasterize(svg: SVGSVGElement) {
  const ab = await renderSVG(svg);
  const visibleBBox = await getVisibleBBox(ab);
  if (!visibleBBox) {
    console.error('Failed to get visible bbox');
    return undefined;
  }
  return {
    left: visibleBBox?.left,
    top: visibleBBox?.top,
    width: visibleBBox?.width,
    height: visibleBBox?.height,
    buffer: await cropToVisibleBBox(ab, visibleBBox),
  };
}
export async function applyColorMatrix(data: ArrayBuffer, matrix: ColorMatrix) {
  matrix;
  // Nothing to do since canvas API renders SVG with filters already
  return data;
}
