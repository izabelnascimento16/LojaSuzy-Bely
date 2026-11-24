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
  PublicStoreSettings,
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
import {OfflineIndicator, PWAInstallPrompt} from './components/PWAInstallPrompt';

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
  const [storeSettings, setStoreSettings] = useState<PublicStoreSettings | null>(null);
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
        storeSettings?: PublicStoreSettings;
      }>('/api/catalog');
      setCategories(res.categories);
      setProducts(res.products);
      setBanners(res.banners);
      setTestimonials(res.testimonials);
      if (res.storeSettings) setStoreSettings(res.storeSettings);

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
    source.addEventListener('settings_updated', handleUpdate);
    return () => {
      source.removeEventListener('catalog_updated', handleUpdate);
      source.removeEventListener('banner_updated', handleUpdate);
      source.removeEventListener('settings_updated', handleUpdate);
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
      'Bijuterias selecionadas com banho dourado hipoalergênico, peças delicadas e entrega rápida para todo o Brasil.',
    cta_text: 'Explorar Coleção',
    cta_category: 'all',
    image_url: '/assets/aistudio/Gemini_Generated_Image_jwylupjwylupjwyl_8ff55566.jpg',
    active: true,
    sort_order: 1,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF4EB] text-[#3D2113]">
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
          <div className="space-y-14 sm:space-y-20">
            {/* Section 1: Hero Banner — Vibrant Orange Showcase featuring Suzy Bely Storefront Photo */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch rounded-2xl overflow-hidden bg-gradient-to-br from-[#EA580C] via-[#F97316] to-[#FB923C] border-2 border-[#EA580C]/25 shadow-xl shadow-[#EA580C]/20">
                <div className="lg:col-span-5 p-6 sm:p-10 lg:p-12 flex flex-col justify-center gap-5 sm:gap-6 order-last lg:order-first text-white">
                  <div className="space-y-3 sm:space-y-4">
                    <p className="text-xs font-bold tracking-widest text-[#FFE8D4] uppercase">
                      Suzy Bely · Bijuterias &amp; Acessórios
                    </p>
                    <h1 className="font-display text-2xl sm:text-4xl lg:text-[2.75rem] font-bold text-white leading-[1.12] text-balance drop-shadow-xs">
                      {activeBanner.title}
                    </h1>
                    <p className="text-sm sm:text-base text-[#FFF4EB] leading-relaxed max-w-md">
                      {activeBanner.subtitle}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-3.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleNavigate('catalog', activeBanner.cta_category || 'all')}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white text-[#EA580C] text-sm font-bold hover:bg-[#FFF2E6] transition-all shadow-md cursor-pointer min-h-[46px]"
                    >
                      <span>{activeBanner.cta_text}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigate('catalog', 'promocoes')}
                      className="px-5 py-3 rounded-xl border border-white/60 bg-white/10 text-sm font-semibold text-white hover:bg-white/20 transition-colors cursor-pointer text-center min-h-[46px]"
                    >
                      Ver Promoções
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-7 aspect-[16/10] sm:aspect-[16/9] lg:aspect-auto lg:min-h-[460px] order-first lg:order-last bg-[#FFF2E6]">
                  <ResilientImage
                    src={activeBanner.image_url}
                    alt={activeBanner.title}
                    priority
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Categories + Curated Collection (Destaques, Novidades, Mais Vendidos, Promoções) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#EA580C] mb-1">
                    Vitrine Oficial
                  </p>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#3D2113]">
                    Coleção Curada
                  </h2>
                  <p className="text-sm text-[#7A4D35] mt-1">
                    Navegue livremente por categorias, lançamentos e promoções especiais.
                  </p>
                </div>

                {/* Segmented Spotlight Filter */}
                <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap items-center gap-1 p-1.5 bg-[#FFE3CC] rounded-xl w-full sm:w-fit border border-[#FDBA74]/60">
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
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer ${
                        homeSpotlight === tab.id
                          ? 'bg-[#EA580C] text-white shadow-xs'
                          : 'text-[#5E3824] hover:text-[#EA580C]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category quick links - swipeable on mobile, wrapped on tablet/desktop */}
              <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap items-center gap-2 pb-3 border-b border-[#FDBA74]/50">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleNavigate('catalog', cat.slug)}
                    className="px-4 py-2.5 rounded-lg bg-[#FFFFFF] border border-[#FDBA74]/70 text-xs font-semibold text-[#3D2113] hover:bg-[#EA580C] hover:border-[#EA580C] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
                  >
                    {cat.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleNavigate('catalog', 'promocoes')}
                  className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#F97316] to-[#EA580C] text-xs font-bold text-white hover:from-[#EA580C] hover:to-[#C94506] transition-all shadow-xs whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
                >
                  Ofertas Especiais
                </button>
              </div>

              {loadingCatalog ? (
                <div className="py-12 text-center text-sm text-[#7A4D35]">Carregando coleção...</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
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
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] shadow-md shadow-[#EA580C]/20 transition-colors cursor-pointer min-h-[46px]"
                >
                  <span>Ver Todo o Catálogo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </section>

            {/* Section 3: Sobre a Marca */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch bg-gradient-to-br from-[#FFFFFF] via-[#FFF6EE] to-[#FFE3CC] border-2 border-[#FDBA74]/60 rounded-2xl overflow-hidden shadow-md shadow-[#EA580C]/10">
                <div className="lg:col-span-6 min-h-[260px] lg:min-h-[360px]">
                  <ResilientImage
                    src="/src/assets/images/hero_suzy_bely_jewelry_1795522216462.jpg"
                    alt="Coleção exclusiva Suzy Bely Bijuterias e Acessórios"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="lg:col-span-6 p-7 sm:p-12 flex flex-col justify-center space-y-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#EA580C]">Sobre a Marca</p>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#3D2113] text-balance">
                    Elegância acessível, confiança e atendimento humanizado
                  </h2>
                  <p className="text-sm sm:text-base text-[#5E3824] leading-relaxed">
                    Nossa missão é proporcionar beleza, autoestima e elegância através de bijuterias e acessórios acessíveis, oferecendo produtos de qualidade e uma experiência de compra agradável para clientes em todo o Brasil.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setInstitutionalTab('sobre');
                        handleNavigate('institucional');
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#EA580C]/10 text-sm font-bold text-[#EA580C] hover:bg-[#EA580C] hover:text-white transition-colors cursor-pointer min-h-[42px]"
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
              <section className="bg-[#FFE8D4]/70 border-y border-[#FDBA74]/50 py-12 sm:py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#EA580C] mb-1">
                      Avaliações Reais
                    </p>
                    <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#3D2113]">
                      Quem usa Suzy Bely recomenda
                    </h2>
                    <p className="text-sm text-[#7A4D35] mt-1">
                      Clientes que receberam nossas peças em casa e aprovaram cada detalhe.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {testimonials.map((t) => (
                      <blockquote
                        key={t.id}
                        className="bg-[#FFFFFF] border border-[#FDBA74]/60 rounded-xl p-6 flex flex-col justify-between gap-4 shadow-xs"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center gap-1 text-[#F97316]" aria-label={`${t.rating} de 5 estrelas`}>
                            {Array.from({length: t.rating}).map((_, idx) => (
                              <Star key={idx} className="w-4 h-4 fill-current" />
                            ))}
                          </div>
                          <p className="text-sm text-[#5E3824] leading-relaxed">"{t.comment}"</p>
                        </div>
                        <footer className="pt-3 border-t border-[#FFE8D4] text-xs">
                          <div className="font-semibold text-[#3D2113]">{t.author_name}</div>
                          <div className="text-[#9A6B50]">
                            {t.author_city} · {t.product_name}
                          </div>
                        </footer>
                      </blockquote>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ==================== CATALOG VIEW ==================== */}
        {view === 'catalog' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
            <div className="space-y-2">
              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#3D2113]">
                Catálogo de Bijuterias &amp; Acessórios
              </h1>
              <p className="text-sm text-[#7A4D35]">
                Consulte preços, filtre por categoria ou disponibilidade e adicione à sacola sem precisar de login.
              </p>
            </div>

            {/* Filters Bar */}
            <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                <div className="lg:col-span-5 relative">
                  <Search className="w-4 h-4 text-[#9A6B50] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar por nome, material ou cor..."
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div className="lg:col-span-3">
                  <input
                    type="number"
                    min={1}
                    value={maxPriceReais}
                    onChange={(e) => setMaxPriceReais(e.target.value)}
                    placeholder="Preço máximo (R$)"
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div className="lg:col-span-4 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#9A6B50] shrink-0" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#EA580C]"
                  >
                    <option value="featured">Ordenar: Destaques</option>
                    <option value="newest">Ordenar: Lançamentos</option>
                    <option value="bestseller">Ordenar: Mais Vendidos</option>
                    <option value="price_asc">Menor Preço</option>
                    <option value="price_desc">Maior Preço</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 pt-2 border-t border-[#FFE8D4]">
                <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-1.5 pb-1 sm:pb-0">
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
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] ${
                        selectedCategory === cat.slug
                          ? 'bg-[#EA580C] text-white'
                          : 'bg-[#FFF9F4] text-[#5E3824] hover:bg-[#FFE8D4]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-xs text-[#5E3824]">
                  <label className="flex items-center gap-2 cursor-pointer min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={onlyInStock}
                      onChange={(e) => setOnlyInStock(e.target.checked)}
                      className="accent-[#EA580C] w-4 h-4"
                    />
                    <span>Em estoque</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={onlyNewFilter}
                      onChange={(e) => setOnlyNewFilter(e.target.checked)}
                      className="accent-[#EA580C] w-4 h-4"
                    />
                    <span>Novidades</span>
                  </label>
                </div>
              </div>
            </div>

            {filteredCatalog.length === 0 ? (
              <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-12 text-center space-y-3">
                <p className="font-display text-xl text-[#3D2113]">Nenhuma peça encontrada com esses filtros</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSearchQuery('');
                    setOnlyInStock(false);
                    setOnlyNewFilter(false);
                    setMaxPriceReais('');
                  }}
                  className="px-4 py-2.5 rounded-lg border border-[#3D2113] text-xs font-semibold cursor-pointer min-h-[44px]"
                >
                  Limpar Filtros
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
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
            storeSettings={storeSettings}
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
              <h1 className="font-display text-2xl text-[#3D2113]">Acesse sua Área do Cliente</h1>
              <p className="text-sm text-[#7A4D35]">Entre com seu e-mail e senha para acompanhar pedidos e endereços.</p>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-6 py-3 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
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
        storeSettings={storeSettings}
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
        storeSettings={storeSettings}
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

      <PWAInstallPrompt />
      <OfflineIndicator />
    </div>
  );
}
