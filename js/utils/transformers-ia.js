// Minimal stub for transformers-ia used by dashboard.html
// This file intentionally lightweight to avoid 404 when the real transformer
// logic isn't present (development mode). Do not modify IA logic here.

console.log('[transformers-ia] stub loaded');

// Expose a no-op namespace for compatibility
window.transformersIA = window.transformersIA || {
    // placeholder for any methods the UI may call
    summarize: async function (text) { return null; },
    generate: async function (opts) { return null; }
};
