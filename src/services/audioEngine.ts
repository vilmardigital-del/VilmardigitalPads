import { AudioEngineSettings, PadItem } from '../types';

interface ActivePadTrack {
  padId: string;
  gainNode?: GainNode;
  filterNode?: BiquadFilterNode;
  sourceNode?: AudioBufferSourceNode;
  oscillators?: OscillatorNode[];
  lfo?: OscillatorNode;
  htmlAudio?: HTMLAudioElement;
  objectUrl?: string;
  targetVol?: number;
  isStopping?: boolean;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private audioBufferCache: Map<string, AudioBuffer> = new Map();
  private activeTracks: Map<string, ActivePadTrack> = new Map();

  private settings: AudioEngineSettings = {
    masterVolume: 0.9,
    filterCutoff: 9000, // Natural bright warmth for guitar background
    fadeTime: 1.5,
    soloMode: true,
    reverbAmount: 0.3,
  };

  private listeners: Set<() => void> = new Set();

  public getSettings(): AudioEngineSettings {
    return { ...this.settings };
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  // Synchronous unblock: must be called directly inside user click handler to satisfy browser autoplay
  public resumeContextSync() {
    try {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch {}
  }

  public async initContext(): Promise<AudioContext | null> {
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();

        // Master Gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.settings.masterVolume, this.ctx.currentTime);

        // Master Tone Filter
        this.masterFilter = this.ctx.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.setValueAtTime(this.settings.filterCutoff, this.ctx.currentTime);
        this.masterFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

        // Analyser for real-time visualizer
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;

        // DIRECT UNBLOCKED AUDIO ROUTING:
        // masterFilter -> masterGain -> destination (SPEAKER/HEADPHONES)
        // masterGain -> analyser (parallel tap, will never cut audio to destination)
        this.masterFilter.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        try {
          this.masterGain.connect(this.analyser);
        } catch {}

        // Unlock iOS Web Audio with a silent micro-buffer
        try {
          const buffer = this.ctx.createBuffer(1, 1, 22050);
          const source = this.ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(this.ctx.destination);
          source.start(0);
        } catch {}
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return this.ctx;
    } catch (err) {
      console.warn('Erro ao inicializar AudioContext:', err);
      return this.ctx;
    }
  }

  public getContextState(): AudioContextState | 'uninitialized' {
    return this.ctx ? this.ctx.state : 'uninitialized';
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public isPadPlaying(padId: string): boolean {
    const track = this.activeTracks.get(padId);
    return !!track && !track.isStopping;
  }

  public getActivePadIds(): string[] {
    const ids: string[] = [];
    this.activeTracks.forEach((track, id) => {
      if (!track.isStopping) ids.push(id);
    });
    return ids;
  }

  public setMasterVolume(vol: number) {
    const clamped = Math.max(0, Math.min(1, vol));
    this.settings.masterVolume = clamped;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(clamped, now + 0.04);
    }
    // Sync active HTML5 audio tracks with master volume
    this.activeTracks.forEach((track) => {
      if (track.htmlAudio) {
        const padVol = track.targetVol ?? 1.0;
        track.htmlAudio.volume = Math.min(1, Math.max(0, padVol * clamped));
      }
    });
    this.notify();
  }

  public setFilterCutoff(cutoff: number) {
    this.settings.filterCutoff = Math.max(300, Math.min(16000, cutoff));
    if (this.masterFilter && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterFilter.frequency.cancelScheduledValues(now);
      this.masterFilter.frequency.setValueAtTime(this.masterFilter.frequency.value, now);
      this.masterFilter.frequency.linearRampToValueAtTime(this.settings.filterCutoff, now + 0.05);
    }
    this.notify();
  }

  public setFadeTime(seconds: number) {
    this.settings.fadeTime = Math.max(0.2, Math.min(6.0, seconds));
    this.notify();
  }

  public setSoloMode(solo: boolean) {
    this.settings.soloMode = solo;
    this.notify();
  }

  public async decodeAudioFile(fileOrBlobOrBuffer: Blob | ArrayBuffer): Promise<AudioBuffer> {
    await this.initContext();
    if (!this.ctx) {
      throw new Error('AudioContext não disponível');
    }

    let arrayBuffer: ArrayBuffer;
    if (fileOrBlobOrBuffer instanceof ArrayBuffer) {
      arrayBuffer = fileOrBlobOrBuffer;
    } else if (typeof (fileOrBlobOrBuffer as Blob).arrayBuffer === 'function') {
      arrayBuffer = await (fileOrBlobOrBuffer as Blob).arrayBuffer();
    } else {
      arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(fileOrBlobOrBuffer as Blob);
      });
    }

