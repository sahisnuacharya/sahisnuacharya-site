export type Currency = 'NPR' | 'USD';

export function formatNpr(value: number): string {
  // Nepali style grouping, for example NPR 1,50,000
  return `NPR ${Math.round(value).toLocaleString('en-IN')}`;
}

export function formatUsd(value: number): string {
  return `US$${Math.round(value).toLocaleString('en-US')}`;
}

/** Formats a YYYY-MM-DD date as "31 Oct 2026". */
export function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function whatsappLink(number: string, text = ''): string {
  const digits = number.replace(/\D/g, '');
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

/** Splits admin text into paragraphs on blank lines. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
