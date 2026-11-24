import {useState} from 'react';
import {Minus, Plus, ShoppingBag, Trash2, Truck, X} from 'lucide-react';
import type {CartItem, ShippingOption} from '../types';
import {effectivePriceCents, formatBRL, formatCepInput, onlyDigits} from '../utils/format';
import {apiRequest} from '../services/api';
import {ResilientImage} from './BrandLogo';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQty: (productId: number, qty: number) => void;
  onRemoveItem: (productId: number) => void;
  onCheckout: (cep: string, shippingOption: ShippingOption | null) => void;
}

export function CartDrawer({
  open,
  onClose,
  items,
  onUpdateQty,
  onRemoveItem,
  onCheckout,
}: CartDrawerProps) {
  const [cep, setCep] = useState('');
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [freightLoading, setFreightLoading] = useState(false);
  const [freightError, setFreightError] = useState('');
  const [regionLabel, setRegionLabel] = useState('');

  if (!open) return null;

  const subtotalCents = items.reduce(
    (sum, item) => sum + effectivePriceCents(item.priceCents, item.promoPriceCents) * item.quantity,
    0
  );

  const handleCalculateFreight = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = onlyDigits(cep);
    if (digits.length !== 8) {
      setFreightError('Digite um CEP válido com 8 dígitos.');
      return;
    }
    setFreightError('');
    setFreightLoading(true);
    try {
      const res = await apiRequest<{
        regionLabel: string;
        options: ShippingOption[];
      }>('/api/shipping/calculate', {
        method: 'POST',
        body: {cep: digits, subtotalCents},
      });
      setShippingOptions(res.options);
      setRegionLabel(res.regionLabel);
      setSelectedShipping(res.options[0] || null);
    } catch (err) {
      setFreightError(err instanceof Error ? err.message : 'Erro ao calcular frete.');
    } finally {
      setFreightLoading(false);
    }
  };

  const shippingCents = selectedShipping ? selectedShipping.priceCents : 0;
  const totalCents = subtotalCents + shippingCents;
  const missingForFreeFreight = Math.max(0, 15000 - subtotalCents);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#2D1B12]/45 backdrop-blur-xs">
      <div
        className="w-full max-w-md bg-[#FFFDF9] h-full flex flex-col border-l border-[#EAD5BC] shadow-2xl"
        role="dialog"
        aria-label="Sacola de compras"
      >
        <div className="px-6 py-4 border-b border-[#EAD5BC] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#D94A12]" />
            <h2 className="font-display text-xl font-semibold text-[#2D1B12]">Sua Sacola</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar sacola"
            className="p-2 rounded-lg text-[#5D4030] hover:bg-[#F5E6D3] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free freight progress hint */}
        {items.length > 0 && (
          <div className="px-6 py-2.5 bg-[#FDF8F3] border-b border-[#EAD5BC] text-xs text-[#5D4030]">
            {missingForFreeFreight > 0 ? (
              <span>
                Faltam <strong className="text-[#D94A12] tabular-nums">{formatBRL(missingForFreeFreight)}</strong> para ganhar{' '}
                <strong>Frete Grátis (PAC)</strong>.
              </span>
            ) : (
              <span className="font-medium text-[#2D1B12]">
                Parabéns! Você garantiu Frete Grátis (PAC) nesta compra.
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <ShoppingBag className="w-12 h-12 text-[#C49A45]/60 mb-3" />
              <p className="font-display text-lg text-[#2D1B12]">Sua sacola está vazia</p>
              <p className="text-sm text-[#664938] mt-1 max-w-xs">
                Explore nossa coleção de brincos, colares e conjuntos sem precisar fazer login.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 px-5 py-2.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] transition-colors cursor-pointer"
              >
                Continuar Comprando
              </button>
            </div>
          ) : (
            <>
              {items.map((item) => {
                const unitPrice = effectivePriceCents(item.priceCents, item.promoPriceCents);
                return (
                  <div key={item.productId} className="flex gap-3.5 pb-4 border-b border-[#F5E6D3]">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-[#F5E6D3]/50 shrink-0 border border-[#EAD5BC]">
                      <ResilientImage src={item.imageUrl} alt={item.name} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[#2D1B12] line-clamp-2">{item.name}</h3>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.productId)}
                          aria-label={`Remover ${item.name}`}
                          className="p-1 text-[#8B6F5C] hover:text-[#D94A12] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-[#664938] mt-0.5 tabular-nums">{formatBRL(unitPrice)} cada</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="inline-flex items-center border border-[#EAD5BC] rounded-lg bg-white">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.productId, item.quantity - 1)}
                            aria-label="Diminuir quantidade"
                            className="p-1.5 text-[#5D4030] hover:bg-[#FDF8F3] cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-3 text-xs font-semibold text-[#2D1B12] tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={item.quantity >= item.stock}
                            onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
                            aria-label="Aumentar quantidade"
                            className="p-1.5 text-[#5D4030] hover:bg-[#FDF8F3] disabled:opacity-40 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-bold text-[#2D1B12] tabular-nums">
                          {formatBRL(unitPrice * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* CEP Freight Calculator */}
              <div className="pt-2">
                <form onSubmit={handleCalculateFreight} className="space-y-2">
                  <label className="text-xs font-semibold text-[#2D1B12] flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-[#D94A12]" />
                    <span>Calcular frete e prazo pelo CEP</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cep}
                      onChange={(e) => setCep(formatCepInput(e.target.value))}
                      placeholder="00000-000"
                      maxLength={9}
                      className="flex-1 bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm text-[#2D1B12] font-mono focus:outline-none focus:border-[#D94A12]"
                    />
                    <button
                      type="submit"
                      disabled={freightLoading}
                      className="px-4 py-2 rounded-lg border border-[#2D1B12] text-[#2D1B12] text-xs font-semibold hover:bg-[#2D1B12] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {freightLoading ? 'Calculando...' : 'Calcular'}
                    </button>
                  </div>
                  {freightError && <p className="text-xs text-[#D94A12]">{freightError}</p>}
                </form>

                {shippingOptions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] text-[#8B6F5C]">Região estimada: {regionLabel}</p>
                    {shippingOptions.map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          selectedShipping?.id === opt.id
                            ? 'border-[#D94A12] bg-[#FDF8F3]'
                            : 'border-[#EAD5BC] bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="cart_shipping"
                            checked={selectedShipping?.id === opt.id}
                            onChange={() => setSelectedShipping(opt)}
                            className="accent-[#D94A12]"
                          />
                          <div>
                            <div className="font-semibold text-[#2D1B12]">{opt.name}</div>
                            <div className="text-[#8B6F5C]">Entrega em até {opt.estimatedDays} dias úteis</div>
                          </div>
                        </div>
                        <span className="font-bold text-[#2D1B12] tabular-nums">
                          {opt.priceCents === 0 ? 'Grátis' : formatBRL(opt.priceCents)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 bg-[#FDF8F3] border-t border-[#EAD5BC] space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#664938]">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatBRL(subtotalCents)}</span>
              </div>
              {selectedShipping && (
                <div className="flex justify-between text-[#664938]">
                  <span>Frete ({selectedShipping.service})</span>
                  <span className="tabular-nums">
                    {shippingCents === 0 ? 'Grátis' : formatBRL(shippingCents)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[#2D1B12] pt-2 border-t border-[#EAD5BC]">
                <span>Total estimado</span>
                <span className="tabular-nums">{formatBRL(totalCents)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCheckout(cep, selectedShipping);
                }}
                className="w-full py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] transition-colors cursor-pointer"
              >
                Finalizar Compra
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-lg border border-[#EAD5BC] bg-white text-[#2D1B12] text-xs font-semibold hover:bg-[#F5E6D3]/60 transition-colors cursor-pointer"
              >
                Continuar Comprando
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
