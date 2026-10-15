import type { Playlist } from "../models/Playlist";
import type { Song, SongKind } from "../models/Song";
import { EventEmitter } from "../utils/EventEmitter";
import { AudioEngine } from "./playback/AudioEngine";
import type { MediaInfo, PlaybackEngine } from "./playback/PlaybackEngine";
import { YouTubeEngine } from "./playback/YouTubeEngine";

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  playlist: Playlist | null;
  song: Song | null;
  isPlaying: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  volume: number;
  muted: boolean;
}

interface PlayerEvents {
  change: PlayerState;
  time: { current: number; duration: number };
  error: string;
  notice: string;
  updated: Song;
}

const REPEAT_CYCLE: RepeatMode[] = ["off", "all", "one"];

export class PlayerController extends EventEmitter<PlayerEvents> {
  private readonly audioEngine = new AudioEngine();
  private readonly youtubeEngine: YouTubeEngine;
  private readonly engines: Record<SongKind, PlaybackEngine>;
  private engine: PlaybackEngine;
  private playlist: Playlist | null = null;
  private loadedSong: Song | null = null;
  private repeat: RepeatMode = "off";
  private shuffle = false;
  private volume = 0.8;
  private muted = false;
  private failedInARow = 0;
  private direction: "forward" | "backward" = "forward";

  constructor(videoHost: HTMLElement) {
    super();
    this.youtubeEngine = new YouTubeEngine(videoHost);
    this.engines = { file: this.audioEngine, youtube: this.youtubeEngine };
    this.engine = this.audioEngine;
    for (const engine of Object.values(this.engines)) this.bindEngine(engine);
    this.applyVolume();
    this.registerMediaSession();
  }

  get state(): PlayerState {
    return {
      playlist: this.playlist,
      song: this.loadedSong,
      isPlaying: !this.engine.paused && this.loadedSong !== null,
      repeat: this.repeat,
      shuffle: this.shuffle,
      volume: this.volume,
      muted: this.muted,
    };
  }

  get analyser(): AnalyserNode | null {
    return this.engine === this.audioEngine ? this.audioEngine.analyser : null;
  }

