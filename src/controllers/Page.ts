import { createIDMLGeometricBounds, createIDMLTransform, ensureArray, ensureNumber, flattenIDMLProperties, getIDMLElementProperties, parseIDMLGeometricBounds, parseIDMLTransform, serializeElement } from '../helpers.js';
import { KeyMap } from '../util/keyMap.js';
import { makeElementNode } from 'flat-svg';
import { GridDataInformation } from './GridDataInformation.js';
import { IDMLMasterSpreadPackageContext } from './MasterSpreadPackage.js';
import { IDMLSpreadPackageContext } from './SpreadPackage.js';
import { GeometricBounds, Transform } from '../types/index.js';

export type ColumnDirection = 'horizontal' | 'vertical';

export type MarginPreference = {
  columnCount?: number;
  columnGutter?: number;
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  columnDirection?: ColumnDirection;
  columnsPositions?: number[];
};

type GridStartingPoint = 'topOutside' | 'bottomOutside' | 'topInside' | 'bottomInside' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

const columnDirectionMap = new KeyMap({
  Horizontal: 'horizontal',
  Vertical: 'vertical',
} as const);

const gridStartingPointMap = new KeyMap({
  TopOutside: 'topOutside',
  BottomOutside: 'bottomOutside',
  TopInside: 'topInside',
  BottomInside: 'bottomInside',
  TopLeft: 'topLeft',
  TopRight: 'topRight',
  BottomLeft: 'bottomLeft',
  BottomRight: 'bottomRight',
} as const);

export class Page {
  public name?: string;
  public pageColor?: string;
  public masterPageTransform?: Transform;
  public geometricBounds: GeometricBounds;
  public itemTransform: Transform;
  public gridStartingPoint?: GridStartingPoint;
  public optionalPage?: boolean;

  public marginPreference: MarginPreference;

  public gridDataInformation: GridDataInformation;

  constructor(
    private id: string,
    opts: {
      name?: string;
      pageColor?: string;
      masterPageTransform?: Transform;
      geometricBounds: GeometricBounds;
      itemTransform: Transform;
      gridStartingPoint?: GridStartingPoint;
      optionalPage?: boolean;
      marginPreference: MarginPreference;
      gridDataInformation: GridDataInformation;
    },
    private context: IDMLMasterSpreadPackageContext | IDMLSpreadPackageContext
  ) {
    this.name = opts.name;
    this.pageColor = opts.pageColor;
    this.masterPageTransform = opts.masterPageTransform;
    this.geometricBounds = opts.geometricBounds;
    this.itemTransform = opts.itemTransform;
    this.gridStartingPoint = opts.gridStartingPoint;
    this.optionalPage = opts.optionalPage;
    this.marginPreference = opts.marginPreference;
    this.gridDataInformation = opts.gridDataInformation;
  }
  serialize() {
    return serializeElement(
      'Page',
      {
        Name: this.name,
        PageColor: this.pageColor,
        MasterPageTransform: this.masterPageTransform ? createIDMLTransform(this.masterPageTransform).join(' ') : undefined,
        GeometricBounds: this.geometricBounds ? createIDMLGeometricBounds(this.geometricBounds).join(' ') : undefined,
        ItemTransform: this.itemTransform ? createIDMLTransform(this.itemTransform).join(' ') : undefined,
        GridStartingPoint: gridStartingPointMap.getExternal(this.gridStartingPoint),
        OptionalPage: this.optionalPage,
      },
      this.id,
      this.context.spreadPackageRoot,
      ['Properties'],
      [
        makeElementNode('MarginPreference', {
          ColumnCount: this.marginPreference.columnCount,
          ColumnGutter: this.marginPreference.columnGutter,
          Top: this.marginPreference.top,
          Bottom: this.marginPreference.bottom,
          Left: this.marginPreference.left,
          Right: this.marginPreference.right,
          ColumnDirection: columnDirectionMap.getExternal(this.marginPreference.columnDirection),
          ColumnsPositions: this.marginPreference.columnsPositions?.join(', '),
        }),
        this.gridDataInformation.serialize(),
      ]
    );
  }
  static parseElement(element: Element, context: IDMLMasterSpreadPackageContext | IDMLSpreadPackageContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };
    const id = props['Self'];
    if (!id) {
      throw new Error('Page element missing Self attribute');
    }
    const name = props['Name'];
    const pageColor = props['PageColor'];
    const masterPageTransform = parseIDMLTransform(props['MasterPageTransform']);
    const geometricBounds = parseIDMLGeometricBounds(props['GeometricBounds']);
    const itemTransform = parseIDMLTransform(props['ItemTransform']);
    const gridStartingPoint = gridStartingPointMap.getInternal(props['GridStartingPoint']);

    const marginPreferenceElement = element.getElementsByTagName('MarginPreference')[0];
    if (!marginPreferenceElement) {
      throw new Error('Page element missing MarginPreference element');
    }
    const marginPreferenceProps = flattenIDMLProperties(getIDMLElementProperties(marginPreferenceElement, ['Properties'], [])) as { [k: string]: string | undefined };
    const marginPreference: MarginPreference = {
      columnCount: ensureNumber(marginPreferenceProps['ColumnCount']),
      columnGutter: ensureNumber(marginPreferenceProps['ColumnGutter']),
      top: ensureNumber(marginPreferenceProps['Top']),
      left: ensureNumber(marginPreferenceProps['Left']),
      bottom: ensureNumber(marginPreferenceProps['Bottom']),
      right: ensureNumber(marginPreferenceProps['Right']),
      columnDirection: columnDirectionMap.getInternal(marginPreferenceProps['ColumnDirection']),
      columnsPositions: ensureArray(marginPreferenceProps['ColumnsPositions']),
    };

    const gridDataInformationElement = element.getElementsByTagName('GridDataInformation')[0];
    if (!gridDataInformationElement) {
      throw new Error('Page element missing GridDataInformation element');
    }
    const gridDataInformation = GridDataInformation.parseElement(gridDataInformationElement, context);

    return new Page(
      id,
      {
        name,
        pageColor,
        masterPageTransform,
        geometricBounds,
        itemTransform,
        gridStartingPoint,
        marginPreference,
        gridDataInformation,
      },
      context
    );
  }
}
