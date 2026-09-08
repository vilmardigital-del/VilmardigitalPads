import React from 'react';
import {
  Volume2,
  VolumeX,
  Sliders,
  Sparkles,
  Plus,
  Square,
  Music2,
  SlidersHorizontal,
  Layers,
  Radio,
  Clock,
  Trash2,
  Cloud,
  LogOut,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AudioEngineSettings } from '../types';
import { AudioVisualizer } from './AudioVisualizer';

interface HeaderProps {
  settings: AudioEngineSettings;
  activeCount: number;
  activeColor?: string;
  showMetronome: boolean;
  presetCount?: number;
  user: User | null;
  isConnectingDrive?: boolean;
  isSyncingDrive?: boolean;
  onConnectDrive: () => void;
  onDisconnectDrive: () => void;
  onSyncAllToDrive?: () => void;
  onToggleMetronome: () => void;
  onOpenUpload: () => void;
  onStopAll: () => void;
  onSettingsChange: (newSettings: Partial<AudioEngineSettings>) => void;
  onDeleteAllPresets?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  activeCount,
  activeColor,
  showMetronome,
  presetCount = 0,
  user,
  isConnectingDrive = false,
  isSyncingDrive = false,
  onConnectDrive,
  onDisconnectDrive,
  onSyncAllToDrive,
  onToggleMetronome,
  onOpenUpload,
  onStopAll,
  onSettingsChange,
  onDeleteAllPresets,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 px-4 lg:px-8 py-3.5 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col gap-3">
        {/* Top bar: Title + Primary Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-emerald-500 p-0.5 shadow-md flex items-center justify-center">
              <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center text-amber-400">
                <Music2 className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  Mesa de Pads para Violão
                </h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Worship & Ambiência
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Quadrados coloridos independentes para acompanhamento contínuo no violão
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Google Drive Connection Button / Profile */}
            {!user ? (
              <button
                type="button"
                onClick={onConnectDrive}
                disabled={isConnectingDrive}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
                title="Conectar sua conta Google Drive para armazenar os pads na nuvem e disponibilizá-los para todos os usuários"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
                <span>{isConnectingDrive ? 'Conectando...' : 'Conectar Google Drive'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-emerald-500/40 px-2.5 py-1.5 rounded-xl text-xs shadow-sm">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Google'}
                    className="w-5 h-5 rounded-full border border-emerald-500/50"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[10px] font-bold">
                    {(user.displayName || user.email || 'G')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 leading-tight">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Drive Ativo</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 max-w-[110px] truncate leading-tight">
                    {user.displayName || user.email}
                  </span>
                </div>
                {onSyncAllToDrive && (
                  <button
                    type="button"
                    onClick={onSyncAllToDrive}
                    disabled={isSyncingDrive}
                    className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300 transition cursor-pointer"
                    title="Enviar e sincronizar pads locais com a pasta do Google Drive"
                  >
                    <Cloud className={`w-3.5 h-3.5 ${isSyncingDrive ? 'animate-spin text-amber-400' : ''}`} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDisconnectDrive}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition cursor-pointer"
                  title="Desconectar do Google Drive"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Metronome toggle */}
            <button
              onClick={onToggleMetronome}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition ${
                showMetronome
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Metrônomo</span>
            </button>

            {/* Stop All with smooth fade */}
            <button
              onClick={onStopAll}
              disabled={activeCount === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 disabled:opacity-40 disabled:pointer-events-none transition"
              title="Parar todos os pads com fade suave"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Parar Pads ({activeCount})</span>
            </button>

            {/* Delete example audio pads (if any exist) */}
            {presetCount > 0 && onDeleteAllPresets && (
              <button
                type="button"
                onClick={onDeleteAllPresets}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-rose-950/40 hover:border-rose-700/50 text-zinc-300 hover:text-rose-300 transition cursor-pointer"
                title="Apagar todos os áudios e pads de exemplo para manter apenas os seus áudios"
              >
                <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Apagar Exemplos ({presetCount})</span>
              </button>
            )}

            {/* Add Pad / Upload Button */}
            <button
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] transition active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Adicionar Pad de Áudio</span>
            </button>
          </div>
        </div>

        {/* Lower bar: Controls & Real-time Visualizer */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-2 border-t border-zinc-900">
          {/* Master Volume */}
          <div className="md:col-span-3 flex items-center gap-2 bg-zinc-900/60 px-3 py-1.5 rounded-xl border border-zinc-800/60">
            <button
              type="button"
              onClick={() => onSettingsChange({ masterVolume: settings.masterVolume > 0 ? 0 : 0.85 })}
              className="text-zinc-400 hover:text-white transition p-0.5 rounded cursor-pointer"
              title={settings.masterVolume === 0 ? 'Desmutar Master' : 'Mutar Master'}
            >
              {settings.masterVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400 flex-shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              )}
            </button>
            <span className="text-[11px] font-medium text-zinc-400 w-12">Master</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.masterVolume}
              onChange={(e) => onSettingsChange({ masterVolume: parseFloat(e.target.value) })}
              onInput={(e) => onSettingsChange({ masterVolume: parseFloat((e.target as HTMLInputElement).value) })}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
            <span className="text-[11px] font-mono text-zinc-300 w-8 text-right">
              {Math.round(settings.masterVolume * 100)}%
            </span>
          </div>

          {/* Tone Filter (Brilho Violão) */}
          <div className="md:col-span-3 flex items-center gap-2 bg-zinc-900/60 px-3 py-1.5 rounded-xl border border-zinc-800/60">
            <SlidersHorizontal className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            <span className="text-[11px] font-medium text-zinc-400 w-12" title="Filtro Passa-Baixa">
              Brilho
            </span>
            <input
              type="range"
              min="300"
              max="12000"
              step="100"
              value={settings.filterCutoff}
              onChange={(e) => onSettingsChange({ filterCutoff: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <span className="text-[10px] font-mono text-zinc-400 w-12 text-right">
              {settings.filterCutoff < 1500 ? 'Quente' : settings.filterCutoff > 7000 ? 'Aberto' : 'Médio'}
            </span>
          </div>

          {/* Crossfade Transition Time & Mode */}
          <div className="md:col-span-3 flex items-center gap-2 bg-zinc-900/60 px-3 py-1.5 rounded-xl border border-zinc-800/60">
            <span className="text-[11px] font-medium text-zinc-400">Fade:</span>
            <select
              value={settings.fadeTime}
              onChange={(e) => onSettingsChange({ fadeTime: parseFloat(e.target.value) })}
              aria-label="Tempo de transição suave (fade cruzado)"
              className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none"
            >
              <option value={1.0}>1.0s (Rápido)</option>
              <option value={2.0}>2.0s (Natural)</option>
              <option value={3.0}>3.0s (Suave)</option>
              <option value={4.5}>4.5s (Worship)</option>
            </select>

            {/* Mode toggle: Solo vs Layer */}
            <button
              onClick={() => onSettingsChange({ soloMode: !settings.soloMode })}
              className={`ml-auto flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded transition ${
                settings.soloMode
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              }`}
              title={
                settings.soloMode
                  ? 'Modo Solo: ao tocar outro pad, faz crossfade suave automaticamente (ideal para violão)'
                  : 'Modo Camadas: permite tocar múltiplos pads ao mesmo tempo'
              }
            >
              {settings.soloMode ? <Radio className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
              <span>{settings.soloMode ? 'Solo / Fade' : 'Camadas'}</span>
            </button>
          </div>

          {/* Real-time Visualizer */}
          <div className="md:col-span-3">
            <AudioVisualizer isPlaying={activeCount > 0} activeColor={activeColor} />
          </div>
        </div>
      </div>
    </header>
  );
};