  restorePreferences(volume: number, muted: boolean, repeat: RepeatMode, shuffle: boolean): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.muted = muted;
    this.repeat = REPEAT_CYCLE.includes(repeat) ? repeat : "off";
    this.shuffle = shuffle;
    this.applyVolume();
    this.emitChange();
  }

  play(playlist: Playlist, songId: string): void {
    const song = playlist.select(songId);
    if (!song) return;
    this.playlist = playlist;
    this.failedInARow = 0;
    this.load(song, true);
  }

  playFromStart(playlist: Playlist, shuffled = false): void {
    if (playlist.size === 0) {
      this.emit("notice", "Esta playlist no tiene canciones");
      return;
    }
    this.playlist = playlist;
    this.failedInARow = 0;
    const song = shuffled ? playlist.random() : playlist.selectFirst();
    if (song) this.load(song, true);
  }

  togglePlay(fallback: Playlist | null): void {
    if (!this.loadedSong) {
      if (fallback) this.playFromStart(fallback, this.shuffle);
      return;
    }
    if (this.engine.paused) this.engine.play();
    else this.engine.pause();
  }

  pause(): void {
    this.engine.pause();
  }

  next(): void {
    if (!this.playlist || !this.loadedSong) return;
    const wasPlaying = !this.engine.paused;
    const song = this.pickNext(true);
    if (song) this.load(song, wasPlaying);
    else this.emit("notice", "Ya estás en la última canción");
  }

  previous(): void {
    if (!this.playlist || !this.loadedSong) return;
    const wasPlaying = !this.engine.paused;
    const song = this.playlist.previous(this.repeat === "all");
    if (song) this.load(song, wasPlaying, "backward");
    else {
      this.engine.seek(0);
      this.emit("notice", "Ya estás en la primera canción");
    }
  }

  canGoNext(): boolean {
    if (!this.playlist || !this.loadedSong) return false;
    return this.shuffle ? this.playlist.size > 1 : this.playlist.hasNext(this.repeat === "all");
  }

  canGoPrevious(): boolean {
    return !!this.playlist && !!this.loadedSong;
  }

  seek(seconds: number): void {
    if (!this.loadedSong) return;
    const duration = this.engine.duration || this.loadedSong.duration;
    this.engine.seek(Math.min(Math.max(0, seconds), duration));
    this.emitTime();
  }

  seekBy(delta: number): void {
    this.seek(this.engine.currentTime + delta);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.volume > 0) this.muted = false;
    this.applyVolume();
    this.emitChange();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.applyVolume();
    this.emitChange();
  }

  cycleRepeat(): RepeatMode {
    this.repeat = REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(this.repeat) + 1) % REPEAT_CYCLE.length];
    this.emitChange();
    return this.repeat;
  }

  toggleShuffle(): boolean {
    this.shuffle = !this.shuffle;
    this.emitChange();
    return this.shuffle;
  }

  isActive(playlist: Playlist): boolean {
    return this.playlist === playlist;
  }

  handleSongRemoved(playlist: Playlist, removal: { song: Song; wasCurrent: boolean; fallback: Song | null }): void {
    if (playlist !== this.playlist || removal.song !== this.loadedSong) return;
    const wasPlaying = !this.engine.paused;
    if (removal.fallback) {
      playlist.select(removal.fallback.id);
      this.load(removal.fallback, wasPlaying);
    } else {
      this.stop();
    }
  }

  handlePlaylistRemoved(playlist: Playlist): void {
    if (playlist === this.playlist) this.stop();
  }

  stop(): void {
    for (const engine of Object.values(this.engines)) engine.unload();
    this.engine = this.audioEngine;
    this.playlist?.clearSelection();
    this.playlist = null;
    this.loadedSong = null;
    this.updateMediaSession();
    this.emitChange();
    this.emit("time", { current: 0, duration: 0 });
  }

  private load(song: Song, autoplay: boolean, direction: "forward" | "backward" = "forward"): void {
    this.direction = direction;
    const target = this.engines[song.kind];
    for (const engine of Object.values(this.engines)) {
      if (engine !== target) engine.unload();
    }
    this.engine = target;
    this.loadedSong = song;
    this.applyVolume();
    this.engine.load(song, autoplay);
    this.updateMediaSession();
    this.emitChange();
    this.emit("time", { current: 0, duration: song.duration });
  }

  private bindEngine(engine: PlaybackEngine): void {
    const whenActive = <T>(handler: (payload: T) => void) => (payload: T) => {
      if (engine === this.engine && this.loadedSong) handler(payload);
    };
    engine.on("play", whenActive(() => {
      this.failedInARow = 0;
      this.emitChange();
    }));
    engine.on("pause", whenActive(() => this.emitChange()));
    engine.on("time", whenActive(() => this.emitTime()));
    engine.on("ended", whenActive(() => this.handleEnded()));
    engine.on("error", whenActive((message: string) => this.handleError(message)));
    engine.on("info", whenActive((info: MediaInfo) => this.handleInfo(info)));
  }

  private handleInfo(info: MediaInfo): void {
    const song = this.loadedSong!;
    let changed = false;
    if (info.duration && Number.isFinite(info.duration) && Math.abs(song.duration - info.duration) > 1) {
      song.duration = info.duration;
      changed = true;
    }
    if (song.isYouTube && song.title === "Video de YouTube" && info.title) {
      song.title = info.title;
      song.artist = info.artist || song.artist;
      changed = true;
    }
    if (changed) {
      this.updateMediaSession();
      this.emit("updated", song);
      this.emitChange();
    }
    this.emitTime();
  }

  private pickNext(manual: boolean): Song | null {
    if (!this.playlist) return null;
    if (this.shuffle && this.playlist.size > 1) return this.playlist.random();
    return this.playlist.next(this.repeat === "all" || (manual && this.repeat === "one"));
  }

  private handleEnded(): void {
    if (!this.playlist || !this.loadedSong) return;
    if (this.repeat === "one") {
      this.engine.seek(0);
      this.engine.play();
      return;
    }
    const song = this.pickNext(false);
    if (song) {
      this.load(song, true);
      return;
    }
    const first = this.playlist.selectFirst();
    if (first) this.load(first, false);
    this.emit("notice", "Fin de la playlist");
  }

  private handleError(message: string): void {
    if (!this.loadedSong) return;
    this.failedInARow++;
    this.emit("error", `"${this.loadedSong.title}": ${message}`);
    const size = this.playlist?.size ?? 0;
    if (this.failedInARow >= size) {
      this.stop();
      return;
    }
    const backward = this.direction === "backward" ? this.playlist?.previous(this.repeat === "all") ?? null : null;
    const song = backward ?? this.pickNext(true);
    if (song) this.load(song, true, backward ? "backward" : "forward");
    else this.stop();
  }

  private applyVolume(): void {
    for (const engine of Object.values(this.engines)) engine.setVolume(this.volume, this.muted);
  }

  private emitChange(): void {
    this.emit("change", this.state);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = this.loadedSong ? (this.engine.paused ? "paused" : "playing") : "none";
    }
  }

  private emitTime(): void {
    const duration = this.engine.duration || this.loadedSong?.duration || 0;
    this.emit("time", { current: this.engine.currentTime, duration });
  }

  private registerMediaSession(): void {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => this.engine.play()],
      ["pause", () => this.pause()],
      ["previoustrack", () => this.previous()],
      ["nexttrack", () => this.next()],
      ["seekto", (details) => details.seekTime !== undefined && this.seek(details.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        continue;
      }
    }
  }

  private updateMediaSession(): void {
    if (!("mediaSession" in navigator)) return;
    const song = this.loadedSong;
    navigator.mediaSession.metadata = song
      ? new MediaMetadata({
          title: song.title,
          artist: song.artist,
          album: this.playlist?.name ?? "House Music",
          artwork: [song.thumbnail ? { src: song.thumbnail } : { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
        })
      : null;
  }
}
