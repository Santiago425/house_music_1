import type { Song } from "../../models/Song";
import { EventEmitter } from "../../utils/EventEmitter";
import type { EngineEvents, PlaybackEngine } from "./PlaybackEngine";

export class AudioEngine extends EventEmitter<EngineEvents> implements PlaybackEngine {
  private readonly audio = new Audio();
  private objectUrl: string | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;

  constructor() {
    super();
    this.audio.preload = "auto";
    this.audio.addEventListener("play", () => this.emit("play", undefined));
    this.audio.addEventListener("pause", () => this.emit("pause", undefined));
    this.audio.addEventListener("ended", () => this.emit("ended", undefined));
    this.audio.addEventListener("timeupdate", () => this.emit("time", undefined));
    this.audio.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(this.audio.duration)) this.emit("info", { duration: this.audio.duration });
      this.emit("time", undefined);
    });
    this.audio.addEventListener("error", () => {
      if (this.audio.getAttribute("src")) this.emit("error", "El archivo está dañado o no es compatible");
    });
  }

  get analyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  get paused(): boolean {
    return this.audio.paused;
  }

  get currentTime(): number {
    return this.audio.currentTime;
  }

  get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  load(song: Song, autoplay: boolean): void {
    if (!song.file) {
      this.emit("error", "La canción no tiene archivo de audio");
      return;
    }
    this.audio.pause();
    this.releaseUrl();
    this.objectUrl = URL.createObjectURL(song.file);
    this.audio.src = this.objectUrl;
    this.audio.currentTime = 0;
    if (autoplay) this.play();
  }

  play(): void {
    this.ensureAudioGraph();
    this.audio.play()?.catch((error: DOMException) => {
      if (error.name === "NotAllowedError") this.emit("pause", undefined);
    });
  }

  pause(): void {
    this.audio.pause();
  }

  seek(seconds: number): void {
    if (!Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.min(Math.max(0, seconds), this.audio.duration);
  }

  unload(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.releaseUrl();
  }

  setVolume(volume: number, muted: boolean): void {
    this.audio.volume = volume;
    this.audio.muted = muted;
  }

  private ensureAudioGraph(): void {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        const source = this.audioContext.createMediaElementSource(this.audio);
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 128;
        this.analyserNode.smoothingTimeConstant = 0.8;
        source.connect(this.analyserNode);
        this.analyserNode.connect(this.audioContext.destination);
      }
      if (this.audioContext.state === "suspended") void this.audioContext.resume();
    } catch {
      this.analyserNode = null;
    }
  }

  private releaseUrl(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}
