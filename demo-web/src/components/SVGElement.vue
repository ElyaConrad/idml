<template>
  <defs v-if="gradient">
    <linearGradient v-if="gradient.type === 'linearGradient'" :id="gradientId" :x1="gradient.attrs.x1" :y1="gradient.attrs.y1" :x2="gradient.attrs.x2" :y2="gradient.attrs.y2" :gradientUnits="gradient.attrs.gradientUnits">
      <stop v-for="(colorStop) in gradient.stops" :offset="colorStop.offset * 100 + '%'" :stop-color="colorStop.stopColor" :stop-opacity="colorStop.stopOpacity" />
    </linearGradient>
    <radialGradient v-else-if="gradient.type === 'radialGradient'" :id="gradientId" :cx="gradient.attrs.cx" :cy="gradient.attrs.cy" :r="gradient.attrs.r" :fx="gradient.attrs.fx" :fy="gradient.attrs.fy" :gradientUnits="gradient.attrs.gradientUnits">
      <stop v-for="(colorStop) in gradient.stops" :offset="colorStop.offset * 100 + '%'" :stop-color="'#000'" :stop-opacity="colorStop.stopOpacity" />
    </radialGradient>
  </defs>
  <rect v-if="element.type === 'rectangle'" :x="element.x" :y="element.y" :width="element.width" :height="element.height" :style="elementStyle" v-bind="{ ...dataAttrs }" />
  <image v-else-if="element.type === 'image'" :x="element.x" :y="element.y" :width="element.width" :height="element.height" :style="elementStyle" :href="dataUrl ?? undefined" v-bind="{ ...dataAttrs }" />
  <g v-else-if="element.type === 'text'" class="text-fragment" :style="elementStyle" v-bind="{ ...dataAttrs }">
    <g v-for="({ paragraph, lines }, paragraphIndex) in renderTextParagraphs(element.paragraphs ?? [])">
      <text v-for="(lineFeatures, lineIndex) in lines" :x="getXValueForTextFragment(element, getParagraphStyle(paragraph).align ?? 'left')" :y="element.y + paragraphIndex * getParagraphHeight(paragraph) + lines.slice(0, lineIndex).reduce((acc, line) => acc + getLineHeight(paragraph, line), 0)" :style="composeParagraphStyle(paragraph)" :data-test="JSON.stringify(paragraph.appliedParagraphStyle)">
        <tspan v-for="feature in lineFeatures" :style="composeSpanStyle(feature)">
          {{ feature.content }}
        </tspan>
      </text>
    </g>
  </g>
  <ellipse v-else-if="element.type === 'oval'" :cx="element.x" :cy="element.y" :rx="element.radiusX" :ry="element.radiusY" :style="elementStyle" v-bind="{ ...dataAttrs }" />
  <path v-else-if="element.type === 'path'" :d="PolygonSprite.pathsToSVGDAttribute(element.paths)" :style="elementStyle" v-bind="{ ...dataAttrs }" />
  <g v-else-if="element.type === 'group'" :style="elementStyle" v-bind="{ ...dataAttrs }">
    <template v-for="subElement in element.children">
      <SVGElement :element="subElement" />
    </template>
  </g>
  <g v-else-if="element.type === 'mask'" :style="{stroke: elementStyle.stroke, strokeWidth: elementStyle.strokeWidth}" v-bind="{ ...dataAttrs }" :data-element-type="element.type">
    <defs>
      <clipPath :id="`mask-${maskId}`">
        <template v-for="maskingElement in element.mask">
          <SVGElement :element="maskingElement" />
        </template>
      </clipPath>
    </defs>
    <g :style="{transform: elementStyle.transform}" :clip-path="`url('#mask-${maskId}')`" v-bind="{ ...dataAttrs }">
      <template v-for="maskedElement in element.children">
        <SVGElement :element="maskedElement" />
      </template>
    </g>
  </g>
</template>

<script lang="ts">
export default {
  name: 'SVGElement',
};
</script>

