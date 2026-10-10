/* Admin panel helpers: image compression and upload, image picker, gallery editor. */

interface UploadedImage {
  id: string;
  thumb: string | null;
  alt: string;
  name: string;
}

const TARGET_WIDTHS = [480, 960, 1600];
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

/* ---------- Image compression in the browser ---------- */

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

function hasTransparency(bitmap: ImageBitmap): boolean {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 255) < 250) return true;
  }
  return false;
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality);
  });
}

const FORMAT_TYPES: Record<string, [string, number]> = {
  avif: ['image/avif', 0.6],
  webp: ['image/webp', 0.82],
  jpg: ['image/jpeg', 0.85],
  png: ['image/png', 1],
};

interface Variant {
  width: number;
  format: string;
  blob: Blob;
}

async function compressImage(file: File): Promise<{ width: number; height: number; variants: Variant[] }> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('This image is over 30 MB. Please export a smaller version.');
  const bitmap = await loadBitmap(file);
  const { width: w0, height: h0 } = bitmap;
  if (w0 < 1 || h0 < 1) throw new Error('This image could not be read.');

  const widths = [...new Set([...TARGET_WIDTHS.filter((w) => w < w0), Math.min(w0, 1600)])].sort((a, b) => a - b);
  const alpha = file.type !== 'image/jpeg' && hasTransparency(bitmap);
  const fallback = alpha ? 'png' : 'jpg';

  const variants: Variant[] = [];
  let formats: string[] | null = null;
  for (const width of widths) {
    const height = Math.max(1, Math.round((h0 * width) / w0));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process this image.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Work out once which formats this browser can make: AVIF and WebP, else JPEG or PNG.
    const wanted: string[] = formats ?? ['avif', 'webp', fallback];
    const made: string[] = [];
    for (const format of wanted) {
      if (!formats && format === fallback && made.includes('webp')) continue;
      const [type, quality] = FORMAT_TYPES[format] ?? ['image/webp', 0.82];
      const blob = await encode(canvas, type, quality);
      if (blob) {
        variants.push({ width, format, blob });
        made.push(format);
      }
    }
    formats ??= made;
    if (made.length === 0) throw new Error('Your browser could not compress this image.');
  }
  bitmap.close();
  return { width: w0, height: h0, variants };
}

async function uploadImage(file: File, status: HTMLElement | null): Promise<UploadedImage> {
  const say = (message: string, error = false) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };
  say(`Compressing ${file.name}...`);
  const { width, height, variants } = await compressImage(file);
  const total = variants.reduce((sum, v) => sum + v.blob.size, 0);
  say(`Uploading ${file.name} (${Math.max(1, Math.round(total / 1024))} KB)...`);

  const body = new FormData();
  body.append('meta', JSON.stringify({ width, height, name: file.name }));
  for (const v of variants) body.append(`v-${v.width}-${v.format}`, v.blob, `${v.width}.${v.format}`);
  const res = await fetch('/api/admin/media', { method: 'POST', body, headers: { Accept: 'application/json' } });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; media?: UploadedImage };
  if (!res.ok || !data.ok || !data.media) throw new Error(data.message ?? 'Upload failed. Please try again.');
  say(`Uploaded ${file.name}.`);
  return data.media;
}

/* ---------- Image picker dialog ---------- */

const picker = document.getElementById('media-picker') as HTMLDialogElement | null;
let pickerCallback: ((image: UploadedImage) => void) | null = null;
let pickerReturnFocus: HTMLElement | null = null;

