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
