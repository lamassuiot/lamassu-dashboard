import React from 'react';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  src: string | { src: string };
  alt: string;
  fill?: boolean;
  layout?: 'fill' | 'intrinsic' | 'responsive' | 'fixed';
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
};

export default function StaticImage({ src, alt, fill, layout, priority, quality: _quality, unoptimized: _unoptimized, style, ...props }: Props) {
  return (
    <img
      alt={alt}
      src={typeof src === 'string' ? src : src.src}
      loading={priority ? 'eager' : 'lazy'}
      style={fill || layout === 'fill' ? { position: 'absolute', width: '100%', height: '100%', ...style } : style}
      {...props}
    />
  );
}
