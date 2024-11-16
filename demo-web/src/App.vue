<template>
  <div class="root">
    <n-config-provider>
      <n-message-provider>
        <n-dialog-provider>
          <router-view />
        </n-dialog-provider>
      </n-message-provider>
    </n-config-provider>
  </div>
</template>

<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui';
// import { cleanupBluepicSVG, simplifySVG } from 'flat-svg';
// import * as Inliner from 'inline-style-parser';
// import { onMounted, ref } from 'vue';
// import download from 'downloadjs';
// import { IDML } from 'idml';
// console.log(simplifySVG);

// console.log(IDML);

// const canvasRef = ref<HTMLCanvasElement>();
// const context = ref<CanvasRenderingContext2D>();
// onMounted(() => {
//   const canvas = canvasRef.value!;
//   context.value = canvas.getContext('2d') ?? undefined;

//   if (!context.value) {
//     console.error('Failed to get 2d context');
//   }
// });

// const demoImage = ref<string>();
// const demoSVG = ref<string>();

// (async () => {
//   const svgRaw = await fetch('/bx-test-9.svg').then((res) => res.text());
//   const doc = new DOMParser().parseFromString(svgRaw, 'image/svg+xml');

//   console.log(doc);
//   // const svg = doc.querySelector('svg')!;

//   // const visibleBBox = await getVisibleBBox(ab);
//   // if (!visibleBBox) {
//   //   console.error('Failed to get visible bbox');
//   //   return undefined;
//   // }
//   // const result = {
//   //   left: visibleBBox?.left,
//   //   top: visibleBBox?.top,
//   //   width: visibleBBox?.width,
//   //   height: visibleBBox?.height,
//   //   image: await cropToVisibleBBox(ab, visibleBBox),
//   // };

//   // console.log('visibleBBox', visibleBBox);

//   // const blob = new Blob([ab], { type: 'image/png' });
//   // const url = URL.createObjectURL(blob);

//   // demoImage.value = url;

//   function getAllVisibleElements(elOrDoc: Element | Document) {
//     return Array.from(elOrDoc.querySelectorAll('.element')).filter((el) => el.closest('defs') === null);
//   }
//   console.time('cleanupBluepicSVG');
//   cleanupBluepicSVG(doc, (document) => getAllVisibleElements(document).filter((el) => getAllVisibleElements(el).length > 1));
//   console.timeEnd('cleanupBluepicSVG');

//   console.time('simplifySVG');

//   const simplifiedSVG = await simplifySVG(doc, {
//     keepGroupTransforms: true,
//     rasterizeAllMasks: true,
//     vectorizeAllTexts: true,
//     async rasterize(svg) {
//       const ab = await renderSVG(svg);
//       const visibleBBox = await getVisibleBBox(ab);
//       if (!visibleBBox) {
//         console.error('Failed to get visible bbox');
//         return undefined;
//       }
//       return {
//         left: visibleBBox?.left,
//         top: visibleBBox?.top,
//         width: visibleBBox?.width,
//         height: visibleBBox?.height,
//         buffer: await cropToVisibleBBox(ab, visibleBBox),
//       };
//     },
//     // async applyColorMatrix(data, matrices) {
//     //   return data;
//     //   // const blob = new Blob([data], { type: 'image/png' });

//     //   // const url = URL.createObjectURL(blob);

//     //   // window.open(url);
//     //   // console.log('applyColorMatrices', data, matrices);

//     //   // const result = await applyColorMatricesToImage(data, matrices);

//     //   // // const blob2 = new Blob([result], { type: 'image/png' });
//     //   // // const url2 = URL.createObjectURL(blob2);

//     //   // // window.open(url2);

//     //   // return result;
//     // },
//   });

//   console.timeEnd('simplifySVG');

//   const newSVG = simplifiedSVG.querySelector('svg')!;

//   demoSVG.value = new XMLSerializer().serializeToString(newSVG);

//   const blob = new Blob([new XMLSerializer().serializeToString(newSVG)], { type: 'image/svg+xml' });
//   const url = URL.createObjectURL(blob);

//   // window.open(url);

//   demoImage.value = url;
// })();

// cleanupBluepicSVG(doc, (document) => Array.from(document.querySelectorAll('.element')));

// const svg = doc.querySelector('svg')!;

// const clipPath2 = svg.getElementById('clip2');
// const paths = comboundPaths(Array.from(clipPath2.children), doc);

// console.log('paths', paths);
</script>

<style lang="scss">
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  width: 100%;
  height: 100%;
}
</style>

<style scoped lang="scss">
.root {
  height: 100%;
  width: 100%;
  .n-config-provider {
    height: 100%;
    width: 100%;
    .view {
      height: 100%;
      width: 100%;
    }
  }
}
</style>
