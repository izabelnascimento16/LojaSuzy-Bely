import {useState} from 'react';
import {Menu, Search, ShoppingBag, User as UserIcon, X} from 'lucide-react';
import type {AppView, User} from '../types';
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
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate('catalog');
    setSearchOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FFFDF9]/95 backdrop-blur-md border-b border-[#EAD5BC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 lg:gap-8">
        {/* Zone 1: Brand wordmark (1 line) */}
        <button
          type="button"
          onClick={() => {
            onNavigate('home');
            setMobileMenuOpen(false);
          }}
          className="flex items-center gap-2.5 text-[#D94A12] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D94A12] cursor-pointer"
        >
          <BrandMark className="w-6 h-6" />
          <span className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[#2D1B12]">
            Suzy Bely
          </span>
        </button>

        {/* Zone 2: 5 clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#5D4030]" aria-label="Menu principal">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeView === 'home'
                ? 'border-[#D94A12] text-[#2D1B12]'
                : 'border-transparent hover:text-[#D94A12]'
            }`}
          >
            Início
          </button>
          <button
            type="button"
            onClick={() => onNavigate('catalog', 'all')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeView === 'catalog'
                ? 'border-[#D94A12] text-[#2D1B12]'
                : 'border-transparent hover:text-[#D94A12]'
            }`}
          >
            Catálogo
          </button>
          <button
            type="button"
            onClick={() => onNavigate('catalog', 'promocoes')}
            className="whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:text-[#D94A12] transition-colors cursor-pointer"
          >
            Promoções
          </button>
          <button
            type="button"
            onClick={() => onNavigate('institucional')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeView === 'institucional'
                ? 'border-[#D94A12] text-[#2D1B12]'
                : 'border-transparent hover:text-[#D94A12]'
            }`}
          >
            Sobre Nós
          </button>
          <button
            type="button"
            onClick={() => onNavigate('admin')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeView === 'admin'
                ? 'border-[#D94A12] text-[#2D1B12]'
                : 'border-transparent hover:text-[#D94A12]'
            }`}
          >
            Painel Loja
          </button>
        </nav>

        {/* Zone 3: Compact search, account & cart actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            aria-label="Pesquisar produtos"
            className="p-2.5 rounded-lg text-[#5D4030] hover:bg-[#F5E6D3]/70 hover:text-[#2D1B12] transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[#2D1B12] hover:bg-[#F5E6D3]/70 transition-colors cursor-pointer min-h-[40px] whitespace-nowrap shrink-0"
          >
            <UserIcon className="w-4.5 h-4.5 text-[#5D4030]" />
            <span className="hidden sm:inline max-w-[110px] truncate">
              {user ? user.fullName.split(' ')[0] : 'Conta'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            aria-label={`Abrir carrinho com ${cartCount} itens`}
            className="relative flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#D94A12] text-white hover:bg-[#B83C0B] transition-colors cursor-pointer min-h-[40px] whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4.5 h-4.5" />
            <span className="text-sm font-medium tabular-nums">{cartCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Abrir menu"
            className="md:hidden p-2 rounded-lg text-[#2D1B12] hover:bg-[#F5E6D3]/70 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expandable Search Bar */}
      {searchOpen && (
        <div className="border-t border-[#EAD5BC] bg-[#FDF8F3] px-4 py-3">
          <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto flex items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar brincos, colares, anéis, conjuntos..."
              autoFocus
              className="flex-1 bg-white border border-[#EAD5BC] rounded-lg px-4 py-2.5 text-sm text-[#2D1B12] placeholder-[#8B6F5C] focus:outline-none focus:border-[#D94A12]"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-[#2D1B12] text-white text-sm font-medium hover:bg-[#462B1D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Buscar
            </button>
          </form>
        </div>
      )}

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-[#EAD5BC] bg-[#FFFDF9] px-4 py-3 space-y-1">
          {[
            {label: 'Início', view: 'home' as AppView},
            {label: 'Catálogo Completo', view: 'catalog' as AppView, cat: 'all'},
            {label: 'Promoções', view: 'catalog' as AppView, cat: 'promocoes'},
            {label: 'Sobre Nós & Valores', view: 'institucional' as AppView},
            {label: 'Painel Administrativo', view: 'admin' as AppView},
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                onNavigate(item.view, item.cat);
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-3 rounded-lg text-sm font-medium text-[#2D1B12] hover:bg-[#F5E6D3]/60 transition-colors"
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
