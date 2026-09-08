import { PadItem } from '../types';

const DB_NAME = 'GuitarPadsDB';
const DB_VERSION = 1;
const STORE_NAME = 'pads';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB não suportado neste navegador'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllStoredPads(): Promise<PadItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = (req.result || []) as PadItem[];
        const restored = results.map((item) => {
          // Reconstruct audioBlob from audioData if missing
          if (!item.audioBlob && item.audioData && item.audioData.byteLength > 0) {
            try {
              item.audioBlob = new Blob([item.audioData], { type: item.mimeType || 'audio/mpeg' });
            } catch (blobErr) {
              console.warn('Erro ao reconstruir Blob do áudio:', blobErr);
            }
          }
          // Always generate a live object URL for instant playback
          if (item.audioBlob instanceof Blob && item.audioBlob.size > 0) {
            try {
              item.audioUrl = URL.createObjectURL(item.audioBlob);
            } catch (urlErr) {
              console.warn('Erro ao criar URL do áudio:', urlErr);
            }
          }
          return item;
        });
        resolve(restored);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Erro ao acessar IndexedDB:', err);
    return [];
  }
}

export async function savePadToDB(pad: PadItem): Promise<void> {
  try {
    const db = await openDB();
    
    // Ensure ArrayBuffer is extracted for maximum cross-browser IndexedDB persistence
    let audioData = pad.audioData;
    let audioBlob = pad.audioBlob instanceof Blob ? pad.audioBlob : undefined;

    if (!audioData && audioBlob && typeof audioBlob.arrayBuffer === 'function') {
      try {
        audioData = await audioBlob.arrayBuffer();
      } catch (err) {
        console.warn('Não foi possível ler arrayBuffer do blob:', err);
      }
    }
    if (!audioBlob && audioData && audioData.byteLength > 0) {
      try {
        audioBlob = new Blob([audioData], { type: pad.mimeType || 'audio/mpeg' });
      } catch {}
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const itemToSave: PadItem = {
        ...pad,
        audioUrl: undefined, // temporary object URLs should not be saved in DB
        audioBlob: audioBlob,
        audioData: audioData || pad.audioData,
      };
      const req = store.put(itemToSave);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Falha ao salvar pad no IndexedDB:', err);
  }
}

export async function deletePadFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Falha ao remover pad do IndexedDB:', err);
  }
}

export async function clearAllUserPadsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Falha ao limpar IndexedDB:', err);
  }
}
