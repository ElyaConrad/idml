export type SVGTransform = {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
  rotate: number;
};

function svgTransformToMatrix(transform: SVGTransform) {
  const { scaleX, scaleY, translateX, translateY, rotate } = transform;
  const cosTheta = Math.cos(rotate);
  const sinTheta = Math.sin(rotate);
  const a = scaleX * cosTheta;
  const b = scaleX * sinTheta;
  const c = -scaleY * sinTheta;
  const d = scaleY * cosTheta;
  const tx = translateX;
  const ty = translateY;
  return [a, b, c, d, tx, ty];
}
