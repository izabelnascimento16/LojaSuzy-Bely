import {useEffect, useState} from 'react';
import {ChevronRight, Menu, MessageCircle, Search, ShoppingBag, User as UserIcon, X} from 'lucide-react';
import type {AppView, Category, PublicStoreSettings, User} from '../types';
import {buildWhatsAppUrl, formatBRL} from '../utils/format';
import {BrandMark} from './BrandLogo';

interface HeaderProps {
  activeView: AppView;
  onNavigate: (view: AppView, category?: string) => void;
  cartCount: number;
  onOpenCart: () => void;
  user: User | null;
  onOpenAuth: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  storeSettings?: PublicStoreSettings | null;
  categories?: Category[];
}

export function Header({
  activeView,
  onNavigate,
  cartCount,
  onOpenCart,
  user,
  onOpenAuth,
  searchQuery,
  onSearchChange,
  storeSettings,
  categories = [],
}: HeaderProps) {
  const whatsappUrl = buildWhatsAppUrl(storeSettings?.whatsappNumber, storeSettings?.whatsappMessage);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileMenuOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate('catalog');
    setSearchOpen(false);
  };

  return (
    <>
      <div className="bg-gradient-to-r from-[#EA580C] via-[#F97316] to-[#EA580C] text-white text-[11px] sm:text-xs font-medium py-1.5 px-3 text-center tracking-wide">
        <span>
          {storeSettings?.freeShippingThresholdCents && storeSettings.freeShippingThresholdCents > 0
            ? `Frete Grátis acima de ${formatBRL(storeSettings.freeShippingThresholdCents)} · `
            : ''}
          {(storeSettings?.pixDiscountPercent ?? 5) > 0 ? `${storeSettings?.pixDiscountPercent ?? 5}% OFF no PIX · ` : ''}
          Envio para todo o Brasil · {storeSettings?.storeCity || 'Ji-Paraná, RO'}
        </span>
      </div>
      <header className="sticky top-0 z-40 bg-[#FFF9F4]/95 backdrop-blur-md border-b-2 border-[#FB923C]/45 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-8">
          {/* Left: Mobile Menu Button + Brand wordmark */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu de navegação"
              className="md:hidden p-2 rounded-lg text-[#3D2113] hover:bg-[#FFE8D4]/70 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigate('home');
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 text-[#EA580C] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#EA580C] cursor-pointer min-h-[44px]"
            >
              <BrandMark className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="font-display text-lg sm:text-2xl font-semibold tracking-tight text-[#3D2113]">
                Suzy Bely
              </span>
            </button>
          </div>

          {/* Zone 2: Desktop & Large Tablet Navigation */}
          <nav className="hidden md:flex items-center gap-5 lg:gap-7 text-sm font-medium text-[#5E3824]" aria-label="Menu principal">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                activeView === 'home'
                  ? 'border-[#EA580C] text-[#3D2113]'
                  : 'border-transparent hover:text-[#EA580C]'
              }`}
            >
              Início
            </button>
            <button
              type="button"
              onClick={() => onNavigate('catalog', 'all')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                activeView === 'catalog'
                  ? 'border-[#EA580C] text-[#3D2113]'
                  : 'border-transparent hover:text-[#EA580C]'
              }`}
            >
              Catálogo
            </button>
            <button
              type="button"
              onClick={() => onNavigate('catalog', 'promocoes')}
              className="whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:text-[#EA580C] transition-colors cursor-pointer"
            >
              Promoções
            </button>
            <button
              type="button"
              onClick={() => onNavigate('institucional')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                activeView === 'institucional'
                  ? 'border-[#EA580C] text-[#3D2113]'
                  : 'border-transparent hover:text-[#EA580C]'
              }`}
            >
              Sobre Nós
            </button>
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                activeView === 'admin'
                  ? 'border-[#EA580C] text-[#3D2113]'
                  : 'border-transparent hover:text-[#EA580C]'
              }`}
            >
              Painel Loja
            </button>
          </nav>

          {/* Zone 3: Search, WhatsApp, Account & Cart */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Fale com um Especialista — Atendimento no WhatsApp"
                aria-label="Fale com um Especialista — Atendimento no WhatsApp"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors min-h-[40px] whitespace-nowrap shrink-0"
              >
                <MessageCircle className="w-4 h-4 text-emerald-700" />
                <span className="hidden lg:inline">WhatsApp</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => setSearchOpen((prev) => !prev)}
              aria-label="Pesquisar produtos"
              className="p-2 rounded-lg text-[#5E3824] hover:bg-[#FFE8D4]/70 hover:text-[#3D2113] transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Search className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (user) onNavigate('account');
                else onOpenAuth();
              }}
              aria-label={user ? 'Minha conta' : 'Entrar ou cadastrar'}
              className="flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium text-[#3D2113] hover:bg-[#FFE8D4]/70 transition-colors cursor-pointer min-h-[44px] min-w-[44px] justify-center whitespace-nowrap shrink-0"
            >
              <UserIcon className="w-5 h-5 sm:w-4.5 sm:h-4.5 text-[#5E3824]" />
              <span className="hidden sm:inline max-w-[110px] truncate">
                {user ? user.fullName.split(' ')[0] : 'Conta'}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              aria-label={`Abrir carrinho com ${cartCount} itens`}
              className="relative flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white hover:from-[#EA580C] hover:to-[#C94506] shadow-sm shadow-[#EA580C]/25 transition-all cursor-pointer min-h-[44px] whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4.5 h-4.5" />
              <span className="text-sm font-semibold tabular-nums">{cartCount}</span>
            </button>
          </div>
        </div>

        {/* Expandable Search Bar */}
        {searchOpen && (
          <div className="border-t border-[#F2D2B6] bg-[#FFF9F4] px-4 py-3">
            <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto flex items-center gap-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar bijuterias, bolsas, maquiagem, hidratantes..."
                autoFocus
                className="flex-1 bg-white border border-[#F2D2B6] rounded-lg px-4 py-2.5 text-base sm:text-sm text-[#3D2113] placeholder-[#9A6B50] focus:outline-none focus:border-[#EA580C] min-h-[44px]"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[#3D2113] text-white text-sm font-medium hover:bg-[#59311D] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[44px]"
              >
                Buscar
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Slide-Over Mobile Side Menu Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden flex bg-[#3D2113]/50 backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
          role="dialog"
          aria-label="Menu de navegação móvel"
        >
          <aside
            className="w-[82%] max-w-xs bg-[#FFFFFF] h-dvh flex flex-col justify-between border-r border-[#F2D2B6] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 h-16 border-b border-[#F2D2B6] flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2 text-[#EA580C]">
                  <BrandMark className="w-5 h-5" />
                  <span className="font-display text-xl font-semibold text-[#3D2113]">Suzy Bely</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Fechar menu"
                  className="p-2 rounded-lg text-[#5E3824] hover:bg-[#FFE8D4] min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="p-4 space-y-1.5" aria-label="Links do menu móvel">
                {[
                  {label: 'Início', view: 'home' as AppView},
                  {label: 'Catálogo Completo', view: 'catalog' as AppView, cat: 'all'},
                  ...categories.map((c) => ({
                    label: c.name,
                    view: 'catalog' as AppView,
                    cat: c.slug,
                  })),
                  {label: 'Promoções', view: 'catalog' as AppView, cat: 'promocoes'},
                  {label: 'Sobre Nós & Valores', view: 'institucional' as AppView},
                  {label: 'Painel Administrativo', view: 'admin' as AppView},
                ].map((item) => (
                  <button
                    key={`${item.view}-${item.cat || item.label}`}
                    type="button"
                    onClick={() => {
                      onNavigate(item.view, item.cat);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium text-[#3D2113] hover:bg-[#FFF2E6] active:bg-[#FFE8D4] transition-colors min-h-[46px] cursor-pointer"
                  >
                    <span>{item.label}</span>
                    <ChevronRight className="w-4 h-4 text-[#9A6B50]" />
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-4 border-t border-[#F2D2B6] bg-[#FFF9F4] space-y-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 min-h-[46px] hover:bg-emerald-800"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Atendimento no WhatsApp</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (user) onNavigate('account');
                  else onOpenAuth();
                }}
                className="w-full py-3 px-4 rounded-xl border border-[#F2D2B6] bg-white text-sm font-semibold text-[#3D2113] flex items-center justify-center gap-2 min-h-[46px] cursor-pointer"
              >
                <UserIcon className="w-4 h-4 text-[#EA580C]" />
                <span>{user ? `Minha Conta (${user.fullName.split(' ')[0]})` : 'Entrar ou Cadastrar'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenCart();
                }}
                className="w-full py-3 px-4 rounded-xl bg-[#EA580C] text-white text-sm font-semibold flex items-center justify-center gap-2 min-h-[46px] cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Ver Sacola ({cartCount})</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
