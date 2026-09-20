import React from 'react';

/** Logo oficial horizontal (símbolo + nome + "Ciclo de Talentos"), recortada: 1175 × 369 px. */
const RATIO = 1175 / 369;

interface Props {
  /** Largura em px CSS. Há imagens prontas (1x, 2x e 3x) para 160 (rodapé) e 300 (login). */
  width: 160 | 300;
  className?: string;
}

/**
 * Logo oficial. O original está em brand-src/Logo-Oficial.png; as versões leves vêm de public/brand/logo-horizontal-*.png
 * (regras e como trocar em docs/guia-de-logo.md). O texto da logo é escuro: use sobre fundo claro.
 */
export const BrandLogo: React.FC<Props> = ({ width, className = '' }) => (
  <img
    src={`/brand/logo-horizontal-${width}.png`}
    srcSet={`/brand/logo-horizontal-${width * 2}.png 2x, /brand/logo-horizontal-${width * 3}.png 3x`}
    alt="Vértice 360 - Ciclo de Talentos"
    width={width}
    height={Math.round(width / RATIO)}
    draggable={false}
    className={`select-none ${className}`}
  />
);
