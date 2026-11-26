import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, {recursive: true});
}

const dbPath = path.join(dataDir, 'suzy_bely.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_subcategories_category_id
      ON subcategories(category_id, sort_order ASC, id ASC);

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      brand TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      material TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      dimensions TEXT NOT NULL DEFAULT '',
      attributes_json TEXT NOT NULL DEFAULT '{}',
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      promo_price_cents INTEGER CHECK (promo_price_cents IS NULL OR promo_price_cents >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_new INTEGER NOT NULL DEFAULT 0,
      is_bestseller INTEGER NOT NULL DEFAULT 0,
      sales_count INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS produto_imagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      imagem TEXT NOT NULL,
      alt TEXT NOT NULL DEFAULT '',
      principal INTEGER NOT NULL DEFAULT 0,
      ordem INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_produto_imagens_produto_id
      ON produto_imagens(produto_id, principal DESC, ordem ASC, id ASC);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('customer', 'admin', 'staff')),
      permissions_json TEXT NOT NULL DEFAULT '[]',
      full_name TEXT NOT NULL,
      cpf TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      lgpd_consent INTEGER NOT NULL DEFAULT 0,
      lgpd_consent_at TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      phone_verified INTEGER NOT NULL DEFAULT 0,
      verification_channel TEXT NOT NULL DEFAULT 'email',
      account_verified INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Principal',
      cep TEXT NOT NULL,
      street TEXT NOT NULL,
      number TEXT NOT NULL,
      complement TEXT NOT NULL DEFAULT '',
      neighborhood TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      UNIQUE(cart_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'aguardando_pagamento'
        CHECK (status IN ('aguardando_pagamento', 'pago', 'em_separacao', 'enviado', 'entregue', 'cancelado')),
      subtotal_cents INTEGER NOT NULL,
      shipping_cents INTEGER NOT NULL,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL,
      shipping_method TEXT NOT NULL,
      shipping_cep TEXT NOT NULL,
      shipping_address_json TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'credit_card', 'boleto')),
      payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'cancelled')),
      tracking_code TEXT NOT NULL DEFAULT '',
      cancel_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name TEXT NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      total_cents INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      gateway TEXT NOT NULL,
      method TEXT NOT NULL,
      external_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      pix_qr_code TEXT NOT NULL DEFAULT '',
      pix_copy_paste TEXT NOT NULL DEFAULT '',
      boleto_barcode TEXT NOT NULL DEFAULT '',
      card_last4 TEXT NOT NULL DEFAULT '',
      card_brand TEXT NOT NULL DEFAULT '',
      checkout_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      carrier TEXT NOT NULL,
      service TEXT NOT NULL,
      cost_cents INTEGER NOT NULL,
      estimated_days INTEGER NOT NULL,
      tracking_code TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'aguardando_envio',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      cta_text TEXT NOT NULL,
      cta_category TEXT NOT NULL DEFAULT 'all',
      image_url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_name TEXT NOT NULL,
      author_city TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 5,
      comment TEXT NOT NULL,
      product_name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enable_pix INTEGER NOT NULL DEFAULT 1,
      enable_credit_card INTEGER NOT NULL DEFAULT 1,
      enable_boleto INTEGER NOT NULL DEFAULT 1,
      pix_key TEXT NOT NULL DEFAULT '',
      pix_key_type TEXT NOT NULL DEFAULT 'cpf' CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
      pix_merchant_name TEXT NOT NULL DEFAULT 'SUZY BELY BIJUTERIAS',
      pix_merchant_city TEXT NOT NULL DEFAULT 'JI-PARANA',
      pix_discount_percent INTEGER NOT NULL DEFAULT 5,
      max_installments INTEGER NOT NULL DEFAULT 3,
      external_payment_link TEXT NOT NULL DEFAULT '',
      free_shipping_threshold_cents INTEGER NOT NULL DEFAULT 0,
      shipping_mode TEXT NOT NULL DEFAULT 'regional' CHECK (shipping_mode IN ('regional', 'fixed')),
      fixed_pac_cents INTEGER NOT NULL DEFAULT 1990,
      fixed_sedex_cents INTEGER NOT NULL DEFAULT 3490,
      shipping_extra_days INTEGER NOT NULL DEFAULT 0,
      local_delivery_enabled INTEGER NOT NULL DEFAULT 1,
      local_delivery_label TEXT NOT NULL DEFAULT 'Entrega Local / Retirada (Ji-Paraná, RO)',
      local_delivery_price_cents INTEGER NOT NULL DEFAULT 0,
      local_delivery_days INTEGER NOT NULL DEFAULT 1,
      whatsapp_number TEXT NOT NULL DEFAULT '',
      whatsapp_message TEXT NOT NULL DEFAULT 'Olá Suzy Bely! Gostaria de falar com a loja sobre as bijuterias e acessórios.',
      contact_email TEXT NOT NULL DEFAULT 'atendimento@suzybely.com.br',
      store_city TEXT NOT NULL DEFAULT 'Ji-Paraná, RO',
      email_sender_name TEXT NOT NULL DEFAULT 'Suzy Bely Bijuterias',
      email_on_register INTEGER NOT NULL DEFAULT 1,
      email_on_order INTEGER NOT NULL DEFAULT 1,
      email_on_status INTEGER NOT NULL DEFAULT 1,
      email_notify_owner INTEGER NOT NULL DEFAULT 1,
      taxonomy_v2_seeded INTEGER NOT NULL DEFAULT 0,
      free_shipping_disabled_v1 INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sent', 'skipped_no_smtp', 'failed')),
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS account_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
      target TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_account_verifications_user
      ON account_verifications(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS sms_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_phone TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sent', 'skipped_no_provider', 'failed')),
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Adapt legacy product_images table into produto_imagens without duplicating tables
  const legacyImagesTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_images'")
    .get() as {name: string} | undefined;
  if (legacyImagesTable) {
    db.transaction(() => {
      const legacyRows = db
        .prepare('SELECT id, product_id, url, alt, sort_order FROM product_images ORDER BY product_id ASC, sort_order ASC, id ASC')
        .all() as {id: number; product_id: number; url: string; alt: string; sort_order: number}[];
      const existingCount = (db.prepare('SELECT COUNT(*) AS c FROM produto_imagens').get() as {c: number}).c;
      if (existingCount === 0 && legacyRows.length > 0) {
        const insertNew = db.prepare(
          'INSERT INTO produto_imagens (produto_id, imagem, alt, principal, ordem) VALUES (?, ?, ?, ?, ?)'
        );
        const seenProducts = new Set<number>();
        for (const r of legacyRows) {
          const isPrincipal = !seenProducts.has(r.product_id) ? 1 : 0;
          seenProducts.add(r.product_id);
          insertNew.run(r.product_id, r.url, r.alt || '', isPrincipal, r.sort_order ?? 0);
        }
      }
      db.exec('DROP TABLE product_images');
    })();
  }

  // Safe migration for existing databases missing user verification columns
  const userCols = db.prepare('PRAGMA table_info(users)').all() as {name: string}[];
  if (!userCols.some((c) => c.name === 'account_verified')) {
    db.exec(`
      ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN verification_channel TEXT NOT NULL DEFAULT 'email';
      ALTER TABLE users ADD COLUMN account_verified INTEGER NOT NULL DEFAULT 0;
      UPDATE users SET account_verified = 1, email_verified = 1 WHERE active = 1;
    `);
  }

  // Safe migration for existing databases missing payments.checkout_url
  const paymentCols = db.prepare('PRAGMA table_info(payments)').all() as {name: string}[];
  if (!paymentCols.some((c) => c.name === 'checkout_url')) {
    db.exec("ALTER TABLE payments ADD COLUMN checkout_url TEXT NOT NULL DEFAULT ''");
  }

  // Safe migration for existing databases missing store_settings email columns
  const settingsCols = db.prepare('PRAGMA table_info(store_settings)').all() as {name: string}[];
  if (!settingsCols.some((c) => c.name === 'email_sender_name')) {
    db.exec("ALTER TABLE store_settings ADD COLUMN email_sender_name TEXT NOT NULL DEFAULT 'Suzy Bely Bijuterias'");
  }
  if (!settingsCols.some((c) => c.name === 'email_on_register')) {
    db.exec('ALTER TABLE store_settings ADD COLUMN email_on_register INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingsCols.some((c) => c.name === 'email_on_order')) {
    db.exec('ALTER TABLE store_settings ADD COLUMN email_on_order INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingsCols.some((c) => c.name === 'email_on_status')) {
    db.exec('ALTER TABLE store_settings ADD COLUMN email_on_status INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingsCols.some((c) => c.name === 'email_notify_owner')) {
    db.exec('ALTER TABLE store_settings ADD COLUMN email_notify_owner INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingsCols.some((c) => c.name === 'whatsapp_message')) {
    db.exec(
      "ALTER TABLE store_settings ADD COLUMN whatsapp_message TEXT NOT NULL DEFAULT 'Olá Suzy Bely! Gostaria de falar com a loja sobre as bijuterias e acessórios.'"
    );
  }
  if (!settingsCols.some((c) => c.name === 'taxonomy_v2_seeded')) {
    db.exec('ALTER TABLE store_settings ADD COLUMN taxonomy_v2_seeded INTEGER NOT NULL DEFAULT 0');
  }
  if (!settingsCols.some((c) => c.name === 'free_shipping_disabled_v1')) {
    db.exec(`
      ALTER TABLE store_settings ADD COLUMN free_shipping_disabled_v1 INTEGER NOT NULL DEFAULT 0;
      UPDATE store_settings SET free_shipping_threshold_cents = 0, free_shipping_disabled_v1 = 1 WHERE id = 1;
    `);
  }

  // Safe migration for existing databases missing expanded category & product columns
  const categoryCols = db.prepare('PRAGMA table_info(categories)').all() as {name: string}[];
  if (!categoryCols.some((c) => c.name === 'image_url')) {
    db.exec("ALTER TABLE categories ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  }
  if (!categoryCols.some((c) => c.name === 'active')) {
    db.exec('ALTER TABLE categories ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  }

  const productCols = db.prepare('PRAGMA table_info(products)').all() as {name: string}[];
  if (!productCols.some((c) => c.name === 'subcategory_id')) {
    db.exec('ALTER TABLE products ADD COLUMN subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL');
  }
  if (!productCols.some((c) => c.name === 'brand')) {
    db.exec("ALTER TABLE products ADD COLUMN brand TEXT NOT NULL DEFAULT ''");
  }
  if (!productCols.some((c) => c.name === 'sku')) {
    db.exec("ALTER TABLE products ADD COLUMN sku TEXT NOT NULL DEFAULT ''");
  }
  if (!productCols.some((c) => c.name === 'attributes_json')) {
    db.exec("ALTER TABLE products ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '{}'");
  }

  // Ensure default store_settings row exists
  db.prepare('INSERT OR IGNORE INTO store_settings (id) VALUES (1)').run();

  seedInitialCatalog();
  syncExpandedCategoriesAndProducts();

  // Ensure initial default banner reflects the updated storefront photo
  db.prepare(
    `UPDATE banners SET image_url = ? WHERE image_url = '/src/assets/images/hero_suzy_bely_jewelry_1795522216462.jpg'`
  ).run('/assets/aistudio/Gemini_Generated_Image_jwylupjwylupjwyl_8ff55566.jpg');

  // Ensure product brand spelling uses Suzy Bely (with Z)
  db.prepare(
    `UPDATE products SET name = 'Choker Elos Delicados Suzy Bely', slug = 'choker-elos-delicados-suzy-bely' WHERE slug = 'choker-elos-delicados-susy-bely'`
  ).run();

  // Ensure initial testimonials reflect Ji-Paraná, RO (city and comment text)
  const updateTestimonialLocation = db.prepare(
    `UPDATE testimonials SET author_city = 'Ji-Paraná, RO', comment = ? WHERE author_name = ?`
  );
  updateTestimonialLocation.run(
    'Comprei o Conjunto Pérolas Imperial e a Argola Orgânica. O acabamento é impecável, chegou super bem embalado aqui em Ji-Paraná.',
    'Camila Ferreira'
  );
  updateTestimonialLocation.run(
    'Uso o Colar Duplo Coração todos os dias há meses e o dourado continua lindo. Preço justo e atendimento super atencioso em Rondônia.',
    'Mariana Albuquerque'
  );
  updateTestimonialLocation.run(
    'Adorei comprar na Suzy Bely aqui de Ji-Paraná, RO! Calculei o frete pelo CEP e paguei via PIX. As peças surpreendem pela delicadeza e brilho.',
    'Juliana Costa'
  );
}

export interface StoreSettingsRow {
  id: number;
  enable_pix: number;
  enable_credit_card: number;
  enable_boleto: number;
  pix_key: string;
  pix_key_type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  pix_merchant_name: string;
  pix_merchant_city: string;
  pix_discount_percent: number;
  max_installments: number;
  external_payment_link: string;
  free_shipping_threshold_cents: number;
  shipping_mode: 'regional' | 'fixed';
  fixed_pac_cents: number;
  fixed_sedex_cents: number;
  shipping_extra_days: number;
  local_delivery_enabled: number;
  local_delivery_label: string;
  local_delivery_price_cents: number;
  local_delivery_days: number;
  whatsapp_number: string;
  whatsapp_message: string;
  contact_email: string;
  store_city: string;
  email_sender_name: string;
  email_on_register: number;
  email_on_order: number;
  email_on_status: number;
  email_notify_owner: number;
  updated_at: string;
}

export function getStoreSettings(): StoreSettingsRow {
  db.prepare('INSERT OR IGNORE INTO store_settings (id) VALUES (1)').run();
  return db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as StoreSettingsRow;
}

function seedInitialCatalog(): void {
  const existingCategories = db.prepare('SELECT COUNT(*) AS count FROM categories').get() as {count: number};
  if (existingCategories.count > 0) return;

  const insertCategory = db.prepare(
    'INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)'
  );

  const categoriesSeed = [
    ['Brincos', 'brincos', 'Argolas esculpidas, pontos de luz e pérolas delicadas.', 1],
    ['Colares', 'colares', 'Correntes finas, chokers e pingentes para composições em camadas.', 2],
    ['Pulseiras', 'pulseiras', 'Braceletes minimalistas e elos dourados para o dia a dia.', 3],
    ['Anéis', 'aneis', 'Solitários, aparadores com zircônias e modelos reguláveis.', 4],
    ['Conjuntos', 'conjuntos', 'Kits coordenados de colar e brinco prontos para presentear.', 5],
    ['Tornozeleiras', 'tornozeleiras', 'Correntes leves com pingentes de estrela e pontos de brilho.', 6],
    ['Acessórios', 'acessorios', 'Presilhas de cabelo, porta-joias e acabamentos sofisticados.', 7],
  ];

  const categoryIds: Record<string, number> = {};
  for (const [name, slug, desc, order] of categoriesSeed) {
    const info = insertCategory.run(name, slug, desc, order);
    categoryIds[slug as string] = Number(info.lastInsertRowid);
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (
      category_id, name, slug, description, material, color, dimensions,
      price_cents, promo_price_cents, stock, is_featured, is_new, is_bestseller, sales_count, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertImage = db.prepare(
    'INSERT INTO produto_imagens (produto_id, imagem, alt, principal, ordem) VALUES (?, ?, ?, ?, ?)'
  );

  const imgBrincos = '/src/assets/images/product_brincos_dourados_1795522216821.jpg';
  const imgColares = '/src/assets/images/product_colares_delicados_1795522218417.jpg';
  const imgPulseiras = '/src/assets/images/product_pulseiras_aneis_1795522217768.jpg';
  const imgConjuntos = '/src/assets/images/product_conjuntos_perolas_1795522217179.jpg';
  const imgTornozeleira = '/src/assets/images/product_tornozeleira_acessorio_1795522218708.jpg';
  const imgHero = '/assets/aistudio/Gemini_Generated_Image_jwylupjwylupjwyl_8ff55566.jpg';

  const productsSeed = [
    {
      cat: 'brincos',
      name: 'Argola Orgânica Texturizada Dourada',
      slug: 'argola-organica-texturizada-dourada',
      desc: 'Argola leve com acabamento artesanal martelado e banho dourado hipoalergênico. Fecho click anatômico que traz conforto para usar do trabalho ao jantar.',
      material: 'Liga metálica nobre com banho dourado 18k e verniz protetor (livre de níquel)',
      color: 'Dourado Suave',
      dimensions: '2,4 cm de diâmetro · 5,2 g o par',
      price: 2990,
      promo: 1990,
      stock: 28,
      featured: 1,
      isNew: 1,
      bestseller: 1,
      images: [imgBrincos, imgHero],
    },
    {
      cat: 'brincos',
      name: 'Brinco Gota Pérola Barroca Natural',
      slug: 'brinco-gota-perola-barroca-natural',
      desc: 'Elegância clássica em formato orgânico. Pérola sintética perolizada de alto brilho suspensa em esfera dourada polida.',
      material: 'Metal com banho dourado e pérola resinada de alto brilho',
      color: 'Pérola e Dourado',
      dimensions: '2,8 cm de altura · 4,8 g o par',
      price: 2490,
      promo: null,
      stock: 19,
      featured: 1,
      isNew: 0,
      bestseller: 1,
      images: [imgBrincos, imgConjuntos],
    },
    {
      cat: 'colares',
      name: 'Colar Duplo Coração & Ponto de Luz',
      slug: 'colar-duplo-coracao-ponto-de-luz',
      desc: 'Composição dupla em correntes venezianas finas: um ponto de luz em zircônia cristal e um pingente coração minimalista.',
      material: 'Banho dourado 18k hipoalergênico com zircônia lapidada',
      color: 'Dourado e Cristal',
      dimensions: '40 cm + 45 cm com extensor de 5 cm',
      price: 3990,
      promo: 2990,
      stock: 22,
      featured: 1,
      isNew: 1,
      bestseller: 1,
      images: [imgColares, imgHero],
    },
    {
      cat: 'colares',
      name: 'Choker Elos Delicados Suzy Bely',
      slug: 'choker-elos-delicados-suzy-bely',
      desc: 'Corrente delicada de elos portugueses que valoriza o colo e combina com qualquer mix de colares.',
      material: 'Liga metálica com verniz italiano dourado',
      color: 'Dourado Clássico',
      dimensions: '35 cm + 7 cm de extensor',
      price: 1500,
      promo: 1000,
      stock: 40,
      featured: 0,
      isNew: 0,
      bestseller: 1,
      images: [imgColares],
    },
    {
      cat: 'pulseiras',
      name: 'Pulseira Barra Cravejada Zircônias',
      slug: 'pulseira-barra-cravejada-zirconias',
      desc: 'Pulseira corrente elo português com barra central delicadamente cravejada em microzircônias cristais.',
      material: 'Banho dourado 18k e microzircônias',
      color: 'Dourado Brilhante',
      dimensions: '17 cm + 3 cm de extensor',
      price: 2690,
      promo: null,
      stock: 16,
      featured: 1,
      isNew: 1,
      bestseller: 0,
      images: [imgPulseiras],
    },
    {
      cat: 'aneis',
      name: 'Anel Trio Aparador Cravejado',
      slug: 'anel-trio-aparador-cravejado',
      desc: 'Conjunto versátil com 3 aros finos que podem ser usados juntos ou distribuídos nos dedos.',
      material: 'Metal com banho dourado e zircônias cristais',
      color: 'Dourado e Cristal',
      dimensions: 'Aros 14, 16, 18 e 20 (ajuste ergonômico)',
      price: 2990,
      promo: 2290,
      stock: 24,
      featured: 1,
      isNew: 0,
      bestseller: 1,
      images: [imgPulseiras, imgHero],
    },
    {
      cat: 'aneis',
      name: 'Anel Solitário Pérola Minimal',
      slug: 'anel-solitario-perola-minimal',
      desc: 'Aro torcido delicado com pérola central. Uma peça feminina e romântica para iluminar suas mãos.',
      material: 'Banho dourado hipoalergênico',
      color: 'Dourado e Off-White',
      dimensions: 'Regulável do 14 ao 20',
      price: 1490,
      promo: 1000,
      stock: 35,
      featured: 0,
      isNew: 1,
      bestseller: 0,
      images: [imgHero, imgPulseiras],
    },
    {
      cat: 'conjuntos',
      name: 'Conjunto Pérolas Imperial Colar + Brincos',
      slug: 'conjunto-perolas-imperial',
      desc: 'Kit completo com colar de elos espaçados por pérolas selecionadas e par de brincos pêndulo combinando. Ideal para ocasiões especiais e presentes.',
      material: 'Banho dourado 18k, pérolas acetinadas e tarraxa confortável',
      color: 'Nude Perolado e Dourado',
      dimensions: 'Colar 45 cm + extensor · Brincos 3,2 cm',
      price: 5490,
      promo: 4490,
      stock: 14,
      featured: 1,
      isNew: 1,
      bestseller: 1,
      images: [imgConjuntos, imgBrincos],
    },
    {
      cat: 'tornozeleiras',
      name: 'Tornozeleira Estrelinhas Douradas',
      slug: 'tornozeleira-estrelinhas-douradas',
      desc: 'Tornozeleira leve e resistente com quatro pingentes de estrela que acompanham cada passo com brilho sutil.',
      material: 'Aço inoxidável com banho dourado resistente à água doce',
      color: 'Dourado',
      dimensions: '23 cm + 4 cm de extensor',
      price: 1890,
      promo: 1000,
      stock: 30,
      featured: 0,
      isNew: 1,
      bestseller: 1,
      images: [imgTornozeleira],
    },
    {
      cat: 'acessorios',
      name: 'Presilha Tartaruga Âmbar & Dourado',
      slug: 'presilha-tartaruga-ambar-dourado',
      desc: 'Presilha em acetato marmorizado tons caramelo e castanho com base metálica dourada de alta fixação.',
      material: 'Acetato polido de alta resistência e metal dourado',
      color: 'Tartaruga Âmbar e Castanho',
      dimensions: '8,5 cm de comprimento',
      price: 1690,
      promo: 1000,
      stock: 26,
      featured: 0,
      isNew: 1,
      bestseller: 0,
      images: [imgTornozeleira],
    },
  ];

  for (const p of productsSeed) {
    const info = insertProduct.run(
      categoryIds[p.cat],
      p.name,
      p.slug,
      p.desc,
      p.material,
      p.color,
      p.dimensions,
      p.price,
      p.promo,
      p.stock,
      p.featured,
      p.isNew,
      p.bestseller,
      0
    );
    const productId = Number(info.lastInsertRowid);
    p.images.forEach((url, idx) => {
      insertImage.run(productId, url, p.name, idx === 0 ? 1 : 0, idx);
    });
  }

  const insertBanner = db.prepare(`
    INSERT INTO banners (title, subtitle, cta_text, cta_category, image_url, active, sort_order)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  insertBanner.run(
    'Beleza e elegância em cada detalhe',
    'Bijuterias selecionadas com banho dourado hipoalergênico, peças delicadas e entrega rápida para todo o Brasil.',
    'Explorar Coleção',
    'all',
    imgHero,
    1
  );

  const insertTestimonial = db.prepare(`
    INSERT INTO testimonials (author_name, author_city, rating, comment, product_name, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  insertTestimonial.run(
    'Camila Ferreira',
    'Ji-Paraná, RO',
    5,
    'Comprei o Conjunto Pérolas Imperial e a Argola Orgânica. O acabamento é impecável, chegou super bem embalado aqui em Ji-Paraná.',
    'Conjunto Pérolas Imperial'
  );
  insertTestimonial.run(
    'Mariana Albuquerque',
    'Ji-Paraná, RO',
    5,
    'Uso o Colar Duplo Coração todos os dias há meses e o dourado continua lindo. Preço justo e atendimento super atencioso em Rondônia.',
    'Colar Duplo Coração & Ponto de Luz'
  );
  insertTestimonial.run(
    'Juliana Costa',
    'Ji-Paraná, RO',
    5,
    'Adorei comprar na Suzy Bely aqui de Ji-Paraná, RO! Calculei o frete pelo CEP e paguei via PIX. As peças surpreendem pela delicadeza e brilho.',
    'Tornozeleira Estrelinhas Douradas'
  );
}

function syncExpandedCategoriesAndProducts(): void {
  const settings = db
    .prepare('SELECT taxonomy_v2_seeded FROM store_settings WHERE id = 1')
    .get() as {taxonomy_v2_seeded: number} | undefined;
  if (settings?.taxonomy_v2_seeded) return;

  const imgBrincos = '/src/assets/images/product_brincos_dourados_1795522216821.jpg';
  const imgConjuntos = '/src/assets/images/product_conjuntos_perolas_1795522217179.jpg';
  const imgBolsas = '/src/assets/images/cat_bolsas_carteiras_1795687072120.jpg';
  const imgCintos = '/src/assets/images/cat_cintos_acessorios_1795687072571.jpg';
  const imgMaquiagem = '/src/assets/images/cat_maquiagem_1795687073530.jpg';
  const imgCorporais = '/src/assets/images/cat_cuidados_corporais_1795687073078.jpg';
  const imgFaciais = '/src/assets/images/cat_cuidados_faciais_1795687075410.jpg';

  const taxonomy: {
    name: string;
    slug: string;
    description: string;
    imageUrl: string;
    sortOrder: number;
    subcategories: {name: string; slug: string}[];
  }[] = [
    {
      name: 'Bijuterias',
      slug: 'bijuterias',
      description: 'Brincos, colares, pulseiras, anéis, conjuntos e tornozeleiras com brilho e acabamento delicado.',
      imageUrl: imgBrincos,
      sortOrder: 1,
      subcategories: [
        {name: 'Brincos', slug: 'brincos'},
        {name: 'Colares', slug: 'colares'},
        {name: 'Pulseiras', slug: 'pulseiras'},
        {name: 'Anéis', slug: 'aneis'},
        {name: 'Conjuntos', slug: 'conjuntos'},
        {name: 'Tornozeleiras', slug: 'tornozeleiras'},
      ],
    },
    {
      name: 'Bolsas e Carteiras',
      slug: 'bolsas-e-carteiras',
      description: 'Bolsas femininas, de ombro, de mão, transversais, carteiras e porta-moedas.',
      imageUrl: imgBolsas,
      sortOrder: 2,
      subcategories: [
        {name: 'Bolsas femininas', slug: 'bolsas-femininas'},
        {name: 'Bolsas de ombro', slug: 'bolsas-de-ombro'},
        {name: 'Bolsas de mão', slug: 'bolsas-de-mao'},
        {name: 'Bolsas transversais', slug: 'bolsas-transversais'},
        {name: 'Carteiras', slug: 'carteiras'},
        {name: 'Porta-moedas', slug: 'porta-moedas'},
      ],
    },
    {
      name: 'Cintos e Acessórios',
      slug: 'cintos-e-acessorios',
      description: 'Cintos femininos, óculos, presilhas, elásticos, lenços e acessórios para cabelo.',
      imageUrl: imgCintos,
      sortOrder: 3,
      subcategories: [
        {name: 'Cintos femininos', slug: 'cintos-femininos'},
        {name: 'Óculos', slug: 'oculos'},
        {name: 'Acessórios para cabelo', slug: 'acessorios-para-cabelo'},
        {name: 'Presilhas', slug: 'presilhas'},
        {name: 'Elásticos', slug: 'elasticos'},
        {name: 'Lenços', slug: 'lencos'},
      ],
    },
    {
      name: 'Maquiagem',
      slug: 'maquiagem',
      description: 'Batons, gloss, bases, corretivos, pós compactos, máscaras, sombras, blush e mais.',
      imageUrl: imgMaquiagem,
      sortOrder: 4,
      subcategories: [
        {name: 'Batons', slug: 'batons'},
        {name: 'Gloss', slug: 'gloss'},
        {name: 'Bases', slug: 'bases'},
        {name: 'Corretivos', slug: 'corretivos'},
        {name: 'Pó compacto', slug: 'po-compacto'},
        {name: 'Máscaras de pestanas', slug: 'mascaras-de-pestanas'},
        {name: 'Sombras', slug: 'sombras'},
        {name: 'Blush', slug: 'blush'},
        {name: 'Iluminadores', slug: 'iluminadores'},
        {name: 'Lápis de olhos', slug: 'lapis-de-olhos'},
        {name: 'Delineadores', slug: 'delineadores'},
      ],
    },
    {
      name: 'Cuidados Corporais',
      slug: 'cuidados-corporais',
      description: 'Body splash, hidratantes corporais, cremes para mãos, óleos, esfoliantes, sabonetes e loções.',
      imageUrl: imgCorporais,
      sortOrder: 5,
      subcategories: [
        {name: 'Body splash', slug: 'body-splash'},
        {name: 'Hidratantes corporais', slug: 'hidratantes-corporais'},
        {name: 'Cremes para mãos', slug: 'cremes-para-maos'},
        {name: 'Óleos corporais', slug: 'oleos-corporais'},
        {name: 'Esfoliantes', slug: 'esfoliantes'},
        {name: 'Sabonetes', slug: 'sabonetes'},
        {name: 'Loções corporais', slug: 'locoes-corporais'},
      ],
    },
    {
      name: 'Cuidados Faciais',
      slug: 'cuidados-faciais',
      description: 'Hidratantes faciais, limpeza facial, máscaras, esfoliantes, séruns e protetores solares.',
      imageUrl: imgFaciais,
      sortOrder: 6,
      subcategories: [
        {name: 'Hidratantes faciais', slug: 'hidratantes-faciais'},
        {name: 'Produtos de limpeza facial', slug: 'produtos-de-limpeza-facial'},
        {name: 'Máscaras faciais', slug: 'mascaras-faciais'},
        {name: 'Esfoliantes faciais', slug: 'esfoliantes-faciais'},
        {name: 'Séruns', slug: 'seruns'},
        {name: 'Protetores solares', slug: 'protetores-solares'},
      ],
    },
    {
      name: 'Outros Produtos',
      slug: 'outros-produtos',
      description: 'Produtos sazonais, novidades, kits para presente e oportunidades promocionais.',
      imageUrl: imgConjuntos,
      sortOrder: 7,
      subcategories: [
        {name: 'Produtos sazonais', slug: 'produtos-sazonais'},
        {name: 'Novidades', slug: 'novidades'},
        {name: 'Kits e conjuntos para presente', slug: 'kits-e-conjuntos-para-presente'},
        {name: 'Promoções', slug: 'promocoes-sub'},
      ],
    },
  ];

  db.transaction(() => {
    const existingCats = db.prepare('SELECT id, slug FROM categories').all() as {id: number; slug: string}[];
    const oldCatIdBySlug = new Map(existingCats.map((c) => [c.slug, c.id]));

    // Temporarily free legacy flat slugs if they match new subcategory slugs so categories stay clean
    const legacyFlatSlugs = ['brincos', 'colares', 'pulseiras', 'aneis', 'conjuntos', 'tornozeleiras', 'acessorios'];

    const catIdBySlug: Record<string, number> = {};
    const subIdBySlug: Record<string, number> = {};

    const insertCat = db.prepare(
      'INSERT INTO categories (name, slug, description, image_url, active, sort_order) VALUES (?, ?, ?, ?, 1, ?)'
    );
    const updateCat = db.prepare(
      'UPDATE categories SET name = ?, description = ?, image_url = ?, sort_order = ? WHERE id = ?'
    );
    const insertSub = db.prepare(
      'INSERT OR IGNORE INTO subcategories (category_id, name, slug, description, active, sort_order) VALUES (?, ?, ?, ?, 1, ?)'
    );

    for (const cat of taxonomy) {
      const existingId = oldCatIdBySlug.get(cat.slug);
      let catId: number;
      if (existingId) {
        updateCat.run(cat.name, cat.description, cat.imageUrl, cat.sortOrder, existingId);
        catId = existingId;
      } else {
        const info = insertCat.run(cat.name, cat.slug, cat.description, cat.imageUrl, cat.sortOrder);
        catId = Number(info.lastInsertRowid);
      }
      catIdBySlug[cat.slug] = catId;

      cat.subcategories.forEach((sub, idx) => {
        insertSub.run(catId, sub.name, sub.slug, '', idx + 1);
        const row = db.prepare('SELECT id FROM subcategories WHERE slug = ?').get(sub.slug) as {id: number};
        subIdBySlug[sub.slug] = row.id;
      });
    }

    // Reassign legacy flat-category jewelry products into Bijuterias / Cintos e Acessórios + subcategory
    const legacyReassignment: Record<string, {catSlug: string; subSlug: string}> = {
      brincos: {catSlug: 'bijuterias', subSlug: 'brincos'},
      colares: {catSlug: 'bijuterias', subSlug: 'colares'},
      pulseiras: {catSlug: 'bijuterias', subSlug: 'pulseiras'},
      aneis: {catSlug: 'bijuterias', subSlug: 'aneis'},
      conjuntos: {catSlug: 'bijuterias', subSlug: 'conjuntos'},
      tornozeleiras: {catSlug: 'bijuterias', subSlug: 'tornozeleiras'},
      acessorios: {catSlug: 'cintos-e-acessorios', subSlug: 'presilhas'},
    };

    for (const oldSlug of legacyFlatSlugs) {
      const oldId = oldCatIdBySlug.get(oldSlug);
      if (!oldId) continue;
      const target = legacyReassignment[oldSlug];
      if (!target) continue;
      db.prepare('UPDATE products SET category_id = ?, subcategory_id = ? WHERE category_id = ?').run(
        catIdBySlug[target.catSlug],
        subIdBySlug[target.subSlug],
        oldId
      );
      const remaining = (db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ?').get(oldId) as {c: number}).c;
      if (remaining === 0) {
        db.prepare('DELETE FROM categories WHERE id = ?').run(oldId);
      }
    }

    // Populate SKUs and brands on existing migrated jewelry products if empty
    const existingProds = db.prepare('SELECT id, sku FROM products ORDER BY id ASC').all() as {id: number; sku: string}[];
    existingProds.forEach((p, idx) => {
      if (!p.sku) {
        db.prepare("UPDATE products SET sku = ?, brand = COALESCE(NULLIF(brand, ''), 'Suzy Bely') WHERE id = ?").run(
          `SB-BIJ-${String(idx + 1).padStart(3, '0')}`,
          p.id
        );
      }
    });

    // Seed showcase products across the newly expanded categories if none exist in those categories yet
    const newDepartmentsCount = (
      db
        .prepare(
          'SELECT COUNT(*) AS c FROM products p JOIN categories c ON c.id = p.category_id WHERE c.slug != ?'
        )
        .get('bijuterias') as {c: number}
    ).c;

    if (newDepartmentsCount <= 1) {
      const insertProduct = db.prepare(`
        INSERT OR IGNORE INTO products (
          category_id, subcategory_id, name, slug, brand, sku, description, material, color, dimensions,
          attributes_json, price_cents, promo_price_cents, stock, is_featured, is_new, is_bestseller, sales_count, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const insertImage = db.prepare(
        'INSERT INTO produto_imagens (produto_id, imagem, alt, principal, ordem) VALUES (?, ?, ?, ?, ?)'
      );

      const newProducts = [
        {
          cat: 'bolsas-e-carteiras',
          sub: 'bolsas-femininas',
          name: 'Bolsa Estruturada Caramelo & Creme Elegante',
          slug: 'bolsa-estruturada-caramelo-creme',
          brand: 'Suzy Bely Selection',
          sku: 'SB-BOL-001',
          desc: 'Bolsa feminina estruturada com alça de mão e alça transversal removível, ferragem dourada e amplo espaço interno com divisórias.',
          material: 'Couro sintético premium texturizado e forro acetinado',
          color: 'Caramelo e Creme',
          dimensions: '26 cm x 20 cm x 11 cm',
          attrs: {Cor: 'Caramelo e Creme', Material: 'Couro sintético premium', Dimensões: '26 x 20 x 11 cm'},
          price: 14990,
          promo: 11990,
          stock: 12,
          featured: 1,
          isNew: 1,
          bestseller: 1,
          img: imgBolsas,
        },
        {
          cat: 'bolsas-e-carteiras',
          sub: 'carteiras',
          name: 'Carteira Compacta Zíper Dourado Caramelo',
          slug: 'carteira-compacta-ziper-dourado',
          brand: 'Suzy Bely Selection',
          sku: 'SB-CAR-002',
          desc: 'Carteira feminina prática com fechamento em zíper, espaço para cartões, documentos, notas e compartimento porta-moedas.',
          material: 'Couro sintético macio e metal dourado',
          color: 'Caramelo',
          dimensions: '14 cm x 9,5 cm x 2,5 cm',
          attrs: {Cor: 'Caramelo', Material: 'Couro sintético', Dimensões: '14 x 9,5 x 2,5 cm'},
          price: 6990,
          promo: 5490,
          stock: 20,
          featured: 0,
          isNew: 1,
          bestseller: 1,
          img: imgBolsas,
        },
        {
          cat: 'cintos-e-acessorios',
          sub: 'cintos-femininos',
          name: 'Cinto Feminino Fivela Dourada Escovada',
          slug: 'cinto-feminino-fivela-dourada',
          brand: 'Suzy Bely',
          sku: 'SB-CIN-001',
          desc: 'Cinto versátil de visual clássico com fivela arredondada em dourado escovado, perfeito para calças, saias e vestidos.',
          material: 'Couro sintético reforçado e fivela metálica',
          color: 'Conhaque',
          dimensions: 'Largura 2,8 cm · Comprimento 105 cm',
          attrs: {Tamanho: 'Único ajustável (P ao G)', Cor: 'Conhaque', Material: 'Couro sintético e metal'},
          price: 4990,
          promo: 3990,
          stock: 25,
          featured: 1,
          isNew: 1,
          bestseller: 0,
          img: imgCintos,
        },
        {
          cat: 'cintos-e-acessorios',
          sub: 'oculos',
          name: 'Óculos de Sol Tartaruga Clássico Proteção UV400',
          slug: 'oculos-de-sol-tartaruga-uv400',
          brand: 'Suzy Bely',
          sku: 'SB-OCU-002',
          desc: 'Armação leve estampada em acetato tartaruga com ponte metálica dourada e lentes com proteção solar UV400.',
          material: 'Acetato leve e lentes policarbonato UV400',
          color: 'Tartaruga Âmbar',
          dimensions: 'Haste 14 cm · Lente 5,1 cm',
          attrs: {Cor: 'Tartaruga Âmbar', Material: 'Acetato e proteção UV400'},
          price: 7990,
          promo: null,
          stock: 15,
          featured: 0,
          isNew: 1,
          bestseller: 1,
          img: imgCintos,
        },
        {
          cat: 'maquiagem',
          sub: 'batons',
          name: 'Batom Matte Veludo Terracota Rosé',
          slug: 'batom-matte-veludo-terracota-rose',
          brand: 'Suzy Bely Beauty',
          sku: 'SB-MAQ-001',
          desc: 'Batom de alta pigmentação e conforto nos lábios, textura aveludada de longa duração que não craquela.',
          material: '',
          color: 'Terracota Rosé',
          dimensions: '3,5 g',
          attrs: {Cor: 'Terracota Rosé', Tonalidade: 'Médio quente', Acabamento: 'Matte aveludado'},
          price: 3490,
          promo: 2790,
          stock: 34,
          featured: 1,
          isNew: 1,
          bestseller: 1,
          img: imgMaquiagem,
        },
        {
          cat: 'maquiagem',
          sub: 'sombras',
          name: 'Paleta de Sombras Neutras & Brilho Dourado',
          slug: 'paleta-sombras-neutras-brilho-dourado',
          brand: 'Suzy Bely Beauty',
          sku: 'SB-MAQ-002',
          desc: 'Paleta com 9 tons versáteis entre opacos aveludados e cintilantes luminosos para produções do dia à noite.',
          material: '',
          color: 'Nude, Bronze e Dourado',
          dimensions: '9 cores · 12 g',
          attrs: {Cor: 'Nude e Bronze', Tonalidade: 'Tons quentes universais', Acabamento: 'Matte e Cintilante'},
          price: 5990,
          promo: 4690,
          stock: 18,
          featured: 1,
          isNew: 1,
          bestseller: 1,
          img: imgMaquiagem,
        },
        {
          cat: 'cuidados-corporais',
          sub: 'body-splash',
          name: 'Body Splash Flor de Pêssego & Baunilha 200ml',
          slug: 'body-splash-flor-de-pessego-baunilha',
          brand: 'Suzy Bely Care',
          sku: 'SB-COR-001',
          desc: 'Desodorante colônia corporal leve e refrescante para perfumar a pele após o banho com fixação suave e envolvente.',
          material: '',
          color: 'Rosé Suave',
          dimensions: '200 ml',
          attrs: {Fragrância: 'Flor de Pêssego, Jasmim e Baunilha', Volume: '200 ml'},
          price: 5490,
          promo: 4490,
          stock: 26,
          featured: 1,
          isNew: 1,
          bestseller: 1,
          img: imgCorporais,
        },
        {
          cat: 'cuidados-corporais',
          sub: 'hidratantes-corporais',
          name: 'Loção Hidratante Corporal Toque de Amêndoas 250ml',
          slug: 'locao-hidratante-toque-de-amendoas',
          brand: 'Suzy Bely Care',
          sku: 'SB-COR-002',
          desc: 'Hidratação profunda de rápida absorção com manteiga de karité e óleo de amêndoas doces para pele macia o dia inteiro.',
          material: '',
          color: '',
          dimensions: '250 ml',
          attrs: {'Tipo de pele': 'Todos os tipos de pele', Fragrância: 'Amêndoas Doces e Karité', Quantidade: '250 ml'},
          price: 4990,
          promo: null,
          stock: 21,
          featured: 0,
          isNew: 1,
          bestseller: 0,
          img: imgCorporais,
        },
        {
          cat: 'cuidados-faciais',
          sub: 'seruns',
          name: 'Sérum Facial Vitamina C + Ácido Hialurônico 30ml',
          slug: 'serum-facial-vitamina-c-hialuronico',
          brand: 'Suzy Bely Skin',
          sku: 'SB-FAC-001',
          desc: 'Sérum antioxidante e hidratante que devolve viço, uniformiza o tom e suaviza linhas finas com toque seco.',
          material: '',
          color: '',
          dimensions: '30 ml',
          attrs: {'Tipo de pele': 'Mista, normal e seca', Finalidade: 'Luminosidade e hidratação', Quantidade: '30 ml'},
          price: 6490,
          promo: 5290,
          stock: 19,
          featured: 1,
          isNew: 1,
          bestseller: 1,
          img: imgFaciais,
        },
        {
          cat: 'cuidados-faciais',
          sub: 'esfoliantes-faciais',
          name: 'Esfoliante Facial Suave Bambu & Camomila 100g',
          slug: 'esfoliante-facial-bambu-camomila',
          brand: 'Suzy Bely Skin',
          sku: 'SB-FAC-002',
          desc: 'Microesfoliante facial de partículas naturais para desobstruir poros e renovar a textura da pele sem agredir.',
          material: '',
          color: '',
          dimensions: '100 g',
          attrs: {Finalidade: 'Renovação celular e controle de oleosidade', Quantidade: '100 g'},
          price: 4290,
          promo: null,
          stock: 16,
          featured: 0,
          isNew: 1,
          bestseller: 0,
          img: imgFaciais,
        },
        {
          cat: 'outros-produtos',
          sub: 'kits-e-conjuntos-para-presente',
          name: 'Kit Presente Autocuidado & Elegância Suzy Bely',
          slug: 'kit-presente-autocuidado-suzy-bely',
          brand: 'Suzy Bely',
          sku: 'SB-KIT-001',
          desc: 'Combo especial com Sérum Facial 30ml, Batom Matte Terracota e embalagem presenteável exclusiva Suzy Bely.',
          material: 'Embalagem presenteável + 2 itens tamanho regular',
          color: 'Dourado e Rosé',
          dimensions: 'Caixa 22 x 16 x 7 cm',
          attrs: {Finalidade: 'Presente completo', Quantidade: 'Kit com 2 produtos + caixa'},
          price: 9490,
          promo: 7990,
          stock: 10,
          featured: 1,
          isNew: 1,
          bestseller: 1,
          img: imgFaciais,
        },
      ];

      for (const np of newProducts) {
        const info = insertProduct.run(
          catIdBySlug[np.cat],
          subIdBySlug[np.sub],
          np.name,
          np.slug,
          np.brand,
          np.sku,
          np.desc,
          np.material,
          np.color,
          np.dimensions,
          JSON.stringify(np.attrs),
          np.price,
          np.promo,
          np.stock,
          np.featured,
          np.isNew,
          np.bestseller,
          0
        );
        if (info.changes > 0) {
          insertImage.run(Number(info.lastInsertRowid), np.img, np.name, 1, 0);
        }
      }
    }

    db.prepare('UPDATE store_settings SET taxonomy_v2_seeded = 1 WHERE id = 1').run();
  })();
}
