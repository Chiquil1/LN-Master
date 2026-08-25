import NativeFile from '@modules/native-file';
import { fetchApi } from '@plugins/helpers/fetch';
import { PLUGIN_STORAGE } from '@utils/Storages';
import { createScopedLogger } from '@utils/logger';

const DEBUG_DIR = `${PLUGIN_STORAGE}/novelyra-debug`;
const novelyraLogger = createScopedLogger('Novelyra Inspector');

export type InspectResult = {
  name: string;
  url: string;
  responseUrl: string;
  status: number;
  ok: boolean;
  contentType: string;
  htmlLength: number;
  htmlPath: string;
  metadataPath: string;
};

const sanitizeFileName = (value: string): string =>
  value
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);

const getContentType = (response: Response): string => {
  try {
    const headers = response.headers as Headers | undefined;

    if (headers && typeof headers.get === 'function') {
      return headers.get('content-type') || '';
    }
  } catch {}

  return '';
};

const saveInspection = async (
  name: string,
  url: string,
): Promise<InspectResult> => {
  novelyraLogger.log('Fetch:', name, url);

  const response = await fetchApi(url);

  if (!response || typeof response.text !== 'function') {
    throw new Error('NovelYra inspector received an invalid Response');
  }

  const html = await response.text();

  await NativeFile.mkdir(DEBUG_DIR).catch(() => {});

  const safeName = sanitizeFileName(name) || `novelyra-${Date.now()}`;

  const htmlPath = `${DEBUG_DIR}/${safeName}.html`;

  const metadataPath = `${DEBUG_DIR}/${safeName}.json`;

  const metadata = {
    name,
    requestedUrl: url,
    responseUrl: response.url || url,
    status: response.status,
    ok: response.ok,
    contentType: getContentType(response),
    htmlLength: html.length,
    savedAt: new Date().toISOString(),
  };

  await NativeFile.writeFile(htmlPath, html);

  await NativeFile.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  const result: InspectResult = {
    name,
    url,
    responseUrl: metadata.responseUrl,
    status: metadata.status,
    ok: metadata.ok,
    contentType: metadata.contentType,
    htmlLength: metadata.htmlLength,
    htmlPath,
    metadataPath,
  };

  novelyraLogger.log('Saved:', result);

  return result;
};

export const inspectNovelyraSinglePage = async (
  name: string,
  url: string,
): Promise<InspectResult> => {
  return saveInspection(name, url);
};
