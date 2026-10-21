// O painel do cliente é servido em /painel/, ao lado do editor (servido em /): os dois na mesma origem dividem a
// sessão do Supabase, guardada no localStorage. O build vai para dist/painel do editor (rode o build do editor antes).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/painel/',
  plugins: [react()],
  build: { outDir: '../../dist/painel', emptyOutDir: true },
  server: { port: 5330 },
});
