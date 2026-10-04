/* Sends the contact form without a page reload and shows errors next to each field. */

const form = document.querySelector<HTMLFormElement>('form[data-contact-form]');
const statusBox = document.querySelector<HTMLElement>('[data-form-status]');
const MAX_BYTES = 10 * 1024 * 1024;

type Errors = Record<string, string>;

function showErrors(target: HTMLFormElement, errors: Errors): void {
  target.querySelectorAll<HTMLElement>('[data-error-for]').forEach((el) => {
    const field = el.dataset['errorFor'] ?? '';
    const message = errors[field];
    el.textContent = message ?? '';
    el.hidden = !message;
    const input = target.querySelector<HTMLElement>(`[name="${field}"]`);
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  });
  const first = Object.keys(errors)[0];
  if (first) target.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
}

function showStatus(message: string, ok: boolean): void {
  if (!statusBox) return;
  const p = document.createElement('p');
  p.className = `notice ${ok ? 'is-success' : 'is-error'}`;
  p.setAttribute('role', ok ? 'status' : 'alert');
  p.textContent = message;
  statusBox.replaceChildren(p);
}

function checkLocally(target: HTMLFormElement): Errors {
  const errors: Errors = {};
  const data = new FormData(target);
  const name = String(data.get('name') ?? '').trim();
  const email = String(data.get('email') ?? '').trim();
  const message = String(data.get('message') ?? '').trim();
  if (name.length < 2) errors['name'] = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors['email'] = 'Please enter a valid email address, like name@example.com.';
  if (message.length < 10)
    errors['message'] = 'Please tell me a little more, at least 10 characters.';
  const file = data.get('attachment');
  if (file instanceof File && file.size > MAX_BYTES)
    errors['attachment'] = 'Please attach a file under 10 MB.';
  return errors;
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const local = checkLocally(form);
    if (Object.keys(local).length > 0) {
      showErrors(form, local);
      return;
    }
    showErrors(form, {});
    const button = form.querySelector<HTMLButtonElement>('[data-submit]');
    const label = button?.textContent ?? 'Send message';
    if (button) {
      button.disabled = true;
      button.textContent = 'Sending...';
    }
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      const data = (await res.json()) as { ok: boolean; message: string; errors?: Errors };
      if (data.ok) {
        form.reset();
        showStatus(data.message, true);
        statusBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        if (data.errors) showErrors(form, data.errors);
        showStatus(data.message, false);
      }
    } catch {
      showStatus('Could not send right now. Please check your connection and try again.', false);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = label;
      }
      const w = window as unknown as { turnstile?: { reset(): void } };
      w.turnstile?.reset();
    }
  });
}

export {};
