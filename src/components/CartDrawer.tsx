import {useState} from 'react';
import {Minus, Plus, ShoppingBag, Trash2, Truck, X} from 'lucide-react';
import type {CartItem, PublicStoreSettings, ShippingOption} from '../types';
import {effectivePriceCents, formatBRL, formatCepInput, onlyDigits} from '../utils/format';
import {apiRequest} from '../services/api';
import {ResilientImage} from './BrandLogo';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  storeSettings?: PublicStoreSettings | null;
  onUpdateQty: (productId: number, qty: number) => void;
  onRemoveItem: (productId: number) => void;
  onCheckout: (cep: string, shippingOption: ShippingOption | null) => void;
}

export function CartDrawer({
  open,
  onClose,
  items,
  storeSettings,
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
  const freeThreshold = storeSettings?.freeShippingThresholdCents ?? 0;
  const missingForFreeFreight = freeThreshold > 0 ? Math.max(0, freeThreshold - subtotalCents) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#3D2113]/45 backdrop-blur-xs">
      <div
        className="w-full sm:max-w-md bg-[#FFFFFF] h-dvh flex flex-col border-l border-[#F2D2B6] shadow-2xl"
        role="dialog"
        aria-label="Sacola de compras"
      >
        <div className="px-6 py-4 border-b border-[#F2D2B6] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#EA580C]" />
            <h2 className="font-display text-xl font-semibold text-[#3D2113]">Sua Sacola</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar sacola"
            className="p-2 rounded-lg text-[#5E3824] hover:bg-[#FFE8D4] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free freight progress hint */}
        {items.length > 0 && freeThreshold > 0 && (
          <div className="px-6 py-2.5 bg-[#FFF9F4] border-b border-[#F2D2B6] text-xs text-[#5E3824]">
            {missingForFreeFreight > 0 ? (
              <span>
                Faltam <strong className="text-[#EA580C] tabular-nums">{formatBRL(missingForFreeFreight)}</strong> para ganhar{' '}
                <strong>Frete Grátis (PAC)</strong>.
              </span>
            ) : (
              <span className="font-medium text-[#3D2113]">
                Parabéns! Você garantiu Frete Grátis (PAC) nesta compra.
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <ShoppingBag className="w-12 h-12 text-[#D4A548]/60 mb-3" />
              <p className="font-display text-lg text-[#3D2113]">Sua sacola está vazia</p>
              <p className="text-sm text-[#7A4D35] mt-1 max-w-xs">
                Explore nossa coleção de brincos, colares e conjuntos sem precisar fazer login.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 px-5 py-2.5 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] transition-colors cursor-pointer"
              >
                Continuar Comprando
              </button>
            </div>
          ) : (
            <>
              {items.map((item) => {
                const unitPrice = effectivePriceCents(item.priceCents, item.promoPriceCents);
                return (
                  <div key={item.productId} className="flex gap-3.5 pb-4 border-b border-[#FFE8D4]">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-[#FFE8D4]/50 shrink-0 border border-[#F2D2B6]">
                      <ResilientImage src={item.imageUrl} alt={item.name} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[#3D2113] line-clamp-2">{item.name}</h3>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.productId)}
                          aria-label={`Remover ${item.name}`}
                          className="p-1 text-[#9A6B50] hover:text-[#EA580C] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-[#7A4D35] mt-0.5 tabular-nums">{formatBRL(unitPrice)} cada</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="inline-flex items-center border border-[#F2D2B6] rounded-lg bg-white h-10">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.productId, item.quantity - 1)}
                            aria-label="Diminuir quantidade"
                            className="px-3 h-full text-[#5E3824] hover:bg-[#FFF9F4] cursor-pointer flex items-center justify-center"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-3 text-xs font-semibold text-[#3D2113] tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={item.quantity >= item.stock}
                            onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
                            aria-label="Aumentar quantidade"
                            className="px-3 h-full text-[#5E3824] hover:bg-[#FFF9F4] disabled:opacity-40 cursor-pointer flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-bold text-[#3D2113] tabular-nums">
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
                  <label className="text-xs font-semibold text-[#3D2113] flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-[#EA580C]" />
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
                      className="flex-1 bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm text-[#3D2113] font-mono focus:outline-none focus:border-[#EA580C]"
                    />
                    <button
                      type="submit"
                      disabled={freightLoading}
                      className="px-4 py-2 rounded-lg border border-[#3D2113] text-[#3D2113] text-xs font-semibold hover:bg-[#3D2113] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {freightLoading ? 'Calculando...' : 'Calcular'}
                    </button>
                  </div>
                  {freightError && <p className="text-xs text-[#EA580C]">{freightError}</p>}
                </form>

                {shippingOptions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] text-[#9A6B50]">Região estimada: {regionLabel}</p>
                    {shippingOptions.map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          selectedShipping?.id === opt.id
                            ? 'border-[#EA580C] bg-[#FFF9F4]'
                            : 'border-[#F2D2B6] bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="cart_shipping"
                            checked={selectedShipping?.id === opt.id}
                            onChange={() => setSelectedShipping(opt)}
                            className="accent-[#EA580C]"
                          />
                          <div>
                            <div className="font-semibold text-[#3D2113]">{opt.name}</div>
                            <div className="text-[#9A6B50]">Entrega em até {opt.estimatedDays} dias úteis</div>
                          </div>
                        </div>
                        <span className="font-bold text-[#3D2113] tabular-nums">
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
          <div className="p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-[#FFF9F4] border-t border-[#F2D2B6] space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#7A4D35]">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatBRL(subtotalCents)}</span>
              </div>
              {selectedShipping && (
                <div className="flex justify-between text-[#7A4D35]">
                  <span>Frete ({selectedShipping.service})</span>
                  <span className="tabular-nums">
                    {shippingCents === 0 ? 'Grátis' : formatBRL(shippingCents)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[#3D2113] pt-2 border-t border-[#F2D2B6]">
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
                className="w-full py-3 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] transition-colors cursor-pointer min-h-[46px]"
              >
                Finalizar Compra
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-lg border border-[#F2D2B6] bg-white text-[#3D2113] text-xs font-semibold hover:bg-[#FFE8D4]/60 transition-colors cursor-pointer min-h-[44px]"
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
