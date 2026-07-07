<template>
  <div class="view view-idml-bluepic">
    <div class="toolbar">
      <!-- Pick the whole InDesign package FOLDER (.idml + Document fonts/ + Links/):
           webkitdirectory is what makes the picker fold-aware. -->
      <label>
        <n-button type="primary" tag="span">Select IDML folder</n-button>
        <input ref="folderInput" type="file" webkitdirectory multiple hidden @change="onInput" />
      </label>
      <!-- Or hand-pick the .idml plus individual asset files. -->
      <label>
        <n-button tag="span">Select files</n-button>
        <input type="file" multiple hidden @change="onInput" />
      </label>
      <span v-if="status" class="status">{{ status }}</span>
    </div>

    <!-- Asset state exposed by IdmlSerialConverter -->
    <div v-if="requiredFonts.length || missingImages.length" class="asset-bar">
      <div class="asset-group">
        <strong>Fonts:</strong>
        <span v-for="(f, i) in requiredFonts" :key="`rf-${i}`" class="asset-chip" :class="isFontMissing(f.family) ? 'warn' : 'ok'">
          {{ f.family }}{{ isFontMissing(f.family) ? ' — missing' : ' ✓' }}
        </span>
      </div>
      <div v-if="missingImages.length" class="asset-group">
        <strong>Missing images:</strong>
        <span v-for="(m, i) in missingImages" :key="`mi-${i}`" class="asset-chip warn">
          {{ m.linkURI ? decodeURIComponent(m.linkURI.split('/').pop() || '') : m.imageId }}
        </span>
      </div>
    </div>

    <div class="panes">
      <!-- Left: idml2svg dev preview (same parsed IDML instance) -->
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

      <!-- Right: the serials from IdmlSerialConverter, rendered by SerialWrapper -->
      <section class="pane">
        <h3>Bluepic Serial preview ({{ serials.length }})</h3>
        <div class="serial-list">
          <div v-for="(bundle, i) in serials" :key="`serial-${i}`" class="serial-block">
            <div class="serial-frame" :style="{ width: '420px', aspectRatio: `${bundle.serial.width} / ${bundle.serial.height}` }">
              <SerialWrapper :serial="bundle.serial as any" :load-fonts="true" />
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { NButton } from 'naive-ui';
import { ref, onMounted } from 'vue';
import SVGElement from '../components/SVGElement.vue';
import { convertIDML2SVG, IdmlSerialConverter, type AssetFile, type SpreadDocument } from '../../../src/main';
import { SerialWrapper } from '@bluepic/core';
import '@bluepic/core/style.css';

const spreads = ref<SpreadDocument[]>([]);
const serials = ref<any[]>([]);
const requiredFonts = ref<{ family: string }[]>([]);
const missingFontFamilies = ref<Set<string>>(new Set());
const missingImages = ref<{ imageId: string; linkURI?: string }[]>([]);
const status = ref('');
let converter: IdmlSerialConverter | null = null;

const isFontMissing = (family: string) => missingFontFamilies.value.has(family);

function readFile(file: File): Promise<AssetFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (reader.result instanceof ArrayBuffer ? resolve({ name: file.name, bytes: reader.result }) : reject(new Error('not an ArrayBuffer')));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Build/convert from a set of dropped files: the .idml plus any assets. */
async function run(files: AssetFile[]) {
  const idmlFile = files.find((f) => f.name.toLowerCase().endsWith('.idml'));
  if (!idmlFile) {
    status.value = 'No .idml found in the dropped files.';
    return;
  }
  const assets = files.filter((f) => f !== idmlFile);
  try {
    status.value = 'Parsing IDML…';
    converter = await IdmlSerialConverter.create(idmlFile.bytes, assets);
    requiredFonts.value = converter.requiredFonts.map((f) => ({ family: f.family }));
    missingFontFamilies.value = new Set(converter.missingFonts.map((f) => f.family));
    missingImages.value = converter.missingImages.map((m) => ({ imageId: m.imageId, linkURI: m.linkURI }));

    status.value = 'idml2svg preview…';
    spreads.value = await convertIDML2SVG(converter.document);

    status.value = 'Injecting fonts + converting (precise)…';
    serials.value = await converter.convert();

    // Re-read missing after convert (asset set unchanged here, but keeps the UI truthful).
    missingFontFamilies.value = new Set(converter.missingFonts.map((f) => f.family));
    status.value = `Done — ${serials.value.length} serial(s). ${missingFontFamilies.value.size ? `${missingFontFamilies.value.size} font(s) unresolved (fallback metrics).` : 'All fonts resolved & awaited.'}`;
    (window as any).__converter = converter;
    (window as any).__serials = serials.value.map((b: any) => b.serial);
  } catch (err) {
    console.error(err);
    status.value = `Error: ${(err as Error).message}`;
  }
}

function onInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length) Promise.all(files.map(readFile)).then(run);
  input.value = ''; // allow re-selecting the same folder
}

// Dev affordance: ?src=/foo.idml auto-loads a single IDML (no side assets — shows
// the "fonts unresolved → fallback" path). Drop a folder to see precise mode.
onMounted(async () => {
  const src = new URLSearchParams(location.search).get('src');
  if (!src) return;
  status.value = `Fetching ${src}…`;
  const bytes = await fetch(src).then((r) => r.arrayBuffer());
  await run([{ name: src.split('/').pop() || 'document.idml', bytes }]);
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

  .asset-bar {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 10px;
    font-size: 12px;
    color: #555;
    .asset-group {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }
  }

  .asset-chip {
    display: inline-block;
    background: #eef1f4;
    border-radius: 4px;
    padding: 1px 6px;
    &.warn {
      background: #ffe9e0;
      color: #a4502a;
    }
    &.ok {
      background: #e3f3e8;
      color: #2c6b42;
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
