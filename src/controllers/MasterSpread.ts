import { createIDMLTransform, ensureBoolean, ensureNumber, ensurePropertyArray, flattenIDMLProperties, getIDMLElementProperties, parseIDMLTransform, serializeElement } from '../helpers.js';
import { Transform } from '../types/index.js';
import { IDMLMasterSpreadPackageContext } from './MasterSpreadPackage.js';
import { Page } from './Page.js';

export class MasterSpread {
  private baseName: string;
  private showMasterItems: boolean;
  //   private pageCount: number;
  private overridenPageItemProps: string[];
  private primaryTextFrame: string;
  public itemTransform: Transform;
  private pageColor: string;
  private name: string;
  private namePrefix: string;
  constructor(
    private id: string,
    public pages: Page[],
    opts: {
      baseName: string;
      name: string;
      namePrefix: string;
      showMasterItems: boolean;
      //   pageCount: number;
      overridenPageItemProps: string[];
      primaryTextFrame: string;
      itemTransform: Transform;
      pageColor: string;
    },
    private context: IDMLMasterSpreadPackageContext
  ) {
    this.baseName = opts.baseName;
    this.name = opts.name;
    this.namePrefix = opts.namePrefix;
    this.showMasterItems = opts.showMasterItems;
    // this.pageCount = opts.pageCount;
    this.overridenPageItemProps = opts.overridenPageItemProps;
    this.primaryTextFrame = opts.primaryTextFrame;
    this.itemTransform = opts.itemTransform;
    this.pageColor = opts.pageColor;
  }
  serialize() {
    return serializeElement(
      'MasterSpread',
      {
        Name: this.name,
        NamePrefix: this.namePrefix,
        ShowMasterItems: this.showMasterItems,
        PageCount: this.pages.length,
        OverridenPageItemProps: this.overridenPageItemProps.join(', '),
        PrimaryTextFrame: this.primaryTextFrame,
        ItemTransform: createIDMLTransform(this.itemTransform).join(' '),
        PageColor: this.pageColor,
        BaseName: this.baseName,
      },
      this.id,
      this.context.spreadPackageRoot,
      ['Properties'],
      this.pages.map((page) => page.serialize())
    );
  }
  static parseElement(element: Element, context: IDMLMasterSpreadPackageContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], []));

    const pages = Array.from(element.getElementsByTagName('Page')).map((pageElement) => Page.parseElement(pageElement, context));

    const id = element.getAttribute('Self');
    if (!id) {
      throw new Error('MasterSpread element missing Self attribute');
    }
    const name = element.getAttribute('Name');
    if (!name) {
      throw new Error('MasterSpread element missing Name attribute');
    }
    const baseName = element.getAttribute('BaseName');
    if (!baseName) {
      throw new Error('MasterSpread element missing BaseName attribute');
    }
    const namePrefix = element.getAttribute('NamePrefix');
    if (!namePrefix) {
      throw new Error('MasterSpread element missing NamePrefix attribute');
    }
    const showMasterItems = ensureBoolean(props['ShowMasterItems'] as string);
    const overridenPageItemProps = ensurePropertyArray(props['OverridenPageItemProps'] as string);
    const primaryTextFrame = props['PrimaryTextFrame'] as string;
    if (!primaryTextFrame) {
      throw new Error('MasterSpread element missing PrimaryTextFrame property');
    }
    const itemTransform = parseIDMLTransform(props['ItemTransform'] as string);

    const pageColor = props['PageColor'] as string;
    if (!pageColor) {
      throw new Error('MasterSpread element missing PageColor property');
    }

    return new MasterSpread(
      id,
      pages,
      {
        baseName,
        name,
        namePrefix,
        showMasterItems,
        overridenPageItemProps,
        primaryTextFrame,
        itemTransform,
        pageColor,
      },
      context
    );
  }
}
