// Everything the worker does inside an employer's page: find the form, read
// its fields, fill them, press Submit, and read what came back.
//
// The scripts that run in the page are plain JavaScript strings (not
// compiled functions), so nothing the bundler adds can break them there.

import type { Frame, Page } from 'playwright-core';
import type { Action, LiveField } from './plan';

/** Reads every field of the main application form, and tags each with data-mv="<n>". */
const READ_FIELDS = String.raw`(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const text = (el) => el ? norm(el.innerText || el.textContent) : '';
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const shownOrStyled = (el) => shown(el) || (el.type === 'file') || (el.type === 'radio' || el.type === 'checkbox') && (shown(el.closest('label')) || shown(el.parentElement));
  const labelOf = (el) => {
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l && text(l)) return text(l);
    }
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = norm(by.split(/\s+/).map((id) => text(document.getElementById(id))).join(' '));
      if (t) return t;
    }
    const wrap = el.closest('label');
    if (wrap && !(el.type === 'radio')) {
      // The label's own words, without the text of the control inside it (a select's options).
      const c = wrap.cloneNode(true);
      c.querySelectorAll('select, textarea, input, option, button').forEach((x) => x.remove());
      if (text(c)) return text(c);
    }
    if (el.getAttribute('aria-label')) return norm(el.getAttribute('aria-label'));
    let p = el.parentElement;
    for (let i = 0; i < 6 && p; i += 1, p = p.parentElement) {
      const c = p.querySelector(':scope > label, :scope > legend, :scope > .application-label, :scope > .text, :scope > [class*="label" i], :scope > [class*="question" i], :scope > div > label, :scope > span > label');
      if (c && !c.contains(el) && text(c)) return text(c);
    }
    return norm(el.getAttribute('placeholder') || el.getAttribute('title') || '');
  };
  const optionText = (el) => {
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l && text(l)) return text(l);
    }
    const wrap = el.closest('label');
    if (wrap && text(wrap)) return text(wrap);
    const next = el.nextElementSibling || el.parentElement;
    return text(next) || norm(el.value);
  };
  const groupLabel = (el) => {
    const fs = el.closest('fieldset');
    if (fs) {
      const lg = fs.querySelector('legend');
      if (lg && text(lg)) return text(lg);
    }
    const rg = el.closest('[role="radiogroup"], [role="group"]');
    if (rg) {
      const by = rg.getAttribute('aria-labelledby');
      if (by) { const t = norm(by.split(/\s+/).map((id) => text(document.getElementById(id))).join(' ')); if (t) return t; }
      if (rg.getAttribute('aria-label')) return norm(rg.getAttribute('aria-label'));
    }
    let p = el.closest('label') ? el.closest('label').parentElement : el.parentElement;
    for (let i = 0; i < 6 && p; i += 1, p = p.parentElement) {
      const c = p.querySelector(':scope > label:not(:has(input)), :scope > legend, :scope > .application-label, :scope > [class*="label" i]:not(:has(input)), :scope > [class*="question" i]:not(:has(input)), :scope > div > label:not(:has(input)), :scope > p');
      if (c && text(c)) return text(c);
    }
    return '';
  };
  const isRequired = (el, label) => el.required || el.getAttribute('aria-required') === 'true' || /[*✱]\s*$|\(required\)\s*$/i.test(label || '') || !!(el.closest('[class*="required" i]') && !el.closest('form[class*="required" i]'));
  const cleanLabel = (s) => norm(s).replace(/\s*[*✱]\s*$/, '').replace(/\s*\(required\)\s*$/i, '');

  // The form: the one with the most fields (a page also has search boxes and newsletter sign-ups).
  const forms = Array.from(document.querySelectorAll('form'));
  const count = (root) => root.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select, [role=combobox]').length;
  const root = forms.length ? forms.sort((a, b) => count(b) - count(a))[0] : document.body;
  const out = [];
  let n = 0;
  const tag = (el) => { const r = String(n++); el.setAttribute('data-mv', r); return r; };
  const seenGroups = new Set();

  for (const el of Array.from(root.querySelectorAll('input, textarea, select, [role=combobox]'))) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (el.tagName === 'INPUT' && ['hidden', 'submit', 'button', 'reset', 'image', 'search', 'password'].includes(type)) continue;
    if (el.disabled || el.readOnly && el.tagName !== 'INPUT') continue;
    if (!shownOrStyled(el)) continue;
    if (el.closest('[aria-hidden="true"]') && type !== 'file') continue;
    // A combobox's own text box is read as the combobox.
    if (el.tagName === 'INPUT' && el.getAttribute('role') !== 'combobox' && el.closest('[role=combobox]')) continue;

    if (type === 'radio' || (type === 'checkbox' && el.name && root.querySelectorAll('input[type=checkbox][name="' + CSS.escape(el.name) + '"]').length > 1)) {
      const key = type + ':' + el.name;
      if (seenGroups.has(key)) continue;
      seenGroups.add(key);
      const items = Array.from(root.querySelectorAll('input[type=' + type + '][name="' + CSS.escape(el.name) + '"]')).filter(shownOrStyled);
      const label = groupLabel(el);
      out.push({
        ref: tag(el), kind: type === 'radio' ? 'radio' : 'multi', name: el.name, id: el.id || '',
        label: cleanLabel(label), required: items.some((i) => i.required) || isRequired(el, label),
        options: items.map(optionText), optionRefs: items.map(tag), filled: items.some((i) => i.checked),
      });
      continue;
    }
    const label = type === 'checkbox' ? optionText(el) || labelOf(el) : labelOf(el);
    const kind =
      el.getAttribute('role') === 'combobox' && el.tagName !== 'SELECT' ? 'combobox'
      : el.tagName === 'TEXTAREA' ? 'long'
      : el.tagName === 'SELECT' ? 'select'
      : type === 'file' ? 'file'
      : type === 'checkbox' ? 'checkbox'
      : type === 'email' ? 'email'
      : type === 'tel' ? 'tel'
      : type === 'number' ? 'number'
      : type === 'date' ? 'date'
      : 'text';
    const field = { ref: tag(el), kind, name: el.name || '', id: el.id || '', label: cleanLabel(label), required: isRequired(el, label) };
    if (kind === 'select') {
      const opts = Array.from(el.options).filter((o) => o.value !== '' && !/^(select|choose|please select|--)/i.test(norm(o.text)));
      field.options = opts.map((o) => norm(o.text));
      field.filled = el.selectedIndex > 0 && el.value !== '';
    } else if (kind === 'file') {
      field.accept = el.getAttribute('accept') || '';
      field.filled = el.files && el.files.length > 0;
    } else if (kind === 'checkbox') {
      field.filled = el.checked;
    } else {
      field.filled = !!(el.value && el.value.trim());
    }
    out.push(field);
  }

  // Yes / No buttons (some forms draw a question as two buttons).
  for (const box of Array.from(root.querySelectorAll('div, fieldset'))) {
    const btns = Array.from(box.querySelectorAll(':scope > button, :scope > div > button')).filter(shown);
    if (btns.length < 2 || btns.length > 6 || btns.some((b) => b.type === 'submit')) continue;
    const labels = btns.map(text);
    if (!labels.every((l) => l && l.length < 40)) continue;
    if (btns.some((b) => b.hasAttribute('data-mv'))) continue;
    const label = groupLabel(btns[0]);
    if (!label) continue;
    out.push({ ref: tag(box), kind: 'buttons', name: '', id: box.id || '', label: cleanLabel(label), required: isRequired(btns[0], label), options: labels, optionRefs: btns.map(tag) });
  }
  return out;
})()`;

