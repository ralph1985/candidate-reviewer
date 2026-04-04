import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/cr',
  output: 'static',
  vite: {
    plugins: [tailwindcss()]
  }
});
