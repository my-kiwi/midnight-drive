import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // Ensures relative paths are used in the generated HTML
  plugins: [
    VitePWA({ registerType: 'autoUpdate' })
  ]
});
