# Prompts Profesionales para GitHub Copilot - LNReader Project

## 📋 Descripción del Proyecto
Este es un proyecto React Native (LNReader) v2.0.3 para lectura de novelas ligeras con:
- **Stack**: React Native 0.83.4, TypeScript 5.9.3, React 19.2.4
- **Base de datos**: Drizzle ORM con op-sqlite
- **Estado**: Zustand + MMKV para persistencia
- **Navegación**: React Navigation v7
- **UI**: React Native Paper, Bottom Sheets, Gesture Handler
- **Arquitectura**: Modular con separación clara por capas

---

## 🎯 Prompts para Mejoras Específicas

### 1. **Mejora de Tipado TypeScript**

```markdown
Como experto en TypeScript y React Native, analiza este archivo y:

1. Identifica cualquier uso de `any` o tipos implícitos y sugiere tipos específicos
2. Verifica que todas las funciones tengan tipos de retorno explícitos
3. Asegura que los props de componentes estén correctamente tipados con interfaces
4. Sugiere tipos genéricos donde sea apropiado para mejorar la reutilización
5. Verifica la consistencia con el tsconfig.json (module: ES2022, target: ES2022)

Mantén la compatibilidad con el código existente y no rompas la funcionalidad actual.
```

**Archivos prioritarios:**
- `/workspace/src/utils/mmkv/mmkv.ts` - Mejorar tipado genérico
- `/workspace/src/hooks/useTTSStore.ts` - Refinar tipos del store
- `/workspace/src/database/queries/*.ts` - Tipado de queries

---

### 2. **Optimización de Consultas de Base de Datos**

```markdown
Como especialista en Drizzle ORM y SQLite, revisa estas consultas de base de datos:

1. Identifica consultas N+1 o ineficientes
2. Sugiere el uso de joins cuando sea apropiado
3. Verifica que se estén usando índices adecuadamente
4. Recomienda transacciones para operaciones atómicas
5. Asegura que se use `dbManager` consistentemente para escritura/lectura
6. Verifica manejo adecuado de errores en operaciones asíncronas

Prioriza:
- Mantener la integridad de datos
- Optimizar performance sin sacrificar legibilidad
- Seguir patrones existentes en /workspace/src/database/manager/manager.ts
```

**Archivos prioritarios:**
- `/workspace/src/database/queries/NovelQueries.ts`
- `/workspace/src/database/queries/ChapterQueries.ts`
- `/workspace/src/database/queries/CategoryQueries.ts`

---

### 3. **Gestión de Estado con Zustand**

```markdown
Como experto en Zustand y gestión de estado en React Native:

1. Revisa los stores existentes y identifica lógica duplicada
2. Sugiere middlewares apropiados (persist, devtools) si aplican
3. Verifica que los selectores estén optimizados para evitar re-renders
4. Recomienda patrones de slices para stores complejos
5. Asegura consistencia con MMKV para persistencia
6. Identifica oportunidades para normalizar datos en el estado

Directrices:
- Mantener compatibilidad con hooks existentes
- No romper la integración con react-native-mmkv
- Seguir convenciones del proyecto (ver /workspace/src/hooks/useTTSStore.ts)
```

**Archivos prioritarios:**
- `/workspace/src/hooks/useTTSStore.ts`
- `/workspace/src/hooks/persisted/` (todos los hooks persistidos)
- `/workspace/src/components/TTSPlayerService.tsx`

---

### 4. **Manejo de Errores y Logging**

```markdown
Como especialista en manejo de errores en aplicaciones móviles:

1. Identifica try-catch faltantes en operaciones asíncronas
2. Sugiere un sistema de logging consistente (evitar console.log en producción)
3. Verifica que los errores de red sean manejados apropiadamente
4. Recomienda patrones de retry para operaciones fallidas
5. Asegura que ErrorBoundary esté configurado correctamente
6. Identifica mensajes de error que deberían ser traducidos (i18n)

Consideraciones:
- Usar showToast para errores de usuario
- Loguear errores críticos para debugging
- Mantener UX fluida incluso con errores
- Respetar configuración de eslint (no-console: error)
```