async function openPicker(onPick: (image: UploadedImage) => void, opener: HTMLElement): Promise<void> {
  if (!picker) return;
  pickerCallback = onPick;
  pickerReturnFocus = opener;
  const grid = picker.querySelector<HTMLElement>('[data-picker-grid]');
  const status = picker.querySelector<HTMLElement>('[data-picker-status]');
  picker.showModal();
  if (!grid || !status) return;
  status.hidden = false;
  status.textContent = 'Loading your images...';
  grid.replaceChildren();
  try {
    const res = await fetch('/api/admin/media', { headers: { Accept: 'application/json' } });
    const data = (await res.json()) as { images: UploadedImage[] };
    if (data.images.length === 0) {
      status.textContent = 'No images yet. Use "Upload new" instead.';
      return;
    }
    status.hidden = true;
    for (const image of data.images) {
      const li = document.createElement('li');
      li.className = 'media-card';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick';
      button.setAttribute('aria-label', `Choose ${image.name || image.alt || 'image'}`);
      const preview = document.createElement('div');
      preview.className = 'image-preview';
      if (image.thumb) {
        const img = document.createElement('img');
        img.src = image.thumb;
        img.alt = '';
        img.loading = 'lazy';
        preview.appendChild(img);
      }
      button.appendChild(preview);
      button.addEventListener('click', () => {
        pickerCallback?.(image);
        picker.close();
      });
      const label = document.createElement('p');
      label.className = 'item-meta';
      label.textContent = image.name || image.alt || image.id;
      li.appendChild(button);
      li.appendChild(label);
      grid.appendChild(li);
    }
  } catch {
    status.textContent = 'Could not load images. Please try again.';
  }
}

picker?.querySelector('[data-picker-close]')?.addEventListener('click', () => picker.close());
picker?.addEventListener('close', () => {
  pickerCallback = null;
  pickerReturnFocus?.focus();
});

/* ---------- Single image fields ---------- */

function setPreview(container: HTMLElement | null, image: UploadedImage | null, alt = 'Current image'): void {
  if (!container) return;
  container.replaceChildren();
  if (image?.thumb) {
    const img = document.createElement('img');
    img.src = image.thumb;
    img.alt = alt;
    container.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.textContent = image ? 'Image selected' : 'No image yet';
    container.appendChild(span);
  }
}

document.querySelectorAll<HTMLElement>('[data-image-field]').forEach((field) => {
  const input = field.querySelector<HTMLInputElement>('[data-image-input]');
  const preview = field.querySelector<HTMLElement>('[data-image-preview]');
  const status = field.querySelector<HTMLElement>('[data-upload-status]');
  const remove = field.querySelector<HTMLButtonElement>('[data-image-remove]');
  const choose = (image: UploadedImage | null) => {
    if (input) input.value = image?.id ?? '';
    setPreview(preview, image);
    if (remove) remove.hidden = !image;
    if (status && !image) status.textContent = 'Image removed. Save to apply.';
  };

  field.querySelector<HTMLInputElement>('[data-image-upload]')?.addEventListener('change', async (event) => {
    const fileInput = event.currentTarget as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      choose(await uploadImage(file, status));
      if (status) status.textContent = 'Uploaded. Remember to save.';
    } catch (error) {
      if (status) {
        status.textContent = error instanceof Error ? error.message : 'Upload failed.';
        status.classList.add('is-error');
      }
    } finally {
      fileInput.value = '';
    }
  });
  field.querySelector<HTMLButtonElement>('[data-image-library]')?.addEventListener('click', (event) => {
    void openPicker((image) => {
      choose(image);
      if (status) status.textContent = 'Image chosen. Remember to save.';
    }, event.currentTarget as HTMLElement);
  });
  remove?.addEventListener('click', () => choose(null));
});

/* ---------- Project gallery editor ---------- */

