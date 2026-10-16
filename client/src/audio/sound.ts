export class Sound {
  private context?: AudioContext;
  private musicTimer?: number;
  map = 'desert';
  volume = Number(localStorage.getItem('arena-volume') ?? '.45');
  music = localStorage.getItem('arena-music') === 'true';
  unlock() {
    this.context ??= new AudioContext();
    void this.context.resume();
    if (this.music && !this.musicTimer) this.startMusic();
  }
  setVolume(v: number) {
    this.volume = v;
    localStorage.setItem('arena-volume', String(v));
  }
  setMusic(v: boolean) {
    this.music = v;
    localStorage.setItem('arena-music', String(v));
    if (v) this.startMusic();
    else {
      clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
  }
  tone(
    frequency: number,
    length: number,
    type: OscillatorType = 'sine',
    gain = 0.13,
    end = frequency,
  ) {
    if (!this.context || this.volume === 0) return;
    const ctx = this.context,
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(frequency, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, end), ctx.currentTime + length);
    g.gain.setValueAtTime(gain * this.volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + length);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + length);
  }
  weapon(id: string, impact = false) {
    const voices: Record<string, [number, OscillatorType, number]> = {
      heavy: [85, 'sawtooth', 0.5],
      shadow: [880, 'sine', 0.17],
      piercing: [1250, 'sawtooth', 0.12],
      electric: [620, 'square', 0.2],
      incendiary: [130, 'sawtooth', 0.45],
      ice: [1400, 'sine', 0.3],
      cluster: [240, 'sawtooth', 0.2],
      guided: [330, 'triangle', 0.3],
      seismic: [50, 'triangle', 0.65],
      plasma: [540, 'sine', 0.13],
      charged: [110, 'sine', 0.6],
    };
    const [hz, type, duration] = voices[id] ?? [170, 'triangle', 0.25];
    this.tone(impact ? hz / 2 : hz, duration, type, 0.14, impact ? hz / 8 : hz * 1.5);
  }
  superpower(tank: string) {
    const ids = [
      'titan',
      'phantom',
      'volt',
      'inferno',
      'frostbite',
      'viper',
      'bastion',
      'quake',
      'medic',
      'nova',
    ];
    const i = ids.indexOf(tank),
      hz = [180, 730, 980, 90, 1450, 310, 240, 45, 520, 115][i] ?? 220;
    this.tone(hz, 0.7, i % 2 ? 'sawtooth' : 'sine', 0.16, hz * (i % 3 === 0 ? 0.25 : 2));
    this.tone(hz * 1.5, 0.35, 'triangle', 0.08, hz * 0.75);
  }
  fire() {
    this.tone(170, 0.22, 'sawtooth', 0.2, 35);
  }
  explosion() {
    this.tone(65, 0.55, 'triangle', 0.4, 12);
    this.tone(120, 0.2, 'sawtooth', 0.13, 18);
  }
  ability() {
    this.tone(220, 0.4, 'sine', 0.12, 880);
  }
  move() {
    this.tone(55, 0.1, 'triangle', 0.06, 40);
  }
  victory() {
    [261, 329, 392, 523].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.5, 'triangle', 0.12), i * 130),
    );
  }
  private startMusic() {
    if (!this.context || this.musicTimer) return;
    let note = 0;
    const notes = [110, 164.81, 146.83, 130.81, 110, 196, 164.81, 130.81];
    this.musicTimer = window.setInterval(() => {
      const offsets: Record<string, number> = {
        desert: 1,
        frozen: 1.5,
        volcanic: 0.5,
        jungle: 1.25,
        alien: 1.33,
        industrial: 0.75,
        canyon: 0.9,
        islands: 1.66,
        toxic: 0.66,
        neon: 2,
      };
      this.tone(notes[note++ % notes.length] * (offsets[this.map] ?? 1), 1.8, 'sine', 0.035);
    }, 1600);
  }
}
export const sound = new Sound();
