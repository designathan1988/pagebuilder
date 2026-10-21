// The customer dashboard is served at /painel/, next to the editor (served at /): both on the same origin share the
// Supabase session, kept in localStorage. The build goes to the editor's dist/painel (run the editor build first).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/painel/',
  plugins: [react()],
  build: { outDir: '../../dist/painel', emptyOutDir: true },
  server: { port: 5330 },
});
