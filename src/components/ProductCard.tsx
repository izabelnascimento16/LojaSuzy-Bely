import {ArrowRight, ShieldCheck} from 'lucide-react';
import type {Product} from '../types';
import {discountPercent, effectivePriceCents, formatBRL} from '../utils/format';
import {ResilientImage} from './BrandLogo';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

export function ProductCard({product, onSelect, onAddToCart}: ProductCardProps) {
  const finalPrice = effectivePriceCents(product.price_cents, product.promo_price_cents);
  const discount = discountPercent(product.price_cents, product.promo_price_cents);
  const primaryImage = product.images[0]?.url || '';
  const outOfStock = product.stock <= 0;

  return (
    <article className="group bg-[#FFFFFF] border border-[#FDBA74]/60 hover:border-[#EA580C]/70 rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#EA580C]/15">
      <button
        type="button"
        onClick={() => onSelect(product)}
        className="relative aspect-[4/3] w-full overflow-hidden bg-[#FFE8D4]/50 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#EA580C]"
      >
        <ResilientImage
          src={primaryImage}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {outOfStock && (
          <div className="absolute inset-0 bg-[#3D2113]/45 flex items-center justify-center">
            <span className="bg-[#FFFFFF] text-[#3D2113] text-xs font-semibold px-3 py-1.5 rounded-md">
              Esgotado
            </span>
          </div>
        )}
      </button>

      <div className="p-3 sm:p-5 flex-1 flex flex-col justify-between gap-3 sm:gap-4">
        <div>
          {/* Unboxed clean metadata with typographic separator */}
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-[#9A6B50] mb-1">
            <span className="truncate">{product.category_name}</span>
            {discount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#EA580C] shrink-0">-{discount}%</span>
              </>
            )}
            {product.is_new && discount === 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-[#D4A548] shrink-0">Novidade</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSelect(product)}
            className="text-left font-display text-sm sm:text-lg font-medium text-[#3D2113] hover:text-[#EA580C] transition-colors line-clamp-2 cursor-pointer leading-snug"
          >
            {product.name}
          </button>

          <p className="mt-1 text-[11px] sm:text-xs text-[#7A4D35] line-clamp-1">{product.color}</p>
        </div>

        <div className="pt-2.5 border-t border-[#FFE8D4] flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 sm:gap-3">
          <div>
            {discount > 0 && (
              <div className="text-[11px] sm:text-xs text-[#9A6B50] line-through tabular-nums">
                {formatBRL(product.price_cents)}
              </div>
            )}
            <div className="text-base sm:text-lg font-bold text-[#3D2113] tabular-nums">
              {formatBRL(finalPrice)}
            </div>
            <div className="text-[11px] text-[#9A6B50] flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-[#D4A548] shrink-0" />
              <span className="truncate">{outOfStock ? 'Indisponível' : `${product.stock} em estoque`}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={outOfStock}
            onClick={() => onAddToCart(product)}
            className="w-full sm:w-auto px-3.5 py-2.5 sm:py-2 rounded-lg bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white text-xs font-semibold hover:from-[#EA580C] hover:to-[#C94506] disabled:from-[#F2D2B6] disabled:to-[#F2D2B6] disabled:text-[#9A6B50] transition-all shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed min-h-[44px] sm:min-h-[40px]"
          >
            <span>{outOfStock ? 'Avise-me' : 'Adicionar'}</span>
            {!outOfStock && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </article>
  );
}
