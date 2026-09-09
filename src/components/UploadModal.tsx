import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Check, Sparkles, FileAudio, Play, Square, Volume2, Cloud, Loader2 } from 'lucide-react';
import { PadItem } from '../types';
import { getNextColor } from '../utils/colors';
import { getAccessToken } from '../services/auth';
import { getOrCreatePadsFolder, uploadAudioToDrive, saveCatalogToDrive } from '../services/drive';

interface UploadModalProps {
  isOpen: boolean;
  existingPadsCount: number;
  isDriveConnected?: boolean;
  isAdmin?: boolean;
  onConnectDrive?: () => void;
  onClose: () => void;
  onPadsAdded: (newPads: PadItem[]) => void;
}

const MUSICAL_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface UploadItem {
  file: File;
  name: string;
  key: string;
  colorIndex: number;
  volume: number;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  existingPadsCount,
  isDriveConnected = false,
  isAdmin = false,
  onConnectDrive,
  onClose,
  onPadsAdded,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<UploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [saveToDrive, setSaveToDrive] = useState<boolean>(true);
  const [previewingIndex, setPreviewingIndex] = useState<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop preview on modal close or unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
        previewAudioRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const guessKeyFromName = (fileName: string): string => {
    const cleanName = fileName.replace(/\.[^/.]+$/, '').toUpperCase();
    for (const key of ['C#', 'D#', 'F#', 'G#', 'A#', 'DB', 'EB', 'GB', 'AB', 'BB']) {
      if (new RegExp(`(^|[\\s_\\-\\(\\[])${key}([\\s_\\-\\)\\]]|$)`, 'i').test(cleanName)) {
        return key.replace('DB', 'C#').replace('EB', 'D#').replace('GB', 'F#').replace('AB', 'G#').replace('BB', 'A#');
      }
    }
    for (const key of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
      if (new RegExp(`(^|[\\s_\\-\\(\\[])${key}([\\s_\\-\\)\\]]|$)`, 'i').test(cleanName)) {
        return key;
      }
    }
    return '';
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newEntries: UploadItem[] = [];

    Array.from(files).forEach((file, index) => {
      // Clean name without extension
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      const detectedKey = guessKeyFromName(file.name);
      const colorIndex = existingPadsCount + selectedFiles.length + index;

      newEntries.push({
        file,
        name: baseName,
        key: detectedKey,
        colorIndex,
        volume: 1.0, // Default 100% volume
      });
    });

    setSelectedFiles((prev) => [...prev, ...newEntries]);
  };

  const handleTogglePreview = (index: number) => {
    if (previewingIndex === index) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPreviewingIndex(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    const item = selectedFiles[index];
    if (!item) return;

    const url = URL.createObjectURL(item.file);
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0, item.volume));
    audio.onended = () => setPreviewingIndex(null);
    audio.onerror = () => setPreviewingIndex(null);
    audio.play().then(() => {
      previewAudioRef.current = audio;
      setPreviewingIndex(index);
    }).catch((err) => {
      console.warn('Erro ao pré-escutar áudio:', err);
      setPreviewingIndex(null);
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveItem = (index: number) => {
    if (previewingIndex === index && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewingIndex(null);
    }
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, updates: Partial<UploadItem>) => {
    setSelectedFiles((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          const updated = { ...item, ...updates };
          if (previewingIndex === index && previewAudioRef.current && updates.volume !== undefined) {
            previewAudioRef.current.volume = Math.min(1, Math.max(0, updates.volume));
          }
          return updated;
        }
        return item;
      })
    );
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewingIndex(null);
    }

    try {
      const token = saveToDrive && isDriveConnected ? await getAccessToken() : null;
      let driveFolderId = '';

      if (token) {
        setProcessingStatus('Acessando pasta no Google Drive...');
        try {
          driveFolderId = await getOrCreatePadsFolder(token);
        } catch (fErr) {
          console.warn('Erro ao acessar pasta no Drive:', fErr);
        }
      }

      const createdPads: PadItem[] = [];

      for (let idx = 0; idx < selectedFiles.length; idx++) {
        const item = selectedFiles[idx];
        const colorScheme = getNextColor(item.colorIndex);
        let arrayBuffer: ArrayBuffer | undefined = undefined;
        try {
          arrayBuffer = await item.file.arrayBuffer();
        } catch (bufErr) {
          console.warn('Não foi possível ler ArrayBuffer do arquivo:', bufErr);
        }

        const padId = `pad-upload-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
        let objectUrl = '';
        try {
          objectUrl = URL.createObjectURL(item.file);
        } catch (urlErr) {
          console.warn('Erro ao criar URL do áudio selecionado:', urlErr);
        }

        let driveFileId: string | undefined = undefined;
        let isDriveSynced = false;
        let streamUrl = objectUrl;

        // 1. Upload audio to server disk for universal access by all users
        try {
          setProcessingStatus(`Disponibilizando áudio ${idx + 1}/${selectedFiles.length} para todos os usuários...`);
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const res = reader.result as string;
              const b64 = res.split(',')[1] || res;
              resolve(b64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(item.file);
          });
          const base64Data = await base64Promise;
          const serverUploadRes = await fetch('/api/upload-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: padId,
              base64: base64Data,
              mimeType: item.file.type || 'audio/mpeg',
            }),
          });
          if (serverUploadRes.ok) {
            const data = await serverUploadRes.json();
            if (data.audioUrl) {
              streamUrl = data.audioUrl;
            }
          }
        } catch (uploadServerErr) {
          console.warn('Erro ao enviar áudio ao servidor:', uploadServerErr);
        }

        // 2. Upload to Google Drive if connected and active
        if (token && driveFolderId) {
          setProcessingStatus(`Salvando ${idx + 1}/${selectedFiles.length} no Google Drive...`);
          try {
            const fileName = `${item.key ? `[${item.key}] ` : ''}${item.name.trim() || `Pad ${existingPadsCount + idx + 1}`}.mp3`;
            const uploadRes = await uploadAudioToDrive(
              token,
              fileName,
              item.file.type || 'audio/mpeg',
              item.file,
              driveFolderId
            );
            driveFileId = uploadRes.fileId;
            // Also cache file on server using the admin's token
            try {
              await fetch(`/api/drive-cache/${uploadRes.fileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: token }),
              });
            } catch {}
            if (!streamUrl.startsWith('/api/audio')) {
              streamUrl = uploadRes.streamUrl;
            }
            isDriveSynced = true;
          } catch (uploadErr) {
            console.error('Falha ao enviar áudio individual para o Drive:', uploadErr);
          }
        }

        createdPads.push({
          id: padId,
          name: item.name.trim() || `Pad ${existingPadsCount + idx + 1}`,
          key: item.key || undefined,
          color: colorScheme.hex,
          textColor: colorScheme.textColor,
          bgGradient: colorScheme.bgGradient,
          activeBorderColor: colorScheme.activeBorderColor,
          glowColor: colorScheme.glowColor,
          audioBlob: item.file,
          audioData: arrayBuffer,
          audioUrl: streamUrl || objectUrl,
          mimeType: item.file.type || 'audio/mpeg',
          isPreset: false,
          volume: item.volume ?? 1.0,
          driveFileId,
          driveFolderId: driveFolderId || undefined,
          isDriveSynced,
          createdAt: Date.now() + idx,
        });
      }

      // If uploaded to Drive, also update catalog file in Drive
      if (token && driveFolderId && createdPads.some((p) => p.isDriveSynced)) {
        setProcessingStatus('Atualizando catálogo no Google Drive...');
        try {
          await saveCatalogToDrive(token, driveFolderId, createdPads);
        } catch (catErr) {
          console.warn('Aviso ao salvar catálogo no Drive:', catErr);
        }
      }

      onPadsAdded(createdPads);
      onClose();
      setSelectedFiles([]);
    } catch (err) {
      console.error('Erro ao processar uploads de pads:', err);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Adicionar Novos Pads de Áudio</h2>
              <p className="text-xs text-zinc-400">
                Cada áudio criará um novo quadrado colorido independente para seu violão
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (previewAudioRef.current) previewAudioRef.current.pause();
              onClose();
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Google Drive Option Banner */}
        <div className="mt-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <Cloud className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-zinc-200">
                {isAdmin
                  ? 'Drive Oficial de Vilmar Digital (Público)'
                  : 'Armazenamento de Áudios'}
              </div>
              <div className="text-[11px] text-zinc-400">
                {isAdmin
                  ? 'Como Administrador, seus áudios serão enviados ao seu Google Drive e abertos publicamente para todos os usuários.'
                  : isDriveConnected
                  ? 'Áudios salvos na sua conta do Google Drive.'
                  : 'O aplicativo está aberto com o acervo de Vilmar Digital. Novos áudios locais funcionarão na sua sessão.'}
              </div>
            </div>
          </div>
          {isAdmin && isDriveConnected ? (
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-emerald-400 flex-shrink-0">
              <input
                type="checkbox"
                checked={saveToDrive}
                onChange={(e) => setSaveToDrive(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 bg-zinc-900 cursor-pointer"
              />
              <span>Publicar no Drive</span>
            </label>
          ) : (
            !isDriveConnected &&
            onConnectDrive && (
              <button
                type="button"
                onClick={onConnectDrive}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer flex-shrink-0"
              >
                Login Vilmar
              </button>
            )
          )}
        </div>

        {/* Dropzone */}
        <div className="mt-4">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
              dragActive
                ? 'border-emerald-500 bg-emerald-950/20'
                : 'border-zinc-700 hover:border-zinc-500 bg-zinc-950/50 hover:bg-zinc-950/80'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-300">
              <FileAudio className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-200">
                Arraste seus arquivos de áudio aqui ou clique para selecionar
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Suporta MP3, WAV, OGG, M4A, AAC, FLAC (Pads contínuos, ambiências, violão)
              </p>
            </div>
          </div>
        </div>

        {/* Selected files list */}
        {selectedFiles.length > 0 && (
          <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-64">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Pads a serem criados ({selectedFiles.length}):
            </p>
            {selectedFiles.map((item, index) => {
              const color = getNextColor(item.colorIndex);
              const isPlaying = previewingIndex === index;
              return (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center gap-2.5 p-3 rounded-xl bg-zinc-950 border border-zinc-800/80"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {/* Color preview square */}
                    <div
                      className="w-7 h-7 rounded-lg flex-shrink-0 shadow border border-white/20"
                      style={{ backgroundColor: color.hex }}
                      title={`Cor atribuída: ${color.name}`}
                    />

                    {/* Preview sound button */}
                    <button
                      type="button"
                      onClick={() => handleTogglePreview(index)}
                      className={`p-1.5 rounded-lg border transition cursor-pointer flex-shrink-0 ${
                        isPlaying
                          ? 'bg-emerald-500 text-zinc-950 border-emerald-400 animate-pulse'
                          : 'bg-zinc-800 text-zinc-300 hover:text-white border-zinc-700'
                      }`}
                      title={isPlaying ? 'Pausar prévia' : 'Ouvir prévia do áudio'}
                    >
                      {isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                    </button>

                    {/* Name input */}
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateItem(index, { name: e.target.value })}
                        placeholder="Nome do Pad"
                        className="w-full bg-transparent text-sm text-zinc-100 font-medium focus:outline-none focus:border-b focus:border-emerald-500 pb-0.5"
                      />
                      <span className="text-[10px] text-zinc-500 truncate block">
                        {(item.file.size / (1024 * 1024)).toFixed(2)} MB • Cor: {color.name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 justify-between sm:justify-end border-t sm:border-t-0 pt-1.5 sm:pt-0 border-zinc-800/60">
                    {/* Volume slider */}
                    <div className="flex items-center gap-1.5 w-28" title={`Volume deste áudio: ${Math.round(item.volume * 100)}%`}>
                      <Volume2 className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.05"
                        value={item.volume}
                        onChange={(e) => handleUpdateItem(index, { volume: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-400"
                      />
                      <span className={`text-[10px] font-mono w-7 text-right ${item.volume > 1.0 ? 'text-amber-300' : 'text-zinc-400'}`}>
                        {Math.round(item.volume * 100)}%
                      </span>
                    </div>

                    {/* Key selector */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-zinc-400">Tom:</span>
                      <select
                        value={item.key}
                        onChange={(e) => handleUpdateItem(index, { key: e.target.value })}
                        aria-label="Tom musical do pad"
                        className="bg-zinc-800 border border-zinc-700 text-xs rounded px-1.5 py-1 text-zinc-200 focus:outline-none"
                      >
                        <option value="">Livre</option>
                        {MUSICAL_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Remove item */}
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="p-1 text-zinc-500 hover:text-rose-400 transition"
                      title="Remover"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            {isProcessing && processingStatus ? (
              <span className="text-emerald-400 flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {processingStatus}
              </span>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Cores automáticas e diferenciadas para cada pad</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (previewAudioRef.current) previewAudioRef.current.pause();
                onClose();
              }}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 rounded-xl transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedFiles.length === 0 || isProcessing}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-lg transition"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Adicionar {selectedFiles.length} Pad{selectedFiles.length > 1 ? 's' : ''}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
