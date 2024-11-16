import { createIDML, IDML, PolygonSprite, TextFrame, toArrayBuffer, extractFontTable, determineFontType } from 'idml';
import fs from 'fs/promises';

const superVibesFont = toArrayBuffer(await fs.readFile('SuperVibes.ttf'));
const robotoFlexStaticFont = toArrayBuffer(await fs.readFile('RobotoFlex-Regular.ttf'));
// const robotoFlexFont = toArrayBuffer(await fs.readFile('RobotoFlex.ttf'));
// const robotoFlexWoff2Font = toArrayBuffer(await fs.readFile('RobotoFlex.woff2'));
const LatoRegularFont = toArrayBuffer(await fs.readFile('Lato-Regular.otf'));

console.log('super vibes ttf', determineFontType(superVibesFont));
// const idml = await createIDML({
//   pageGeometricBounds: { x: 0, y: 0, width: 500, height: 500 },
// });

// const spread = idml.getSpreads()[0];

// const oval = spread.createOval({
//   x: 250,
//   y: 250,
//   radiusX: 100,
//   radiusY: 100,
//   fill: { type: 'rgb', red: 255, green: 0, blue: 0 },
//   stroke: { type: 'rgb', red: 0, green: 255, blue: 0 },
//   strokeWeight: 3,
//   transform: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
//   opacity: 100,
//   dropShadow: {
//     mode: 'drop',
//     xOffset: 10,
//     yOffset: 10,
//     size: 50,
//     spread: 0,
//     effectColor: { type: 'rgb', red: 255, green: 0, blue: 0 },
//   },
// });

// // oval.setOpacity(34);

// // console.log('oval', oval, oval.getOpacity());

// oval.setVisible(true);

// console.log(oval.getVisible());

// const archive = await idml.export();
// await fs.writeFile('demo-export.idml', Buffer.from(archive));

const testFile = await fs.readFile('demo_2.idml');

