export class Visualizer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly getAnalyser: () => AnalyserNode | null;
  private frame = 0;
  private running = false;
  private levels: number[] = [];

  constructor(canvas: HTMLCanvasElement, getAnalyser: () => AnalyserNode | null) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d")!;
    this.getAnalyser = getAnalyser;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private resize(): void {
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    this.canvas.height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    this.draw();
  }

  private loop = (): void => {
    this.draw();
    const settled = !this.running && this.levels.every((level) => level < 0.02);
    if (!settled) this.frame = requestAnimationFrame(this.loop);
    else cancelAnimationFrame(this.frame);
  };

  private draw(): void {
    const { width, height } = this.canvas;
    const bars = 28;
    const analyser = this.getAnalyser();
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 0);
    if (analyser && this.running) analyser.getByteFrequencyData(data);
    if (this.levels.length !== bars) this.levels = new Array(bars).fill(0);
    this.context.clearRect(0, 0, width, height);
    const gap = width / bars;
    const barWidth = gap * 0.55;
    const gradient = this.context.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, "#00c2ff");
    gradient.addColorStop(0.5, "#8b5cf6");
    gradient.addColorStop(1, "#ff2e88");
    this.context.fillStyle = gradient;
    for (let i = 0; i < bars; i++) {
      const sample = data.length ? data[Math.floor((i / bars) * data.length * 0.75)] / 255 : 0;
      const target = this.running ? Math.max(sample, analyser ? 0.04 : 0.15 + Math.random() * 0.4) : 0;
      this.levels[i] += (target - this.levels[i]) * 0.25;
      const barHeight = Math.max(2, this.levels[i] * height);
      const x = i * gap + (gap - barWidth) / 2;
      this.context.beginPath();
      this.context.roundRect(x, height - barHeight, barWidth, barHeight, barWidth / 2);
      this.context.fill();
    }
  }
}
