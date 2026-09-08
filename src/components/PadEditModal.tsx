import React, { useState } from 'react';
import { X, Check, Palette } from 'lucide-react';
import { PadItem } from '../types';
import { PAD_COLORS } from '../utils/colors';

interface PadEditModalProps {
  pad: PadItem | null;
  onClose: () => void;
  onSave: (updatedPad: PadItem) => void;
}

const MUSICAL_KEYS = ['', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const PadEditModal: React.FC<PadEditModalProps> = ({ pad, onClose, onSave }) => {
  if (!pad) return null;

  const [name, setName] = useState(pad.name);
  const [key, setKey] = useState(pad.key || '');
  const [selectedColorId, setSelectedColorId] = useState(
    PAD_COLORS.find((c) => c.hex === pad.color)?.id || PAD_COLORS[0].id
  );
  const [volume, setVolume] = useState(pad.volume ?? 0.9);

  const handleSave = () => {
    const colorScheme = PAD_COLORS.find((c) => c.id === selectedColorId) || PAD_COLORS[0];
    const updated: PadItem = {
      ...pad,
      name: name.trim() || pad.name,
      key: key || undefined,
      color: colorScheme.hex,
      textColor: colorScheme.textColor,
      bgGradient: colorScheme.bgGradient,
      activeBorderColor: colorScheme.activeBorderColor,
      glowColor: colorScheme.glowColor,
      volume,
    };
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Palette className="w-4 h-4 text-emerald-400" />
            Editar Quadrado do Pad
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Pad Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Nome do Pad</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
              placeholder="Ex: Pad Worship Dó Maior"
            />
          </div>

          {/* Musical Key */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Tom Musical (para Violão)
            </label>
            <select
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Sem tom específico</option>
              {MUSICAL_KEYS.filter(Boolean).map((k) => (
                <option key={k} value={k}>
                  Tom: {k}
                </option>
              ))}
            </select>
          </div>

          {/* Color Selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-2">
              Cor do Quadrado na Mesa
            </label>
            <div className="grid grid-cols-8 gap-2">
              {PAD_COLORS.map((c) => {
                const isSelected = c.id === selectedColorId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColorId(c.id)}
                    className={`w-7 h-7 rounded-lg transition-transform border flex items-center justify-center ${
                      isSelected
                        ? 'scale-125 ring-2 ring-white border-white shadow-lg'
                        : 'border-transparent hover:scale-110 opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-zinc-950 stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Volume */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 mb-1">
              <span>Volume Padrão deste Pad</span>
              <span className={`font-mono ${volume > 1.0 ? 'text-amber-300 font-bold' : 'text-zinc-400'}`}>
                {Math.round(volume * 100)}% {volume > 1.0 ? '(Ganho Extra)' : ''}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-2 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5 font-mono">
              <span>0% (Mudo)</span>
              <span>100% (Normal)</span>
              <span className="text-amber-400/80">150% (Boost)</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 rounded-xl transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow transition"
          >
            <Check className="w-4 h-4" />
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
};
