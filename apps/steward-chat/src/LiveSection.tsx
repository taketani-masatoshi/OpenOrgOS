import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type LiveSectionRenderArgs = {
  visible: boolean;
  /** True after the section has intersected at least once (sticky). */
  activated: boolean;
};

type LiveSectionProps = {
  children: ReactNode | ((args: LiveSectionRenderArgs) => ReactNode);
  /** Called once when the section first scrolls into view. */
  onVisible?: () => void;
  /** IntersectionObserver rootMargin (default: prefetch slightly before viewport). */
  rootMargin?: string;
  /** Intersection ratio threshold. */
  threshold?: number | number[];
  skeleton?: ReactNode;
  className?: string;
  /** Accessible label for the live region wrapper. */
  "aria-label"?: string;
};

const DEFAULT_SKELETON = (
  <div className="loading-panel live-section-skeleton" aria-hidden>
    …
  </div>
);

/**
 * Defer live / heavy Console sections until scrolled into view (once).
 * Static MD stays above; this wraps the secondary live surface (scope A).
 */
export function LiveSection({
  children,
  onVisible,
  rootMargin = "120px 0px",
  threshold = 0.05,
  skeleton = DEFAULT_SKELETON,
  className,
  "aria-label": ariaLabel,
}: LiveSectionProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [activated, setActivated] = useState(false);
  const [visible, setVisible] = useState(false);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setActivated(true);
      setVisible(true);
      onVisibleRef.current?.();
      return;
    }

    let done = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting && !done) {
          done = true;
          setActivated(true);
          onVisibleRef.current?.();
          observer.disconnect();
        }
      },
      { root: null, rootMargin, threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  const body =
    typeof children === "function"
      ? children({ visible, activated })
      : activated
        ? children
        : skeleton;

  return (
    <div
      ref={ref}
      className={["live-section", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      data-activated={activated ? "1" : "0"}
    >
      {body}
    </div>
  );
}
