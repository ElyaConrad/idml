import { IDML } from 'idml';
import fs from 'fs/promises';

const testFile = await fs.readFile('demo.idml');

const idml = new IDML(testFile);
idml.addEventListener('ready', async () => {
  console.log('IDML ready');

  const newSpread = idml.createSpread();

  console.log('Sprites', newSpread.getSprites());

  const rect = newSpread.createRectangle({
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    fill: { type: 'rgb', red: 255, green: 0, blue: 0 },
    stroke: { type: 'rgb', red: 0, green: 0, blue: 0 },
    transform: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
  });

  rect.setBBox(200, 200, 100, 100);

  // const newTransform = rect.relativeTransform({ translateX: 0, translateY: 0, scaleX: 2, scaleY: 2, rotate: 0 }, [200, 200]);

  // console.log('rect', rect, rect.getGeometricBounds(), newTransform);

  rect.setTranform({ translateX: 0, translateY: 0, scaleX: 2, scaleY: 2, rotate: 0 }, [250, 250]);

  console.log(rect.getTransform([250, 250]));

  const oval = newSpread.createOval({
    x: 400,
    y: 400,
    radiusX: 50,
    radiusY: 50,
    fill: { type: 'rgb', red: 0, green: 255, blue: 0 },
    stroke: { type: 'rgb', red: 0, green: 0, blue: 0 },
    transform: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 },
  });

  oval.setEllipse(700, 700, 200, 400);

  oval.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: Math.PI / 2 }, [700, 700]);

  console.log('ELLIPSE', oval.getTransform([700, 700]));

  const textFrame1 = idml.getSpreads()[1].getSprites()[0] as any;
  console.log('TextFrame', textFrame1.getTransform([960, 540]), textFrame1.getBBox());

  textFrame1.setBBox(100, 100, 100, 100);
  textFrame1.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: Math.PI / 4 }, [150, 150]);

  const archive = Buffer.from(await idml.export());
  await fs.writeFile('demo-export-2.idml', archive);
});
