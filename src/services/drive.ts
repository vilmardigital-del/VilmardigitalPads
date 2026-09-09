import { PadItem } from '../types';
import { getNextColor } from '../utils/colors';

export const PADS_FOLDER_NAME = 'Mesa de Pads - Violão';
const CATALOG_FILE_NAME = 'mesa_pads_catalog.json';

/**
 * Searches for an existing "Mesa de Pads - Violão" folder in user's Drive, or creates a new one.
 * Sets permission to public (reader/anyone) so audio files can be streamed by all users of the app.
 */
export async function getOrCreatePadsFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name = '${PADS_FOLDER_NAME}' and trashed = false`
  );

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`Erro ao buscar pasta no Google Drive (${searchRes.status}): ${errorText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create new folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: PADS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Pasta com os áudios e pads compartilhados da Mesa de Pads para Violão',
    }),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`Erro ao criar pasta no Google Drive (${createRes.status}): ${errorText}`);
  }

  const folder = await createRes.json();

  // Make folder publicly accessible so children can be streamed
  try {
    await makeFilePublic(accessToken, folder.id);
  } catch (err) {
    console.warn('Permissão de leitura pública da pasta avisou:', err);
  }

  return folder.id;
}

/**
 * Sets permission of a Drive file or folder to "anyone with link can read".
 */
export async function makeFilePublic(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`Aviso ao tornar arquivo ${fileId} público no Drive:`, text);
  }
}

/**
 * Uploads an audio blob to Google Drive in the specified folder using multipart upload.
 */
export async function uploadAudioToDrive(
  accessToken: string,
  fileName: string,
  mimeType: string,
  blob: Blob,
  folderId: string
): Promise<{ fileId: string; streamUrl: string }> {
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: mimeType || 'audio/mpeg',
  };

  const boundary = '-------padboard' + Date.now();
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaHeader =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    '\r\n';

  const fileHeader =
    delimiter +
    `Content-Type: ${mimeType || 'audio/mpeg'}\r\n\r\n`;

  const multipartBlob = new Blob([metaHeader, fileHeader, blob, closeDelimiter], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: multipartBlob,
    }
  );

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Erro ao fazer upload do áudio no Google Drive (${uploadRes.status}): ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  const fileId = uploadData.id;

  // Make audio file public so every visitor to the website can stream it without logging in
  await makeFilePublic(accessToken, fileId);

  // Audio stream URL via local backend proxy to avoid CORS issues and guarantee high fidelity streaming
  const streamUrl = `/api/drive-stream/${fileId}`;

  return { fileId, streamUrl };
}

/**
 * Deletes a file from Google Drive.
 */
export async function deleteFileFromDrive(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const errorText = await res.text();
    throw new Error(`Erro ao apagar arquivo no Google Drive (${res.status}): ${errorText}`);
  }
}

/**
 * Saves a JSON catalog file in Google Drive containing the pad metadata.
 */