**Archivos prioritarios:**
- `/workspace/src/services/plugin/fetch.ts`
- `/workspace/src/api/` (todos los servicios API)
- `/workspace/src/utils/error.ts`
- `/workspace/App.tsx`

---

### 5. **Optimización de Performance**

```markdown
Como experto en performance de React Native:

1. Identifica componentes que podrían beneficiarse de React.memo
2. Sugiere uso de useMemo/useCallback donde haya cálculos costosos
3. Verifica que las listas usen FlashList correctamente (keyExtractor, windowSize)
4. Recomienda lazy loading para componentes pesados
5. Identifica imágenes que podrían optimizarse (resize, cache)
6. Sugiere code splitting para pantallas menos usadas

Herramientas disponibles:
- @legendapp/list (ya instalado)
- @shopify/flash-list (ya instalado)
- react-native-screens (enableFreeze ya activado)

No romper funcionalidad existente y mantener compatibilidad con iOS/Android.
```

**Archivos prioritarios:**
- `/workspace/src/screens/LibraryScreen/`
- `/workspace/src/components/` (componentes de lista)
- `/workspace/src/navigators/Main.tsx`

---

### 6. **Accesibilidad (a11y)**

```markdown
Como especialista en accesibilidad móvil:

1. Verifica que todos los botones tengan accessibilityLabel
2. Sugiere roles de accesibilidad apropiados (button, link, image, etc.)
3. Identifica texto que necesita contraste mejorado
4. Recomienda soporte para lectores de pantalla (VoiceOver/TalkBack)
5. Verifica navegación por teclado/focus management
6. Sugiere tamaños de toque mínimos (44x44 según guías)

Guías a seguir:
- WCAG 2.1 Level AA
- iOS Human Interface Guidelines - Accessibility
- Android Accessibility Guidelines
```

**Archivos prioritarios:**
- `/workspace/src/components/Button/Button.tsx`
- `/workspace/src/components/IconButtonV2/IconButtonV2.tsx`
- `/workspace/src/components/Appbar/Appbar.tsx`
- Todas las pantallas en `/workspace/src/screens/`

---

### 7. **Internacionalización (i18n)**

```markdown
Como experto en internacionalización con i18n-js:

1. Identifica strings hardcodeados que deberían traducirse
2. Verifica uso consistente de getString() del sistema de traducción
3. Sugiere estructura de keys jerárquica (ej: 'screens.library.title')
4. Recomienda pluralización donde aplique
5. Identifica formatos de fecha/número que deben localizarse
6. Verifica soporte para RTL (right-to-left) si es necesario

Sistema actual:
- Ubicación: /workspace/strings/translations.ts
- Función: getString() desde @strings/translations
- Librería: i18n-js ^4.5.3
```

**Archivos prioritarios:**
- `/workspace/src/screens/` (todas las pantallas)
- `/workspace/src/components/` (componentes UI)
- `/workspace/strings/translations.ts` - Revisar estructura

---

### 8. **Seguridad y Buenas Prácticas**

```markdown
Como especialista en seguridad de aplicaciones móviles:

1. Verifica que no haya API keys o secretos en el código
2. Sugiere validación de input para prevenir inyecciones
3. Revisa permisos de archivos (NativeFile, expo-file-system)
4. Identifica uso inseguro de eval o funciones dinámicas
5. Verifica HTTPS para todas las llamadas de red
6. Recomienda ofuscación para código sensible

Checklist específico:
- [ ] No console.log con datos sensibles
- [ ] Validar URLs antes de fetch
- [ ] Sanitizar HTML (sanitize-html ya disponible)
- [ ] Manejo seguro de archivos locales
- [ ] Verificar certificados SSL en producción
```

