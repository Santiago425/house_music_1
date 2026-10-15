import { Song } from "../models/Song";
import { createId } from "../utils/id";

const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "weba", "webm"];
const METADATA_TIMEOUT = 10000;

export class UnsupportedFileError extends Error {
  readonly fileName: string;

  constructor(fileName: string, reason: string) {
    super(reason);
    this.fileName = fileName;
  }
}

export interface ImportResult {
  songs: Song[];
  rejected: UnsupportedFileError[];
}

export class SongFactory {
  private readonly probe = document.createElement("audio");

  isAudioFile(file: File): boolean {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.includes(extension);
  }

  async fromFiles(files: Iterable<File>): Promise<ImportResult> {
    const result: ImportResult = { songs: [], rejected: [] };
    const settled = await Promise.allSettled([...files].map((file) => this.fromFile(file)));
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") result.songs.push(outcome.value);
      else if (outcome.reason instanceof UnsupportedFileError) result.rejected.push(outcome.reason);
    }
    return result;
  }

  async fromFile(file: File): Promise<Song> {
    if (!this.isAudioFile(file)) throw new UnsupportedFileError(file.name, "No es un archivo de audio");
    if (file.size === 0) throw new UnsupportedFileError(file.name, "El archivo está vacío");
    if (file.type && this.probe.canPlayType(file.type) === "") {
      throw new UnsupportedFileError(file.name, "Tu navegador no soporta este formato");
    }
    const duration = await this.readDuration(file);
    const { title, artist } = this.parseName(file.name);
    return new Song(
      { id: createId(), title, artist, duration, fileName: file.name, addedAt: Date.now() },
      file,
    );
  }

  private parseName(fileName: string): { title: string; artist: string } {
    const base = fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[_]+/g, " ")
      .replace(/^\d{1,3}\s*[-.)]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    const parts = base.split(/\s+-\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
    }
    return { title: base || fileName, artist: "Artista desconocido" };
  }

  private readDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const audio = document.createElement("audio");
      const url = URL.createObjectURL(file);
      const cleanup = () => {
        clearTimeout(timer);
        audio.removeAttribute("src");
        audio.load();
        URL.revokeObjectURL(url);
      };
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new UnsupportedFileError(file.name, "No se pudo leer el archivo"));
      }, METADATA_TIMEOUT);
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        cleanup();
        resolve(duration);
      }, { once: true });
      audio.addEventListener("error", () => {
        cleanup();
        reject(new UnsupportedFileError(file.name, "El archivo está dañado o no es compatible"));
      }, { once: true });
      audio.src = url;
    });
  }
}