<script setup lang="ts">
import { Matrix } from 'transformation-matrix';
import { type SVGElement, PolygonSprite, type ParagraphOutput, Color, TextElement, renderTextParagraphs, convertGradientToSVG, GradientDescriptor } from '../../../src/main';
import { computed, onMounted } from 'vue';
import { nanoid } from 'nanoid';
import { Align } from '../../../src/controllers/ParagraphStyle';
import { randomUid } from '../util/randomUid';

const props = defineProps<{
  element: SVGElement;
}>();

const maskId = nanoid();

function transformMatrixToCSSFunctionCall(matrix: Matrix): string {
  return `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, ${matrix.e}, ${matrix.f})`;
}

function isSurfaceShape(element: SVGElement): element is Extract<SVGElement, { type: 'rectangle' | 'oval' | 'path' | 'group' | 'mask' }> {
  return element.type === 'rectangle' || element.type === 'oval' || element.type === 'path' || element.type === 'group' || element.type === 'mask';
}

const gradientId = randomUid();
const gradient = computed(() => {
  if (isSurfaceShape(props.element) && props.element.style.fill?.type === 'gradient') {
    return convertGradientToSVG(props.element.style.fill as GradientDescriptor)
  }
})

const elementStyle = computed(() => {
  const hasNoFillAndNoStroke = false;isSurfaceShape(props.element) && !props.element.style.fill && !props.element.style.stroke;
  return {
    transform: transformMatrixToCSSFunctionCall(props.element.transform),
    fill: isSurfaceShape(props.element) ? props.element.style.fill ? props.element.style.fill.type === 'color' ? `rgba(${props.element.style.fill.red}, ${props.element.style.fill.green}, ${props.element.style.fill.blue}, ${props.element.style.fill.alpha})` : `url(#${gradientId})` : 'none' : undefined,
    stroke: isSurfaceShape(props.element) ? props.element.style.stroke ? props.element.style.stroke.type === 'color' ? `rgba(${props.element.style.stroke.red}, ${props.element.style.stroke.green}, ${props.element.style.stroke.blue}, ${props.element.style.stroke.alpha})` : undefined : hasNoFillAndNoStroke ? 'rgba(0, 0, 0, 1)' : 'none' : undefined,
    strokeWidth: isSurfaceShape(props.element) ? hasNoFillAndNoStroke ? 1 : props.element.style.strokeWidth : undefined,
    opacity: isSurfaceShape(props.element) ? props.element.style.opacity / 100 : undefined,
  };
});

const dataAttrs = computed(() => {
  if ('data' in props.element) {
    return Object.fromEntries(Object.entries(props.element.data!).map(([key, value]) => [`data-${key}`, value]));
  }
  return {};
});

function arrayBufferToDataURL(buffer: ArrayBuffer, mimeType: string): string {
  return `data:${mimeType};base64,${btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''))}`;
}
const dataUrl = computed(() => {
  if (props.element.type === 'image') {
    if (props.element.contents && props.element.imageType) {
      return arrayBufferToDataURL(props.element.contents, props.element.imageType.mime);
    } else {
      return `data:image/svg+xml;base64,${btoa(`<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#EFF1F3"/><path fill-rule="evenodd" clip-rule="evenodd" d="M33.2503 38.4816C33.2603 37.0472 34.4199 35.8864 35.8543 35.875H83.1463C84.5848 35.875 85.7503 37.0431 85.7503 38.4816V80.5184C85.7403 81.9528 84.5807 83.1136 83.1463 83.125H35.8543C34.4158 83.1236 33.2503 81.957 33.2503 80.5184V38.4816ZM80.5006 41.1251H38.5006V77.8751L62.8921 53.4783C63.9172 52.4536 65.5788 52.4536 66.6039 53.4783L80.5006 67.4013V41.1251ZM43.75 51.6249C43.75 54.5244 46.1005 56.8749 49 56.8749C51.8995 56.8749 54.25 54.5244 54.25 51.6249C54.25 48.7254 51.8995 46.3749 49 46.3749C46.1005 46.3749 43.75 48.7254 43.75 51.6249Z" fill="#687787"/></svg>`)}`;
    }
  }
  return null;
});

