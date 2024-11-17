<template>
  <div class="view view-svg2idml">
    <n-scrollbar>
      <div class="title-wrapper">
        <h1>SVG 2 IDML</h1>
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
      </div>
      <div class="actions">
        <n-button type="success" :disabled="!file" @click="triggerSVG2IDML">
          <template #icon>
            <n-icon>
              <code-slash-outline />
            </n-icon>
          </template>
          Convert to IDML
        </n-button>
      </div>
      <div v-if="simplifiedSVG" class="result-wrapper">
        <n-card>
          <div v-if="simplifiedSVGStr" class="preview-wrapper" v-html="simplifiedSVGStr" />
          <div class="result-actions">
            <n-button type="success" :disabled="!idmlResult" @click="triggerDownloadIDML">
              <template #icon>
                <n-icon>
                  <cloud-download-outline />
                </n-icon>
              </template>
              Download IDML
            </n-button>
          </div>
        </n-card>
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { NUpload, NUploadDragger, NText, NP, NIcon, NCard, NButton, NScrollbar } from 'naive-ui';
import { CodeSlashOutline, ArchiveOutline, CloudDownloadOutline } from '@vicons/ionicons5';
import { useFile } from '../util/fileUpload';
import download from 'downloadjs';
import { svg2idml } from 'idml';
import { cropToVisibleBBox, getVisibleBBox, renderSVG } from '../renderSVG';
import { ColorMatrix } from 'flat-svg';
import { downloadZip } from 'client-zip';
import { extension } from 'mime-types';

const { file, handleNewFileList, readFile } = useFile();

const idmlResult = ref<Blob>();
const simplifiedSVG = ref<Document>();
const simplifiedSVGStr = computed(() => {
  if (!simplifiedSVG.value) {
    return;
  }
  return new XMLSerializer().serializeToString(simplifiedSVG.value);
});

async function rasterize(svg: SVGSVGElement) {
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
}

async function applyColorMatrix(data: ArrayBuffer, matrices: ColorMatrix[]) {
  matrices;
  // Nothing to do since canvas API renders SVG with filters already
  return data;
}

(window as any).svg2idml = svg2idml;
(window as any).rasterize = rasterize;
(window as any).applyColorMatrix = applyColorMatrix;

async function convertSVG2IDMLPackage(svgRaw: string) {
  const doc = new DOMParser().parseFromString(svgRaw, 'image/svg+xml');
  const { idml, simlifiedSVGDocument, collectedFonts } = await svg2idml(doc, rasterize, applyColorMatrix, {
    vectorizeAllTexts: false,
    keepGroupTransforms: false,
  });

  const archive = await downloadZip([
    { name: 'file.idml', input: await idml.export() },
    { name: 'file.svg', input: new XMLSerializer().serializeToString(simlifiedSVGDocument) },
    ...collectedFonts.map((font) => {
      const ext = (() => {
        if (font.src.startsWith('data:')) {
          const mime = font.src.split(';')[0].split(':')[1];
          return extension(mime) || 'otf';
        } else {
          const url = new URL(font.src);
          return url.pathname.split('.').pop();
        }
      })();
      return { name: `${font.fullName}.${ext}`, input: font.data };
    }),
  ]).arrayBuffer();

  return archive;
}
(window as any).convertSVG2IDMLPackage = convertSVG2IDMLPackage;

const triggerSVG2IDML = async () => {
  if (!file) return;
  const svg = await readFile();
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');

  const { idml, simlifiedSVGDocument, collectedFonts } = await svg2idml(doc, rasterize, applyColorMatrix, {
    vectorizeAllTexts: false,
    keepGroupTransforms: false,
  });
  simplifiedSVG.value = simlifiedSVGDocument;

  idmlResult.value = new Blob([await idml.export()], { type: 'application/vnd.adobe.indesign-idml-package' });
};
const triggerDownloadIDML = () => {
  if (!idmlResult.value) {
    return console.error('No IDML result');
  }
  download(idmlResult.value, 'result.idml', 'application/vnd.adobe.indesign-idml-package');
};
</script>

<style scoped lang="scss">
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
  padding: 20px;
  box-sizing: border-box;
}
.actions {
  max-width: 600px;
  box-sizing: border-box;
  margin: auto;
  padding: 20px;
  display: flex;
  justify-content: center;
  > * {
    flex: 1;
  }
}
.result-wrapper {
  max-width: 600px;
  box-sizing: border-box;
  margin: auto;
  padding: 20px;

  display: flex;
  justify-content: center;
  .result-actions {
    margin-top: 20px;
    display: flex;
    > * {
      flex: 1;
    }
  }
}
</style>
