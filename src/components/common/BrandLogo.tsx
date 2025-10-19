import React from 'react';
import LogoImage from '../../assets/Logo.png';

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
}

/**
 * Shared brand logo renderer to keep image usage consistent across the app.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  title = 'SIMAUD',
  subtitle,
  orientation = 'horizontal',
  align = 'left',
  className = '',
  imageClassName = 'w-10 h-10',
  imageWrapperClassName = '',
  titleClassName = 'text-lg font-bold text-gray-900',
  subtitleClassName = 'text-xs text-gray-500',
}) => {
  const isHorizontal = orientation === 'horizontal';
  const containerClasses = isHorizontal
    ? `flex items-center space-x-3 ${className}`.trim()
    : `flex flex-col items-center space-y-3 ${className}`.trim();

  const textAlignment =
    align === 'center'
      ? 'text-center'
      : 'text-left';
  const imageWrapperClasses = `flex-shrink-0 ${imageWrapperClassName}`.trim();

  return (
    <div className={containerClasses}>
      <div className={imageWrapperClasses}>
        <img
          src={LogoImage}
          alt={`${title} logo`}
          className={`object-contain ${imageClassName}`.trim()}
        />
      </div>
      {(title || subtitle) && (
        <div className={!isHorizontal ? textAlignment : undefined}>
          {title && <p className={titleClassName}>{title}</p>}
          {subtitle && subtitle.trim().length > 0 && (
            <p className={subtitleClassName}>{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
};
