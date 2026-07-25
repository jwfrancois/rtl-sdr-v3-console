"use client";

import { useEffect, useMemo, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { STATIONS, formatFrequency } from "@/lib/sdr-engine";
import { Bookmark, Star, Trash2, Plus, Search, Radio, CloudUpload, CloudDownload } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "stations" | "bookmarks" | "history";

export function BookmarksPanel() {
  const [tab, setTab] = useState<Tab>("stations");
  const [query, setQuery] = useState("");
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const frequency = useSdrStore((s) => s.frequency);
  const setFrequency = useSdrStore((s) => s.setFrequency);
  const setDemod = useSdrStore((s) => s.setDemod);
  const setBandwidth = useSdrStore((s) => s.setBandwidth);
  const bookmarks = useSdrStore((s) => s.bookmarks);
  const addBookmark = useSdrStore((s) => s.addBookmark);
  const removeBookmark = useSdrStore((s) => s.removeBookmark);
  const loadBookmark = useSdrStore((s) => s.loadBookmark);
  const history = useSdrStore((s) => s.history);
  const demod = useSdrStore((s) => s.demod);
  const bandwidth = useSdrStore((s) => s.bandwidth);
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const bridgeUrl = useSdrStore((s) => s.bridgeUrl);

  // Compute the bridge HTTP URL (replaces ws:// with http://, port + 1)
  const httpUrl = backend === "real" && hwConnected
    ? bridgeUrl.replace(/^ws(s?):\/\//, "http$1://").replace(/:\d+$/, (m) => `:${Number(m.slice(1)) + 1}`)
    : null;

  // Sync: pull bookmarks from the bridge on mount
  const handlePullFromBridge = async () => {
    if (!httpUrl) return;
    setSyncMsg("Pulling…");
    try {
      const res = await fetch(`${httpUrl}/presets`);
      const data = await res.json();
      if (data.bookmarks && Array.isArray(data.bookmarks) && data.bookmarks.length > 0) {
        // Replace our bookmarks with the bridge's
        useSdrStore.setState((s) => ({ bookmarks: data.bookmarks }));
        setSyncMsg(`Loaded ${data.bookmarks.length} from bridge`);
      } else {
        setSyncMsg("No presets on bridge");
      }
    } catch (err) {
      setSyncMsg("Pull failed");
    }
    window.setTimeout(() => setSyncMsg(null), 2000);
  };

  // Sync: push bookmarks to the bridge
  const handlePushToBridge = async () => {
    if (!httpUrl) return;
    setSyncMsg("Pushing…");
    try {
      const payload = { bookmarks, scanPresets: [], savedAt: Date.now() };
      const res = await fetch(`${httpUrl}/presets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) setSyncMsg(`Saved ${bookmarks.length} to bridge`);
      else setSyncMsg("Push failed");
    } catch (err) {
      setSyncMsg("Push failed");
    }
    window.setTimeout(() => setSyncMsg(null), 2000);
  };

  const filteredStations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STATIONS;
    return STATIONS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.band.toLowerCase().includes(q) ||
        formatFrequency(s.freq).toLowerCase().includes(q),
    );
  }, [query]);

  // Group stations by band for the list view
  const grouped = useMemo(() => {
    const m = new Map<string, typeof STATIONS>();
    for (const s of filteredStations) {
      if (!m.has(s.band)) m.set(s.band, []);
      m.get(s.band)!.push(s);
    }
    return Array.from(m.entries());
  }, [filteredStations]);

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Bookmark className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Memory Bank</span>
        </div>
        <div className="flex items-center gap-1.5">
          {httpUrl && (
            <>
              <button
                type="button"
                onClick={handlePullFromBridge}
                className="p-1 rounded text-[oklch(0.65_0.04_250)] hover:text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.1)] transition-all"
                title="Pull bookmarks from bridge (sync from another device)"
              >
                <CloudDownload className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handlePushToBridge}
                className="p-1 rounded text-[oklch(0.65_0.04_250)] hover:text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.1)] transition-all"
                title="Save bookmarks to bridge (sync to other devices)"
              >
                <CloudUpload className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">
            {syncMsg ?? (tab === "stations" ? `${filteredStations.length} ch` : tab === "bookmarks" ? `${bookmarks.length} saved` : `${history.length} recent`)}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 mb-3">
        {(["stations", "bookmarks", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "py-1.5 rounded-md text-[11px] sdr-mono capitalize border transition-all",
              tab === t
                ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.6)] text-[oklch(0.95_0.05_195)]"
                : "bg-[oklch(0.13_0.025_255/0.4)] border-[oklch(0.85_0.18_195/0.1)] text-[oklch(0.6_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.6)]",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search (only on stations) */}
      {tab === "stations" && (
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[oklch(0.45_0.04_250)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search frequency, band, name…"
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[oklch(0.05_0.02_250/0.6)] border border-[oklch(0.85_0.18_195/0.15)] text-[11px] text-[oklch(0.92_0.01_250)] placeholder:text-[oklch(0.45_0.04_250)] focus:outline-none focus:ring-1 focus:ring-[oklch(0.85_0.18_195/0.5)]"
          />
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto sdr-scroll pr-1 min-h-0 max-h-[440px]">
        {tab === "stations" &&
          grouped.map(([band, list]) => (
            <div key={band} className="mb-3">
              <div className="sticky top-0 bg-[oklch(0.10_0.02_250/0.95)] backdrop-blur px-2 py-1 text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)] border-b border-[oklch(0.85_0.18_195/0.08)]">
                {band}
              </div>
              <div className="mt-1 space-y-0.5">
                {list.map((s) => {
                  const active = Math.abs(s.freq - frequency) < s.bandwidth / 2;
                  return (
                    <button
                      key={`${s.freq}-${s.label}`}
                      type="button"
                      onClick={() => {
                        setFrequency(s.freq);
                        setDemod(s.modulation);
                        setBandwidth(s.bandwidth);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left transition-all group",
                        active
                          ? "bg-[oklch(0.85_0.18_195/0.16)] border border-[oklch(0.85_0.18_195/0.5)]"
                          : "border border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)] hover:border-[oklch(0.85_0.18_195/0.18)]",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Radio
                          className={cn(
                            "h-3 w-3 shrink-0",
                            active ? "text-[oklch(0.85_0.18_195)] sdr-pulse" : "text-[oklch(0.5_0.04_250)]",
                          )}
                        />
                        <div className="min-w-0">
                          <div
                            className={cn(
                              "text-[12px] truncate",
                              active ? "text-[oklch(0.95_0.04_195)]" : "text-[oklch(0.85_0.04_250)]",
                            )}
                          >
                            {s.label}
                          </div>
                          {s.description && (
                            <div className="text-[10px] text-[oklch(0.5_0.04_250)] truncate">
                              {s.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] px-1.5 py-0.5 rounded sdr-mono bg-[oklch(0.85_0.18_195/0.1)] text-[oklch(0.85_0.18_195)]">
                          {s.modulation}
                        </span>
                        <span className="text-[10px] sdr-mono text-[oklch(0.7_0.04_250)]">
                          {(s.freq / 1e6).toFixed(3)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

        {tab === "bookmarks" && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                addBookmark({
                  label: `Bookmark ${bookmarks.length + 1}`,
                  freq: frequency,
                  modulation: demod,
                  bandwidth,
                  note: "",
                });
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 mb-2 rounded-md bg-[oklch(0.85_0.18_195/0.12)] border border-dashed border-[oklch(0.85_0.18_195/0.4)] text-[11px] text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.22)] transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              Save current frequency
            </button>
            {bookmarks.length === 0 && (
              <div className="text-center py-8 text-[11px] text-[oklch(0.5_0.04_250)]">
                No bookmarks yet. Save the current frequency to quickly return later.
              </div>
            )}
            {bookmarks.map((b) => (
              <div
                key={b.id}
                className={cn(
                  "group flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border transition-all",
                  Math.abs(b.freq - frequency) < b.bandwidth / 2
                    ? "bg-[oklch(0.82_0.16_70/0.14)] border-[oklch(0.82_0.16_70/0.5)]"
                    : "border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => loadBookmark(b.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                  <Star className="h-3 w-3 shrink-0 text-[oklch(0.82_0.16_70)]" />
                  <div className="min-w-0">
                    <div className="text-[12px] text-[oklch(0.92_0.01_250)] truncate">{b.label}</div>
                    <div className="text-[10px] sdr-mono text-[oklch(0.6_0.04_250)]">
                      {b.modulation} · {(b.freq / 1e6).toFixed(4)} MHz
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => removeBookmark(b.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[oklch(0.5_0.2_25/0.3)] text-[oklch(0.7_0.04_250)] hover:text-[oklch(0.85_0.2_25)] transition-all"
                  aria-label="Remove bookmark"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-0.5">
            {history.length === 0 && (
              <div className="text-center py-8 text-[11px] text-[oklch(0.5_0.04_250)]">
                Recently tuned frequencies will appear here.
              </div>
            )}
            {history.map((h, idx) => (
              <button
                key={`${h.freq}-${idx}`}
                type="button"
                onClick={() => {
                  setFrequency(h.freq);
                  setDemod(h.demod);
                }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left transition-all border",
                  Math.abs(h.freq - frequency) < 5e3
                    ? "bg-[oklch(0.85_0.18_195/0.12)] border-[oklch(0.85_0.18_195/0.4)]"
                    : "border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)]",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] sdr-mono text-[oklch(0.5_0.04_250)] w-6">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12px] sdr-mono text-[oklch(0.85_0.04_250)]">
                      {(h.freq / 1e6).toFixed(5)} MHz
                    </div>
                    <div className="text-[10px] text-[oklch(0.55_0.04_250)]">
                      {timeAgo(h.ts)}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] sdr-mono px-1.5 py-0.5 rounded bg-[oklch(0.85_0.18_195/0.1)] text-[oklch(0.85_0.18_195)]">
                  {h.demod}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}
