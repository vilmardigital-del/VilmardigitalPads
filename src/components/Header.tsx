import React from 'react';
import {
  Volume2,
  VolumeX,
  Music2,
  SlidersHorizontal,
  Layers,
  Radio,
  Clock,
} from 'lucide-react';
import { AudioEngineSettings } from '../types';
import { AudioVisualizer } from './AudioVisualizer';

interface HeaderProps {
  settings: AudioEngineSettings;
  activeCount: number;
  activeColor?: string;
  showMetronome: boolean;
  onToggleMetronome: () => void;
  onSettingsChange: (newSettings: Partial<AudioEngineSettings>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  activeCount,
  activeColor,
  showMetronome,
  onToggleMetronome,
  onSettingsChange,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 px-3 sm:px-6 py-1.5 sm:py-2 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-2">
        {/* Left: Compact Logo & Title */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-emerald-500 p-0.5 shadow-sm flex items-center justify-center flex-shrink-0">
              <div className="w-full h-full bg-zinc-950 rounded-[6px] flex items-center justify-center text-amber-400">
                <Music2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap">
                Mesa de Pads
              </h1>
              <span className="hidden sm:inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Violão & Worship
              </span>
            </div>
          </div>

          {/* Metronome button on mobile (visible only on small screens next to title) */}
          <button
            onClick={onToggleMetronome}
            className={`xl:hidden flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer ${
              showMetronome
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Metrônomo</span>
          </button>
        </div>

        {/* Right / Controls bar: Compact audio master controls */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between xl:justify-end overflow-x-auto pb-0.5 xl:pb-0">
          {/* Master Volume */}
          <div className="flex items-center gap-1.5 bg-zinc-900/70 px-2 py-1 rounded-lg border border-zinc-800/70 text-xs flex-shrink-0">
            <button
              type="button"
              onClick={() => onSettingsChange({ masterVolume: settings.masterVolume > 0 ? 0 : 0.85 })}
              className="text-zinc-400 hover:text-white transition p-0.5 rounded cursor-pointer"
              title={settings.masterVolume === 0 ? 'Desmutar Master' : 'Mutar Master'}
            >
              {settings.masterVolume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
              )}
            </button>
            <span className="text-[10px] font-medium text-zinc-400">Vol</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.masterVolume}
              onChange={(e) => onSettingsChange({ masterVolume: parseFloat(e.target.value) })}
              className="w-16 sm:w-20 h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-400"
            />
            <span className="text-[10px] font-mono text-zinc-300 w-6 text-right">
              {Math.round(settings.masterVolume * 100)}%
            </span>
          </div>

          {/* Tone Filter (Brilho Violão) */}
          <div className="flex items-center gap-1.5 bg-zinc-900/70 px-2 py-1 rounded-lg border border-zinc-800/70 text-xs flex-shrink-0">
            <SlidersHorizontal className="w-3 h-3 text-zinc-400 flex-shrink-0" />
            <span className="text-[10px] font-medium text-zinc-400" title="Filtro de Tom / Brilho">
              Brilho
            </span>
            <input
              type="range"
              min="300"
              max="12000"
              step="100"
              value={settings.filterCutoff}
              onChange={(e) => onSettingsChange({ filterCutoff: parseFloat(e.target.value) })}
              className="w-14 sm:w-16 h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-amber-400"
            />
            <span className="text-[9px] font-mono text-zinc-400 hidden sm:inline">
              {settings.filterCutoff < 1500 ? 'Quente' : settings.filterCutoff > 7000 ? 'Aberto' : 'Médio'}
            </span>
          </div>

          {/* Fade & Solo Mode */}
          <div className="flex items-center gap-1 bg-zinc-900/70 px-2 py-1 rounded-lg border border-zinc-800/70 text-xs flex-shrink-0">
            <span className="text-[10px] font-medium text-zinc-400">Fade:</span>
            <select
              value={settings.fadeTime}
              onChange={(e) => onSettingsChange({ fadeTime: parseFloat(e.target.value) })}
              aria-label="Tempo de transição suave"
              className="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[10px] text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value={1.0}>1s</option>
              <option value={2.0}>2s</option>
              <option value={3.0}>3s</option>
              <option value={4.5}>4.5s</option>
            </select>

            <button
              onClick={() => onSettingsChange({ soloMode: !settings.soloMode })}
              className={`ml-1 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer ${
                settings.soloMode
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              }`}
              title={
                settings.soloMode
                  ? 'Modo Solo: ao tocar outro pad, faz fade suave automático (ideal para violão)'
                  : 'Modo Camadas: permite múltiplos pads simultâneos'
              }
            >
              {settings.soloMode ? <Radio className="w-2.5 h-2.5" /> : <Layers className="w-2.5 h-2.5" />}
              <span>{settings.soloMode ? 'Solo' : 'Camadas'}</span>
            </button>
          </div>

          {/* Real-time Visualizer */}
          <div className="w-20 sm:w-28 hidden md:block flex-shrink-0">
            <AudioVisualizer isPlaying={activeCount > 0} activeColor={activeColor} />
          </div>

          {/* Metronome button on desktop */}
          <button
            onClick={onToggleMetronome}
            className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer flex-shrink-0 ${
              showMetronome
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Metrônomo</span>
          </button>
        </div>
      </div>
    </header>
  );
};
