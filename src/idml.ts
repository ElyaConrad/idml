import { unzip } from 'unzipit';
export * from './util/font.js';
import { IDMLGraphicController } from './controllers/Graphic.js';
import { IDMLStylesController } from './controllers/Styles.js';
import { FontFamilyInput, IDMLFontsController } from './controllers/Fonts.js';
import { IDMLPreferencesController } from './controllers/Preferences.js';
import { downloadZip } from 'client-zip';
import { ElementNode, makeElementNode, nodeToNode, parseDOM, XMLProcessingInstructionAID, XMLProcessingInstructionXML } from 'flat-svg';
import { MasterSpreadPackage } from './controllers/MasterSpreadPackage.js';
import { SpreadPackage } from './controllers/SpreadPackage.js';
import { BackingStory } from './controllers/BackingStory.js';
import { StoryPackage } from './controllers/StoryPackage.js';
import { CreateMasterSpreadOptions, MasterSpread } from './controllers/MasterSpread.js';
import { Spread } from './controllers/Spread.js';
import { Color } from './controllers/Color.js';
import { ColorInput, GeometricBounds } from './types/index.js';
import { getUniqueID, parseXML, stringifyXML, preloadJSDOM } from 'flat-svg';
import { IDML_PLAIN } from './assets/IDML_PLAIN.js';
import { ParagraphStyleInput } from './controllers/ParagraphStyle.js';
import { CharacterStyleInput } from './controllers/CharacterStyle.js';
import { FontFamily } from './controllers/FontFamily.js';
import { extractFontTable } from './idml.js';
import { determineFontType } from './idml.js';
import { base64ToArrayBuffer, createArrayBuffer } from './util/arrayBuffer.js';
import { ParagraphInput, Story } from './controllers/Story.js';
export { type ColorInput } from './types/index.js';
export { RectangleSprite } from './controllers/sprites/Rectangle.js';
export { GroupSprite } from './controllers/sprites/Group.js';
export { TextFrame } from './controllers/sprites/TextFrame.js';
export { OvalSprite } from './controllers/sprites/Oval.js';
export { PolygonSprite, type PathCommand } from './controllers/sprites/Polygon.js';
export { ImageSprite } from './controllers/sprites/Image.js';
export { Sprite } from './controllers/sprites/Sprite.js';
export { Spread } from './controllers/Spread.js';

export const IDML_PLAIN_BUFFER = base64ToArrayBuffer(IDML_PLAIN);

export type CreateIDMLOptions = {
  pageGeometricBounds: GeometricBounds;
};

export type IDMLFile = {
  path: string;
  contents: ArrayBuffer;
};
export type IDMLBundle = {
  name: string;
  files: IDMLFile[];
};

export type IDMLDocumentContext = {
  idml: IDML;
};

export class IDML extends EventTarget {
  static implementedElements = ['idPkg:Graphic', 'idPkg:Styles', 'idPkg:Fonts', 'idPkg:Preferences', 'idPkg:MasterSpread', 'idPkg:Spread', 'idPkg:BackingStory', 'idPkg:Story'];
  designmap?: HTMLElement;
  graphics: IDMLGraphicController[] = [];
  styles: IDMLStylesController[] = [];
  fonts: IDMLFontsController[] = [];
  preferences: IDMLPreferencesController[] = [];
  masterSpreadPackages: MasterSpreadPackage[] = [];
  spreadPackages: SpreadPackage[] = [];
  backingStories: BackingStory[] = [];
  storyPackages: StoryPackage[] = [];

  swatchCreatorId = 'elya-idml';
  swatchGroupReference = 'elya-idml';

