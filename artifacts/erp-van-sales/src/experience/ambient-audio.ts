// ALLAL Experience — procedural ambient audio (environmental presence).
//
// No audio files: a single white-noise bed is shaped per scene by a low-pass
// (rumble/room-tone) and high-pass (rain/air hiss) band plus a faint hum
// oscillator. Crossfades between scenes. MUTED by default — nothing plays
// until the user enables it (also satisfies browser autoplay rules, since
// enable() runs from a click). Subtle and premium, never game-like.

type SceneId = "login" | "dashboard" | "warehouse" | "inspection" | "dock" | "analytics" | "office" | "generic";

interface Ambience {
  low: number; // low-band gain (rumble / room tone)
  high: number; // high-band gain (rain / air)
  hum: number; // hum oscillator gain
  humHz: number;
}

const PRESETS: Record<SceneId, Ambience> = {
  login: { low: 0.18, high: 0.5, hum: 0.12, humHz: 70 }, // light rain + distant city
  dashboard: { low: 0.32, high: 0.04, hum: 0.3, humHz: 56 }, // operations room tone
  warehouse: { low: 0.36, high: 0.08, hum: 0.34, humHz: 48 }, // warehouse hum
  inspection: { low: 0.3, high: 0.12, hum: 0.22, humHz: 60 },
  dock: { low: 0.3, high: 0.22, hum: 0.16, humHz: 52 }, // distant loading dock
  analytics: { low: 0.26, high: 0.03, hum: 0.24, humHz: 58 }, // quiet intelligence room
  office: { low: 0.24, high: 0.03, hum: 0.18, humHz: 62 },
  generic: { low: 0.28, high: 0.06, hum: 0.2, humHz: 56 },
};

const MASTER_TARGET = 0.085; // overall subtlety ceiling
const RAMP = 1.4; // seconds crossfade between scenes / mute

export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lowGain: GainNode | null = null;
  private highGain: GainNode | null = null;
  private humGain: GainNode | null = null;
  private enabled = false;
  private current: SceneId = "login";

  private ensureGraph() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    this.ctx = ctx;

    // looping white-noise bed
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // low band (rumble / room tone)
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0;

    // high band (rain / air hiss)
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2600;
    const highGain = ctx.createGain();
    highGain.gain.value = 0;

    // faint hum
    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = PRESETS[this.current].humHz;
    const humGain = ctx.createGain();
    humGain.gain.value = 0;

    const master = ctx.createGain();
    master.gain.value = 0;

    noise.connect(lp).connect(lowGain).connect(master);
    noise.connect(hp).connect(highGain).connect(master);
    hum.connect(humGain).connect(master);
    master.connect(ctx.destination);

    noise.start();
    hum.start();

    this.master = master;
    this.lowGain = lowGain;
    this.highGain = highGain;
    this.humGain = humGain;
    this.applyScene(this.current, 0.01);
  }

  private applyScene(id: SceneId, ramp = RAMP) {
    if (!this.ctx || !this.lowGain || !this.highGain || !this.humGain) return;
    const p = PRESETS[id] ?? PRESETS.generic;
    const t = this.ctx.currentTime;
    this.lowGain.gain.setTargetAtTime(p.low, t, ramp / 3);
    this.highGain.gain.setTargetAtTime(p.high, t, ramp / 3);
    this.humGain.gain.setTargetAtTime(p.hum, t, ramp / 3);
  }

  isEnabled() {
    return this.enabled;
  }

  /** Toggle audio. Called from a user gesture. Returns new state. */
  toggle(): boolean {
    this.enabled ? this.disable() : this.enable();
    return this.enabled;
  }

  enable() {
    this.ensureGraph();
    if (!this.ctx || !this.master) return;
    this.ctx.resume?.();
    this.enabled = true;
    this.master.gain.setTargetAtTime(MASTER_TARGET, this.ctx.currentTime, 0.5);
  }

  disable() {
    this.enabled = false;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  setScene(id: SceneId) {
    this.current = id;
    if (this.ctx) this.applyScene(id);
  }
}

// one shared instance for the session
export const ambient = new AmbientAudio();
export type { SceneId };
