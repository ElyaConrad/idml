<template>
  <div class="view view-flat-svg">
    <n-scrollbar>
      <div class="title-wrapper">
        <h1>Flat SVG</h1>
      </div>
      <div class="upload-wrapper">
        <n-upload :max="1" accept="image/svg+xml" @update:file-list="handleNewFileList">
          <n-upload-dragger>
            <div style="margin-bottom: 12px">
              <n-icon size="48" :depth="3">
                <archive-outline />
              </n-icon>
            </div>
            <n-text style="font-size: 16px"> Click or drag an SVG file to this area to upload </n-text>
            <n-p depth="3" style="margin: 8px 0 0 0"> Strictly prohibit from uploading sensitive information. For example, your bank card PIN or your credit card expiry date. </n-p>
          </n-upload-dragger>
        </n-upload>
        <n-card class="options-card">
          <template #header>
            <div class="options-title">
              <h3>Options</h3>
            </div>
          </template>
          <n-space item-style="display: flex;">
            <n-checkbox v-model:checked="keepGroupTransforms" label="Keep group transforms" :disabled="!file" />
            <n-checkbox v-model:checked="rasterizeAllMasks" label="Rasterize all masks" :disabled="!file" />
            <n-checkbox v-model:checked="vectorizeAllTexts" label="Vectorize all texts" :disabled="!file" />
          </n-space>
        </n-card>
        <div class="actions">
          <n-button type="success" :disabled="!file" @click="triggerFlatSVG">
            <template #icon>
              <n-icon>
                <code-slash-outline />
              </n-icon>
            </template>
            Flat
          </n-button>
        </div>
      </div>
      <div class="result-wrapper">
        <div v-if="loading" class="loading-wrapper">
          <div class="lds-heart"><div></div></div>
        </div>
        <template v-else>
          <n-card v-if="svgOriginal" class="result-card">
            <template #header>
              <div class="result-description">
                <h3>Original ({{ bytes(svgOriginal.length) }})</h3>
              </div>
            </template>
            <div class="svg-result" v-html="svgOriginal" />
          </n-card>
          <n-card v-if="svgResult" class="result-card">
            <template #header>
              <div class="result-description">
                <h3>Flat ({{ bytes(svgResult.length) }})</h3>
              </div>
            </template>
            <div class="svg-result" v-html="svgResult" />
          </n-card>
        </template>
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { NUpload, NUploadDragger, NP, NText, NIcon, NCard, NCheckbox, NScrollbar, NButton, NSpace } from 'naive-ui';
import { ArchiveOutline, CodeSlashOutline } from '@vicons/ionicons5';
import { ref } from 'vue';
import { cleanupBluepicSVG, simplifySVG } from 'flat-svg';
import { cropToVisibleBBox, getVisibleBBox, renderSVG } from '../renderSVG';
import bytes from 'bytes';
import { useFile } from '../util/fileUpload';
import { getAllVisibleElements } from '../util/getAllVisibleElements';

const keepGroupTransforms = ref(false);
const rasterizeAllMasks = ref(false);
const vectorizeAllTexts = ref(false);

const { file, handleNewFileList, readFile } = useFile();

const svgOriginal = ref<string>();
const svgResult = ref<string>();

const loading = ref(false);
async function triggerFlatSVG() {
  loading.value = true;
  const originalSVG = await readFile();
  svgOriginal.value = originalSVG;
  const doc = new DOMParser().parseFromString(originalSVG, 'image/svg+xml');

  console.time('cleanupBluepicSVG');
  cleanupBluepicSVG(doc, (document) => getAllVisibleElements(document).filter((el) => getAllVisibleElements(el).length > 1));
  console.timeEnd('cleanupBluepicSVG');

  console.time('simplifySVG');

  const simplifiedSVG = await simplifySVG(doc, {
    keepGroupTransforms: keepGroupTransforms.value,
    rasterizeAllMasks: rasterizeAllMasks.value,
    vectorizeAllTexts: vectorizeAllTexts.value,
    async rasterize(svg) {
      const ab = await renderSVG(svg);
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
    async applyColorMatrix(data, matrix) {
      matrix;
      // Nothing to do since canvas API renders SVG with filters already
      return data;
    },
  });

  console.timeEnd('simplifySVG');

  const newSVG = new XMLSerializer().serializeToString(simplifiedSVG);

  svgResult.value = newSVG;

  loading.value = false;
}
</script>

<style scoped lang="scss">
@import '../spinner.css';
.view {
}
h1,
h2,
h3 {
  margin: 0;
}
.title-wrapper {
  padding: 20px;
  box-sizing: border-box;
  margin: auto;
  max-width: 600px;
  text-align: center;
}
.upload-wrapper {
  max-width: 600px;
  margin: auto;
}
.options-title {
  font-size: 0.8em;
}
.actions {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  > * {
    flex: 1;
  }
}
.options-card {
  margin-top: 20px;
}
.result-wrapper {
  margin-top: 20px;
  padding: 20px;
  display: flex;
  gap: 10px;
  .result-description {
    > h3 {
      font-size: 0.8em;
    }
  }
  .result-card {
  }
}
</style>
