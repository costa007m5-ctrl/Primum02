import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, Shield, Zap, Sparkles, Star, Users, Smartphone, Tv, Laptop, Crown, MessageCircle } from 'lucide-react';
import { AppSettings } from '../types';

interface PlansScreenProps {
  appSettings: AppSettings | null;
  onClose: () => void;
  onUpdatePlan: (plan: 'hub' | 'plus' | 'max') => Promise<void>;
}

export default function PlansScreen({ appSettings, onClose, onUpdatePlan }: PlansScreenProps) {
  const currentPlan = appSettings?.subscription_plan || 'hub';
  const [loadingPlan, setLoadingPlan] = useState<'hub' | 'plus' | 'max' | null>(null);

  const handleSelectPlan = async (plan: 'hub' | 'plus' | 'max') => {
    if (plan === currentPlan) return;
    setLoadingPlan(plan);
    try {
      await onUpdatePlan(plan);
    } finally {
      setLoadingPlan(null);
    }
  };

  const plans = [
    {
      id: 'hub',
      name: 'Netprime Hub',
      price: 'R$ 15,90',
      badge: 'Básico',
      description: 'Ideal para quem assiste sozinho no celular.',
      features: [
        '1 Tela simultânea',
        'Resolução HD (720p)',
        'Lançamentos: 7 Dias de atraso',
        'Assistir no Celular e PC'
      ],
      notIncluded: [
        'Salvar "Continuar Assistindo"',
        'Sessão em Grupo (Watch Party)',
        'Resolução Full HD',
        'Pedido de Filmes',
        'Suporte VIP',
        'Cores Neon/Dark e Avatar Premium'
      ],
      icon: Smartphone,
      color: 'from-gray-700 to-gray-900',
      accent: 'text-gray-400'
    },
    {
      id: 'plus',
      name: 'Netprime Plus',
      price: 'R$ 25,90',
      badge: 'Recomendado',
      description: 'Para o casal ou dividir com um amigo.',
      features: [
        '2 Telas simultâneas',
        'Resolução Full HD (1080p)',
        'Lançamentos: 3 Dias de atraso',
        'Salva de onde parou sempre',
        'Assistir no Celular e PC'
      ],
      notIncluded: [
        'Sessão em Grupo (Watch Party)',
        'Pedido de Filmes',
        'Suporte VIP',
        'Cores Neon/Dark e Avatar Premium'
      ],
      icon: Users,
      color: 'from-red-600 to-red-900',
      accent: 'text-red-400'
    },
    {
      id: 'max',
      name: 'Netprime Max',
      price: 'R$ 35,90',
      badge: 'Premium VIP',
      description: 'A experiência definitiva com tudo liberado.',
      features: [
        '4 Telas simultâneas',
        'Resolução Full HD (1080p)',
        'Lançamentos no Dia ZERO (Sem cadeados)',
        'Sessão em Grupo (Watch Party)',
        'Avatares Dinâmicos e Interface Neon/Dark',
        'Salva de onde parou sempre',
        'Pedido de Filmes Ilimitado',
        'Atendimento VIP (WhatsApp Direto)',
        'Assistir no Celular e PC'
      ],
      notIncluded: [],
      icon: Crown,
      color: 'from-purple-600 to-blue-900',
      accent: 'text-purple-400'
    }
  ];

  return (
    <div className="fixed inset-0 z-[5000] bg-black flex items-center justify-center p-4">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/40 via-black to-black"></div>
      
      <div className="relative w-full max-w-7xl max-h-screen overflow-y-auto no-scrollbar pb-10">
        {appSettings?.subscription_status === 'active' && (
          <button 
            onClick={onClose}
            className="fixed top-6 right-6 z-50 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-md transition-colors"
          >
            <X size={24} />
          </button>
        )}

        <div className="mt-12 text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter italic mb-4">
            Aprimore sua <span className="text-red-600 drop-shadow-[0_0_20px_rgba(220,38,38,0.5)]">Experiência</span>
          </h1>
          <p className="text-gray-400 text-sm md:text-lg max-w-2xl mx-auto italic font-medium">
            Escolha o plano perfeito para você. Atualize para o <strong className="text-white">Netprime Max</strong> e libere Watch Parties, lançamentos no dia zero e atendimento VIP.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 px-4">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isMax = plan.id === 'max';
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative flex flex-col bg-white/5 backdrop-blur-2xl border-2 rounded-3xl overflow-hidden transition-all duration-300 ${isCurrent ? 'border-red-600 ring-4 ring-red-600/30' : isMax ? 'border-purple-500/50 hover:border-purple-500' : 'border-white/10 hover:border-white/20'}`}
              >
                {/* Header */}
                <div className={`p-8 bg-gradient-to-br ${plan.color} relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 p-4 opacity-20">
                    <plan.icon size={80} />
                  </div>
                  <span className="inline-block px-3 py-1 bg-black/30 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest text-white mb-4 border border-white/10">
                    {plan.badge}
                  </span>
                  <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter italic mb-1">
                    {plan.name}
                  </h2>
                  <p className="text-white/70 text-sm font-medium italic h-10">{plan.description}</p>
                  
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl md:text-5xl font-black text-white">{plan.price}</span>
                    <span className="text-white/70 text-sm font-black uppercase tracking-widest">/mês</span>
                  </div>
                </div>

                {/* Features */}
                <div className="p-8 flex-1 flex flex-col">
                  <div className="flex-1 space-y-4 mb-8">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-full p-1 bg-white/10 ${plan.accent}`}>
                          <Check size={14} className="text-white" />
                        </div>
                        <span className="text-sm font-bold text-gray-200">{feature}</span>
                      </div>
                    ))}
                    {plan.notIncluded.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3 opacity-40 grayscale">
                        <div className="mt-0.5 rounded-full p-1 bg-white/5">
                          <X size={14} className="text-white" />
                        </div>
                        <span className="text-sm font-medium text-gray-400 line-through">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    disabled={isCurrent || loadingPlan === plan.id}
                    onClick={() => handleSelectPlan(plan.id as any)}
                    className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                      isCurrent 
                        ? 'bg-white/10 text-white/50 cursor-not-allowed border border-white/5' 
                        : isMax
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-[0_0_20px_rgba(147,51,234,0.5)] border border-white/10 hover:scale-105'
                        : 'bg-white text-black hover:bg-gray-200 hover:scale-105'
                    }`}
                  >
                    {loadingPlan === plan.id ? (
                      <span className="animate-pulse">Processando...</span>
                    ) : isCurrent ? (
                      'Plano Atual'
                    ) : (
                      'Escolher Plano'
                    )}
                  </button>
                  <p className="text-[10px] text-center mt-3 text-white/40 flex items-center justify-center gap-1">
                    Via Mercado Pago (Pix, Cartão, Boleto)
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
