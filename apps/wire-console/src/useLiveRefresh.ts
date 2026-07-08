import { useEffect } from "react";

const POLL_MS = 5000;

export function useLiveRefresh(onRefresh: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let es: EventSource | null = null;
    let pollId: number | undefined;
    let disposed = false;

    function startPolling() {
      if (pollId || disposed) return;
      pollId = window.setInterval(onRefresh, POLL_MS);
    }

    function stopPolling() {
      if (pollId) {
        clearInterval(pollId);
        pollId = undefined;
      }
    }

    try {
      es = new EventSource("/console/v1/events/stream");
      es.addEventListener("snapshot", () => onRefresh());
      es.onerror = () => {
        es?.close();
        es = null;
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      disposed = true;
      es?.close();
      stopPolling();
    };
  }, [enabled, onRefresh]);
}
