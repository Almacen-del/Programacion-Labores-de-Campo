import { defineConfig } from 'vite';
export default defineConfig({
  build:{outDir:'dist/web',sourcemap:false},
  server:{port:5173,strictPort:true},
  preview:{port:4173,strictPort:true}
});
