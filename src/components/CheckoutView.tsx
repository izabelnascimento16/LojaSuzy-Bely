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
import type {Address, CartItem, ShippingOption, User} from '../types';
import {apiRequest} from '../services/api';
import {effectivePriceCents, formatBRL, formatCepInput, onlyDigits} from '../utils/format';
import {AuthForm} from './AuthForm';

interface CheckoutViewProps {
  items: CartItem[];
  user: User | null;
  addresses: Address[];
  initialCep: string;
  initialShipping: ShippingOption | null;
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
  emailSentTo: string;
  items: {productId: number; name: string; unitPriceCents: number; quantity: number; lineTotalCents: number}[];
}

export function CheckoutView({
  items,
  user,
  addresses,
  initialCep,
  initialShipping,
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
  const [state, setState] = useState(defaultAddr?.state || 'SP');
  const [cepLoading, setCepLoading] = useState(false);

  // Step 3: Shipping
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>(initialShipping ? [initialShipping] : []);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(initialShipping);
  const [shippingLoading, setShippingLoading] = useState(false);

  // Step 4: Payment
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card' | 'boleto'>('pix');
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardInstallments, setCardInstallments] = useState(1);

  // Step 6: Confirmation
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrderResponse | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixConfirming, setPixConfirming] = useState(false);

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
  const pixDiscountCents = paymentMethod === 'pix' ? Math.round(subtotalCents * 0.05) : 0;
  const finalTotalCents = subtotalCents + shippingCents - pixDiscountCents;

  const handlePlaceOrder = async () => {
    setError('');
    if (paymentMethod === 'credit_card') {
      const digits = onlyDigits(cardNumber);
      if (cardHolder.trim().length < 3 || digits.length < 13 || !cardExpiry.includes('/') || cardCvv.length < 3) {
        setError('Verifique os dados do cartão antes de concluir o pedido.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const cardDigits = onlyDigits(cardNumber);
      const cardBrand = cardDigits.startsWith('4')
        ? 'Visa'
        : cardDigits.startsWith('5')
          ? 'Mastercard'
          : 'Elo / Cartão';

      const res = await apiRequest<{order: ConfirmedOrderResponse}>('/api/checkout', {
        method: 'POST',
        body: {
          items: items.map((i) => ({productId: i.productId, quantity: i.quantity})),
          address: {cep, street, number, complement, neighborhood, city, state},
          shippingMethod: selectedShipping?.id || 'pac',
          paymentMethod,
          // Tokenize on client: send only last 4 digits & brand, never store full card or CVV
          cardTokenLast4: cardDigits.slice(-4),
          cardBrand,
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

  const handleConfirmPixDemo = async () => {
    if (!confirmedOrder) return;
    setPixConfirming(true);
    try {
      await apiRequest(`/api/orders/${confirmedOrder.id}/confirm-pix`, {method: 'POST'});
      setConfirmedOrder({...confirmedOrder, status: 'pago', paymentStatus: 'approved'});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar PIX.');
    } finally {
      setPixConfirming(false);
    }
  };

  if (items.length === 0 && !confirmedOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-3xl text-[#2D1B12]">Sua sacola está vazia</h1>
        <p className="text-sm text-[#664938]">Adicione bijuterias ao carrinho antes de seguir para o checkout.</p>
        <button
          type="button"
          onClick={onBackToStore}
          className="px-6 py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
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
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-[#2D1B12]">Finalizar Compra</h1>
        <p className="text-sm text-[#664938] mt-1">Checkout seguro Suzy Bely · Seus dados protegidos pela LGPD</p>

        {/* Stepper */}
        <ol className="mt-6 grid grid-cols-3 sm:grid-cols-6 gap-2">
          {stepsList.map((s) => (
            <li
              key={s.num}
              className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                step === s.num
                  ? 'border-[#D94A12] bg-[#FFFDF9] text-[#D94A12]'
                  : step > s.num
                    ? 'border-[#EAD5BC] bg-[#F5E6D3]/60 text-[#2D1B12]'
                    : 'border-[#EAD5BC]/60 bg-transparent text-[#8B6F5C]'
              }`}
            >
              <span className="font-mono font-semibold">{s.num}.</span>
              <span className="truncate">{s.label}</span>
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-[#D94A12]/10 border border-[#D94A12]/30 text-sm text-[#B83C0B] flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 sm:p-8">
          {/* STEP 1: Identificação (Login ou Cadastro) */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#2D1B12]">1. Identificação do Cliente</h2>
                <p className="text-sm text-[#664938] mt-1">
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
                <h2 className="font-display text-2xl font-semibold text-[#2D1B12]">2. Endereço de Entrega</h2>
                <p className="text-sm text-[#664938] mt-1">
                  Confira ou corrija os dados do endereço antes de calcular o envio.
                </p>
              </div>

              {addresses.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-[#5D4030]">Endereços salvos</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {addresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => handleSelectSavedAddress(addr)}
                        className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                          street === addr.street && number === addr.number
                            ? 'border-[#D94A12] bg-[#FDF8F3]'
                            : 'border-[#EAD5BC] bg-white hover:border-[#C49A45]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2D1B12]">
                          <MapPin className="w-3.5 h-3.5 text-[#D94A12]" />
                          <span>{addr.label}</span>
                        </div>
                        <p className="text-xs text-[#664938] mt-1">
                          {addr.street}, {addr.number} {addr.complement ? `- ${addr.complement}` : ''}
                        </p>
                        <p className="text-xs text-[#8B6F5C]">
                          {addr.neighborhood} · {addr.city}/{addr.state} · CEP {addr.cep}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 pt-2 border-t border-[#F5E6D3]">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#2D1B12] mb-1">CEP *</label>
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
                      className="flex-1 bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#D94A12]"
                    />
                    {cepLoading && <Loader2 className="w-5 h-5 animate-spin text-[#D94A12] self-center" />}
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Estado (UF) *</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-[#D94A12]"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Rua / Logradouro *</label>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Número *</label>
                  <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Complemento</label>
                  <input
                    type="text"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Bairro *</label>
                  <input
                    type="text"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                  />
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Cidade *</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={loadShippingOptions}
                  disabled={shippingLoading}
                  className="px-6 py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] transition-colors flex items-center gap-2 cursor-pointer"
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
                <h2 className="font-display text-2xl font-semibold text-[#2D1B12]">3. Método de Envio</h2>
                <p className="text-sm text-[#664938] mt-1">
                  Opções calculadas para o CEP <span className="font-mono font-semibold">{cep}</span>.
                </p>
              </div>

              <div className="space-y-3">
                {shippingOptions.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                      selectedShipping?.id === opt.id
                        ? 'border-[#D94A12] bg-[#FDF8F3]'
                        : 'border-[#EAD5BC] bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="checkout_shipping"
                        checked={selectedShipping?.id === opt.id}
                        onChange={() => setSelectedShipping(opt)}
                        className="accent-[#D94A12]"
                      />
                      <div>
                        <div className="text-sm font-semibold text-[#2D1B12] flex items-center gap-2">
                          <Truck className="w-4 h-4 text-[#D94A12]" />
                          <span>{opt.name}</span>
                        </div>
                        <p className="text-xs text-[#664938] mt-0.5">
                          Prazo estimado: até {opt.estimatedDays} dias úteis após postagem
                        </p>
                      </div>
                    </div>
                    <span className="text-base font-bold text-[#2D1B12] tabular-nums">
                      {opt.priceCents === 0 ? 'Grátis' : formatBRL(opt.priceCents)}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-sm font-medium text-[#664938] hover:text-[#2D1B12] cursor-pointer"
                >
                  Voltar ao endereço
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-6 py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
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
                <h2 className="font-display text-2xl font-semibold text-[#2D1B12]">4. Forma de Pagamento</h2>
                <p className="text-sm text-[#664938] mt-1">
                  Transação processada via gateway seguro Mercado Pago. Nenhum dado completo do cartão é salvo.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {id: 'pix' as const, label: 'PIX (5% OFF)', icon: QrCode, sub: 'Aprovação imediata'},
                  {id: 'credit_card' as const, label: 'Cartão de Crédito', icon: CreditCard, sub: 'Até 3x sem juros'},
                  {id: 'boleto' as const, label: 'Boleto Bancário', icon: Barcode, sub: 'Compensação em 1-2 dias'},
                ].map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentMethod(opt.id)}
                      className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                        paymentMethod === opt.id
                          ? 'border-[#D94A12] bg-[#FDF8F3]'
                          : 'border-[#EAD5BC] bg-white hover:border-[#C49A45]'
                      }`}
                    >
                      <Icon className="w-5 h-5 text-[#D94A12] mb-2" />
                      <div className="text-sm font-semibold text-[#2D1B12]">{opt.label}</div>
                      <div className="text-xs text-[#664938] mt-0.5">{opt.sub}</div>
                    </button>
                  );
                })}
              </div>

              {paymentMethod === 'pix' && (
                <div className="p-4 rounded-xl bg-[#FDF8F3] border border-[#EAD5BC] text-sm text-[#5D4030]">
                  Você ganha <strong>5% de desconto instantâneo</strong> nos produtos pagando via PIX. O código QR e o Copia e Cola serão gerados imediatamente na confirmação.
                </div>
              )}

              {paymentMethod === 'credit_card' && (
                <div className="space-y-3 p-4 rounded-xl bg-[#FDF8F3] border border-[#EAD5BC]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Nome impresso no cartão</label>
                      <input
                        type="text"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value)}
                        placeholder="Como aparece no cartão"
                        className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Número do cartão</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={19}
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="0000 0000 0000 0000"
                        className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Validade (MM/AA)</label>
                      <input
                        type="text"
                        maxLength={5}
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="12/29"
                        className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Código de segurança (CVV)</label>
                      <input
                        type="password"
                        maxLength={4}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        placeholder="123"
                        className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Parcelamento</label>
                      <select
                        value={cardInstallments}
                        onChange={(e) => setCardInstallments(Number(e.target.value))}
                        className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                      >
                        <option value={1}>1x de {formatBRL(finalTotalCents)} sem juros</option>
                        <option value={2}>2x de {formatBRL(Math.round(finalTotalCents / 2))} sem juros</option>
                        <option value={3}>3x de {formatBRL(Math.round(finalTotalCents / 3))} sem juros</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'boleto' && (
                <div className="p-4 rounded-xl bg-[#FDF8F3] border border-[#EAD5BC] text-sm text-[#5D4030]">
                  O boleto bancário com linha digitável será gerado após a revisão final do pedido, com vencimento em 2 dias úteis.
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-sm font-medium text-[#664938] hover:text-[#2D1B12] cursor-pointer"
                >
                  Voltar ao envio
                </button>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="px-6 py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
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
                <h2 className="font-display text-2xl font-semibold text-[#2D1B12]">5. Resumo da Compra</h2>
                <p className="text-sm text-[#664938] mt-1">Revise todos os detalhes antes de confirmar seu pedido.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="p-4 rounded-xl bg-[#FDF8F3] border border-[#EAD5BC]">
                  <div className="font-semibold text-[#2D1B12] mb-1">Entrega</div>
                  <p className="text-[#5D4030]">
                    {street}, {number} {complement && `- ${complement}`}
                  </p>
                  <p className="text-[#5D4030]">
                    {neighborhood} · {city}/{state}
                  </p>
                  <p className="text-[#8B6F5C] font-mono text-xs mt-1">CEP {cep}</p>
                </div>
                <div className="p-4 rounded-xl bg-[#FDF8F3] border border-[#EAD5BC]">
                  <div className="font-semibold text-[#2D1B12] mb-1">Envio &amp; Pagamento</div>
                  <p className="text-[#5D4030]">{selectedShipping?.name}</p>
                  <p className="text-[#5D4030] mt-1">
                    Pagamento:{' '}
                    <strong>
                      {paymentMethod === 'pix'
                        ? 'PIX (5% de desconto)'
                        : paymentMethod === 'credit_card'
                          ? `Cartão de Crédito (${cardInstallments}x)`
                          : 'Boleto Bancário'}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="divide-y divide-[#F5E6D3] border border-[#EAD5BC] rounded-xl px-4">
                {items.map((item) => {
                  const unit = effectivePriceCents(item.priceCents, item.promoPriceCents);
                  return (
                    <div key={item.productId} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-[#2D1B12]">{item.name}</span>
                        <span className="text-[#8B6F5C] ml-2">x{item.quantity}</span>
                      </div>
                      <span className="font-semibold text-[#2D1B12] tabular-nums">
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
                  className="text-sm font-medium text-[#664938] hover:text-[#2D1B12] cursor-pointer"
                >
                  Alterar pagamento
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handlePlaceOrder}
                  className="px-7 py-3.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] transition-colors flex items-center gap-2 cursor-pointer"
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
                  <h2 className="font-display text-2xl font-semibold text-[#2D1B12]">
                    Pedido {confirmedOrder.orderNumber} Confirmado!
                  </h2>
                  <p className="text-sm text-[#5D4030] mt-1">
                    Enviamos a confirmação com todos os detalhes para <strong>{confirmedOrder.emailSentTo}</strong>.
                  </p>
                </div>
              </div>

              {confirmedOrder.paymentMethod === 'pix' && confirmedOrder.paymentStatus !== 'approved' && (
                <div className="p-5 rounded-xl bg-[#FDF8F3] border border-[#EAD5BC] space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#2D1B12]">
                    <QrCode className="w-5 h-5 text-[#D94A12]" />
                    <span>Pague via PIX Copia e Cola</span>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-[#EAD5BC] font-mono text-xs break-all text-[#5D4030]">
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
                      className="px-4 py-2 rounded-lg border border-[#2D1B12] text-xs font-semibold text-[#2D1B12] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{pixCopied ? 'Código copiado!' : 'Copiar código PIX'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={pixConfirming}
                      onClick={handleConfirmPixDemo}
                      className="px-4 py-2 rounded-lg bg-[#D94A12] text-white text-xs font-semibold hover:bg-[#B83C0B] cursor-pointer"
                    >
                      {pixConfirming ? 'Confirmando...' : 'Já realizei o pagamento PIX'}
                    </button>
                  </div>
                </div>
              )}

              {confirmedOrder.paymentMethod === 'boleto' && (
                <div className="p-5 rounded-xl bg-[#FDF8F3] border border-[#EAD5BC] space-y-2">
                  <div className="text-sm font-semibold text-[#2D1B12]">Linha digitável do Boleto Bancário</div>
                  <div className="p-3 rounded-lg bg-white border border-[#EAD5BC] font-mono text-xs text-[#2D1B12]">
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
                  className="px-6 py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
                >
                  Acompanhar na Área do Cliente
                </button>
                <button
                  type="button"
                  onClick={onBackToStore}
                  className="px-6 py-3 rounded-lg border border-[#EAD5BC] text-[#2D1B12] text-sm font-semibold hover:bg-[#F5E6D3]/60 cursor-pointer"
                >
                  Continuar Navegando
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Summary Sidebar */}
        {!confirmedOrder && (
          <aside className="lg:col-span-4 bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 space-y-4 lg:sticky lg:top-24">
            <h3 className="font-display text-lg font-semibold text-[#2D1B12]">Resumo Financeiro</h3>
            <div className="space-y-2 text-sm border-b border-[#F5E6D3] pb-4">
              {items.map((item) => {
                const unit = effectivePriceCents(item.priceCents, item.promoPriceCents);
                return (
                  <div key={item.productId} className="flex justify-between gap-2 text-[#5D4030]">
                    <span className="truncate">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="tabular-nums shrink-0">{formatBRL(unit * item.quantity)}</span>
                  </div>
                );
              })}
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#664938]">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatBRL(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-[#664938]">
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
                  <span>Desconto PIX (5%)</span>
                  <span className="tabular-nums">-{formatBRL(pixDiscountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-[#2D1B12] pt-2 border-t border-[#EAD5BC]">
                <span>Total</span>
                <span className="tabular-nums">{formatBRL(finalTotalCents)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#8B6F5C] pt-1">
              <ShieldCheck className="w-4 h-4 text-[#C49A45] shrink-0" />
              <span>Compra protegida · Troca garantida em 7 dias</span>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
