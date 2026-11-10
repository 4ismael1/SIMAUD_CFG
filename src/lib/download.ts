import { apiDownload, type QueryParams } from './api/client';

/** Downloads a file from the API and hands it to the browser as a regular download. */
export async function downloadFromApi(path: string, fallbackName: string, query?: QueryParams): Promise<void> {
  const { blob, filename } = await apiDownload(path, query);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
