export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
};

export const formatTotal = (seconds: number): string => {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${total} s`;
};

export const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export const hashHue = (text: string): number => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
};

const PALETTES: [string, string][] = [
  ["#ff2e88", "#8b5cf6"],
  ["#8b5cf6", "#00c2ff"],
  ["#00c2ff", "#14e0a8"],
  ["#ff7a1a", "#ff2e88"],
  ["#c6f432", "#00c2ff"],
  ["#ff2e88", "#ffb21a"],
  ["#6d4bff", "#ff5cc8"],
  ["#00d1c1", "#6d4bff"],
];

export const coverGradient = (seed: string): string => {
  const [from, to] = PALETTES[hashHue(seed) % PALETTES.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
};
