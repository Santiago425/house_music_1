import { icons } from "./icons";
import { escapeHtml } from "../utils/format";

export type ToastKind = "success" | "error" | "info";

interface ToastAction {
  label: string;
  run: () => void;
}

const ICONS: Record<ToastKind, string> = {
  success: icons.check,
  error: icons.alert,
  info: icons.info,
};

export class Toaster {
  private readonly root: HTMLElement;
  private readonly recent = new Map<string, number>();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(message: string, kind: ToastKind = "info", action?: ToastAction): void {
    const now = Date.now();
    if (!action && (this.recent.get(message) ?? 0) > now - 800) return;
    this.recent.set(message, now);
    const toast = document.createElement("div");
    toast.className = `toast toast-${kind}`;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");
    toast.innerHTML = `${ICONS[kind]}<span>${escapeHtml(message)}</span>`;
    const dismiss = () => {
      toast.classList.remove("visible");
      window.setTimeout(() => toast.remove(), 300);
    };
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toast-action";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        action.run();
        dismiss();
      }, { once: true });
      toast.append(button);
    }
    this.root.append(toast);
    while (this.root.children.length > 4) this.root.firstElementChild?.remove();
    requestAnimationFrame(() => toast.classList.add("visible"));
    window.setTimeout(dismiss, action ? 6000 : 3200);
  }
}
