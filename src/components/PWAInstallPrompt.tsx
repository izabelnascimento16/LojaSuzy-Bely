import {useState} from 'react';
import {Download, PlusSquare, Share, Smartphone, WifiOff, X} from 'lucide-react';
import {useOnlineStatus, usePWAInstall} from '../hooks/usePWAInstall';

export function PWAInstallPrompt() {
  const {isInstallable, isInstalled, isIOS, shouldShowBanner, install, dismiss} = usePWAInstall();
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  if (isInstalled) return null;

  return (
    <>
      {shouldShowBanner && (
        <aside
          role="region"
          aria-label="Instalar aplicativo Suzy Bely"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-40 bg-[#FFFFFF] border-2 border-[#FDBA74] rounded-2xl shadow-xl shadow-[#3D2113]/15 p-4 flex items-center gap-3.5 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <img
            src="/pwa-192x192.png"
            alt="Ícone Suzy Bely"
            width={48}
            height={48}
            className="w-12 h-12 rounded-xl shrink-0 border border-[#F2D2B6]"
          />

          <div className="flex-1 min-w-0">
            <p className="font-display text-sm font-semibold text-[#3D2113] leading-tight">
              Instalar loja Suzy Bely
            </p>
            <p className="text-xs text-[#7A4D35] mt-0.5 leading-snug">
              {isIOS
                ? 'Adicione à tela inicial do seu iPhone.'
                : 'Acesse direto da tela inicial como um app.'}
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              {isInstallable ? (
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-[#C94506] transition-colors min-h-[38px] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Instalar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIosGuideOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-[#C94506] transition-colors min-h-[38px] cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Como instalar</span>
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                className="px-2.5 py-2 rounded-lg text-xs font-medium text-[#7A4D35] hover:text-[#3D2113] min-h-[38px] cursor-pointer"
              >
                Agora não
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Fechar convite de instalação"
            className="self-start p-1.5 rounded-lg text-[#9A6B50] hover:bg-[#FFE8D4] hover:text-[#3D2113] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {iosGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-[#3D2113]/55 backdrop-blur-xs"
          onClick={() => setIosGuideOpen(false)}
          role="dialog"
          aria-label="Como instalar a Suzy Bely no iPhone"
        >
          <div
            className="w-full max-w-sm bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 space-y-4 shadow-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/pwa-192x192.png"
                  alt="Suzy Bely"
                  width={44}
                  height={44}
                  className="w-11 h-11 rounded-xl border border-[#F2D2B6]"
                />
                <div>
                  <h3 className="font-display text-lg font-semibold text-[#3D2113]">
                    Instalar no iPhone
                  </h3>
                  <p className="text-xs text-[#7A4D35]">Pelo navegador Safari</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIosGuideOpen(false)}
                aria-label="Fechar instruções"
                className="p-2 rounded-lg text-[#7A4D35] hover:bg-[#FFE8D4] min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-3 text-sm text-[#5E3824] pt-1">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-[#FFF2E6] border border-[#FDBA74] text-[#EA580C] text-xs font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Toque no botão <strong className="inline-flex items-center gap-1 text-[#3D2113]">Compartilhar <Share className="w-3.5 h-3.5 text-[#EA580C]" /></strong> na barra do Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-[#FFF2E6] border border-[#FDBA74] text-[#EA580C] text-xs font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Role para baixo e escolha <strong className="inline-flex items-center gap-1 text-[#3D2113]">Adicionar à Tela de Início <PlusSquare className="w-3.5 h-3.5 text-[#EA580C]" /></strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-[#FFF2E6] border border-[#FDBA74] text-[#EA580C] text-xs font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Confirme tocando em <strong className="text-[#3D2113]">Adicionar</strong> no canto superior direito.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => {
                setIosGuideOpen(false);
                dismiss();
              }}
              className="w-full py-3 rounded-xl bg-[#EA580C] text-white text-sm font-semibold hover:bg-[#C94506] min-h-[44px] cursor-pointer"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function PWAInstallLink() {
  const {isInstallable, isInstalled, isIOS, canPrompt, install} = usePWAInstall();
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  if (isInstalled || !canPrompt) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            install();
          } else if (isIOS) {
            setIosGuideOpen(true);
          }
        }}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-white/10 hover:bg-[#EA580C] transition-colors cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>Instalar App</span>
      </button>

      {iosGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-[#3D2113]/55 backdrop-blur-xs text-left"
          onClick={() => setIosGuideOpen(false)}
          role="dialog"
          aria-label="Como instalar a Suzy Bely no iPhone"
        >
          <div
            className="w-full max-w-sm bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl p-6 space-y-4 shadow-2xl text-[#3D2113]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold">Instalar no iPhone (Safari)</h3>
            <p className="text-sm text-[#5E3824] leading-relaxed">
              1. Toque em <strong>Compartilhar</strong> na barra do Safari.<br />
              2. Selecione <strong>Adicionar à Tela de Início</strong>.<br />
              3. Toque em <strong>Adicionar</strong>.
            </p>
            <button
              type="button"
              onClick={() => setIosGuideOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#EA580C] text-white text-sm font-semibold cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-[#3D2113] border border-[#EA580C] px-3.5 py-2 text-xs font-medium text-white shadow-lg"
    >
      <WifiOff className="w-4 h-4 text-[#FB923C] shrink-0" />
      <span>Sem conexão — exibindo versão em cache</span>
    </div>
  );
}
