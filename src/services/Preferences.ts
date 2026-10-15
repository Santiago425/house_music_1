import type { RepeatMode } from "./PlayerController";

export interface StoredPreferences {
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  lastPlaylistId: string | null;
}

const KEY = "house-music-preferences";

const DEFAULTS: StoredPreferences = {
  volume: 0.8,
  muted: false,
  repeat: "off",
  shuffle: false,
  lastPlaylistId: null,
};

export class Preferences {
  load(): StoredPreferences {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<StoredPreferences>) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  save(preferences: StoredPreferences): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(preferences));
    } catch {
      return;
    }
  }
}