/** The submit button of the main form: the one tagged data-mv-submit, or null. */
const FIND_SUBMIT = String.raw`(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const shown = (el) => { const st = getComputedStyle(el); const r = el.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 1 && r.height > 1; };
  const tagged = document.querySelector('[data-mv="0"]');
  const form = tagged ? tagged.closest('form') : null;
  const root = form || document.body;
  const cands = Array.from(root.querySelectorAll('button, input[type=submit], [role=button]')).filter(shown);
  const label = (b) => norm(b.innerText || b.value || b.getAttribute('aria-label'));
  const score = (b) => {
    const t = label(b).toLowerCase();
    if (/cancel|back|previous|save (for|as) draft|sign in|log in|upload|attach|remove|add another|linkedin|indeed/.test(t)) return -1;
    if (/^(submit|submit application|send application|apply|apply now|send|complete application|finish)$/.test(t)) return 3;
    if (/submit/.test(t)) return 2;
    if (b.type === 'submit' && /apply|send/.test(t)) return 2;
    if (b.type === 'submit') return 1;
    return 0;
  };
  const best = cands.map((b) => [score(b), b]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]);
  if (!best.length) return null;
  best[0][1].setAttribute('data-mv-submit', '1');
  return label(best[0][1]);
})()`;

/** What the page shows: a CAPTCHA to solve, a sign-in, validation errors. */
const READ_STATE = String.raw`(() => {
  const shown = (el) => { const st = getComputedStyle(el); const r = el.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0' && r.width > 30 && r.height > 30; };
  const frames = Array.from(document.querySelectorAll('iframe'));
  // A CAPTCHA the person has to solve: the reCAPTCHA checkbox or its picture challenge, hCaptcha, Turnstile, Arkose.
  // (The invisible reCAPTCHA badge is not a challenge.)
  const captcha = frames.some((f) => /recaptcha\/(api2|enterprise)\/(anchor|bframe)|hcaptcha\.com|challenges\.cloudflare\.com|arkoselabs|funcaptcha/i.test(f.src || '') && shown(f) && !/size=invisible/.test(f.src || ''))
    || !!document.querySelector('.g-recaptcha:not([data-size=invisible]) iframe, .h-captcha iframe, .cf-turnstile iframe');
  const password = Array.from(document.querySelectorAll('input[type=password]')).some(shown);
  // The form's own error messages; failing those, the names of the fields it marked invalid.
  const said = Array.from(document.querySelectorAll('.error:not(:empty), .field-error, .invalid-feedback, [class*="error-message" i], [role=alert]'))
    .filter((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.height > 0; })
    .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 200);
  const marked = Array.from(document.querySelectorAll('[aria-invalid="true"]')).map((e) => e.getAttribute('aria-label') || e.name || e.id || 'a field');
  const errors = (said.length ? said : marked).slice(0, 8);
  // Required boxes still empty after filling (the employer's own check would stop the form).
  // Anything the browser itself would refuse to send (an empty required box, a file not attached, an unticked required box).
  const missing = Array.from(document.querySelectorAll('[data-mv]'))
    .filter((el) => el.matches('input, textarea, select') && el.willValidate && !el.validity.valid)
    .map((el) => el.getAttribute('data-mv'));
  return { captcha, password, errors, missing, text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 20000) };
})()`;

