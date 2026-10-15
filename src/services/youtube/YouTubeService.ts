import { Song } from "../../models/Song";
import { createId } from "../../utils/id";

export interface YouTubeResult {
  videoId: string;
  title: string;
  artist: string;
  channel: string;
  duration: number;
  thumbnail: string;
}

interface ApiThumbnails {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
}

interface ApiVideo {
  id: string;
  snippet: { title: string; channelTitle: string; thumbnails: ApiThumbnails };
  contentDetails: { duration: string };
  status?: { embeddable?: boolean };
}

interface ApiSearchItem {
  id: { videoId?: string };
}

const API_URL = "https://www.googleapis.com/youtube/v3";
const KEY_STORAGE = "house-music-youtube-key";
const VIDEO_ID = /^[\w-]{11}$/;
const NOISE = /\s*[([](official|oficial|video|lyric|lyrics|letra|audio|visualizer|hd|4k|mv|music video|videoclip|video oficial|official music video|official video|official audio)[^)\]]*[)\]]/gi;

export class YouTubeError extends Error {}

export class YouTubeService {
  private readonly envKey = (import.meta.env.VITE_YOUTUBE_API_KEY ?? "").trim();

  get hasKey(): boolean {
    return this.apiKey.length > 0;
  }

  get usesEnvKey(): boolean {
    return this.envKey.length > 0;
  }

  get apiKey(): string {
    if (this.envKey) return this.envKey;
    try {
      return localStorage.getItem(KEY_STORAGE)?.trim() ?? "";
    } catch {
      return "";
    }
  }

  saveKey(key: string): void {
    try {
      if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      return;
    }
  }

  parseVideoId(input: string): string | null {
    const text = input.trim();
    if (VIDEO_ID.test(text)) return text;
    let url: URL;
    try {
      url = new URL(text.startsWith("http") ? text : `https://${text}`);
    } catch {
      return null;
    }
    const host = url.hostname.replace(/^(www|m|music)\./, "");
    let candidate: string | null = null;
    if (host === "youtu.be") candidate = url.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      candidate = url.searchParams.get("v");
      const match = url.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (!candidate && match) candidate = match[2];
    }
    return candidate && VIDEO_ID.test(candidate) ? candidate : null;
  }

  async search(query: string): Promise<YouTubeResult[]> {
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      maxResults: "15",
      q: query,
      key: this.apiKey,
    });
    const data = await this.request<{ items: ApiSearchItem[] }>(`${API_URL}/search?${params}`);
    const ids = data.items.map((item) => item.id.videoId).filter((id): id is string => !!id);
    return this.details(ids);
  }

  async lookup(videoId: string): Promise<YouTubeResult> {
    if (this.hasKey) {
      const [result] = await this.details([videoId]);
      if (!result) throw new YouTubeError("Ese video no existe o no se puede reproducir fuera de YouTube");
      return result;
    }
    return this.lookupWithoutKey(videoId);
  }

  toSong(result: YouTubeResult): Song {
    return new Song({
      id: createId(),
      title: result.title,
      artist: result.artist,
      duration: result.duration,
      fileName: result.channel,
      addedAt: Date.now(),
      kind: "youtube",
      videoId: result.videoId,
      thumbnail: result.thumbnail,
    });
  }

  private async details(ids: string[]): Promise<YouTubeResult[]> {
    if (ids.length === 0) return [];
    const params = new URLSearchParams({
      part: "snippet,contentDetails,status",
      id: ids.join(","),
      key: this.apiKey,
    });
    const data = await this.request<{ items: ApiVideo[] }>(`${API_URL}/videos?${params}`);
    return data.items
      .filter((video) => video.status?.embeddable !== false)
      .map((video) => this.toResult(video.id, video.snippet.title, video.snippet.channelTitle, video.snippet.thumbnails, this.parseDuration(video.contentDetails.duration)));
  }

  private async lookupWithoutKey(videoId: string): Promise<YouTubeResult> {
    const fallback = this.toResult(videoId, "Video de YouTube", "YouTube", {}, 0);
    try {
      const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
      const response = await fetch(url);
      if (!response.ok) return fallback;
      const data = (await response.json()) as { title?: string; author_name?: string };
      return this.toResult(videoId, data.title ?? fallback.title, data.author_name ?? "YouTube", {}, 0);
    } catch {
      return fallback;
    }
  }

  private toResult(videoId: string, rawTitle: string, channel: string, thumbnails: ApiThumbnails, duration: number): YouTubeResult {
    const title = this.decode(rawTitle);
    const cleanChannel = this.decode(channel).replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
    const cleanTitle = title.replace(NOISE, "").replace(/\s+/g, " ").trim() || title;
    const parts = cleanTitle.split(/\s+[-–—|]\s+/);
    const hasArtist = parts.length >= 2 && parts[0].length <= 60;
    return {
      videoId,
      title: hasArtist ? parts.slice(1).join(" - ") : cleanTitle,
      artist: hasArtist ? parts[0] : cleanChannel || "YouTube",
      channel: cleanChannel || "YouTube",
      duration,
      thumbnail: thumbnails.medium?.url ?? thumbnails.high?.url ?? thumbnails.default?.url ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };
  }

  private parseDuration(iso: string): number {
    const match = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const [, days, hours, minutes, seconds] = match.map((part) => Number(part ?? 0));
    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }

  private decode(text: string): string {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  private async request<T>(url: string): Promise<T> {
    if (!this.hasKey) throw new YouTubeError("Falta la API key de YouTube");
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new YouTubeError("No hay conexión con YouTube. Revisa tu internet");
    }
    if (response.ok) return (await response.json()) as T;
    const body = (await response.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? "";
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new YouTubeError("Se acabó la cuota diaria de búsquedas de YouTube. Intenta mañana");
    if (reason === "keyInvalid" || response.status === 400) throw new YouTubeError("La API key de YouTube no es válida");
    if (response.status === 403) throw new YouTubeError("La API key no tiene permiso. Activa YouTube Data API v3 en Google Cloud");
    throw new YouTubeError("YouTube no respondió. Intenta de nuevo");
  }
}
