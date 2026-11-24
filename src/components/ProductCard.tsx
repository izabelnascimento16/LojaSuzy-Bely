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
    <article className="group bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => onSelect(product)}
        className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5E6D3]/40 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#D94A12]"
      >
        <ResilientImage
          src={primaryImage}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {outOfStock && (
          <div className="absolute inset-0 bg-[#2D1B12]/45 flex items-center justify-center">
            <span className="bg-[#FFFDF9] text-[#2D1B12] text-xs font-semibold px-3 py-1.5 rounded-md">
              Esgotado
            </span>
          </div>
        )}
      </button>

      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-4">
        <div>
          {/* Unboxed clean metadata with typographic separator */}
          <div className="flex items-center gap-1.5 text-xs text-[#8B6F5C] mb-1.5">
            <span>{product.category_name}</span>
            {discount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#D94A12]">-{discount}%</span>
              </>
            )}
            {product.is_new && discount === 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-[#C49A45]">Novidade</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSelect(product)}
            className="text-left font-display text-lg font-medium text-[#2D1B12] hover:text-[#D94A12] transition-colors line-clamp-2 cursor-pointer"
          >
            {product.name}
          </button>

          <p className="mt-1 text-xs text-[#664938] line-clamp-1">{product.color}</p>
        </div>

        <div className="pt-2 border-t border-[#F5E6D3] flex items-end justify-between gap-3">
          <div>
            {discount > 0 && (
              <div className="text-xs text-[#8B6F5C] line-through tabular-nums">
                {formatBRL(product.price_cents)}
              </div>
            )}
            <div className="text-lg font-bold text-[#2D1B12] tabular-nums">
              {formatBRL(finalPrice)}
            </div>
            <div className="text-[11px] text-[#8B6F5C] flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-[#C49A45]" />
              <span>{outOfStock ? 'Indisponível' : `${product.stock} em estoque`}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={outOfStock}
            onClick={() => onAddToCart(product)}
            className="px-4 py-2 rounded-lg bg-[#D94A12] text-white text-xs font-semibold hover:bg-[#B83C0B] disabled:bg-[#EAD5BC] disabled:text-[#8B6F5C] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed min-h-[40px]"
          >
            <span>{outOfStock ? 'Avise-me' : 'Adicionar'}</span>
            {!outOfStock && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </article>
  );
}
