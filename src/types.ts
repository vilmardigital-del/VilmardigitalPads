export interface PadItem {
  id: string;
  name: string;
  key?: string; // musical key like C, D, E, G, A, etc.
  color: string; // Hex or tailwind identifier
  textColor?: string;
  bgGradient: string;
  activeBorderColor: string;
  glowColor: string;
  audioBlob?: Blob;
  audioData?: ArrayBuffer;
  mimeType?: string;
  audioUrl?: string; // Object URL or synthesized identifier
  isPreset?: boolean;
  synthNote?: number; // Base frequency/MIDI note for procedural pad
  volume: number; // 0 to 1
  duration?: number; // duration in seconds
  driveFileId?: string; // Google Drive file ID
  driveFolderId?: string; // Google Drive folder ID
  isDriveSynced?: boolean; // Whether audio is stored in Google Drive
  authorEmail?: string;
  authorName?: string;
  createdAt: number;
}

export interface AudioEngineSettings {
  masterVolume: number; // 0 to 1
  filterCutoff: number; // 200Hz to 12000Hz (warm to bright)
  fadeTime: number; // 0.5 to 5.0 seconds
  soloMode: boolean; // true = crossfade to single pad, false = layer multiple pads
  reverbAmount: number; // 0 to 1
}

export interface ColorScheme {
  id: string;
  name: string;
  hex: string;
  bgGradient: string;
  textColor: string;
  activeBorderColor: string;
  glowColor: string;
}
