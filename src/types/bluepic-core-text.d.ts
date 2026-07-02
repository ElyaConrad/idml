// This tsconfig still uses moduleResolution "Node" (node10), which cannot see
// package.json `exports` subpaths — so `@bluepic/core/text` wouldn't resolve
// for TypeScript even though Node/Vite resolve it fine at runtime. Bridge it
// to the shipped d.ts by path. Delete this file once moduleResolution moves
// to "Bundler"/"Node16".
declare module '@bluepic/core/text' {
  export * from '@bluepic/core/lib/text/index';
}
