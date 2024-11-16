import { getElementAttributes, makeElementNode, makeTextNode, XMLNode } from 'flat-svg';
import { GeometricBounds, Transform } from './types';

export type TransformMatrix = [number, number, number, number, number, number];
export const IdentityTransformMatrix = [1, 0, 0, 1, 0, 0] as TransformMatrix;

export function parseIDMLTransform(str: string | undefined) {
  if (!str) {
    return IdentityTransformMatrix;
  } else {
    return str
      .split(' ')
      .map(ensureNumber)
      .filter((n) => n !== undefined) as TransformMatrix;
  }
}

export function normalizeTransformMatrixForGivenOrigin(
  matrix: TransformMatrix, // [a, b, c, d, e, f]
  [originX, originY]: [number, number],
  [internalOriginX, internalOriginY]: [number, number]
): TransformMatrix {
  // Extrahiere die Matrix-Komponenten
  const [a, b, c, d, e, f] = matrix;

  // Berechne den Versatz zwischen der aktuellen Mitte und dem neuen Transformationsursprung
  const offsetX = internalOriginX - originX;
  const offsetY = internalOriginY - originY;

  // Berechne den Skalenfaktor
  const scaleX = Math.sqrt(a * a + b * b);
  const scaleY = Math.sqrt(c * c + d * d);

  // Berechne die Rotation in Radiant aus der Matrix
  const rotate = Math.atan2(b, a);

  // Berechne die neuen Offset-Koordinaten nach Rotation
  const rotatedOffsetX = offsetX * Math.cos(rotate) - offsetY * Math.sin(rotate);
  const rotatedOffsetY = offsetX * Math.sin(rotate) + offsetY * Math.cos(rotate);

  // Passe die Translation an
  const adjustedTranslateX = e - offsetX + rotatedOffsetX * scaleX;
  const adjustedTranslateY = f - offsetY + rotatedOffsetY * scaleY;

  // Rückgabe der neuen Transformationsmatrix
  return [
    a, // Unverändert: Skalen- und Rotationskomponente
    b,
    c, // Unverändert: Skalen- und Rotationskomponente
    d,
    adjustedTranslateX, // Neue Translation X
    adjustedTranslateY, // Neue Translation Y
  ];
}

export function ensureNumber(value: unknown) {
  const n = Number(value);
  if (isNaN(n)) {
    return undefined;
  }
  return n;
}
export function serializeNumber(value?: number, defaultValue?: number) {
  return value ? String(value) : String(defaultValue ?? 0);
}

export function ensureArray(value: string | null | undefined) {
  if (!value) return undefined;
  return value
    .split(' ')
    .map(ensureNumber)
    .filter((n) => n !== undefined);
}

export function cssifyIDMLTransform(transformMatrix: TransformMatrix): Transform {
  const [a, b, c, d, e, f] = transformMatrix;
  const scaleX = Math.sqrt(a * a + b * b);
  const scaleY = Math.sqrt(c * c + d * d);
  const rotate = Math.atan2(b, a);

  return {
    translateX: e,
    translateY: f,
    scaleX,
    scaleY,
    rotate,
  };
}

export function createIDMLTransform(transform: Transform): [number, number, number, number, number, number] {
  const { translateX, translateY, scaleX, scaleY, rotate } = transform;
  const a = scaleX * Math.cos(rotate);
  const b = scaleX * Math.sin(rotate);
  const c = -scaleY * Math.sin(rotate);
  const d = scaleY * Math.cos(rotate);
  const e = translateX;
  const f = translateY;
  return [a, b, c, d, e, f];
}

export function parseIDMLGeometricBounds(geometricBoundsString: string | undefined) {
  const bounds = ensureArray(geometricBoundsString);
  if (!bounds || bounds.length !== 4) {
    throw new Error('Invalid geometric bounds');
  } else {
    return {
      x: bounds[0],
      y: bounds[1],
      width: bounds[3],
      height: bounds[2],
    };
  }
}
export function createIDMLGeometricBounds(bounds: GeometricBounds) {
  return [bounds.x, bounds.y, bounds.height, bounds.width];
}

