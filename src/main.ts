import { unzip } from 'unzipit';
import { IDMLGraphicController } from './controllers/Graphic.js';
import { IDMLStylesController } from './controllers/Styles.js';
import { IDMLFontsController } from './controllers/Fonts.js';
import { IDMLPreferencesController } from './controllers/Preferences.js';
import { downloadZip } from 'client-zip';
import { ensureFile } from 'fs-extra';
import {
  ElementNode,
  makeElementNode,
  nodeToNode,
  parseXML,
  stringifyXMLDocument,
  XMLProcessingInstructionAID,
  XMLProcessingInstructionXML,
} from './util/xml.js';
import { writeFile } from 'node:fs/promises';
import { MasterSpreadPackage } from './controllers/MasterSpreadPackage.js';
import { SpreadPackage } from './controllers/SpreadPackage.js';
import { BackingStory } from './controllers/BackingStory.js';
import { StoryPackage } from './controllers/StoryPackage.js';

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
  static implementedElements = [
    'idPkg:Graphic',
    'idPkg:Styles',
    'idPkg:Fonts',
    'idPkg:Preferences',
    'idPkg:MasterSpread',
    'idPkg:Spread',
    'idPkg:BackingStory',
    'idPkg:Story',
  ];
  designmap?: HTMLElement;
  graphics: IDMLGraphicController[] = [];
  styles: IDMLStylesController[] = [];
  fonts: IDMLFontsController[] = [];
  preferences: IDMLPreferencesController[] = [];
  masterSpreadPackages: MasterSpreadPackage[] = [];
  spreadPackages: SpreadPackage[] = [];
  backingStories: BackingStory[] = [];
  storyPackages: StoryPackage[] = [];
  get context(): IDMLDocumentContext {
    return {
      idml: this,
    };
  }
  constructor(private archiveBuffer: ArrayBuffer) {
    super();
    this.extract().then(() => {
      const readyEvent = new Event('ready');
      this.dispatchEvent(readyEvent);
    });
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
      document.children = document.children.filter(
        (child) => child.type !== 'element' || !IDML.implementedElements.includes(child.tagName)
      );
      for (const graphic of this.graphics) {
        document.children.push(makeElementNode('idPkg:Graphic', { src: graphic.src }));
        files.push({
          path: graphic.src,
          contents: Buffer.from(stringifyXMLDocument(graphic.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }
      for (const styles of this.styles) {
        document.children.push(makeElementNode('idPkg:Styles', { src: styles.src }));
        files.push({
          path: styles.src,
          contents: Buffer.from(stringifyXMLDocument(styles.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }
      for (const fonts of this.fonts) {
        document.children.push(makeElementNode('idPkg:Fonts', { src: fonts.src }));
        files.push({
          path: fonts.src,
          contents: Buffer.from(stringifyXMLDocument(fonts.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }
      for (const preferences of this.preferences) {
        document.children.push(makeElementNode('idPkg:Preferences', { src: preferences.src }));
        files.push({
          path: preferences.src,
          contents: Buffer.from(stringifyXMLDocument(preferences.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      for (const masterSpreadWrapper of this.masterSpreadPackages) {
        document.children.push(makeElementNode('idPkg:MasterSpread', { src: masterSpreadWrapper.src }));
        files.push({
          path: masterSpreadWrapper.src,
          contents: Buffer.from(stringifyXMLDocument(masterSpreadWrapper.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      for (const spreadPackage of this.spreadPackages) {
        document.children.push(makeElementNode('idPkg:Spread', { src: spreadPackage.src }));
        files.push({
          path: spreadPackage.src,
          contents: Buffer.from(stringifyXMLDocument(spreadPackage.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      for (const backingStory of this.backingStories) {
        document.children.push(makeElementNode('idPkg:BackingStory', { src: backingStory.src }));
        files.push({
          path: backingStory.src,
          contents: Buffer.from(stringifyXMLDocument(backingStory.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      for (const storyPackage of this.storyPackages) {
        document.children.push(makeElementNode('idPkg:Story', { src: storyPackage.src }));
        files.push({
          path: storyPackage.src,
          contents: Buffer.from(stringifyXMLDocument(storyPackage.serialize(), [XMLProcessingInstructionXML], true)),
        });
      }

      const designmapXMLDocument = stringifyXMLDocument(
        document,
        [XMLProcessingInstructionXML, XMLProcessingInstructionAID],
        true
      );
      files.push({
        path: 'designmap.xml',
        contents: Buffer.from(designmapXMLDocument),
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

      for (const file of files) {
        await ensureFile(`compare/${file.path}`);
        await writeFile(`compare/${file.path}`, (file.contents as Buffer).toString());
        await ensureFile(`compare/old_${file.path}`);
        await writeFile(`compare/old_${file.path}`, await entries[file.path].text());
      }

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
  getUniqueID(prefix = 'idml_') {
    return Math.random().toString(36).substring(2, 15);
  }
}
