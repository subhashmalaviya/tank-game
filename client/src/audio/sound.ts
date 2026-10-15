export class Sound {
  private context?: AudioContext;
  private musicTimer?: number;
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
    this.musicTimer = window.setInterval(
      () => this.tone(notes[note++ % notes.length], 1.8, 'sine', 0.035),
      1600,
    );
  }
}
export const sound = new Sound();