export type IDMLElementAttributeDescriptor = { source: 'attribute'; value: string | null };
export type IDMLElementPropertyDescriptor = {
  source: 'property';
  propGroup: string;
  value: string | null | { attributes: { [k: string]: string }; value: string | null }[];
  // type: string | null;
  attributes: { [k: string]: string };
};
export type IDMLElementProperty = IDMLElementAttributeDescriptor | IDMLElementPropertyDescriptor;

export function getIDMLElementProperties(element: Element, allowedPropGroups: string[], excludeKeys: string[] = []) {
  const attributes = Object.fromEntries(
    Array.from(element.attributes).map((attr) => {
      return [
        attr.name,
        {
          source: 'attribute',
          value: element.getAttribute(attr.name),
        } as IDMLElementAttributeDescriptor,
      ];
    })
  ) as { [k: string]: IDMLElementAttributeDescriptor };
  const propertiesElements = Array.from(element.children).filter((element) => allowedPropGroups.includes(element.tagName) && element.children.length > 0);
  const properties = Object.fromEntries(
    propertiesElements
      .map((propertiesElement) => {
        return Array.from(propertiesElement.children)
          .filter((propertyElement) => {
            // Special properties that are too complex to be serialized
            return !['PathGeometry'].includes(propertyElement.tagName);
          })
          .map<[string, IDMLElementPropertyDescriptor]>((propertyElement) => {
            const attributes = getElementAttributes(propertyElement);

            const value = (() => {
              if (attributes.type === 'list') {
                return Array.from(propertyElement.getElementsByTagName('ListItem')).map((child) => ({
                  attributes: getElementAttributes(child),
                  value: child.textContent,
                }));
              } else {
                return propertyElement.textContent;
              }
            })();
            return [
              propertyElement.tagName,
              {
                source: 'property',
                propGroup: propertiesElement.tagName,
                attributes: Object.fromEntries(
                  Array.from(propertyElement.attributes)
                    .map((attr) => [attr.name, attr.value])
                    .filter(([, value]) => value !== null)
                ) as { [k: string]: string },
                value,
              },
            ];
          });
      })
      .flat()
  );

  return Object.fromEntries(
    Object.entries({
      ...attributes,
      ...properties,
    } as { [k: string]: IDMLElementProperty }).filter(([key]) => !excludeKeys.includes(key))
  );
}

export function flattenIDMLProperties(props: ReturnType<typeof getIDMLElementProperties>) {
  return Object.fromEntries(
    Object.entries(props).map(([key, { value }]) => {
      return [key, value ?? undefined];
    })
  );
}

export function serializeElement(tagName: string, modifiedProps: { [k: string]: string | number | boolean | undefined }, idOrElement: string | Element | undefined, root: HTMLElement, allowedPropGroups: string[], customChildrenNodes: XMLNode[] = []) {
  const originalElement =
    typeof idOrElement === 'string'
      ? Array.from(root.getElementsByTagName(tagName)).find((element) => {
          return element.getAttribute('Self') === idOrElement;
        })
      : idOrElement;

  const allOriginalProps = originalElement ? getIDMLElementProperties(originalElement, allowedPropGroups, ['Self']) : {};
  const allKeys = Array.from(new Set([...Object.keys(allOriginalProps), ...Object.keys(modifiedProps)]));

  const propGroups = Array.from(new Set((Object.values(allOriginalProps).filter(({ source }) => source === 'property') as IDMLElementPropertyDescriptor[]).map(({ propGroup }) => propGroup)));

  const newPropertyGroups = Object.fromEntries(propGroups.map((propGroupName) => [propGroupName, Object.fromEntries((Object.entries(allOriginalProps).filter(([key, propD]) => propD.source === 'property' && propD.propGroup === propGroupName) as [string, IDMLElementPropertyDescriptor][]).map(([key, { value, attributes }]) => [key, { value, attributes }]))]));

  const allKeysWithinAPropertyGroup = Object.values(newPropertyGroups)
    .map((group) => Object.keys(group))
    .flat();

  // Literally all properties left should become attributes
  const newAttributes = Object.fromEntries(
    allKeys
      .filter((key) => !allKeysWithinAPropertyGroup.includes(key))
      .map((key) => {
        // console.log(key, modifiedProps[key], allOriginalProps);

        return [key, modifiedProps[key] ?? allOriginalProps[key]?.value];
      })
  );

  return makeElementNode(
    tagName,
    {
      Self: typeof idOrElement === 'string' ? idOrElement : undefined,
      ...newAttributes,
    },
    [
      ...Object.entries(newPropertyGroups).map(([propGroupName, properties]) => {
        return makeElementNode(
          propGroupName,
          {},
          Object.entries(properties).map(([key, { value, attributes }]) => {
            return makeElementNode(key, attributes, typeof value === 'string' || value === null ? (value ? [makeTextNode(value)] : undefined) : value.map(({ attributes, value }) => makeElementNode('ListItem', attributes, [makeTextNode(value ?? '')])));
          })
        );
      }),
      ...customChildrenNodes,
    ]
  );
}

