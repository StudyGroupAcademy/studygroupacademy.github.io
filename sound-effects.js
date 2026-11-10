const STORAGE_KEY = "studygroup:sound-effects";
let enabled = true;
let audioContext;
try { enabled = localStorage.getItem(STORAGE_KEY) !== "off"; } catch {}

const patterns = {
  click: [[520, 0.035, 0.018]],
  success: [[660, 0.07, 0.025], [880, 0.11, 0.02]],
  flip: [[430, 0.045, 0.014]],
  xp: [[660, 0.06, 0.02], [784, 0.07, 0.02], [988, 0.12, 0.018]],
  level: [[523, 0.09, 0.025], [659, 0.09, 0.025], [784, 0.1, 0.025], [1047, 0.18, 0.02]],
  notification: [[740, 0.09, 0.018]]
};

export function setSoundsEnabled(value) {
  enabled = Boolean(value);
  try { localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off"); } catch {}
  document.documentElement.dataset.soundEffects = enabled ? "on" : "off";
  document.querySelectorAll("[data-sound-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "Sound on" : "Sound off";
  });
}

export function areSoundsEnabled() { return enabled; }

export function playSound(name) {
  if (!enabled || !patterns[name]) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ||= new AudioContextClass();
    if (audioContext.state === "suspended") void audioContext.resume();
    let start = audioContext.currentTime;
    for (const [frequency, duration, volume] of patterns[name]) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.015);
      start += duration * 0.72;
    }
  } catch (error) { console.debug("Sound effects are unavailable in this browser.", error); }
}

setSoundsEnabled(enabled);
document.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-sound-toggle]");
  if (toggle) setSoundsEnabled(!enabled);
  else if (event.target.closest("button, [role='button']")) playSound("click");
});
