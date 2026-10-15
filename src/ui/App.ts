import { Library } from "../models/Library";
import type { Playlist } from "../models/Playlist";
import type { Song } from "../models/Song";
import { LibraryStorage } from "../services/LibraryStorage";
import { PlayerController, type PlayerState } from "../services/PlayerController";
import { Preferences } from "../services/Preferences";
import { SongFactory } from "../services/SongFactory";
import { YouTubeService, type YouTubeResult } from "../services/youtube/YouTubeService";
import { coverGradient, escapeHtml, formatTime, formatTotal, pluralize } from "../utils/format";
import { Dialog } from "./Dialog";
import { icons } from "./icons";
import { SongListView } from "./SongListView";
import { Toaster } from "./Toaster";
import { Visualizer } from "./Visualizer";
import { YouTubePanel } from "./YouTubePanel";

type Placement = { kind: "first" } | { kind: "last" } | { kind: "index"; index: number };

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
};

export class App {
  private library = new Library();
  private selectedId: string | null = null;
  private pendingPlacement: Placement = { kind: "last" };
  private isSeeking = false;
  private fileDragDepth = 0;
  private lastSignature = "";
  private saveQueue: Promise<void> = Promise.resolve();

  private readonly player = new PlayerController($("video-host"));
  private readonly youtube = new YouTubeService();
  private readonly youtubePanel: YouTubePanel;
  private readonly storage = new LibraryStorage();
  private readonly preferences = new Preferences();
  private readonly factory = new SongFactory();
  private readonly toaster = new Toaster($("toast-root"));
  private readonly dialog = new Dialog($("dialog-root"));
  private readonly visualizer = new Visualizer($<HTMLCanvasElement>("visualizer"), () => this.player.analyser);
  private readonly songList: SongListView;

  private readonly el = {
    playlistList: $<HTMLUListElement>("playlist-list"),
    welcome: $("welcome"),
    playlistView: $("playlist-view"),
    playlistCover: $("playlist-cover"),
    playlistTitle: $("playlist-title"),
    playlistMeta: $("playlist-meta"),
    playAll: $<HTMLButtonElement>("play-all"),
    shuffleAll: $<HTMLButtonElement>("shuffle-all"),
    search: $<HTMLInputElement>("search"),
    listHint: $("list-hint"),
    emptyPlaylist: $("empty-playlist"),
    noResults: $("no-results"),
    fileInput: $<HTMLInputElement>("file-input"),
    storageStatus: $("storage-status"),
    nowCover: $("now-cover"),
    nowTitle: $("now-title"),
    nowArtist: $("now-artist"),
    upNext: $("up-next"),
    btnPlay: $<HTMLButtonElement>("btn-play"),
    btnPrevious: $<HTMLButtonElement>("btn-previous"),
    btnNext: $<HTMLButtonElement>("btn-next"),
    btnShuffle: $<HTMLButtonElement>("btn-shuffle"),
    btnRepeat: $<HTMLButtonElement>("btn-repeat"),
    btnMute: $<HTMLButtonElement>("btn-mute"),
    seek: $<HTMLInputElement>("seek"),
    volume: $<HTMLInputElement>("volume"),
    timeCurrent: $("time-current"),
    timeTotal: $("time-total"),
  };

  constructor() {
    this.songList = new SongListView($<HTMLOListElement>("song-list"), $("song-scroller"), {
      onPlay: (songId) => this.handleSongClick(songId),
      onRemove: (songId) => void this.removeSong(songId),
      onMove: (songId, index) => this.moveSong(songId, index),
      onDropFiles: (files, index) => void this.importFiles(files, { kind: "index", index }),
      onDropYouTube: (payload, index) => this.handleYouTubeDrop(payload, index),
    });
    this.youtubePanel = new YouTubePanel($("youtube-panel"), this.youtube, {
      onAdd: (result, placement) => this.addFromYouTube(result, { kind: placement }),
      onPreview: (result) => this.playFromYouTube(result),
    });
  }

  async start(): Promise<void> {
    this.paintStaticIcons();
    this.bindEvents();
    const persistent = await this.storage.open();
    try {
      this.library = await this.storage.load();
    } catch {
      this.toaster.show("No se pudo cargar tu biblioteca guardada", "error");
    }
    this.el.storageStatus.textContent = persistent
      ? "Tus playlists se guardan en este navegador"
      : "Modo temporal: tus playlists no se guardarán";
    this.el.storageStatus.classList.toggle("warning", !persistent);
    const preferences = this.preferences.load();
    this.player.restorePreferences(preferences.volume, preferences.muted, preferences.repeat, preferences.shuffle);
    this.selectedId = this.library.find(preferences.lastPlaylistId ?? "")?.id ?? this.library.all()[0]?.id ?? null;
    this.renderAll();
  }

