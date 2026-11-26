import {useEffect, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import type {Address, Order, PublicStoreSettings, User} from '../types';
import {apiRequest, setCustomerToken} from '../services/api';
import {
  buildWhatsAppUrl,
  detectPhoneCountry,
  formatBRL,
  formatCepInput,
  formatInternationalPhoneInput,
  onlyDigits,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type SupportedPhoneCountry,
} from '../utils/format';

interface CustomerAreaViewProps {
  user: User;
  addresses: Address[];
  storeSettings?: PublicStoreSettings | null;
  onUpdateUser: (user: User) => void;
  onUpdateAddresses: (addresses: Address[]) => void;
  onLogout: () => void;
}

export function CustomerAreaView({
  user,
  addresses,
  storeSettings,
  onUpdateUser,
  onUpdateAddresses,
  onLogout,
}: CustomerAreaViewProps) {
  const generalWhatsappUrl = buildWhatsAppUrl(
    storeSettings?.whatsappNumber,
    `Olá Suzy Bely! Aqui é ${user.fullName}. Gostaria de falar com o atendimento.`
  );
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'addresses'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // Profile edit
  const initialCountry = detectPhoneCountry(user.phone);
  const [fullName, setFullName] = useState(user.fullName);
  const [phoneCountry, setPhoneCountry] = useState<SupportedPhoneCountry>(initialCountry);
  const [phone, setPhone] = useState(formatInternationalPhoneInput(user.phone || '', initialCountry));
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // New Address
  const [showNewAddr, setShowNewAddr] = useState(false);
  const [label, setLabel] = useState('Casa');
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');

  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await apiRequest<{orders: Order[]}>('/api/account/orders');
      setOrders(res.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pedidos.');
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    try {
      const res = await apiRequest<{message: string; fullName: string; phone: string}>('/api/account/profile', {
        method: 'PUT',
        body: {fullName, phone, phoneCountry},
      });
      onUpdateUser({...user, fullName: res.fullName, phone: res.phone});
      setFeedback(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar perfil.');
    }
  };

  const handleLookupCep = async (val: string) => {
    const d = onlyDigits(val);
    if (d.length !== 8) return;
    try {
      const data = await apiRequest<{street: string; neighborhood: string; city: string; state: string}>(`/api/cep/${d}`);
      if (data.street) setStreet(data.street);
      if (data.neighborhood) setNeighborhood(data.neighborhood);
      if (data.city) setCity(data.city);
      if (data.state) setState(data.state);
    } catch {
      // Ignore offline lookup
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiRequest<{addresses: Address[]}>('/api/account/addresses', {
        method: 'POST',
        body: {label, cep, street, number, complement, neighborhood, city, state, isDefault: true},
      });
      onUpdateAddresses(res.addresses);
      setShowNewAddr(false);
      setCep('');
      setStreet('');
      setNumber('');
      setComplement('');
      setNeighborhood('');
      setCity('');
      setFeedback('Endereço adicionado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar endereço.');
    }
  };

  const handleDeleteAddress = async (id: number) => {
    setError('');
    try {
      const res = await apiRequest<{addresses: Address[]}>(`/api/account/addresses/${id}`, {
        method: 'DELETE',
      });
      onUpdateAddresses(res.addresses);
      setFeedback('Endereço removido.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover endereço.');
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    setError('');
    setFeedback('');
    try {
      const res = await apiRequest<{message: string}>(`/api/account/orders/${orderId}/cancel`, {
        method: 'POST',
        body: {reason: 'Solicitado pelo cliente na Área do Cliente'},
      });
      setFeedback(res.message);
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cancelar o pedido.');
    }
  };

  const handleCloseAccount = async () => {
    setError('');
    try {
      await apiRequest('/api/account', {method: 'DELETE'});
      setCustomerToken(null);
      onLogout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao encerrar conta.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#F2D2B6]">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#3D2113]">Olá, {user.fullName}</h1>
          <p className="text-sm text-[#7A4D35] mt-1">
            {user.email} · CPF {user.cpfMasked || '***.***.***-**'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {generalWhatsappUrl && (
            <a
              href={generalWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 w-fit"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Atendimento WhatsApp</span>
            </a>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#F2D2B6] bg-white text-sm font-medium text-[#3D2113] hover:bg-[#FFE8D4] w-fit cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da Conta</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-1.5 sm:gap-2 p-1.5 bg-[#FFE8D4]/60 rounded-xl max-w-full w-full sm:w-fit">
        {[
          {id: 'orders' as const, label: 'Meus Pedidos', icon: Package},
          {id: 'profile' as const, label: 'Dados Pessoais', icon: UserIcon},
          {id: 'addresses' as const, label: 'Endereços', icon: MapPin},
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 min-h-[42px] transition-colors cursor-pointer ${
                activeTab === tab.id ? 'bg-white text-[#3D2113] shadow-xs' : 'text-[#7A4D35] hover:text-[#3D2113]'
              }`}
            >
              <Icon className="w-4 h-4 text-[#EA580C]" />
              <span>{tab.label}</span>
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

      {/* ORDERS TAB */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {loadingOrders ? (
            <p className="text-sm text-[#7A4D35]">Carregando histórico de compras...</p>
          ) : orders.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-8 text-center">
              <Package className="w-10 h-10 text-[#D4A548] mx-auto mb-2" />
              <p className="font-display text-lg text-[#3D2113]">Nenhum pedido realizado ainda</p>
              <p className="text-sm text-[#7A4D35] mt-1">
                Quando você concluir uma compra, o acompanhamento completo aparecerá aqui.
              </p>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#FFE8D4]">
                  <div>
                    <div className="font-mono text-sm font-bold text-[#3D2113]">{order.order_number}</div>
                    <div className="text-xs text-[#9A6B50]">
                      Realizado em {new Date(order.created_at).toLocaleDateString('pt-BR')} ·{' '}
                      {PAYMENT_METHOD_LABELS[order.payment_method]}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#EA580C]">
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </div>
                    <div className="text-base font-bold text-[#3D2113] tabular-nums">
                      {formatBRL(order.total_cents)}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-[#5E3824]">
                      <span>
                        {item.quantity}x {item.product_name}
                      </span>
                      <span className="tabular-nums">{formatBRL(item.total_cents)}</span>
                    </div>
                  ))}
                </div>

                {order.status === 'aguardando_pagamento' && (order.payment?.checkout_url || order.payment?.pix_copy_paste) && (
                  <div className="p-3.5 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6] space-y-2 text-xs">
                    {order.payment?.checkout_url && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-[#3D2113]">Pagamento pendente:</span>
                        <a
                          href={order.payment.checkout_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 rounded-lg bg-[#EA580C] text-white font-semibold hover:bg-[#C94506]"
                        >
                          Concluir Pagamento
                        </a>
                      </div>
                    )}
                    {order.payment?.pix_copy_paste && (
                      <div>
                        <span className="font-semibold text-[#3D2113]">PIX Copia e Cola:</span>
                        <div className="mt-1 p-2 rounded bg-white border border-[#F2D2B6] font-mono text-[11px] break-all text-[#5E3824]">
                          {order.payment.pix_copy_paste}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#FFE8D4] text-xs text-[#7A4D35]">
                  <div>
                    <span>Entrega: {order.shipping_method}</span>
                    {order.tracking_code && (
                      <span className="ml-3 font-mono font-semibold text-[#3D2113]">
                        Rastreio: {order.tracking_code}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const orderWaUrl = buildWhatsAppUrl(
                        storeSettings?.whatsappNumber,
                        `Olá Suzy Bely! Gostaria de informações sobre meu pedido ${order.order_number}.`
                      );
                      return orderWaUrl ? (
                        <a
                          href={orderWaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-700/40 bg-emerald-50 text-emerald-900 font-semibold hover:bg-emerald-100 min-h-[42px]"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                          <span>WhatsApp sobre o pedido</span>
                        </a>
                      ) : null;
                    })()}
                    {['aguardando_pagamento', 'pago', 'em_separacao'].includes(order.status) && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order.id)}
                        className="px-3.5 py-2 rounded-lg border border-[#EA580C]/40 text-[#EA580C] font-semibold hover:bg-[#EA580C]/10 min-h-[42px] cursor-pointer"
                      >
                        Solicitar Cancelamento
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-7 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-semibold text-[#3D2113]">Alterar Dados Pessoais</h2>
            <div>
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">Nome completo</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">Telemóvel / Celular</label>
              <div className="flex gap-2">
                <select
                  value={phoneCountry}
                  onChange={(e) => {
                    const nextCountry = e.target.value === 'PT' ? 'PT' : 'BR';
                    setPhoneCountry(nextCountry);
                    setPhone(formatInternationalPhoneInput(phone, nextCountry));
                  }}
                  aria-label="Código do país"
                  className="bg-white border border-[#F2D2B6] rounded-lg px-2.5 py-2.5 text-sm font-mono shrink-0"
                >
                  <option value="BR">🇧🇷 +55</option>
                  <option value="PT">🇵🇹 +351</option>
                </select>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(formatInternationalPhoneInput(e.target.value, phoneCountry))}
                  placeholder={phoneCountry === 'PT' ? '912 345 678' : '(69) 99999-9999'}
                  maxLength={phoneCountry === 'PT' ? 11 : 15}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#9A6B50] mb-1">CPF (protegido pela LGPD)</label>
              <input
                type="text"
                disabled
                value={user.cpfMasked || '***.***.***-**'}
                className="w-full bg-[#FFF9F4] border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm font-mono text-[#9A6B50]"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
            >
              Salvar Alterações
            </button>
          </form>

          <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 space-y-4 h-fit">
            <h2 className="font-display text-xl font-semibold text-[#3D2113]">Privacidade e Encerramento</h2>
            <p className="text-sm text-[#5E3824] leading-relaxed">
              Conforme a LGPD, você pode encerrar sua conta a qualquer momento. Seus dados pessoais serão removidos ou anonimizados com segurança.
            </p>
            {!confirmDeleteOpen ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="px-4 py-2 rounded-lg border border-[#EA580C]/50 text-[#EA580C] text-xs font-semibold hover:bg-[#EA580C]/10 cursor-pointer"
              >
                Encerrar Minha Conta
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-[#FFF9F4] border border-[#EA580C]/40 space-y-3">
                <p className="text-xs font-semibold text-[#3D2113]">
                  Confirma o encerramento definitivo da sua conta? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCloseAccount}
                    className="px-4 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-semibold cursor-pointer"
                  >
                    Sim, encerrar conta
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(false)}
                    className="px-4 py-2 rounded-lg border border-[#F2D2B6] bg-white text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADDRESSES TAB */}
      {activeTab === 'addresses' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-[#3D2113]">Meus Endereços</h2>
            <button
              type="button"
              onClick={() => setShowNewAddr((p) => !p)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-[#C94506] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Endereço</span>
            </button>
          </div>

          {showNewAddr && (
            <form
              onSubmit={handleAddAddress}
              className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-6 gap-3"
            >
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Identificação</label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">CEP</label>
                <input
                  type="text"
                  required
                  maxLength={9}
                  value={cep}
                  onChange={(e) => {
                    const f = formatCepInput(e.target.value);
                    setCep(f);
                    if (onlyDigits(f).length === 8) handleLookupCep(f);
                  }}
                  className="w-full border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Estado (UF)</label>
                <input
                  type="text"
                  required
                  maxLength={2}
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase())}
                  className="w-full border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm uppercase"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold mb-1">Rua</label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Número</label>
                <input
                  type="text"
                  required
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold mb-1">Bairro</label>
                <input
                  type="text"
                  required
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold mb-1">Cidade</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-6 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewAddr(false)}
                  className="px-4 py-2 rounded-lg border border-[#F2D2B6] text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-semibold cursor-pointer"
                >
                  Salvar Endereço
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className="bg-[#FFFFFF] border border-[#F2D2B6] rounded-xl p-5 flex items-start justify-between gap-4"
              >
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-[#3D2113]">{addr.label}</div>
                  <p className="text-[#5E3824]">
                    {addr.street}, {addr.number} {addr.complement ? `- ${addr.complement}` : ''}
                  </p>
                  <p className="text-[#7A4D35] text-xs">
                    {addr.neighborhood} · {addr.city}/{addr.state} · CEP {addr.cep}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteAddress(addr.id)}
                  aria-label="Excluir endereço"
                  className="p-2 text-[#9A6B50] hover:text-[#EA580C] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
