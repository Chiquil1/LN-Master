#!/usr/bin/env node
/**
 * Build Plugin Script
 * Compiles TypeScript plugins to JavaScript for testing
 */

import { build } from 'esbuild';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const pluginsDir = resolve(__dirname, '../plugins/spanish');
const outputDir = resolve(__dirname, '../plugins/spanish');

const plugins = [{ input: 'novelyra.ts', output: 'novelyra.js' }];

async function buildPlugin(name) {
  const input = resolve(pluginsDir, name + '.ts');
  const output = resolve(outputDir, name + '.js');

  console.log(`🔨 Building ${name}...`);

  try {
    await build({
      entryPoints: [input],
      outfile: output,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node16',
      external: [
        '@libs/fetch',
        '@libs/filterInputs',
        '@libs/novelStatus',
        '@libs/defaultCover',
        '@libs/storage',
        'cheerio',
        'dayjs',
        'protobufjs',
        'urlencode',
        'htmlparser2',
        '@noble/ciphers/aes.js',
        '@noble/ciphers/utils.js',
        'lodash-es',
      ],
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      banner: {
        js: '// Auto-generated plugin - DO NOT EDIT DIRECTLY',
      },
    });
    console.log(`✅ Built ${name}.js`);
  } catch (e) {
    console.error(`❌ Failed to build ${name}:`, e);
    process.exit(1);
  }
}

async function main() {
  console.log('📦 Building plugins...\n');
  for (const plugin of ['novelyra']) {
    await buildPlugin(plugin);
  }
  console.log('\n✅ All plugins built successfully!');
  console.log('Run: node scripts/local-plugin-repo.js');
}

main();
