<template>
    <div class="view view-idml">
        <div class="upload-wrapper">
            <n-upload @change="handleChange">
                <n-button>Upload IDML file</n-button>
            </n-upload>
        </div>
    </div>
    </template>
<script lang="ts" setup>
import { NUpload, NButton, UploadFileInfo } from 'naive-ui';
import { ref, watch } from 'vue';
import {IDML} from 'idml'

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

watch(idmlContents, () => {
    if (!idmlContents.value) return;
    console.log('IDML contents updated, size:', idmlContents.value.byteLength);
    idml.value = new IDML(idmlContents.value);
    console.log('IDML instance created:', idml.value);
})
</script>