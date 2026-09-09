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
  Square,
  ShieldCheck,
  KeyRound,
  RefreshCw,
  Globe,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout, getAccessToken } from './services/auth';
import {
  getOrCreatePadsFolder,
  uploadAudioToDrive,
  deleteFileFromDrive,
  saveCatalogToDrive,
  syncPadsFromDrive,
} from './services/drive';

export const ADMIN_EMAIL = 'vilmardigital@gmail.com';

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

  // Checks whether the logged user is the administrator Vilmar Digital
  const isAdmin = Boolean(user?.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

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

        // If the shared server collection contains pads (added by administrator vilmardigital@gmail.com),
        // give all visitors immediate access to them!
        if (serverPads && serverPads.length > 0) {
          setPads(serverPads);
          // Cache server pads locally for fast offline access
          for (const p of serverPads) {
            await savePadToDB(p);
          }
        } else {
          // If server collection is not yet populated, check local DB or presets
          const storedPads = await getAllStoredPads();
          if (storedPads && storedPads.length > 0) {
            setPads(storedPads);
          } else {
            setPads(INITIAL_PRESET_PADS);
            for (const p of INITIAL_PRESET_PADS) {
              await savePadToDB(p);
            }
          }
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
        const email = (result.user.email || '').toLowerCase();
        if (email === ADMIN_EMAIL.toLowerCase()) {
          showToast(`Bem-vindo, Administrador Vilmar Digital! Sincronizando áudios do Google Drive...`, 'success');
          const token = await getAccessToken();
          if (token) {
            await handleSyncDrivePads(token);
          }
        } else {
          showToast(`Conectado como ${result.user.displayName || result.user.email}. O aplicativo está aberto para você tocar todos os áudios!`, 'info');
        }
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
      showToast('Sessão encerrada', 'info');
    } catch (err) {
      console.error('Erro ao desconectar:', err);
    }
  };

  // Scan and sync pads from Google Drive folder "Mesa de Pads - Violão"
  const handleSyncDrivePads = async (customToken?: string) => {
    setIsSyncingDrive(true);
    try {
      const token = customToken || (await getAccessToken());
      if (!token) {
        showToast('Faça login com a conta vilmardigital@gmail.com para sincronizar.', 'error');
        return;
      }

      showToast('Varrendo pasta "Mesa de Pads - Violão" no Google Drive...', 'info');
      const drivePads = await syncPadsFromDrive(token);

      if (drivePads.length === 0) {
        // If drive folder doesn't have audios yet, check if there are local pads to upload
        await handleSyncAllToDrive();
        return;
      }

      // Merge drive pads with current pads (giving preference to Drive metadata)
      const mergedMap = new Map<string, PadItem>();
      drivePads.forEach((p) => mergedMap.set(p.id, p));
      pads.forEach((p) => {
        if (!mergedMap.has(p.id)) {
          mergedMap.set(p.id, p);
        }
      });

      const updated = Array.from(mergedMap.values());
      setPads(updated);

      for (const p of updated) {
        await savePadToDB(p);
        // Pre-cache Google Drive files on server disk so every visitor gets instant playback
        if (p.driveFileId) {
          try {
            fetch(`/api/drive-cache/${p.driveFileId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accessToken: token }),
            });
          } catch {}
        }
      }

      // Publish to shared server list so ALL users across the world get them immediately
      await fetch('/api/pads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updated),
      });

      showToast(`Sucesso! ${drivePads.length} pad(s) do Google Drive sincronizados e abertos para todos os usuários!`, 'success');
    } catch (err: any) {
      console.error('Erro ao sincronizar do Google Drive:', err);
      showToast(`Erro na sincronização: ${err.message || 'Falha ao sincronizar'}`, 'error');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  // Publish the current pad board to the central server so all visitors get access to it
  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublishToAll = async () => {
    setIsPublishing(true);
    try {
      showToast('Publicando acervo para todos os usuários...', 'info');
      const updatedPads = [...pads];

      for (let i = 0; i < updatedPads.length; i++) {
        const p = updatedPads[i];
        if ((!p.audioUrl || p.audioUrl.startsWith('blob:')) && (p.audioBlob || p.audioData)) {
          let blob = p.audioBlob;
          if (!blob && p.audioData) {
            blob = new Blob([p.audioData], { type: p.mimeType || 'audio/mpeg' });
          }
          if (blob) {
            try {
              const reader = new FileReader();
              const b64Promise = new Promise<string>((resolve, reject) => {
                reader.onload = () => {
                  const res = reader.result as string;
                  resolve(res.split(',')[1] || res);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob!);
              });
              const b64 = await b64Promise;
              const uploadRes = await fetch('/api/upload-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: p.id, base64: b64, mimeType: p.mimeType }),
              });
              if (uploadRes.ok) {
                const d = await uploadRes.json();
                if (d.audioUrl) {
                  updatedPads[i] = { ...p, audioUrl: d.audioUrl };
                  await savePadToDB(updatedPads[i]);
                }
              }
            } catch (upErr) {
              console.warn('Aviso ao enviar áudio do pad:', upErr);
            }
          }
        }
      }

      setPads(updatedPads);

      const res = await fetch('/api/pads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedPads),
      });

      if (res.ok) {
        showToast(
          `Publicado! Todos os usuários que abrirem o aplicativo terão acesso imediato aos ${updatedPads.length} pads.`,
          'success'
        );
      } else {
        showToast('Erro ao salvar no servidor.', 'error');
      }
    } catch (err: any) {
      console.error('Erro ao publicar:', err);
      showToast('Erro ao publicar: ' + (err.message || ''), 'error');
    } finally {
      setIsPublishing(false);
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
        headers: {
          'Content-Type': 'application/json',
        },
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
          headers: {
            'Content-Type': 'application/json',
          },
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
          headers: {
            'Content-Type': 'application/json',
          },
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
        await fetch(`/api/pads/${pad.id}`, {
          method: 'DELETE',
        });
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
        headers: {
          'Content-Type': 'application/json',
        },
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
        onToggleMetronome={() => setShowMetronome(!showMetronome)}
        onSettingsChange={handleSettingsChange}
      />

      {/* Main Studio Pad Board */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-col gap-3 sm:gap-4">
        {/* Metronome Collapsible Tool for Guitarists */}
        {showMetronome && (
          <div className="animate-in fade-in slide-in-from-top-3 duration-200">
            <Metronome />
          </div>
        )}

        {/* Open App & Pad Board Quick Status Banner */}
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-zinc-300 flex-wrap">
              <Guitar className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="font-bold text-zinc-100">Mesa Aberta a Todos os Músicos</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Cloud className="w-3 h-3" />
                <span>Acervo Oficial: Vilmar Digital</span>
              </span>
            </div>

            <div className="flex items-center gap-2 text-zinc-400 flex-wrap">
              {/* Parar Pads (quando algum estiver ativo) */}
              {activePadIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => audioEngine.stopAllPads()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 hover:text-white transition cursor-pointer shadow-sm animate-pulse"
                  title="Parar todos os pads com fade suave"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Parar Pads ({activePadIds.length})</span>
                </button>
              )}

              {/* Pad Count badge */}
              <div className="flex items-center gap-1.5 font-medium px-2 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{pads.length} Quadrados</span>
              </div>

              {/* Keyboard tip */}
              <div className="hidden lg:flex items-center gap-1.5 text-zinc-400">
                <Keyboard className="w-3.5 h-3.5 text-zinc-500" />
                <span className="font-mono bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-[10px]">
                  Espaço para parar
                </span>
              </div>

              {/* Admin or Visitor Actions */}
              {isAdmin ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Admin: Vilmar</span>
                  </div>

                  <button
                    type="button"
                    onClick={handlePublishToAll}
                    disabled={isPublishing}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 hover:text-white transition cursor-pointer disabled:opacity-50"
                    title="Publicar acervo de pads para que todos os usuários que abrirem o aplicativo tenham acesso"
                  >
                    {isPublishing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Globe className="w-3 h-3 text-cyan-400" />
                    )}
                    <span>{isPublishing ? 'Publicando...' : 'Publicar p/ Todos'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSyncDrivePads()}
                    disabled={isSyncingDrive}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 hover:text-white transition cursor-pointer disabled:opacity-50"
                    title="Sincronizar áudios da pasta do Google Drive"
                  >
                    {isSyncingDrive ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3 text-emerald-400" />
                    )}
                    <span>{isSyncingDrive ? 'Sincronizando...' : 'Sincronizar Drive'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsUploadOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition cursor-pointer"
                  >
                    <span>+ Novo Pad</span>
                  </button>

                  {presetCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteAllPresets}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border border-rose-800/50 bg-rose-950/30 hover:bg-rose-900/60 text-rose-300 hover:text-white transition cursor-pointer"
                      title="Apagar áudios de exemplo"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                      <span>Exemplos ({presetCount})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleDisconnectDrive}
                    className="px-2 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                    title="Desconectar"
                  >
                    Sair
                  </button>
                </div>
              ) : user ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400">
                    Conectado: <strong className="text-zinc-300">{user.email}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleDisconnectDrive}
                    className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200 rounded border border-zinc-800 hover:bg-zinc-800 transition cursor-pointer"
                  >
                    Sair
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  disabled={isConnectingDrive}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                  title="Acesso reservado ao administrador Vilmar Digital para sincronizar áudios oficiais"
                >
                  <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{isConnectingDrive ? 'Conectando...' : 'Acesso Admin (Vilmar)'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mesa de Pads com Layout de Quadrados Coloridos */}
        <div className="flex-1">
          <PadGrid
            pads={pads}
            activePadIds={activePadIds}
            isAdmin={isAdmin}
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
            <span>Aplicativo aberto para todos os usuários com áudios gerenciados por Vilmar Digital ({ADMIN_EMAIL}).</span>
          </div>
        </footer>
      </main>

      {/* Upload Modal (Drag & Drop + File Upload + Google Drive Integration) */}
      <UploadModal
        isOpen={isUploadOpen}
        existingPadsCount={pads.length}
        isDriveConnected={!!user}
        isAdmin={isAdmin}
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
