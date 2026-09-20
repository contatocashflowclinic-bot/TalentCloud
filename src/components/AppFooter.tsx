import React from 'react';
import { BrandLogo } from './BrandLogo.js';

/** Rodapé do sistema (ambiente da organização e da Conta Mãe): logo oficial + direitos. */
export const AppFooter: React.FC = () => (
  <footer className="bg-white border-t border-slate-200">
    <div className="w-full max-w-[1820px] mx-auto px-3 sm:px-5 lg:px-7 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <BrandLogo width={160} />
      <p className="text-[11px] text-slate-400 text-center sm:text-right">
        © {new Date().getFullYear()} Vértice 360 - Ciclo de Talentos
      </p>
    </div>
  </footer>
);
