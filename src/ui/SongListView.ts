import type { Playlist } from "../models/Playlist";
import type { Song } from "../models/Song";
import { coverGradient, escapeHtml, formatTime } from "../utils/format";
import { icons } from "./icons";

interface SongListCallbacks {
  onPlay: (songId: string) => void;
  onRemove: (songId: string) => void;
  onMove: (songId: string, targetIndex: number) => void;
  onDropFiles: (files: File[], targetIndex: number) => void;
  onDropYouTube: (payload: string, targetIndex: number) => void;
}

interface DragSession {
  row: HTMLLIElement;
  songId: string;
  pointerId: number;
  startY: number;
  offsetY: number;
  originIndex: number;
  ghost: HTMLElement | null;
  active: boolean;
}

export const YOUTUBE_DRAG_TYPE = "application/x-house-music-youtube";
const DRAG_THRESHOLD = 6;
const EDGE_SCROLL_ZONE = 64;

export class SongListView {
  private readonly list: HTMLOListElement;
  private readonly scroller: HTMLElement;
  private readonly indicator: HTMLElement;
  private readonly callbacks: SongListCallbacks;
  private drag: DragSession | null = null;
  private scrollFrame = 0;
  private lastPointerY = 0;
  private filter = "";
  private suppressClick = false;

  constructor(list: HTMLOListElement, scroller: HTMLElement, callbacks: SongListCallbacks) {
    this.list = list;
    this.scroller = scroller;
    this.callbacks = callbacks;
    this.indicator = document.createElement("div");
    this.indicator.className = "drop-indicator";
    this.scroller.append(this.indicator);
    this.bindPointerEvents();
    this.bindFileDropEvents();
  }

  get isFiltering(): boolean {
    return this.filter.length > 0;
  }

  get isDragging(): boolean {
    return this.drag?.active ?? false;
  }

  setFilter(query: string): void {
    this.filter = query.trim().toLowerCase();
  }

  render(playlist: Playlist, currentSong: Song | null, isPlaying: boolean): number {
    if (this.isDragging) return this.list.children.length;
    const fragment = document.createDocumentFragment();
    let position = 0;
    let visible = 0;
    for (const song of playlist.songs) {
      position++;
      if (this.filter && !`${song.title} ${song.artist} ${song.fileName}`.toLowerCase().includes(this.filter)) continue;
      visible++;
      fragment.append(this.createRow(song, position, song === currentSong, isPlaying));
    }
    this.list.replaceChildren(fragment);
    this.list.classList.toggle("filtering", this.isFiltering);
    return visible;
  }

