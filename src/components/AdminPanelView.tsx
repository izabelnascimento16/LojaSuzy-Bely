import {useEffect, useState} from 'react';
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  Edit3,
  Image as ImageIcon,
  Lock,
  LogOut,
  Package,
  Plus,
  Shield,
  ShoppingCart,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import type {Banner, Category, Order, Product, User} from '../types';
import {apiRequest, getAdminToken, setAdminToken} from '../services/api';
import {formatBRL, ORDER_STATUS_LABELS} from '../utils/format';
import {ResilientImage} from './BrandLogo';

interface AdminPanelViewProps {
  onCatalogMutated: () => void;
}

interface DashboardData {
  salesSummary: {
    total_orders: number;
    revenue_cents: number;
    pending_orders: number;
    processing_orders: number;
    fulfilled_orders: number;
  };
  inventorySummary: {
    total_products: number;
    total_units: number;
    low_stock_count: number;
    promo_count: number;
  };
  customerCount: number;
  categoryBreakdown: {
    category_name: string;
    product_count: number;
    stock_units: number;
    sales_cents: number;
  }[];
  products: Product[];
  categories: Category[];
  auditLogs: {
    id: number;
    actor_email: string;
    action: string;
    entity_type: string;
    details: string;
    created_at: string;
  }[];
}

const STUDIO_IMAGES = [
  {label: 'Brincos Dourados & Pérola', url: '/src/assets/images/product_brincos_dourados_1795522216821.jpg'},
  {label: 'Colares Delicados', url: '/src/assets/images/product_colares_delicados_1795522218417.jpg'},
  {label: 'Pulseiras & Anéis', url: '/src/assets/images/product_pulseiras_aneis_1795522217768.jpg'},
  {label: 'Conjuntos de Pérolas', url: '/src/assets/images/product_conjuntos_perolas_1795522217179.jpg'},
  {label: 'Tornozeleiras & Acessórios', url: '/src/assets/images/product_tornozeleira_acessorio_1795522218708.jpg'},
  {label: 'Editorial Suzy Bely', url: '/src/assets/images/hero_suzy_bely_jewelry_1795522216462.jpg'},
];

