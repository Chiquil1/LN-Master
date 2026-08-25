# AGENTS.md - Guía de Desarrollo LNReader (Español)

## Resumen del Proyecto

LNReader es un lector de light novels para Android construido con React Native/Expo. Stack: Expo SDK 57, React 19, React Native 0.86, TypeScript, Drizzle ORM (SQLite), y módulos Nitro para código nativo.

## Gestor de Paquetes

- **pnpm** (v11.15.0) - usar `pnpm` para todos los comandos
- Node >= 22.11.0 requerido

## Comandos Clave

```bash
# Desarrollo
pnpm run dev:start           # Iniciar Metro bundler
pnpm run dev:android         # Ejecutar en Android (debug)
pnpm run dev:android:release # Ejecutar en Android (release)

# Build
pnpm run build:release:android  # Build APK release (salida: android/app/build/outputs/apk/release/)

# Testing
pnpm run test                # Todos los tests
pnpm run test:rn             # Solo tests React Native (jest --selectProjects rn)
pnpm run test:db             # Solo tests base de datos (jest --selectProjects db)
pnpm run test:watch          # Modo watch
pnpm run test:coverage       # Con coverage

# Calidad de Código (orden: format → lint → type-check)
pnpm run format              # Prettier write
pnpm run format:check        # Prettier check
pnpm run lint                # ESLint
pnpm run lint:fix            # ESLint con --fix
pnpm run type-check          # tsc --noEmit
pnpm run check               # Ejecuta format:check && lint && type-check

# Base de Datos
pnpm run generate:db-migration  # drizzle-kit generate
pnpm run upgrade:migration-format # drizzle-kit up

# Utilidades
pnpm run generate:env:debug     # Genera .env para build debug
pnpm run generate:env:release   # Genera .env para build release
pnpm run generate:string-types  # Genera tipos i18n
pnpm run clean:generated        # Limpia artefactos de build
pnpm run clean:full             # Limpieza completa + reinstall
```

## Estructura del Proyecto

```
src/
├── api/              # Clientes API remotos (MyAnimeList, AniList, etc.)
├── components/       # Componentes React
├── database/         # Esquema Drizzle, queries, tipos
│   ├── queries/      # Clases de queries (tests en node env)
│   └── schema/       # Definiciones de tablas Drizzle
├── hooks/            # Custom hooks React (persisted hooks en __mocks__)
├── i18n/             # Internacionalización
├── navigators/       # Configuración React Navigation
├── plugins/          # Sistema de plugins para fuentes de contenido
├── screens/          # Componentes de pantalla
├── services/         # Lógica de negocio (trackers, updates, epub, etc.)
├── theme/            # Temas Material 3
├── utils/            # Funciones utilitarias
├── generated/        # Auto-generado (build-info.ts, string types)
└── native/           # Bridges de módulos nativos
modules/              # Módulos Nitro nativos (nitro-tts, nitro-epub, etc.)
```

## Alias de Rutas (tsconfig.json + babel.config.js)

```typescript
@components, @database, @hooks, @screens, @i18n, @theme, @utils
@plugins, @services, @navigators, @native, @api, @type, @specs
@test-utils, @env, @modules/nitro-tts, @modules/*
```

## Convenciones de Testing

**Dos proyectos Jest:**

- `db` - Entorno Node, tests en `src/database/queries/__tests__/`
- `rn` - Preset Expo, tests en `src/**/__tests__/**/*.test.tsx` (excluye database)

**Utilidades de test** (`@test-utils`):

- `render` - wrapper con GestureHandlerRootView, SafeAreaProvider, PaperProvider, ThemeProvider, BottomSheetModalProvider, AppErrorBoundary
- `renderNovel` - agrega NovelContextProvider
- `AllTheProviders` - wrapper completo

**Reglas de Mocking:**

- Mock a nivel de módulo, **NO** en `beforeEach`
- Crear mock functions a nivel de módulo: `const mockFn = jest.fn(); jest.mock('module', () => ({ hook: () => mockFn() }))`
- Mocks globales en `test/mocks/` (módulos nativos, navigation, database queries)
- Mocks de hooks en `src/hooks/__mocks__/index.ts`

## Estilo de Código

- **ESLint**: Config Expo + reglas TypeScript + plugins testing-library/jest
- **Prettier**: v2.8.8, corre en src/\*_/_.{js,jsx,ts,tsx} y scripts/
- **TypeScript**: Strict mode, `noUnusedLocals: true`, target ES2022
- **Sin console.log**: `no-console: error` en eslint
- **React Compiler**: Habilitado via babel-plugin-react-compiler (target 19)

## Módulos Nativos

Módulos Nitro personalizados en `modules/`:

- `nitro-tts` - Text-to-speech
- `nitro-epub` - Parsing EPUB
- `native-doh` - DNS over HTTPS
- `native-volume-button-listener` - Teclas de volumen hardware
- Dependencia parcheada: `@legendapp/list@3.3.3`

## Base de Datos

- **Drizzle ORM** con SQLite (driver expo)
- Esquema: `src/database/schema/index.ts`
- Migraciones en `drizzle/` (auto-generadas)
- Ejecutar migraciones al inicio de la app

## Build/Release

- `eas.json` configurado para EAS Build
- `generate-env-file.cjs` crea `.env` y `src/generated/build-info.ts` con metadata del build
- Scripts de release: `release:prepare`, `release:package`
- Build Android usa Gradle con build cache

## CI/Pre-commit

- **Husky** + **lint-staged** en pre-commit
- lint-staged ejecuta prettier luego eslint en archivos staged
- No se encontraron GitHub Actions workflows en el repo

## Gotchas Comunes

1. **Ejecutar `pnpm run generate:env:debug` antes de `dev:android`** - genera build-info requerido
2. **Tests de DB corren en Node** - no hay APIs React Native disponibles
3. **Tests RN necesitan wrapper `@test-utils`** - no usar `render` bare de testing-library
4. **Mocks de módulos deben estar a nivel superior** - no en beforeEach
5. **Clean builds**: `pnpm run clean:generated` antes de cambiar tipo de build
6. **Módulos Nitro requieren build nativo** - `expo prebuild` o `dev:android` lo maneja

## Context7

Cuando necesites buscar documentación de librerías, usa Context7:

- `use context7 para <tema> en <librería>` - búsqueda automática
- `use context7 con /org/repo para <tema>` - usa library ID directo

Ejemplos útiles para este proyecto:

- `use context7 para hooks en react-query`
- `use context7 para migraciones en drizzle-orm`
- `use context7 para navegación en react-navigation`
- `use context7 con /expo/expo para build process`
- `use context7 con /software-mansion/react-native-reanimated para animaciones`
