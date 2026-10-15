import { Library } from "../models/Library";
import { Playlist } from "../models/Playlist";
import { Song, type SongData } from "../models/Song";

interface PlaylistRecord {
  id: string;
  name: string;
  createdAt: number;
  position: number;
  songs: SongData[];
}

const DB_NAME = "house-music-player";
const DB_VERSION = 1;
const PLAYLISTS = "playlists";
const FILES = "files";

export class LibraryStorage {
  private db: IDBDatabase | null = null;

  get available(): boolean {
    return this.db !== null;
  }

  async open(): Promise<boolean> {
    if (!("indexedDB" in window)) return false;
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(PLAYLISTS)) db.createObjectStore(PLAYLISTS, { keyPath: "id" });
          if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return true;
    } catch {
      this.db = null;
      return false;
    }
  }

  async load(): Promise<Library> {
    const library = new Library();
    if (!this.db) return library;
    const records = await this.getAll<PlaylistRecord>(PLAYLISTS);
    records.sort((a, b) => a.position - b.position);
    for (const record of records) {
      const playlist = new Playlist(record.id, record.name, record.createdAt);
      for (const data of record.songs) {
        if (data.kind === "youtube" && data.videoId) {
          playlist.addLast(new Song(data));
          continue;
        }
        const blob = await this.get<Blob>(FILES, data.id);
        if (blob) playlist.addLast(new Song(data, blob));
      }
      library.add(playlist);
    }
    return library;
  }

  async saveLibrary(library: Library): Promise<void> {
    if (!this.db) return;
    const records: PlaylistRecord[] = library.all().map((playlist, position) => ({
      id: playlist.id,
      name: playlist.name,
      createdAt: playlist.createdAt,
      position,
      songs: playlist.songs.toArray().map((song) => song.toData()),
    }));
    await this.run(PLAYLISTS, (store) => {
      store.clear();
      records.forEach((record) => store.put(record));
    });
  }

  async saveFiles(songs: Song[]): Promise<void> {
    const withFiles = songs.filter((song) => song.file !== null);
    if (!this.db || withFiles.length === 0) return;
    await this.run(FILES, (store) => withFiles.forEach((song) => store.put(song.file, song.id)));
  }

  async deleteFiles(songIds: string[]): Promise<void> {
    if (!this.db || songIds.length === 0) return;
    await this.run(FILES, (store) => songIds.forEach((id) => store.delete(id)));
  }

  private run(storeName: string, work: (store: IDBObjectStore) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      work(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  private getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = this.db!.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  private get<T>(storeName: string, key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request = this.db!.transaction(storeName).objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }
}