  private get selected(): Playlist | null {
    return this.selectedId ? this.library.find(this.selectedId) : null;
  }

  private paintStaticIcons(): void {
    document.querySelectorAll<HTMLElement>("[data-icon]").forEach((node) => {
      node.innerHTML = icons[node.dataset.icon as keyof typeof icons] ?? "";
    });
    $("new-playlist").innerHTML = icons.plus;
    $("rename-playlist").innerHTML = icons.edit;
    $("delete-playlist").innerHTML = icons.trash;
    $("add-first").innerHTML = `${icons.addTop}<span>Agregar al inicio</span>`;
    $("add-last").innerHTML = `${icons.addBottom}<span>Agregar al final</span>`;
    $("open-youtube").innerHTML = `${icons.youtube}<span>Buscar en YouTube</span>`;
    this.el.shuffleAll.innerHTML = `${icons.shuffle}<span>Aleatorio</span>`;
    this.el.btnPrevious.innerHTML = icons.previous;
    this.el.btnNext.innerHTML = icons.next;
    this.el.btnShuffle.innerHTML = icons.shuffle;
  }

  private bindEvents(): void {
    $("new-playlist").addEventListener("click", () => void this.createPlaylist());
    $("welcome-create").addEventListener("click", () => void this.createPlaylist());
    $("rename-playlist").addEventListener("click", () => void this.renamePlaylist());
    $("delete-playlist").addEventListener("click", () => void this.deletePlaylist());
    $("add-first").addEventListener("click", () => this.pickFiles({ kind: "first" }));
    $("add-last").addEventListener("click", () => this.pickFiles({ kind: "last" }));
    $("empty-add").addEventListener("click", () => this.pickFiles({ kind: "last" }));
    $("empty-youtube").addEventListener("click", () => this.youtubePanel.open());
    $("open-youtube").addEventListener("click", () => this.youtubePanel.toggle());

    this.el.playAll.addEventListener("click", () => this.playSelected());
    this.el.shuffleAll.addEventListener("click", () => {
      const playlist = this.selected;
      if (!playlist) return;
      if (!this.player.state.shuffle) this.player.toggleShuffle();
      this.player.playFromStart(playlist, true);
    });

    this.el.fileInput.addEventListener("change", () => {
      const files = [...(this.el.fileInput.files ?? [])];
      this.el.fileInput.value = "";
      if (files.length) void this.importFiles(files, this.pendingPlacement);
    });

    this.el.playlistList.addEventListener("click", (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>("[data-playlist]");
      if (item?.dataset.playlist) this.selectPlaylist(item.dataset.playlist);
    });
    this.el.playlistList.addEventListener("dblclick", (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>("[data-playlist]");
      if (item?.dataset.playlist) this.player.playFromStart(this.library.find(item.dataset.playlist)!, this.player.state.shuffle);
    });

    this.el.search.addEventListener("input", () => {
      this.songList.setFilter(this.el.search.value);
      this.renderSongs();
    });

    this.el.btnPlay.addEventListener("click", () => this.player.togglePlay(this.selected));
    this.el.btnNext.addEventListener("click", () => this.player.next());
    this.el.btnPrevious.addEventListener("click", () => this.player.previous());
    this.el.btnShuffle.addEventListener("click", () => this.toggleShuffle());
    this.el.btnRepeat.addEventListener("click", () => this.cycleRepeat());
    this.el.btnMute.addEventListener("click", () => this.player.toggleMute());

    this.el.seek.addEventListener("input", () => {
      this.isSeeking = true;
      const duration = Number(this.el.seek.dataset.duration ?? 0);
      this.el.timeCurrent.textContent = formatTime((Number(this.el.seek.value) / 1000) * duration);
      this.paintRange(this.el.seek);
    });
    this.el.seek.addEventListener("change", () => {
      const duration = Number(this.el.seek.dataset.duration ?? 0);
      this.player.seek((Number(this.el.seek.value) / 1000) * duration);
      this.isSeeking = false;
    });
    this.el.volume.addEventListener("input", () => this.player.setVolume(Number(this.el.volume.value) / 100));

    this.player.on("change", (state) => this.renderPlayer(state));
    this.player.on("time", ({ current, duration }) => this.renderTime(current, duration));
    this.player.on("error", (message) => this.toaster.show(message, "error"));
    this.player.on("notice", (message) => this.toaster.show(message, "info"));
    this.player.on("updated", () => {
      this.persist();
      this.renderSongs();
      this.renderPlaylistHeader();
    });

    document.addEventListener("keydown", (event) => this.handleShortcut(event));
    this.bindWindowFileDrop();
  }

