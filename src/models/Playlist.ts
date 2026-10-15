import { DoublyLinkedList } from "../structures/DoublyLinkedList";
import type { ListNode } from "../structures/ListNode";
import type { Song } from "./Song";

export class Playlist {
  readonly id: string;
  name: string;
  readonly createdAt: number;
  readonly songs = new DoublyLinkedList<Song>();
  private currentNode: ListNode<Song> | null = null;

  constructor(id: string, name: string, createdAt = Date.now()) {
    this.id = id;
    this.name = name;
    this.createdAt = createdAt;
  }

  get current(): Song | null {
    return this.currentNode?.value ?? null;
  }

  get size(): number {
    return this.songs.size;
  }

  get totalDuration(): number {
    let total = 0;
    for (const song of this.songs) total += song.duration;
    return total;
  }

  addFirst(song: Song): void {
    this.songs.addFirst(song);
  }

  addLast(song: Song): void {
    this.songs.addLast(song);
  }

  insertAt(index: number, song: Song): void {
    this.songs.insertAt(index, song);
  }

  remove(songId: string): { song: Song; wasCurrent: boolean; fallback: Song | null } | null {
    const node = this.findNode(songId);
    if (!node) return null;
    const wasCurrent = node === this.currentNode;
    const fallbackNode = node.next ?? node.prev;
    this.songs.removeNode(node);
    if (wasCurrent) this.currentNode = fallbackNode;
    return { song: node.value, wasCurrent, fallback: wasCurrent ? fallbackNode?.value ?? null : null };
  }

  move(songId: string, targetIndex: number): boolean {
    const node = this.findNode(songId);
    if (!node) return false;
    this.songs.moveNode(node, targetIndex);
    return true;
  }

  indexOf(songId: string): number {
    const node = this.findNode(songId);
    return node ? this.songs.indexOfNode(node) : -1;
  }

  find(songId: string): Song | null {
    return this.findNode(songId)?.value ?? null;
  }

  select(songId: string): Song | null {
    const node = this.findNode(songId);
    if (node) this.currentNode = node;
    return node?.value ?? null;
  }

  selectFirst(): Song | null {
    this.currentNode = this.songs.first;
    return this.current;
  }

  clearSelection(): void {
    this.currentNode = null;
  }

  hasNext(loop: boolean): boolean {
    if (!this.currentNode) return !this.songs.isEmpty();
    return this.currentNode.next !== null || (loop && this.songs.size > 0);
  }

  hasPrevious(loop: boolean): boolean {
    if (!this.currentNode) return false;
    return this.currentNode.prev !== null || (loop && this.songs.size > 0);
  }

  peekNext(loop: boolean): Song | null {
    if (!this.currentNode) return this.songs.first?.value ?? null;
    const target = this.currentNode.next ?? (loop ? this.songs.first : null);
    return target === this.currentNode ? null : target?.value ?? null;
  }

  peekPrevious(loop: boolean): Song | null {
    if (!this.currentNode) return null;
    const target = this.currentNode.prev ?? (loop ? this.songs.last : null);
    return target === this.currentNode ? null : target?.value ?? null;
  }

  next(loop: boolean): Song | null {
    if (!this.currentNode) return this.selectFirst();
    const target = this.currentNode.next ?? (loop ? this.songs.first : null);
    if (target) this.currentNode = target;
    return target?.value ?? null;
  }

  previous(loop: boolean): Song | null {
    if (!this.currentNode) return null;
    const target = this.currentNode.prev ?? (loop ? this.songs.last : null);
    if (target) this.currentNode = target;
    return target?.value ?? null;
  }

  random(): Song | null {
    if (this.songs.isEmpty()) return null;
    if (this.songs.size === 1) return this.selectFirst();
    let node: ListNode<Song> | null = this.currentNode;
    while (node === this.currentNode) {
      node = this.songs.getNodeAt(Math.floor(Math.random() * this.songs.size));
    }
    this.currentNode = node;
    return this.current;
  }

  private findNode(songId: string): ListNode<Song> | null {
    return this.songs.findNode((song) => song.id === songId);
  }
}
