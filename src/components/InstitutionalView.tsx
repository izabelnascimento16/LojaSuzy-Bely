import {CheckCircle2, Lock, RefreshCw, ShieldCheck, Truck} from 'lucide-react';
import type {InstitutionalTab} from '../types';
import {ResilientImage} from './BrandLogo';

interface InstitutionalViewProps {
  activeTab: InstitutionalTab;
  onChangeTab: (tab: InstitutionalTab) => void;
  onExploreCatalog: () => void;
}

export function InstitutionalView({activeTab, onChangeTab, onExploreCatalog}: InstitutionalViewProps) {
  const tabs: {id: InstitutionalTab; label: string}[] = [
    {id: 'sobre', label: 'Missão, Visão e Valores'},
    {id: 'privacidade', label: 'Privacidade (LGPD)'},
    {id: 'trocas', label: 'Trocas e Devoluções'},
    {id: 'entrega', label: 'Política de Entrega'},
    {id: 'termos', label: 'Termos de Utilização'},
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">
      <div className="space-y-4">
        <p className="text-xs font-semibold tracking-wider text-[#D94A12] uppercase">Institucional</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#2D1B12] text-balance">
          Suzy Bely — Bijuterias &amp; Acessórios
        </h1>
        <p className="text-base text-[#5D4030] max-w-2xl leading-relaxed">
          Transparência, atendimento humanizado e peças pensadas para realçar sua beleza e autoestima todos os dias.
        </p>
      </div>

      {/* Tab selector */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[#F5E6D3]/60 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-[#2D1B12] shadow-xs'
                : 'text-[#664938] hover:text-[#2D1B12]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'sobre' && (
        <div className="space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 sm:p-10">
            <div className="lg:col-span-6 space-y-5">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#2D1B12]">
                Nossa essência e compromisso
              </h2>
              <p className="text-sm sm:text-base text-[#5D4030] leading-relaxed">
                A Suzy Bely nasceu com o desejo de unir design delicado, acabamento cuidadoso e preços verdadeiramente acessíveis. Cada brinco, colar, anel e conjunto é selecionado pensando na mulher brasileira que valoriza elegância com leveza e confiança.
              </p>
              <button
                type="button"
                onClick={onExploreCatalog}
                className="px-6 py-3 rounded-lg bg-[#D94A12] text-white text-sm font-semibold hover:bg-[#B83C0B] transition-colors cursor-pointer"
              >
                Conhecer o Catálogo
              </button>
            </div>
            <div className="lg:col-span-6 aspect-[16/10] rounded-xl overflow-hidden border border-[#EAD5BC]">
              <ResilientImage
                src="/assets/aistudio/processed-B1CAB384-C251-4B9B-80F7-C63E72402DB9_6c46a474.jpeg"
                alt="Fachada da loja Suzy Bely Bijuterias e Acessórios"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-6 space-y-3">
              <h3 className="font-display text-xl font-semibold text-[#2D1B12]">Missão</h3>
              <p className="text-sm text-[#5D4030] leading-relaxed">
                Proporcionar beleza, autoestima e elegância através de bijuterias e acessórios acessíveis, oferecendo produtos de qualidade e uma experiência de compra agradável.
              </p>
            </div>

            <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-6 space-y-3">
              <h3 className="font-display text-xl font-semibold text-[#2D1B12]">Visão</h3>
              <p className="text-sm text-[#5D4030] leading-relaxed">
                Tornar-se uma marca reconhecida no mercado brasileiro pela beleza dos seus produtos, confiança, atendimento e acessibilidade.
              </p>
            </div>

            <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-xl p-6 space-y-3">
              <h3 className="font-display text-xl font-semibold text-[#2D1B12]">Valores</h3>
              <ul className="space-y-1.5 text-sm text-[#5D4030]">
                {[
                  'Qualidade',
                  'Honestidade',
                  'Respeito ao cliente',
                  'Transparência',
                  'Elegância',
                  'Compromisso',
                  'Atendimento humanizado',
                ].map((val) => (
                  <li key={val} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#D94A12] shrink-0" />
                    <span>{val}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'privacidade' && (
        <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 sm:p-10 space-y-5 text-sm text-[#5D4030] leading-relaxed">
          <div className="flex items-center gap-2.5 text-[#2D1B12]">
            <Lock className="w-5 h-5 text-[#D94A12]" />
            <h2 className="font-display text-2xl font-semibold">Política de Privacidade e Proteção de Dados (LGPD)</h2>
          </div>
          <p>
            Em conformidade com a <strong>Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong>, a Suzy Bely coleta apenas os dados estritamente necessários para a conclusão da compra, emissão de comprovante, entrega pelos Correios e atendimento ao cliente.
          </p>
          <p>
            <strong>Finalidade da coleta:</strong> Nome completo, CPF, e-mail, celular com DDD e endereço completo são utilizados exclusivamente para identificação do comprador, prevenção a fraudes, despacho da encomenda e envio de atualizações sobre o pedido. O CPF jamais é exibido publicamente.
          </p>
          <p>
            <strong>Segurança de pagamentos:</strong> Não armazenamos números completos de cartão de crédito ou códigos de segurança (CVV) em nosso banco de dados. Os pagamentos são processados por gateway seguro com tokenização.
          </p>
          <p>
            <strong>Direitos do titular:</strong> Você pode consultar, corrigir seus dados pessoais ou solicitar o encerramento definitivo da conta diretamente na sua <em>Área do Cliente</em> a qualquer momento.
          </p>
        </div>
      )}

      {activeTab === 'trocas' && (
        <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 sm:p-10 space-y-5 text-sm text-[#5D4030] leading-relaxed">
          <div className="flex items-center gap-2.5 text-[#2D1B12]">
            <RefreshCw className="w-5 h-5 text-[#D94A12]" />
            <h2 className="font-display text-2xl font-semibold">Política de Trocas e Devoluções</h2>
          </div>
          <p>
            Conforme o Art. 49 do Código de Defesa do Consumidor, você tem até <strong>7 (sete) dias corridos</strong> após o recebimento para solicitar troca ou devolução por arrependimento, desde que a peça esteja sem sinais de uso e em sua embalagem original.
          </p>
          <p>
            Em caso de defeito de fabricação ou avaria no transporte, realizamos a substituição sem custos adicionais ou o reembolso integral via PIX ou estorno no cartão.
          </p>
        </div>
      )}

      {activeTab === 'entrega' && (
        <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 sm:p-10 space-y-5 text-sm text-[#5D4030] leading-relaxed">
          <div className="flex items-center gap-2.5 text-[#2D1B12]">
            <Truck className="w-5 h-5 text-[#D94A12]" />
            <h2 className="font-display text-2xl font-semibold">Política de Entrega</h2>
          </div>
          <p>
            Enviamos para todo o Brasil via <strong>Correios (PAC e SEDEX)</strong>. O prazo e o valor do frete são calculados automaticamente pelo CEP no carrinho e no checkout.
          </p>
          <p>
            Compras a partir de <strong>R$ 150,00</strong> contam com <strong>Frete Grátis na modalidade PAC</strong> para todas as regiões. Após a confirmação do pagamento, o pedido é separado em até 1 dia útil e você recebe o código de rastreio na Área do Cliente.
          </p>
        </div>
      )}

      {activeTab === 'termos' && (
        <div className="bg-[#FFFDF9] border border-[#EAD5BC] rounded-2xl p-6 sm:p-10 space-y-5 text-sm text-[#5D4030] leading-relaxed">
          <div className="flex items-center gap-2.5 text-[#2D1B12]">
            <ShieldCheck className="w-5 h-5 text-[#D94A12]" />
            <h2 className="font-display text-2xl font-semibold">Termos de Utilização</h2>
          </div>
          <p>
            A navegação no catálogo, consulta de preços, pesquisa e adição de produtos ao carrinho são livres para qualquer visitante. O cadastro é solicitado apenas no momento da finalização do pedido.
          </p>
          <p>
            Os preços exibidos em reais (R$) e a disponibilidade em estoque são atualizados em tempo real. As promoções são válidas enquanto durarem os estoques.
          </p>
        </div>
      )}
    </div>
  );
}
