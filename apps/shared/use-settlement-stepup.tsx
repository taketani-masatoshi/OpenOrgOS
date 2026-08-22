import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  SettlementPasskeyModal,
  type SettlementPasskeyChallenge,
} from "./SettlementPasskeyModal";
import type { SettlementApi } from "./settlement-stepup-client";

type Session = {
  challenge: SettlementPasskeyChallenge;
  resolve: () => void;
  reject: (err: Error) => void;
};

/**
 * Holds SettlementPasskeyModal + a promise-based runCeremony for approve flows.
 */
export function useSettlementStepUp(api: SettlementApi): {
  runCeremony: (challenge: SettlementPasskeyChallenge) => Promise<void>;
  modal: ReactNode;
  clear: () => void;
} {
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const clear = useCallback(() => setSession(null), []);

  const runCeremony = useCallback((challenge: SettlementPasskeyChallenge) => {
    return new Promise<void>((resolve, reject) => {
      setSession({ challenge, resolve, reject });
    });
  }, []);

  const modal = session ? (
    <SettlementPasskeyModal
      challenge={session.challenge}
      api={api}
      onSuccess={() => {
        sessionRef.current?.resolve();
        setSession(null);
      }}
      onCancel={() => {
        sessionRef.current?.reject(new Error("キャンセルしました"));
        setSession(null);
      }}
    />
  ) : null;

  return { runCeremony, modal, clear };
}