  private createRow(song: Song, position: number, isCurrent: boolean, isPlaying: boolean): HTMLLIElement {
    const row = document.createElement("li");
    row.className = `song-row${isCurrent ? " current" : ""}${isCurrent && isPlaying ? " playing" : ""}`;
    row.dataset.id = song.id;
    row.tabIndex = 0;
    row.setAttribute("aria-label", `${song.title} de ${song.artist}`);
    row.innerHTML = `
      <span class="song-grip" title="Arrastra para mover">${icons.grip}</span>
      <span class="song-position">
        <span class="position-number">${position}</span>
        <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="position-play">${icons.play}</span>
      </span>
      ${song.thumbnail
        ? `<span class="song-cover has-image"><img src="${escapeHtml(song.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></span>`
        : `<span class="song-cover" style="background:${coverGradient(song.title + song.artist)}">${escapeHtml(this.initials(song.title))}</span>`}
      <span class="song-text">
        <span class="song-title">${escapeHtml(song.title)}</span>
        <span class="song-artist">${escapeHtml(song.artist)}</span>
      </span>
      ${song.isYouTube
        ? `<span class="song-file"><span class="source-badge">YouTube</span>${escapeHtml(song.fileName)}</span>`
        : `<span class="song-file" title="${escapeHtml(song.fileName)}">${escapeHtml(song.fileName)}</span>`}
      <span class="song-duration">${formatTime(song.duration)}</span>
      <button class="icon-btn song-remove" type="button" title="Eliminar de la playlist" aria-label="Eliminar ${escapeHtml(song.title)}">${icons.trash}</button>`;
    return row;
  }

  private initials(title: string): string {
    const letters = title.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
    return ((letters[0]?.[0] ?? "♪") + (letters[1]?.[0] ?? "")).toUpperCase();
  }

  private bindPointerEvents(): void {
    this.list.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLLIElement>(".song-row");
      if (!row?.dataset.id) return;
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      if (target.closest(".song-remove")) this.callbacks.onRemove(row.dataset.id);
      else if (!target.closest(".song-grip")) this.callbacks.onPlay(row.dataset.id);
    });

    this.list.addEventListener("keydown", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLLIElement>(".song-row");
      if (!row?.dataset.id) return;
      if (event.key === "Enter") {
        event.preventDefault();
        this.callbacks.onPlay(row.dataset.id);
      } else if (event.key === "Delete") {
        event.preventDefault();
        this.callbacks.onRemove(row.dataset.id);
      } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && !this.isFiltering) {
        event.preventDefault();
        const index = [...this.list.children].indexOf(row);
        const target = index + (event.key === "ArrowUp" ? -1 : 1);
        if (target < 0 || target >= this.list.children.length) return;
        const id = row.dataset.id;
        this.callbacks.onMove(id, target);
        this.list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
      }
    });

    this.list.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.isFiltering) return;
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLLIElement>(".song-row");
      if (!row?.dataset.id || target.closest("button")) return;
      if (event.pointerType !== "mouse" && !target.closest(".song-grip")) return;
      const rect = row.getBoundingClientRect();
      this.drag = {
        row,
        songId: row.dataset.id,
        pointerId: event.pointerId,
        startY: event.clientY,
        offsetY: event.clientY - rect.top,
        originIndex: [...this.list.children].indexOf(row),
        ghost: null,
        active: false,
      };
      if (event.pointerType !== "mouse") this.activateDrag(event);
    });

    window.addEventListener("pointermove", (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      if (!this.drag.active) {
        if (Math.abs(event.clientY - this.drag.startY) < DRAG_THRESHOLD) return;
        this.activateDrag(event);
      }
      event.preventDefault();
      this.lastPointerY = event.clientY;
      this.updateDrag(event.clientY);
    }, { passive: false });

    window.addEventListener("pointerup", (event) => this.finishDrag(event, true));
    window.addEventListener("pointercancel", (event) => this.finishDrag(event, false));
  }

  private activateDrag(event: PointerEvent): void {
    if (!this.drag) return;
    const { row } = this.drag;
    const rect = row.getBoundingClientRect();
    const ghost = row.cloneNode(true) as HTMLElement;
    ghost.classList.add("drag-ghost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.append(ghost);
    row.classList.add("drag-placeholder");
    document.body.classList.add("is-reordering");
    this.drag.ghost = ghost;
    this.drag.active = true;
    this.lastPointerY = event.clientY;
    this.autoScroll();
  }

  private updateDrag(clientY: number): void {
    if (!this.drag?.ghost) return;
    const { row, ghost, offsetY } = this.drag;
    ghost.style.top = `${clientY - offsetY}px`;
    const siblings = [...this.list.children].filter((child) => child !== row) as HTMLElement[];
    const before = siblings.find((child) => {
      const rect = child.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    if (before) {
      if (row.nextElementSibling !== before) this.list.insertBefore(row, before);
    } else if (this.list.lastElementChild !== row) {
      this.list.append(row);
    }
  }

  private finishDrag(event: PointerEvent, commit: boolean): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const { row, ghost, songId, originIndex, active } = this.drag;
    this.drag = null;
    cancelAnimationFrame(this.scrollFrame);
    if (!active) return;
    ghost?.remove();
    row.classList.remove("drag-placeholder");
    document.body.classList.remove("is-reordering");
    this.suppressClick = true;
    window.setTimeout(() => (this.suppressClick = false), 0);
    const targetIndex = [...this.list.children].indexOf(row);
    if (commit && targetIndex !== originIndex) this.callbacks.onMove(songId, targetIndex);
    else this.callbacks.onMove(songId, originIndex);
  }

  private autoScroll = (): void => {
    if (!this.drag?.active) return;
    const rect = this.scroller.getBoundingClientRect();
    let delta = 0;
    if (this.lastPointerY < rect.top + EDGE_SCROLL_ZONE) delta = -Math.ceil((rect.top + EDGE_SCROLL_ZONE - this.lastPointerY) / 6);
    else if (this.lastPointerY > rect.bottom - EDGE_SCROLL_ZONE) delta = Math.ceil((this.lastPointerY - rect.bottom + EDGE_SCROLL_ZONE) / 6);
    if (delta !== 0) {
      this.scroller.scrollTop += delta;
      this.updateDrag(this.lastPointerY);
    }
    this.scrollFrame = requestAnimationFrame(this.autoScroll);
  };

  private bindFileDropEvents(): void {
    const hasFiles = (event: DragEvent) => {
      const types = event.dataTransfer?.types ?? [];
      return types.includes("Files") || types.includes(YOUTUBE_DRAG_TYPE);
    };

    this.scroller.addEventListener("dragover", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer!.dropEffect = "copy";
      this.scroller.classList.add("drop-target");
      this.showIndicator(event.clientY);
    });

    this.scroller.addEventListener("dragleave", (event) => {
      if (!this.scroller.contains(event.relatedTarget as Node)) this.hideIndicator();
    });

    this.scroller.addEventListener("drop", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const index = this.dropIndex(event.clientY);
      this.hideIndicator();
      document.body.classList.remove("is-dragging-files");
      const youtube = event.dataTransfer!.getData(YOUTUBE_DRAG_TYPE);
      if (youtube) this.callbacks.onDropYouTube(youtube, index);
      else this.callbacks.onDropFiles([...event.dataTransfer!.files], index);
    });
  }

  private dropIndex(clientY: number): number {
    if (this.isFiltering) return Number.MAX_SAFE_INTEGER;
    const rows = [...this.list.children] as HTMLElement[];
    const index = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return index === -1 ? rows.length : index;
  }

  private showIndicator(clientY: number): void {
    const rows = [...this.list.children] as HTMLElement[];
    if (rows.length === 0 || this.isFiltering) {
      this.hideIndicator();
      return;
    }
    const index = this.dropIndex(clientY);
    const scrollerRect = this.scroller.getBoundingClientRect();
    const reference = rows[Math.min(index, rows.length - 1)].getBoundingClientRect();
    const y = index >= rows.length ? reference.bottom : reference.top;
    this.indicator.style.top = `${y - scrollerRect.top + this.scroller.scrollTop - 1}px`;
    this.indicator.dataset.label = index === 0 ? "Al inicio" : index >= rows.length ? "Al final" : `Posición ${index + 1}`;
    this.indicator.classList.add("visible");
  }

  private hideIndicator(): void {
    this.scroller.classList.remove("drop-target");
    this.indicator.classList.remove("visible");
  }
}
