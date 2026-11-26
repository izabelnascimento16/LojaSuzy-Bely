import {useEffect, useState} from 'react';
import {AlertCircle, CheckCircle2, Clock, Loader2, Lock, Mail, MessageSquare, RefreshCw, Search, ShieldCheck} from 'lucide-react';
import type {Address, User} from '../types';
import {ApiError, apiRequest, setCustomerToken} from '../services/api';
import {
  formatCepInput,
  formatCpfInput,
  formatInternationalPhoneInput,
  isValidCpfClient,
  isValidInternationalPhoneClient,
  onlyDigits,
  type SupportedPhoneCountry,
} from '../utils/format';

interface AuthFormProps {
  onSuccess: (user: User, addresses: Address[]) => void;
  initialMode?: 'login' | 'register' | 'forgot';
}

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function AuthForm({onSuccess, initialMode = 'login'}: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'verify'>(initialMode);
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

  // Account verification step fields
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifyChannel, setVerifyChannel] = useState<'email' | 'sms'>('email');
  const [maskedTarget, setMaskedTarget] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [previewVerifyCode, setPreviewVerifyCode] = useState('');
  const [expiresInSeconds, setExpiresInSeconds] = useState(300);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [showSmsFallback, setShowSmsFallback] = useState(false);
  const [smsPhoneCountry, setSmsPhoneCountry] = useState<SupportedPhoneCountry>('BR');
  const [smsPhone, setSmsPhone] = useState('');
  const [resending, setResending] = useState(false);

  // Register fields
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<SupportedPhoneCountry>('BR');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('RO');
  const [lgpdConsent, setLgpdConsent] = useState(false);

  useEffect(() => {
    if (mode !== 'verify') return;
    const timer = window.setInterval(() => {
      setExpiresInSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

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

  const enterVerificationFlow = (params: {
    emailAddress: string;
    channel?: 'email' | 'sms';
    masked?: string;
    expires?: number;
    retryAfter?: number;
    previewCode?: string;
    message?: string;
  }) => {
    setPendingEmail(params.emailAddress);
    setVerifyChannel(params.channel === 'sms' ? 'sms' : 'email');
    setMaskedTarget(params.masked || params.emailAddress);
    setVerificationCode('');
    setPreviewVerifyCode(params.previewCode || '');
    setExpiresInSeconds(params.expires ?? 300);
    setCooldownSeconds(params.retryAfter ?? 0);
    setShowSmsFallback(false);
    setSmsPhoneCountry(phoneCountry);
    setSmsPhone(phone);
    if (params.message) setSuccessMsg(params.message);
    setMode('verify');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await apiRequest<{token: string; user: User; addresses: Address[]}>('/api/auth/login', {
        method: 'POST',
        body: {email: loginEmail, password: loginPassword},
      });
      setCustomerToken(res.token);
      onSuccess(res.user, res.addresses);
    } catch (err) {
      if (err instanceof ApiError && err.data.requiresVerification) {
        setError('');
        enterVerificationFlow({
          emailAddress: String(err.data.email || loginEmail),
          channel: err.data.channel === 'sms' ? 'sms' : 'email',
          masked: String(err.data.maskedTarget || loginEmail),
          expires: 300,
          retryAfter: 0,
          message: err.message,
        });
        return;
      }
      setError(err instanceof Error ? err.message : 'Falha ao entrar.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!isValidCpfClient(cpf)) {
      setError('CPF inválido. Verifique os 11 dígitos informados.');
      return;
    }
    if (!isValidInternationalPhoneClient(phone, phoneCountry)) {
      setError(
        phoneCountry === 'PT'
          ? 'Telemóvel inválido. Informe 9 dígitos para Portugal (+351).'
          : 'Celular inválido. Informe DDD + 10 ou 11 dígitos para o Brasil (+55).'
      );
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
      // E-mail é o método principal e gratuito; nunca enviar SMS automaticamente no cadastro
      const res = await apiRequest<{
        requiresVerification?: boolean;
        channel?: 'email' | 'sms';
        email?: string;
        maskedTarget?: string;
        expiresInSeconds?: number;
        retryAfterSeconds?: number;
        previewCode?: string;
        message?: string;
        token?: string;
        user?: User;
        addresses?: Address[];
      }>('/api/auth/register', {
        method: 'POST',
        body: {
          fullName,
          cpf,
          email,
          phone,
          phoneCountry,
          verificationChannel: 'email',
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

      if (res.requiresVerification) {
        enterVerificationFlow({
          emailAddress: res.email || email,
          channel: res.channel || 'email',
          masked: res.maskedTarget || email,
          expires: res.expiresInSeconds ?? 300,
          retryAfter: res.retryAfterSeconds ?? 60,
          previewCode: res.previewCode,
          message:
            res.message ||
            'Enviamos gratuitamente um código de 6 dígitos para o seu e-mail. Confirme para ativar a sua conta.',
        });
        return;
      }

      if (res.token && res.user) {
        setCustomerToken(res.token);
        onSuccess(res.user, res.addresses || []);
      }
    } catch (err) {
      if (err instanceof ApiError && err.data.requiresVerification) {
        setError('');
        enterVerificationFlow({
          emailAddress: String(err.data.email || email),
          channel: 'email',
          masked: String(err.data.email || email),
          expires: 300,
          retryAfter: 0,
          message: err.message,
        });
        return;
      }
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAccountCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = onlyDigits(verificationCode).slice(0, 6);
    if (digits.length !== 6) {
      setError('Digite o código completo de 6 dígitos.');
      return;
    }
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await apiRequest<{
        token: string;
        user: User;
        addresses: Address[];
        message: string;
      }>('/api/auth/verify-account', {
        method: 'POST',
        body: {email: pendingEmail, code: digits},
      });
      setCustomerToken(res.token);
      onSuccess(res.user, res.addresses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async (channel: 'email' | 'sms') => {
    if (channel === 'sms' && !isValidInternationalPhoneClient(smsPhone, smsPhoneCountry)) {
      setError(
        smsPhoneCountry === 'PT'
          ? 'Informe um número válido de Portugal (+351 com 9 dígitos) para receber por SMS.'
          : 'Informe um número válido do Brasil (+55 com DDD) para receber por SMS.'
      );
      return;
    }

    setError('');
    setSuccessMsg('');
    setResending(true);
    try {
      const res = await apiRequest<{
        channel: 'email' | 'sms';
        maskedTarget: string;
        expiresInSeconds: number;
        retryAfterSeconds: number;
        previewCode?: string;
        message: string;
      }>('/api/auth/resend-verification', {
        method: 'POST',
        body: {
          email: pendingEmail,
          channel,
          ...(channel === 'sms' ? {phone: smsPhone, phoneCountry: smsPhoneCountry} : {}),
        },
      });
      setVerifyChannel(res.channel);
      setMaskedTarget(res.maskedTarget);
      setExpiresInSeconds(res.expiresInSeconds ?? 300);
      setCooldownSeconds(res.retryAfterSeconds ?? 60);
      setPreviewVerifyCode(res.previewCode || '');
      setVerificationCode('');
      setSuccessMsg(res.message);
    } catch (err) {
      if (err instanceof ApiError && typeof err.data.retryAfterSeconds === 'number') {
        setCooldownSeconds(err.data.retryAfterSeconds);
      }
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar o código.');
    } finally {
      setResending(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await apiRequest<{message: string; previewResetCode?: string; emailDispatched?: boolean}>('/api/auth/forgot-password', {
        method: 'POST',
        body: {email: forgotEmail},
      });
      setSuccessMsg(res.message);
      if (res.previewResetCode) {
        setPreviewResetCode(res.previewResetCode);
        setResetCode(res.previewResetCode);
      } else {
        setPreviewResetCode('');
        setResetCode('');
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
      {mode !== 'verify' && (
        <div className="flex items-center gap-1 p-1 bg-[#FFE8D4]/70 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-2.5 min-h-[42px] text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'login' ? 'bg-white text-[#3D2113] shadow-xs' : 'text-[#7A4D35] hover:text-[#3D2113]'
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
            className={`flex-1 py-2.5 min-h-[42px] text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'register' ? 'bg-white text-[#3D2113] shadow-xs' : 'text-[#7A4D35] hover:text-[#3D2113]'
            }`}
          >
            Criar cadastro
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-[#EA580C]/10 border border-[#EA580C]/30 text-sm text-[#C94506] flex items-start gap-2.5">
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

      {mode === 'verify' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#3D2113]">
                <ShieldCheck className="w-4 h-4 text-[#EA580C]" />
                <span>Confirmar sua conta</span>
              </div>
              <span
                className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2.5 py-1 rounded-md ${
                  expiresInSeconds > 0
                    ? 'bg-white border border-[#F2D2B6] text-[#3D2113]'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>{expiresInSeconds > 0 ? formatCountdown(expiresInSeconds) : 'Expirado'}</span>
              </span>
            </div>
            <p className="text-xs text-[#5E3824] leading-relaxed">
              {verifyChannel === 'email' ? (
                <>
                  Código de 6 dígitos enviado gratuitamente para{' '}
                  <strong className="text-[#3D2113]">{maskedTarget}</strong>. O código expira em 5 minutos.
                </>
              ) : (
                <>
                  Código de 6 dígitos enviado via SMS para{' '}
                  <strong className="text-[#3D2113]">{maskedTarget}</strong> (validade de 5 minutos).
                </>
              )}
            </p>
            {previewVerifyCode && (
              <div className="p-2.5 rounded-lg bg-white border border-[#F2D2B6] text-xs text-[#5E3824]">
                Código de confirmação (ambiente sem provedor externo configurado):{' '}
                <strong className="font-mono text-sm tracking-widest text-[#EA580C]">{previewVerifyCode}</strong>
              </div>
            )}
          </div>

          <form onSubmit={handleConfirmAccountCode} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#3D2113] mb-1.5">
                Código de verificação (6 dígitos)
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(onlyDigits(e.target.value).slice(0, 6))}
                placeholder="000000"
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-4 py-3 text-center text-xl font-mono font-bold tracking-[0.45em] text-[#3D2113] focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || onlyDigits(verificationCode).length !== 6}
              className="w-full py-3 min-h-[46px] rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] disabled:opacity-55 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>Confirmar e Ativar Conta</span>
            </button>
          </form>

          {/* Resend Email + Optional SMS Fallback */}
          <div className="pt-3 border-t border-[#F2D2B6] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={resending || cooldownSeconds > 0}
                onClick={() => handleResendCode('email')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#F2D2B6] bg-white text-xs font-semibold text-[#3D2113] hover:bg-[#FFE8D4] disabled:opacity-50 cursor-pointer"
              >
                {resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 text-[#EA580C]" />}
                <span>
                  {cooldownSeconds > 0
                    ? `Reenviar por e-mail (${cooldownSeconds}s)`
                    : 'Reenviar código por e-mail (gratuito)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowSmsFallback((v) => !v)}
                className="text-xs font-medium text-[#7A4D35] hover:text-[#EA580C] underline cursor-pointer"
              >
                {showSmsFallback ? 'Ocultar opção por SMS' : 'Não consigo usar o e-mail (usar SMS)'}
              </button>
            </div>

            {showSmsFallback && (
              <div className="p-4 rounded-xl bg-[#FFF9F4] border border-[#F2D2B6] space-y-3">
                <div className="flex items-start gap-2 text-xs text-[#5E3824]">
                  <MessageSquare className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold text-[#3D2113]">Alternativa opcional por SMS</div>
                    <p>
                      A verificação por e-mail é gratuita. Caso prefira receber por SMS, o envio utiliza serviço externo e{' '}
                      <strong>poderá ter custos operacionais</strong>. Suporte para Brasil (+55) e Portugal (+351).
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <select
                    value={smsPhoneCountry}
                    onChange={(e) => {
                      const nextCountry = e.target.value === 'PT' ? 'PT' : 'BR';
                      setSmsPhoneCountry(nextCountry);
                      setSmsPhone(formatInternationalPhoneInput(smsPhone, nextCountry));
                    }}
                    aria-label="País do número SMS"
                    className="bg-white border border-[#F2D2B6] rounded-lg px-2.5 py-2 text-xs font-mono shrink-0"
                  >
                    <option value="BR">🇧🇷 +55</option>
                    <option value="PT">🇵🇹 +351</option>
                  </select>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(formatInternationalPhoneInput(e.target.value, smsPhoneCountry))}
                    placeholder={smsPhoneCountry === 'PT' ? '912 345 678' : '(69) 99999-9999'}
                    maxLength={smsPhoneCountry === 'PT' ? 11 : 15}
                    className="flex-1 bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#EA580C]"
                  />
                </div>

                <button
                  type="button"
                  disabled={resending || cooldownSeconds > 0}
                  onClick={() => handleResendCode('sms')}
                  className="w-full py-2.5 rounded-lg bg-[#3D2113] text-white text-xs font-semibold hover:bg-[#59311D] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    {cooldownSeconds > 0
                      ? `Aguarde ${cooldownSeconds}s para enviar por SMS`
                      : 'Enviar código por SMS'}
                  </span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
                setSuccessMsg('');
              }}
              className="text-xs font-medium text-[#7A4D35] hover:text-[#3D2113] cursor-pointer"
            >
              Voltar para o login
            </button>
          </div>
        </div>
      )}

      {mode === 'login' && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#3D2113] mb-1.5">E-mail</label>
            <input
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="seuemail@exemplo.com.br"
              className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm text-[#3D2113] focus:outline-none focus:border-[#EA580C]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-[#3D2113]">Senha</label>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-xs font-medium text-[#EA580C] hover:underline cursor-pointer"
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
              className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm text-[#3D2113] focus:outline-none focus:border-[#EA580C]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 min-h-[46px] rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
              <p className="text-xs text-[#7A4D35]">
                Informe o e-mail cadastrado para gerar seu código seguro de redefinição de senha.
              </p>
              <div>
                <label className="block text-xs font-semibold text-[#3D2113] mb-1.5">E-mail cadastrado</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
              >
                {loading ? 'Enviando...' : 'Solicitar Recuperação'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} className="space-y-3">
              {previewResetCode && (
                <div className="p-2.5 rounded-lg bg-[#FFF9F4] border border-[#F2D2B6] text-xs text-[#5E3824]">
                  Código temporário de recuperação: <span className="font-mono font-semibold">{previewResetCode}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#3D2113] mb-1">Código de recuperação</label>
                <input
                  type="text"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#3D2113] mb-1">Nova senha</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#3D2113] mb-1">Confirmar senha</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] cursor-pointer"
              >
                Redefinir Senha
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setMode('login')}
            className="text-xs font-medium text-[#7A4D35] hover:text-[#3D2113] cursor-pointer"
          >
            Voltar para o login
          </button>
        </div>
      )}

      {mode === 'register' && (
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="p-3 rounded-lg bg-[#FFF9F4] border border-[#F2D2B6] text-xs text-[#5E3824] flex items-start gap-2">
            <Mail className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />
            <span>
              <strong>Ativação gratuita por e-mail:</strong> após concluir o cadastro, enviaremos automaticamente um código de 6 dígitos para o seu e-mail (válido por 5 minutos). Caso precise, poderá optar por SMS na etapa seguinte.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">Nome completo *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex: Maria Clara Oliveira"
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">CPF *</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={cpf}
                onChange={(e) => setCpf(formatCpfInput(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">Telemóvel / Celular (BR ou PT) *</label>
              <div className="flex gap-1.5">
                <select
                  value={phoneCountry}
                  onChange={(e) => {
                    const nextCountry = e.target.value === 'PT' ? 'PT' : 'BR';
                    setPhoneCountry(nextCountry);
                    setPhone(formatInternationalPhoneInput(phone, nextCountry));
                  }}
                  aria-label="País do telefone"
                  className="bg-white border border-[#F2D2B6] rounded-lg px-2 py-2 text-xs font-mono shrink-0 focus:outline-none focus:border-[#EA580C]"
                >
                  <option value="BR">🇧🇷 +55</option>
                  <option value="PT">🇵🇹 +351</option>
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  required
                  value={phone}
                  onChange={(e) => setPhone(formatInternationalPhoneInput(e.target.value, phoneCountry))}
                  placeholder={phoneCountry === 'PT' ? '912 345 678' : '(69) 99999-9999'}
                  maxLength={phoneCountry === 'PT' ? 11 : 15}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#EA580C]"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">E-mail (usado para ativar a conta) *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com.br"
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">Senha (mín. 6 dígitos) *</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3D2113] mb-1">Confirmar senha *</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#F2D2B6] space-y-3">
            <h4 className="text-xs font-semibold text-[#3D2113]">Endereço de entrega</h4>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-[#3D2113] mb-1">CEP *</label>
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
                    className="flex-1 bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#EA580C]"
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupCep(cep)}
                    aria-label="Consultar CEP"
                    className="px-3 py-2 rounded-lg border border-[#F2D2B6] bg-[#FFF9F4] text-[#3D2113] hover:bg-[#FFE8D4] cursor-pointer"
                  >
                    {cepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-[#3D2113] mb-1">Estado (UF) *</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                >
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-[#3D2113] mb-1">Rua / Logradouro *</label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#3D2113] mb-1">Número *</label>
                <input
                  type="text"
                  required
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-[#3D2113] mb-1">Complemento (opcional)</label>
                <input
                  type="text"
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  placeholder="Apto, bloco..."
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-[#3D2113] mb-1">Bairro *</label>
                <input
                  type="text"
                  required
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div className="sm:col-span-6">
                <label className="block text-xs font-semibold text-[#3D2113] mb-1">Cidade *</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-white border border-[#F2D2B6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#EA580C]"
                />
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-[#5E3824] cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={lgpdConsent}
              onChange={(e) => setLgpdConsent(e.target.checked)}
              className="mt-0.5 accent-[#EA580C]"
            />
            <span>
              Concordo com a coleta e tratamento dos meus dados pessoais (nome, CPF, e-mail, telemóvel/celular e endereço) exclusivamente para emissão de pedidos, entrega e atendimento, conforme a{' '}
              <strong>LGPD (Lei nº 13.709/2018)</strong>.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 min-h-[46px] rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Cadastrar e Receber Código por E-mail</span>
          </button>
        </form>
      )}
    </div>
  );
}
