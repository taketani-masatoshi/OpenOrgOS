import type { ImgHTMLAttributes } from "react";

/**
 * Default image: lazy-load so off-screen assets do not block first paint.
 * Hero / LCP images can pass eager.
 */
export function LazyImg({
  eager = false,
  alt = "",
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & { eager?: boolean }) {
  return (
    <img
      {...rest}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
