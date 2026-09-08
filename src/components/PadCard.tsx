import React from 'react';
import { Play, Square, Volume2, VolumeX, Trash2, Edit3, Disc3, Cloud } from 'lucide-react';
import { PadItem } from '../types';

interface PadCardProps {
  pad: PadItem;
  isPlaying: boolean;
  shortcutKey?: string;
  onTogglePlay: (pad: PadItem) => void;
  onEdit: (pad: PadItem) => void;
  onDelete: (pad: PadItem) => void;
  onVolumeChange: (pad: PadItem, newVol: number) => void;
}

export const PadCard: React.FC<PadCardProps> = ({
  pad,
  isPlaying,
  shortcutKey,
  onTogglePlay,
  onEdit,
  onDelete,
  onVolumeChange,
}) => {
  return (
    <div
      id={`pad-${pad.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onTogglePlay(pad)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTogglePlay(pad);
        }
      }}
      className={`group relative flex flex-col justify-between aspect-square rounded-2xl p-4 transition-all duration-300 border select-none overflow-hidden cursor-pointer ${
        pad.bgGradient
      } ${
        isPlaying
          ? 'ring-4 scale-[1.02] shadow-2xl z-10'
          : 'hover:scale-[1.01] hover:brightness-110 opacity-90 hover:opacity-100 shadow-md active:scale-95'
      }`}
      style={{
        boxShadow: isPlaying ? `0 0 28px ${pad.glowColor}, inset 0 0 20px ${pad.glowColor}` : undefined,
        borderColor: isPlaying ? pad.activeBorderColor : undefined,
        ['--tw-ring-color' as string]: pad.activeBorderColor,
      }}
    >
      {/* Background ambient pulse when active */}
      {isPlaying && (
        <div
          className="absolute inset-0 opacity-25 animate-pulse pointer-events-none rounded-2xl"
          style={{ backgroundColor: pad.color }}
        />
      )}

      {/* Top row: Key badge + Shortcut + Controls */}
      <div className="relative z-10 flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5">
          {pad.key ? (
            <span
              className="px-2.5 py-0.5 text-xs font-black tracking-wider rounded-md uppercase font-mono shadow-sm"
              style={{
                backgroundColor: 'rgba(0,0,0,0.5)',
                color: pad.color,
                border: `1px solid ${pad.activeBorderColor}50`,
              }}
            >
              Tom: {pad.key}
            </span>
          ) : (
            <span
              className="px-2 py-0.5 text-[10px] font-semibold rounded-md uppercase bg-black/40 text-zinc-300 border border-white/10"
            >
              Pad
            </span>
          )}

          {shortcutKey && (
            <span
              className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-black/50 text-zinc-400 border border-white/10"
              title={`Atalho teclado: ${shortcutKey}`}
            >
              {shortcutKey}
            </span>
          )}

          {(pad.isDriveSynced || pad.driveFileId) && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold rounded bg-black/60 text-emerald-300 border border-emerald-500/30"
              title="Áudio salvo no Google Drive (disponível para todos os usuários)"
            >
              <Cloud className="w-2.5 h-2.5 text-emerald-400" />
              <span>Drive</span>
            </span>
          )}
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(pad);
            }}
            className="p-1.5 rounded-lg bg-black/40 hover:bg-black/70 text-zinc-300 hover:text-white transition"
            title="Editar nome / cor / tom"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(pad);
            }}
            className="p-1.5 rounded-lg bg-black/40 hover:bg-rose-950/80 text-zinc-300 hover:text-rose-300 transition"
            title={pad.isPreset ? 'Apagar este áudio de exemplo' : 'Excluir este pad'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center Main Tap Area */}
      <div
        className="relative z-10 my-auto flex flex-col items-center justify-center text-center p-2 rounded-xl pointer-events-none"
      >
        <div
          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-2.5 transition-all duration-300 ${
            isPlaying
              ? 'bg-white text-zinc-950 shadow-lg scale-110'
              : 'bg-black/50 text-white hover:bg-black/70 border border-white/15'
          }`}
          style={{
            color: isPlaying ? '#09090b' : pad.color,
          }}
        >
          {isPlaying ? (
            <Square className="w-6 h-6 fill-current animate-pulse" />
          ) : (
            <Play className="w-7 h-7 fill-current ml-1 transition group-hover:scale-110" />
          )}
        </div>

        <h3 className="font-bold text-sm sm:text-base leading-snug line-clamp-2 drop-shadow-sm text-zinc-100">
          {pad.name}
        </h3>

        <div className="mt-1 flex items-center gap-1 text-[11px] font-medium tracking-wide">
          {isPlaying ? (
            <span className="flex items-center gap-1 text-emerald-300 font-semibold animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              EM EXECUÇÃO
            </span>
          ) : (
            <span className="text-zinc-400 flex items-center gap-1">
              <Disc3 className="w-3 h-3 opacity-60" />
              {pad.audioBlob || pad.audioData || pad.audioUrl ? 'Áudio Importado' : 'Sintetizador'}
            </span>
          )}
        </div>
      </div>

      {/* Bottom row: Volume mini control */}
      <div
        className="relative z-10 flex items-center justify-between gap-2 pt-1 border-t border-white/10"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 w-full">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onVolumeChange(pad, (pad.volume ?? 1.0) > 0 ? 0 : 1.0);
            }}
            className="text-zinc-400 hover:text-white transition p-0.5 rounded cursor-pointer"
            title={(pad.volume ?? 1.0) === 0 ? 'Desmutar Pad' : 'Mutar Pad'}
          >
            {(pad.volume ?? 1.0) === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-zinc-300" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.02"
            value={pad.volume ?? 1.0}
            onChange={(e) => {
              e.stopPropagation();
              onVolumeChange(pad, parseFloat(e.target.value));
            }}
            onInput={(e) => {
              e.stopPropagation();
              onVolumeChange(pad, parseFloat((e.target as HTMLInputElement).value));
            }}
            className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-white"
            title={`Volume: ${Math.round((pad.volume ?? 1.0) * 100)}%`}
          />
          <span className={`text-[10px] font-mono w-9 text-right font-semibold ${
            (pad.volume ?? 1.0) > 1.0 ? 'text-amber-300' : 'text-zinc-300'
          }`}>
            {Math.round((pad.volume ?? 1.0) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
