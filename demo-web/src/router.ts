import { createRouter, createWebHistory } from 'vue-router';
import SVG2IDML from './views/SVG2IDML.vue';
import FlatSVG from './views/FlatSVG.vue';
import IDML from './views/IDML.vue';

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
  {
    path: '/idml',
    name: 'IDML',
    component: IDML,
  },
];

const router = createRouter({
  history: createWebHistory(),
  //history: createWebHistory(),
  routes,
});

export default router;
