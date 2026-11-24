import {useCallback, useEffect, useMemo, useState} from 'react';
import {ArrowRight, Search, SlidersHorizontal, Star} from 'lucide-react';
import type {
  Address,
  AppView,
  Banner,
  CartItem,
  Category,
  InstitutionalTab,
  Product,
  ShippingOption,
  Testimonial,
  User,
} from './types';
import {apiRequest, setCustomerToken} from './services/api';
import {effectivePriceCents} from './utils/format';
import {Header} from './components/Header';
import {Footer} from './components/Footer';
import {ResilientImage} from './components/BrandLogo';
import {ProductCard} from './components/ProductCard';
import {ProductDetailView} from './components/ProductDetailView';
import {CartDrawer} from './components/CartDrawer';
import {AuthModal} from './components/AuthModal';
import {CheckoutView} from './components/CheckoutView';
import {CustomerAreaView} from './components/CustomerAreaView';
import {AdminPanelView} from './components/AdminPanelView';
import {InstitutionalView} from './components/InstitutionalView';

const CART_STORAGE_KEY = 'suzy_bely_cart_v1';
const CART_SESSION_KEY = 'suzy_bely_session_v1';

function getOrCreateCartSessionKey(): string {
  try {
    const existing = localStorage.getItem(CART_SESSION_KEY);
    if (existing) return existing;
    const generated = `sb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CART_SESSION_KEY, generated);
    return generated;
  } catch {
    return 'sb-session';
  }
}

export default function App() {
  const [view, setView] = useState<AppView>('home');
  const [institutionalTab, setInstitutionalTab] = useState<InstitutionalTab>('sobre');

  // Storefront Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Filters & Selection
  const [homeSpotlight, setHomeSpotlight] = useState<'featured' | 'new' | 'bestseller' | 'promo'>('featured');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);
  const [onlyNewFilter, setOnlyNewFilter] = useState<boolean>(false);
  const [maxPriceReais, setMaxPriceReais] = useState<string>('');
  const [sortBy, setSortBy] = useState<'featured' | 'newest' | 'bestseller' | 'price_asc' | 'price_desc'>('featured');

  // PDP
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);

  // Cart
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [checkoutCep, setCheckoutCep] = useState('');
  const [checkoutShipping, setCheckoutShipping] = useState<ShippingOption | null>(null);

  // Customer Auth (kept in React memory via api.ts)
  const [user, setUser] = useState<User | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await apiRequest<{
        categories: Category[];
        products: Product[];
        banners: Banner[];
        testimonials: Testimonial[];
      }>('/api/catalog');
      setCategories(res.categories);
      setProducts(res.products);
      setBanners(res.banners);
      setTestimonials(res.testimonials);

      // Keep cart items synchronized with live prices and stock
      setCartItems((prev) =>
        prev.map((item) => {
          const live = res.products.find((p) => p.id === item.productId);
          if (!live) return item;
          return {
            ...item,
            name: live.name,
            priceCents: live.price_cents,
            promoPriceCents: live.promo_price_cents,
            stock: live.stock,
            imageUrl: live.images[0]?.url || item.imageUrl,
            quantity: Math.min(item.quantity, Math.max(1, live.stock)),
          };
        })
      );

      setSelectedProduct((prev) => {
        if (!prev) return null;
        return res.products.find((p) => p.id === prev.id) || prev;
      });
    } catch {
      // Keep current state gracefully
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Real-time SSE connection for instant admin price/promo/stock updates
  useEffect(() => {
    const source = new EventSource('/api/events');
    const handleUpdate = () => {
      loadCatalog();
    };
    source.addEventListener('catalog_updated', handleUpdate);
    source.addEventListener('banner_updated', handleUpdate);
    return () => {
      source.removeEventListener('catalog_updated', handleUpdate);
      source.removeEventListener('banner_updated', handleUpdate);
      source.close();
    };
  }, [loadCatalog]);

  // Persist cart in localStorage and sync to backend
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // Ignore storage quota errors
    }
    const sessionKey = getOrCreateCartSessionKey();
    apiRequest('/api/cart/sync', {
      method: 'POST',
      body: {
        sessionKey,
        items: cartItems.map((i) => ({productId: i.productId, quantity: i.quantity})),
      },
    }).catch(() => {
      // Non-blocking sync
    });
  }, [cartItems]);

  const handleNavigate = (nextView: AppView, categorySlug?: string) => {
    setView(nextView);
    if (categorySlug !== undefined) {
      setSelectedCategory(categorySlug);
    }
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const handleOpenProduct = async (product: Product) => {
    setSelectedProduct(product);
    setView('product');
    window.scrollTo({top: 0, behavior: 'smooth'});
    try {
      const res = await apiRequest<{product: Product; related: Product[]}>(`/api/products/${product.slug}`);
      setSelectedProduct(res.product);
      setRelatedProducts(res.related);
    } catch {
      setRelatedProducts(
        products.filter((p) => p.category_id === product.category_id && p.id !== product.id).slice(0, 4)
      );
    }
  };

  const handleAddToCart = (product: Product, quantity = 1) => {
    if (product.stock <= 0) return;
    setCartItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? {...i, quantity: Math.min(product.stock, i.quantity + quantity)}
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          slug: product.slug,
          imageUrl: product.images[0]?.url || '',
          priceCents: product.price_cents,
          promoPriceCents: product.promo_price_cents,
          stock: product.stock,
          quantity: Math.min(product.stock, quantity),
        },
      ];
    });
    setCartOpen(true);
  };

  const handleUpdateCartQty = (productId: number, qty: number) => {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setCartItems((prev) =>
      prev.map((i) => (i.productId === productId ? {...i, quantity: Math.min(i.stock, qty)} : i))
    );
  };

  const handleRemoveCartItem = (productId: number) => {
    setCartItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const cartCount = useMemo(() => cartItems.reduce((acc, item) => acc + item.quantity, 0), [cartItems]);

  // Home spotlight list
  const homeProducts = useMemo(() => {
    let list = [...products];
    if (homeSpotlight === 'featured') {
      list = list.filter((p) => p.is_featured);
    } else if (homeSpotlight === 'new') {
      list = list.filter((p) => p.is_new);
    } else if (homeSpotlight === 'bestseller') {
      list = list.filter((p) => p.is_bestseller || p.sales_count > 0);
    } else if (homeSpotlight === 'promo') {
      list = list.filter((p) => p.promo_price_cents !== null && p.promo_price_cents < p.price_cents);
    }
    return list.slice(0, 6);
  }, [products, homeSpotlight]);

  // Catalog filtered list
  const filteredCatalog = useMemo(() => {
    let list = [...products];
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'promocoes') {
        list = list.filter((p) => p.promo_price_cents !== null && p.promo_price_cents < p.price_cents);
      } else if (selectedCategory === 'lancamentos') {
        list = list.filter((p) => p.is_new);
      } else {
        list = list.filter((p) => p.category_slug === selectedCategory);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.material.toLowerCase().includes(q) ||
          p.category_name.toLowerCase().includes(q)
      );
    }
    if (onlyInStock) {
      list = list.filter((p) => p.stock > 0);
    }
    if (onlyNewFilter) {
      list = list.filter((p) => p.is_new);
    }
    if (maxPriceReais.trim()) {
      const maxCents = Math.round(parseFloat(maxPriceReais.replace(',', '.')) * 100);
      if (!Number.isNaN(maxCents) && maxCents > 0) {
        list = list.filter((p) => effectivePriceCents(p.price_cents, p.promo_price_cents) <= maxCents);
      }
    }

    if (sortBy === 'price_asc') {
      list.sort(
        (a, b) =>
          effectivePriceCents(a.price_cents, a.promo_price_cents) -
          effectivePriceCents(b.price_cents, b.promo_price_cents)
      );
    } else if (sortBy === 'price_desc') {
      list.sort(
        (a, b) =>
          effectivePriceCents(b.price_cents, b.promo_price_cents) -
          effectivePriceCents(a.price_cents, a.promo_price_cents)
      );
    } else if (sortBy === 'bestseller') {
      list.sort((a, b) => Number(b.is_bestseller) - Number(a.is_bestseller) || b.sales_count - a.sales_count);
    } else if (sortBy === 'newest') {
      list.sort((a, b) => Number(b.is_new) - Number(a.is_new) || b.id - a.id);
    }

    return list;
  }, [products, selectedCategory, searchQuery, onlyInStock, onlyNewFilter, maxPriceReais, sortBy]);

  const activeBanner = banners[0] || {
    id: 0,
    title: 'Beleza e elegância em cada detalhe',
    subtitle:
      'Bijuterias selecionadas com banho dourado hipoalergênico, peças exclusivas a partir de R$ 10,00 e entrega rápida para todo o Brasil.',
    cta_text: 'Explorar Coleção',
    cta_category: 'all',
    image_url: '/src/assets/images/hero_suzy_bely_jewelry_1795522216462.jpg',
    active: true,
    sort_order: 1,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FDF8F3] text-[#2D1B12]">
      <Header
        activeView={view}
        onNavigate={handleNavigate}
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <main className="flex-1">
        {/* ==================== HOME VIEW ==================== */}
        {view === 'home' && (
          <div className="space-y-20">
            {/* Section 1: Hero Banner */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch rounded-2xl overflow-hidden bg-[#FFFDF9] border border-[#EAD5BC]">
                <div className="lg:col-span-5 p-8 sm:p-12 lg:p-14 flex flex-col justify-center gap-6">
                  <div className="space-y-4">
                    <p className="text-xs font-semibold tracking-wider text-[#D94A12] uppercase">
                      Suzy Bely · Bijuterias &amp; Acessórios
                    </p>
                    <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#2D1B12] leading-[1.12] text-balance">
                      {activeBanner.title}
                    </h1>
                    <p className="text-sm sm:text-base text-[#5D4030] leading-relaxed max-w-md">
                      {activeBanner.subtitle}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <button
                      type="button"
                      onClick={() => handleNavigate('catalog', activeBanner.cta_category || 'all')}
                      className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] transition-colors cursor-pointer"
                    >
                      <span>{activeBanner.cta_text}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigate('catalog', 'promocoes')}
                      className="px-4 py-3 text-sm font-semibold text-[#2D1B12] hover:text-[#D94A12] transition-colors cursor-pointer"
                    >
                      Ver Promoções
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-7 min-h-[280px] sm:min-h-[380px] lg:min-h-[460px]">
                  <ResilientImage
                    src={activeBanner.image_url}
                    alt={activeBanner.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Categories + Curated Collection (Destaques, Novidades, Mais Vendidos, Promoções) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#2D1B12]">
                    Coleção Curada
                  </h2>
                  <p className="text-sm text-[#664938] mt-1">
                    Navegue livremente por categorias, lançamentos e promoções especiais.
                  </p>
                </div>

                {/* Segmented Spotlight Filter */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5E6D3]/80 rounded-lg w-fit">
                  {[
                    {id: 'featured' as const, label: 'Destaques'},
                    {id: 'new' as const, label: 'Novidades'},
                    {id: 'bestseller' as const, label: 'Mais Vendidos'},
                    {id: 'promo' as const, label: 'Promoções'},
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setHomeSpotlight(tab.id)}
                      className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        homeSpotlight === tab.id
                          ? 'bg-white text-[#2D1B12] shadow-xs'
                          : 'text-[#664938] hover:text-[#2D1B12]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category quick links */}
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-[#EAD5BC]">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleNavigate('catalog', cat.slug)}
                    className="px-4 py-2 rounded-lg bg-[#FFFDF9] border border-[#EAD5BC] text-xs font-medium text-[#2D1B12] hover:border-[#D94A12] hover:text-[#D94A12] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {cat.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleNavigate('catalog', 'promocoes')}
                  className="px-4 py-2 rounded-lg bg-[#FFFDF9] border border-[#D94A12]/40 text-xs font-semibold text-[#D94A12] hover:bg-[#D94A12] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Peças a partir de R$ 10
                </button>
              </div>

              {loadingCatalog ? (
                <div className="py-12 text-center text-sm text-[#664938]">Carregando coleção...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                  {homeProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={handleOpenProduct}
                      onAddToCart={(p) => handleAddToCart(p, 1)}
                    />
                  ))}
                </div>
              )}

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => handleNavigate('catalog', 'all')}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-[#2D1B12] text-sm font-semibold text-[#2D1B12] hover:bg-[#2D1B12] hover:text-white transition-colors cursor-pointer"
                >
                  <span>Ver Todo o Catálogo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </section>

            {/* Section 3: Sobre a Marca (with user storefront photo) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl overflow-hidden">
                <div className="lg:col-span-6 min-h-[260px]">
                  <ResilientImage
                    src="/assets/aistudio/processed-B1CAB384-C251-4B9B-80F7-C63E72402DB9_6c46a474.jpeg"
                    alt="Loja física Suzy Bely Bijuterias e Acessórios"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-center space-y-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#D94A12]">Sobre a Marca</p>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#2D1B12] text-balance">
                    Elegância acessível, confiança e atendimento humanizado
                  </h2>
                  <p className="text-sm sm:text-base text-[#5D4030] leading-relaxed">
                    Nossa missão é proporcionar beleza, autoestima e elegância através de bijuterias e acessórios acessíveis, oferecendo produtos de qualidade e uma experiência de compra agradável para clientes em todo o Brasil.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setInstitutionalTab('sobre');
                        handleNavigate('institucional');
                      }}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#D94A12] hover:underline cursor-pointer"
                    >
                      <span>Conheça nossa Missão, Visão e Valores</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4: Depoimentos de Clientes */}
            {testimonials.length > 0 && (
              <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
                <div>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#2D1B12]">
                    Quem usa Suzy Bely recomenda
                  </h2>
                  <p className="text-sm text-[#664938] mt-1">
                    Avaliações reais de clientes que receberam nossas peças em casa.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {testimonials.map((t) => (
                    <blockquote
                      key={t.id}
                      className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-6 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-1 text-[#C49A45]" aria-label={`${t.rating} de 5 estrelas`}>
                          {Array.from({length: t.rating}).map((_, idx) => (
                            <Star key={idx} className="w-4 h-4 fill-current" />
                          ))}
                        </div>
                        <p className="text-sm text-[#5D4030] leading-relaxed">"{t.comment}"</p>
                      </div>
                      <footer className="pt-3 border-t border-[#F5E6D3] text-xs">
                        <div className="font-semibold text-[#2D1B12]">{t.author_name}</div>
                        <div className="text-[#8B6F5C]">
                          {t.author_city} · {t.product_name}
                        </div>
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ==================== CATALOG VIEW ==================== */}
        {view === 'catalog' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
            <div className="space-y-2">
              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#2D1B12]">
                Catálogo de Bijuterias &amp; Acessórios
              </h1>
              <p className="text-sm text-[#664938]">
                Consulte preços, filtre por categoria ou disponibilidade e adicione à sacola sem precisar de login.
              </p>
            </div>

            {/* Filters Bar */}
            <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                <div className="lg:col-span-5 relative">
                  <Search className="w-4 h-4 text-[#8B6F5C] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar por nome, material ou cor..."
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#D94A12]"
                  />
                </div>

                <div className="lg:col-span-3">
                  <input
                    type="number"
                    min={1}
                    value={maxPriceReais}
                    onChange={(e) => setMaxPriceReais(e.target.value)}
                    placeholder="Preço máximo (R$)"
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#D94A12]"
                  />
                </div>

                <div className="lg:col-span-4 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#8B6F5C] shrink-0" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#D94A12]"
                  >
                    <option value="featured">Ordenar: Destaques</option>
                    <option value="newest">Ordenar: Lançamentos</option>
                    <option value="bestseller">Ordenar: Mais Vendidos</option>
                    <option value="price_asc">Menor Preço</option>
                    <option value="price_desc">Maior Preço</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F5E6D3]">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    {slug: 'all', name: 'Todos'},
                    ...categories.map((c) => ({slug: c.slug, name: c.name})),
                    {slug: 'promocoes', name: 'Promoções'},
                    {slug: 'lancamentos', name: 'Lançamentos'},
                  ].map((cat) => (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => setSelectedCategory(cat.slug)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCategory === cat.slug
                          ? 'bg-[#D94A12] text-white'
                          : 'bg-[#FDF8F3] text-[#5D4030] hover:bg-[#F5E6D3]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-xs text-[#5D4030]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyInStock}
                      onChange={(e) => setOnlyInStock(e.target.checked)}
                      className="accent-[#D94A12]"
                    />
                    <span>Em estoque</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyNewFilter}
                      onChange={(e) => setOnlyNewFilter(e.target.checked)}
                      className="accent-[#D94A12]"
                    />
                    <span>Novidades</span>
                  </label>
                </div>
              </div>
            </div>

            {filteredCatalog.length === 0 ? (
              <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-12 text-center space-y-3">
                <p className="font-display text-xl text-[#2D1B12]">Nenhuma peça encontrada com esses filtros</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSearchQuery('');
                    setOnlyInStock(false);
                    setOnlyNewFilter(false);
                    setMaxPriceReais('');
                  }}
                  className="px-4 py-2 rounded-lg border border-[#2D1B12] text-xs font-semibold cursor-pointer"
                >
                  Limpar Filtros
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                {filteredCatalog.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={handleOpenProduct}
                    onAddToCart={(p) => handleAddToCart(p, 1)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== PRODUCT DETAIL VIEW ==================== */}
        {view === 'product' && selectedProduct && (
          <ProductDetailView
            product={selectedProduct}
            related={relatedProducts}
            onBack={() => handleNavigate('catalog')}
            onSelectProduct={handleOpenProduct}
            onAddToCart={handleAddToCart}
          />
        )}

        {/* ==================== CHECKOUT VIEW ==================== */}
        {view === 'checkout' && (
          <CheckoutView
            items={cartItems}
            user={user}
            addresses={addresses}
            initialCep={checkoutCep}
            initialShipping={checkoutShipping}
            onAuthSuccess={(loggedUser, userAddresses) => {
              setUser(loggedUser);
              setAddresses(userAddresses);
            }}
            onOrderCompleted={() => {
              setCartItems([]);
              loadCatalog();
            }}
            onGoToOrders={() => handleNavigate('account')}
            onBackToStore={() => handleNavigate('catalog', 'all')}
          />
        )}

        {/* ==================== CUSTOMER AREA VIEW ==================== */}
        {view === 'account' && (
          user ? (
            <CustomerAreaView
              user={user}
              addresses={addresses}
              onUpdateUser={setUser}
              onUpdateAddresses={setAddresses}
              onLogout={() => {
                setCustomerToken(null);
                setUser(null);
                setAddresses([]);
                handleNavigate('home');
              }}
            />
          ) : (
            <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
              <h1 className="font-display text-2xl text-[#2D1B12]">Acesse sua Área do Cliente</h1>
              <p className="text-sm text-[#664938]">Entre com seu e-mail e senha para acompanhar pedidos e endereços.</p>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-6 py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
              >
                Entrar ou Cadastrar
              </button>
            </div>
          )
        )}

        {/* ==================== INSTITUTIONAL & POLICIES VIEW ==================== */}
        {view === 'institucional' && (
          <InstitutionalView
            activeTab={institutionalTab}
            onChangeTab={setInstitutionalTab}
            onExploreCatalog={() => handleNavigate('catalog', 'all')}
          />
        )}

        {/* ==================== ADMIN PANEL VIEW ==================== */}
        {view === 'admin' && <AdminPanelView onCatalogMutated={loadCatalog} />}
      </main>

      <Footer
        onNavigate={handleNavigate}
        onOpenPolicy={(tab) => {
          setInstitutionalTab(tab);
          handleNavigate('institucional');
        }}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cartItems}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onCheckout={(cep, shipping) => {
          setCheckoutCep(cep);
          setCheckoutShipping(shipping);
          handleNavigate('checkout');
        }}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(loggedUser, userAddresses) => {
          setUser(loggedUser);
          setAddresses(userAddresses);
          if (view === 'home' || view === 'catalog') {
            handleNavigate('account');
          }
        }}
      />
    </div>
  );
}
