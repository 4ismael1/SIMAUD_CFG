import React from 'react';
import LogoImage from '../../assets/Logo.png';
import { BRAND_FULL_NAME, BRAND_MODULE, BRAND_NAME } from '../../lib/branding';

interface BrandLogoProps {
  title?: string;
  subtitle?: string;
  orientation?: 'horizontal' | 'vertical';
  align?: 'left' | 'center';
  className?: string;
  imageClassName?: string;
  imageWrapperClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  showText?: boolean;
  alt?: string;
}

/**
 * Shared brand logo renderer to keep image usage consistent across the app.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  title = BRAND_NAME,
  subtitle = BRAND_MODULE,
  orientation = 'horizontal',
  align = 'left',
  className = '',
  imageClassName = 'h-10 w-auto',
  imageWrapperClassName = '',
  titleClassName = 'text-lg font-bold text-gray-900',
  subtitleClassName = 'text-xs text-gray-500',
  showText = true,
  alt,
}) => {
  const isHorizontal = orientation === 'horizontal';
  const containerClasses = isHorizontal
    ? `flex items-center space-x-3 ${className}`.trim()
    : `flex flex-col items-center space-y-3 ${className}`.trim();

  const textAlignment =
    align === 'center'
      ? 'text-center'
      : 'text-left';

  const imageWrapperClasses = `flex-shrink-0 flex items-center justify-center ${imageWrapperClassName}`.trim();
  const trimmedTitle = title?.trim() ?? '';
  const computedAlt =
    alt ?? `Logotipo de ${BRAND_FULL_NAME}`;

  return (
    <div className={containerClasses}>
      <div className={imageWrapperClasses}>
        <img
          src={LogoImage}
          alt={computedAlt}
          className={`object-contain ${imageClassName}`.trim()}
        />
      </div>
      {showText && (trimmedTitle || subtitle) && (
        <div className={!isHorizontal ? textAlignment : undefined}>
          {trimmedTitle && <p className={titleClassName}>{trimmedTitle}</p>}
          {subtitle && subtitle.trim().length > 0 && (
            <p className={subtitleClassName}>{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
};
