"use client";

import { useEffect, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { Bookmark, Plus, Trash2, Save, RotateCcw, Download, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Quick-connect Preset Profiles — save and restore complete SDR state.
 *
 * Unlike bookmarks (which only save frequency + demod + bandwidth),
 * profiles capture the FULL radio state: frequency, demod mode, bandwidth,
 * sample rate, gain, AGC, squelch, PPM correction, and AGC speed. This
 * is the SDR equivalent of a "memory channel" on a traditional radio.
 *
 * Use cases:
 *   - Save your favorite DX frequency with all the settings that make
 *     it work (gain, PPM, bandwidth) so you can return instantly.
 *   - Set up different profiles for different antennas or bands.
 *   - Export profiles to share with other operators or back up.
 */

interface PresetProfile {
  id: string;
  name: string;
  frequency: number;
  demod: string;
  bandwidth: number;
  sampleRate: number;
  gainDb: number;
  autoGain: boolean;
  squelch: number;
  ppmCorrection: number;
  agcSpeed: "slow" | "medium" | "fast";
  note?: string;
  createdAt: number;
}

const PROFILES_KEY = "rtl-sdr-v3-console-profiles-v1";

function loadProfiles(): PresetProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProfiles(profiles: PresetProfile[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {}
}

export function PresetProfilesPanel() {
  const frequency = useSdrStore((s) => s.frequency);
  const demod = useSdrStore((s) => s.demod);
  const bandwidth = useSdrStore((s) => s.bandwidth);
  const sampleRate = useSdrStore((s) => s.sampleRate);
  const gainDb = useSdrStore((s) => s.gainDb);
  const autoGain = useSdrStore((s) => s.autoGain);
  const squelch = useSdrStore((s) => s.squelch);
  const ppmCorrection = useSdrStore((s) => s.ppmCorrection);
  const agcSpeed = useSdrStore((s) => s.agcSpeed);

  const setFrequency = useSdrStore((s) => s.setFrequency);
  const setDemod = useSdrStore((s) => s.setDemod);
  const setBandwidth = useSdrStore((s) => s.setBandwidth);
  const setSampleRate = useSdrStore((s) => s.setSampleRate);
  const setGainDb = useSdrStore((s) => s.setGainDb);
  const setAutoGain = useSdrStore((s) => s.setAutoGain);
  const setSquelch = useSdrStore((s) => s.setSquelch);
  const setPpmCorrection = useSdrStore((s) => s.setPpmCorrection);
  const setAgcSpeed = useSdrStore((s) => s.setAgcSpeed);

  const [profiles, setProfiles] = useState<PresetProfile[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");

  // Load profiles after mount (avoids hydration issues). Use a microtask
  // to defer the setState out of the effect body.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setProfiles(loadProfiles());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const handleSave = () => {
    const name = newName.trim() || `Profile ${profiles.length + 1}`;
    const profile: PresetProfile = {
      id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      frequency,
      demod,
      bandwidth,
      sampleRate,
      gainDb,
      autoGain,
      squelch,
      ppmCorrection,
      agcSpeed,
      note: newNote.trim() || undefined,
      createdAt: Date.now(),
    };
    const next = [profile, ...profiles];
    setProfiles(next);
    saveProfiles(next);
    setNewName("");
    setNewNote("");
    setShowSaveDialog(false);
  };

  const handleLoad = (profile: PresetProfile) => {
    setFrequency(profile.frequency);
    setDemod(profile.demod as any);
    setBandwidth(profile.bandwidth);
    setSampleRate(profile.sampleRate);
    setGainDb(profile.gainDb);
    setAutoGain(profile.autoGain);
    setSquelch(profile.squelch);
    setPpmCorrection(profile.ppmCorrection);
    setAgcSpeed(profile.agcSpeed);
  };

  const handleDelete = (id: string) => {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    saveProfiles(next);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rtl-sdr-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string);
        if (Array.isArray(imported)) {
          const next = [...imported, ...profiles].slice(0, 50);
          setProfiles(next);
          saveProfiles(next);
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Bookmark className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Preset Profiles</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleExport}
            disabled={profiles.length === 0}
            className="p-1 rounded text-[oklch(0.55_0.04_250)] hover:text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.1)] disabled:opacity-30 transition-all"
            title="Export profiles"
            aria-label="Export profiles"
          >
            <Download className="h-3 w-3" />
          </button>
          <label
            className="p-1 rounded text-[oklch(0.55_0.04_250)] hover:text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.1)] cursor-pointer transition-all"
            title="Import profiles"
          >
            <Upload className="h-3 w-3" />
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)] ml-1">
            {profiles.length}
          </span>
        </div>
      </div>

      {/* Save current state button */}
      <button
        type="button"
        onClick={() => setShowSaveDialog(!showSaveDialog)}
        className="w-full flex items-center justify-center gap-2 py-2 mb-3 rounded-md bg-[oklch(0.85_0.18_195/0.14)] border border-[oklch(0.85_0.18_195/0.35)] text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.22)] text-xs sdr-mono transition-all"
      >
        {showSaveDialog ? (
          <>
            <RotateCcw className="h-3.5 w-3.5" />
            <span>CANCEL</span>
          </>
        ) : (
          <>
            <Save className="h-3.5 w-3.5" />
            <span>SAVE CURRENT STATE</span>
          </>
        )}
      </button>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="mb-3 p-3 rounded-md bg-[oklch(0.05_0.02_250/0.7)] border border-[oklch(0.85_0.18_195/0.2)] space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Profile name (e.g. '20m DX night')"
            className="w-full px-2 py-1.5 rounded-md bg-[oklch(0.05_0.02_250/0.7)] border border-[oklch(0.85_0.18_195/0.18)] text-[11px] text-[oklch(0.92_0.01_250)] placeholder:text-[oklch(0.45_0.04_250)] focus:outline-none focus:ring-1 focus:ring-[oklch(0.85_0.18_195/0.5)]"
            autoFocus
          />
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Optional note (e.g. 'best after sunset, AGC off')"
            className="w-full px-2 py-1.5 rounded-md bg-[oklch(0.05_0.02_250/0.7)] border border-[oklch(0.85_0.18_195/0.18)] text-[11px] text-[oklch(0.92_0.01_250)] placeholder:text-[oklch(0.45_0.04_250)] focus:outline-none focus:ring-1 focus:ring-[oklch(0.85_0.18_195/0.5)]"
          />
          <div className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
            Saves: {(frequency / 1e6).toFixed(4)} MHz · {demod} · BW {(bandwidth / 1e3).toFixed(1)}kHz · SR {(sampleRate / 1e6).toFixed(2)}Msps · {autoGain ? "AGC" : `${gainDb.toFixed(1)}dB`} · PPM {ppmCorrection}
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-[oklch(0.80_0.18_155/0.14)] border border-[oklch(0.80_0.18_155/0.4)] text-[oklch(0.92_0.04_155)] hover:bg-[oklch(0.80_0.18_155/0.22)] text-[10px] sdr-mono"
          >
            <Plus className="h-3 w-3" />
            SAVE PROFILE
          </button>
        </div>
      )}

      {/* Saved profiles list */}
      <div className="max-h-48 overflow-y-auto sdr-scroll pr-1 space-y-1">
        {profiles.length === 0 ? (
          <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-3 text-center">
            No profiles saved. Click &quot;SAVE CURRENT STATE&quot; above to capture the
            full radio state — frequency, demod, bandwidth, gain, PPM, squelch —
            for instant recall later.
          </div>
        ) : (
          profiles.map((p) => (
            <div
              key={p.id}
              className="group px-2 py-1.5 rounded-md border border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)] hover:border-[oklch(0.85_0.18_195/0.18)] transition-all"
            >
              <button
                type="button"
                onClick={() => handleLoad(p)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] sdr-mono text-[oklch(0.92_0.04_195)] truncate">
                    {p.name}
                  </span>
                  <span className="text-[10px] sdr-mono text-[oklch(0.85_0.18_195)] shrink-0">
                    {(p.frequency / 1e6).toFixed(4)} MHz
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] sdr-mono px-1 py-0.5 rounded bg-[oklch(0.85_0.18_195/0.1)] text-[oklch(0.85_0.18_195)]">
                    {p.demod}
                  </span>
                  <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
                    BW {(p.bandwidth / 1e3).toFixed(0)}k
                  </span>
                  <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
                    {p.autoGain ? "AGC" : `${p.gainDb.toFixed(0)}dB`}
                  </span>
                  <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
                    PPM {p.ppmCorrection}
                  </span>
                </div>
                {p.note && (
                  <div className="text-[10px] text-[oklch(0.55_0.04_250)] mt-0.5 italic truncate">
                    {p.note}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="opacity-0 group-hover:opacity-100 absolute right-2 top-2 p-1 rounded hover:bg-[oklch(0.5_0.2_25/0.3)] text-[oklch(0.7_0.04_250)] hover:text-[oklch(0.85_0.2_25)] transition-all"
                aria-label="Delete profile"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
