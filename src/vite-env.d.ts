/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Version de l'app, injectée par Vite (depuis package.json). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_GEMINI_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
