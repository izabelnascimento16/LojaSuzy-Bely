import {useEffect, useState} from 'react';
import {
  AlertCircle,
  Barcode,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  QrCode,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import type {Address, CartItem, PublicStoreSettings, ShippingOption, User} from '../types';
import {apiRequest} from '../services/api';
import {effectivePriceCents, formatBRL, formatCepInput, onlyDigits} from '../utils/format';
import {AuthForm} from './AuthForm';

interface CheckoutViewProps {
  items: CartItem[];
  user: User | null;
  addresses: Address[];
  initialCep: string;
  initialShipping: ShippingOption | null;
  storeSettings?: PublicStoreSettings | null;
  onAuthSuccess: (user: User, addresses: Address[]) => void;
  onOrderCompleted: () => void;
  onGoToOrders: () => void;
  onBackToStore: () => void;
}

interface ConfirmedOrderResponse {
  id: number;
  orderNumber: string;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  shippingLabel: string;
  estimatedDays: number;
  paymentMethod: 'pix' | 'credit_card' | 'boleto';
  paymentStatus: string;
  pixCopyPaste: string;
  boletoBarcode: string;
  cardLast4: string;
  cardBrand: string;
  checkoutUrl?: string;
  hasRealPixKey?: boolean;
  mercadoPagoConfigured?: boolean;
  whatsappNumber?: string;
  emailSentTo: string;
  emailDispatched?: boolean;
  items: {productId: number; name: string; unitPriceCents: number; quantity: number; lineTotalCents: number}[];
}

export function CheckoutView({
  items,
  user,
  addresses,
  initialCep,
  initialShipping,
  storeSettings,
  onAuthSuccess,
  onOrderCompleted,
  onGoToOrders,
  onBackToStore,
}: CheckoutViewProps) {
  const [step, setStep] = useState<number>(user ? 2 : 1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Step 2: Address state (editable before confirming)
  const defaultAddr = addresses.find((a) => Boolean(a.is_default)) || addresses[0];
  const [cep, setCep] = useState(defaultAddr?.cep || initialCep || '');
  const [street, setStreet] = useState(defaultAddr?.street || '');
  const [number, setNumber] = useState(defaultAddr?.number || '');
  const [complement, setComplement] = useState(defaultAddr?.complement || '');
  const [neighborhood, setNeighborhood] = useState(defaultAddr?.neighborhood || '');
  const [city, setCity] = useState(defaultAddr?.city || '');
  const [state, setState] = useState(defaultAddr?.state || 'RO');
  const [cepLoading, setCepLoading] = useState(false);

  // Step 3: Shipping
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>(initialShipping ? [initialShipping] : []);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(initialShipping);
  const [shippingLoading, setShippingLoading] = useState(false);

  // Step 4: Payment
  const enablePix = storeSettings?.enablePix ?? true;
  const enableCreditCard = storeSettings?.enableCreditCard ?? true;
  const enableBoleto = storeSettings?.enableBoleto ?? true;
  const pixDiscountPct = storeSettings?.pixDiscountPercent ?? 5;
  const maxInstallments = Math.max(1, Math.min(12, storeSettings?.maxInstallments ?? 3));

  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card' | 'boleto'>(
    enablePix ? 'pix' : enableCreditCard ? 'credit_card' : 'boleto'
  );
  const [cardInstallments, setCardInstallments] = useState(1);

  // Step 6: Confirmation
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrderResponse | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixConfirming, setPixConfirming] = useState(false);
  const [pixNoticeMsg, setPixNoticeMsg] = useState('');

  const subtotalCents = items.reduce(
    (sum, item) => sum + effectivePriceCents(item.priceCents, item.promoPriceCents) * item.quantity,
    0
  );

  useEffect(() => {
    if (user && step === 1) {
      setStep(2);
    }
  }, [user, step]);

  useEffect(() => {
    if (defaultAddr && !street) {
      setCep(defaultAddr.cep);
      setStreet(defaultAddr.street);
      setNumber(defaultAddr.number);
      setComplement(defaultAddr.complement || '');
      setNeighborhood(defaultAddr.neighborhood);
      setCity(defaultAddr.city);
      setState(defaultAddr.state);
    }
  }, [defaultAddr, street]);

  const handleSelectSavedAddress = (addr: Address) => {
    setCep(addr.cep);
    setStreet(addr.street);
    setNumber(addr.number);
    setComplement(addr.complement || '');
    setNeighborhood(addr.neighborhood);
    setCity(addr.city);
    setState(addr.state);
  };

  const lookupCep = async (cepVal: string) => {
    const digits = onlyDigits(cepVal);
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const data = await apiRequest<{
        street: string;
        neighborhood: string;
        city: string;
        state: string;
      }>(`/api/cep/${digits}`);
      if (data.street) setStreet(data.street);
      if (data.neighborhood) setNeighborhood(data.neighborhood);
      if (data.city) setCity(data.city);
      if (data.state) setState(data.state);
    } catch {
      // Allow manual correction
    } finally {
      setCepLoading(false);
    }
  };

  const loadShippingOptions = async () => {
    const digits = onlyDigits(cep);
    if (digits.length !== 8 || !street || !number || !neighborhood || !city || !state) {
      setError('Preencha todos os campos obrigatórios do endereço de entrega.');
      return;
    }
    setError('');
    setShippingLoading(true);
    try {
      const res = await apiRequest<{options: ShippingOption[]}>('/api/shipping/calculate', {
        method: 'POST',
        body: {cep: digits, subtotalCents},
      });
      setShippingOptions(res.options);
      setSelectedShipping(res.options[0] || null);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao calcular frete.');
    } finally {
      setShippingLoading(false);
    }
  };

  const shippingCents = selectedShipping ? selectedShipping.priceCents : 0;
  const pixDiscountCents = paymentMethod === 'pix' && pixDiscountPct > 0 ? Math.round((subtotalCents * pixDiscountPct) / 100) : 0;
  const finalTotalCents = subtotalCents + shippingCents - pixDiscountCents;

  const handlePlaceOrder = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{order: ConfirmedOrderResponse}>('/api/checkout', {
        method: 'POST',
        body: {
          items: items.map((i) => ({productId: i.productId, quantity: i.quantity})),
          address: {cep, street, number, complement, neighborhood, city, state},
          shippingMethod: selectedShipping?.id || 'pac',
          paymentMethod,
        },
      });
      setConfirmedOrder(res.order);
      setStep(6);
      onOrderCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível finalizar o pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPixNotice = async () => {
    if (!confirmedOrder) return;
    setPixConfirming(true);
    setPixNoticeMsg('');
    try {
      const res = await apiRequest<{confirmedByGateway: boolean; message: string}>(`/api/orders/${confirmedOrder.id}/confirm-pix`, {
        method: 'POST',
      });
      setPixNoticeMsg(res.message);
      if (res.confirmedByGateway) {
        setConfirmedOrder({...confirmedOrder, status: 'pago', paymentStatus: 'approved'});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao verificar pagamento PIX.');
    } finally {
      setPixConfirming(false);
    }
  };

  if (items.length === 0 && !confirmedOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-3xl text-[#3D2113]">Sua sacola está vazia</h1>
        <p className="text-sm text-[#7A4D35]">Adicione bijuterias ao carrinho antes de seguir para o checkout.</p>
        <button
          type="button"
          onClick={onBackToStore}
          className="px-6 py-3 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
        >
          Voltar para a Loja
        </button>
      </div>
    );
  }

  const stepsList = [
    {num: 1, label: 'Identificação'},
    {num: 2, label: 'Endereço'},
    {num: 3, label: 'Envio'},
    {num: 4, label: 'Pagamento'},
    {num: 5, label: 'Resumo'},
    {num: 6, label: 'Confirmação'},
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#3D2113]">Finalizar Compra</h1>
        <p className="text-xs sm:text-sm text-[#7A4D35] mt-1">Checkout seguro Suzy Bely · Seus dados protegidos pela LGPD</p>

        {/* Mobile Step Progress */}
        <div className="mt-4 sm:hidden space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#3D2113]">
            <span>
              Etapa {step} de 6 — {stepsList.find((s) => s.num === step)?.label}
            </span>
            <span className="font-mono text-[#EA580C]">{Math.round((step / 6) * 100)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#FFE8D4] overflow-hidden">
            <div
              className="h-full bg-[#EA580C] transition-all duration-200"
              style={{width: `${(step / 6) * 100}%`}}
            />
          </div>
        </div>

        {/* Tablet & Desktop Stepper */}
        <ol className="hidden sm:grid mt-6 grid-cols-3 md:grid-cols-6 gap-2">
          {stepsList.map((s) => (
            <li
              key={s.num}
              className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                step === s.num
                  ? 'border-[#EA580C] bg-[#FFFFFF] text-[#EA580C]'
                  : step > s.num
                    ? 'border-[#F2D2B6] bg-[#FFE8D4]/60 text-[#3D2113]'
                    : 'border-[#F2D2B6]/60 bg-transparent text-[#9A6B50]'
              }`}
            >
              <span className="font-mono font-semibold">{s.num}.</span>
              <span className="truncate">{s.label}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Mobile Compact Summary Strip */}
      {!confirmedOrder && (
        <div className="lg:hidden mb-5 px-4 py-3 rounded-xl bg-[#FFF2E6] border border-[#F2D2B6] flex items-center justify-between text-xs sm:text-sm">
          <span className="text-[#5E3824] font-medium">
            {items.reduce((acc, i) => acc + i.quantity, 0)} item(ns) na sacola
          </span>
          <span className="font-bold text-[#3D2113] tabular-nums">
            Total: {formatBRL(finalTotalCents)}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-[#EA580C]/10 border border-[#EA580C]/30 text-sm text-[#C94506] flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-4 sm:p-8">
          {/* STEP 1: Identificação (Login ou Cadastro) */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#3D2113]">1. Identificação do Cliente</h2>
                <p className="text-sm text-[#7A4D35] mt-1">
                  Entre com sua conta ou faça seu cadastro rápido para entrega e emissão do pedido.
                </p>
              </div>
              <AuthForm
                onSuccess={(loggedUser, userAddresses) => {
                  onAuthSuccess(loggedUser, userAddresses);
                  setStep(2);
                }}
              />
            </div>
          )}

          {/* STEP 2: Endereço de Entrega */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#3D2113]">2. Endereço de Entrega</h2>
                <p className="text-sm text-[#7A4D35] mt-1">
                  Confira ou corrija os dados do endereço antes de calcular o envio.
                </p>
              </div>

              {addresses.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-[#5E3824]">Endereços salvos</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {addresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => handleSelectSavedAddress(addr)}
                        className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                          street === addr.street && number === addr.number
                            ? 'border-[#EA580C] bg-[#FFF9F4]'
                            : 'border-[#F2D2B6] bg-white hover:border-[#D4A548]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#3D2113]">
                          <MapPin className="w-3.5 h-3.5 text-[#EA580C]" />
                          <span>{addr.label}</span>
                        </div>
                        <p className="text-xs text-[#7A4D35] mt-1">
                          {addr.street}, {addr.number} {addr.complement ? `- ${addr.complement}` : ''}
                        </p>
                        <p className="text-xs text-[#9A6B50]">
                          {addr.neighborhood} · {addr.city}/{addr.state} · CEP {addr.cep}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 pt-2 border-t border-[#FFE8D4]">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#3D2113] mb-1">CEP *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cep}
                      onChange={(e) => {
                        const f = formatCepInput(e.target.value);
                        setCep(f);
                        if (onlyDigits(f).length === 8) lookupCep(f);
                      }}
                      maxLength={9}
                      className="flex-1 bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#EA580C]"
                    />
                    {cepLoading && <Loader2 className="w-5 h-5 animate-spin text-[#EA580C] self-center" />}
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#3D2113] mb-1">Estado (UF) *</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-xs font-semibold text-[#3D2113] mb-1">Rua / Logradouro *</label>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#3D2113] mb-1">Número *</label>
                  <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#3D2113] mb-1">Complemento</label>
                  <input
                    type="text"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#3D2113] mb-1">Bairro *</label>
                  <input
                    type="text"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-xs font-semibold text-[#3D2113] mb-1">Cidade *</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={loadShippingOptions}
                  disabled={shippingLoading}
                  className="px-6 py-3 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {shippingLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Escolher Método de Envio</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Método de Envio */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#3D2113]">3. Método de Envio</h2>
                <p className="text-sm text-[#7A4D35] mt-1">
                  Opções calculadas para o CEP <span className="font-mono font-semibold">{cep}</span>.
                </p>
              </div>

              <div className="space-y-3">
                {shippingOptions.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                      selectedShipping?.id === opt.id
                        ? 'border-[#EA580C] bg-[#FFF9F4]'
                        : 'border-[#F2D2B6] bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="checkout_shipping"
                        checked={selectedShipping?.id === opt.id}
                        onChange={() => setSelectedShipping(opt)}
                        className="accent-[#EA580C]"
                      />
                      <div>
                        <div className="text-sm font-semibold text-[#3D2113] flex items-center gap-2">
                          <Truck className="w-4 h-4 text-[#EA580C]" />
                          <span>{opt.name}</span>
                        </div>
                        <p className="text-xs text-[#7A4D35] mt-0.5">
                          Prazo estimado: até {opt.estimatedDays} dias úteis após postagem
                        </p>
                      </div>
                    </div>
                    <span className="text-base font-bold text-[#3D2113] tabular-nums">
                      {opt.priceCents === 0 ? 'Grátis' : formatBRL(opt.priceCents)}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-sm font-medium text-[#7A4D35] hover:text-[#3D2113] cursor-pointer"
                >
                  Voltar ao endereço
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-6 py-3 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
                >
                  Ir para Pagamento
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Forma de Pagamento */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#3D2113]">4. Forma de Pagamento</h2>
                <p className="text-sm text-[#7A4D35] mt-1">
                  Transação processada via gateway seguro Mercado Pago. Nenhum dado completo do cartão é salvo.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  ...(enablePix
                    ? [
                        {
                          id: 'pix' as const,
                          label: pixDiscountPct > 0 ? `PIX (${pixDiscountPct}% OFF)` : 'PIX',
                          icon: QrCode,
                          sub: 'Pagamento instantâneo',
                        },
                      ]
                    : []),
                  ...(enableCreditCard
                    ? [
                        {
                          id: 'credit_card' as const,
                          label: 'Cartão de Crédito',
                          icon: CreditCard,
                          sub: maxInstallments > 1 ? `Até ${maxInstallments}x sem juros` : 'À vista no cartão',
                        },
                      ]
                    : []),
                  ...(enableBoleto
                    ? [{id: 'boleto' as const, label: 'Boleto Bancário', icon: Barcode, sub: 'Compensação em 1-2 dias'}]
                    : []),
                ].map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentMethod(opt.id)}
                      className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                        paymentMethod === opt.id
                          ? 'border-[#EA580C] bg-[#FFF9F4]'
                          : 'border-[#F2D2B6] bg-white hover:border-[#D4A548]'
                      }`}
                    >
                      <Icon className="w-5 h-5 text-[#EA580C] mb-2" />
                      <div className="text-sm font-semibold text-[#3D2113]">{opt.label}</div>
                      <div className="text-xs text-[#7A4D35] mt-0.5">{opt.sub}</div>
                    </button>
                  );
                })}
              </div>

              {paymentMethod === 'pix' && (
                <div className="p-4 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6] text-sm text-[#5E3824]">
                  {pixDiscountPct > 0 ? (
                    <>
                      Você ganha <strong>{pixDiscountPct}% de desconto instantâneo</strong> nos produtos pagando via PIX. O código PIX Copia e Cola será gerado imediatamente após confirmar o pedido.
                    </>
                  ) : (
                    <>O código PIX Copia e Cola será gerado imediatamente após confirmar o pedido.</>
                  )}
                </div>
              )}

              {paymentMethod === 'credit_card' && (
                <div className="space-y-3 p-4 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6]">
                  <p className="text-sm text-[#5E3824] leading-relaxed">
                    {storeSettings?.mercadoPagoConfigured
                      ? 'Ao confirmar o pedido, você receberá o link do ambiente protegido do Mercado Pago para digitar seu cartão com total segurança.'
                      : storeSettings?.hasExternalPaymentLink
                        ? 'Ao confirmar o pedido, você receberá o link oficial de pagamento da loja para concluir com seu cartão de crédito.'
                        : 'Após confirmar o pedido, nossa equipe enviará o link seguro de pagamento no cartão pelo WhatsApp ou área do pedido.'}
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-[#3D2113] mb-1">Parcelamento desejado</label>
                    <select
                      value={cardInstallments}
                      onChange={(e) => setCardInstallments(Number(e.target.value))}
                      className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                    >
                      {Array.from({length: maxInstallments}, (_, idx) => idx + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}x de {formatBRL(Math.round(finalTotalCents / n))} sem juros
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {paymentMethod === 'boleto' && (
                <div className="p-4 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6] text-sm text-[#5E3824]">
                  O boleto bancário será disponibilizado após a confirmação do pedido, com vencimento em 2 dias úteis.
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-sm font-medium text-[#7A4D35] hover:text-[#3D2113] cursor-pointer"
                >
                  Voltar ao envio
                </button>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="px-6 py-3 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
                >
                  Revisar Pedido
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Resumo da Compra */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#3D2113]">5. Resumo da Compra</h2>
                <p className="text-sm text-[#7A4D35] mt-1">Revise todos os detalhes antes de confirmar seu pedido.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="p-4 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6]">
                  <div className="font-semibold text-[#3D2113] mb-1">Entrega</div>
                  <p className="text-[#5E3824]">
                    {street}, {number} {complement && `- ${complement}`}
                  </p>
                  <p className="text-[#5E3824]">
                    {neighborhood} · {city}/{state}
                  </p>
                  <p className="text-[#9A6B50] font-mono text-xs mt-1">CEP {cep}</p>
                </div>
                <div className="p-4 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6]">
                  <div className="font-semibold text-[#3D2113] mb-1">Envio &amp; Pagamento</div>
                  <p className="text-[#5E3824]">{selectedShipping?.name}</p>
                    <p className="text-[#5E3824] mt-1">
                      Pagamento:{' '}
                      <strong>
                        {paymentMethod === 'pix'
                          ? pixDiscountPct > 0
                            ? `PIX (${pixDiscountPct}% de desconto)`
                            : 'PIX'
                          : paymentMethod === 'credit_card'
                            ? `Cartão de Crédito (${cardInstallments}x)`
                            : 'Boleto Bancário'}
                      </strong>
                    </p>
                </div>
              </div>

              <div className="divide-y divide-[#FFE8D4] border border-[#F2D2B6] rounded-xl px-4">
                {items.map((item) => {
                  const unit = effectivePriceCents(item.priceCents, item.promoPriceCents);
                  return (
                    <div key={item.productId} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-[#3D2113]">{item.name}</span>
                        <span className="text-[#9A6B50] ml-2">x{item.quantity}</span>
                      </div>
                      <span className="font-semibold text-[#3D2113] tabular-nums">
                        {formatBRL(unit * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="text-sm font-medium text-[#7A4D35] hover:text-[#3D2113] cursor-pointer"
                >
                  Alterar pagamento
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handlePlaceOrder}
                  className="px-7 py-3.5 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Confirmar Pedido</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: Confirmação */}
          {step === 6 && confirmedOrder && (
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display text-2xl font-semibold text-[#3D2113]">
                    Pedido {confirmedOrder.orderNumber} Confirmado!
                  </h2>
                  <p className="text-sm text-[#5E3824] mt-1">
                    {confirmedOrder.emailDispatched ? (
                      <>
                        Enviamos a confirmação com todos os detalhes para <strong>{confirmedOrder.emailSentTo}</strong>.
                      </>
                    ) : (
                      <>
                        Pedido registrado na conta <strong>{confirmedOrder.emailSentTo}</strong>. Acompanhe todos os detalhes e pagamentos aqui e na Área do Cliente.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {confirmedOrder.checkoutUrl && confirmedOrder.paymentStatus !== 'approved' && (
                <div className="p-5 rounded-xl bg-[#FFF2E6] border border-[#EA580C]/40 space-y-3">
                  <div className="text-sm font-semibold text-[#3D2113]">
                    Concluir Pagamento Online com Segurança
                  </div>
                  <p className="text-xs text-[#5E3824]">
                    Clique no botão abaixo para acessar a página segura de pagamento e finalizar o seu pedido {confirmedOrder.orderNumber}.
                  </p>
                  <a
                    href={confirmedOrder.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] transition-colors"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Pagar Agora ({formatBRL(confirmedOrder.totalCents)})</span>
                  </a>
                </div>
              )}

              {confirmedOrder.paymentMethod === 'pix' && confirmedOrder.paymentStatus !== 'approved' && (
                <div className="p-5 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6] space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#3D2113]">
                    <QrCode className="w-5 h-5 text-[#EA580C]" />
                    <span>Pague via PIX Copia e Cola</span>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-[#F2D2B6] font-mono text-xs break-all text-[#5E3824]">
                    {confirmedOrder.pixCopyPaste}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(confirmedOrder.pixCopyPaste);
                        setPixCopied(true);
                        setTimeout(() => setPixCopied(false), 2000);
                      }}
                      className="px-4 py-2 rounded-lg border border-[#3D2113] text-xs font-semibold text-[#3D2113] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{pixCopied ? 'Código copiado!' : 'Copiar código PIX'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={pixConfirming}
                      onClick={handleConfirmPixNotice}
                      className="px-4 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-[#C94506] cursor-pointer"
                    >
                      {pixConfirming
                        ? 'Verificando...'
                        : confirmedOrder.mercadoPagoConfigured
                          ? 'Verificar Pagamento PIX'
                          : 'Já fiz o PIX · Avisar Loja'}
                    </button>
                    {confirmedOrder.whatsappNumber && (
                      <a
                        href={`https://wa.me/${
                          confirmedOrder.whatsappNumber.startsWith('55')
                            ? confirmedOrder.whatsappNumber
                            : `55${confirmedOrder.whatsappNumber}`
                        }?text=${encodeURIComponent(
                          `Olá Suzy Bely! Acabei de fazer o pedido ${confirmedOrder.orderNumber} no valor de ${formatBRL(confirmedOrder.totalCents)} e gostaria de enviar o comprovante.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-lg border border-emerald-700 text-emerald-800 text-xs font-semibold hover:bg-emerald-50"
                      >
                        Enviar comprovante no WhatsApp
                      </a>
                    )}
                  </div>
                  {pixNoticeMsg && (
                    <div className="p-3 rounded-lg bg-white border border-[#F2D2B6] text-xs text-[#3D2113]">
                      {pixNoticeMsg}
                    </div>
                  )}
                </div>
              )}

              {confirmedOrder.paymentMethod === 'credit_card' &&
                !confirmedOrder.checkoutUrl &&
                confirmedOrder.paymentStatus !== 'approved' && (
                  <div className="p-5 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6] space-y-3">
                    <div className="text-sm font-semibold text-[#3D2113]">Aguardando link de pagamento no cartão</div>
                    <p className="text-xs text-[#5E3824]">
                      Seu pedido foi reservado! Nossa equipe enviará o link seguro para pagamento no cartão ou você pode solicitar diretamente pelo WhatsApp abaixo.
                    </p>
                    {confirmedOrder.whatsappNumber && (
                      <a
                        href={`https://wa.me/${
                          confirmedOrder.whatsappNumber.startsWith('55')
                            ? confirmedOrder.whatsappNumber
                            : `55${confirmedOrder.whatsappNumber}`
                        }?text=${encodeURIComponent(
                          `Olá Suzy Bely! Fiz o pedido ${confirmedOrder.orderNumber} (${formatBRL(confirmedOrder.totalCents)}) e gostaria do link para pagamento no cartão.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-[#C94506]"
                      >
                        Solicitar link no WhatsApp
                      </a>
                    )}
                  </div>
                )}

              {confirmedOrder.paymentMethod === 'boleto' && !confirmedOrder.checkoutUrl && (
                <div className="p-5 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6] space-y-2">
                  <div className="text-sm font-semibold text-[#3D2113]">Linha digitável do Boleto Bancário</div>
                  <div className="p-3 rounded-lg bg-white border border-[#F2D2B6] font-mono text-xs text-[#3D2113]">
                    {confirmedOrder.boletoBarcode}
                  </div>
                </div>
              )}

              {confirmedOrder.paymentStatus === 'approved' && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2.5">
                  <PackageCheck className="w-5 h-5 text-emerald-700" />
                  <span>Pagamento aprovado! Suas bijuterias já estão em separação.</span>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={onGoToOrders}
                  className="px-6 py-3 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
                >
                  Acompanhar na Área do Cliente
                </button>
                <button
                  type="button"
                  onClick={onBackToStore}
                  className="px-6 py-3 rounded-lg border border-[#F2D2B6] text-[#3D2113] text-sm font-semibold hover:bg-[#FFE8D4]/60 cursor-pointer"
                >
                  Continuar Navegando
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Summary Sidebar */}
        {!confirmedOrder && (
          <aside className="lg:col-span-4 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 space-y-4 lg:sticky lg:top-24">
            <h3 className="font-display text-lg font-semibold text-[#3D2113]">Resumo Financeiro</h3>
            <div className="space-y-2 text-sm border-b border-[#FFE8D4] pb-4">
              {items.map((item) => {
                const unit = effectivePriceCents(item.priceCents, item.promoPriceCents);
                return (
                  <div key={item.productId} className="flex justify-between gap-2 text-[#5E3824]">
                    <span className="truncate">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="tabular-nums shrink-0">{formatBRL(unit * item.quantity)}</span>
                  </div>
                );
              })}
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#7A4D35]">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatBRL(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-[#7A4D35]">
                <span>Frete</span>
                <span className="tabular-nums">
                  {selectedShipping
                    ? shippingCents === 0
                      ? 'Grátis'
                      : formatBRL(shippingCents)
                    : 'A calcular'}
                </span>
              </div>
              {pixDiscountCents > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Desconto PIX ({pixDiscountPct}%)</span>
                  <span className="tabular-nums">-{formatBRL(pixDiscountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-[#3D2113] pt-2 border-t border-[#F2D2B6]">
                <span>Total</span>
                <span className="tabular-nums">{formatBRL(finalTotalCents)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#9A6B50] pt-1">
              <ShieldCheck className="w-4 h-4 text-[#D4A548] shrink-0" />
              <span>Compra protegida · Troca garantida em 7 dias</span>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
