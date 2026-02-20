<template>
  <svg :viewBox="[doc.viewBox.x, doc.viewBox.y, doc.viewBox.width, doc.viewBox.height].join(' ')" xmlns="http://www.w3.org/2000/svg">
    <template v-for="element in doc.elements">
      <SVGElement :element="element" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { SVGDocument } from '../../../dist/esm/idml2svg';
import SVGElement from './SVGElement.vue';

const props = defineProps<{
  doc: SVGDocument;
}>();
</script>
