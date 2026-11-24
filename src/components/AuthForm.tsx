import {useState} from 'react';
import {AlertCircle, CheckCircle2, Loader2, Lock, Search} from 'lucide-react';
import type {Address, User} from '../types';
import {apiRequest, setCustomerToken} from '../services/api';
import {formatCepInput, formatCpfInput, formatPhoneInput, isValidCpfClient, onlyDigits} from '../utils/format';

interface AuthFormProps {
  onSuccess: (user: User, addresses: Address[]) => void;
  initialMode?: 'login' | 'register' | 'forgot';
}

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export function AuthForm({onSuccess, initialMode = 'login'}: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot/Reset fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [previewResetCode, setPreviewResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');

  // Register fields (Brazilian standard)
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');
  const [lgpdConsent, setLgpdConsent] = useState(false);

  const handleLookupCep = async (cepValue: string) => {
    const digits = onlyDigits(cepValue);
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const data = await apiRequest<{
        cep: string;
        street: string;
        complement: string;
        neighborhood: string;
        city: string;
        state: string;
      }>(`/api/cep/${digits}`);
      if (data.street) setStreet(data.street);
      if (data.neighborhood) setNeighborhood(data.neighborhood);
      if (data.city) setCity(data.city);
      if (data.state) setState(data.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível consultar o CEP.');
    } finally {
      setCepLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{token: string; user: User; addresses: Address[]}>('/api/auth/login', {
        method: 'POST',
        body: {email: loginEmail, password: loginPassword},
      });
      setCustomerToken(res.token);
      onSuccess(res.user, res.addresses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidCpfClient(cpf)) {
      setError('CPF inválido. Verifique os 11 dígitos informados.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas digitadas não coincidem.');
      return;
    }
    if (!lgpdConsent) {
      setError('Confirme o aceite da Política de Privacidade (LGPD).');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{token: string; user: User; addresses: Address[]}>('/api/auth/register', {
        method: 'POST',
        body: {
          fullName,
          cpf,
          email,
          phone,
          password,
          confirmPassword,
          cep,
          street,
          number,
          complement,
          neighborhood,
          city,
          state,
          lgpdConsent,
        },
      });
      setCustomerToken(res.token);
      onSuccess(res.user, res.addresses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await apiRequest<{message: string; previewResetCode?: string}>('/api/auth/forgot-password', {
        method: 'POST',
        body: {email: forgotEmail},
      });
      setSuccessMsg(res.message);
      if (res.previewResetCode) {
        setPreviewResetCode(res.previewResetCode);
        setResetCode(res.previewResetCode);
      }
      setResetStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar recuperação.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await apiRequest<{message: string}>('/api/auth/reset-password', {
        method: 'POST',
        body: {code: resetCode, newPassword, confirmPassword: confirmNewPassword},
      });
      setSuccessMsg(res.message);
      setMode('login');
      setResetStep('request');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Segmented mode selector */}
      <div className="flex items-center gap-1 p-1 bg-[#F5E6D3]/70 rounded-lg">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError('');
            setSuccessMsg('');
          }}
          className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
            mode === 'login' ? 'bg-white text-[#2D1B12] shadow-xs' : 'text-[#664938] hover:text-[#2D1B12]'
          }`}
        >
          Já tenho conta
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError('');
            setSuccessMsg('');
          }}
          className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
            mode === 'register' ? 'bg-white text-[#2D1B12] shadow-xs' : 'text-[#664938] hover:text-[#2D1B12]'
          }`}
        >
          Criar cadastro
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-[#D94A12]/10 border border-[#D94A12]/30 text-sm text-[#B83C0B] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
          <span>{successMsg}</span>
        </div>
      )}

      {mode === 'login' && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#2D1B12] mb-1.5">E-mail</label>
            <input
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="seuemail@exemplo.com.br"
              className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm text-[#2D1B12] focus:outline-none focus:border-[#D94A12]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-[#2D1B12]">Senha</label>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-xs font-medium text-[#D94A12] hover:underline cursor-pointer"
              >
                Esqueci minha senha
              </button>
            </div>
            <input
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Sua senha"
              className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm text-[#2D1B12] focus:outline-none focus:border-[#D94A12]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            <span>Entrar na Conta</span>
          </button>
        </form>
      )}

      {mode === 'forgot' && (
        <div className="space-y-4">
          {resetStep === 'request' ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <p className="text-xs text-[#664938]">
                Informe o e-mail cadastrado para gerar seu código seguro de redefinição de senha.
              </p>
              <div>
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1.5">E-mail cadastrado</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#D94A12]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
              >
                {loading ? 'Enviando...' : 'Solicitar Recuperação'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} className="space-y-3">
              {previewResetCode && (
                <div className="p-2.5 rounded-lg bg-[#FDF8F3] border border-[#EAD5BC] text-xs text-[#5D4030]">
                  Código temporário de recuperação: <span className="font-mono font-semibold">{previewResetCode}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Código de recuperação</label>
                <input
                  type="text"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#D94A12]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Nova senha</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Confirmar senha</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] cursor-pointer"
              >
                Redefinir Senha
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setMode('login')}
            className="text-xs font-medium text-[#664938] hover:text-[#2D1B12] cursor-pointer"
          >
            Voltar para o login
          </button>
        </div>
      )}

      {mode === 'register' && (
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Nome completo *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex: Maria Clara Oliveira"
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">CPF *</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={cpf}
                onChange={(e) => setCpf(formatCpfInput(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#D94A12]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Celular com DDD *</label>
              <input
                type="tel"
                inputMode="numeric"
                required
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                placeholder="(11) 99999-9999"
                maxLength={15}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#D94A12]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">E-mail *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com.br"
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Senha (mín. 6 dígitos) *</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Confirmar senha *</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#EAD5BC] space-y-3">
            <h4 className="text-xs font-semibold text-[#2D1B12]">Endereço de entrega (Brasil)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1">CEP *</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={cep}
                    onChange={(e) => {
                      const formatted = formatCepInput(e.target.value);
                      setCep(formatted);
                      if (onlyDigits(formatted).length === 8) {
                        handleLookupCep(formatted);
                      }
                    }}
                    placeholder="00000-000"
                    maxLength={9}
                    className="flex-1 bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#D94A12]"
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupCep(cep)}
                    aria-label="Consultar CEP"
                    className="px-3 py-2 rounded-lg border border-[#EAD5BC] bg-[#FDF8F3] text-[#2D1B12] hover:bg-[#F5E6D3] cursor-pointer"
                  >
                    {cepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Estado (UF) *</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                >
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Rua / Logradouro *</label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Número *</label>
                <input
                  type="text"
                  required
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Complemento (opcional)</label>
                <input
                  type="text"
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  placeholder="Apto, bloco..."
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Bairro *</label>
                <input
                  type="text"
                  required
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                />
              </div>

              <div className="sm:col-span-6">
                <label className="block text-xs font-semibold text-[#2D1B12] mb-1">Cidade *</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-white border border-[#EAD5BC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D94A12]"
                />
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-[#5D4030] cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={lgpdConsent}
              onChange={(e) => setLgpdConsent(e.target.checked)}
              className="mt-0.5 accent-[#D94A12]"
            />
            <span>
              Concordo com a coleta e tratamento dos meus dados pessoais (nome, CPF, e-mail, celular e endereço) exclusivamente para emissão de pedidos, entrega e atendimento, conforme a{' '}
              <strong>LGPD (Lei nº 13.709/2018)</strong>.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Finalizar Cadastro</span>
          </button>
        </form>
      )}
    </div>
  );
}
