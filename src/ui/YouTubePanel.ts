import { YouTubeError, type YouTubeResult, type YouTubeService } from "../services/youtube/YouTubeService";
import { escapeHtml, formatTime } from "../utils/format";
import { icons } from "./icons";
import { YOUTUBE_DRAG_TYPE } from "./SongListView";

type AddPlacement = "first" | "last";

interface PanelCallbacks {
  onAdd: (result: YouTubeResult, placement: AddPlacement) => void;
  onPreview: (result: YouTubeResult) => void;
}

export class YouTubePanel {
  private readonly root: HTMLElement;
  private readonly service: YouTubeService;
  private readonly callbacks: PanelCallbacks;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLElement;
  private readonly keyBox: HTMLElement;
  private current: YouTubeResult[] = [];
  private requestId = 0;

  constructor(root: HTMLElement, service: YouTubeService, callbacks: PanelCallbacks) {
    this.root = root;
    this.service = service;
    this.callbacks = callbacks;
    root.innerHTML = `
      <header class="yt-header">
        <div>
          <span class="eyebrow">Buscar en</span>
          <h2><span class="yt-mark">${icons.youtube}</span>YouTube</h2>
        </div>
        <button type="button" class="icon-btn" data-close title="Cerrar" aria-label="Cerrar">${icons.close}</button>
      </header>
      <form class="yt-form" novalidate>
        <label class="search">
          ${icons.search}
          <input type="search" placeholder="Canción, artista o link de YouTube" autocomplete="off" />
        </label>
        <button type="submit" class="btn primary">Buscar</button>
      </form>
      <div class="yt-key" hidden>
        <p><strong>Para buscar necesitas una API key de YouTube.</strong> Mientras tanto puedes pegar el link de cualquier video en el buscador.</p>
        <form class="yt-key-form">
          <input type="text" placeholder="Pega aquí tu API key" autocomplete="off" spellcheck="false" />
          <button type="submit" class="btn">Guardar</button>
        </form>
      </div>
      <p class="yt-tip">Arrastra un resultado sobre la lista para ponerlo en la posición que quieras.</p>
      <ul class="yt-results" aria-live="polite"></ul>`;
    this.form = root.querySelector(".yt-form")!;
    this.input = this.form.querySelector("input")!;
    this.results = root.querySelector(".yt-results")!;
    this.keyBox = root.querySelector(".yt-key")!;
    this.bind();
    this.renderKeyBox();
    this.renderMessage("Busca tus canciones favoritas y agrégalas a la playlist.");
  }

  get isOpen(): boolean {
    return document.body.classList.contains("yt-open");
  }

  open(): void {
    document.body.classList.add("yt-open");
    this.root.setAttribute("aria-hidden", "false");
    window.setTimeout(() => this.input.focus(), 150);
  }

  close(): void {
    document.body.classList.remove("yt-open");
    this.root.setAttribute("aria-hidden", "true");
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private bind(): void {
    this.root.querySelector("[data-close]")!.addEventListener("click", () => this.close());
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    });
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.run(this.input.value);
    });
    const keyForm = this.keyBox.querySelector("form")!;
    keyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = keyForm.querySelector("input")!;
      this.service.saveKey(input.value);
      input.value = "";
      this.renderKeyBox();
      if (this.service.hasKey) this.renderMessage("API key guardada. ¡Ya puedes buscar!");
    });
    this.results.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const item = target.closest<HTMLElement>("[data-index]");
      if (!item) return;
      const result = this.current[Number(item.dataset.index)];
      if (!result) return;
      const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action === "first" || action === "last") {
        this.callbacks.onAdd(result, action);
        item.classList.add("added");
      } else if (action === "preview") {
        this.callbacks.onPreview(result);
      }
    });
    this.results.addEventListener("dragstart", (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
      const result = item ? this.current[Number(item.dataset.index)] : null;
      if (!result || !event.dataTransfer) return;
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(YOUTUBE_DRAG_TYPE, JSON.stringify(result));
      event.dataTransfer.setData("text/plain", `https://www.youtube.com/watch?v=${result.videoId}`);
      document.body.classList.add("is-dragging-result");
    });
    this.results.addEventListener("dragend", () => document.body.classList.remove("is-dragging-result"));
  }

  private renderKeyBox(): void {
    this.keyBox.hidden = this.service.hasKey;
  }

  private async run(raw: string): Promise<void> {
    const query = raw.trim();
    if (!query) {
      this.input.focus();
      return;
    }
    const id = ++this.requestId;
    this.renderLoading();
    try {
      const videoId = this.service.parseVideoId(query);
      const results = videoId ? [await this.service.lookup(videoId)] : await this.searchOrExplain(query);
      if (id !== this.requestId) return;
      this.current = results;
      if (results.length === 0) this.renderMessage("No encontramos canciones con esa búsqueda.");
      else this.renderResults();
    } catch (error) {
      if (id !== this.requestId) return;
      this.renderMessage(error instanceof YouTubeError ? error.message : "Algo salió mal buscando en YouTube", true);
    }
  }

  private async searchOrExplain(query: string): Promise<YouTubeResult[]> {
    if (!this.service.hasKey) {
      this.renderKeyBox();
      throw new YouTubeError("Sin API key solo puedes pegar links de YouTube. Agrega tu API key para buscar por nombre.");
    }
    return this.service.search(query);
  }

  private renderLoading(): void {
    this.results.innerHTML = Array.from({ length: 5 }, () => `<li class="yt-skeleton"><span></span><div><i></i><i></i></div></li>`).join("");
  }

  private renderMessage(message: string, isError = false): void {
    this.current = [];
    this.results.innerHTML = `<li class="yt-message${isError ? " error" : ""}">${escapeHtml(message)}</li>`;
  }

  private renderResults(): void {
    this.results.innerHTML = this.current
      .map(
        (result, index) => `
        <li class="yt-result" data-index="${index}" draggable="true">
          <button type="button" class="yt-thumb" data-action="preview" title="Escuchar ahora">
            <img src="${escapeHtml(result.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
            ${result.duration ? `<span class="yt-duration">${formatTime(result.duration)}</span>` : ""}
            <span class="yt-play">${icons.play}</span>
          </button>
          <div class="yt-info">
            <strong title="${escapeHtml(result.title)}">${escapeHtml(result.title)}</strong>
            <span>${escapeHtml(result.artist)}</span>
            <div class="yt-actions">
              <button type="button" class="chip" data-action="first">${icons.addTop}Al inicio</button>
              <button type="button" class="chip" data-action="last">${icons.addBottom}Al final</button>
              <span class="yt-added">${icons.check}Agregada</span>
            </div>
          </div>
        </li>`,
      )
      .join("");
  }
}
