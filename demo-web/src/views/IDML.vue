<template>
    <div class="view view-idml">
        <div class="upload-wrapper">
            <n-upload @change="handleChange">
                <n-button>Upload IDML file</n-button>
            </n-upload>
            
            
        </div>
        <div class="spreads-wrapper">
            <svg v-for="spread in spreads" xmlns="http://www.w3.org/2000/svg" :viewBox="`${spread.viewBox.x} ${spread.viewBox.y} ${spread.viewBox.width} ${spread.viewBox.height}`">
                <SVGElement v-for="page in spread.pages" :element="page" />
                
            </svg>
        </div>
    </div>
    </template>
<script lang="ts" setup>
import { NUpload, NButton, UploadFileInfo } from 'naive-ui';
import { ref, watch } from 'vue';
// import {GroupElement, IDML, type SVGDocument, SpreadDocument, convertIDML2SVG} from 'idml'
import SVGDoc from '../components/SVGDoc.vue';
import SVGElement from '../components/SVGElement.vue';
import { convertIDML2SVG, GroupElement, IDML, type SVGDocument, SpreadDocument } from '../../../src/main';

const idmlContents = ref<ArrayBuffer>();

function handleChange(data: {file: Required<UploadFileInfo>, fileList: Required<UploadFileInfo>[], event?: ProgressEvent<EventTarget> | Event}) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const arrayBuffer = e.target?.result;
        if (arrayBuffer instanceof ArrayBuffer) {
                console.log('IDML file uploaded:', data.file.name);
                idmlContents.value = arrayBuffer;
                // Here you can initialize your IDML processing with the arrayBuffer
        } else {
            console.error('Failed to read file as ArrayBuffer');
        }
    };
    reader.readAsArrayBuffer(data.file.file as any);

}


const idml = ref<IDML>();

const spreads = ref<SpreadDocument[]>();

watch(idmlContents, () => {
    if (!idmlContents.value) return;
    console.log('IDML contents updated, size:', idmlContents.value.byteLength);
    idml.value = new IDML(idmlContents.value);
    console.log('IDML instance created:', idml.value);

    idml.value.addEventListener('ready', async () => {
        spreads.value = await convertIDML2SVG(idml.value!);
        console.log('spreads', spreads.value);
        
    })
})
</script>

<style scoped lang="scss">
.view-idml {
    padding: 16px;
    box-sizing: border-box;
    overflow: scroll;
    .spreads-wrapper {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-top: 16px;
        box-sizing: border-box;

        svg {
            border: 1px solid #ccc;
            background-color: #f9f9f9;
            width: 100%;
        }
    }
}
</style>