  get context(): IDMLDocumentContext {
    return {
      idml: this,
    };
  }
  constructor(private archiveBuffer: ArrayBuffer) {
    super();

    preloadJSDOM().then(() =>
      this.extract().then(() => {
        const readyEvent = new Event('ready');
        this.dispatchEvent(readyEvent);
      })
    );
  }
  // static create(opts: CreateIDMLOptions) {
  //   return new Promise<IDML>((resolve) => {
  //     const idml = new IDML(IDML_PLAIN_BUFFER);
  //     idml.createMasterSpread(opts);
  //     idml.addEventListener('ready', async () => {
  //       await new Promise((resolve) => setTimeout(resolve, 10000));
  //       // idml.masterSpreadPackages[0].masterSpread.pages[0].geometricBounds = opts.pageGeometricBounds;
  //       //idml.createSpread();
  //       resolve(idml);
  //     });
  //   });
  // }
  getSpreads() {
    return this.spreadPackages.map((spreadPackage) => spreadPackage.getSpread());
  }
  createMasterSpread(opts: CreateMasterSpreadOptions, masterSpread: MasterSpread = this.masterSpreadPackages[0].masterSpread) {
    // First, we need the id of the new master spread (which could be totally random)
    const id = this.getUniqueID();
    // Assume the master spread package file name is MasterSpread_{id}.xml
    const masterSpreadPackageFileName = `MasterSpread_${id}.xml`;
    // Assume the master spread package path is MasterSpreads/MasterSpread_{id}.xml
    const masterSpreadPackagePath = `MasterSpreads/${masterSpreadPackageFileName}`;

    // Create a master spread package first (because we need its context)
    // The package is just the XML wrapper around the master spread
    const masterSpreadPackage = new MasterSpreadPackage(masterSpreadPackagePath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:MasterSpread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0"></idPkg:MasterSpread>`, this.context);
    // Create a master spread within the context of the master spread package
    const newMasterSpread = MasterSpread.create(id, masterSpread, masterSpreadPackage.context, opts);
    this.masterSpreadPackages.push(masterSpreadPackage);
    return newMasterSpread;
  }
  createSpread(masterSpread: MasterSpread = this.masterSpreadPackages[0].masterSpread) {
    // First, we need the id of the new spread (which could be totally random)
    const id = this.getUniqueID();
    // Assume the spread package file name is Spread_{id}.xml
    const spreadPackageFileName = `Spread_${id}.xml`;
    // Assume the spread package path is Spreads/Spread_{id}.xml
    const spreadPackagePath = `Spreads/${spreadPackageFileName}`;

    // Create a spread package first (because we need its context)
    // The package is just the XML wrapper around the spread
    const spreadPackage = new SpreadPackage(spreadPackagePath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0"></idPkg:Spread>`, this.context);
    // Create a spread within the context of the spread package
    const newSpread = Spread.create(id, masterSpread, spreadPackage.context);
    // Set the new sspread to be THE spread of the spread package
    spreadPackage.setSpread(newSpread);

    // Finally, add the spread package to the IDML document
    this.spreadPackages.push(spreadPackage);

    // Return the new spread
    return newSpread;
  }
  getColors() {
    return this.graphics.reduce((allColors, graphicInstance) => {
      return [...allColors, ...graphicInstance.colors];
    }, [] as Color[]);
  }
  getColorById(id: string) {
    return this.getColors().find((color) => color.id === id);
  }
  assumeColor(color: ColorInput | string) {
    if (typeof color === 'string') {
      const existingColor = this.getColors().find((existingColor) => existingColor.id === color);
      if (!existingColor) {
        throw new Error(`Color ${color} not found`);
      }
      return existingColor;
    }
    const existingColor = this.getColors().find((existingColor) => existingColor.equals(color));
    if (existingColor) {
      return existingColor;
    } else {
      return this.graphics[0].createColor(color);
    }
  }
  getStories() {
    return this.storyPackages.map((storyPackage) => storyPackage.stories).flat();
  }
  getStoryById(id: string) {
    return this.getStories().find((story) => story.id === id);
  }
  createStory(paragraphs: ParagraphInput[]) {
    // First, create an unique id
    const id = this.context.idml.getUniqueID();
    // Assume the spread package file name is Story_{id}.xml
    const storyPackageFileName = `Story_${id}.xml`;
    // Assume the spread package path is Stories/Story_{id}.xml
    const storyPackagePath = `Stories/${storyPackageFileName}`;

    // Create a story package first (because we need its context)
    // The package is just the XML wrapper around the story
    const storyPackage = new StoryPackage(storyPackagePath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0"></idPkg:Story>`, this.context);
    // Create a spread within the context of the story package
    const newStory = new Story(
      id,
      Story.getParagraphsFromInput(paragraphs, storyPackage.context),
      {
        inCopyExportOption: {
          includeGraphicProxies: true,
          includeAllResources: false,
        },
        storyPreference: {
          opticalMarginAlignment: false,
          opticalMarginSize: 12,
          frameType: 'textFrame',
          orientation: 'horizontal',
          direction: 'leftToRight',
        },
        title: '$ID/',
        userText: true,
      },
      storyPackage.context
    );
    // Set the new story to be THE story of the story package
    storyPackage.setStory(newStory);

    // Finally, add the story package to the IDML document
    this.storyPackages.push(storyPackage);

    // Return the new story
    return newStory;
  }
  getParagraphStyles() {
    return this.styles
      .map((style) => {
        return style.paragraphStyles;
      })
      .flat();
  }
  getParagraphStyleById(id: string) {
    return this.getParagraphStyles().find((style) => style.id === id);
  }
  getCharacterStyles() {
    return this.styles
      .map((style) => {
        return style.characterStyles;
      })
      .flat();
  }
  getCharacterStyleById(id: string) {
    return this.getCharacterStyles().find((style) => style.id === id);
  }
  assumeParagraphStyle(paragraphStyle: ParagraphStyleInput | string) {
    if (typeof paragraphStyle === 'string') {
      const existingParagraphStyle = this.getParagraphStyleById(paragraphStyle);
      if (!existingParagraphStyle) {
        throw new Error(`ParagraphStyle ${paragraphStyle} not found`);
      }
      return existingParagraphStyle;
    }
    // if there is no font style defined BUT there is an applied font, we should set the font style to the first available font style
    if (paragraphStyle.fontStyle === undefined && paragraphStyle.appliedFont !== undefined) {
      const availableStyles = this.getFontFamily(paragraphStyle.appliedFont)?.getAvailableFontStyles();
      if (availableStyles && availableStyles.length > 0) {
        paragraphStyle.fontStyle = availableStyles[0];
      }
    }
    const existingParagraphStyle = this.getParagraphStyles().find((existingParagraphStyle) => existingParagraphStyle.equals(paragraphStyle));
    if (existingParagraphStyle) {
      return existingParagraphStyle;
    } else {
      return this.styles[0].createParagraphStyle(paragraphStyle);
    }
  }

  assumeCharacterStyle(characterStyle: CharacterStyleInput | string) {
    if (typeof characterStyle === 'string') {
      const existingCharacterStyle = this.getCharacterStyleById(characterStyle);
      if (!existingCharacterStyle) {
        throw new Error(`CharacterStyle ${characterStyle} not found`);
      }
      return existingCharacterStyle;
    }
    // if there is no font style defined BUT there is an applied font, we should set the font style to the first available font style
    if (characterStyle.fontStyle === undefined && characterStyle.appliedFont !== undefined) {
      const availableStyles = this.getFontFamily(characterStyle.appliedFont)?.getAvailableFontStyles();
      if (availableStyles && availableStyles.length > 0) {
        characterStyle.fontStyle = availableStyles[0];
      }
    }
    const existingCharacterStyle = this.getCharacterStyles().find((existingCharacterStyle) => existingCharacterStyle.equals(characterStyle));
    if (existingCharacterStyle) {
      return existingCharacterStyle;
    } else {
      return this.styles[0].createCharacterStyle(characterStyle);
    }
  }
  getFontFamilies() {
    return this.fonts.reduce((allFontFamilies, fontController) => {
      return [...allFontFamilies, ...fontController.fontFamilies];
    }, [] as FontFamily[]);
  }
  getFontFamily(name: string) {
    return this.getFontFamilies().find((fontFamily) => fontFamily.name === name);
  }
  addFont(fontFile: ArrayBuffer) {
    const fontController = this.fonts[0];
    const fontTable = extractFontTable(fontFile);
    const fontType = (() => {
      try {
        return determineFontType(fontFile);
      } catch {
        return 'Unkown';
      }
    })();

    return fontController.addFont(fontTable, fontType);
  }

  async extract() {
    const { entries } = await unzip(this.archiveBuffer);
    const designmapEntry = entries['designmap.xml'];
    if (!designmapEntry) {
      throw new Error('designmap.xml not found');
    }

    this.designmap = parseXML(await designmapEntry.text());

    // Create controllers for each graphic declarations
    for (const graphicLinkElement of Array.from(this.designmap.getElementsByTagName('idPkg:Graphic'))) {
      const src = graphicLinkElement.getAttribute('src');
      if (src) {
        this.graphics.push(new IDMLGraphicController(src, await entries[src].text(), this.context));
      }
    }

    // Create controllers for each styles declarations
    for (const stylesLinkElement of Array.from(this.designmap.getElementsByTagName('idPkg:Styles'))) {
      const src = stylesLinkElement.getAttribute('src');
      if (src) {
        this.styles.push(new IDMLStylesController(src, await entries[src].text(), this.context));
      }
    }

    // Create controllers for each fonts declarations
    for (const fontsLinkElement of Array.from(this.designmap.getElementsByTagName('idPkg:Fonts'))) {
      const src = fontsLinkElement.getAttribute('src');
      if (src) {
        this.fonts.push(new IDMLFontsController(src, await entries[src].text(), this.context));
      }
    }

    // Create controllers for each preferences declarations
    for (const preferencesLinkElement of Array.from(this.designmap.getElementsByTagName('idPkg:Preferences'))) {
      const src = preferencesLinkElement.getAttribute('src');
      if (src) {
        this.preferences.push(new IDMLPreferencesController(src, await entries[src].text(), this.context));
      }
    }

    // Get all master spread's (there should be only one)
    for (const masterSpreadElement of Array.from(this.designmap.getElementsByTagName('idPkg:MasterSpread'))) {
      const src = masterSpreadElement.getAttribute('src');
      if (src) {
        this.masterSpreadPackages.push(new MasterSpreadPackage(src, await entries[src].text(), this.context));
      }
    }

    // Get all spread packages
    for (const spreadPackageElement of Array.from(this.designmap.getElementsByTagName('idPkg:Spread'))) {
      const src = spreadPackageElement.getAttribute('src');
      if (src) {
        this.spreadPackages.push(new SpreadPackage(src, await entries[src].text(), this.context));
      }
    }

    // Get all backing stories
    for (const element of Array.from(this.designmap.getElementsByTagName('idPkg:BackingStory'))) {
      const src = element.getAttribute('src');
      if (src) {
        this.backingStories.push(new BackingStory(src, await entries[src].text(), this.context));
      }
    }

    // Get all story packages
    for (const element of Array.from(this.designmap.getElementsByTagName('idPkg:Story'))) {
      const src = element.getAttribute('src');
      if (src) {
        this.storyPackages.push(new StoryPackage(src, await entries[src].text(), this.context));
      }
    }

    // console.log(this.spreadPackages[0].spreads[0].sprites);
  }
  async pack() {
    if (this.designmap) {
      const { entries } = await unzip(this.archiveBuffer);

      let files: IDMLBundle['files'] = [];
      const document = nodeToNode(this.designmap) as ElementNode;

      document.children = document.children ?? [];
      document.children = document.children.filter((child) => child.type !== 'element' || !IDML.implementedElements.includes(child.tagName));
      for (const graphic of this.graphics) {
        document.children.push(makeElementNode('idPkg:Graphic', { src: graphic.src }));
        files.push({
          path: graphic.src,
          contents: createArrayBuffer(stringifyXML(graphic.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }
      for (const styles of this.styles) {
        document.children.push(makeElementNode('idPkg:Styles', { src: styles.src }));
        files.push({
          path: styles.src,
          contents: createArrayBuffer(stringifyXML(styles.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }
      for (const fonts of this.fonts) {
        document.children.push(makeElementNode('idPkg:Fonts', { src: fonts.src }));
        files.push({
          path: fonts.src,
          contents: createArrayBuffer(stringifyXML(fonts.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }
      for (const preferences of this.preferences) {
        document.children.push(makeElementNode('idPkg:Preferences', { src: preferences.src }));
        files.push({
          path: preferences.src,
          contents: createArrayBuffer(stringifyXML(preferences.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      for (const masterSpreadWrapper of this.masterSpreadPackages) {
        document.children.push(makeElementNode('idPkg:MasterSpread', { src: masterSpreadWrapper.src }));
        files.push({
          path: masterSpreadWrapper.src,
          contents: createArrayBuffer(stringifyXML(masterSpreadWrapper.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      for (const spreadPackage of this.spreadPackages) {
        document.children.push(makeElementNode('idPkg:Spread', { src: spreadPackage.src }));
        files.push({
          path: spreadPackage.src,
          contents: createArrayBuffer(stringifyXML(spreadPackage.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      for (const backingStory of this.backingStories) {
        document.children.push(makeElementNode('idPkg:BackingStory', { src: backingStory.src }));
        files.push({
          path: backingStory.src,
          contents: createArrayBuffer(stringifyXML(backingStory.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      for (const storyPackage of this.storyPackages) {
        document.children.push(makeElementNode('idPkg:Story', { src: storyPackage.src }));
        files.push({
          path: storyPackage.src,
          contents: createArrayBuffer(stringifyXML(storyPackage.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      const designmapXMLDocument = stringifyXML(document, [XMLProcessingInstructionXML, XMLProcessingInstructionAID], true);
      files.push({
        path: 'designmap.xml',
        contents: createArrayBuffer(designmapXMLDocument),
      });

      // const overwriteFiles: string[] = [
      //   'designmap.xml',
      //   'Resources/Graphic.xml',
      //   'Resources/Styles.xml',
      //   'Resources/Fonts.xml',
      //   'Resources/Preferences.xml',
      //   'Spreads/Spread_u14d.xml',
      //   'Spreads/Spread_ucf.xml',
      // ];
      // files = files.filter((file) => {
      //   const yes = overwriteFiles.includes(file.path);
      //   console.log(yes, file.path);

      //   return yes;
      // });

      // const keepFiles = ['designmap.xml'];

      // files = files.filter((file) => !keepFiles.includes(file.path));

      // for (const file of files) {
      //   await ensureFile(`compare/${file.path}`);
      //   await writeFile(`compare/${file.path}`, (file.contents as Buffer).toString());
      //   if (file.path in entries) {
      //     await ensureFile(`compare_old/${file.path}`);
      //     await writeFile(`compare_old/${file.path}`, await entries[file.path].text());
      //   }
      // }

      const bundle = {
        name: 'export.idml',
        files: [
          ...(await Promise.all(
            Object.entries(entries)
              .filter(([path]) => !files.find((file) => file.path === path))
              .filter(([path]) => !path.endsWith('/'))
              .map(async ([path, entry]) => ({
                path,
                contents: await entry.arrayBuffer(),
              }))
          )),
          ...files,
        ],
      };

      return bundle;
    }
  }
  async export() {
    const pack = await this.pack();
    if (!pack) throw new Error('No designmap.xml found');

    const archive = await downloadZip(
      pack.files.map(({ path, contents }) => ({ name: path, input: contents })),
      {
        buffersAreUTF8: true,
      }
    );
    if (!archive.body) throw new Error('Failed to create zip');
    return await archive.arrayBuffer();
  }
  getUniqueID(prefix?: string) {
    return getUniqueID(prefix);
  }
  getUID() {}
}

export { simplifySVG } from 'flat-svg';

export function createIDML(opts: CreateIDMLOptions) {
  return new Promise<IDML>((resolve) => {
    const idml = new IDML(IDML_PLAIN_BUFFER);
    idml.addEventListener('ready', async () => {
      idml.masterSpreadPackages[0].masterSpread.pages[0].geometricBounds = opts.pageGeometricBounds;
      idml.masterSpreadPackages[0].masterSpread.pages[0].itemTransform = { translateX: -opts.pageGeometricBounds.width / 2, translateY: -opts.pageGeometricBounds.height / 2, scaleX: 1, scaleY: 1, rotate: 0 };
      idml.createSpread();
      resolve(idml);
    });
  });
}
