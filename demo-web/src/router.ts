import { createRouter, createWebHistory } from 'vue-router';
import FlatSVG from './views/FlatSVG.vue';
import IDML from './views/IDML.vue';
import IDMLBluepic from './views/IDMLBluepic.vue';

const routes = [
  {
    path: '/',
    redirect: '/flatsvg',
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
  {
    path: '/idml-bluepic',
    name: 'IDMLBluepic',
    component: IDMLBluepic,
  },
];

const router = createRouter({
  history: createWebHistory(),
  //history: createWebHistory(),
  routes,
});

export default router;
