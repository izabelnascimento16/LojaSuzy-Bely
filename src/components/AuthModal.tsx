import {X} from 'lucide-react';
import type {Address, User} from '../types';
import {AuthForm} from './AuthForm';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: User, addresses: Address[]) => void;
}

export function AuthModal({open, onClose, onSuccess}: AuthModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#3D2113]/50 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#FFFFFF] border border-[#F2D2B6] rounded-2xl shadow-2xl p-5 sm:p-8 my-4 sm:my-8 max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Entrar ou cadastrar na Suzy Bely"
      >
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#F2D2B6]">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#3D2113]">Minha Conta</h2>
            <p className="text-xs text-[#7A4D35] mt-0.5">Acesse seus pedidos ou cadastre-se gratuitamente</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-2.5 rounded-lg text-[#5E3824] hover:bg-[#FFE8D4] min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <AuthForm
          onSuccess={(user, addresses) => {
            onSuccess(user, addresses);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
