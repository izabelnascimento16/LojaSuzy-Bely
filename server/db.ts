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
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      material TEXT NOT NULL,
      color TEXT NOT NULL,
      dimensions TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      alt TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

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
  `);

  seedInitialCatalog();
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
    'INSERT INTO product_images (product_id, url, alt, sort_order) VALUES (?, ?, ?, ?)'
  );

  const imgBrincos = '/src/assets/images/product_brincos_dourados_1795522216821.jpg';
  const imgColares = '/src/assets/images/product_colares_delicados_1795522218417.jpg';
  const imgPulseiras = '/src/assets/images/product_pulseiras_aneis_1795522217768.jpg';
  const imgConjuntos = '/src/assets/images/product_conjuntos_perolas_1795522217179.jpg';
  const imgTornozeleira = '/src/assets/images/product_tornozeleira_acessorio_1795522218708.jpg';
  const imgHero = '/src/assets/images/hero_suzy_bely_jewelry_1795522216462.jpg';

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
      insertImage.run(productId, url, p.name, idx);
    });
  }

  const insertBanner = db.prepare(`
    INSERT INTO banners (title, subtitle, cta_text, cta_category, image_url, active, sort_order)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  insertBanner.run(
    'Beleza e elegância em cada detalhe',
    'Bijuterias selecionadas com banho dourado hipoalergênico, peças exclusivas a partir de R$ 10,00 e entrega rápida para todo o Brasil.',
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
    'São Paulo, SP',
    5,
    'Comprei o Conjunto Pérolas Imperial e a Argola Orgânica. O acabamento é impecável, chegou muito bem embalado e com entrega rápida.',
    'Conjunto Pérolas Imperial'
  );
  insertTestimonial.run(
    'Mariana Albuquerque',
    'Belo Horizonte, MG',
    5,
    'Uso o Colar Duplo Coração todos os dias há meses e o dourado continua lindo. Preço justo e atendimento super atencioso.',
    'Colar Duplo Coração & Ponto de Luz'
  );
  insertTestimonial.run(
    'Juliana Costa',
    'Curitiba, PR',
    5,
    'Adorei a facilidade de calcular o frete pelo CEP e pagar via PIX. As peças da promoção de R$ 10,00 surpreendem pela delicadeza.',
    'Tornozeleira Estrelinhas Douradas'
  );
}