document.querySelectorAll<HTMLElement>('[data-gallery]').forEach((gallery) => {
  const list = gallery.querySelector<HTMLOListElement>('[data-gallery-list]');
  const template = gallery.querySelector<HTMLTemplateElement>('[data-gallery-template]');
  const status = gallery.querySelector<HTMLElement>('[data-upload-status]');
  const empty = gallery.querySelector<HTMLElement>('[data-gallery-empty]');
  if (!list || !template) return;

  const refresh = () => {
    const rows = [...list.children];
    rows.forEach((row, i) => {
      const up = row.querySelector<HTMLButtonElement>('[data-move="up"]');
      const down = row.querySelector<HTMLButtonElement>('[data-move="down"]');
      if (up) up.disabled = i === 0;
      if (down) down.disabled = i === rows.length - 1;
      const caption = row.querySelector<HTMLInputElement>('input[name="gallery_caption"]');
      const label = row.querySelector('label');
      const id = `gallery-caption-${i}`;
      if (caption) caption.id = id;
      if (label) label.htmlFor = id;
    });
    if (empty) empty.hidden = rows.length > 0;
  };

  const addRow = (image: UploadedImage) => {
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const row = fragment.querySelector('li');
    if (!row) return;
    const idInput = row.querySelector<HTMLInputElement>('input[name="gallery_media"]');
    if (idInput) idInput.value = image.id;
    setPreview(row.querySelector('[data-image-preview]'), image, '');
    list.appendChild(row);
    refresh();
  };

  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    const row = button?.closest('li');
    if (!button || !row) return;
    if (button.dataset['move'] === 'up' && row.previousElementSibling) {
      list.insertBefore(row, row.previousElementSibling);
      button.focus();
    } else if (button.dataset['move'] === 'down' && row.nextElementSibling) {
      list.insertBefore(row.nextElementSibling, row);
      button.focus();
    } else if (button.hasAttribute('data-remove')) {
      const next = row.nextElementSibling ?? row.previousElementSibling;
      row.remove();
      next?.querySelector<HTMLButtonElement>('[data-remove]')?.focus();
    }
    refresh();
  });

  gallery.querySelector<HTMLInputElement>('[data-gallery-upload]')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    for (const file of files) {
      try {
        addRow(await uploadImage(file, status));
      } catch (error) {
        if (status) {
          status.textContent = error instanceof Error ? error.message : 'Upload failed.';
          status.classList.add('is-error');
        }
      }
    }
    if (status && files.length > 0 && !status.classList.contains('is-error')) {
      status.textContent = `${files.length} image${files.length > 1 ? 's' : ''} added. Remember to save.`;
    }
    input.value = '';
  });
  gallery.querySelector<HTMLButtonElement>('[data-gallery-library]')?.addEventListener('click', (event) => {
    void openPicker((image) => addRow(image), event.currentTarget as HTMLElement);
  });
  refresh();
});

/* ---------- Media library upload ---------- */

document.querySelectorAll<HTMLInputElement>('[data-library-upload]').forEach((input) => {
  const status = document.querySelector<HTMLElement>('[data-library-status]');
  input.addEventListener('change', async () => {
    const files = [...(input.files ?? [])];
    let done = 0;
    for (const file of files) {
      try {
        await uploadImage(file, status);
        done++;
      } catch (error) {
        if (status) {
          status.textContent = `${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`;
          status.classList.add('is-error');
        }
      }
    }
    input.value = '';
    if (done > 0) location.assign('/admin/media?msg=uploaded');
  });
});

/* ---------- PDF upload (CV) ---------- */

document.querySelectorAll<HTMLElement>('[data-file-field]').forEach((field) => {
  const input = field.querySelector<HTMLInputElement>('[data-file-input]');
  const upload = field.querySelector<HTMLInputElement>('[data-file-upload]');
  const status = field.querySelector<HTMLElement>('[data-upload-status]');
  const current = field.querySelector<HTMLElement>('[data-file-current]');
  const remove = field.querySelector<HTMLButtonElement>('[data-file-remove]');
  upload?.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file || !status) return;
    status.classList.remove('is-error');
    status.textContent = `Uploading ${file.name}...`;
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/admin/files', { method: 'POST', body, headers: { Accept: 'application/json' } });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; id?: string; name?: string };
      if (!res.ok || !data.ok || !data.id) throw new Error(data.message ?? 'Upload failed.');
      if (input) input.value = data.id;
      if (current) current.textContent = data.name ?? file.name;
      if (remove) remove.hidden = false;
      status.textContent = 'Uploaded. Remember to save.';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Upload failed.';
      status.classList.add('is-error');
    } finally {
      upload.value = '';
    }
  });
  remove?.addEventListener('click', () => {
    if (input) input.value = '';
    if (current) current.textContent = 'No file yet';
    remove.hidden = true;
    if (status) status.textContent = 'Removed. Save to apply.';
  });
});

/* ---------- Slug follows the title until edited ---------- */

const slugSource = document.querySelector<HTMLInputElement>('[data-slug-source]');
const slugTarget = document.querySelector<HTMLInputElement>('[data-slug-target]');
if (slugSource && slugTarget) {
  let touched = slugTarget.value !== '';
  slugTarget.addEventListener('input', () => (touched = true));
  slugSource.addEventListener('input', () => {
    if (touched) return;
    slugTarget.value = slugSource.value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  });
}

export {};
