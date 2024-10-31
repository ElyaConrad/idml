<template>
  <div class="root"></div>
</template>

<script setup lang="ts">
import { comboundPaths } from 'svg-simple';

const svgRaw = await fetch('/test.svg').then((res) => res.text());
const doc = new DOMParser().parseFromString(svgRaw, 'image/svg+xml');
const svg = doc.querySelector('svg')!;

const clipPath2 = svg.getElementById('clip2');
const paths = comboundPaths(Array.from(clipPath2.children), doc);

console.log('paths', paths);
</script>

<style scoped lang="scss">
.root {
}
</style>
