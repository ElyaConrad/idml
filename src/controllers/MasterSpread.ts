import { parseXML } from 'flat-svg';
import { createIDMLTransform, ensureBoolean, ensureNumber, ensurePropertyArray, flattenIDMLProperties, getIDMLElementProperties, parseIDMLTransform, serializeElement, TransformMatrix } from '../helpers.js';
import { GeometricBounds, Transform } from '../types/index.js';
import { GridDataInformation } from './GridDataInformation.js';
import { IDMLMasterSpreadPackageContext } from './MasterSpreadPackage.js';
import { Page } from './Page.js';
import _ from 'lodash';

export type CreateMasterSpreadOptions = {
  name?: string;
  namePrefix?: string;
  baseName?: string;
  pageGeometricBounds?: GeometricBounds;
  pageItemTransform?: TransformMatrix;
  pageColor?: string;
};

export class MasterSpread {
  private baseName: string;
  private showMasterItems: boolean;
  //   private pageCount: number;
  private overridenPageItemProps: string[];
  private primaryTextFrame?: string;
  public itemTransform: TransformMatrix;
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
      primaryTextFrame?: string;
      itemTransform: TransformMatrix;
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
        ItemTransform: this.itemTransform.join(' '),
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
    const primaryTextFrame = props['PrimaryTextFrame'] as string | undefined;
    if (!primaryTextFrame) {
      console.log('lümmel!');
      
      //throw new Error('MasterSpread element missing PrimaryTextFrame property');
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
  static create(id: string, inheritMasterSpread: MasterSpread, context: IDMLMasterSpreadPackageContext, opts: CreateMasterSpreadOptions = {}) {
    const newPages = inheritMasterSpread.pages.map((masterSpreadPage, masterPageIndex) => {
      // Get an ID for the page
      const id = context.idml.getUniqueID('Page');
      const geometricBounds = _.cloneDeep(opts.pageGeometricBounds ?? masterSpreadPage.geometricBounds);
      const itemTransform: TransformMatrix = [1, 0, 0, 1, -geometricBounds.width / 2, -geometricBounds.height / 2];
      return new Page(
        id,
        {
          // The name of the page will be the inner index of the page in the master spread (normally just 0) + the offset of already existing pages in the document
          name: opts.namePrefix ?? masterSpreadPage.name,
          // Now fill up the properties of the page with the properties of the master spread page
          pageColor: masterSpreadPage.pageColor,
          optionalPage: masterSpreadPage.optionalPage,
          gridStartingPoint: masterSpreadPage.gridStartingPoint,
          // Clone master spread page properties
          geometricBounds,
          itemTransform,
          masterPageTransform: _.cloneDeep(masterSpreadPage.masterPageTransform),
          marginPreference: _.cloneDeep(masterSpreadPage.marginPreference),
          gridDataInformation: new GridDataInformation(
            {
              fontSize: masterSpreadPage.gridDataInformation.fontSize,
              fontStyle: masterSpreadPage.gridDataInformation.fontStyle,
              characterAki: masterSpreadPage.gridDataInformation.characterAki,
              lineAki: masterSpreadPage.gridDataInformation.lineAki,
              horizontalScale: masterSpreadPage.gridDataInformation.horizontalScale,
              verticalScale: masterSpreadPage.gridDataInformation.verticalScale,
              lineAlignment: masterSpreadPage.gridDataInformation.lineAlignment,
              characterAlignment: masterSpreadPage.gridDataInformation.characterAlignment,
              gridAlignment: masterSpreadPage.gridDataInformation.gridAlignment,
              appliedFont: masterSpreadPage.gridDataInformation.appliedFont,
            },
            context
          ),
        },
        context
      );
    });

    const newMasterSpread = new MasterSpread(
      id,
      newPages,
      {
        name: opts.name ?? inheritMasterSpread.name,
        namePrefix: inheritMasterSpread.namePrefix,
        baseName: inheritMasterSpread.baseName,
        itemTransform: _.cloneDeep(inheritMasterSpread.itemTransform),
        overridenPageItemProps: _.cloneDeep(inheritMasterSpread.overridenPageItemProps),
        pageColor: opts.pageColor ?? inheritMasterSpread.pageColor,
        primaryTextFrame: inheritMasterSpread.primaryTextFrame,
        showMasterItems: inheritMasterSpread.showMasterItems,
      },
      context
    );

    return newMasterSpread;
  }
}