export function AdminPanelView({onCatalogMutated}: AdminPanelViewProps) {
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [hasEnvPasscode, setHasEnvPasscode] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Auth inputs
  const [authFullName, setAuthFullName] = useState('Suzy Bely Proprietária');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // Tabs
  const [tab, setTab] = useState<'inventory' | 'orders' | 'reports' | 'customers' | 'banners' | 'staff'>('inventory');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<
    {
      id: number;
      full_name: string;
      cpf_masked: string;
      email: string;
      phone: string;
      orders_count: number;
      total_spent_cents: number;
    }[]
  >([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [staffList, setStaffList] = useState<
    {id: number; role: string; full_name: string; email: string; active: boolean; permissions: string[]}[]
  >([]);

  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Quick inline inventory editor state keyed by product ID
  const [inlineEdits, setInlineEdits] = useState<
    Record<number, {priceReais: string; promoReais: string; stock: string}>
  >({});

  // Product Form Modal
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pCatId, setPCatId] = useState<number>(1);
  const [pName, setPName] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pMaterial, setPMaterial] = useState('Liga metálica com banho dourado 18k hipoalergênico');
  const [pColor, setPColor] = useState('Dourado Suave');
  const [pDim, setPDim] = useState('');
  const [pPriceReais, setPPriceReais] = useState('19.90');
  const [pPromoReais, setPPromoReais] = useState('');
  const [pStock, setPStock] = useState('20');
  const [pImageUrl, setPImageUrl] = useState(STUDIO_IMAGES[0].url);
  const [pFeatured, setPFeatured] = useState(true);
  const [pNew, setPNew] = useState(true);
  const [pBestseller, setPBestseller] = useState(false);

  // Category creation
  const [newCatName, setNewCatName] = useState('');

  // Banner creation
  const [bTitle, setBTitle] = useState('');
  const [bSubtitle, setBSubtitle] = useState('');
  const [bCtaText, setBCtaText] = useState('Explorar Coleção');
  const [bImageUrl, setBImageUrl] = useState(STUDIO_IMAGES[5].url);

  // Staff creation
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPass, setSPass] = useState('');
  const [sPerms, setSPerms] = useState<string[]>(['manage_products', 'manage_orders']);

  useEffect(() => {
    const check = async () => {
      try {
        const status = await apiRequest<{needsBootstrap: boolean; hasEnvPasscode: boolean}>('/api/admin/status');
        setNeedsBootstrap(status.needsBootstrap);
        setHasEnvPasscode(status.hasEnvPasscode);
        if (getAdminToken()) {
          const me = await apiRequest<{user: User}>('/api/auth/me', {useAdminToken: true});
          if (me.user.role === 'admin' || me.user.role === 'staff') {
            setAdminUser(me.user);
          }
        }
      } catch {
        setAdminToken(null);
      } finally {
        setCheckingStatus(false);
      }
    };
    check();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await apiRequest<DashboardData>('/api/admin/dashboard', {useAdminToken: true});
      setDashboard(data);
      const map: Record<number, {priceReais: string; promoReais: string; stock: string}> = {};
      for (const p of data.products) {
        map[p.id] = {
          priceReais: (p.price_cents / 100).toFixed(2),
          promoReais: p.promo_price_cents !== null ? (p.promo_price_cents / 100).toFixed(2) : '',
          stock: String(p.stock),
        };
      }
      setInlineEdits(map);
      if (data.categories.length > 0 && !pCatId) {
        setPCatId(data.categories[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar painel.');
    }
  };

  const loadOrders = async () => {
    try {
      const res = await apiRequest<{orders: Order[]}>('/api/admin/orders', {useAdminToken: true});
      setOrders(res.orders);
    } catch {
      // May lack permission
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await apiRequest<{customers: typeof customers}>('/api/admin/customers', {useAdminToken: true});
      setCustomers(res.customers);
    } catch {
      // May lack permission
    }
  };

  const loadBanners = async () => {
    try {
      const res = await apiRequest<{banners: Banner[]}>('/api/admin/banners', {useAdminToken: true});
      setBanners(res.banners);
    } catch {
      // May lack permission
    }
  };

  const loadStaff = async () => {
    try {
      const res = await apiRequest<{staff: typeof staffList}>('/api/admin/staff', {useAdminToken: true});
      setStaffList(res.staff);
    } catch {
      // Only owner manages staff
    }
  };

  useEffect(() => {
    if (!adminUser) return;
    loadDashboard();
    loadOrders();
    loadCustomers();
    loadBanners();
    loadStaff();
  }, [adminUser]);

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiRequest<{token: string; user: User}>('/api/admin/bootstrap', {
        method: 'POST',
        body: {fullName: authFullName, email: authEmail, password: authPassword},
      });
      setAdminToken(res.token);
      setAdminUser(res.user);
      setNeedsBootstrap(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao configurar acesso da loja.');
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiRequest<{token: string; user: User}>('/api/admin/login', {
        method: 'POST',
        body: {email: authEmail, password: authPassword},
      });
      setAdminToken(res.token);
      setAdminUser(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciais inválidas.');
    }
  };

  const handleQuickSave = async (productId: number) => {
    const row = inlineEdits[productId];
    if (!row) return;
    setError('');
    setFeedback('');

    const priceCents = Math.round(parseFloat(row.priceReais.replace(',', '.')) * 100);
    const promoCents = row.promoReais.trim()
      ? Math.round(parseFloat(row.promoReais.replace(',', '.')) * 100)
      : null;
    const stock = Math.max(0, parseInt(row.stock, 10) || 0);

    try {
      const res = await apiRequest<{message: string}>(`/api/admin/products/${productId}/quick-stock`, {
        method: 'PATCH',
        useAdminToken: true,
        body: {priceCents, promoPriceCents: promoCents, stock},
      });
      setFeedback(res.message);
      await loadDashboard();
      onCatalogMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar inventário.');
    }
  };

  const openNewProductModal = () => {
    setEditingProduct(null);
    setPCatId(dashboard?.categories[0]?.id || 1);
    setPName('');
    setPDesc('');
    setPMaterial('Liga metálica com banho dourado 18k hipoalergênico');
    setPColor('Dourado Suave');
    setPDim('');
    setPPriceReais('29.90');
    setPPromoReais('');
    setPStock('20');
    setPImageUrl(STUDIO_IMAGES[0].url);
    setPFeatured(true);
    setPNew(true);
    setPBestseller(false);
    setProductModalOpen(true);
  };

  const openEditProductModal = (p: Product) => {
    setEditingProduct(p);
    setPCatId(p.category_id);
    setPName(p.name);
    setPDesc(p.description);
    setPMaterial(p.material);
    setPColor(p.color);
    setPDim(p.dimensions);
    setPPriceReais((p.price_cents / 100).toFixed(2));
    setPPromoReais(p.promo_price_cents !== null ? (p.promo_price_cents / 100).toFixed(2) : '');
    setPStock(String(p.stock));
    setPImageUrl(p.images[0]?.url || STUDIO_IMAGES[0].url);
    setPFeatured(p.is_featured);
    setPNew(p.is_new);
    setPBestseller(p.is_bestseller);
    setProductModalOpen(true);
  };

  const handleSaveProductModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');

    const priceCents = Math.round(parseFloat(pPriceReais.replace(',', '.')) * 100);
    const promoPriceCents = pPromoReais.trim()
      ? Math.round(parseFloat(pPromoReais.replace(',', '.')) * 100)
      : null;
    const stock = Math.max(0, parseInt(pStock, 10) || 0);

    const payload = {
      categoryId: pCatId,
      name: pName,
      description: pDesc,
      material: pMaterial,
      color: pColor,
      dimensions: pDim,
      priceCents,
      promoPriceCents,
      stock,
      isFeatured: pFeatured,
      isNew: pNew,
      isBestseller: pBestseller,
      imageUrls: [pImageUrl],
    };

    try {
      if (editingProduct) {
        await apiRequest(`/api/admin/products/${editingProduct.id}`, {
          method: 'PUT',
          useAdminToken: true,
          body: payload,
        });
        setFeedback('Joia atualizada e sincronizada em tempo real!');
      } else {
        await apiRequest('/api/admin/products', {
          method: 'POST',
          useAdminToken: true,
          body: payload,
        });
        setFeedback('Nova joia adicionada ao catálogo em tempo real!');
      }
      setProductModalOpen(false);
      await loadDashboard();
      onCatalogMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar joia.');
    }
  };

  const handleDeleteProduct = async (id: number) => {
    setError('');
    try {
      await apiRequest(`/api/admin/products/${id}`, {method: 'DELETE', useAdminToken: true});
      setFeedback('Produto removido do catálogo.');
      await loadDashboard();
      onCatalogMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setError('');
    try {
      await apiRequest('/api/admin/categories', {
        method: 'POST',
        useAdminToken: true,
        body: {name: newCatName},
      });
      setNewCatName('');
      setFeedback('Categoria criada.');
      await loadDashboard();
      onCatalogMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar categoria.');
    }
  };

  const handleUpdateOrderStatus = async (orderId: number, status: string, trackingCode?: string) => {
    setError('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        useAdminToken: true,
        body: {status, trackingCode},
      });
      setFeedback('Status do pedido atualizado.');
      loadOrders();
      loadDashboard();
      onCatalogMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar pedido.');
    }
  };

  const handleAddBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/admin/banners', {
        method: 'POST',
        useAdminToken: true,
        body: {title: bTitle, subtitle: bSubtitle, ctaText: bCtaText, imageUrl: bImageUrl},
      });
      setBTitle('');
      setBSubtitle('');
      setFeedback('Banner publicado na página inicial!');
      loadBanners();
      onCatalogMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar banner.');
    }
  };

  const handleToggleBanner = async (b: Banner) => {
    try {
      await apiRequest(`/api/admin/banners/${b.id}`, {
        method: 'PUT',
        useAdminToken: true,
        body: {
          title: b.title,
          subtitle: b.subtitle,
          ctaText: b.cta_text,
          ctaCategory: b.cta_category,
          imageUrl: b.image_url,
          active: !b.active,
        },
      });
      loadBanners();
      onCatalogMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar banner.');
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/admin/staff', {
        method: 'POST',
        useAdminToken: true,
        body: {fullName: sName, email: sEmail, password: sPass, permissions: sPerms},
      });
      setSName('');
      setSEmail('');
      setSPass('');
      setFeedback('Colaboradora cadastrada com permissões personalizadas.');
      loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar colaboradora.');
    }
  };

  if (checkingStatus) {
    return <div className="max-w-xl mx-auto py-20 text-center text-sm text-[#664938]">Verificando acesso administrativo...</div>;
  }

  // First-Run Setup or Login Gate
  if (!adminUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 sm:p-8 space-y-5 shadow-sm">
          <div className="flex items-center gap-2.5 text-[#D94A12]">
            <Shield className="w-6 h-6" />
            <h1 className="font-display text-2xl font-semibold text-[#2D1B12]">
              {needsBootstrap ? 'Configurar Painel da Loja' : 'Painel Administrativo'}
            </h1>
          </div>

          <p className="text-sm text-[#5D4030] leading-relaxed">
            {needsBootstrap
              ? 'Primeiro acesso detectado. Crie o usuário e a senha da proprietária para gerenciar joias, preços, promoções e estoque em tempo real.'
              : hasEnvPasscode
                ? 'Informe o código de acesso administrativo ou seu e-mail e senha de colaboradora.'
                : 'Entre com o e-mail e senha de administradora ou colaboradora da loja.'}
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-[#D94A12]/10 border border-[#D94A12]/30 text-xs text-[#B83C0B] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={needsBootstrap ? handleBootstrap : handleAdminLogin} className="space-y-4">
            {needsBootstrap && (
              <div>
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Nome da Proprietária</label>
                <input
                  type="text"
                  required
                  value={authFullName}
                  onChange={(e) => setAuthFullName(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">
                E-mail Administrativo {hasEnvPasscode && !needsBootstrap ? '(opcional com código)' : '*'}
              </label>
              <input
                type="email"
                required={!hasEnvPasscode || needsBootstrap}
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="suzy@suzybely.com.br"
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">
                {needsBootstrap ? 'Escolha sua senha (mín. 6 caracteres)' : 'Senha / Código de Acesso'}
              </label>
              <input
                type="password"
                required
                minLength={needsBootstrap ? 6 : 1}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{needsBootstrap ? 'Criar Acesso da Proprietária' : 'Entrar no Painel'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EAD5BC]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#D94A12]">
            Gestão em Tempo Real · {adminUser.role === 'admin' ? 'Proprietária' : 'Equipe'}
          </p>
          <h1 className="font-display text-3xl font-semibold text-[#2D1B12]">Painel Administrativo Suzy Bely</h1>
        </div>
        <div className="flex items-center gap-3">
          {adminUser.permissions.includes('manage_products') && (
            <button
              type="button"
              onClick={openNewProductModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Joia</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setAdminToken(null);
              setAdminUser(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#EAD5BC] bg-white text-sm font-medium text-[#2D1B12] hover:bg-[#F5E6D3] cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      {dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-5">
            <div className="text-xs text-[#8B6F5C]">Faturamento Real</div>
            <div className="text-2xl font-bold text-[#2D1B12] tabular-nums mt-1">
              {formatBRL(dashboard.salesSummary.revenue_cents)}
            </div>
            <div className="text-xs text-[#664938] mt-1 tabular-nums">
              {dashboard.salesSummary.total_orders} pedidos registrados
            </div>
          </div>

          <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-5">
            <div className="text-xs text-[#8B6F5C]">Catálogo Ativo</div>
            <div className="text-2xl font-bold text-[#2D1B12] tabular-nums mt-1">
              {dashboard.inventorySummary.total_products} peças
            </div>
            <div className="text-xs text-[#664938] mt-1 tabular-nums">
              {dashboard.inventorySummary.total_units} unidades em estoque
            </div>
          </div>

          <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-5">
            <div className="text-xs text-[#8B6F5C]">Em Promoção</div>
            <div className="text-2xl font-bold text-[#D94A12] tabular-nums mt-1">
              {dashboard.inventorySummary.promo_count} peças
            </div>
            <div className="text-xs text-[#664938] mt-1">Com desconto ativo</div>
          </div>

          <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-5">
            <div className="text-xs text-[#8B6F5C]">Estoque Baixo (≤ 5)</div>
            <div className="text-2xl font-bold text-[#2D1B12] tabular-nums mt-1">
              {dashboard.inventorySummary.low_stock_count} itens
            </div>
            <div className="text-xs text-[#664938] mt-1 tabular-nums">
              {dashboard.customerCount} clientes cadastrados
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[#F5E6D3]/60 rounded-xl w-fit">
        {[
          {id: 'inventory' as const, label: 'Joias & Estoque', icon: Tag},
          {id: 'orders' as const, label: 'Pedidos', icon: ShoppingCart},
          {id: 'reports' as const, label: 'Vendas & Relatórios', icon: BarChart3},
          {id: 'customers' as const, label: 'Clientes', icon: Users},
          {id: 'banners' as const, label: 'Banners', icon: ImageIcon},
          ...(adminUser.role === 'admin' ? [{id: 'staff' as const, label: 'Equipe', icon: Shield}] : []),
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                tab === item.id ? 'bg-white text-[#2D1B12] shadow-xs' : 'text-[#664938] hover:text-[#2D1B12]'
              }`}
            >
              <Icon className="w-4 h-4 text-[#D94A12]" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#D94A12]/10 border border-[#D94A12]/30 text-sm text-[#B83C0B] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {feedback && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>{feedback}</span>
        </div>
      )}

      {/* TAB 1: INVENTORY & REAL-TIME PRICE/DISCOUNT MANAGER */}
      {tab === 'inventory' && dashboard && (
        <div className="space-y-8">
          <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EAD5BC] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold text-[#2D1B12]">
                  Controle de Preços, Descontos e Inventário em Tempo Real
                </h2>
                <p className="text-xs text-[#664938] mt-0.5">
                  Altere preço, valor promocional ou estoque diretamente na linha e clique em Salvar para atualizar a loja instantaneamente.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewProductModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2D1B12] text-white text-xs font-semibold hover:bg-[#462B1D] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Joia</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FDF8F3] border-b border-[#EAD5BC] text-xs text-[#664938]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Peça</th>
                    <th className="px-4 py-3 font-semibold">Categoria</th>
                    <th className="px-4 py-3 font-semibold">Preço (R$)</th>
                    <th className="px-4 py-3 font-semibold">Promoção (R$)</th>
                    <th className="px-4 py-3 font-semibold">Estoque</th>
                    <th className="px-4 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5E6D3]">
                  {dashboard.products.map((p) => {
                    const edit = inlineEdits[p.id] || {
                      priceReais: (p.price_cents / 100).toFixed(2),
                      promoReais: p.promo_price_cents !== null ? (p.promo_price_cents / 100).toFixed(2) : '',
                      stock: String(p.stock),
                    };
                    return (
                      <tr key={p.id} className={!p.active ? 'opacity-55 bg-[#FDF8F3]' : ''}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg overflow-hidden border border-[#EAD5BC] shrink-0">
                              <ResilientImage src={p.images[0]?.url || ''} alt={p.name} />
                            </div>
                            <div className="min-w-[160px]">
                              <div className="font-semibold text-[#2D1B12] line-clamp-1">{p.name}</div>
                              <div className="text-xs text-[#8B6F5C]">{p.color}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#5D4030] whitespace-nowrap">{p.category_name}</td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={edit.priceReais}
                            onChange={(e) =>
                              setInlineEdits((prev) => ({
                                ...prev,
                                [p.id]: {...edit, priceReais: e.target.value},
                              }))
                            }
                            aria-label={`Preço de ${p.name}`}
                            className="w-24 bg-white border border-[#EAD5BC] rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={edit.promoReais}
                            placeholder="Sem promo"
                            onChange={(e) =>
                              setInlineEdits((prev) => ({
                                ...prev,
                                [p.id]: {...edit, promoReais: e.target.value},
                              }))
                            }
                            aria-label={`Promoção de ${p.name}`}
                            className="w-24 bg-white border border-[#EAD5BC] rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            value={edit.stock}
                            onChange={(e) =>
                              setInlineEdits((prev) => ({
                                ...prev,
                                [p.id]: {...edit, stock: e.target.value},
                              }))
                            }
                            aria-label={`Estoque de ${p.name}`}
                            className={`w-20 bg-white border rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums ${
                              Number(edit.stock) <= 5 ? 'border-[#D94A12] text-[#D94A12] font-bold' : 'border-[#EAD5BC]'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleQuickSave(p.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#D94A12] text-white text-xs font-semibold hover:bg-[#B83C0B] cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Salvar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditProductModal(p)}
                              aria-label={`Editar detalhes de ${p.name}`}
                              className="p-1.5 rounded-lg border border-[#EAD5BC] text-[#5D4030] hover:bg-[#F5E6D3] cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p.id)}
                              aria-label={`Excluir ${p.name}`}
                              className="p-1.5 rounded-lg border border-[#EAD5BC] text-[#8B6F5C] hover:text-[#D94A12] cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Categories management */}
          <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-[#2D1B12]">Organizar Categorias</h3>
            <form onSubmit={handleAddCategory} className="flex flex-wrap gap-2 max-w-md">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nome da nova categoria..."
                className="flex-1 bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#2D1B12] text-white text-xs font-semibold hover:bg-[#462B1D] cursor-pointer"
              >
                Adicionar Categoria
              </button>
            </form>
            <div className="flex flex-wrap gap-2 pt-1">
              {dashboard.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="px-3.5 py-2 rounded-lg bg-[#FDF8F3] border border-[#EAD5BC] text-xs font-medium text-[#2D1B12]"
                >
                  {cat.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORDERS */}
      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-10 text-center">
              <Package className="w-10 h-10 text-[#C49A45] mx-auto mb-2" />
              <p className="font-display text-lg text-[#2D1B12]">Nenhum pedido recebido ainda</p>
              <p className="text-sm text-[#664938] mt-1">
                Assim que um cliente finalizar uma compra no checkout, o pedido aparecerá aqui em tempo real.
              </p>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#F5E6D3]">
                  <div>
                    <div className="font-mono text-sm font-bold text-[#2D1B12]">{order.order_number}</div>
                    <div className="text-xs text-[#664938]">
                      Cliente: <strong>{order.customer_name}</strong> ({order.customer_email}) · Tel: {order.customer_phone}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[#2D1B12] tabular-nums">
                      {formatBRL(order.total_cents)}
                    </div>
                    <div className="text-xs text-[#8B6F5C]">
                      {new Date(order.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#5D4030]">
                  <div>
                    <strong className="text-[#2D1B12]">Itens:</strong>
                    <ul className="mt-1 space-y-1">
                      {order.items.map((item) => (
                        <li key={item.id}>
                          {item.quantity}x {item.product_name} ({formatBRL(item.total_cents)})
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong className="text-[#2D1B12]">Entrega ({order.shipping_method}):</strong>
                    <p className="mt-1">
                      {order.shipping_address.street}, {order.shipping_address.number} ·{' '}
                      {order.shipping_address.city}/{order.shipping_address.state} · CEP {order.shipping_cep}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#F5E6D3]">
                  <label className="text-xs font-semibold text-[#2D1B12]">Estado do pedido:</label>
                  <select
                    value={order.status}
                    onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value, order.tracking_code)}
                    className="bg-white border border-[#EAD5BC] rounded-lg px-3 py-1.5 text-xs font-medium"
                  >
                    {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    defaultValue={order.tracking_code}
                    placeholder="Código de rastreio Correios..."
                    onBlur={(e) => {
                      if (e.target.value !== order.tracking_code) {
                        handleUpdateOrderStatus(order.id, order.status, e.target.value);
                      }
                    }}
                    className="bg-white border border-[#EAD5BC] rounded-lg px-3 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: REPORTS & AUDIT LOGS */}
      {tab === 'reports' && dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#2D1B12]">Desempenho por Categoria</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-[#8B6F5C] border-b border-[#EAD5BC]">
                <tr>
                  <th className="py-2 text-left">Categoria</th>
                  <th className="py-2 text-right">Peças</th>
                  <th className="py-2 text-right">Estoque</th>
                  <th className="py-2 text-right">Vendas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5E6D3]">
                {dashboard.categoryBreakdown.map((row) => (
                  <tr key={row.category_name}>
                    <td className="py-2.5 font-medium text-[#2D1B12]">{row.category_name}</td>
                    <td className="py-2.5 text-right tabular-nums">{row.product_count}</td>
                    <td className="py-2.5 text-right tabular-nums">{row.stock_units}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{formatBRL(row.sales_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-6 bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#2D1B12]">Registro de Operações Administrativas</h2>
            <div className="space-y-2.5 max-h-80 overflow-y-auto text-xs">
              {dashboard.auditLogs.length === 0 ? (
                <p className="text-[#8B6F5C]">Nenhuma operação registrada ainda.</p>
              ) : (
                dashboard.auditLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-lg bg-[#FDF8F3] border border-[#EAD5BC]">
                    <div className="flex justify-between font-semibold text-[#2D1B12]">
                      <span>{log.action}</span>
                      <span className="font-mono text-[11px] text-[#8B6F5C]">{log.created_at}</span>
                    </div>
                    <p className="text-[#5D4030] mt-0.5">{log.details}</p>
                    <p className="text-[#8B6F5C] mt-0.5">Por: {log.actor_email}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CUSTOMERS */}
      {tab === 'customers' && (
        <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#EAD5BC]">
            <h2 className="font-display text-xl font-semibold text-[#2D1B12]">Clientes Cadastrados</h2>
            <p className="text-xs text-[#664938]">CPF parcialmente mascarado em conformidade com a LGPD.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FDF8F3] border-b border-[#EAD5BC] text-xs text-[#664938]">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">CPF</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Pedidos</th>
                  <th className="px-4 py-3 text-right">Total Comprado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5E6D3]">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#8B6F5C]">
                      Nenhum cliente cadastrado até o momento.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-medium text-[#2D1B12]">{c.full_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#5D4030]">{c.cpf_masked}</td>
                      <td className="px-4 py-3 text-xs text-[#5D4030]">{c.email}</td>
                      <td className="px-4 py-3 tabular-nums">{c.orders_count}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatBRL(c.total_spent_cents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: BANNERS */}
      {tab === 'banners' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddBanner}
            className="lg:col-span-5 bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-xl font-semibold text-[#2D1B12]">Novo Banner da Página Inicial</h2>
            <div>
              <label className="block text-xs font-semibold mb-1">Título Principal</label>
              <input
                type="text"
                required
                value={bTitle}
                onChange={(e) => setBTitle(e.target.value)}
                placeholder="Ex: Coleção Dourada de Verão"
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Subtítulo</label>
              <textarea
                rows={3}
                required
                value={bSubtitle}
                onChange={(e) => setBSubtitle(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Texto do Botão</label>
              <input
                type="text"
                required
                value={bCtaText}
                onChange={(e) => setBCtaText(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Imagem do Banner</label>
              <select
                value={bImageUrl}
                onChange={(e) => setBImageUrl(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
              >
                {STUDIO_IMAGES.map((img) => (
                  <option key={img.url} value={img.url}>
                    {img.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
            >
              Publicar Banner
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {banners.map((b) => (
              <div key={b.id} className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-4 flex items-center gap-4">
                <div className="w-28 aspect-[16/9] rounded-lg overflow-hidden shrink-0 border border-[#EAD5BC]">
                  <ResilientImage src={b.image_url} alt={b.title} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-[#2D1B12] truncate">{b.title}</h3>
                  <p className="text-xs text-[#664938] line-clamp-2 mt-0.5">{b.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleBanner(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    b.active ? 'bg-emerald-100 text-emerald-900' : 'bg-[#F5E6D3] text-[#664938]'
                  }`}
                >
                  {b.active ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: STAFF PERMISSIONS */}
      {tab === 'staff' && adminUser.role === 'admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateStaff}
            className="lg:col-span-5 bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-xl font-semibold text-[#2D1B12]">Cadastrar Funcionária</h2>
            <div>
              <label className="block text-xs font-semibold mb-1">Nome completo</label>
              <input
                type="text"
                required
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">E-mail de acesso</label>
              <input
                type="email"
                required
                value={sEmail}
                onChange={(e) => setSEmail(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Senha inicial</label>
              <input
                type="password"
                required
                minLength={6}
                value={sPass}
                onChange={(e) => setSPass(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#2D1B12]">Permissões</span>
              {[
                {id: 'manage_products', label: 'Gerenciar joias, preços e estoque'},
                {id: 'manage_orders', label: 'Gerenciar pedidos e entregas'},
                {id: 'manage_customers', label: 'Visualizar clientes'},
                {id: 'view_reports', label: 'Visualizar relatórios'},
                {id: 'manage_banners', label: 'Gerenciar banners'},
              ].map((perm) => (
                <label key={perm.id} className="flex items-center gap-2 text-xs text-[#5D4030] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sPerms.includes(perm.id)}
                    onChange={(e) =>
                      setSPerms((prev) =>
                        e.target.checked ? [...prev, perm.id] : prev.filter((item) => item !== perm.id)
                      )
                    }
                    className="accent-[#D94A12]"
                  />
                  <span>{perm.label}</span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
            >
              Adicionar à Equipe
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {staffList.map((member) => (
              <div key={member.id} className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-sm text-[#2D1B12]">
                    {member.full_name} ({member.role === 'admin' ? 'Proprietária' : 'Colaboradora'})
                  </div>
                  <div className="text-xs text-[#664938]">{member.email}</div>
                  <div className="text-[11px] text-[#8B6F5C] mt-1">
                    Permissões: {member.permissions.join(', ')}
                  </div>
                </div>
                <span className="text-xs font-semibold text-emerald-800">
                  {member.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADD / EDIT JEWELRY MODAL */}
      {productModalOpen && dashboard && (
        <div
          className="fixed inset-0 z-50 bg-[#2D1B12]/55 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setProductModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 sm:p-8 my-8 max-h-[90vh] overflow-y-auto space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl font-semibold text-[#2D1B12]">
              {editingProduct ? 'Editar Joia / Bijuteria' : 'Adicionar Nova Joia / Bijuteria'}
            </h2>

            <form onSubmit={handleSaveProductModal} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Nome da peça *</label>
                <input
                  type="text"
                  required
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="Ex: Brinco Ponto de Luz Zircônia 18k"
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Categoria *</label>
                <select
                  value={pCatId}
                  onChange={(e) => setPCatId(Number(e.target.value))}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                >
                  {dashboard.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Cor *</label>
                <input
                  type="text"
                  required
                  value={pColor}
                  onChange={(e) => setPColor(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Descrição detalhada *</label>
                <textarea
                  rows={3}
                  required
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Material *</label>
                <input
                  type="text"
                  required
                  value={pMaterial}
                  onChange={(e) => setPMaterial(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Dimensões (opcional)</label>
                <input
                  type="text"
                  value={pDim}
                  onChange={(e) => setPDim(e.target.value)}
                  placeholder="Ex: 45 cm + 5 cm extensor"
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Preço Original (R$) *</label>
                <input
                  type="text"
                  required
                  value={pPriceReais}
                  onChange={(e) => setPPriceReais(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Preço Promocional / Desconto (R$)</label>
                <input
                  type="text"
                  value={pPromoReais}
                  onChange={(e) => setPPromoReais(e.target.value)}
                  placeholder="Deixe vazio se sem promo"
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Quantidade em Estoque *</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={pStock}
                  onChange={(e) => setPStock(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Fotografia (Catálogo Studio)</label>
                <select
                  value={STUDIO_IMAGES.some((i) => i.url === pImageUrl) ? pImageUrl : 'custom'}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') setPImageUrl(e.target.value);
                  }}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                >
                  {STUDIO_IMAGES.map((img) => (
                    <option key={img.url} value={img.url}>
                      {img.label}
                    </option>
                  ))}
                  <option value="custom">URL personalizada</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">URL da Fotografia</label>
                <input
                  type="text"
                  required
                  value={pImageUrl}
                  onChange={(e) => setPImageUrl(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap gap-5 pt-1 text-xs text-[#2D1B12]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pFeatured}
                    onChange={(e) => setPFeatured(e.target.checked)}
                    className="accent-[#D94A12]"
                  />
                  <span>Produto em Destaque</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pNew}
                    onChange={(e) => setPNew(e.target.checked)}
                    className="accent-[#D94A12]"
                  />
                  <span>Lançamento / Novidade</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pBestseller}
                    onChange={(e) => setPBestseller(e.target.checked)}
                    className="accent-[#D94A12]"
                  />
                  <span>Mais Vendido</span>
                </label>
              </div>

              <div className="sm:col-span-2 flex justify-end gap-3 pt-4 border-t border-[#EAD5BC]">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg border border-[#EAD5BC] text-sm font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
                >
                  {editingProduct ? 'Salvar Alterações' : 'Publicar Joia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
