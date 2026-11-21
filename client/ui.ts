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

// The free-book corner box: appears after a few seconds, never on top of a form the
// visitor is using, and stays away for a week once closed (a month after a download).
const pop = document.getElementById('book-pop');
const POP_KEY = 'mv:book-pop';
const hiddenUntil = () => {
  try {
    return Number(localStorage.getItem(POP_KEY) || 0);
  } catch {
    return 0;
  }
};
const hideFor = (days: number) => {
  try {
    localStorage.setItem(POP_KEY, String(Date.now() + days * 86_400_000));
  } catch {
    /* private mode */
  }
};
if (pop && Date.now() > hiddenUntil()) {
  setTimeout(() => {
    pop.hidden = false;
    requestAnimationFrame(() => pop.classList.add('in'));
  }, 7000);
  pop.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-pop-close]')) {
      pop.hidden = true;
      hideFor(7);
    } else if (t.closest('[data-pop-done]')) {
      hideFor(30);
      setTimeout(() => (pop.hidden = true), 300);
    }
  });
}