/** Links or buttons that open the application form on a job page. */
const FIND_APPLY = String.raw`(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const shown = (el) => { const st = getComputedStyle(el); const r = el.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 1 && r.height > 1; };
  const cands = Array.from(document.querySelectorAll('a, button, [role=button]')).filter(shown);
  const hit = cands.find((b) => /^(apply|apply now|apply for this (job|position|role)|apply online|start (your )?application|i(’|')?m interested)$/i.test(norm(b.innerText || b.getAttribute('aria-label'))));
  if (!hit) return null;
  hit.setAttribute('data-mv-apply', '1');
  return hit.tagName === 'A' ? hit.href || '' : '';
})()`;

/** An embedded hiring-system form (a careers page that shows Greenhouse, Lever or Ashby in a frame). */
const FIND_EMBED = String.raw`(() => {
  const f = Array.from(document.querySelectorAll('iframe')).find((x) => /greenhouse\.io\/embed\/job_app|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|smartrecruiters/i.test(x.src || ''));
  return f ? f.src : null;
})()`;

export type PageState = { captcha: boolean; password: boolean; errors: string[]; missing: string[]; text: string };

export const readFields = (p: Page | Frame) => p.evaluate(READ_FIELDS) as Promise<LiveField[]>;
export const readState = (p: Page | Frame) => p.evaluate(READ_STATE) as Promise<PageState>;
export const findSubmit = (p: Page | Frame) => p.evaluate(FIND_SUBMIT) as Promise<string | null>;
export const findApply = (p: Page | Frame) => p.evaluate(FIND_APPLY) as Promise<string | null>;
export const findEmbed = (p: Page | Frame) => p.evaluate(FIND_EMBED) as Promise<string | null>;

const sel = (ref: string) => `[data-mv="${ref}"]`;

/** Do one planned action. Throws when the page refuses it; the caller decides what that means. */
export async function act(p: Page | Frame, a: Action, files: { cv: string; cover_letter: string | null }): Promise<void> {
  const loc = p.locator(sel(a.ref)).first();
  switch (a.do) {
    case 'type':
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.fill(a.value, { timeout: 8000 });
      // Address fields that suggest places as you type: take the first suggestion that contains what was typed.
      await pickSuggestion(p, a.value).catch(() => {});
      return;
    case 'select':
      await loc.selectOption({ label: a.value }, { timeout: 8000 });
      return;
    case 'check':
      if (a.on) await loc.check({ timeout: 8000, force: true });
      else await loc.uncheck({ timeout: 8000, force: true });
      return;
    case 'click': {
      const isInput = await loc.evaluate((el) => el.tagName === 'INPUT').catch(() => false);
      if (isInput) await loc.check({ timeout: 8000, force: true });
      else await loc.click({ timeout: 8000 });
      return;
    }
    case 'combo': {
      await loc.click({ timeout: 8000 });
      const box = (await loc.evaluate((el) => el.tagName === 'INPUT').catch(() => false)) ? loc : loc.locator('input').first();
      await box.fill(a.value, { timeout: 8000 });
      const opt = p.locator('[role=option]').filter({ hasText: new RegExp(`^\\s*${a.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }).first();
      await opt.click({ timeout: 6000 });
      return;
    }
    case 'file': {
      const path = a.file === 'cv' ? files.cv : files.cover_letter;
      if (!path) throw new Error('no file');
      await loc.setInputFiles(path, { timeout: 15000 });
      return;
    }
  }
}

async function pickSuggestion(p: Page | Frame, typed: string): Promise<void> {
  const list = p.locator('[role=listbox] [role=option], .pac-container .pac-item');
  await list.first().waitFor({ state: 'visible', timeout: 1200 });
  const first = typed.split(',')[0].trim();
  const hit = list.filter({ hasText: new RegExp(first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
  await hit.click({ timeout: 2000 });
}

export async function clickSubmit(p: Page | Frame): Promise<void> {
  await p.locator('[data-mv-submit="1"]').first().click({ timeout: 10000 });
}
export async function clickApply(p: Page | Frame): Promise<void> {
  await p.locator('[data-mv-apply="1"]').first().click({ timeout: 10000 });
}
