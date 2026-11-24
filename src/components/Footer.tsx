import {Instagram, Mail, MapPin, MessageCircle, ShieldCheck} from 'lucide-react';
import type {AppView, InstitutionalTab} from '../types';
import {BrandMark} from './BrandLogo';

interface FooterProps {
  onNavigate: (view: AppView, category?: string) => void;
  onOpenPolicy: (tab: InstitutionalTab) => void;
}

export function Footer({onNavigate, onOpenPolicy}: FooterProps) {
  return (
    <footer className="bg-[#2D1B12] text-[#F5E6D3] mt-16 border-t border-[#462B1D]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Col 1: Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-[#F5E6D3]">
              <BrandMark className="w-6 h-6 text-[#D94A12]" />
              <span className="font-display text-2xl font-semibold">Suzy Bely</span>
            </div>
            <p className="text-sm text-[#EAD5BC]/85 leading-relaxed">
              Bijuterias e acessórios femininos com beleza, qualidade e preço acessível para todo o Brasil.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-white/10 hover:bg-[#D94A12] transition-colors"
              >
                <Instagram className="w-4 h-4" />
                <span>@suzybely.bijus</span>
              </a>
              <a
                href="https://wa.me/5511999990000"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-white/10 hover:bg-[#D94A12] transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>

          {/* Col 2: Loja & Categorias */}
          <div className="space-y-3">
            <h3 className="font-display text-base font-semibold text-white">Loja</h3>
            <ul className="space-y-2 text-sm text-[#EAD5BC]/80">
              <li>
                <button type="button" onClick={() => onNavigate('catalog', 'all')} className="hover:text-white cursor-pointer">
                  Todos os Produtos
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('catalog', 'promocoes')} className="hover:text-white cursor-pointer">
                  Promoções
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('catalog', 'lancamentos')} className="hover:text-white cursor-pointer">
                  Lançamentos
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenPolicy('sobre')} className="hover:text-white cursor-pointer">
                  Sobre Nós, Missão e Valores
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Políticas & LGPD */}
          <div className="space-y-3">
            <h3 className="font-display text-base font-semibold text-white">Políticas e Privacidade</h3>
            <ul className="space-y-2 text-sm text-[#EAD5BC]/80">
              <li>
                <button type="button" onClick={() => onOpenPolicy('privacidade')} className="hover:text-white cursor-pointer">
                  Política de Privacidade (LGPD)
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenPolicy('trocas')} className="hover:text-white cursor-pointer">
                  Política de Trocas e Devoluções
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenPolicy('entrega')} className="hover:text-white cursor-pointer">
                  Política de Entrega
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenPolicy('termos')} className="hover:text-white cursor-pointer">
                  Termos de Utilização
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Contactos & Info Comercial */}
          <div className="space-y-3">
            <h3 className="font-display text-base font-semibold text-white">Atendimento &amp; Empresa</h3>
            <ul className="space-y-2.5 text-sm text-[#EAD5BC]/80">
              <li className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-[#D94A12] shrink-0 mt-0.5" />
                <span>atendimento@suzybely.com.br</span>
              </li>
              <li className="flex items-start gap-2">
                <MessageCircle className="w-4 h-4 text-[#D94A12] shrink-0 mt-0.5" />
                <span>(11) 99999-0000 · Seg a Sáb, 9h às 18h</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#D94A12] shrink-0 mt-0.5" />
                <span>Suzy Bely Comércio de Bijuterias Ltda · São Paulo, SP</span>
              </li>
              <li className="flex items-center gap-2 text-xs text-[#EAD5BC]/70 pt-1">
                <ShieldCheck className="w-4 h-4 text-[#C49A45]" />
                <span>Ambiente protegido com criptografia e LGPD</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#EAD5BC]/70">
          <span>© {new Date().getFullYear()} Suzy Bely Bijuterias &amp; Acessórios. Todos os direitos reservados.</span>
          <span>Pagamentos via PIX, Cartão de Crédito e Boleto · Envio para todo o Brasil</span>
        </div>
      </div>
    </footer>
  );
}
