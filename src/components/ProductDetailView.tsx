import {useState} from 'react';
import {ArrowLeft, Check, Minus, Plus, ShieldCheck, ShoppingBag, Truck, X, ZoomIn} from 'lucide-react';
import type {Product} from '../types';
import {discountPercent, effectivePriceCents, formatBRL} from '../utils/format';
import {ResilientImage} from './BrandLogo';
import {ProductCard} from './ProductCard';

interface ProductDetailViewProps {
  product: Product;
  related: Product[];
  onBack: () => void;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number) => void;
}

export function ProductDetailView({
  product,
  related,
  onBack,
  onSelectProduct,
  onAddToCart,
}: ProductDetailViewProps) {
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [hoverPos, setHoverPos] = useState<{x: number; y: number} | null>(null);
  const [addedFeedback, setAddedFeedback] = useState(false);

  const images = product.images.length > 0 ? product.images : [{id: 0, url: '', alt: product.name, sort_order: 0}];
  const activeImg = images[selectedImageIdx] || images[0];
  const finalPrice = effectivePriceCents(product.price_cents, product.promo_price_cents);
  const discount = discountPercent(product.price_cents, product.promo_price_cents);
  const pixPrice = Math.round(finalPrice * 0.95);
  const outOfStock = product.stock <= 0;

  const handleAdd = () => {
    if (outOfStock) return;
    onAddToCart(product, quantity);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1800);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-[#7A4D35] hover:text-[#EA580C] transition-colors mb-4 sm:mb-6 min-h-[44px] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Voltar ao catálogo</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left: Sticky Gallery with Interactive Zoom */}
        <div className="lg:col-span-7 space-y-4 lg:sticky lg:top-24">
          <div
            className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-[#FFE8D4]/40 border border-[#F2D2B6] cursor-zoom-in group"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              setHoverPos({x, y});
            }}
            onMouseLeave={() => setHoverPos(null)}
            onClick={() => setZoomOpen(true)}
          >
            <div
              className="w-full h-full transition-transform duration-200 ease-out"
              style={
                hoverPos
                  ? {
                      transform: 'scale(1.65)',
                      transformOrigin: `${hoverPos.x}% ${hoverPos.y}%`,
                    }
                  : undefined
              }
            >
              <ResilientImage src={activeImg.url} alt={activeImg.alt || product.name} priority />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoomOpen(true);
              }}
              aria-label="Ampliar fotografia"
              className="absolute bottom-4 right-4 px-3 py-2 rounded-lg bg-[#FFFFFF]/90 border border-[#F2D2B6] text-xs font-medium text-[#3D2113] flex items-center gap-1.5 shadow-sm hover:bg-white cursor-pointer"
            >
              <ZoomIn className="w-4 h-4 text-[#EA580C]" />
              <span>Ampliar foto</span>
            </button>
          </div>

          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {images.map((img, idx) => (
                <button
                  key={img.id || idx}
                  type="button"
                  onClick={() => setSelectedImageIdx(idx)}
                  className={`w-24 aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                    idx === selectedImageIdx ? 'border-[#EA580C]' : 'border-[#F2D2B6] opacity-75 hover:opacity-100'
                  }`}
                >
                  <ResilientImage src={img.url} alt={`${product.name} ${idx + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Contiguous Purchase Module */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 sm:p-8 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#9A6B50] mb-2">
              <span>{product.category_name}</span>
              <span aria-hidden="true">·</span>
              <span>{product.color}</span>
              {product.is_new && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#D4A548]">Lançamento</span>
                </>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#3D2113] leading-tight">
              {product.name}
            </h1>
          </div>

          <div className="pt-4 border-t border-[#FFE8D4]">
            {discount > 0 && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm text-[#9A6B50] line-through tabular-nums">
                  {formatBRL(product.price_cents)}
                </span>
                <span className="text-xs font-semibold text-[#EA580C]">{discount}% OFF</span>
              </div>
            )}
            <div className="text-3xl font-bold text-[#3D2113] tabular-nums">{formatBRL(finalPrice)}</div>
            <p className="text-sm text-[#7A4D35] mt-1 tabular-nums">
              ou <strong className="text-[#EA580C]">{formatBRL(pixPrice)}</strong> no PIX (5% de desconto) · ou até 3x de{' '}
              {formatBRL(Math.round(finalPrice / 3))} sem juros
            </p>
          </div>

          <p className="text-sm leading-relaxed text-[#5E3824]">{product.description}</p>

          {/* Specifications */}
          <dl className="grid grid-cols-1 gap-3 pt-4 border-t border-[#FFE8D4] text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#9A6B50]">Material</dt>
              <dd className="text-right font-medium text-[#3D2113]">{product.material}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#9A6B50]">Cor</dt>
              <dd className="text-right font-medium text-[#3D2113]">{product.color}</dd>
            </div>
            {product.dimensions && (
              <div className="flex justify-between gap-4">
                <dt className="text-[#9A6B50]">Dimensões</dt>
                <dd className="text-right font-medium text-[#3D2113]">{product.dimensions}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-[#9A6B50]">Disponibilidade</dt>
              <dd className="text-right font-semibold text-[#3D2113] tabular-nums">
                {outOfStock ? 'Esgotado no momento' : `${product.stock} unidades em estoque`}
              </dd>
            </div>
          </dl>

          {/* Quantity + Add to Cart */}
          <div className="pt-4 border-t border-[#FFE8D4] space-y-4">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4">
              <div className="inline-flex items-center border border-[#F2D2B6] rounded-lg bg-white h-12 shrink-0">
                <button
                  type="button"
                  disabled={quantity <= 1 || outOfStock}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Diminuir quantidade"
                  className="px-3.5 h-full text-[#5E3824] hover:bg-[#FFF9F4] disabled:opacity-40 cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-4 text-sm font-semibold text-[#3D2113] tabular-nums">{quantity}</span>
                <button
                  type="button"
                  disabled={quantity >= product.stock || outOfStock}
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  aria-label="Aumentar quantidade"
                  className="px-3.5 h-full text-[#5E3824] hover:bg-[#FFF9F4] disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                disabled={outOfStock}
                onClick={handleAdd}
                className="flex-1 min-w-[200px] h-12 px-5 sm:px-6 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] disabled:bg-[#F2D2B6] disabled:text-[#9A6B50] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {addedFeedback ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Adicionado à Sacola</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>{outOfStock ? 'Produto Esgotado' : 'Adicionar ao Carrinho'}</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-2 text-xs text-[#7A4D35]">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#EA580C] shrink-0" />
                <span>Frete grátis acima de R$ 150</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#D4A548] shrink-0" />
                <span>Garantia contra defeitos</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <section className="mt-12 sm:mt-16 pt-8 sm:pt-12 border-t border-[#F2D2B6]">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#3D2113] mb-6 sm:mb-8">
            Peças Relacionadas
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {related.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                onSelect={onSelectProduct}
                onAddToCart={(p) => onAddToCart(p, 1)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Lightbox Zoom Modal */}
      {zoomOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#3D2113]/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomOpen(false)}
          role="dialog"
          aria-label="Visualização ampliada do produto"
        >
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label="Fechar zoom"
            className="absolute top-5 right-5 p-3 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <div
            className="max-w-4xl w-full max-h-[85vh] rounded-2xl overflow-hidden bg-[#FFFFFF]"
            onClick={(e) => e.stopPropagation()}
          >
            <ResilientImage
              src={activeImg.url}
              alt={activeImg.alt || product.name}
              className="w-full h-full max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
