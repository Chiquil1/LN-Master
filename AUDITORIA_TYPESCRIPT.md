AUDITORIA TYPESCRIPT — Puntos Críticos (top 10)

Formato: Archivo — Línea aprox + fragmento — Tipo sugerido

1) src/database/manager/manager.d.ts
   - L31: `) => SQLitePreparedQuery<any>,`
   - L66: `$with: any;`
   - L87: `$count: any;`
   - L97: `readonly query: any;`
   - L118: `with: any;`
   - L156: `select: any;`
   - L183: `selectDistinct: any;`
   - L202: `run: any;`
   - L221: `all: any;`
   - L239: `get: any;`
   - L259: `values: any;`
   - L282: `transaction: any;`
   - Tipo sugerido: usar genéricos concretos (`SQLitePreparedQuery<T>`, `QueryBuilder<T>`, `Promise<T[]>`, `Promise<T | undefined>`) o `unknown` genérico en lugar de `any`.

2) src/services/backup/utils.ts
   - L39: `const data = {} as any;`
   - L53: `const restoreMMKVData = (data: any) => {`
   - L73: `} catch (error: any) {`
   - L95: `} catch (error: any) {`
   - L123: `} catch (error: any) {`
   - L137: `} catch (error: any) {`
   - L174: `} catch (error: any) {`
   - L187: `} catch (error: any) {`
   - L223: `} catch (error: any) {`
   - L233: `} catch (error: any) {`
   - L268: `} catch (error: any) {`
   - Tipo sugerido: `data: BackupPayload` (definir interfaz), `restoreMMKVData(data: Record<string, unknown>)`, y `catch (error: unknown)` seguido de refinamiento/`getErrorMessage(error)`.

3) src/screens/novel/components/__tests__/NovelScreenList.test.tsx
   - L49: `LegendList: ({ data, renderItem, ListHeaderComponent }: any) =>`
   - L54: `...(data || []).map((item: any, index: number) =>`
   - L69: `return ({ chapter, onDeleteChapter }: any) =>`
   - L95: `return ({ onPageChange }: any) =>`
   - L132: `AnimatedFAB: ({ onPress, label }: any) =>`
   - L261: `headerOpacity={headerOpacity as any}`
   - L262: `listRef={listRef as any}`
   - Tipo sugerido: usar `React.ComponentProps<typeof LegendList>` / `Array<Chapter>` / `RefObject<FlatList>` en lugar de `any`.

4) src/screens/novel/__tests__/NovelScreen.test.tsx
   - L67: `default: ({ setSelected }: any) => {`
   - L128: `Actionbar: ({ active, actions }: any) => {`
   - L134: `...actions.map((action: any) =>`
   - L162: `const Portal: any = ({ children }: { children: React.ReactNode }) =>`
   - L170: `Action: ({ icon, onPress }: any) =>`
   - L176: `Content: ({ title }: any) => React.createElement(Text, null, title),`
   - L178: `Snackbar: ({ visible, children }: any) =>`
   - Tipo sugerido: `ComponentProps` o `TestProps` específicos; `actions: ActionType[]` en lugar de `any`.

5) src/database/__tests__/db.test.ts
   - L72: `sqlite.executeSync(sql, params as any[]);`
   - L79: `(sqlite as any).executeAsync ??= sqlite.execute;`
   - L80: `(sqlite as any).executeRawAsync ??= sqlite.executeRaw;`
   - L127/L128/L170/L171: repeticiones similares
   - Tipo sugerido: `params: unknown[]` y tipar `sqlite` como `SQLiteClient` o `DrizzleClient` en vez de `any`.

6) src/screens/settings/SettingsTrackerScreen.tsx
   - L21: `theme: any;`
   - L131: `(props: any) => (`
   - L142: `(props: any) => (`
   - L153: `(props: any) => (`
   - L164: `(props: any) => (`
   - L346: `removeTracker(logoutTrackerName as any);`
   - Tipo sugerido: `theme: Theme` (usar tipo de `useTheme()`), `props: ComponentProps<typeof X>` y `logoutTrackerName: TrackerName`.

7) src/utils/logger.ts
   - L1: `const isDev = (globalThis as any).__DEV__ === true;`
   - L4: `debug: (...args: any[]) => {`
   - L10: `info: (...args: any[]) => {`
   - L16: `warn: (...args: any[]) => {`
   - L20: `error: (...args: any[]) => {`
   - Tipo sugerido: `globalThis as { __DEV__?: boolean }` y `(...args: unknown[]) => void` para funciones de log.

8) src/database/manager/manager.ts
   - L80: `return this.db.$client.executeSync(sqlString, params as any[])`
   - L88: `return this.db.$client.executeSync(sqlString, params as any[])`
   - L97: `) => SQLitePreparedQuery<any>,`
   - L158: `const r = db.executeSync(sqlString, params as any[]).rows as ReturnValue;`
   - L166: `arguments: params as any[],`
   - Tipo sugerido: `params: unknown[]`, `SQLitePreparedQuery<T>` en vez de `any`, y definir `ReturnValue` genérico.

9) src/screens/reader/components/ChapterDrawer/__tests__/ChapterDrawer.test.tsx
   - L47: `Button: ({ title, onPress }: any) =>`
   - L61: `return ({ item, onPress }: any) =>`
   - L74: `LegendList: ({ data = [], renderItem, onEndReached }: any) =>`
   - L78: `...data.map((item: any, index: number) =>`
   - Tipo sugerido: `ButtonProps`, `ChapterItem`, `RenderItem<Chapter>` en lugar de `any`.

10) src/screens/browse/components/PluginListItem.tsx
    - L62: `(ref: any) => {`
    - L74: `(ref: any) => {`
    - L86: `const handleDeletePress = useCallback((ref: any) => {`
    - L123: `(_progress: any, _dragX: any, ref: any) => (`
    - Tipo sugerido: `ref: RefObject<Swipeable | View>`, `_progress: number`, `_dragX: number`.


NOTA: Esta lista prioriza archivos con mayor recuento de `any` detectados en `src/`.

-- fin del reporte
