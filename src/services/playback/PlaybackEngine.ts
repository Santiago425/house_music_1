import type { Song } from "../../models/Song";
import type { EventEmitter } from "../../utils/EventEmitter";

export interface MediaInfo {
  title?: string;
  artist?: string;
  duration?: number;
}

export interface EngineEvents {
  play: void;
  pause: void;
  ended: void;
  time: void;
  info: MediaInfo;
  error: string;
}

export interface PlaybackEngine extends EventEmitter<EngineEvents> {
  readonly paused: boolean;
  readonly currentTime: number;
  readonly duration: number;
  load(song: Song, autoplay: boolean): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  unload(): void;
  setVolume(volume: number, muted: boolean): void;
}
