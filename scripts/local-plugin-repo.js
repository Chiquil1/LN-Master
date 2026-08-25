#!/usr/bin/env node
/**
 * Local Plugin Repository Server for Testing
 *
 * Serves a local plugin repository JSON for testing plugins in the app.
 * Run: node scripts/local-plugin-repo.js
 * Then add http://localhost:3001/plugins.json as a repository in the app.
 */

import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const PORT = 3001;

// Plugin item for novelyra
const novelyraPlugin = {
  id: 'novelyra',
  name: 'Novelyra',
  site: 'https://novelyra.com/',
  lang: 'Spanish',
  version: '2.1.0',
  url: 'http://localhost:3001/novelyra.js', // Points to the compiled JS
  iconUrl: 'https://novelyra.com/favicon.ico',
  hasUpdate: false,
  hasSettings: true,
};

const plugins = [novelyraPlugin];

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '', `http://localhost:${PORT}`);

  if (url.pathname === '/plugins.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(plugins, null, 2));
    return;
  }

  if (url.pathname === '/novelyra.js') {
    // Serve the compiled plugin JS
    try {
      const pluginPath = resolve(__dirname, '../plugins/spanish/novelyra.js');
      const content = readFileSync(pluginPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(content);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Plugin not found. Run build first.');
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(
    `🚀 Local Plugin Repository Server running at http://localhost:${PORT}`,
  );
  console.log(`📋 Repository URL: http://localhost:${PORT}/plugins.json`);
  console.log(`🔌 Plugin JS: http://localhost:${PORT}/novelyra.js`);
  console.log('');
  console.log('To test in app:');
  console.log(
    '1. Add "http://localhost:3001/plugins.json" as a repository in app settings',
  );
  console.log('2. Install "Novelyra" plugin');
  console.log('3. Test on novelyra.com novels');
});
