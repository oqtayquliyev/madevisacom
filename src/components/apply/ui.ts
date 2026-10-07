// Button and field styles shared by the Auto Apply screens — the same shapes the rest of MadeVisa uses.

export const BTN = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold text-ink-800 ring-1 ring-ink-200 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400',
  small: 'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-ink-400 disabled:ring-ink-200',
  link: 'inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline',
};

export const FIELD = 'w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-[14px] text-ink-950 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