**Archivos prioritarios:**
- `/workspace/src/plugins/` (parsers de HTML)
- `/workspace/src/api/` (llamadas de red)
- `/workspace/src/utils/fetch/fetch.ts`
- `/workspace/src/specs/` (módulos nativos)

---

### 9. **Testing y Calidad de Código**

```markdown
Como experto en testing de React Native con Jest y Testing Library:

1. Identifica funciones críticas sin tests
2. Sugiere test cases para edge cases identificados
3. Verifica mocks appropriatos para módulos nativos
4. Recomienda structure de tests siguiendo patrones existentes
5. Identifica oportunidades para snapshot testing
6. Sugiere tests de integración para flujos críticos

Configuración existente:
- Jest + jest-expo
- Testing Library React Native
- Mocks en /workspace/__mocks__/
- Setup en /workspace/__tests__/jest.setup.ts

Prioridades:
- Database queries (drizzle-orm)
- Custom hooks (Zustand stores)
- Componentes UI críticos
- Servicios de red
```

**Archivos prioritarios:**
- `/workspace/src/database/queries/` (agregar tests)
- `/workspace/src/hooks/persisted/` (agregar tests)
- `/workspace/src/services/` (agregar tests)

---

### 10. **Refactorización de Componentes**

```markdown
Como experto en componentes React Native y React Native Paper:

1. Identifica componentes que violan Single Responsibility Principle
2. Sugiere extracción de sub-componentes reutilizables
3. Verifica consistencia con design system (Material Design 3)
4. Recomienda patrones de composición sobre herencia
5. Identifica props drilling que podrían usar Context
6. Sugiere custom hooks para lógica compartida

Estándares del proyecto:
- UI: React Native Paper ^5.15.0
- Icons: @react-native-vector-icons/material-design-icons
- Theme: MD3 custom themes en /workspace/src/theme/md3/
- Layout: SafeAreaView, StatusBar handling
```

**Archivos prioritarios:**
- `/workspace/src/components/Common/`
- `/workspace/src/screens/` (pantallas grandes)
- `/workspace/src/components/TTSMiniPlayer.tsx`

---

## 🔧 Comandos Útiles para Verificación

Después de aplicar mejoras, ejecutar:

```bash
# Type checking
pnpm run type-check

# Linting
pnpm run lint

# Auto-fix linting issues
pnpm run lint:fix

# Format code
pnpm run format

# Run tests
pnpm run test

# Test database queries specifically
pnpm run test:queries
```

---

## 📝 Notas Importantes

1. **No romper funcionalidad existente**: Todas las mejoras deben ser backward compatible
2. **Seguir convenciones del proyecto**: Mantener consistencia con código existente
3. **Testing obligatorio**: Cualquier cambio debe pasar tests existentes
4. **TypeScript estricto**: No usar `any`, definir tipos explícitos
5. **Performance mindful**: Considerar impacto en dispositivos de gama baja
6. **Cross-platform**: Verificar que cambios funcionen en iOS y Android

---

## 🎨 Estilo de Código

- **Indentación**: 2 espacios (ver .prettierrc.js)
- **Quotes**: Single quotes
- **Semicolons**: Required
- **Trailing commas**: ES5
- **Line length**: Prettier auto-wrap
- **Imports**: Organized by type (react, libs, components, utils, types)

---

## 📚 Recursos del Proyecto

- **Documentación**: /workspace/README.md, /workspace/CONTRIBUTING.md
- **Testing Guide**: /workspace/TESTING.md
- **Database Migrations**: /workspace/drizzle/
- **Native Modules**: /workspace/specs/, /workspace/android/app/src/main/java/, /workspace/ios/
- **Plugins System**: /workspace/src/plugins/

---

*Generado para LNReader v2.0.3 - Proyecto React Native de Lectura de Novelas Ligeras*
