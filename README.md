# IDML

A typescript library / API for manipulating InDesign Markup Language (IDML). Works in the browser and in nodejs.

## State of the project

From an IDML-perspective, this library covers just a subset of whats possible. IDML actually is a very complex format and it would bea an even bigger task to real cover all it's functionallity in such an API. The goal of this API:

1. Implementing what I neeeded to create an `svg2idml` converter
2. Creating an abstract handling for IDML structure, so that we can _modify_ what we need and understand but keep structures and information that _we do not understand_.

The result is a very stable library that can handle a subset of what IDML actually can **without** destroying informations and not-implemented stuff. But I would love to see any kind of development.

## Demo

Just run the `demo-web` project and visit `/flatsvg` and `/svg2idml` pages.

## SVG to IDML

As I said, the main goal of this library is the `svg2idml` converting functionallity. It makes use of the `flat-svg` module that is a general solution to reduce complexity of an SVG while keeping exactly what we can display in the target format.

```typescript
import {svg2idml} from 'idml'

const { idml } = await svg2idml(
    doc,
    // The rasterizing functionallity is outsourced because the way how we can make an bitmap out of an SVG differs from a browser and node nev
    // This function gets called when the converter needs to rasterize soemthing
    // THis is mostly the case for masks or filters
    async function rasterize(svg) {
      // This a function you need to implement depending on your env
      // Have a look at demo-web/src/renderSVG.ts
      const ab = await renderSVG(svg);
      // This functionallity is optional but reducdes the size of the rastered images within the final SVG a lot
      const visibleBBox = await getVisibleBBox(ab);
      if (!visibleBBox) {
        console.error('Failed to get visible bbox');
        return undefined;
      }
      return {
        left: visibleBBox?.left,
        top: visibleBBox?.top,
        width: visibleBBox?.width,
        height: visibleBBox?.height,
        buffer: await cropToVisibleBBox(ab, visibleBBox),
      };
    },
    // This optional because before rastering something, we like all filters to be evaluated
    // In a browser env, this is not needed because a canvas rendering (as used above) will do the job
    // But in a node env, we may use an SVG renderer that does not support filers as we expect, so this is workaround here
    async function applyColorMatrix(data, matrix) {
      // Nothing to do since canvas API renders SVG with filters already
      return data;
    },
    {
      vectorizeAllTexts: false,
      keepGroupTransforms: false,
    }
  );
  const idmlFile = new Blob([await idml.export()], { type: 'application/vnd.adobe.indesign-idml-package' });
};

```

## Example of IDML itself

```typescript
import { IDML } from 'idml';
const testFile = await fs.readFile('demo_2.idml');

const idml = new IDML(testFile);

idml.addEventListener('ready', async () => {
  console.log('IDML ready');

  const spread2 = idml.getSpreads()[1];
  // Some fun with a nested texts
  const polygonWithText = spread2.getSprites()[1] as PolygonSprite;
  const textFrame = polygonWithText.getSprites()[0] as TextFrame;
  const oldTransform = textFrame.getTransform([0, 0]);
  textFrame.setTranform({ ...oldTransform, translateY: oldTransform.translateY + 25 }, [0, 0]);

  // Some fun with stories
  const story1 = textFrame.getStory()!;
  story1.setPagaraphs([
    {
      paragraphStyle: {},
      features: [
        {
          characterStyle: {},
          content: 'Hello World',
        },
        {
          characterStyle: {
            appliedFont: 'Asphalt',
            underline: true,
            tracking: 100,
            fontSize: 22,
            leading: 10,
          },
          content: '\n\nwhats',
        },
        {
          characterStyle: {
            appliedFont: 'Comic Sans MS',
            fillColor: { type: 'rgb', red: 255, green: 0, blue: 0 },
            strokeColor: { type: 'rgb', red: 0, green: 0, blue: 255 },
            strikeThrough: true,
          },
          content: ' up?',
        },
      ],
    },
  ]);

  // more fun
  const myGroup = spread2.createGroup({});
  const myPolygon = spread2.createPolygon(
    {
      paths: [[{ type: 'move', x: 100, y: 100 }, { type: 'cubicBezier', x: 200, y: 200, x1: 110, y1: 10, x2: 220, y2: 30 }, { type: 'line', x: 320, y: 320 }, { type: 'line', x: 320, y: 500 }, { type: 'close' }]],
    },
    myGroup
  );

  const myText = spread2.createTextFrame(
    {
      x: 100,
      y: 100,
      width: 180,
      height: 60,
      paragraphs: [
        {
          paragraphStyle: {},
          features: [
            {
              characterStyle: {
                appliedFont: 'Anybody SemiBold',
                // fontStyle: 'Black',
                fontSize: 20,
                strokeWeight: 0,
                fillColor: { type: 'rgb', red: 0, green: 0, blue: 255 },
              },
              content: 'I was created manually :)',
            },
          ],
        },
      ],
    },
    myPolygon
  );

  const wrapperRect = spread2.createRectangle({
    x: 450,
    y: 600,
    width: 200,
    height: 200,
    fill: { type: 'rgb', red: 255, green: 0, blue: 0 },
  });

  const image = spread2.createImage(
    {
      x: 450,
      y: 600,
      width: 200,
      height: 200,
      data: await fs.readFile('example.jpg'),
    },
    wrapperRect
  );
});
```

### SVG2IDML