const idml = new IDML(testFile);
idml.addEventListener('ready', async () => {
  console.log('IDML ready');

  const spread2 = idml.getSpreads()[1];
  const polygonWithText = spread2.getSprites()[1] as PolygonSprite;
  const textFrame = polygonWithText.getSprites()[0] as TextFrame;
  const oldTransform = textFrame.getTransform([0, 0]);
  textFrame.setTranform({ ...oldTransform, translateY: oldTransform.translateY + 25 }, [0, 0]);

  const story1 = textFrame.getStory()!;

  console.log('STORY 1', story1.id);

  idml.addFont(superVibesFont);
  idml.addFont(LatoRegularFont);

  console.log(story1.getParagraphs(true)[0]);

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

  const myGroup = spread2.createGroup({});

  const myPolygon = spread2.createPolygon(
    {
      paths: [[{ type: 'move', x: 100, y: 100 }, { type: 'cubicBezier', x: 200, y: 200, x1: 110, y1: 10, x2: 220, y2: 30 }, { type: 'line', x: 320, y: 320 }, { type: 'line', x: 320, y: 500 }, { type: 'close' }]],
    },
    myGroup
  );

  console.log('!!!', myPolygon);

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

  console.log('MY TEXT', myText);

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

  console.log('!!!', image);

  // const polygonWithImage = spread2.getSprites()[2] as PolygonSprite;
  // const image = polygonWithImage.getSprites()[0] as ImageSprite;
  // const oldTransform = image.getTransform([0, 0]);
  // console.log('Old Transform', oldTransform);
  // const newTransform = { ...oldTransform, translateX: oldTransform.translateX + 25 };
  // image.setTranform(newTransform, [0, 0]);

  // const polygonWithImage = idml.getSpreads()[0].getSprites()[0] as PolygonSprite;
  // const image = polygonWithImage.getSprites()[0] as ImageSprite;
  // polygon.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 }, [0, 0]);
  // polygon.setPath([[{ type: 'move', x: 100, y: 100 }, { type: 'cubicBezier', x: 200, y: 200, x1: 110, y1: 10, x2: 220, y2: 30 }, { type: 'close' }]]);
  //polygon.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 }, [0, 0]);
  // console.log('Polygon', polygonWithImage.getPath());
  // image.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 }, [0, 0]);
  // polygonWithImage.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 }, [0, 0]);
  // polygonWithImage.setPath([[{ type: 'move', x: 10, y: 10 }, { type: 'line', x: 1980, y: 10 }, { type: 'line', x: 1980, y: 1070 }, { type: 'line', x: 10, y: 1070 }, { type: 'close' }]]);
  // console.log('IMAGE', image.getBBox(), await image.getNaturalSize());
  // image.setBBox(20, 20, 200, 160);
  // image.setGraphicBounds(0, 0, 200, 160);

  // console.log('IMAGE', image.getGraphicBounds());

  // const polygonWithImage = idml.getSpreads()[1].getSprites()[2] as PolygonSprite;
  // polygonWithImage.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 }, [0, 0]);
  // polygonWithImage.setPath([[{ type: 'move', x: 100, y: 100 }, { type: 'cubicBezier', x: 200, y: 200, x1: 110, y1: 10, x2: 220, y2: 30 }, { type: 'close' }]]);

  // const myPolygon = idml.getSpreads()[1].getSprites()[2] as PolygonSprite;

  // myPolygon.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 }, [0, 0]);

  // myPolygon.setPath([[{ type: 'move', x: 100, y: 100 }, { type: 'cubicBezier', x: 200, y: 200, x1: 110, y1: 10, x2: 220, y2: 30 }, { type: 'close' }]]);

  // // myPolygon.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: Math.PI / 4 }, [0, 0]);
  // console.log('Polygon', myPolygon.getPath());

  // // const newMasterSpread = idml.createMasterSpread({
  // //   pageGeometricBounds: { x: 0, y: 0, width: 500, height: 500 },
  //   pageItemTransform: { translateX: -540, translateY: -540, scaleX: 1, scaleY: 1, rotate: 0 },
  //   name: 'Custom-Parent',
  //   namePrefix: 'Custom',
  //   baseName: 'Parent',
  // });

  // console.log('NEW MASTER SPREAD', newMasterSpread);

  // const newSpread = idml.createSpread(newMasterSpread);

  // console.log('Sprites', newSpread.getSprites());

  // const rect = newSpread.createRectangle({
  //   x: 100,
  //   y: 100,
  //   width: 100,
  //   height: 100,
  //   fill: { type: 'rgb', red: 255, green: 0, blue: 0 },
  //   stroke: { type: 'rgb', red: 0, green: 0, blue: 0 },
  //   transform: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
  // });

  // rect.setBBox(200, 200, 100, 100);

  // rect.setTranform({ translateX: 0, translateY: 0, scaleX: 2, scaleY: 2, rotate: 0 }, [250, 250]);

  // console.log(rect.getTransform([250, 250]));

  // const oval = newSpread.createOval({
  //   x: 400,
  //   y: 400,
  //   radiusX: 50,
  //   radiusY: 50,
  //   fill: { type: 'rgb', red: 0, green: 255, blue: 0 },
  //   stroke: { type: 'rgb', red: 0, green: 0, blue: 0 },
  //   transform: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
  // });

  // oval.setEllipse(700, 700, 200, 400);

  // oval.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: Math.PI / 2 }, [700, 700]);

  // console.log('ELLIPSE', oval.getTransform([700, 700]));

  // const textFrame1 = idml.getSpreads()[1].getSprites()[0] as TextFrame;
  // console.log('TextFrame', textFrame1.getTransform([960, 540]), textFrame1.getBBox());

  // textFrame1.setBBox(100, 100, 100, 100);
  // textFrame1.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: Math.PI / 4 }, [150, 150]);

  const archive = Buffer.from(await idml.export());
  await fs.writeFile('demo_2_export.idml', archive);
});
