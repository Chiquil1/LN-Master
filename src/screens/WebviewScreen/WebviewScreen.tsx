import { useCallback, useMemo, useRef, useState } from 'react';

import WebView, { WebViewNavigation } from 'react-native-webview';

import type { WebViewProgressEvent } from 'react-native-webview/lib/WebViewTypes';

import { ProgressBar } from 'react-native-paper';

import { getPlugin } from '@plugins/pluginManager';

import { useBackHandler } from '@hooks';

import { useTheme } from '@hooks/persisted';

import { WebviewScreenProps } from '@navigators/types';

import { getUserAgent } from '@hooks/persisted/useUserAgent';

import { resolveUrl } from '@services/plugin/fetch';

import { inspectNovelyraSinglePage } from '@services/plugin/novelyraInspector';
import { createScopedLogger } from '@utils/logger';

import CookieManager from '@preeternal/react-native-cookie-manager';

import {
  WEBVIEW_LOCAL_STORAGE,
  WEBVIEW_SESSION_STORAGE,
  store,
} from '@plugins/helpers/storage';

import Appbar from './components/Appbar';

import Menu from './components/Menu';

type StorageData = {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
};

const WebviewScreen = ({ route, navigation }: WebviewScreenProps) => {
  const { name, url, pluginId, isNovel } = route.params;

  const plugin = getPlugin(pluginId);

  const isSave = plugin?.webStorageUtilized;

  const uri = useMemo(
    () => resolveUrl(pluginId, url, isNovel),
    [isNovel, pluginId, url],
  );

  const userAgent = useMemo(() => getUserAgent(), []);

  const theme = useTheme();

  const webViewRef = useRef<WebView<object> | null>(null);

  const inspectedUrlsRef = useRef(new Set<string>());

  const inspectingUrlsRef = useRef(new Set<string>());

  const [progress, setProgress] = useState(0);

  const [title, setTitle] = useState(name || '');

  const [currentUrl, setCurrentUrl] = useState(uri);

  const [canGoBack, setCanGoBack] = useState(false);

  const [canGoForward, setCanGoForward] = useState(false);

  const [tempData, setTempData] = useState<StorageData>();

  const [menuVisible, setMenuVisible] = useState(false);

  const novelyraLogger = useMemo(
    () => createScopedLogger('Novelyra Inspector'),
    [],
  );

  const inspectNovelyraUrl = useCallback(
    async (targetUrl: string) => {
      if (
        !__DEV__ ||
        pluginId !== 'novelyra' ||
        !targetUrl.startsWith('https://novelyra.com')
      ) {
        return;
      }

      if (inspectingUrlsRef.current.has(targetUrl)) {
        return;
      }

      if (inspectedUrlsRef.current.has(targetUrl)) {
        return;
      }

      inspectingUrlsRef.current.add(targetUrl);

      try {
        novelyraLogger.log('Capturing:', targetUrl);

        const result = await inspectNovelyraSinglePage(targetUrl, targetUrl);

        novelyraLogger.log('Result:', result);

        /*
         * Only mark the URL as inspected when we
         * actually received a successful HTML page.
         *
         * This is important for Cloudflare:
         * if the first request receives a challenge,
         * we allow a later successful load to retry.
         */
        if (result.ok && result.status === 200 && result.htmlLength > 1000) {
          inspectedUrlsRef.current.add(targetUrl);
        }
      } catch (error) {
        novelyraLogger.error('Error:', targetUrl, error);
      } finally {
        inspectingUrlsRef.current.delete(targetUrl);
      }
    },
    [pluginId, novelyraLogger],
  );

  const handleNavigation = useCallback(
    (e: WebViewNavigation) => {
      if (!e.loading) {
        setTitle(e.title);

        void inspectNovelyraUrl(e.url);
      }

      setCurrentUrl(e.url);

      setCanGoBack(e.canGoBack);

      setCanGoForward(e.canGoForward);
    },
    [inspectNovelyraUrl],
  );

  const handleLoadProgress = useCallback(
    ({ nativeEvent }: WebViewProgressEvent) => {
      const next = nativeEvent.progress;

      setProgress(current =>
        next === 1 || Math.abs(next - current) >= 0.05 ? next : current,
      );
    },
    [],
  );

  const saveData = useCallback(async () => {
    if (pluginId && tempData && isSave) {
      store.set(
        pluginId + WEBVIEW_LOCAL_STORAGE,
        JSON.stringify(tempData.localStorage || {}),
      );

      store.set(
        pluginId + WEBVIEW_SESSION_STORAGE,
        JSON.stringify(tempData.sessionStorage || {}),
      );
    }

    try {
      const cookies = await CookieManager.get(currentUrl);

      const cookieNames = Object.keys(cookies);

      if (pluginId) {
        store.set(
          `${pluginId}_WEBVIEW_COOKIES_DEBUG`,
          JSON.stringify({
            url: currentUrl,
            count: cookieNames.length,
            names: cookieNames,
          }),
        );
      }
    } catch {
      if (pluginId) {
        store.set(
          `${pluginId}_WEBVIEW_COOKIES_DEBUG`,
          JSON.stringify({
            url: currentUrl,
            count: 0,
            names: [],
            error: true,
          }),
        );
      }
    }
  }, [currentUrl, isSave, pluginId, tempData]);

  useBackHandler(() => {
    if (menuVisible) {
      setMenuVisible(false);

      return true;
    }

    if (canGoBack) {
      webViewRef.current?.goBack();

      return true;
    }

    void saveData();

    return false;
  });

  const injectJavaScriptCode =
    'window.ReactNativeWebView.postMessage(JSON.stringify({localStorage, sessionStorage}))';

  const source = useMemo(() => ({ uri }), [uri]);

  return (
    <>
      <Appbar
        title={title}
        currentUrl={currentUrl}
        theme={theme}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        webView={webViewRef}
        setMenuVisible={setMenuVisible}
        goBack={async () => {
          await saveData();

          navigation.goBack();
        }}
      />

      <ProgressBar
        color={theme.primary}
        progress={Math.round(1000 * progress) / 1000}
        visible={progress !== 1}
      />

      <WebView<object>
        userAgent={userAgent}
        ref={webViewRef}
        source={source}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        setDisplayZoomControls={true}
        setBuiltInZoomControls={false}
        setSupportMultipleWindows={false}
        injectedJavaScript={injectJavaScriptCode}
        onNavigationStateChange={handleNavigation}
        onLoadProgress={handleLoadProgress}
        onMessage={({
          nativeEvent,
        }: {
          nativeEvent: {
            data: string;
          };
        }) => setTempData(JSON.parse(nativeEvent.data))}
      />

      {menuVisible ? (
        <Menu
          theme={theme}
          currentUrl={currentUrl}
          webView={webViewRef}
          setMenuVisible={setMenuVisible}
        />
      ) : null}
    </>
  );
};

export default WebviewScreen;
