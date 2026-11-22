import { useEffect, useRef, useState } from "react";

export function isBrokenImage(image: HTMLImageElement) {
  return image.hasAttribute("src") && image.complete && image.naturalWidth === 0;
}

export function missingImageLabel(alt: string) {
  return `${alt.trim() || "图片"}暂时无法显示`;
}

export function ImageWithFallback({ src, alt, className }: {
  src: string; alt: string; className?: string;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [failedSource, setFailedSource] = useState<string>();
  useEffect(() => {
    if (image.current && isBrokenImage(image.current)) setFailedSource(src);
  }, [src]);

  if (failedSource === src) {
    const label = missingImageLabel(alt);
    return <span className={`image-placeholder ${className ?? ""}`} role="img" aria-label={label}>{label}</span>;
  }
  return <img ref={image} className={className} src={src} alt={alt} onError={() => setFailedSource(src)} />;
}
