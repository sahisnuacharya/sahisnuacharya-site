/**
 * Database migrations. They run automatically the first time the site handles a
 * request after a deploy, so nothing has to be run by hand in a terminal.
 *
 * Rules for adding a migration later:
 * - Append a new entry with the next version number. Never edit an old one.
 * - Keep every statement safe to run twice (IF NOT EXISTS, INSERT OR IGNORE).
 */

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

const schema: string[] = [
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'file')),
    original_name TEXT NOT NULL DEFAULT '',
    mime TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    widths TEXT NOT NULL DEFAULT '[]',
    formats TEXT NOT NULL DEFAULT '[]',
    bytes INTEGER NOT NULL DEFAULT 0,
    alt TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    client TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    year INTEGER,
    cover_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
    cover_word TEXT NOT NULL DEFAULT '',
    tint TEXT NOT NULL DEFAULT 'blue',
    featured INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_status_sort ON projects (status, sort)`,
  `CREATE TABLE IF NOT EXISTS project_images (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    caption TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_project_images_project ON project_images (project_id, sort)`,
  `CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    includes TEXT NOT NULL DEFAULT '[]',
    delivery TEXT NOT NULL DEFAULT '',
    price_npr INTEGER,
    price_usd INTEGER,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
    sort INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
    discount_type TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none', 'percent', 'fixed')),
    discount_value INTEGER NOT NULL DEFAULT 0,
    price_npr INTEGER,
    price_usd INTEGER,
    starts_at TEXT,
    ends_at TEXT,
    media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
    show_on_home INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS experience (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'work' CHECK (kind IN ('work', 'education')),
    title TEXT NOT NULL,
    organization TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT '',
    budget TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    attachment_key TEXT,
    attachment_name TEXT,
    attachment_type TEXT,
    attachment_size INTEGER,
    ip_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_ip ON messages (ip_hash, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_status ON messages (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  )`,
];

const seed: string[] = [
  `INSERT OR IGNORE INTO categories (id, slug, name, sort) VALUES
    (1, 'branding', 'Branding', 1),
    (2, 'social-media', 'Social media', 2),
    (3, 'posters-and-print', 'Posters and print', 3),
    (4, 'youtube-thumbnails', 'YouTube thumbnails', 4)`,

  `INSERT OR IGNORE INTO projects
    (id, slug, title, summary, body, category_id, client, role, cover_word, tint, featured, status, sort) VALUES
    (1, 'brewfee-cafe-brand-identity', 'BrewFee Cafe brand identity', 'Brand identity for a cafe',
     'A warm, friendly identity for BrewFee Cafe: logo, colors and the pieces a cafe uses every day.',
     1, 'BrewFee Cafe', 'Brand identity', 'BrewFee', 'sand', 1, 'published', 1),
    (2, 'huawei-digital-marketing', 'HUAWEI digital marketing designs', 'Campaign creatives, designed at Call Mobility',
     'Launch and campaign creatives for HUAWEI in Nepal, designed while working at Call Mobility, the sole distributor of HUAWEI in Nepal.',
     2, 'HUAWEI Nepal', 'Marketing graphic designer', 'HUAWEI', 'red', 1, 'published', 2),
    (3, 'traditional-pickle-brand-identity', 'Traditional pickle brand identity', 'Brand identity for a traditional pickle brand',
     'Identity and packaging direction for a homemade traditional pickle brand.',
     1, '', 'Brand identity', 'Pickle', 'butter', 1, 'published', 3),
    (4, 'honor-digital-marketing', 'HONOR digital marketing designs', 'Campaign creatives, designed at Celltron Nepal',
     'Campaign and social creatives for HONOR in Nepal, designed while working at Celltron Nepal, the sole distributor of HONOR in Nepal.',
     2, 'HONOR Nepal', 'Marketing graphic designer', 'HONOR', 'blue', 1, 'published', 4),
    (5, 'indrive-whatsapp-promos', 'inDrive WhatsApp promos', 'Promotional creatives for WhatsApp',
     'Promotional creatives for inDrive, made for sharing on WhatsApp.',
     2, 'inDrive', 'Social media design', 'inDrive', 'lime', 1, 'published', 5),
    (6, 'event-and-aesthetics-posters', 'Event and aesthetics posters', 'A series of event and aesthetic posters',
     'A series of posters for events, plus personal aesthetic studies.',
     3, '', 'Poster design', 'Posters', 'lilac', 1, 'published', 6),
    (7, 'gym-concept-creatives', 'Gym concept creatives', 'Concept social creatives for a gym',
     'Concept social media creatives for a fitness brand.',
     2, '', 'Social media design', 'Gym', 'slate', 0, 'published', 7),
    (8, 'trip-to-vietnam-creative', 'Trip to Vietnam creative', 'Social creative for a Vietnam trip',
     'Social creative promoting a travel package to Vietnam.',
     2, '', 'Social media design', 'Vietnam', 'teal', 0, 'published', 8),
    (9, 'web3-carousel', 'Web3 carousel', 'Carousel post for a Web3 brand',
     'An explainer carousel post for a Web3 brand.',
     2, '', 'Social media design', 'Web3', 'indigo', 0, 'published', 9),
    (10, 'room-aesthetics-poster', 'Room aesthetics poster', 'Poster design on room aesthetics',
     'A poster study on room aesthetics.',
     3, '', 'Poster design', 'Room', 'pink', 0, 'published', 10),
    (11, 'youtube-banners-and-thumbnails', 'YouTube banners and thumbnails', 'Channel banners and video thumbnails',
     'Channel banners and video thumbnails built to be read at a glance.',
     4, '', 'Thumbnail design', 'YouTube', 'peach', 0, 'published', 11),
    (12, 'hair-transplant-social-post', 'Hair transplant social post', 'Social post for a hair transplant clinic',
     'A social media post for a hair transplant clinic.',
     2, '', 'Social media design', 'Hair', 'mint', 0, 'published', 12)`,

  `INSERT OR IGNORE INTO services
    (id, slug, name, summary, includes, delivery, price_npr, price_usd, status, sort) VALUES
    (1, 'branding-and-identity', 'Branding and identity', 'Logos, colors and a visual identity that holds together',
     '["Logo and logo variations","Color palette and type","Brand guide PDF","Social media kit"]', '', NULL, NULL, 'published', 1),
    (2, 'logo-design', 'Logo design', 'Modern logos for new and growing brands',
     '["Two to three concepts","Revisions on the chosen concept","Files for print and web"]', '', NULL, 75, 'published', 2),
    (3, 'social-media-design', 'Social media design', 'Social media graphics and campaign creatives',
     '["Posts, stories and carousels","Sized for each platform","Editable source files on request"]', '', NULL, 45, 'published', 3),
    (4, 'posters-and-print', 'Posters and print', 'Posters, flyers and marketing visuals for print and digital',
     '["Print ready files","Digital versions for sharing"]', '', NULL, NULL, 'published', 4),
    (5, 'youtube-banners-and-thumbnails', 'YouTube banners and thumbnails', 'Channel banners and video thumbnails',
     '["Thumbnails that read at small sizes","Channel banner for every device"]', '', NULL, NULL, 'published', 5)`,

  `INSERT OR IGNORE INTO experience (id, kind, title, organization, location, period, sort) VALUES
    (1, 'work', 'Graphic Designer', 'Dragon Insurance Services', 'Pennsylvania, United States (remote)', 'Aug 2026 to present', 1),
    (2, 'work', 'Freelance Graphic Designer', 'Self employed', 'Worldwide', 'Jul 2022 to present', 2),
    (3, 'work', 'Graphic Designer', 'Call Mobility (HUAWEI Nepal)', 'Kathmandu', 'Jun 2025 to Mar 2026', 3),
    (4, 'work', 'Marketing Graphic Designer', 'Celltron Nepal (HONOR Nepal)', 'Kathmandu', 'Jun 2025 to Mar 2026', 4),
    (5, 'work', 'Graphic Designer', 'XIRCLS', 'India (remote)', 'Jan 2025 to May 2025', 5),
    (6, 'work', 'Graphic Designer', 'Skal', 'Lalitpur', 'Jun 2024 to Jun 2025', 6),
    (7, 'work', 'Designer', 'DAP Designs', 'Nepal', 'Mar 2022 to Sep 2023', 7),
    (8, 'education', 'Bachelor in Information Technology', 'IOST, Tribhuvan University', 'Nepal', '2023 to 2027', 8),
    (9, 'education', 'UI/UX Design Diploma', 'Diploma course', '', '', 9)`,

  `INSERT OR IGNORE INTO settings (key, value) VALUES
    ('name', 'Sahisnu Acharya'),
    ('first_name', 'Sahisnu'),
    ('last_name', 'Acharya'),
    ('role', 'Visual designer'),
    ('hero_intro', 'Visual designer for brands, campaigns and social media. Based in Lalitpur, Nepal, working with clients everywhere.'),
    ('available', '1'),
    ('available_text', 'Available for freelance'),
    ('booked_text', 'Booked for now'),
    ('about_title', 'Four years of brand and campaign work'),
    ('about_short', 'Since 2022 I have freelanced for my own clients and designed for teams including DAP Designs, Skal and XIRCLS. I worked on HUAWEI and HONOR campaigns through their Nepal distributors, and I now design for Dragon Insurance Services in the US.'),
    ('about_body', 'I am a visual designer from Lalitpur, Nepal. I design brand identities, social media campaigns, posters and YouTube thumbnails for small businesses and big brands alike.\n\nMy work started with freelance projects in 2022. Since then I have designed launch campaigns for HUAWEI and HONOR in Nepal, social content for agencies in Nepal and India, and marketing for an insurance agency in the United States.\n\nI care about designs that are clear at a glance and still feel like the brand. Alongside design work, I am studying for a Bachelor in Information Technology at Tribhuvan University.'),
    ('tools', 'Adobe Photoshop, Adobe Illustrator, Figma, Adobe Premiere Pro'),
    ('location', 'Lalitpur, Nepal'),
    ('email', 'hello@sahisnuacharya.com.np'),
    ('whatsapp', '9779849899598'),
    ('behance', 'https://www.behance.net/sahisnuacharya'),
    ('linkedin', 'https://www.linkedin.com/in/sahisnu-acharya-9423182a2/'),
    ('upwork', 'https://www.upwork.com/freelancers/~011af2e4db25f84e21'),
    ('instagram', ''),
    ('youtube', ''),
    ('hero_photo', ''),
    ('contact_photo', ''),
    ('cv_file', ''),
    ('seo_description', 'Sahisnu Acharya is a visual designer in Lalitpur, Nepal, creating brand identities, social media campaigns, posters and YouTube thumbnails for clients worldwide.')`,
];

export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'initial schema and starter content', statements: [...schema, ...seed] },
];