    const copy = arrayBuffer.slice(0);

    return await new Promise<AudioBuffer>((resolve, reject) => {
      let settled = false;
      const onSuccess = (buf: AudioBuffer) => {
        if (!settled) {
          settled = true;
          resolve(buf);
        }
      };
      const onError = (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      try {
        const res = this.ctx!.decodeAudioData(copy, onSuccess, onError);
        if (res && typeof (res as Promise<AudioBuffer>).then === 'function') {
          (res as Promise<AudioBuffer>).then(onSuccess).catch(onError);
        }
      } catch (err) {
        onError(err);
      }
    });
  }

  public async cacheAudioBuffer(id: string, fileOrBlobOrBuffer: Blob | ArrayBuffer): Promise<AudioBuffer> {
    if (this.audioBufferCache.has(id)) {
      return this.audioBufferCache.get(id)!;
    }
    const buffer = await this.decodeAudioFile(fileOrBlobOrBuffer);
    this.audioBufferCache.set(id, buffer);
    return buffer;
  }

  public async playPad(pad: PadItem) {
    this.resumeContextSync();
    await this.initContext();
    if (!this.ctx || !this.masterGain) return;

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {}
    }

    // Toggle off if already playing
    if (this.isPadPlaying(pad.id)) {
      this.stopPad(pad.id);
      return;
    }

    // In solo mode, crossfade out other pads smoothly
    if (this.settings.soloMode) {
      this.activeTracks.forEach((track, otherId) => {
        if (otherId !== pad.id && !track.isStopping) {
          this.stopPad(otherId);
        }
      });
    }

    const fadeDuration = Math.max(0.1, this.settings.fadeTime);
    // Support volume values up to 2.0 (200% with boost)
    const baseVol = typeof pad.volume === 'number' ? Math.max(0, Math.min(2.0, pad.volume)) : 1.0;

    // Direct, uninhibited pad track Gain connected to masterGain
    const trackGain = this.ctx.createGain();
    trackGain.connect(this.masterGain);

    // Verify if genuine audio binary payload exists
    const hasAudio =
      !!pad.audioUrl ||
      (pad.audioBlob instanceof Blob && pad.audioBlob.size > 0) ||
      (pad.audioData instanceof ArrayBuffer && pad.audioData.byteLength > 0);

