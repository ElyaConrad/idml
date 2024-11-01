export type ColorInputRGB = {
  type: 'rgb';
  red: number;
  green: number;
  blue: number;
};

export type ColorInputCMYK = {
  type: 'cmyk';
  cyan: number;
  magenta: number;
  yellow: number;
  black: number;
};
export type ColorInput = ColorInputRGB | ColorInputCMYK;

export type Transform = {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
};
export type GeometricBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
