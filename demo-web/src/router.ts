import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import SVG2IDML from './views/SVG2IDML.vue';
import FlatSVG from './views/FlatSVG.vue';

import { useDialog } from 'naive-ui';

const routes = [
  {
    path: '/',
    redirect: '/flatsvg',
  },
  {
    path: '/svg2idml',
    name: 'SVG2IDML',
    component: SVG2IDML,
  },
  {
    path: '/flatsvg',
    name: 'FlatSVG',
    component: FlatSVG,
  },
];

const router = createRouter({
  history: createWebHistory(),
  //history: createWebHistory(),
  routes,
});

export default router;
