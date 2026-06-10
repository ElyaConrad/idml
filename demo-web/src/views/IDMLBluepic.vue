<template>
  <div class="view view-idml-bluepic">
    <div class="toolbar">
      <n-upload @change="handleChange">
        <n-button type="primary">Upload IDML file</n-button>
      </n-upload>
      <span v-if="status" class="status">{{ status }}</span>
    </div>

    <div class="panes">
      <!-- Left: the existing SVG dev preview (per spread) -->
      <section class="pane">
        <h3>SVG preview (dev)</h3>
        <div class="svg-list">
          <svg
            v-for="(spread, i) in spreads"
            :key="`svg-${i}`"
            xmlns="http://www.w3.org/2000/svg"
            :viewBox="`${spread.viewBox.x} ${spread.viewBox.y} ${spread.viewBox.width} ${spread.viewBox.height}`"
          >
            <SVGElement v-for="page in spread.pages" :element="page" />
          </svg>
        </div>
      </section>

      <!-- Right: the generated Bluepic Serial(s), rendered by SerialWrapper (per page) -->
      <section class="pane">
        <h3>Bluepic Serial preview ({{ serials.length }})</h3>
        <div class="serial-list">
          <div
            v-for="(serial, i) in serials"
            :key="`serial-${i}`"
            class="serial-frame"
            :style="{ width: '420px', aspectRatio: `${serial.width} / ${serial.height}` }"
          >
            <SerialWrapper :serial="serial as any" :load-fonts="true" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { NUpload, NButton, UploadFileInfo } from 'naive-ui';
import { ref, watch, onMounted } from 'vue';
import SVGElement from '../components/SVGElement.vue';
import { convertIDML2SVG, convertIDML2Serial, IDML, type SpreadDocument } from '../../../src/main';
import { SerialWrapper } from '@bluepic/core';
import '@bluepic/core/style.css';

const idmlContents = ref<ArrayBuffer>();
const idml = ref<IDML>();
const spreads = ref<SpreadDocument[]>([]);
const serials = ref<any[]>([]);
const status = ref('');

function handleChange(data: { file: Required<UploadFileInfo>; fileList: Required<UploadFileInfo>[]; event?: ProgressEvent<EventTarget> | Event }) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const arrayBuffer = e.target?.result;
    if (arrayBuffer instanceof ArrayBuffer) {
      idmlContents.value = arrayBuffer;
    } else {
      console.error('Failed to read file as ArrayBuffer');
    }
  };
  reader.readAsArrayBuffer(data.file.file as any);
}

// Dev affordance: ?src=/4-pages.idml auto-loads an IDML served by the dev server.
onMounted(async () => {
  // TEMP: feed the re-linked image in for the unknown (linked) image sprite.
  (window as any).__imageOverrides = { u1e2: '/COVER%20V2_sRGB.png' };
  const src = new URLSearchParams(location.search).get('src');
  if (!src) return;
  status.value = `Fetching ${src}…`;
  idmlContents.value = await fetch(src).then((r) => r.arrayBuffer());
});

watch(idmlContents, () => {
  if (!idmlContents.value) return;
  status.value = 'Parsing IDML…';
  idml.value = new IDML(idmlContents.value);
  (window as any).__idml = idml.value;
  idml.value.addEventListener('ready', async () => {
    try {
      spreads.value = await convertIDML2SVG(idml.value!);
      status.value = 'Building Bluepic Serial(s)…';
      serials.value = await convertIDML2Serial(idml.value!);
      status.value = `Done — ${spreads.value.length} spread(s), ${serials.value.length} serial(s).`;
      (window as any).__serials = serials.value;
      console.log('serials', serials.value);
    } catch (err) {
      console.error(err);
      status.value = `Error: ${(err as Error).message}`;
    }
  });
});
</script>

<style scoped lang="scss">
.view-idml-bluepic {
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  .toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 0 0 auto;
    .status {
      color: #666;
      font-size: 13px;
    }
  }

  .panes {
    display: flex;
    gap: 24px;
    margin-top: 16px;
    flex: 1 1 auto;
    overflow: hidden;

    .pane {
      flex: 1 1 50%;
      display: flex;
      flex-direction: column;
      overflow: hidden;

      h3 {
        margin: 0 0 8px;
        font-size: 14px;
        color: #333;
        flex: 0 0 auto;
      }

      .svg-list,
      .serial-list {
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-right: 8px;
      }

      svg {
        border: 1px solid #ccc;
        background: #f9f9f9;
        width: 100%;
      }

      .serial-frame {
        border: 1px solid #ccc;
        background-image: linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%);
        background-size: 16px 16px;
        background-position: 0 0, 0 8px, 8px -8px, -8px 0;

        :deep(.serial-wrapper) {
          width: 100%;
          height: 100%;
        }
      }
    }
  }
}
</style>
