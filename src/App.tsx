import React, { useState, useEffect, useCallback } from 'react';
import { audioEngine } from './services/audioEngine';
import { getAllStoredPads, savePadToDB, deletePadFromDB } from './services/db';
import { INITIAL_PRESET_PADS } from './data/initialPads';
import { PadItem, AudioEngineSettings } from './types';
import { Header } from './components/Header';
import { PadGrid } from './components/PadGrid';
import { UploadModal } from './components/UploadModal';
import { PadEditModal } from './components/PadEditModal';
import { Metronome } from './components/Metronome';
import {
  Guitar,
  Sparkles,
  Keyboard,
  Trash2,
  Cloud,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout, getAccessToken } from './services/auth';
import {
  getOrCreatePadsFolder,
  uploadAudioToDrive,
  deleteFileFromDrive,
  saveCatalogToDrive,
} from './services/drive';

export default function App() {
  const [pads, setPads] = useState<PadItem[]>([]);
  const [activePadIds, setActivePadIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<AudioEngineSettings>(audioEngine.getSettings());
  const [showMetronome, setShowMetronome] = useState<boolean>(false);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [editingPad, setEditingPad] = useState<PadItem | null>(null);
  const [deleteConfirmPad, setDeleteConfirmPad] = useState<PadItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Google Drive & Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // 1. Initialize Google Auth listener
  useEffect(() => {
    const unsub = initAuth(
      (authUser) => {
        setUser(authUser);
      },
      () => {
        setUser(null);
      }
    );
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // 2. Load pads from shared server catalog (stored in Google Drive) + IndexedDB
  useEffect(() => {
    async function loadPads() {
      try {
        // Fetch shared pads from the server (which includes pads saved in Google Drive)
        let serverPads: PadItem[] = [];
        try {
          const res = await fetch('/api/pads');
          if (res.ok) {
            serverPads = await res.json();
          }
        } catch (apiErr) {
          console.warn('API de pads compartilhados não acessível offline:', apiErr);
        }

        const storedPads = await getAllStoredPads();

        // Merge shared pads with locally stored pads
        const padMap = new Map<string, PadItem>();

        // First add presets if brand new visit and no local or server pads
        const hasInitialized = localStorage.getItem('mesa_pads_initialized_v2');

        if (!hasInitialized && serverPads.length === 0 && (!storedPads || storedPads.length === 0)) {
          INITIAL_PRESET_PADS.forEach((p) => padMap.set(p.id, p));
          for (const p of INITIAL_PRESET_PADS) {
            await savePadToDB(p);
          }
          localStorage.setItem('mesa_pads_initialized_v2', 'true');
        }

        // Add locally stored pads
        if (storedPads && storedPads.length > 0) {
          storedPads.forEach((p) => padMap.set(p.id, p));
        }

        // Add or overwrite with server shared pads (they have Google Drive stream URLs)
        if (serverPads && serverPads.length > 0) {
          serverPads.forEach((p) => padMap.set(p.id, p));
        }

        const merged = Array.from(padMap.values());
        setPads(merged);

        // Cache server pads locally for fast offline access
        for (const p of serverPads) {
          await savePadToDB(p);
        }
      } catch (e) {
        console.warn('Erro ao carregar dados:', e);
        setPads(INITIAL_PRESET_PADS);
      } finally {
        setIsLoaded(true);
      }
    }
    loadPads();
  }, []);

  // 3. Sync with AudioEngine state changes
  useEffect(() => {
    const unsubscribe = audioEngine.subscribe(() => {
      setActivePadIds(audioEngine.getActivePadIds());
      setSettings(audioEngine.getSettings());
    });
    return () => unsubscribe();
  }, []);

  // 4. Unlock audio engine on first user interaction anywhere on the screen
  useEffect(() => {
    const unlockAudio = () => {
      audioEngine.initContext();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // 5. Keyboard shortcut listener for musicians holding acoustic guitar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        audioEngine.stopAllPads();
        return;
      }

      const shortcutMap: Record<string, number> = {
        Digit1: 0,
        Digit2: 1,
        Digit3: 2,
        Digit4: 3,
        Digit5: 4,
        Digit6: 5,
        Digit7: 6,
        Digit8: 7,
        Digit9: 8,
        Digit0: 9,
        KeyQ: 10,
        KeyW: 11,
        KeyE: 12,
        KeyR: 13,
        KeyT: 14,
        KeyY: 15,
      };

      if (e.code in shortcutMap) {
        const index = shortcutMap[e.code];
        if (index < pads.length) {
          e.preventDefault();
          audioEngine.resumeContextSync();
          audioEngine.playPad(pads[index]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pads]);

  // Connect Google Drive
  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        showToast(`Google Drive conectado com sucesso (${result.user.displayName || result.user.email})!`, 'success');
      }
    } catch (err: any) {
      console.error('Erro ao conectar ao Google Drive:', err);
      showToast('Não foi possível conectar ao Google Drive. Verifique a janela de permissões.', 'error');
    } finally {
      setIsConnectingDrive(false);
    }
  };

  // Disconnect Google Drive
  const handleDisconnectDrive = async () => {
    try {
      await logout();
      setUser(null);
      showToast('Desconectado do Google Drive', 'info');
    } catch (err) {
      console.error('Erro ao desconectar:', err);
    }
  };

  // Sync all local pads to Google Drive
  const handleSyncAllToDrive = async () => {
    const token = await getAccessToken();
    if (!token) {
      handleConnectDrive();
      return;
    }

    const unsyncedPads = pads.filter((p) => !p.isDriveSynced && (p.audioBlob || p.audioData));
    if (unsyncedPads.length === 0) {
      showToast('Todos os pads com áudio já estão salvos e sincronizados com o Google Drive!', 'info');
      return;
    }

    setIsSyncingDrive(true);
    try {
      const folderId = await getOrCreatePadsFolder(token);
      const updatedPads = [...pads];

      for (const pad of unsyncedPads) {
        let blob = pad.audioBlob;
        if (!blob && pad.audioData) {
          blob = new Blob([pad.audioData], { type: pad.mimeType || 'audio/mpeg' });
        }

        if (blob) {
          const fileName = `${pad.key ? `[${pad.key}] ` : ''}${pad.name}.mp3`;
          const uploadRes = await uploadAudioToDrive(token, fileName, pad.mimeType || 'audio/mpeg', blob, folderId);

          const idx = updatedPads.findIndex((p) => p.id === pad.id);
          if (idx >= 0) {
            updatedPads[idx] = {
              ...updatedPads[idx],
              driveFileId: uploadRes.fileId,
              driveFolderId: folderId,
              isDriveSynced: true,
              audioUrl: uploadRes.streamUrl,
            };
            await savePadToDB(updatedPads[idx]);
          }
        }
      }

      setPads(updatedPads);

      // Save manifest in Drive
      await saveCatalogToDrive(token, folderId, updatedPads);

      // Save to shared server list so all users can access immediately
      await fetch('/api/pads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPads),
      });

      showToast(`${unsyncedPads.length} pad(s) enviados para o Google Drive e disponibilizados para todos!`, 'success');
    } catch (err: any) {
      console.error('Erro na sincronização completa para o Drive:', err);
      showToast(`Erro ao sincronizar com Google Drive: ${err.message || 'Falha no upload'}`, 'error');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleTogglePlay = useCallback((pad: PadItem) => {
    audioEngine.resumeContextSync();
    audioEngine.playPad(pad);
  }, []);

  const handlePadsAdded = useCallback(
    async (newPads: PadItem[]) => {
      const updated = [...pads, ...newPads];
      setPads(updated);

      for (const pad of newPads) {
        await savePadToDB(pad);
      }

      // Sync new pads with server catalog so any user gets them
      try {
        await fetch('/api/pads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
      } catch (err) {
        console.warn('Erro ao atualizar lista compartilhada no servidor:', err);
      }

      showToast(`${newPads.length} novo(s) pad(s) adicionado(s) com sucesso!`, 'success');
    },
    [pads]
  );

  const handleEditPad = useCallback((pad: PadItem) => {
    setEditingPad(pad);
  }, []);

  const handleSaveEditedPad = useCallback(
    async (updated: PadItem) => {
      const nextPads = pads.map((p) => (p.id === updated.id ? updated : p));
      setPads(nextPads);
      await savePadToDB(updated);
      audioEngine.updatePadVolume(updated.id, updated.volume);

      // Sync updated pad to server
      try {
        await fetch('/api/pads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
      } catch {}
    },
    [pads]
  );

  // Prompt confirmation dialog before deleting (MANDATORY for Drive and destructive operations)
  const handleDeletePadPrompt = useCallback((pad: PadItem) => {
    setDeleteConfirmPad(pad);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteConfirmPad) return;
    setIsDeleting(true);

    const pad = deleteConfirmPad;
    try {
      if (audioEngine.isPadPlaying(pad.id)) {
        audioEngine.stopPad(pad.id);
      }

      // If stored in Google Drive, delete from user's Drive folder
      if (pad.driveFileId) {
        try {
          const token = await getAccessToken();
          if (token) {
            await deleteFileFromDrive(token, pad.driveFileId);
          }
        } catch (driveErr) {
          console.warn('Aviso ao apagar arquivo no Google Drive:', driveErr);
        }
      }

      // Remove from server shared pads
      try {
        await fetch(`/api/pads/${pad.id}`, { method: 'DELETE' });
      } catch {}

      // Remove from local state and DB
      setPads((prev) => prev.filter((p) => p.id !== pad.id));
      await deletePadFromDB(pad.id);
      localStorage.setItem('mesa_pads_initialized_v2', 'true');

      showToast(`Pad "${pad.name}" excluído`, 'info');
    } catch (err: any) {
      console.error('Erro ao excluir pad:', err);
      showToast('Erro ao excluir pad', 'error');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmPad(null);
    }
  };

  const presetCount = pads.filter((p) => p.isPreset).length;

  const handleDeleteAllPresets = useCallback(async () => {
    const presetPads = pads.filter((p) => p.isPreset);
    for (const p of presetPads) {
      if (audioEngine.isPadPlaying(p.id)) {
        audioEngine.stopPad(p.id);
      }
      await deletePadFromDB(p.id);
    }
    const remaining = pads.filter((p) => !p.isPreset);
    setPads(remaining);
    localStorage.setItem('mesa_pads_initialized_v2', 'true');

    try {
      await fetch('/api/pads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(remaining),
      });
    } catch {}

    showToast('Exemplos removidos. Mesa mantida apenas com os seus áudios.', 'info');
  }, [pads]);

  const handleVolumeChange = useCallback((pad: PadItem, newVol: number) => {
    const updated = { ...pad, volume: newVol };
    setPads((prev) => prev.map((p) => (p.id === pad.id ? updated : p)));
    audioEngine.updatePadVolume(pad.id, newVol);
    savePadToDB(updated);
  }, []);

  const handleSettingsChange = useCallback((newSettings: Partial<AudioEngineSettings>) => {
    if (newSettings.masterVolume !== undefined) {
      audioEngine.setMasterVolume(newSettings.masterVolume);
    }
    if (newSettings.filterCutoff !== undefined) {
      audioEngine.setFilterCutoff(newSettings.filterCutoff);
    }
    if (newSettings.fadeTime !== undefined) {
      audioEngine.setFadeTime(newSettings.fadeTime);
    }
    if (newSettings.soloMode !== undefined) {
      audioEngine.setSoloMode(newSettings.soloMode);
    }
  }, []);

  const activeColor = pads.find((p) => activePadIds.includes(p.id))?.color || '#10b981';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Navigation & Audio Master Engine Bar */}
      <Header
        settings={settings}
        activeCount={activePadIds.length}
        activeColor={activeColor}
        showMetronome={showMetronome}
        presetCount={presetCount}
        user={user}
        isConnectingDrive={isConnectingDrive}
        isSyncingDrive={isSyncingDrive}
        onConnectDrive={handleConnectDrive}
        onDisconnectDrive={handleDisconnectDrive}
        onSyncAllToDrive={handleSyncAllToDrive}
        onToggleMetronome={() => setShowMetronome(!showMetronome)}
        onOpenUpload={() => setIsUploadOpen(true)}
        onStopAll={() => audioEngine.stopAllPads()}
        onSettingsChange={handleSettingsChange}
        onDeleteAllPresets={handleDeleteAllPresets}
      />

      {/* Main Studio Pad Board */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 flex flex-col gap-6">
        {/* Metronome Collapsible Tool for Guitarists */}
        {showMetronome && (
          <div className="animate-in fade-in slide-in-from-top-3 duration-200">
            <Metronome />
          </div>
        )}

        {/* Violão & Pad Board Quick Status Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Guitar className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="font-semibold text-zinc-200">Acompanhamento de Violão:</span>
            <span className="hidden sm:inline text-zinc-400">
              Escolha o tom da canção. Ao trocar de pad, o som transita com fade suave contínuo.
            </span>
          </div>

          <div className="flex items-center gap-3 text-zinc-400 flex-wrap">
            {presetCount > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllPresets}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-rose-800/50 bg-rose-950/30 hover:bg-rose-900/60 hover:border-rose-600 text-rose-300 hover:text-white transition cursor-pointer"
                title="Apagar todos os áudios e pads de exemplo"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Apagar Exemplos ({presetCount})</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-zinc-500" />
              <span className="font-mono bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-[10px]">
                Teclas 1 a 9
              </span>
            </div>

            <div className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-zinc-300">{pads.length} Quadrados</span>
            </div>

            {pads.some((p) => p.isDriveSynced || p.driveFileId) && (
              <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                <Cloud className="w-3 h-3" />
                <span>Drive Ativo para Todos</span>
              </div>
            )}
          </div>
        </div>

        {/* Mesa de Pads com Layout de Quadrados Coloridos */}
        <div className="flex-1">
          <PadGrid
            pads={pads}
            activePadIds={activePadIds}
            onTogglePlay={handleTogglePlay}
            onEdit={handleEditPad}
            onDelete={handleDeletePadPrompt}
            onVolumeChange={handleVolumeChange}
            onOpenUpload={() => setIsUploadOpen(true)}
          />
        </div>

        {/* Bottom Guitar Tips & Legend */}
        <footer className="mt-8 pt-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Pads armazenados no Google Drive podem ser ouvidos e executados por todos os usuários na mesa.</span>
          </div>
        </footer>
      </main>

      {/* Upload Modal (Drag & Drop + File Upload + Google Drive Integration) */}
      <UploadModal
        isOpen={isUploadOpen}
        existingPadsCount={pads.length}
        isDriveConnected={!!user}
        onConnectDrive={handleConnectDrive}
        onClose={() => setIsUploadOpen(false)}
        onPadsAdded={handlePadsAdded}
      />

      {/* Edit Pad Modal (Name, Color Picker, Key) */}
      <PadEditModal
        pad={editingPad}
        onClose={() => setEditingPad(null)}
        onSave={handleSaveEditedPad}
      />

      {/* Mandatory User Confirmation Dialog for Destructive Delete */}
      {deleteConfirmPad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100">Excluir Pad de Áudio</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Tem certeza de que deseja remover o pad{' '}
                  <span className="font-semibold text-zinc-200">"{deleteConfirmPad.name}"</span>?
                </p>
                {deleteConfirmPad.driveFileId && (
                  <div className="mt-2.5 p-2 rounded-lg bg-rose-950/30 border border-rose-800/40 text-[11px] text-rose-300">
                    <strong>Atenção:</strong> Este arquivo está hospedado no Google Drive. Ao confirmar, ele será excluído permanentemente do Drive e deixará de ser transmitido para todos os usuários da mesa.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setDeleteConfirmPad(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-750 shadow-2xl text-xs text-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-200 max-w-sm">
          {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
          {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
          {toastMessage.type === 'info' && <Cloud className="w-4 h-4 text-amber-400 flex-shrink-0" />}
          <span className="flex-1">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
