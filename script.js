// Countdown to WM 2026 start
(function () {
  const target = new Date('2026-06-11T00:00:00');
  const el = document.getElementById('days');
  if (!el) return;

  function update() {
    const diff = target - Date.now();
    if (diff <= 0) { el.textContent = '0'; return; }
    el.textContent = Math.floor(diff / 86400000);
  }

  update();
  setInterval(update, 60000);
})();

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
