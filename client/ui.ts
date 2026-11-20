// Small things on every page: the taskbar clock, "Copy link" buttons, closing the Start menu.

const clock = document.querySelector<HTMLElement>('.clock');
const tick = () => {
  if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
tick();
setInterval(tick, 20_000);

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const copy = t.closest<HTMLElement>('[data-copy]');
  if (copy) {
    const text = copy.dataset.copy ?? location.href;
    navigator.clipboard?.writeText(text).then(() => {
      const before = copy.textContent;
      copy.textContent = 'Copied!';
      setTimeout(() => (copy.textContent = before), 1500);
    });
  }
  const start = document.querySelector<HTMLDetailsElement>('details.start');
  if (start?.open && !t.closest('details.start')) start.open = false;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const start = document.querySelector<HTMLDetailsElement>('details.start');
    if (start?.open) {
      start.open = false;
      start.querySelector('summary')?.focus();
    }
  }
});
