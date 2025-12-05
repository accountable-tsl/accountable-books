import React, {
  forwardRef,
  type ImgHTMLAttributes,
  useMemo,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

export interface ImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  loading?: 'eager' | 'lazy';
  quality?: number; // Not currently functional, but here for future-proofing
  unoptimized?: boolean;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  fallbackSrc?: string;
}

export const Image = forwardRef<HTMLImageElement, ImageProps>(
  (
    {
      src,
      alt,
      width,
      height,
      fill = false,
      priority = false,
      loading = 'lazy',
      quality = 75,
      unoptimized = false,
      placeholder = 'empty',
      blurDataURL,
      fallbackSrc,
      className,
      style,
      ...props
    },
    ref,
  ) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [isBlurred, setIsBlurred] = useState(
      placeholder === 'blur' && !!blurDataURL,
    );

    const getSize = (size: number | string | undefined) =>
      typeof size === 'number' ? `${size}px` : size;

    const loadingAttr = priority ? 'eager' : loading;

    const imageStyle = useMemo(() => {
      const baseStyle: React.CSSProperties = fill
        ? {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }
        : {
            width: getSize(width),
            height: getSize(height),
            objectFit: 'cover',
          };

      return {
        ...baseStyle,
        ...style,
        filter: isBlurred ? 'blur(20px)' : undefined,
        transition: isBlurred ? 'filter 0.3s ease-out' : undefined,
      };
    }, [fill, width, height, style, isBlurred]);

    const handleLoad = () => {
      if (isBlurred) setIsBlurred(false);
    };

    const handleError = () => {
      if (fallbackSrc && imgSrc !== fallbackSrc) {
        setImgSrc(fallbackSrc);
      }
    };

    return (
      <img
        ref={ref}
        src={isBlurred && blurDataURL ? blurDataURL : imgSrc}
        alt={alt}
        loading={loadingAttr}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        style={imageStyle}
        className={cn(className)}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    );
  },
);

Image.displayName = 'Image';
