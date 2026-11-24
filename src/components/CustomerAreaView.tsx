import {useEffect, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  LogOut,
  MapPin,
  Package,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import type {Address, Order, User} from '../types';
import {apiRequest, setCustomerToken} from '../services/api';
import {
  formatBRL,
  formatCepInput,
  formatPhoneInput,
  onlyDigits,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../utils/format';

interface CustomerAreaViewProps {
  user: User;
  addresses: Address[];
  onUpdateUser: (user: User) => void;
  onUpdateAddresses: (addresses: Address[]) => void;
  onLogout: () => void;
}

export function CustomerAreaView({
  user,
  addresses,
  onUpdateUser,
  onUpdateAddresses,
  onLogout,
}: CustomerAreaViewProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'addresses'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // Profile edit
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(formatPhoneInput(user.phone || ''));
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
        body: {fullName, phone},
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EAD5BC]">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#2D1B12]">Olá, {user.fullName}</h1>
          <p className="text-sm text-[#664938] mt-1">
            {user.email} · CPF {user.cpfMasked || '***.***.***-**'}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#EAD5BC] bg-white text-sm font-medium text-[#2D1B12] hover:bg-[#F5E6D3] w-fit cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair da Conta</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[#F5E6D3]/60 rounded-xl w-fit">
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
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === tab.id ? 'bg-white text-[#2D1B12] shadow-xs' : 'text-[#664938] hover:text-[#2D1B12]'
              }`}
            >
              <Icon className="w-4 h-4 text-[#D94A12]" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#D94A12]/10 border border-[#D94A12]/30 text-sm text-[#B83C0B] flex items-center gap-2">
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
            <p className="text-sm text-[#664938]">Carregando histórico de compras...</p>
          ) : orders.length === 0 ? (
            <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-8 text-center">
              <Package className="w-10 h-10 text-[#C49A45] mx-auto mb-2" />
              <p className="font-display text-lg text-[#2D1B12]">Nenhum pedido realizado ainda</p>
              <p className="text-sm text-[#664938] mt-1">
                Quando você concluir uma compra, o acompanhamento completo aparecerá aqui.
              </p>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#F5E6D3]">
                  <div>
                    <div className="font-mono text-sm font-bold text-[#2D1B12]">{order.order_number}</div>
                    <div className="text-xs text-[#8B6F5C]">
                      Realizado em {new Date(order.created_at).toLocaleDateString('pt-BR')} ·{' '}
                      {PAYMENT_METHOD_LABELS[order.payment_method]}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#D94A12]">
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </div>
                    <div className="text-base font-bold text-[#2D1B12] tabular-nums">
                      {formatBRL(order.total_cents)}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-[#5D4030]">
                      <span>
                        {item.quantity}x {item.product_name}
                      </span>
                      <span className="tabular-nums">{formatBRL(item.total_cents)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F5E6D3] text-xs text-[#664938]">
                  <div>
                    <span>Entrega: {order.shipping_method}</span>
                    {order.tracking_code && (
                      <span className="ml-3 font-mono font-semibold text-[#2D1B12]">
                        Rastreio: {order.tracking_code}
                      </span>
                    )}
                  </div>
                  {['aguardando_pagamento', 'pago', 'em_separacao'].includes(order.status) && (
                    <button
                      type="button"
                      onClick={() => handleCancelOrder(order.id)}
                      className="px-3 py-1.5 rounded-lg border border-[#D94A12]/40 text-[#D94A12] font-semibold hover:bg-[#D94A12]/10 cursor-pointer"
                    >
                      Solicitar Cancelamento
                    </button>
                  )}
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
            className="lg:col-span-7 bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-semibold text-[#2D1B12]">Alterar Dados Pessoais</h2>
            <div>
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Nome completo</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Celular com DDD</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#8B6F5C] mb-1">CPF (protegido pela LGPD)</label>
              <input
                type="text"
                disabled
                value={user.cpfMasked || '***.***.***-**'}
                className="w-full bg-[#FDF8F3] border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm font-mono text-[#8B6F5C]"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
            >
              Salvar Alterações
            </button>
          </form>

          <div className="lg:col-span-5 bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 space-y-4 h-fit">
            <h2 className="font-display text-xl font-semibold text-[#2D1B12]">Privacidade e Encerramento</h2>
            <p className="text-sm text-[#5D4030] leading-relaxed">
              Conforme a LGPD, você pode encerrar sua conta a qualquer momento. Seus dados pessoais serão removidos ou anonimizados com segurança.
            </p>
            {!confirmDeleteOpen ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="px-4 py-2 rounded-lg border border-[#D94A12]/50 text-[#D94A12] text-xs font-semibold hover:bg-[#D94A12]/10 cursor-pointer"
              >
                Encerrar Minha Conta
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-[#FDF8F3] border border-[#D94A12]/40 space-y-3">
                <p className="text-xs font-semibold text-[#2D1B12]">
                  Confirma o encerramento definitivo da sua conta? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCloseAccount}
                    className="px-4 py-2 rounded-lg bg-[#D94A12] text-white text-xs font-semibold cursor-pointer"
                  >
                    Sim, encerrar conta
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(false)}
                    className="px-4 py-2 rounded-lg border border-[#EAD5BC] bg-white text-xs font-semibold cursor-pointer"
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
            <h2 className="font-display text-xl font-semibold text-[#2D1B12]">Meus Endereços</h2>
            <button
              type="button"
              onClick={() => setShowNewAddr((p) => !p)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#D94A12] text-white text-xs font-semibold hover:bg-[#B83C0B] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Endereço</span>
            </button>
          </div>

          {showNewAddr && (
            <form
              onSubmit={handleAddAddress}
              className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-6 gap-3"
            >
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Identificação</label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
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
                  className="w-full border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono"
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
                  className="w-full border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm uppercase"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold mb-1">Rua</label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Número</label>
                <input
                  type="text"
                  required
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold mb-1">Bairro</label>
                <input
                  type="text"
                  required
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold mb-1">Cidade</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-6 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewAddr(false)}
                  className="px-4 py-2 rounded-lg border border-[#EAD5BC] text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#D94A12] text-white text-xs font-semibold cursor-pointer"
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
                className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-5 flex items-start justify-between gap-4"
              >
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-[#2D1B12]">{addr.label}</div>
                  <p className="text-[#5D4030]">
                    {addr.street}, {addr.number} {addr.complement ? `- ${addr.complement}` : ''}
                  </p>
                  <p className="text-[#664938] text-xs">
                    {addr.neighborhood} · {addr.city}/{addr.state} · CEP {addr.cep}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteAddress(addr.id)}
                  aria-label="Excluir endereço"
                  className="p-2 text-[#8B6F5C] hover:text-[#D94A12] cursor-pointer"
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
