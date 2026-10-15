/* Background music: one looping track with a mute toggle. Playback only starts from
   startRun() (game.js), since that's always reached through a real key press — browsers
   block audio.play() before any user gesture, so we never try earlier than that. */
(function () {
  'use strict';
  const WS = window.WS;
  const MUTE_KEY = 'warsaw-streets.muted';

  function readMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeMuted(muted) {
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      return;
    }
  }

  const music = new Audio('assets/audio/theme.m4a');
  music.loop = true;
  music.volume = 0.5;
  music.muted = readMuted();

  WS.Audio = {
    start() {
      music.play().catch(() => {});
    },
    toggleMute() {
      music.muted = !music.muted;
      writeMuted(music.muted);
      return music.muted;
    },
    isMuted() {
      return music.muted;
    },
  };

  const btn = document.getElementById('mute-btn');
  if (btn) {
    const paint = () => {
      const muted = WS.Audio.isMuted();
      btn.setAttribute('aria-label', (muted ? 'Unmute' : 'Mute') + ' music (M)');
      btn.setAttribute('aria-pressed', String(muted));
    };
    const toggle = () => {
      WS.Audio.toggleMute();
      paint();
    };
    btn.addEventListener('click', toggle);
    // Independent of WS.Input: mute works from any scene, not just 'play'.
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyM' && !e.repeat) toggle();
    });
    paint();
  }
})();
