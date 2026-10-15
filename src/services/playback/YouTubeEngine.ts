import type { Song } from "../../models/Song";
import { EventEmitter } from "../../utils/EventEmitter";
import type { EngineEvents, PlaybackEngine } from "./PlaybackEngine";

interface YTPlayer {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData?(): { title?: string; author?: string };
}

interface YTNamespace {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, CUED: 5 };
const SCRIPT_URL = "https://www.youtube.com/iframe_api";

const ERROR_MESSAGES: Record<number, string> = {
  2: "El video de YouTube no es válido",
  5: "Este video no se puede reproducir aquí",
  100: "El video fue eliminado o es privado",
  101: "El dueño no permite reproducir este video fuera de YouTube",
  150: "El dueño no permite reproducir este video fuera de YouTube",
};

let apiPromise: Promise<YTNamespace> | null = null;

const loadApi = (): Promise<YTNamespace> => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("No se pudo conectar con YouTube"));
    };
    document.head.append(script);
  });
  return apiPromise;
};

export class YouTubeEngine extends EventEmitter<EngineEvents> implements PlaybackEngine {
  private readonly host: HTMLElement;
  private player: YTPlayer | null = null;
  private playerPromise: Promise<YTPlayer> | null = null;
  private videoId: string | null = null;
  private wantsPlay = false;
  private timer = 0;
  private volume = 0.8;
  private muted = false;
  private loadToken = 0;

  constructor(host: HTMLElement) {
    super();
    this.host = host;
  }

  get paused(): boolean {
    return !this.wantsPlay;
  }

  get currentTime(): number {
    return this.player?.getCurrentTime() ?? 0;
  }

  get duration(): number {
    return this.player?.getDuration() ?? 0;
  }

  load(song: Song, autoplay: boolean): void {
    if (!song.videoId) {
      this.emit("error", "La canción no tiene un video de YouTube");
      return;
    }
    const token = ++this.loadToken;
    this.videoId = song.videoId;
    this.wantsPlay = autoplay;
    if (autoplay) this.emit("play", undefined);
    this.ensurePlayer()
      .then((player) => {
        if (token !== this.loadToken || this.videoId === null) return;
        this.applyVolume();
        if (this.wantsPlay) player.loadVideoById(song.videoId!);
        else player.cueVideoById(song.videoId!);
      })
      .catch((error: Error) => {
        if (token !== this.loadToken) return;
        this.wantsPlay = false;
        this.emit("error", error.message);
      });
  }

  play(): void {
    this.wantsPlay = true;
    this.emit("play", undefined);
    this.player?.playVideo();
  }

  pause(): void {
    this.wantsPlay = false;
    this.player?.pauseVideo();
    this.emit("pause", undefined);
  }

  seek(seconds: number): void {
    this.player?.seekTo(Math.max(0, seconds), true);
    this.emit("time", undefined);
  }

  unload(): void {
    this.loadToken++;
    this.wantsPlay = false;
    this.videoId = null;
    this.stopTimer();
    try {
      this.player?.stopVideo();
    } catch {
      return;
    }
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.player) return;
    this.player.setVolume(Math.round(this.volume * 100));
    if (this.muted) this.player.mute();
    else this.player.unMute();
  }

  private ensurePlayer(): Promise<YTPlayer> {
    if (this.player) return Promise.resolve(this.player);
    if (this.playerPromise) return this.playerPromise;
    this.playerPromise = loadApi().then(
      (YT) =>
        new Promise<YTPlayer>((resolve) => {
          const mount = document.createElement("div");
          this.host.replaceChildren(mount);
          const player = new YT.Player(mount, {
            width: "100%",
            height: "100%",
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
            events: {
              onReady: () => {
                this.player = player;
                resolve(player);
              },
              onStateChange: (event: { data: number }) => this.handleState(event.data),
              onError: (event: { data: number }) => {
                this.wantsPlay = false;
                this.emit("error", ERROR_MESSAGES[event.data] ?? "YouTube no pudo reproducir el video");
              },
            },
          });
        }),
    );
    this.playerPromise.catch(() => (this.playerPromise = null));
    return this.playerPromise;
  }

  private handleState(state: number): void {
    if (this.videoId === null) return;
    if (state === STATE.PLAYING) {
      this.wantsPlay = true;
      this.startTimer();
      const data = this.player?.getVideoData?.();
      this.emit("info", { title: data?.title, artist: data?.author, duration: this.duration });
      this.emit("play", undefined);
    } else if (state === STATE.PAUSED) {
      this.wantsPlay = false;
      this.stopTimer();
      this.emit("pause", undefined);
    } else if (state === STATE.ENDED) {
      this.wantsPlay = false;
      this.stopTimer();
      this.emit("ended", undefined);
    } else if (state === STATE.CUED) {
      this.emit("time", undefined);
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = window.setInterval(() => this.emit("time", undefined), 250);
  }

  private stopTimer(): void {
    window.clearInterval(this.timer);
  }
}