export function calculateTransformForOrigin({ rotate, scaleX, scaleY, translateX, translateY }: Transform, [originX, originY]: [number, number], internalOrigin: [number, number]): Transform {
  // Konvertiere die Rotation von Grad zu Bogenmaß
  const angleRad = rotate;

  // Berechne den Offset zwischen internalOrigin und dem gewünschten origin
  const offsetX = internalOrigin[0] - originX;
  const offsetY = internalOrigin[1] - originY;

  // Berechne die neuen Offset-Koordinaten nach Rotation
  const rotatedOffsetX = offsetX * Math.cos(angleRad) - offsetY * Math.sin(angleRad);
  const rotatedOffsetY = offsetX * Math.sin(angleRad) + offsetY * Math.cos(angleRad);

  // Angepasste Translation basierend auf der Rotation, Skalierung und dem Offset
  const adjustedTranslateX = translateX - offsetX + rotatedOffsetX * scaleX;
  const adjustedTranslateY = translateY - offsetY + rotatedOffsetY * scaleY;

  return {
    translateX: adjustedTranslateX,
    translateY: adjustedTranslateY,
    scaleX: scaleX,
    scaleY: scaleY,
    rotate: rotate,
  };
}

export function normalizeTransformForGivenOrigin(transform: Transform, [originX, originY]: [number, number], internalOrigin: [number, number]): Transform {
  // Berechne den Versatz zwischen der aktuellen Mitte und dem neuen Transformationsursprung
  const offsetX = internalOrigin[0] - originX;
  const offsetY = internalOrigin[1] - originY;

  // Konvertiere die Rotation von Grad zu Bogenmaß
  const angleRad = transform.rotate;

  // Berechne die neuen Offset-Koordinaten nach Rotation
  const rotatedOffsetX = offsetX * Math.cos(angleRad) - offsetY * Math.sin(angleRad);
  const rotatedOffsetY = offsetX * Math.sin(angleRad) + offsetY * Math.cos(angleRad);

  // Angepasste Translation basierend auf der Rotation und Skalierung
  const adjustedTranslateX = transform.translateX - offsetX + rotatedOffsetX * transform.scaleX;
  const adjustedTranslateY = transform.translateY - offsetY + rotatedOffsetY * transform.scaleY;

  // Rückgabe des neuen Transformationsobjekts mit angepassten Translationen
  return {
    translateX: adjustedTranslateX,
    translateY: adjustedTranslateY,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    rotate: transform.rotate,
  };
}

export function ensurePropertyArray(value: string | null | undefined) {
  if (!value) return [];
  return value.split(/,\s?/);
}
export function ensureEnumArray(value: string | null | undefined) {
  if (!value) return [];
  return value.split(' ');
}
export function ensureBoolean(value: string | null | undefined, defaultValue = false) {
  if (defaultValue === true) {
    return value !== 'false';
  } else {
    return value === 'true';
  }
}
export function serializeArray(value?: number[]) {
  if (!value) return '';
  return value.join(' ');
}

export function getChildTagValue<T>(element: Element | undefined, tagName: string, converter: (str: string) => T, defaultValue: T) {
  if (!element) {
    return defaultValue;
  }
  const child = element.getElementsByTagName(tagName)[0];
  if (!child) {
    return defaultValue;
  }
  return converter(child.textContent ?? '') ?? defaultValue;
}
export function getChildTagValueOptional<T>(element: Element | undefined, tagName: string, converter: (str: string) => T, defaultValue: T) {
  if (!element) {
    return defaultValue;
  }
  const child = element.getElementsByTagName(tagName)[0];
  if (!child) {
    return undefined;
  }
  return converter(child.textContent ?? '') ?? undefined;
}
