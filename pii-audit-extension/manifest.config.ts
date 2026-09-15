import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Autocapture PII Audit',
  version: '0.1.0',
  description: 'Local, zero-egress audit of what Amplitude Autocapture would collect.',
  action: { default_popup: 'src/popup/index.html' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  permissions: ['scripting', 'tabs', 'activeTab', 'storage'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    // Channel A — MAIN world, must run before the SDK initializes.
    { matches: ['<all_urls>'], js: ['src/inject/interceptor.ts'], run_at: 'document_start', world: 'MAIN' },
    // Channel B + relay + overlay — isolated world.
    { matches: ['<all_urls>'], js: ['src/content/content.ts'], run_at: 'document_idle' },
  ],
  web_accessible_resources: [
    { resources: ['src/panel/index.html', 'assets/*', 'models/*', 'ort/*'], matches: ['<all_urls>'] },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
});
