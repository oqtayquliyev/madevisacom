// Small things on every page: "Copy link" buttons.

document.addEventListener('click', (e) => {
  const copy = (e.target as HTMLElement).closest<HTMLElement>('[data-copy]');
  if (!copy) return;
  const text = copy.dataset.copy ?? location.href;
  navigator.clipboard?.writeText(text).then(() => {
    const before = copy.textContent;
    copy.textContent = 'Copied!';
    setTimeout(() => (copy.textContent = before), 1500);
  });
});
