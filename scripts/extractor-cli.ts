#!/usr/bin/env node

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractor } from '../src/services/plugin/extractor';

const __filename = fileURLToPath(import.meta.url);
const _dirname = dirname(__filename);
void _dirname;

const program = new Command();

program
  .name('lnreader-extractor')
  .description('LNReader Plugin Extractor - Generate plugins from novel sites')
  .version('1.0.0')
  .argument('<url>', 'URL of the novel page to analyze')
  .option('-o, --output <dir>', 'Output directory', './generated-plugin')
  .option('-i, --site-id <id>', 'Plugin site ID (auto-generated from domain)')
  .option('-l, --lang <lang>', 'Language code', 'Spanish')
  .option('-m, --mode <mode>', 'Extraction mode', 'full-auto')
  .option(
    '-t, --site-type <type>',
    'Force site type (madara-cms, lightnovelwp-cms, api-json, novelyra-custom, html-generic)',
  )
  .option(
    '-p, --pattern <pattern>',
    'Force chapter pattern (pagination, infinite-scroll, load-more, volume-tabs, ajax-pages, embedded-json, single-page)',
  )
  .option('--validate', 'Validate selectors before generating', true)
  .option('--no-validate', 'Skip validation')
  .option('--test-chapters <n>', 'Number of chapter URLs to test', '3')
  .option('--max-pages <n>', 'Max pages to test for pagination', '5')
  .option(
    '--wait-for-selector <selector>',
    'Wait for selector (for JS-rendered content)',
  )
  .option('--cookie-persistence', 'Include cookie persistence code', true)
  .option('--base-class', 'Generate base class for CMS sites', true)
  .option('-v, --verbose', 'Verbose output')
  .action(async (url, options) => {
    try {
      console.log(`🔍 Analyzing: ${url}`);

      const extractOptions = {
        url,
        outputDir: options.output,
        siteId: options.siteId,
        lang: options.lang,
        mode: options.mode as 'full-auto' | 'guided' | 'debug',
        forceSiteType: options.siteType as any,
        forceChapterPattern: options.pattern as any,
        validateBeforeGenerate: options.validate,
        testChapterUrls: parseInt(options.testChapters),
        maxPages: parseInt(options.maxPages),
        waitForSelector: options.waitForSelector,
      };

      const startTime = Date.now();
      const result = await extractor.extractSite(url, extractOptions);
      const duration = Date.now() - startTime;

      if (!result.success) {
        console.error('❌ Extraction failed:');
        result.errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      }

      if (result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach(w => console.log(`  - ${w}`));
      }

      console.log(`\n✅ Analysis complete in ${duration}ms`);
      console.log(
        `   Site: ${result.structure.siteName} (${result.structure.siteType})`,
      );
      console.log(
        `   Chapter pattern: ${result.structure.chapterPattern.type}`,
      );
      console.log(`   Confidence: ${result.structure.confidence}%`);
      console.log(
        `   Cloudflare: ${result.structure.cloudflare.recommendation}`,
      );

      if (result.validation) {
        console.log('\n📊 Validation Report:');
        console.log(
          `  Novel meta: ${result.validation.novelMeta.passed ? '✅' : '❌'}`,
        );
        console.log(
          `  Chapter list: ${
            result.validation.chapterList.passed ? '✅' : '❌'
          } (${result.validation.chapterList.totalFound}/${
            result.validation.chapterList.totalExpected
          } chapters, ${
            result.validation.chapterList.pagesTested
          } pages tested)`,
        );
        console.log(
          `  Chapter content: ${
            result.validation.chapterContent.passed ? '✅' : '❌'
          } (${result.validation.chapterContent.tested} tested, avg ${
            result.validation.chapterContent.avgLength
          } chars)`,
        );
        console.log(
          `  Search: ${result.validation.search.passed ? '✅' : '❌'}`,
        );
        console.log(
          `  Cloudflare: ${result.validation.cloudflare.handled ? '✅' : '❌'}`,
        );
        console.log(
          `  Overall: ${
            result.validation.overallPassed ? '✅ PASSED' : '❌ FAILED'
          }`,
        );
      }

      // Create output directory
      const outputDir = resolve(process.cwd(), options.output);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Write plugin.js
      const pluginPath = resolve(outputDir, 'plugin.js');
      writeFileSync(pluginPath, result.pluginCode);
      console.log(`\n📝 Generated: ${pluginPath}`);

      // Write selectors.json
      const selectorsPath = resolve(outputDir, 'selectors.json');
      writeFileSync(selectorsPath, result.selectorsJson);
      console.log(`📝 Generated: ${selectorsPath}`);

      // Write manifest.json
      const manifestPath = resolve(outputDir, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2));
      console.log(`📝 Generated: ${manifestPath}`);

      // Write validation report if exists
      if (result.validation) {
        const validationPath = resolve(outputDir, 'validation-report.json');
        writeFileSync(
          validationPath,
          JSON.stringify(result.validation, null, 2),
        );
        console.log(`📝 Generated: ${validationPath}`);
      }

      // Write base class if available
      if (result.baseClassCode) {
        const basePath = resolve(outputDir, 'plugin.base.js');
        writeFileSync(basePath, result.baseClassCode);
        console.log(`📝 Generated: ${basePath}`);
      }

      // Write cookie persistence code
      if (options.cookiePersistence) {
        const cookiePath = resolve(outputDir, 'cookie-persistence.js');
        const { generateCookiePersistenceCode } = await import(
          '../src/services/plugin/extractor/analyzer/cookiePersistence'
        );
        const cookieCode = generateCookiePersistenceCode(result.manifest.id);
        writeFileSync(cookiePath, cookieCode);
        console.log(`📝 Generated: ${cookiePath}`);
      }

      // Write README
      const readmePath = resolve(outputDir, 'README.md');
      const readme = generateReadme(result, url);
      writeFileSync(readmePath, readme);
      console.log(`📝 Generated: ${readmePath}`);

      console.log('\n🎉 Done! Plugin files ready in:', outputDir);
      console.log('\n📋 Next steps:');
      console.log('  1. Review selectors.json and adjust if needed');
      console.log('  2. Test the plugin by adding to your LNReader repository');
      console.log('  3. Run validation-report.json checks if any failed');
    } catch (error) {
      console.error(
        '❌ Fatal error:',
        error instanceof Error ? error.message : String(error),
      );
      if (options.verbose) console.error(error);
      process.exit(1);
    }
  });

