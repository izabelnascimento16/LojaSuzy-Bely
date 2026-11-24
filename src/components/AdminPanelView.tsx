import {useEffect, useState} from 'react';
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  CreditCard,
  Edit3,
  Image as ImageIcon,
  Lock,
  LogOut,
  Mail,
  Package,
  Plus,
  QrCode,
  Send,
  Settings,
  Shield,
  ShoppingCart,
  Tag,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import type {AdminStoreSettings, Banner, Category, EmailLog, Order, Product, User} from '../types';
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
  {label: 'Fachada Oficial Suzy Bely', url: '/assets/aistudio/Gemini_Generated_Image_jwylupjwylupjwyl_8ff55566.jpg'},
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
  const [tab, setTab] = useState<'inventory' | 'orders' | 'reports' | 'customers' | 'banners' | 'staff' | 'settings'>('inventory');
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

  // Store Settings state (Payments, PIX, Shipping, Contact & SMTP Emails)
  const [storeSettings, setStoreSettings] = useState<AdminStoreSettings | null>(null);
  const [recentEmails, setRecentEmails] = useState<EmailLog[]>([]);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [freeShippingReais, setFreeShippingReais] = useState('150.00');
  const [fixedPacReais, setFixedPacReais] = useState('19.90');
  const [fixedSedexReais, setFixedSedexReais] = useState('34.90');
  const [localDeliveryReais, setLocalDeliveryReais] = useState('0.00');

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

  const loadSettings = async () => {
    try {
      const res = await apiRequest<{settings: AdminStoreSettings; recentEmails?: EmailLog[]}>('/api/admin/settings', {
        useAdminToken: true,
      });
      setStoreSettings(res.settings);
      setRecentEmails(res.recentEmails || []);
      setTestEmailTo((prev) => prev || res.settings.contactEmail || '');
      setFreeShippingReais((res.settings.freeShippingThresholdCents / 100).toFixed(2));
      setFixedPacReais((res.settings.fixedPacCents / 100).toFixed(2));
      setFixedSedexReais((res.settings.fixedSedexCents / 100).toFixed(2));
      setLocalDeliveryReais((res.settings.localDeliveryPriceCents / 100).toFixed(2));
    } catch {
      // May lack manage_settings permission
    }
  };

  useEffect(() => {
    if (!adminUser) return;
    loadDashboard();
    loadOrders();
    loadCustomers();
    loadBanners();
    loadStaff();
    loadSettings();
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

  const handleToggleStaffActive = async (member: {id: number; active: boolean; permissions: string[]}) => {
    setError('');
    setFeedback('');
    try {
      await apiRequest(`/api/admin/staff/${member.id}`, {
        method: 'PATCH',
        useAdminToken: true,
        body: {permissions: member.permissions, active: !member.active},
      });
      setFeedback(!member.active ? 'Acesso da colaboradora reativado.' : 'Acesso da colaboradora desativado.');
      loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar colaboradora.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSettings) return;
    setError('');
    setFeedback('');
    setSavingSettings(true);

    const parseMoneyCents = (val: string) => {
      const n = parseFloat(val.replace(',', '.'));
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
    };

    try {
      const res = await apiRequest<{message: string; settings: AdminStoreSettings; recentEmails?: EmailLog[]}>(
        '/api/admin/settings',
        {
          method: 'PUT',
          useAdminToken: true,
          body: {
            ...storeSettings,
            freeShippingThresholdCents: parseMoneyCents(freeShippingReais),
            fixedPacCents: parseMoneyCents(fixedPacReais),
            fixedSedexCents: parseMoneyCents(fixedSedexReais),
            localDeliveryPriceCents: parseMoneyCents(localDeliveryReais),
          },
        }
      );
      setStoreSettings(res.settings);
      if (res.recentEmails) setRecentEmails(res.recentEmails);
      setFeedback(res.message);
      onCatalogMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações da loja.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailTo.trim()) {
      setError('Informe um e-mail de destino para testar o envio SMTP.');
      return;
    }
    setError('');
    setFeedback('');
    setSendingTestEmail(true);
    try {
      const res = await apiRequest<{message: string; recentEmails?: EmailLog[]}>('/api/admin/settings/test-email', {
        method: 'POST',
        useAdminToken: true,
        body: {to: testEmailTo.trim()},
      });
      if (res.recentEmails) setRecentEmails(res.recentEmails);
      setFeedback(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail de teste.');
      loadSettings();
    } finally {
      setSendingTestEmail(false);
    }
  };

  if (checkingStatus) {
    return <div className="max-w-xl mx-auto py-20 text-center text-sm text-[#7A4D35]">Verificando acesso administrativo...</div>;
  }

  // First-Run Setup or Login Gate
  if (!adminUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 sm:p-8 space-y-5 shadow-sm">
          <div className="flex items-center gap-2.5 text-[#EA580C]">
            <Shield className="w-6 h-6" />
            <h1 className="font-display text-2xl font-semibold text-[#3D2113]">
              {needsBootstrap ? 'Configurar Painel da Loja' : 'Painel Administrativo'}
            </h1>
          </div>

          <p className="text-sm text-[#5E3824] leading-relaxed">
            {needsBootstrap
              ? 'Primeiro acesso detectado. Crie o usuário e a senha da proprietária para gerenciar joias, preços, promoções e estoque em tempo real.'
              : hasEnvPasscode
                ? 'Informe o código de acesso administrativo ou seu e-mail e senha de colaboradora.'
                : 'Entre com o e-mail e senha de administradora ou colaboradora da loja.'}
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-[#EA580C]/10 border border-[#EA580C]/30 text-xs text-[#C94506] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={needsBootstrap ? handleBootstrap : handleAdminLogin} className="space-y-4">
            {needsBootstrap && (
              <div>
                <label className="block text-xs font-semibold text-[#3D2113] mb-1">Nome da Proprietária</label>
                <input
                  type="text"
                  required
                  value={authFullName}
                  onChange={(e) => setAuthFullName(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">
                E-mail Administrativo {hasEnvPasscode && !needsBootstrap ? '(opcional com código)' : '*'}
              </label>
              <input
                type="email"
                required={!hasEnvPasscode || needsBootstrap}
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="suzy@suzybely.com.br"
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">
                {needsBootstrap ? 'Escolha sua senha (mín. 6 caracteres)' : 'Senha / Código de Acesso'}
              </label>
              <input
                type="password"
                required
                minLength={needsBootstrap ? 6 : 1}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] flex items-center justify-center gap-2 cursor-pointer"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#F2D2B6]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#EA580C]">
            Gestão em Tempo Real · {adminUser.role === 'admin' ? 'Proprietária' : 'Equipe'}
          </p>
          <h1 className="font-display text-3xl font-semibold text-[#3D2113]">Painel Administrativo Suzy Bely</h1>
        </div>
        <div className="flex items-center gap-3">
          {adminUser.permissions.includes('manage_products') && (
            <button
              type="button"
              onClick={openNewProductModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#F2D2B6] bg-white text-sm font-medium text-[#3D2113] hover:bg-[#FFE8D4] cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      {dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-xl p-5">
            <div className="text-xs text-[#9A6B50]">Faturamento Real</div>
            <div className="text-2xl font-bold text-[#3D2113] tabular-nums mt-1">
              {formatBRL(dashboard.salesSummary.revenue_cents)}
            </div>
            <div className="text-xs text-[#7A4D35] mt-1 tabular-nums">
              {dashboard.salesSummary.total_orders} pedidos registrados
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-xl p-5">
            <div className="text-xs text-[#9A6B50]">Catálogo Ativo</div>
            <div className="text-2xl font-bold text-[#3D2113] tabular-nums mt-1">
              {dashboard.inventorySummary.total_products} peças
            </div>
            <div className="text-xs text-[#7A4D35] mt-1 tabular-nums">
              {dashboard.inventorySummary.total_units} unidades em estoque
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-xl p-5">
            <div className="text-xs text-[#9A6B50]">Em Promoção</div>
            <div className="text-2xl font-bold text-[#EA580C] tabular-nums mt-1">
              {dashboard.inventorySummary.promo_count} peças
            </div>
            <div className="text-xs text-[#7A4D35] mt-1">Com desconto ativo</div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-xl p-5">
            <div className="text-xs text-[#9A6B50]">Estoque Baixo (≤ 5)</div>
            <div className="text-2xl font-bold text-[#3D2113] tabular-nums mt-1">
              {dashboard.inventorySummary.low_stock_count} itens
            </div>
            <div className="text-xs text-[#7A4D35] mt-1 tabular-nums">
              {dashboard.customerCount} clientes cadastrados
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-1.5 sm:gap-2 p-1.5 bg-[#FFE8D4]/60 rounded-xl max-w-full w-full sm:w-fit">
        {[
          {id: 'inventory' as const, label: 'Joias & Estoque', icon: Tag},
          {id: 'orders' as const, label: 'Pedidos', icon: ShoppingCart},
          {id: 'reports' as const, label: 'Vendas & Relatórios', icon: BarChart3},
          {id: 'customers' as const, label: 'Clientes', icon: Users},
          {id: 'banners' as const, label: 'Banners', icon: ImageIcon},
          ...(adminUser.role === 'admin' || adminUser.permissions.includes('manage_settings')
            ? [{id: 'settings' as const, label: 'Configurações', icon: Settings}]
            : []),
          ...(adminUser.role === 'admin' ? [{id: 'staff' as const, label: 'Equipe', icon: Shield}] : []),
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 min-h-[42px] transition-colors cursor-pointer ${
                tab === item.id ? 'bg-white text-[#3D2113] shadow-xs' : 'text-[#7A4D35] hover:text-[#3D2113]'
              }`}
            >
              <Icon className="w-4 h-4 text-[#EA580C]" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#EA580C]/10 border border-[#EA580C]/30 text-sm text-[#C94506] flex items-center gap-2">
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
          <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F2D2B6] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold text-[#3D2113]">
                  Controle de Preços, Descontos e Inventário em Tempo Real
                </h2>
                <p className="text-xs text-[#7A4D35] mt-0.5">
                  Altere preço, valor promocional ou estoque diretamente na linha e clique em Salvar para atualizar a loja instantaneamente.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewProductModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3D2113] text-white text-xs font-semibold hover:bg-[#59311D] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Joia</span>
              </button>
            </div>

            {/* Mobile & Small Tablet Cards */}
            <div className="md:hidden divide-y divide-[#FFE8D4]">
              {dashboard.products.map((p) => {
                const edit = inlineEdits[p.id] || {
                  priceReais: (p.price_cents / 100).toFixed(2),
                  promoReais: p.promo_price_cents !== null ? (p.promo_price_cents / 100).toFixed(2) : '',
                  stock: String(p.stock),
                };
                return (
                  <div key={`m-${p.id}`} className={`p-4 space-y-3 ${!p.active ? 'opacity-55 bg-[#FFF9F4]' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-[#F2D2B6] shrink-0">
                        <ResilientImage src={p.images[0]?.url || ''} alt={p.name} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-[#3D2113] line-clamp-1">{p.name}</div>
                        <div className="text-xs text-[#9A6B50]">
                          {p.category_name} · {p.color}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#7A4D35] mb-1">Preço (R$)</label>
                        <input
                          type="text"
                          value={edit.priceReais}
                          onChange={(e) =>
                            setInlineEdits((prev) => ({
                              ...prev,
                              [p.id]: {...edit, priceReais: e.target.value},
                            }))
                          }
                          className="w-full bg-white border border-[#F2D2B6] rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums min-h-[42px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#7A4D35] mb-1">Promo (R$)</label>
                        <input
                          type="text"
                          value={edit.promoReais}
                          placeholder="-"
                          onChange={(e) =>
                            setInlineEdits((prev) => ({
                              ...prev,
                              [p.id]: {...edit, promoReais: e.target.value},
                            }))
                          }
                          className="w-full bg-white border border-[#F2D2B6] rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums min-h-[42px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#7A4D35] mb-1">Estoque</label>
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
                          className={`w-full bg-white border rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums min-h-[42px] ${
                            Number(edit.stock) <= 5 ? 'border-[#EA580C] text-[#EA580C] font-bold' : 'border-[#F2D2B6]'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleQuickSave(p.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-[#C94506] cursor-pointer min-h-[44px]"
                      >
                        <Check className="w-4 h-4" />
                        <span>Salvar Alterações</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditProductModal(p)}
                        aria-label={`Editar detalhes de ${p.name}`}
                        className="p-2.5 rounded-lg border border-[#F2D2B6] text-[#5E3824] hover:bg-[#FFE8D4] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(p.id)}
                        aria-label={`Excluir ${p.name}`}
                        className="p-2.5 rounded-lg border border-[#F2D2B6] text-[#9A6B50] hover:text-[#EA580C] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop & Large Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FFF9F4] border-b border-[#F2D2B6] text-xs text-[#7A4D35]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Peça</th>
                    <th className="px-4 py-3 font-semibold">Categoria</th>
                    <th className="px-4 py-3 font-semibold">Preço (R$)</th>
                    <th className="px-4 py-3 font-semibold">Promoção (R$)</th>
                    <th className="px-4 py-3 font-semibold">Estoque</th>
                    <th className="px-4 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FFE8D4]">
                  {dashboard.products.map((p) => {
                    const edit = inlineEdits[p.id] || {
                      priceReais: (p.price_cents / 100).toFixed(2),
                      promoReais: p.promo_price_cents !== null ? (p.promo_price_cents / 100).toFixed(2) : '',
                      stock: String(p.stock),
                    };
                    return (
                      <tr key={p.id} className={!p.active ? 'opacity-55 bg-[#FFF9F4]' : ''}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg overflow-hidden border border-[#F2D2B6] shrink-0">
                              <ResilientImage src={p.images[0]?.url || ''} alt={p.name} />
                            </div>
                            <div className="min-w-[160px]">
                              <div className="font-semibold text-[#3D2113] line-clamp-1">{p.name}</div>
                              <div className="text-xs text-[#9A6B50]">{p.color}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#5E3824] whitespace-nowrap">{p.category_name}</td>
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
                            className="w-24 bg-white border border-[#F2D2B6] rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
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
                            className="w-24 bg-white border border-[#F2D2B6] rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
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
                              Number(edit.stock) <= 5 ? 'border-[#EA580C] text-[#EA580C] font-bold' : 'border-[#F2D2B6]'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleQuickSave(p.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-[#C94506] cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Salvar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditProductModal(p)}
                              aria-label={`Editar detalhes de ${p.name}`}
                              className="p-1.5 rounded-lg border border-[#F2D2B6] text-[#5E3824] hover:bg-[#FFE8D4] cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p.id)}
                              aria-label={`Excluir ${p.name}`}
                              className="p-1.5 rounded-lg border border-[#F2D2B6] text-[#9A6B50] hover:text-[#EA580C] cursor-pointer"
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
          <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-[#3D2113]">Organizar Categorias</h3>
            <form onSubmit={handleAddCategory} className="flex flex-wrap gap-2 max-w-md">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nome da nova categoria..."
                className="flex-1 bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#3D2113] text-white text-xs font-semibold hover:bg-[#59311D] cursor-pointer"
              >
                Adicionar Categoria
              </button>
            </form>
            <div className="flex flex-wrap gap-2 pt-1">
              {dashboard.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="px-3.5 py-2 rounded-lg bg-[#FFF9F4] border border-[#F2D2B6] text-xs font-medium text-[#3D2113]"
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
            <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-10 text-center">
              <Package className="w-10 h-10 text-[#D4A548] mx-auto mb-2" />
              <p className="font-display text-lg text-[#3D2113]">Nenhum pedido recebido ainda</p>
              <p className="text-sm text-[#7A4D35] mt-1">
                Assim que um cliente finalizar uma compra no checkout, o pedido aparecerá aqui em tempo real.
              </p>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#FFE8D4]">
                  <div>
                    <div className="font-mono text-sm font-bold text-[#3D2113]">{order.order_number}</div>
                    <div className="text-xs text-[#7A4D35]">
                      Cliente: <strong>{order.customer_name}</strong> ({order.customer_email}) · Tel: {order.customer_phone}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[#3D2113] tabular-nums">
                      {formatBRL(order.total_cents)}
                    </div>
                    <div className="text-xs text-[#9A6B50]">
                      {new Date(order.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#5E3824]">
                  <div>
                    <strong className="text-[#3D2113]">Itens:</strong>
                    <ul className="mt-1 space-y-1">
                      {order.items.map((item) => (
                        <li key={item.id}>
                          {item.quantity}x {item.product_name} ({formatBRL(item.total_cents)})
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong className="text-[#3D2113]">Entrega ({order.shipping_method}):</strong>
                    <p className="mt-1">
                      {order.shipping_address.street}, {order.shipping_address.number} ·{' '}
                      {order.shipping_address.city}/{order.shipping_address.state} · CEP {order.shipping_cep}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-[#FFF2E6] border border-[#F2D2B6] font-medium text-[#3D2113]">
                      Pagamento:{' '}
                      {order.payment_method === 'pix'
                        ? 'PIX'
                        : order.payment_method === 'credit_card'
                          ? 'Cartão de Crédito'
                          : 'Boleto'}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-md font-semibold ${
                        order.payment_status === 'approved'
                          ? 'bg-emerald-100 text-emerald-900'
                          : order.payment_status === 'cancelled'
                            ? 'bg-red-100 text-red-900'
                            : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {order.payment_status === 'approved'
                        ? 'Pagamento Confirmado'
                        : order.payment_status === 'cancelled'
                          ? 'Cancelado'
                          : 'Aguardando Pagamento'}
                    </span>
                  </div>
                  {order.status === 'aguardando_pagamento' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateOrderStatus(order.id, 'pago', order.tracking_code)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmar Pagamento Recebido</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 pt-2 border-t border-[#FFE8D4]">
                  <label className="text-xs font-semibold text-[#3D2113]">Estado do pedido:</label>
                  <select
                    value={order.status}
                    onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value, order.tracking_code)}
                    className="w-full sm:w-auto bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-xs font-medium min-h-[42px]"
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
                    className="w-full sm:w-auto sm:min-w-[220px] bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-xs font-mono min-h-[42px]"
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
          <div className="lg:col-span-6 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-4 sm:p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#3D2113]">Desempenho por Categoria</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-[#9A6B50] border-b border-[#F2D2B6]">
                  <tr>
                    <th className="py-2 text-left">Categoria</th>
                    <th className="py-2 text-right">Peças</th>
                    <th className="py-2 text-right">Estoque</th>
                    <th className="py-2 text-right">Vendas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FFE8D4]">
                  {dashboard.categoryBreakdown.map((row) => (
                    <tr key={row.category_name}>
                      <td className="py-2.5 font-medium text-[#3D2113] pr-2">{row.category_name}</td>
                      <td className="py-2.5 text-right tabular-nums px-2">{row.product_count}</td>
                      <td className="py-2.5 text-right tabular-nums px-2">{row.stock_units}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums pl-2">{formatBRL(row.sales_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-6 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#3D2113]">Registro de Operações Administrativas</h2>
            <div className="space-y-2.5 max-h-80 overflow-y-auto text-xs">
              {dashboard.auditLogs.length === 0 ? (
                <p className="text-[#9A6B50]">Nenhuma operação registrada ainda.</p>
              ) : (
                dashboard.auditLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-lg bg-[#FFF9F4] border border-[#F2D2B6]">
                    <div className="flex justify-between font-semibold text-[#3D2113]">
                      <span>{log.action}</span>
                      <span className="font-mono text-[11px] text-[#9A6B50]">{log.created_at}</span>
                    </div>
                    <p className="text-[#5E3824] mt-0.5">{log.details}</p>
                    <p className="text-[#9A6B50] mt-0.5">Por: {log.actor_email}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CUSTOMERS */}
      {tab === 'customers' && (
        <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-[#F2D2B6]">
            <h2 className="font-display text-xl font-semibold text-[#3D2113]">Clientes Cadastrados</h2>
            <p className="text-xs text-[#7A4D35]">CPF parcialmente mascarado em conformidade com a LGPD.</p>
          </div>
          {/* Mobile Customer Cards */}
          <div className="md:hidden divide-y divide-[#FFE8D4]">
            {customers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#9A6B50]">
                Nenhum cliente cadastrado até o momento.
              </div>
            ) : (
              customers.map((c) => (
                <div key={`mc-${c.id}`} className="p-4 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#3D2113] truncate">{c.full_name}</span>
                    <span className="font-bold text-[#EA580C] tabular-nums shrink-0">
                      {formatBRL(c.total_spent_cents)}
                    </span>
                  </div>
                  <div className="text-xs text-[#5E3824] truncate">{c.email}</div>
                  <div className="flex items-center justify-between text-xs text-[#9A6B50]">
                    <span className="font-mono">CPF {c.cpf_masked}</span>
                    <span className="tabular-nums">{c.orders_count} pedido(s)</span>
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Desktop Customer Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FFF9F4] border-b border-[#F2D2B6] text-xs text-[#7A4D35]">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">CPF</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Pedidos</th>
                  <th className="px-4 py-3 text-right">Total Comprado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FFE8D4]">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#9A6B50]">
                      Nenhum cliente cadastrado até o momento.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-medium text-[#3D2113]">{c.full_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#5E3824]">{c.cpf_masked}</td>
                      <td className="px-4 py-3 text-xs text-[#5E3824]">{c.email}</td>
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
            className="lg:col-span-5 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-xl font-semibold text-[#3D2113]">Novo Banner da Página Inicial</h2>
            <div>
              <label className="block text-xs font-semibold mb-1">Título Principal</label>
              <input
                type="text"
                required
                value={bTitle}
                onChange={(e) => setBTitle(e.target.value)}
                placeholder="Ex: Coleção Dourada de Verão"
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Subtítulo</label>
              <textarea
                rows={3}
                required
                value={bSubtitle}
                onChange={(e) => setBSubtitle(e.target.value)}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Texto do Botão</label>
              <input
                type="text"
                required
                value={bCtaText}
                onChange={(e) => setBCtaText(e.target.value)}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Imagem do Banner</label>
              <select
                value={bImageUrl}
                onChange={(e) => setBImageUrl(e.target.value)}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
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
              className="w-full py-2.5 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
            >
              Publicar Banner
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {banners.map((b) => (
              <div
                key={b.id}
                className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
              >
                <div className="w-full sm:w-28 aspect-[16/9] rounded-lg overflow-hidden shrink-0 border border-[#F2D2B6]">
                  <ResilientImage src={b.image_url} alt={b.title} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-[#3D2113] truncate">{b.title}</h3>
                  <p className="text-xs text-[#7A4D35] line-clamp-2 mt-0.5">{b.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleBanner(b)}
                  className={`w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs font-semibold min-h-[40px] cursor-pointer ${
                    b.active ? 'bg-emerald-100 text-emerald-900' : 'bg-[#FFE8D4] text-[#7A4D35]'
                  }`}
                >
                  {b.active ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: STORE SETTINGS (PAYMENTS, PIX, SHIPPING & CONTACT) */}
      {tab === 'settings' &&
        (adminUser.role === 'admin' || adminUser.permissions.includes('manage_settings')) &&
        storeSettings && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* Gateway Status Banner */}
            <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#EA580C]" />
                  <h2 className="font-display text-xl font-semibold text-[#3D2113]">
                    Integração Mercado Pago (Cartão, PIX e Boleto Automático)
                  </h2>
                </div>
                <p className="text-xs text-[#5E3824] max-w-2xl leading-relaxed">
                  {storeSettings.gatewayStatus?.mercadoPagoConfigured
                    ? 'A chave de servidor MERCADOPAGO_ACCESS_TOKEN está ativa! Os pedidos com cartão geram link oficial do Mercado Pago Checkout Pro e o PIX é confirmado automaticamente via Webhook.'
                    : 'Modo direto da loja ativo. Para cobrar cartões automaticamente pelo Mercado Pago, adicione a variável MERCADOPAGO_ACCESS_TOKEN nos Secrets do servidor. Enquanto isso, você já pode receber via sua Chave PIX oficial abaixo ou Link de Pagamento.'}
                </p>
              </div>
              <span
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 w-fit ${
                  storeSettings.gatewayStatus?.mercadoPagoConfigured
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-[#FFF2E6] text-[#C94506] border border-[#F2D2B6]'
                }`}
              >
                {storeSettings.gatewayStatus?.mercadoPagoConfigured
                  ? 'Mercado Pago Ativo'
                  : 'Chave Server Não Configurada'}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Card 1: PIX da Loja */}
              <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#EA580C]" />
                  <h3 className="font-display text-lg font-semibold text-[#3D2113]">Recebimento via PIX da Loja</h3>
                </div>
                <p className="text-xs text-[#7A4D35]">
                  Informe sua chave PIX real para que o checkout gere o código Copia e Cola oficial direto para a sua conta.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">Tipo da Chave PIX</label>
                    <select
                      value={storeSettings.pixKeyType}
                      onChange={(e) =>
                        setStoreSettings({
                          ...storeSettings,
                          pixKeyType: e.target.value as AdminStoreSettings['pixKeyType'],
                        })
                      }
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="cpf">CPF</option>
                      <option value="cnpj">CNPJ</option>
                      <option value="phone">Celular</option>
                      <option value="email">E-mail</option>
                      <option value="random">Chave Aleatória</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">Desconto no PIX (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={storeSettings.pixDiscountPercent}
                      onChange={(e) =>
                        setStoreSettings({
                          ...storeSettings,
                          pixDiscountPercent: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">Sua Chave PIX</label>
                    <input
                      type="text"
                      value={storeSettings.pixKey}
                      onChange={(e) => setStoreSettings({...storeSettings, pixKey: e.target.value})}
                      placeholder="Ex: 000.000.000-00, celular, e-mail ou chave aleatória"
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">Nome do Recebedor (sem acentos)</label>
                    <input
                      type="text"
                      maxLength={25}
                      value={storeSettings.pixMerchantName}
                      onChange={(e) => setStoreSettings({...storeSettings, pixMerchantName: e.target.value})}
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">Cidade do Recebedor</label>
                    <input
                      type="text"
                      maxLength={15}
                      value={storeSettings.pixMerchantCity}
                      onChange={(e) => setStoreSettings({...storeSettings, pixMerchantCity: e.target.value})}
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Formas de Pagamento, Parcelamento & Link */}
              <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#EA580C]" />
                  <h3 className="font-display text-lg font-semibold text-[#3D2113]">
                    Formas de Pagamento &amp; Cartões
                  </h3>
                </div>

                <div className="space-y-2.5 pt-1">
                  <label className="flex items-center gap-2.5 text-sm text-[#3D2113] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={storeSettings.enablePix}
                      onChange={(e) => setStoreSettings({...storeSettings, enablePix: e.target.checked})}
                      className="accent-[#EA580C] w-4 h-4"
                    />
                    <span>Aceitar pagamento via PIX</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-sm text-[#3D2113] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={storeSettings.enableCreditCard}
                      onChange={(e) => setStoreSettings({...storeSettings, enableCreditCard: e.target.checked})}
                      className="accent-[#EA580C] w-4 h-4"
                    />
                    <span>Aceitar pagamento com Cartão de Crédito</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-sm text-[#3D2113] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={storeSettings.enableBoleto}
                      onChange={(e) => setStoreSettings({...storeSettings, enableBoleto: e.target.checked})}
                      className="accent-[#EA580C] w-4 h-4"
                    />
                    <span>Aceitar pagamento via Boleto Bancário</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">Parcelamento máx. sem juros</label>
                    <select
                      value={storeSettings.maxInstallments}
                      onChange={(e) =>
                        setStoreSettings({...storeSettings, maxInstallments: Number(e.target.value) || 1})
                      }
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                    >
                      {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                        <option key={n} value={n}>
                          Até {n}x sem juros
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">
                      Link de Pagamento no Cartão (opcional — Mercado Pago, InfinitePay, PagBank)
                    </label>
                    <input
                      type="url"
                      value={storeSettings.externalPaymentLink}
                      onChange={(e) => setStoreSettings({...storeSettings, externalPaymentLink: e.target.value})}
                      placeholder="https://link.mercadopago.com.br/..."
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                    />
                    <p className="text-[11px] text-[#9A6B50] mt-1">
                      Usado como botão de pagamento no cartão caso a chave automática do Mercado Pago não esteja ativa.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 3: Frete & Entrega Local Ji-Paraná */}
              <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-[#EA580C]" />
                  <h3 className="font-display text-lg font-semibold text-[#3D2113]">
                    Frete, Frete Grátis &amp; Entrega em Ji-Paraná
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">
                      Frete Grátis (PAC) a partir de (R$)
                    </label>
                    <input
                      type="text"
                      value={freeShippingReais}
                      onChange={(e) => setFreeShippingReais(e.target.value)}
                      placeholder="150.00 (0 = desativado)"
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">Modo de cálculo Correios</label>
                    <select
                      value={storeSettings.shippingMode}
                      onChange={(e) =>
                        setStoreSettings({
                          ...storeSettings,
                          shippingMode: e.target.value === 'fixed' ? 'fixed' : 'regional',
                        })
                      }
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="regional">Automático por região (CEP)</option>
                      <option value="fixed">Valor fixo nacional</option>
                    </select>
                  </div>

                  {storeSettings.shippingMode === 'fixed' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-[#3D2113] mb-1">Valor fixo PAC (R$)</label>
                        <input
                          type="text"
                          value={fixedPacReais}
                          onChange={(e) => setFixedPacReais(e.target.value)}
                          className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#3D2113] mb-1">Valor fixo SEDEX (R$)</label>
                        <input
                          type="text"
                          value={fixedSedexReais}
                          onChange={(e) => setFixedSedexReais(e.target.value)}
                          className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    </>
                  )}

                  <div className="sm:col-span-2 pt-2 border-t border-[#FFE8D4]">
                    <label className="flex items-center gap-2 text-sm font-medium text-[#3D2113] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={storeSettings.localDeliveryEnabled}
                        onChange={(e) =>
                          setStoreSettings({...storeSettings, localDeliveryEnabled: e.target.checked})
                        }
                        className="accent-[#EA580C] w-4 h-4"
                      />
                      <span>Oferecer Entrega Local / Retirada na Loja (Ji-Paraná, RO)</span>
                    </label>
                  </div>

                  {storeSettings.localDeliveryEnabled && (
                    <>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-[#3D2113] mb-1">Nome da opção local</label>
                        <input
                          type="text"
                          value={storeSettings.localDeliveryLabel}
                          onChange={(e) =>
                            setStoreSettings({...storeSettings, localDeliveryLabel: e.target.value})
                          }
                          className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#3D2113] mb-1">Valor entrega local (R$)</label>
                        <input
                          type="text"
                          value={localDeliveryReais}
                          onChange={(e) => setLocalDeliveryReais(e.target.value)}
                          className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#3D2113] mb-1">Prazo (dias úteis)</label>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={storeSettings.localDeliveryDays}
                          onChange={(e) =>
                            setStoreSettings({
                              ...storeSettings,
                              localDeliveryDays: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Card 4: Atendimento & Contato */}
              <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-5 sm:p-6 space-y-4">
                <h3 className="font-display text-lg font-semibold text-[#3D2113]">
                  Contato, WhatsApp &amp; Localização
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">
                      WhatsApp da Loja (com DDD — ex: 69999990000)
                    </label>
                    <input
                      type="text"
                      value={storeSettings.whatsappNumber}
                      onChange={(e) => setStoreSettings({...storeSettings, whatsappNumber: e.target.value})}
                      placeholder="69999990000"
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">E-mail de Atendimento</label>
                    <input
                      type="email"
                      value={storeSettings.contactEmail}
                      onChange={(e) => setStoreSettings({...storeSettings, contactEmail: e.target.value})}
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">Cidade / Estado exibido</label>
                    <input
                      type="text"
                      value={storeSettings.storeCity}
                      onChange={(e) => setStoreSettings({...storeSettings, storeCity: e.target.value})}
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Card 5: E-mails Automáticos (SMTP) */}
              <div className="lg:col-span-2 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Mail className="w-5 h-5 text-[#EA580C]" />
                      <h3 className="font-display text-lg font-semibold text-[#3D2113]">
                        E-mails Automáticos (SMTP — Cadastro, Pedidos &amp; Recuperação de Senha)
                      </h3>
                    </div>
                    <p className="text-xs text-[#5E3824] max-w-3xl leading-relaxed">
                      {storeSettings.emailStatus?.configured
                        ? `Servidor SMTP conectado (porta ${storeSettings.emailStatus.port} · remetente ${storeSettings.emailStatus.fromAddress}). Os e-mails abaixo são disparados automaticamente.`
                        : 'Para enviar e-mails reais na caixa de entrada das clientes, configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM nos Secrets do servidor.'}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 w-fit ${
                      storeSettings.emailStatus?.configured
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-[#FFF2E6] text-[#C94506] border border-[#F2D2B6]'
                    }`}
                  >
                    {storeSettings.emailStatus?.configured ? 'SMTP Conectado' : 'SMTP Não Configurado'}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-[#FFE8D4]">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#3D2113] mb-1">
                        Nome exibido como remetente nos e-mails
                      </label>
                      <input
                        type="text"
                        value={storeSettings.emailSenderName}
                        onChange={(e) => setStoreSettings({...storeSettings, emailSenderName: e.target.value})}
                        placeholder="Suzy Bely Bijuterias"
                        className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <span className="block text-xs font-semibold text-[#3D2113]">Disparos automáticos ativos</span>
                      <label className="flex items-center gap-2.5 text-sm text-[#3D2113] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={storeSettings.emailOnRegister}
                          onChange={(e) => setStoreSettings({...storeSettings, emailOnRegister: e.target.checked})}
                          className="accent-[#EA580C] w-4 h-4"
                        />
                        <span>E-mail de boas-vindas ao criar conta</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-sm text-[#3D2113] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={storeSettings.emailOnOrder}
                          onChange={(e) => setStoreSettings({...storeSettings, emailOnOrder: e.target.checked})}
                          className="accent-[#EA580C] w-4 h-4"
                        />
                        <span>Confirmação automática do pedido para a cliente</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-sm text-[#3D2113] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={storeSettings.emailOnStatus}
                          onChange={(e) => setStoreSettings({...storeSettings, emailOnStatus: e.target.checked})}
                          className="accent-[#EA580C] w-4 h-4"
                        />
                        <span>Atualizações de pagamento aprovado, envio e código de rastreio</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-sm text-[#3D2113] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={storeSettings.emailNotifyOwner}
                          onChange={(e) => setStoreSettings({...storeSettings, emailNotifyOwner: e.target.checked})}
                          className="accent-[#EA580C] w-4 h-4"
                        />
                        <span>Avisar o e-mail da loja quando entrar um novo pedido</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6] space-y-3">
                      <span className="block text-xs font-semibold text-[#3D2113]">Testar conexão SMTP</span>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="email"
                          value={testEmailTo}
                          onChange={(e) => setTestEmailTo(e.target.value)}
                          placeholder="seuemail@exemplo.com.br"
                          className="flex-1 bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={sendingTestEmail}
                          onClick={handleSendTestEmail}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#3D2113] text-white text-xs font-semibold hover:bg-[#59311D] cursor-pointer shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{sendingTestEmail ? 'Enviando...' : 'Enviar E-mail de Teste'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="block text-xs font-semibold text-[#3D2113]">Últimos registros de envio</span>
                      {recentEmails.length === 0 ? (
                        <p className="text-xs text-[#9A6B50]">Nenhum disparo de e-mail registrado ainda.</p>
                      ) : (
                        <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                          {recentEmails.map((log) => (
                            <div
                              key={log.id}
                              className="p-2.5 rounded-lg bg-[#FFF9F4] border border-[#F2D2B6] text-xs flex flex-col gap-0.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-[#3D2113] truncate">{log.recipient_email}</span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 ${
                                    log.status === 'sent'
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : log.status === 'skipped_no_smtp'
                                        ? 'bg-amber-100 text-amber-900'
                                        : 'bg-red-100 text-red-900'
                                  }`}
                                >
                                  {log.status === 'sent'
                                    ? 'Enviado'
                                    : log.status === 'skipped_no_smtp'
                                      ? 'Aguardando SMTP'
                                      : 'Falhou'}
                                </span>
                              </div>
                              <div className="text-[#5E3824] truncate">{log.subject}</div>
                              {log.error_message && (
                                <div className="text-[11px] text-[#9A6B50] truncate">{log.error_message}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-6 py-3 rounded-xl bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{savingSettings ? 'Salvando...' : 'Salvar Todas as Configurações'}</span>
              </button>
            </div>
          </form>
        )}

      {/* TAB 7: STAFF PERMISSIONS */}
      {tab === 'staff' && adminUser.role === 'admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateStaff}
            className="lg:col-span-5 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-xl font-semibold text-[#3D2113]">Cadastrar Funcionária</h2>
            <div>
              <label className="block text-xs font-semibold mb-1">Nome completo</label>
              <input
                type="text"
                required
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">E-mail de acesso</label>
              <input
                type="email"
                required
                value={sEmail}
                onChange={(e) => setSEmail(e.target.value)}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
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
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#3D2113]">Permissões</span>
              {[
                {id: 'manage_products', label: 'Gerenciar joias, preços e estoque'},
                {id: 'manage_orders', label: 'Gerenciar pedidos e entregas'},
                {id: 'manage_customers', label: 'Visualizar clientes'},
                {id: 'view_reports', label: 'Visualizar relatórios'},
                {id: 'manage_banners', label: 'Gerenciar banners'},
                {id: 'manage_settings', label: 'Alterar pagamentos, PIX e frete'},
              ].map((perm) => (
                <label key={perm.id} className="flex items-center gap-2 text-xs text-[#5E3824] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sPerms.includes(perm.id)}
                    onChange={(e) =>
                      setSPerms((prev) =>
                        e.target.checked ? [...prev, perm.id] : prev.filter((item) => item !== perm.id)
                      )
                    }
                    className="accent-[#EA580C]"
                  />
                  <span>{perm.label}</span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
            >
              Adicionar à Equipe
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {staffList.map((member) => (
              <div key={member.id} className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-sm text-[#3D2113]">
                    {member.full_name} ({member.role === 'admin' ? 'Proprietária' : 'Colaboradora'})
                  </div>
                  <div className="text-xs text-[#7A4D35]">{member.email}</div>
                  <div className="text-[11px] text-[#9A6B50] mt-1">
                    Permissões: {member.permissions.join(', ')}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-semibold ${
                      member.active ? 'text-emerald-800' : 'text-[#9A6B50]'
                    }`}
                  >
                    {member.active ? 'Ativo' : 'Desativado'}
                  </span>
                  {member.role !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => handleToggleStaffActive(member)}
                      className="px-3 py-1.5 rounded-lg border border-[#F2D2B6] text-xs font-medium text-[#3D2113] hover:bg-[#FFE8D4] cursor-pointer"
                    >
                      {member.active ? 'Bloquear' : 'Autorizar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADD / EDIT JEWELRY MODAL */}
      {productModalOpen && dashboard && (
        <div
          className="fixed inset-0 z-50 bg-[#3D2113]/55 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setProductModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 sm:p-8 my-8 max-h-[90vh] overflow-y-auto space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl font-semibold text-[#3D2113]">
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
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Categoria *</label>
                <select
                  value={pCatId}
                  onChange={(e) => setPCatId(Number(e.target.value))}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
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
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Descrição detalhada *</label>
                <textarea
                  rows={3}
                  required
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Material *</label>
                <input
                  type="text"
                  required
                  value={pMaterial}
                  onChange={(e) => setPMaterial(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Dimensões (opcional)</label>
                <input
                  type="text"
                  value={pDim}
                  onChange={(e) => setPDim(e.target.value)}
                  placeholder="Ex: 45 cm + 5 cm extensor"
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Preço Original (R$) *</label>
                <input
                  type="text"
                  required
                  value={pPriceReais}
                  onChange={(e) => setPPriceReais(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Preço Promocional / Desconto (R$)</label>
                <input
                  type="text"
                  value={pPromoReais}
                  onChange={(e) => setPPromoReais(e.target.value)}
                  placeholder="Deixe vazio se sem promo"
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
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
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Fotografia (Catálogo Studio)</label>
                <select
                  value={STUDIO_IMAGES.some((i) => i.url === pImageUrl) ? pImageUrl : 'custom'}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') setPImageUrl(e.target.value);
                  }}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
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
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap gap-5 pt-1 text-xs text-[#3D2113]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pFeatured}
                    onChange={(e) => setPFeatured(e.target.checked)}
                    className="accent-[#EA580C]"
                  />
                  <span>Produto em Destaque</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pNew}
                    onChange={(e) => setPNew(e.target.checked)}
                    className="accent-[#EA580C]"
                  />
                  <span>Lançamento / Novidade</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pBestseller}
                    onChange={(e) => setPBestseller(e.target.checked)}
                    className="accent-[#EA580C]"
                  />
                  <span>Mais Vendido</span>
                </label>
              </div>

              <div className="sm:col-span-2 flex justify-end gap-3 pt-4 border-t border-[#F2D2B6]">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg border border-[#F2D2B6] text-sm font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
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
