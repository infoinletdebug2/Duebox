import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../api/client';
import type { CreatedUpload } from '../types';

/**
 * Scanning (FR-S1, FR-S2, ARCHITECTURE §3):
 *   pick pages → resize on the phone (1600 px, JPEG 0.7) → create the scan
 *   → PUT each page straight to private storage → the caller asks the server
 *   to read it. The worker never handles the image bytes, and the phone holds
 *   no AI key. The same upload path adds attachments to an existing item.
 */

export type ScanSource = 'camera' | 'library' | 'pdf';

export interface ScanPage {
  uri: string;
  mime: 'image/jpeg' | 'application/pdf';
  width?: number;
  height?: number;
  name?: string;
}

export class PermissionDenied extends Error {
  constructor(readonly source: ScanSource) {
    super(
      source === 'camera'
        ? 'Duebox needs the camera to scan your letter. You can allow it in Settings.'
        : 'Duebox needs access to your photos to add a letter. You can allow it in Settings.',
    );
  }
}

export const MAX_PAGES = 5;
const LONG_EDGE = 1600;

/** One camera shot. The scan screen calls this once per page. */
export async function takePhoto(): Promise<ScanPage | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PermissionDenied('camera');
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  const a = result.canceled ? null : result.assets[0];
  return a ? { uri: a.uri, mime: 'image/jpeg', width: a.width, height: a.height } : null;
}

export async function pickPhotos(): Promise<ScanPage[]> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new PermissionDenied('library');
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: MAX_PAGES });
  if (result.canceled) return [];
  return result.assets.slice(0, MAX_PAGES).map((a) => ({ uri: a.uri, mime: 'image/jpeg' as const, width: a.width, height: a.height }));
}

export async function pickPdf(): Promise<ScanPage | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  const a = result.canceled ? null : result.assets[0];
  if (!a) return null;
  if ((a.size ?? 0) > 15 * 1024 * 1024) throw new Error('That PDF is larger than 15 MB. Try photos of the pages instead.');
  return { uri: a.uri, mime: 'application/pdf', name: a.name };
}

async function prepare(page: ScanPage): Promise<{ uri: string; blob: Blob; mime: ScanPage['mime'] }> {
  let uri = page.uri;
  if (page.mime === 'image/jpeg') {
    const w = page.width ?? LONG_EDGE;
    const h = page.height ?? LONG_EDGE;
    const scale = Math.min(1, LONG_EDGE / Math.max(w, h));
    const actions = scale < 1 ? [{ resize: w >= h ? { width: Math.round(w * scale) } : { height: Math.round(h * scale) } }] : [];
    // Re-encoding also drops the camera's EXIF, location included (privacy policy).
    const out = await ImageManipulator.manipulateAsync(uri, actions, { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
    uri = out.uri;
  }
  const blob = await (await fetch(uri)).blob();
  return { uri, blob, mime: page.mime };
}

async function putPages(prepared: { blob: Blob; mime: string }[], uploads: CreatedUpload['uploads'], onProgress?: (done: number, total: number) => void) {
  let done = 0;
  onProgress?.(0, prepared.length);
  for (const [i, up] of uploads.entries()) {
    const page = prepared[i];
    if (!page) continue;
    const res = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'content-type': page.mime }, body: page.blob });
    if (!res.ok) throw new Error('A page didn’t upload. Check your connection and try again.');
    done += 1;
    onProgress?.(done, prepared.length);
  }
}

async function prepareAll(pages: ScanPage[]) {
  if (pages.length === 0) throw new Error('Add at least one page.');
  const prepared = [];
  for (const p of pages) prepared.push(await prepare(p));
  return prepared;
}

/**
 * Create the scan and upload every page. Returns the scan id; the caller then
 * POSTs /scans/:id/read (so a slow read never loses an upload).
 */
export async function uploadScan(pages: ScanPage[], source: ScanSource, onProgress?: (done: number, total: number) => void): Promise<string> {
  const prepared = await prepareAll(pages);
  const created = await api.post<CreatedUpload>('/scans', {
    source,
    pages: prepared.map((p) => ({ mime: p.mime, bytes: p.blob.size })),
  });
  await putPages(prepared, created.uploads, onProgress);
  if (!created.scan) throw new Error('The scan wasn’t created. Try again.');
  return created.scan.id;
}

/** Attach photos or a PDF to an existing item (FR-I8). */
export async function uploadAttachment(itemId: string, pages: ScanPage[], onProgress?: (done: number, total: number) => void): Promise<void> {
  const prepared = await prepareAll(pages);
  const created = await api.post<CreatedUpload>(`/items/${itemId}/attachments`, {
    pages: prepared.map((p) => ({ mime: p.mime, bytes: p.blob.size })),
  });
  await putPages(prepared, created.uploads, onProgress);
}
