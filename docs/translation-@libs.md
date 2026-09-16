# Librería `@libs/translation` (traducción de plugins)

## Origen del problema

Los plugins del repositorio `Chiquil1/Ln-Reader` importan la librería de
traducción como `require('@libs/translation')` (compilado con `tsc`) o la
llevan incrustada (autocontenidos). El loader de esta app
(`src/plugins/pluginManager.ts`) solo define un whitelist fijo de paquetes
(`packages`); como `@libs/translation` **no estaba registrado**, el `require`
devolvía `undefined` y cualquier llamada a `translateTitles` fallaba con:

```
Cannot read properties of undefined (reading 'translateTitles')
```

## Solución

1. `src/plugins/helpers/translation.ts`: implementación de la librería dentro
   de la app. Es un port de `src/libs/translation.ts` del repo de plugins,
   adaptado a los helpers de la app:
   - `fetchApi` → `./helpers/fetch` (añade cookies del WebView + User-Agent).
   - `storage` → instancia propia de `Storage('@libs/translation')` (la app
     crea un `Storage` por plugin; la lib global usa su propio namespace).
   - Tipos: `NovelItem`, `SourceNovel`, `Plugin` de `src/plugins/types`
     (nota: `status` es un enum en la app → se castea en `translateSourceNovel`).
   - Tipos DOM: la app no tiene `domhandler` como dependencia directa, por lo
     que el tipo de nodo se deriva de cheerio
     (`Extract<Parameters<typeof parseHTML>[0], { type: string }>`).

2. `src/plugins/pluginManager.ts`: se registra el módulo en el whitelist:
   ```ts
   import * as translationLib from './helpers/translation';
   ...
   '@libs/translation': translationLib,
   ```
   Así, `require('@libs/translation')` de un plugin compilado devuelve el
   namespace con `translateTitles`, `translateParagraphs`, `translateShortText`,
   `translateTextToEnglish`, `normalizeSearchText`, `cleanTextForTts`,
   `extractChapterNumberFromUrl`, `hasNoiseClass`, `parseRelativeTime`,
   `searchScore`, `searchTermsMatch`, `translateStatus`, `withTranslation` y
   `DEFAULT_TRANSLATION_CONFIG`.

## Comportamiento

- **Plugins autocontenidos** (distribución actual del repo de plugins,
  `.js` generados con `build:inline`): no necesitan esta lib; funcionan solo
  con el whitelist base. Esta app los carga sin cambios.
- **Plugins compilados con `tsc` puro** (los que hacen `require('@libs/translation')`):
  ahora resuelven contra este módulo y traducen igual.

## Contrato de mantenimiento

- Cualquier export nuevo que el repo de plugins ponga en `@libs/translation`
  debe existir también aquí, o se repetirá el error de `undefined`.
- La configuración por defecto es Google → `es`, caché en
  `Storage('@libs/translation')`, concurrencia limitada (`batchSize: 10`).
- Verificación (loader emulado, sin RN):
  plugin no-inline (tsc) y plugin inline (dist) → `popularNovels()` devuelve
  títulos traducidos; sin el registro en `packages` se reproduce el error
  original.