import { useLayoutEffect, useRef, type ReactNode } from "react";

function measureExpandedWidth(item: HTMLDetailsElement): number {
  const probe = item.cloneNode(true) as HTMLDetailsElement;
  probe.open = true;
  probe.classList.add("settings-accordion-width-probe");
  probe.setAttribute("aria-hidden", "true");
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

function measureWidestMenu(root: HTMLElement): number {
  const items = root.querySelectorAll<HTMLDetailsElement>(
    ".settings-accordion-item:not(.settings-accordion-width-probe)"
  );
  let max = 0;
  items.forEach((item) => {
    max = Math.max(max, measureExpandedWidth(item));
  });
  return Math.ceil(max);
}

/**
 * Locks every settings accordion to the widest expanded menu.
 * Opening Language / PassKey must not change that shared width.
 */
export function SettingsAccordionList({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const lockedWidth = useRef(0);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const apply = () => {
      const measured = measureWidestMenu(root);
      if (measured <= lockedWidth.current) return;
      lockedWidth.current = measured;
      root.style.setProperty("--settings-menu-width", `${measured}px`);
      root.style.width = `${measured}px`;
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="settings-accordion-list" ref={ref}>
      {children}
    </div>
  );
}
