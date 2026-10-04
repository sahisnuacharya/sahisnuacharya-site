import type { Settings } from './content';

export function personJsonLd(settings: Settings, site: URL): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: settings.name,
    jobTitle: settings.role,
    url: site.toString(),
    email: settings.email ? `mailto:${settings.email}` : undefined,
    address: { '@type': 'PostalAddress', addressLocality: 'Lalitpur', addressCountry: 'NP' },
    sameAs: settings.socials.map((s) => s.url),
    knowsAbout: ['Graphic design', 'Brand identity', 'Social media design', 'Poster design'],
  };
}
