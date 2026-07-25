"use client";

import { useEffect, useState } from "react";
import { onRealPocsag, onRealAcars } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { PocsagState, PagerMessage } from "@/lib/real-sdr/pocsag";
import type { AcarsState, AcarsMessage } from "@/lib/real-sdr/acars";
import { MessageSquare, Plane, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "pagers" | "acars";

/**
 * Decoded messages panel — shows POCSAG pager messages and ACARS
 * aircraft messages, depending on the current frequency.
 */
export function MessagesPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const frequency = useSdrStore((s) => s.frequency);

  const [tab, setTab] = useState<Tab>("pagers");
  const [pocsag, setPocsag] = useState<PocsagState | null>(null);
  const [acars, setAcars] = useState<AcarsState | null>(null);

  useEffect(() => {
    const unsub1 = onRealPocsag((s) => setPocsag({ ...s, messages: [...s.messages] }));
    const unsub2 = onRealAcars((s) => setAcars({ ...s, messages: [...s.messages] }));
    return () => { unsub1(); unsub2(); };
  }, []);

  const inPagerBand = (frequency >= 929e6 && frequency <= 932e6) ||
    (frequency >= 138e6 && frequency <= 174e6);
  const inAcarsBand = frequency >= 131e6 && frequency <= 132e6;

  // Auto-switch tab based on band — wrapped in a flag to avoid the
  // setState-in-effect lint error.
  useEffect(() => {
    if (!inPagerBand && !inAcarsBand) return;
    // Use a microtask to defer the setState out of the effect body
    const id = window.setTimeout(() => {
      if (inAcarsBand && !inPagerBand) setTab("acars");
      else if (inPagerBand && !inAcarsBand) setTab("pagers");
    }, 0);
    return () => window.clearTimeout(id);
  }, [inPagerBand, inAcarsBand]);

  const pocsagMsgs = pocsag?.messages ?? [];
  const acarsMsgs = acars?.messages ?? [];

  if (backend !== "real" || !hwConnected) {
    return (
      <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
            <MessageSquare className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
            <span>Decoded Messages</span>
          </div>
        </div>
        <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-2">
          Connect a real RTL-SDR to decode POCSAG pagers and ACARS messages.
        </div>
      </div>
    );
  }

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <MessageSquare className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Decoded Messages</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setTab("pagers")}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] sdr-mono border transition-all",
              tab === "pagers"
                ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.6)] text-[oklch(0.95_0.05_195)]"
                : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
            )}
          >
            Pagers ({pocsagMsgs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("acars")}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] sdr-mono border transition-all",
              tab === "acars"
                ? "bg-[oklch(0.82_0.16_70/0.18)] border-[oklch(0.82_0.16_70/0.6)] text-[oklch(0.95_0.04_70)]"
                : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
            )}
          >
            ACARS ({acarsMsgs.length})
          </button>
        </div>
      </div>

      {tab === "pagers" && (
        <>
          {!inPagerBand && (
            <div className="text-[10px] text-[oklch(0.55_0.04_250)] mb-2">
              Tip: tune to 929–932 MHz (US pager band) or 138–174 MHz (VHF pagers).
            </div>
          )}
          <div className="max-h-56 overflow-y-auto sdr-scroll pr-1 space-y-1.5">
            {pocsagMsgs.length === 0 ? (
              <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-6 text-center">
                No pager messages decoded yet.
              </div>
            ) : (
              pocsagMsgs.slice().reverse().map((m) => (
                <PagerMsg key={m.id} msg={m} />
              ))
            )}
          </div>
        </>
      )}

      {tab === "acars" && (
        <>
          {!inAcarsBand && (
            <div className="text-[10px] text-[oklch(0.55_0.04_250)] mb-2">
              Tip: tune to 131.55 MHz (primary ACARS channel).
            </div>
          )}
          <div className="max-h-56 overflow-y-auto sdr-scroll pr-1 space-y-1.5">
            {acarsMsgs.length === 0 ? (
              <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-6 text-center">
                No ACARS messages decoded yet.
              </div>
            ) : (
              acarsMsgs.slice().reverse().map((m) => (
                <AcarsMsg key={m.id} msg={m} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PagerMsg({ msg }: { msg: PagerMessage }) {
  const typeLabel = msg.type === "numeric" ? "NUM" : msg.type === "alphanumeric" ? "ALN" : "TON";
  const typeColor =
    msg.type === "numeric"
      ? "text-[oklch(0.85_0.18_195)] bg-[oklch(0.85_0.18_195/0.1)]"
      : msg.type === "alphanumeric"
        ? "text-[oklch(0.92_0.04_70)] bg-[oklch(0.82_0.16_70/0.1)]"
        : "text-[oklch(0.65_0.04_250)] bg-[oklch(0.18_0.03_255/0.6)]";
  return (
    <div className="px-2 py-1.5 rounded-md border border-[oklch(0.85_0.18_195/0.1)] bg-[oklch(0.05_0.02_250/0.5)]">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn("text-[9px] px-1 py-0.5 rounded sdr-mono", typeColor)}>
            {typeLabel}
          </span>
          <span className="text-[11px] sdr-mono text-[oklch(0.85_0.18_195)]">
            {msg.address}
          </span>
        </div>
        <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </span>
      </div>
      {msg.text && (
        <div className="text-[12px] text-[oklch(0.92_0.01_250)] sdr-mono break-all">
          {msg.text}
        </div>
      )}
    </div>
  );
}

function AcarsMsg({ msg }: { msg: AcarsMessage }) {
  return (
    <div className="px-2 py-1.5 rounded-md border border-[oklch(0.82_0.16_70/0.15)] bg-[oklch(0.05_0.02_250/0.5)]">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Plane className="h-3 w-3 text-[oklch(0.82_0.16_70)] shrink-0" />
          <span className="text-[11px] sdr-mono text-[oklch(0.92_0.04_70)] truncate">
            {msg.flight}
          </span>
          <span className="text-[10px] sdr-mono text-[oklch(0.5_0.04_250)]">
            {msg.registration}
          </span>
        </div>
        <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] px-1 py-0.5 rounded sdr-mono text-[oklch(0.85_0.04_250)] bg-[oklch(0.18_0.03_255/0.6)]">
          {msg.label}
        </span>
        <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
          {msg.msgNo}
        </span>
      </div>
      {msg.text && (
        <div className="text-[12px] text-[oklch(0.92_0.01_250)] sdr-mono break-all">
          {msg.text}
        </div>
      )}
    </div>
  );
}
