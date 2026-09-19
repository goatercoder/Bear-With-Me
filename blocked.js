/* blocked.js — the page a blocked site is redirected to during a focus block. */
(async function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const state = await api.runtime.sendMessage({ type: 'get' });
  const pet = state.pet;
  const name = Core.petDisplayName(pet);
  document.getElementById('blockedTitle').textContent = `${name} says: back to work!`;
  const c = document.getElementById('blockedPet');
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(Sprites.render(Sprites.PETS[pet.avatar] || Sprites.PETS.osci, 8), 0, 0);
  const clock = document.getElementById('blockedClock');
  function tickClock() {
    const t = state.timer;
    const ms = Math.max(0, t.endsAt - Date.now());
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    clock.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left`;
    if (ms <= 0) {
      const from = new URLSearchParams(location.search).get('from');
      if (from && /^https?:/.test(from)) location.replace(from);
    }
  }
  tickClock(); setInterval(tickClock, 1000);
  document.getElementById('closeTab').addEventListener('click', () => window.close());
})();
