/* Small progressive enhancements. Every feature also works without JavaScript. */

const root = document.documentElement;
const ONE_YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${value}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
}

/* Theme toggle */
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function effectiveTheme(): 'light' | 'dark' {
  const chosen = root.dataset['theme'];
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return darkQuery.matches ? 'dark' : 'light';
}
document.querySelectorAll<HTMLFormElement>('form[data-theme-form]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    root.dataset['theme'] = next;
    setCookie('theme', next);
  });
});

/* Currency switch */
function syncCurrencyButtons(): void {
  const current = root.dataset['currency'];
  document.querySelectorAll<HTMLButtonElement>('button[name="currency"]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.value === current));
  });
}
document.querySelectorAll<HTMLFormElement>('form[data-currency-form]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    const value = submitter?.value;
    if (value !== 'NPR' && value !== 'USD') return;
    root.dataset['currency'] = value;
    setCookie('currency', value);
    syncCurrencyButtons();
  });
});

/* Mobile menu */
const menuButton = document.querySelector<HTMLButtonElement>('[data-menu-button]');
const nav = document.getElementById('main-nav');
if (menuButton && nav) {
  const close = () => {
    nav.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
  };
  menuButton.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) nav.querySelector('a')?.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      close();
      menuButton.focus();
    }
  });
}
