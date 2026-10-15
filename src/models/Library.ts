import { DoublyLinkedList } from "../structures/DoublyLinkedList";
import { Playlist } from "./Playlist";
import { createId } from "../utils/id";

export class Library {
  readonly playlists = new DoublyLinkedList<Playlist>();

  get size(): number {
    return this.playlists.size;
  }

  all(): Playlist[] {
    return this.playlists.toArray();
  }

  create(name: string): Playlist {
    const cleanName = this.validateNewName(name);
    const playlist = new Playlist(createId(), cleanName);
    this.playlists.addLast(playlist);
    return playlist;
  }

  add(playlist: Playlist): void {
    this.playlists.addLast(playlist);
  }

  rename(playlistId: string, name: string): Playlist {
    const playlist = this.require(playlistId);
    playlist.name = this.validateNewName(name, playlistId);
    return playlist;
  }

  remove(playlistId: string): Playlist | null {
    const node = this.playlists.findNode((playlist) => playlist.id === playlistId);
    return node ? this.playlists.removeNode(node) : null;
  }

  find(playlistId: string): Playlist | null {
    return this.playlists.findNode((playlist) => playlist.id === playlistId)?.value ?? null;
  }

  neighborOf(playlistId: string): Playlist | null {
    const node = this.playlists.findNode((playlist) => playlist.id === playlistId);
    return node?.next?.value ?? node?.prev?.value ?? null;
  }

  private require(playlistId: string): Playlist {
    const playlist = this.find(playlistId);
    if (!playlist) throw new Error("La playlist no existe");
    return playlist;
  }

  validateNewName(name: string, ignoreId?: string): string {
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (!cleanName) throw new Error("El nombre no puede estar vacío");
    if (cleanName.length > 40) throw new Error("El nombre no puede superar 40 caracteres");
    const duplicated = this.playlists.findNode(
      (playlist) => playlist.id !== ignoreId && playlist.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (duplicated) throw new Error("Ya existe una playlist con ese nombre");
    return cleanName;
  }
}