function getXValueForTextFragment(element: TextElement, align: Align) {
  const factualShiftX = (() => {
    switch (align) {
      case 'left':
      case 'justifyLeft':
        return 0;
      case 'center':
      case 'justifyCenter':
        return 0.5;
      case 'right':
      case 'justifyRight':
        return 1;
      case 'justify':
        return 0;
      case 'justifyAll':
        return 0;
    }
  })();
  return element.x + element.width * factualShiftX;
}

function getParagraphStyle(paragraph: ParagraphOutput) {
  return {
    ...paragraph.appliedParagraphStyle,
    ...paragraph.localParagraphStyle,
  };
}
function getCharacterStyle(feature: ParagraphOutput['features'][number]) {
  return {
    ...feature.appliedCharacterStyle,
    ...feature.localCharacterStyleInput,
  };
}

function getParagraphHeight(paragraph: ParagraphOutput, localFontSize?: number) {
  const { leading, autoLeading, fontSize } = getParagraphStyle(paragraph);
  if (leading !== undefined) {
    return leading;
  } else if (autoLeading !== undefined) {
    return (localFontSize ?? fontSize ?? 12) * autoLeading;
  } else {
    return (localFontSize ?? fontSize ?? 12) * 1.2;
  }
}

function getLineHeight(paragraph: ParagraphOutput, line: ParagraphOutput['features'][number][]) {
  const paragraphStyle = getParagraphStyle(paragraph);
  const paragraphFontSize = paragraphStyle.fontSize ?? 12;
  let height = 0;
  for (const feature of line) {
    const characterStyle = getCharacterStyle(feature);
    const fontSize = characterStyle.fontSize ?? paragraphFontSize;
    height = Math.max(height, fontSize * 1.2);
  }
  return height;
}

function composeParagraphStyle(paragraph: ParagraphOutput) {
  const styleObj: Record<string, string> = {};
  const paragraphStyle = getParagraphStyle(paragraph);
  console.log('paragraphStyle', paragraph, paragraphStyle);
  
  if (paragraphStyle.fontSize !== undefined) {
    styleObj['font-size'] = `${paragraphStyle.fontSize}px`;
  }
  if (paragraphStyle.fillColor !== undefined) {
    styleObj['fill'] = Color.colorInputToCSSColor(paragraphStyle.fillColor);
  }
  if (paragraphStyle.align !== undefined) {
    styleObj['text-anchor'] = paragraphStyle.align === 'center' ? 'middle' : paragraphStyle.align === 'right' ? 'end' : 'start';
  }
  return {
    ...styleObj,
    'dominant-baseline': 'hanging' as any,
  };
}
function composeSpanStyle(feature: ParagraphOutput['features'][number]) {
  const styleObj: Record<string, string> = {};
  const characterStyle = getCharacterStyle(feature);
  if (characterStyle.fontSize !== undefined) {
    styleObj['font-size'] = `${characterStyle.fontSize}px`;
  }
  if (characterStyle.fillColor !== undefined) {
    styleObj['fill'] = Color.colorInputToCSSColor(characterStyle.fillColor);
  }
  if (characterStyle.underline) {
    styleObj['text-decoration'] = 'underline';
  }
  if (characterStyle.strikeThrough) {
    styleObj['text-decoration'] = styleObj['text-decoration'] ? `${styleObj['text-decoration']} line-through` : 'line-through';
  }
  if (characterStyle.fontStyle !== undefined) {
    if (characterStyle.fontStyle === 'Bold') {
      styleObj['font-weight'] = 'bold';
    } else if (characterStyle.fontStyle === 'Italic') {
      styleObj['font-style'] = 'italic';
    }
  }
  return styleObj;
}

onMounted(() => {
  // if (props.element.type === 'text' && props.element.paragraphs) {
  //   console.log('Text element encountered:', props.element, renderTextParagraphs(props.element.paragraphs), {
  //     text: renderTextParagraphsToText(props.element.paragraphs),
  //   });
  // }
  if (props.element.type === 'oval') {
    console.log('OVAL', props.element);
    
  }
});
</script>