export async function saveCatalogToDrive(
  accessToken: string,
  folderId: string,
  pads: PadItem[]
): Promise<void> {
  // Strip binary blobs/buffers from JSON catalog
  const cleanPads = pads.map((p) => ({
    id: p.id,
    name: p.name,
    key: p.key,
    color: p.color,
    textColor: p.textColor,
    bgGradient: p.bgGradient,
    activeBorderColor: p.activeBorderColor,
    glowColor: p.glowColor,
    audioUrl: p.audioUrl,
    driveFileId: p.driveFileId,
    driveFolderId: folderId,
    isDriveSynced: true,
    volume: p.volume,
    createdAt: p.createdAt,
  }));

  const jsonContent = JSON.stringify({ version: 1, updatedAt: Date.now(), pads: cleanPads }, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });

  // Check if catalog file already exists in folder
  const query = encodeURIComponent(
    `mimeType != 'application/vnd.google-apps.folder' and name = '${CATALOG_FILE_NAME}' and '${folderId}' in parents and trashed = false`
  );

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  let existingFileId: string | null = null;
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      existingFileId = searchData.files[0].id;
    }
  }

  if (existingFileId) {
    // Update existing file
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: blob,
    });
  } else {
    // Create catalog file
    const metadata = {
      name: CATALOG_FILE_NAME,
      parents: [folderId],
      mimeType: 'application/json',
    };

    const boundary = '-------catalog' + Date.now();
    const delimiter = `--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const metaHeader =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      '\r\n';
    const fileHeader = delimiter + 'Content-Type: application/json\r\n\r\n';

    const multipartBlob = new Blob([metaHeader, fileHeader, blob, closeDelimiter], {
      type: `multipart/related; boundary=${boundary}`,
    });

    const createRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: multipartBlob,
      }
    );

    if (createRes.ok) {
      const data = await createRes.json();
      await makeFilePublic(accessToken, data.id);
    }
  }
}

/**
 * Scans the Google Drive folder "Mesa de Pads - Violão", retrieves or parses all audio files,
 * ensures they are public, and returns the full list of PadItem objects.
 */
export async function syncPadsFromDrive(accessToken: string): Promise<PadItem[]> {
  const folderId = await getOrCreatePadsFolder(accessToken);

  // 1. Try reading existing catalog
  let catalogPads: PadItem[] = [];
  try {
    const query = encodeURIComponent(
      `mimeType != 'application/vnd.google-apps.folder' and name = '${CATALOG_FILE_NAME}' and '${folderId}' in parents and trashed = false`
    );
    const catSearch = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (catSearch.ok) {
      const catData = await catSearch.json();
      if (catData.files && catData.files.length > 0) {
        const catFileId = catData.files[0].id;
        const catRes = await fetch(`https://www.googleapis.com/drive/v3/files/${catFileId}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (catRes.ok) {
          const parsed = await catRes.json();
          if (Array.isArray(parsed.pads)) {
            catalogPads = parsed.pads;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Aviso ao ler catálogo do Drive:', err);
  }

  // 2. Search for all audio files in the folder
  const audioQuery = encodeURIComponent(
    `'${folderId}' in parents and trashed = false and (mimeType contains 'audio/' or name contains '.mp3' or name contains '.wav' or name contains '.m4a' or name contains '.ogg' or name contains '.aac')`
  );
  const filesSearch = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${audioQuery}&fields=files(id,name,mimeType,size)&pageSize=100`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const mergedMap = new Map<string, PadItem>();
  catalogPads.forEach((p) => {
    if (p.driveFileId) {
      mergedMap.set(p.driveFileId, p);
    }
  });

  if (filesSearch.ok) {
    const filesData = await filesSearch.json();
    const driveFiles: Array<{ id: string; name: string; mimeType: string }> = filesData.files || [];

    for (let i = 0; i < driveFiles.length; i++) {
      const f = driveFiles[i];
      if (f.name === CATALOG_FILE_NAME) continue;

      // Make sure it's public
      try {
        await makeFilePublic(accessToken, f.id);
      } catch {}

      if (!mergedMap.has(f.id)) {
        // Parse key from filename like "[C] Worship Pad.mp3" or "Pad Dó C.mp3"
        let detectedKey: string | undefined = undefined;
        const keyMatch = f.name.match(/\[([A-G][b#]?)\]/i) || f.name.match(/\b([A-G][b#]?)\b/);
        if (keyMatch) {
          detectedKey = keyMatch[1].toUpperCase();
        }

        const colorScheme = getNextColor(mergedMap.size + i);
        const cleanName = f.name.replace(/\.[^/.]+$/, '').replace(/\[[A-G][b#]?\]\s*/i, '').trim() || f.name;

        mergedMap.set(f.id, {
          id: `pad-drive-${f.id}`,
          name: cleanName,
          key: detectedKey,
          color: colorScheme.hex,
          textColor: colorScheme.textColor,
          bgGradient: colorScheme.bgGradient,
          activeBorderColor: colorScheme.activeBorderColor,
          glowColor: colorScheme.glowColor,
          audioUrl: `/api/drive-stream/${f.id}`,
          driveFileId: f.id,
          driveFolderId: folderId,
          isDriveSynced: true,
          mimeType: f.mimeType || 'audio/mpeg',
          isPreset: false,
          volume: 0.9,
          createdAt: Date.now() + i,
        });
      }
    }
  }

  const finalPads = Array.from(mergedMap.values());
  // Save updated catalog to Drive
  try {
    await saveCatalogToDrive(accessToken, folderId, finalPads);
  } catch {}

  return finalPads;
}
