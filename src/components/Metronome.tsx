import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Minus, Music2 } from 'lucide-react';

interface MetronomeProps {
  onClose?: () => void;
}

export const Metronome: React.FC<MetronomeProps> = () => {
  const [bpm, setBpm] = useState(72);
  const [isPlaying, setIsPlaying] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [currentBeat, setCurrentBeat] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  const playClick = (isAccent: boolean) => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isAccent ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(isAccent ? 1200 : 800, ctx.currentTime);

      gain.gain.setValueAtTime(isAccent ? 0.35 : 0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.06);
    } catch (e) {
      console.warn('Erro no metrônomo:', e);
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      setCurrentBeat(0);
      return;
    }

    const intervalMs = (60 / bpm) * 1000;
    let beat = 0;

    playClick(true);
    setCurrentBeat(1);

    timerRef.current = window.setInterval(() => {
      beat = (beat + 1) % beatsPerBar;
      setCurrentBeat(beat + 1);
      playClick(beat === 0);
    }, intervalMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isPlaying, bpm, beatsPerBar]);

  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;

    // Filter taps older than 3 seconds
    const recentTaps = taps.filter((t) => now - t < 3000);
    recentTaps.push(now);
    tapTimesRef.current = recentTaps;

    if (recentTaps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recentTaps.length; i++) {
        intervals.push(recentTaps[i] - recentTaps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      if (calculatedBpm >= 40 && calculatedBpm <= 240) {
        setBpm(calculatedBpm);
      }
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-lg flex flex-wrap items-center gap-4 text-zinc-100">
      <div className="flex items-center gap-2">
        <Music2 className="w-5 h-5 text-amber-400" />
        <span className="font-semibold text-sm">Metrônomo Violão</span>
      </div>

      <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
        <button
          onClick={() => setBpm((b) => Math.max(40, b - 1))}
          className="p-1 text-zinc-400 hover:text-zinc-100 transition rounded"
          title="Diminuir BPM"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="font-mono text-lg font-bold w-12 text-center text-amber-400">
          {bpm}
        </span>
        <span className="text-xs text-zinc-400">BPM</span>
        <button
          onClick={() => setBpm((b) => Math.min(240, b + 1))}
          className="p-1 text-zinc-400 hover:text-zinc-100 transition rounded"
          title="Aumentar BPM"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Beats indicator */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: beatsPerBar }).map((_, idx) => (
          <div
            key={idx}
            className={`w-3.5 h-3.5 rounded-full border transition-all duration-100 ${
              isPlaying && currentBeat === idx + 1
                ? idx === 0
                  ? 'bg-amber-400 border-amber-300 scale-125 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : 'bg-emerald-400 border-emerald-300 scale-110'
                : 'bg-zinc-800 border-zinc-700'
            }`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={beatsPerBar}
          onChange={(e) => setBeatsPerBar(Number(e.target.value))}
          aria-label="Compasso do metrônomo"
          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none"
        >
          <option value={4}>4/4</option>
          <option value={3}>3/4</option>
          <option value={6}>6/8</option>
          <option value={2}>2/4</option>
        </select>

        <button
          onClick={handleTapTempo}
          className="px-2.5 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 active:scale-95 transition"
        >
          Tap Tempo
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow ${
            isPlaying
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
              : 'bg-amber-500 text-zinc-950 hover:bg-amber-400 font-bold'
          }`}
        >
          {isPlaying ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              Parar
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              Iniciar
            </>
          )}
        </button>
      </div>
    </div>
  );
};