    if (hasAudio) {
      await this.playAudioTrack(pad, trackGain, fadeDuration, baseVol);
    } else {
      this.playProceduralPad(pad, trackGain, fadeDuration, baseVol);
    }
  }

  private async playAudioTrack(
    pad: PadItem,
    trackGain: GainNode,
    fadeDuration: number,
    targetVol: number
  ) {
    if (!this.ctx) return;

    // 1. Resolve live Object URL immediately
    let url = pad.audioUrl;
    let ownedBlobUrl: string | null = null;

    if (!url) {
      if (pad.audioBlob instanceof Blob && pad.audioBlob.size > 0) {
        url = URL.createObjectURL(pad.audioBlob);
        ownedBlobUrl = url;
      } else if (pad.audioData && pad.audioData.byteLength > 0) {
        const blob = new Blob([pad.audioData], { type: pad.mimeType || 'audio/mpeg' });
        url = URL.createObjectURL(blob);
        ownedBlobUrl = url;
      }
    }

    if (!url) {
      console.warn('Nenhum dado binário de áudio válido para o pad, usando sintetizador:', pad.name);
      this.playProceduralPad(pad, trackGain, fadeDuration, targetVol);
      return;
    }

    // 2. Instantiate native streaming HTML5 audio element
    const audioEl = new Audio();
    audioEl.src = url;
    audioEl.loop = true;
    audioEl.preload = 'auto';

    const track: ActivePadTrack = {
      padId: pad.id,
      gainNode: trackGain,
      htmlAudio: audioEl,
      objectUrl: ownedBlobUrl || undefined,
      targetVol,
      isStopping: false,
    };
    this.activeTracks.set(pad.id, track);
    this.notify();

    // 3. Connect to Web Audio graph for boost up to 200%, tone filter, master volume, and visualizer
    let connectedToWebAudio = false;
    try {
      const source = this.ctx.createMediaElementSource(audioEl);
      source.connect(trackGain);
      track.sourceNode = source as unknown as AudioBufferSourceNode;
      connectedToWebAudio = true;
    } catch (err) {
      console.warn('createMediaElementSource não suportado ou já conectado, usando saída direta com controle de ganho:', err);
    }

    const masterVol = this.settings.masterVolume ?? 0.9;

    if (connectedToWebAudio) {
      audioEl.volume = 1.0;
      const t = this.ctx.currentTime;
      trackGain.gain.cancelScheduledValues(t);
      trackGain.gain.setValueAtTime(0.01, t);
      // Fast 50ms swell so audio starts right away
      trackGain.gain.linearRampToValueAtTime(targetVol, t + 0.05);
    } else {
      // Direct hardware volume
      const effectiveVol = Math.min(1.0, Math.max(0, targetVol * masterVol));
      audioEl.volume = 0.01;
      const startTime = performance.now();
      const fadeMs = Math.min(100, fadeDuration * 1000);
      const rampIn = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / fadeMs);
        if (track.htmlAudio && !track.isStopping) {
          track.htmlAudio.volume = Math.max(0.01, progress * effectiveVol);
          if (progress < 1) requestAnimationFrame(rampIn);
        }
      };
      requestAnimationFrame(rampIn);
    }

    // 4. Start playback immediately within user gesture turn
    try {
      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
      this.notify();
    } catch (playErr) {
      console.error('Falha ao reproduzir áudio adicionado:', playErr);
      // Fall back to rich procedural harmonic pad so acoustic guitarist always has sound!
      if (!track.isStopping) {
        this.playProceduralPad(pad, trackGain, fadeDuration, targetVol);
      }
    }
  }

  // Rich multi-harmonic acoustic ambient pad synthesis:
  // Designed specifically for acoustic guitar backing.
  // Perfectly audible on phone speakers, laptop speakers, headphones, and large church PA systems.
  private playProceduralPad(pad: PadItem, trackGain: GainNode, fadeDuration: number, targetVol: number) {
    if (!this.ctx) return;

    const keyToFreq: Record<string, number> = {
      C: 130.81, // C3
      'C#': 138.59,
      Db: 138.59,
      D: 146.83, // D3
      'D#': 155.56,
      Eb: 155.56,
      E: 164.81, // E3
      F: 174.61, // F3
      'F#': 185.0,
      Gb: 185.0,
      G: 196.0, // G3
      'G#': 207.65,
      Ab: 207.65,
      A: 220.0, // A3
      'A#': 233.08,
      Bb: 233.08,
      B: 246.94, // B3
    };

    const rootFreq = pad.key && keyToFreq[pad.key] ? keyToFreq[pad.key] : 130.81;
    const t = this.ctx.currentTime;

    const oscillators: OscillatorNode[] = [];

    // Analog chorus drift (warm slight movement)
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.35, t);
    lfoGain.gain.setValueAtTime(4.5, t);
    lfo.connect(lfoGain);

    // Warm silky filter with generous bandwidth (4800 Hz) so it rings out on phones and laptops
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    const filterFreq = Math.min(14000, Math.max(600, this.settings.filterCutoff || 6000));
    padFilter.frequency.setValueAtTime(filterFreq, t);
    padFilter.Q.setValueAtTime(0.7, t);
    padFilter.connect(trackGain);

    // 1. Warm Bass Foundation (Sine at root)
    const bassOsc = this.ctx.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(rootFreq, t);
    const bassGain = this.ctx.createGain();
    bassGain.gain.setValueAtTime(0.5, t);
    bassOsc.connect(bassGain);
    bassGain.connect(padFilter);
    oscillators.push(bassOsc);

    // 2. Fundamental Body (Triangle at root - warm & round)
    const rootOsc = this.ctx.createOscillator();
    rootOsc.type = 'triangle';
    rootOsc.frequency.setValueAtTime(rootFreq, t);
    const rootGain = this.ctx.createGain();
    rootGain.gain.setValueAtTime(0.45, t);
    rootOsc.connect(rootGain);
    rootGain.connect(padFilter);
    oscillators.push(rootOsc);

    // 3. Acoustic Chord Core (Audible on phone & laptop speakers: 1 octave up, ~260Hz)
    const midOsc = this.ctx.createOscillator();
    midOsc.type = 'sawtooth';
    midOsc.frequency.setValueAtTime(rootFreq * 2.0, t);
    lfoGain.connect(midOsc.detune);
    const midGain = this.ctx.createGain();
    midGain.gain.setValueAtTime(0.35, t);
    midOsc.connect(midGain);
    midGain.connect(padFilter);
    oscillators.push(midOsc);

    // 4. Musical Fifth (Adds ambient worship fullness: ~392Hz for C)
    const fifthOsc = this.ctx.createOscillator();
    fifthOsc.type = 'triangle';
    fifthOsc.frequency.setValueAtTime(rootFreq * 2.9966, t);
    const fifthGain = this.ctx.createGain();
    fifthGain.gain.setValueAtTime(0.35, t);
    fifthOsc.connect(fifthGain);
    fifthGain.connect(padFilter);
    oscillators.push(fifthOsc);

    // 5. Air & Shimmer (High Sine at 4x root: ~523Hz for C)
    const airOsc = this.ctx.createOscillator();
    airOsc.type = 'sine';
    airOsc.frequency.setValueAtTime(rootFreq * 4.0, t);
    const airGain = this.ctx.createGain();
    airGain.gain.setValueAtTime(0.2, t);
    airOsc.connect(airGain);
    airGain.connect(padFilter);
    oscillators.push(airOsc);

    oscillators.forEach((osc) => {
      try { osc.start(); } catch {}
    });
    try { lfo.start(); } catch {}

    // Immediate 50ms swell to target volume so pad sounds alive right away!
    trackGain.gain.cancelScheduledValues(t);
    trackGain.gain.setValueAtTime(0.01, t);
    trackGain.gain.linearRampToValueAtTime(targetVol, t + 0.05);

    const track: ActivePadTrack = {
      padId: pad.id,
      gainNode: trackGain,
      filterNode: padFilter,
      oscillators,
      lfo,
      isStopping: false,
    };

    this.activeTracks.set(pad.id, track);
    this.notify();
  }

  public stopPad(padId: string) {
    const track = this.activeTracks.get(padId);
    if (!track || track.isStopping) return;

    track.isStopping = true;
    const fadeDuration = Math.max(0.1, this.settings.fadeTime);

    if (this.ctx && track.gainNode) {
      const t = this.ctx.currentTime;
      track.gainNode.gain.cancelScheduledValues(t);
      track.gainNode.gain.setValueAtTime(track.gainNode.gain.value, t);
      track.gainNode.gain.linearRampToValueAtTime(0.0001, t + fadeDuration);
    }

    if (track.htmlAudio) {
      const initialVol = track.htmlAudio.volume;
      const steps = 10;
      const stepDuration = (fadeDuration * 1000) / steps;
      let step = 0;
      const fadeInterval = setInterval(() => {
        step++;
        if (track.htmlAudio) {
          track.htmlAudio.volume = Math.max(0, initialVol * (1 - step / steps));
        }
        if (step >= steps) {
          clearInterval(fadeInterval);
          try {
            track.htmlAudio?.pause();
          } catch {}
        }
      }, stepDuration);
    }

    setTimeout(() => {
      try {
        if (track.sourceNode) {
          track.sourceNode.stop();
          track.sourceNode.disconnect();
        }
        if (track.oscillators) {
          track.oscillators.forEach((osc) => {
            try {
              osc.stop();
              osc.disconnect();
            } catch {}
          });
        }
        if (track.lfo) {
          try {
            track.lfo.stop();
            track.lfo.disconnect();
          } catch {}
        }
        if (track.gainNode) {
          track.gainNode.disconnect();
        }
        if (track.filterNode) {
          track.filterNode.disconnect();
        }
        if (track.htmlAudio) {
          track.htmlAudio.pause();
        }
      } catch (err) {
        console.warn('Erro ao limpar track de áudio:', err);
      }
      this.activeTracks.delete(padId);
      this.notify();
    }, fadeDuration * 1000 + 80);

    this.notify();
  }

  public stopAllPads() {
    this.activeTracks.forEach((_, id) => {
      this.stopPad(id);
    });
  }

  public updatePadVolume(padId: string, volume: number) {
    const track = this.activeTracks.get(padId);
    if (track && !track.isStopping) {
      const target = Math.max(0, Math.min(2.0, volume));
      track.targetVol = target;
      if (this.ctx && track.gainNode) {
        const now = this.ctx.currentTime;
        track.gainNode.gain.cancelScheduledValues(now);
        track.gainNode.gain.setValueAtTime(track.gainNode.gain.value, now);
        track.gainNode.gain.linearRampToValueAtTime(target, now + 0.04);
      }
      if (track.htmlAudio) {
        const masterVol = this.settings.masterVolume ?? 0.9;
        track.htmlAudio.volume = Math.min(1, Math.max(0, target * masterVol));
      }
    }
  }

  // Quick audio test sound directly to destination - 100% verified audible chime
  public async playTestSound(): Promise<void> {
    this.resumeContextSync();
    await this.initContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch {}
    }

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Arpeggiated C5 (523Hz) -> E5 (659Hz) chime
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.setValueAtTime(659.25, t + 0.15);

    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    // Directly to destination to bypass any possible filter/analyser hitch
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.42);
  }
}

export const audioEngine = new AudioEngine();