function generateReadme(
  result: Awaited<ReturnType<typeof extractor.extractSite>>,
  url: string,
): string {
  const { structure, manifest, validation } = result;

  return `# ${manifest.name} Plugin

Auto-generated by LNReader Extractor on ${new Date().toISOString()}

## Source
- **URL**: ${url}
- **Site**: ${structure.baseUrl}
- **Type**: ${structure.siteType}
- **Chapter Pattern**: ${structure.chapterPattern.type}

## Confidence
- **Overall**: ${structure.confidence}%
- **Selectors**: ${Math.round(
    (Object.values(structure.selectors).flat().filter(Boolean).length /
      Object.keys(structure.selectors).length) *
      100,
  )}%

## Cloudflare
- **Status**: ${structure.cloudflare.recommendation}
- **Challenge**: ${structure.cloudflare.hasChallenge ? 'Yes' : 'No'}
- **Turnstile**: ${structure.cloudflare.hasTurnstile ? 'Yes' : 'No'}
- **cf_clearance**: ${
    structure.cloudflare.cfClearanceCookie ? 'Detected' : 'Not detected'
  }

## Generated Files
- \`plugin.js\` - Main plugin code
- \`plugin.base.js\` - Base class (for CMS sites)
- \`selectors.json\` - Detected CSS selectors
- \`manifest.json\` - Plugin manifest for repository
- \`cookie-persistence.js\` - Cloudflare cookie handling
${validation ? '- `validation-report.json` - Validation results' : ''}

## Validation Results
${
  validation
    ? `
| Check | Status | Details |
|-------|--------|---------|
| Novel Meta | ${validation.novelMeta.passed ? '✅' : '❌'} | ${
        validation.novelMeta.details.length
      } fields checked |
| Chapter List | ${validation.chapterList.passed ? '✅' : '❌'} | ${
        validation.chapterList.totalFound
      }/${validation.chapterList.totalExpected} chapters found |
| Chapter Content | ${validation.chapterContent.passed ? '✅' : '❌'} | ${
        validation.chapterContent.tested
      } tested, avg ${validation.chapterContent.avgLength} chars |
| Search | ${validation.search.passed ? '✅' : '❌'} | |
| Cloudflare | ${
        validation.cloudflare.handled ? '✅' : '❌'
      } | Needs WebView: ${validation.cloudflare.needsWebView ? 'Yes' : 'No'} |
| **Overall** | **${validation.overallPassed ? '✅ PASSED' : '❌ FAILED'}** | |
`
    : 'Validation not run (use --validate flag)'
}

## Installation
1. Copy \`plugin.js\` (and \`plugin.base.js\` if exists) to your LNReader plugins repository
2. Add entry to \`plugins.json\` with the manifest info
3. Test in LNReader app

## Selectors Customization
Edit \`selectors.json\` to fine-tune selectors. The plugin uses fallback chains, so order matters.

## Cookie Persistence (Cloudflare)
The generated \`cookie-persistence.js\` handles Cloudflare cookies automatically:
- Captures cookies when user visits via WebView
- Persists to localStorage
- Restores automatically for background tasks
- Include in your plugin or load separately

## Chapter Pattern: ${structure.chapterPattern.type}
${getPatternDescription(structure.chapterPattern)}

## Warnings
${
  structure.warnings.length > 0
    ? structure.warnings.map(w => `- ${w}`).join('\n')
    : 'None'
}

---
*Generated by LNReader Extractor v1.0.0*
`;
}

function getPatternDescription(pattern: any): string {
  switch (pattern.type) {
    case 'pagination':
      return `Uses pagination with parameter \`${
        pattern.pagination?.pageParam || 'page'
      }\`. The plugin will fetch each page sequentially.`;
    case 'infinite-scroll':
      return `Uses infinite scroll via AJAX endpoint \`${pattern.infiniteScroll?.ajaxEndpoint}\`. The plugin will simulate scroll requests.`;
    case 'load-more':
      return `Has a "Load More" button. The plugin will trigger the AJAX endpoint \`${pattern.loadMore?.ajaxEndpoint}\`.`;
    case 'volume-tabs':
      return `Chapters organized in volume tabs. The plugin iterates each tab to collect all chapters.`;
    case 'ajax-pages':
      return `Uses AJAX endpoint \`${pattern.ajaxPages?.endpoint}\` for paginated chapters.`;
    case 'embedded-json':
      return `All chapters embedded in JSON within the page. No pagination needed.`;
    case 'single-page':
      return `All chapters on a single page. No pagination needed.`;
    default:
      return 'Unknown pattern.';
  }
}

program.parse();
