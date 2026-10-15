import { escapeHtml } from "../utils/format";

interface PromptOptions {
  title: string;
  label: string;
  value?: string;
  placeholder?: string;
  confirmText: string;
  validate: (value: string) => void;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

export class Dialog {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  prompt(options: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => {
      const { overlay, panel, close } = this.mount<string | null>(resolve, null);
      panel.innerHTML = `
        <form class="dialog-form" novalidate>
          <h2>${escapeHtml(options.title)}</h2>
          <label class="field">
            <span>${escapeHtml(options.label)}</span>
            <input type="text" maxlength="40" autocomplete="off" placeholder="${escapeHtml(options.placeholder ?? "")}" value="${escapeHtml(options.value ?? "")}" />
          </label>
          <p class="field-error" aria-live="polite"></p>
          <div class="dialog-actions">
            <button type="button" class="btn ghost" data-cancel>Cancelar</button>
            <button type="submit" class="btn primary">${escapeHtml(options.confirmText)}</button>
          </div>
        </form>`;
      const form = panel.querySelector("form")!;
      const input = panel.querySelector("input")!;
      const error = panel.querySelector<HTMLElement>(".field-error")!;
      input.addEventListener("input", () => {
        error.textContent = "";
        input.classList.remove("invalid");
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        try {
          options.validate(input.value);
          close(input.value.trim());
        } catch (reason) {
          error.textContent = reason instanceof Error ? reason.message : "Valor inválido";
          input.classList.add("invalid");
          input.focus();
        }
      });
      panel.querySelector("[data-cancel]")!.addEventListener("click", () => close(null));
      this.root.append(overlay);
      requestAnimationFrame(() => {
        overlay.classList.add("visible");
        input.focus();
        input.select();
      });
    });
  }

  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const { overlay, panel, close } = this.mount<boolean>(resolve, false);
      panel.innerHTML = `
        <div class="dialog-form">
          <h2>${escapeHtml(options.title)}</h2>
          <p class="dialog-message">${escapeHtml(options.message)}</p>
          <div class="dialog-actions">
            <button type="button" class="btn ghost" data-cancel>Cancelar</button>
            <button type="button" class="btn ${options.danger ? "danger" : "primary"}" data-confirm>${escapeHtml(options.confirmText)}</button>
          </div>
        </div>`;
      panel.querySelector("[data-cancel]")!.addEventListener("click", () => close(false));
      panel.querySelector("[data-confirm]")!.addEventListener("click", () => close(true));
      this.root.append(overlay);
      requestAnimationFrame(() => {
        overlay.classList.add("visible");
        panel.querySelector<HTMLButtonElement>("[data-confirm]")!.focus();
      });
    });
  }

  private mount<T>(resolve: (value: T) => void, dismissValue: T) {
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    const panel = document.createElement("div");
    panel.className = "dialog";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    overlay.append(panel);
    let closed = false;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(dismissValue);
    };
    const close = (value: T) => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.classList.remove("visible");
      window.setTimeout(() => overlay.remove(), 200);
      resolve(value);
    };
    overlay.addEventListener("pointerdown", (event) => {
      if (event.target === overlay) close(dismissValue);
    });
    document.addEventListener("keydown", onKey, true);
    return { overlay, panel, close };
  }

  get isOpen(): boolean {
    return this.root.querySelector(".dialog-overlay") !== null;
  }
}
