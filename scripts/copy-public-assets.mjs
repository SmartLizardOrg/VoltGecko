// Build both offline PDF resources and the notices shipped with the static app.
await import('./copy-pdf-assets.mjs');
await import('./copy-third-party-notices.mjs');
