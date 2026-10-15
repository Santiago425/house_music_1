export type SongKind = "file" | "youtube";

export interface SongData {
  id: string;
  title: string;
  artist: string;
  duration: number;
  fileName: string;
  addedAt: number;
  kind?: SongKind;
  videoId?: string;
  thumbnail?: string;
}

export class Song {
  readonly id: string;
  title: string;
  artist: string;
  duration: number;
  readonly fileName: string;
  readonly addedAt: number;
  readonly kind: SongKind;
  readonly videoId: string | null;
  readonly thumbnail: string | null;
  readonly file: Blob | null;

  constructor(data: SongData, file: Blob | null = null) {
    this.id = data.id;
    this.title = data.title;
    this.artist = data.artist;
    this.duration = data.duration;
    this.fileName = data.fileName;
    this.addedAt = data.addedAt;
    this.kind = data.kind ?? "file";
    this.videoId = data.videoId ?? null;
    this.thumbnail = data.thumbnail ?? null;
    this.file = file;
  }

  get isYouTube(): boolean {
    return this.kind === "youtube";
  }

  toData(): SongData {
    return {
      id: this.id,
      title: this.title,
      artist: this.artist,
      duration: this.duration,
      fileName: this.fileName,
      addedAt: this.addedAt,
      kind: this.kind,
      videoId: this.videoId ?? undefined,
      thumbnail: this.thumbnail ?? undefined,
    };
  }
}