  private bindWindowFileDrop(): void {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    window.addEventListener("dragenter", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.fileDragDepth++;
      document.body.classList.add("is-dragging-files");
    });
    window.addEventListener("dragleave", (event) => {
      if (!hasFiles(event)) return;
      this.fileDragDepth = Math.max(0, this.fileDragDepth - 1);
      if (this.fileDragDepth === 0) document.body.classList.remove("is-dragging-files");
    });
    window.addEventListener("dragover", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
    });
    window.addEventListener("drop", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.fileDragDepth = 0;
      document.body.classList.remove("is-dragging-files");
      const files = [...event.dataTransfer!.files];
      if (files.length) void this.importFiles(files, { kind: "last" });
    });
    document.addEventListener("drop", () => {
      this.fileDragDepth = 0;
      document.body.classList.remove("is-dragging-files");
    }, true);
  }

  private handleShortcut(event: KeyboardEvent): void {
    if (this.dialog.isOpen || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable]") && target !== this.el.seek && target !== this.el.volume) return;
    const onRow = target.closest(".song-row") !== null;
    switch (event.key) {
      case " ":
        event.preventDefault();
        this.player.togglePlay(this.selected);
        break;
      case "ArrowRight":
        event.preventDefault();
        if (event.shiftKey) this.player.next();
        else this.player.seekBy(5);
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (event.shiftKey) this.player.previous();
        else this.player.seekBy(-5);
        break;
      case "ArrowUp":
      case "ArrowDown":
        if (onRow && event.altKey) return;
        event.preventDefault();
        this.player.setVolume(this.player.state.volume + (event.key === "ArrowUp" ? 0.05 : -0.05));
        break;
      case "m":
      case "M":
        this.player.toggleMute();
        break;
      case "s":
      case "S":
        this.toggleShuffle();
        break;
      case "r":
      case "R":
        this.cycleRepeat();
        break;
    }
  }

  private toggleShuffle(): void {
    const enabled = this.player.toggleShuffle();
    this.toaster.show(enabled ? "Modo aleatorio activado" : "Modo aleatorio desactivado");
    this.savePreferences();
  }

  private cycleRepeat(): void {
    const mode = this.player.cycleRepeat();
    const labels = { off: "Repetición desactivada", all: "Repetir toda la playlist", one: "Repetir la canción actual" };
    this.toaster.show(labels[mode]);
    this.savePreferences();
  }

  private selectPlaylist(playlistId: string): void {
    if (this.selectedId === playlistId) return;
    this.selectedId = playlistId;
    this.el.search.value = "";
    this.songList.setFilter("");
    this.savePreferences();
    this.renderAll();
    $("song-scroller").scrollTop = 0;
  }

  private playSelected(): void {
    const playlist = this.selected;
    if (!playlist) return;
    if (this.player.isActive(playlist) && this.player.state.song) this.player.togglePlay(playlist);
    else this.player.playFromStart(playlist, this.player.state.shuffle);
  }

  private handleSongClick(songId: string): void {
    const playlist = this.selected;
    if (!playlist) return;
    const state = this.player.state;
    if (state.playlist === playlist && state.song?.id === songId) this.player.togglePlay(playlist);
    else this.player.play(playlist, songId);
  }

  private async createPlaylist(): Promise<void> {
    const suggested = `Playlist ${this.library.size + 1}`;
    const name = await this.dialog.prompt({
      title: "Nueva playlist",
      label: "Nombre",
      value: this.library.all().some((playlist) => playlist.name === suggested) ? "" : suggested,
      placeholder: "Ej: Reggaetón, Rock, Para estudiar…",
      confirmText: "Crear",
      validate: (value) => this.library.validateNewName(value),
    });
    if (name === null) return;
    const playlist = this.library.create(name);
    this.selectedId = playlist.id;
    this.persist();
    this.savePreferences();
    this.renderAll();
    this.toaster.show(`Playlist "${playlist.name}" creada`, "success");
  }

  private async renamePlaylist(): Promise<void> {
    const playlist = this.selected;
    if (!playlist) return;
    const name = await this.dialog.prompt({
      title: "Renombrar playlist",
      label: "Nuevo nombre",
      value: playlist.name,
      confirmText: "Guardar",
      validate: (value) => this.library.validateNewName(value, playlist.id),
    });
    if (name === null || name === playlist.name) return;
    this.library.rename(playlist.id, name);
    this.persist();
    this.renderAll();
    this.toaster.show("Playlist renombrada", "success");
  }

  private async deletePlaylist(): Promise<void> {
    const playlist = this.selected;
    if (!playlist) return;
    const confirmed = await this.dialog.confirm({
      title: "Eliminar playlist",
      message: `Se eliminará "${playlist.name}" con ${pluralize(playlist.size, "canción", "canciones")}. Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;
    const neighbor = this.library.neighborOf(playlist.id);
    this.player.handlePlaylistRemoved(playlist);
    this.library.remove(playlist.id);
    this.selectedId = neighbor?.id ?? null;
    this.persist(() => this.storage.deleteFiles(playlist.songs.toArray().map((song) => song.id)));
    this.savePreferences();
    this.renderAll();
    this.toaster.show(`Playlist "${playlist.name}" eliminada`, "success");
  }

  private pickFiles(placement: Placement): void {
    this.pendingPlacement = placement;
    this.el.fileInput.click();
  }

  private async importFiles(files: File[], placement: Placement): Promise<void> {
    const target = this.ensurePlaylist();
    document.body.classList.add("is-importing");
    this.toaster.show(`Leyendo ${pluralize(files.length, "archivo", "archivos")}…`);
    const { songs, rejected } = await this.factory.fromFiles(files);
    document.body.classList.remove("is-importing");
    if (!this.library.find(target.id)) return;

    if (placement.kind === "first") songs.forEach((song, i) => target.insertAt(i, song));
    else if (placement.kind === "last") songs.forEach((song) => target.addLast(song));
    else songs.forEach((song, i) => target.insertAt(placement.index + i, song));

    if (songs.length) {
      this.persist(() => this.storage.saveFiles(songs));
      const where = placement.kind === "first" ? "al inicio" : placement.kind === "last" || placement.index >= target.size - songs.length ? "al final" : `en la posición ${placement.index + 1}`;
      this.toaster.show(`${pluralize(songs.length, "canción agregada", "canciones agregadas")} ${where}`, "success");
    }
    if (rejected.length === 1) this.toaster.show(`"${rejected[0].fileName}": ${rejected[0].message}`, "error");
    else if (rejected.length > 1) this.toaster.show(`${rejected.length} archivos no son audio válido y se omitieron`, "error");
    this.renderAll();
  }

  private ensurePlaylist(): Playlist {
    let playlist = this.selected;
    if (!playlist) {
      playlist = this.library.create(this.uniqueName("Mi música"));
      this.selectedId = playlist.id;
      this.savePreferences();
    }
    return playlist;
  }

  private addFromYouTube(result: YouTubeResult, placement: Placement): void {
    const playlist = this.ensurePlaylist();
    const song = this.youtube.toSong(result);
    if (placement.kind === "first") playlist.addFirst(song);
    else if (placement.kind === "last") playlist.addLast(song);
    else playlist.insertAt(placement.index, song);
    this.persist();
    this.renderAll();
    const index = playlist.indexOf(song.id);
    const where = index === 0 ? "al inicio" : index === playlist.size - 1 ? "al final" : `en la posición ${index + 1}`;
    this.toaster.show(`"${song.title}" agregada ${where}`, "success");
  }

  private playFromYouTube(result: YouTubeResult): void {
    const playlist = this.ensurePlaylist();
    const state = this.player.state;
    const index = state.playlist === playlist && state.song ? playlist.indexOf(state.song.id) + 1 : playlist.size;
    const song = this.youtube.toSong(result);
    playlist.insertAt(index, song);
    this.persist();
    this.player.play(playlist, song.id);
    this.renderAll();
    this.toaster.show(`Sonando "${song.title}"`, "success");
  }

  private handleYouTubeDrop(payload: string, index: number): void {
    try {
      const result = JSON.parse(payload) as YouTubeResult;
      if (!this.youtube.parseVideoId(result.videoId)) throw new Error();
      this.addFromYouTube(result, { kind: "index", index });
    } catch {
      this.toaster.show("No se pudo agregar ese video", "error");
    }
  }

  private async removeSong(songId: string): Promise<void> {
    const playlist = this.selected;
    if (!playlist) return;
    const index = playlist.indexOf(songId);
    const removal = playlist.remove(songId);
    if (!removal) return;
    this.player.handleSongRemoved(playlist, removal);
    this.persist(() => this.storage.deleteFiles([songId]));
    this.renderAll();
    this.toaster.show(`"${removal.song.title}" eliminada`, "info", {
      label: "Deshacer",
      run: () => this.restoreSong(playlist, removal.song, index),
    });
  }

  private restoreSong(playlist: Playlist, song: Song, index: number): void {
    if (!this.library.find(playlist.id) || playlist.find(song.id)) return;
    playlist.insertAt(index, song);
    this.persist(() => this.storage.saveFiles([song]));
    this.renderAll();
  }

  private moveSong(songId: string, index: number): void {
    const playlist = this.selected;
    if (!playlist) return;
    const changed = playlist.indexOf(songId) !== index && playlist.move(songId, index);
    if (changed) this.persist();
    this.renderSongs();
    this.renderPlayer(this.player.state);
  }

  private uniqueName(base: string): string {
    let name = base;
    let counter = 2;
    while (this.library.all().some((playlist) => playlist.name.toLowerCase() === name.toLowerCase())) name = `${base} ${counter++}`;
    return name;
  }

  private persist(extra?: () => Promise<void>): void {
    if (!this.storage.available) return;
    this.saveQueue = this.saveQueue
      .then(async () => {
        if (extra) await extra();
        await this.storage.saveLibrary(this.library);
      })
      .catch((error: DOMException) => {
        const message = error?.name === "QuotaExceededError"
          ? "No hay espacio suficiente para guardar más canciones en el navegador"
          : "No se pudieron guardar los cambios";
        this.toaster.show(message, "error");
      });
  }

  private savePreferences(): void {
    const state = this.player.state;
    this.preferences.save({
      volume: state.volume,
      muted: state.muted,
      repeat: state.repeat,
      shuffle: state.shuffle,
      lastPlaylistId: this.selectedId,
    });
  }

  private renderAll(): void {
    this.renderSidebar();
    this.renderPlaylistHeader();
    this.renderSongs();
    this.renderPlayer(this.player.state);
  }

  private renderSidebar(): void {
    const state = this.player.state;
    const items = this.library.all().map((playlist) => {
      const active = playlist.id === this.selectedId;
      const live = state.playlist === playlist && state.isPlaying;
      return `
        <li>
          <button type="button" class="playlist-item${active ? " active" : ""}${live ? " live" : ""}" data-playlist="${playlist.id}" title="Doble clic para reproducir">
            <span class="playlist-thumb" style="background:${coverGradient(playlist.id)}">${icons.music}</span>
            <span class="playlist-item-text">
              <span class="playlist-item-name">${escapeHtml(playlist.name)}</span>
              <span class="playlist-item-count">${pluralize(playlist.size, "canción", "canciones")}</span>
            </span>
            <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
          </button>
        </li>`;
    });
    this.el.playlistList.innerHTML = items.join("") || `<li class="playlist-empty">Aún no tienes playlists</li>`;
  }

  private renderPlaylistHeader(): void {
    const playlist = this.selected;
    this.el.welcome.hidden = playlist !== null;
    this.el.playlistView.hidden = playlist === null;
    if (!playlist) return;
    this.el.playlistCover.style.background = coverGradient(playlist.id);
    this.el.playlistCover.innerHTML = `${icons.music}<span class="cover-title">${escapeHtml(playlist.name)}</span>`;
    $("cover-disc-label").style.background = coverGradient(`${playlist.id}-disc`);
    $("cover-disc-label").parentElement!.classList.toggle("spinning", this.player.isActive(playlist));
    this.el.playlistTitle.textContent = playlist.name;
    this.el.playlistMeta.textContent = playlist.size
      ? `${pluralize(playlist.size, "canción", "canciones")} · ${formatTotal(playlist.totalDuration)}`
      : "Sin canciones todavía";
    const empty = playlist.size === 0;
    const live = this.player.isActive(playlist) && this.player.state.isPlaying;
    this.el.playAll.innerHTML = live ? `${icons.pause}<span>Pausar</span>` : `${icons.play}<span>Reproducir</span>`;
    this.el.playAll.disabled = empty;
    this.el.shuffleAll.disabled = empty || playlist.size < 2;
    this.el.search.disabled = empty;
  }

  private renderSongs(): void {
    const playlist = this.selected;
    if (!playlist) return;
    const state = this.player.state;
    const current = state.playlist === playlist ? state.song : null;
    const visible = this.songList.render(playlist, current, state.isPlaying);
    this.el.emptyPlaylist.hidden = playlist.size > 0;
    this.el.noResults.hidden = !(playlist.size > 0 && visible === 0);
    this.el.listHint.textContent = this.songList.isFiltering
      ? "Borra la búsqueda para reordenar con arrastrar y soltar"
      : playlist.size > 1
        ? "Arrastra para reordenar · suelta archivos entre canciones para insertarlos ahí"
        : "";
  }

  private renderPlayer(state: PlayerState): void {
    const { song, isPlaying, playlist } = state;
    this.el.btnPlay.innerHTML = isPlaying ? icons.pause : icons.play;
    this.el.btnPlay.setAttribute("aria-label", isPlaying ? "Pausar" : "Reproducir");
    this.el.btnPlay.title = isPlaying ? "Pausar (Espacio)" : "Reproducir (Espacio)";
    this.el.btnPlay.disabled = !song && (this.selected?.size ?? 0) === 0;
    this.el.btnNext.disabled = !this.player.canGoNext();
    this.el.btnPrevious.disabled = !this.player.canGoPrevious();
    this.el.btnShuffle.classList.toggle("on", state.shuffle);
    this.el.btnShuffle.setAttribute("aria-pressed", String(state.shuffle));
    this.el.btnRepeat.innerHTML = state.repeat === "one" ? icons.repeatOne : icons.repeat;
    this.el.btnRepeat.classList.toggle("on", state.repeat !== "off");
    this.el.btnRepeat.setAttribute("aria-pressed", String(state.repeat !== "off"));
    this.el.btnMute.innerHTML = state.muted || state.volume === 0 ? icons.muted : state.volume < 0.5 ? icons.volumeLow : icons.volume;
    this.el.volume.value = String(Math.round((state.muted ? 0 : state.volume) * 100));
    this.paintRange(this.el.volume);
    this.el.seek.disabled = !song;
    document.body.classList.toggle("is-playing", isPlaying);
    document.body.classList.toggle("has-video", song?.isYouTube ?? false);

    if (song && playlist) {
      this.el.nowCover.classList.add("loaded");
      this.el.nowCover.innerHTML = `<span class="vinyl-label" style="background:${coverGradient(song.title + song.artist)}">${
        song.thumbnail ? `<img src="${escapeHtml(song.thumbnail)}" alt="" referrerpolicy="no-referrer" />` : ""
      }</span>`;
      this.el.nowTitle.textContent = song.title;
      this.el.nowArtist.textContent = `${song.artist} · ${playlist.name}`;
      const upcoming = state.repeat === "one" ? song : state.shuffle ? null : playlist.peekNext(state.repeat === "all");
      this.el.upNext.textContent = state.shuffle && playlist.size > 1
        ? "Siguiente: aleatoria"
        : upcoming ? `Siguiente: ${upcoming.title}` : "Última canción de la playlist";
      document.title = `${isPlaying ? "▶ " : ""}${song.title} · House Music`;
    } else {
      this.el.nowCover.classList.remove("loaded");
      this.el.nowCover.innerHTML = `<span class="vinyl-label">${icons.music}</span>`;
      this.el.nowTitle.textContent = "Nada sonando";
      this.el.nowArtist.textContent = "Elige una canción para empezar";
      this.el.upNext.textContent = "";
      document.title = "House Music · Reproductor";
    }

    if (isPlaying) this.visualizer.start();
    else this.visualizer.stop();
    const signature = `${playlist?.id}|${song?.id}|${isPlaying}|${state.repeat}|${state.shuffle}`;
    if (signature !== this.lastSignature && !this.songList.isDragging) {
      this.lastSignature = signature;
      this.renderSidebar();
      this.renderPlaylistHeader();
      this.renderSongs();
    }
    this.savePreferences();
  }

  private renderTime(current: number, duration: number): void {
    this.el.timeTotal.textContent = formatTime(duration);
    this.el.seek.dataset.duration = String(duration);
    if (this.isSeeking) return;
    this.el.timeCurrent.textContent = formatTime(current);
    this.el.seek.value = String(duration > 0 ? Math.round((current / duration) * 1000) : 0);
    this.paintRange(this.el.seek);
  }

  private paintRange(input: HTMLInputElement): void {
    const max = Number(input.max) || 100;
    input.style.setProperty("--fill", `${(Number(input.value) / max) * 100}%`);
  }
}
