import React from 'react';
import { Plus, Sparkles, Music, UploadCloud } from 'lucide-react';
import { PadItem } from '../types';
import { PadCard } from './PadCard';

interface PadGridProps {
  pads: PadItem[];
  activePadIds: string[];
  isAdmin?: boolean;
  onTogglePlay: (pad: PadItem) => void;
  onEdit: (pad: PadItem) => void;
  onDelete: (pad: PadItem) => void;
  onVolumeChange: (pad: PadItem, newVol: number) => void;
  onOpenUpload: () => void;
}

const SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q', 'W', 'E', 'R', 'T', 'Y'];

export const PadGrid: React.FC<PadGridProps> = ({
  pads,
  activePadIds,
  isAdmin = false,
  onTogglePlay,
  onEdit,
  onDelete,
  onVolumeChange,
  onOpenUpload,
}) => {
  if (pads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/80 my-8">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20">
          <Music className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-zinc-100 mb-2">Sua Mesa de Pads está Vazia</h3>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          Adicione seus arquivos de áudio (MP3, WAV, M4A) para criar os quadrados coloridos de acompanhamento.
        </p>
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg transition active:scale-95 cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          Adicionar Pad de Áudio
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Grid of Square Pads */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-5">
        {pads.map((pad, index) => {
          const isPlaying = activePadIds.includes(pad.id);
          const shortcut = index < SHORTCUT_KEYS.length ? SHORTCUT_KEYS[index] : undefined;

          return (
            <PadCard
              key={pad.id}
              pad={pad}
              isPlaying={isPlaying}
              shortcutKey={shortcut}
              isAdmin={isAdmin}
              onTogglePlay={onTogglePlay}
              onEdit={onEdit}
              onDelete={onDelete}
              onVolumeChange={onVolumeChange}
            />
          );
        })}

        {/* Add New Pad Quick Tile */}
        <button
          type="button"
          onClick={onOpenUpload}
          className="group flex flex-col items-center justify-center aspect-square rounded-2xl p-4 border-2 border-dashed border-zinc-800 hover:border-emerald-500/50 bg-zinc-900/30 hover:bg-emerald-950/20 text-zinc-400 hover:text-emerald-300 transition-all duration-300 select-none shadow-sm hover:scale-[1.01]"
        >
          <div className="w-12 h-12 rounded-full bg-zinc-800/80 group-hover:bg-emerald-500/20 flex items-center justify-center mb-2 transition">
            <Plus className="w-6 h-6 text-zinc-300 group-hover:text-emerald-400 transition" />
          </div>
          <span className="font-bold text-xs sm:text-sm text-zinc-300 group-hover:text-emerald-300 text-center">
            Adicionar Novo Pad
          </span>
          <span className="text-[10px] text-zinc-500 group-hover:text-emerald-400/70 text-center mt-1">
            Novo quadrado colorido
          </span>
        </button>
      </div>
    </div>
  );
};
