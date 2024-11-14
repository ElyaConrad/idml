import { flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../helpers.js';
import { KeyMap } from '../util/keyMap.js';
import { IDMLFontsContext } from './Fonts.js';

export type FontStatus = 'installed' | 'notInstalled' | 'partiallyInstalled';
// export type FontType = 'openTypeCFF';

const fontStatusMap = new KeyMap({
  Installed: 'installed',
  NotInstalled: 'notInstalled',
  PartiallyInstalled: 'partiallyInstalled',
} as const);

export type Font = {
  id: string;
  fontFamily: string;
  name: string;
  postScriptName?: string;
  fontStyleName: string;
  status: FontStatus;
  type: string;
};

export class FontFamily {
  constructor(private id: string, public name: string, private fonts: Font[], opts: {}, private context: IDMLFontsContext) {}
  getAvailableFontStyles() {
    return this.fonts.map((font) => font.fontStyleName);
  }
  addFontStyle(styleName: string, postScriptName: string, status: FontStatus, type: string) {
    const name = `${this.name} ${styleName}`;
    const id = `${this.id}Fontn${name}`;
    const font = {
      id,
      fontFamily: this.name,
      name,
      fontStyleName: styleName,
      postScriptName,
      status,
      type,
    };
    this.fonts.push(font);
    return font;
  }
  serialize() {
    return serializeElement(
      'FontFamily',
      {
        Name: this.name,
      },
      this.id,
      this.context.fontsRoot,
      ['Properties'],
      this.fonts.map((font) => {
        return serializeElement(
          'Font',
          {
            FontFamily: font.fontFamily,
            Name: font.name,
            PostScriptName: font.postScriptName,
            FontStyleName: font.fontStyleName,
            Status: fontStatusMap.getExternal(font.status),
            FontType: font.type,
          },
          font.id,
          this.context.fontsRoot,
          ['Properties']
        );
      })
    );
  }
  static parseElement(element: Element, context: IDMLFontsContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };
    const id = props.Self;
    if (!id) {
      throw new Error('FontFamily element must have a Self attribute');
    }
    const name = props.Name;
    if (!name) {
      throw new Error('FontFamily element must have a Name attribute');
    }

    const fonts = Array.from(element.getElementsByTagName('Font')).map<Font>((fontElement) => {
      const fontProps = flattenIDMLProperties(getIDMLElementProperties(fontElement, ['Properties'])) as {
        [k: string]: string | undefined;
      };
      const id = fontProps.Self;
      if (!id) {
        throw new Error('Font element must have a Self attribute');
      }
      const fontFamily = fontProps.FontFamily;
      if (!fontFamily) {
        throw new Error('Font element must have a FontFamily attribute');
      }
      const name = fontProps.Name;
      if (!name) {
        throw new Error('Font element must have a Name attribute');
      }
      const postScriptName = fontProps.PostScriptName;
      const fontStyleName = fontProps.FontStyleName;
      if (!fontStyleName) {
        throw new Error('Font element must have a FontStyleName attribute');
      }
      const status = fontStatusMap.getInternal(fontProps.Status);
      const type = fontProps.FontType;
      if (!type) {
        throw new Error('Font element must have a FontType attribute');
      }

      return { id, fontFamily, name, postScriptName, fontStyleName, status, type };
    });

    return new FontFamily(id, name, fonts, {}, context);
  }
}
