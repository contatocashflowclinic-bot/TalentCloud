import React from 'react';

interface Props {
  size: number;
  className?: string;
  /** Arquivo da imagem (padrão: símbolo quadrado de fundo cheio, public/brand/logo-mark.svg). */
  src?: string;
  /** Versões para telas de alta densidade (ex.: "/brand/x-80.png 2x, /brand/x-120.png 3x"). */
  srcSet?: string;
  /** Use alt="" quando o nome já aparece em texto ao lado (evita leitura dupla por leitores de tela). */
  alt?: string;
}

/**
 * Símbolo do sistema. Para trocar a logo, substitua os arquivos de public/brand/
 * (medidas e regras em docs/guia-de-logo.md). Cantos e sombra vêm do `className` de quem usa.
 */
export const BrandMark: React.FC<Props> = ({ size, className = '', src = '/brand/logo-mark.svg', srcSet, alt = 'Vértice 360' }) => (
  <img
    src={src}
    srcSet={srcSet}
    alt={alt}
    width={size}
    height={size}
    draggable={false}
    className={`shrink-0 select-none ${className}`}
  />
);
