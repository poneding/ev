import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Check, Code, Copy, Eye, EyeOff, FolderOpen, Github, Pencil, Plus, RefreshCw, Search, Settings as SettingsIcon, Square, SquareCheck, Trash2 } from "lucide-react";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import "./App.css";
import { Modal } from "./components/Modal";
import { Select } from "./components/Select";
import { WindowControls } from "./components/WindowControls";
import type { AppLanguage } from "./i18n";
import { persistLanguage } from "./i18n";
import type { EnvGroup, Settings } from "./store/evStore";
import { loadDb, saveGroups, saveSettings } from "./store/evStore";

type EnvVar = { key: string; value: string };

function parseEnvContent(content: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    // support: KEY=VALUE, export KEY=VALUE
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = (m[2] ?? "").trim();

    // strip matching quotes (simple case)
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    out.set(key, value);
  }
  return out;
}

function isValidEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatEnvAssignment(key: string, value: string): string {
  // Keep it simple and readable; quote only when needed.
  const needsQuotes = /[\s#"']/g.test(value) || value.includes("\\");
  if (!needsQuotes) return `${key}=${value}`;
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${key}="${escaped}"`;
}

function deleteEnvVarFromContent(content: string, key: string): string {
  const re = new RegExp(`^(?:export\\s+)?${escapeRegExp(key)}\\s*=`);
  const lines = content.split(/\r?\n/);
  const next = lines.filter((raw) => {
    const line = raw.trim();
    if (!line) return true;
    if (line.startsWith("#")) return true;
    return !re.test(line);
  });
  // Avoid trailing blank lines explosion.
  return next.join("\n").replace(/\s+$/, "");
}

function upsertEnvVarInContent(content: string, key: string, value: string): string {
  const re = new RegExp(`^(?:export\\s+)?${escapeRegExp(key)}\\s*=`);
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let inserted = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed && !trimmed.startsWith("#") && re.test(trimmed)) {
      if (!inserted) {
        out.push(formatEnvAssignment(key, value));
        inserted = true;
      }
      // drop duplicate occurrences
      continue;
    }
    out.push(raw);
  }
  if (!inserted) {
    if (out.length && out[out.length - 1]?.trim() !== "") out.push("");
    out.push(formatEnvAssignment(key, value));
  }
  return out.join("\n").replace(/\s+$/, "");
}
type IntegrationInfo = {
  config_dir: string;
  ev_dir: string;
  reveal_target: string;
  source_zsh?: string | null;
  source_bash?: string | null;
  source_fish?: string | null;
  note: string;
};

const LazyEnvEditor = React.lazy(() => import("./components/EnvEditor"));

function newId(): string {
  // crypto.randomUUID exists in modern WebView runtimes; keep a safe fallback.
  return globalThis.crypto?.randomUUID?.() ?? `g_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function App() {
  const { t, i18n } = useTranslation();
  const [selectedGroupId, setSelectedGroupId] = useState<string>("current");
  const [groups, setGroups] = useState<EnvGroup[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const activeGroupIds = settings?.activeGroupIds ?? [];
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);
  const [settingsPos, setSettingsPos] = useState<{ top: number; right: number }>({ top: 64, right: 16 });
  const [settingsArrowRight, setSettingsArrowRight] = useState<number>(24);

  const [currentEnv, setCurrentEnv] = useState<EnvVar[] | null>(null);
  const [currentEnvLoading, setCurrentEnvLoading] = useState(false);
  const [currentEnvError, setCurrentEnvError] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(false);
  const [currentFilter, setCurrentFilter] = useState("");
  const [integration, setIntegration] = useState<IntegrationInfo | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<"zsh" | "bash" | "fish">("zsh");
  const sourceWrapRef = useRef<HTMLDivElement | null>(null);

  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");

  const [draftContent, setDraftContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [groupEditMode, setGroupEditMode] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");
  const [editingEnvKey, setEditingEnvKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const saveHintTimer = useRef<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimer = useRef<number | null>(null);

  const prefersDark = usePrefersDark();
  const isMac = useMemo(() => {
    const p = globalThis.navigator?.platform ?? "";
    const ua = globalThis.navigator?.userAgent ?? "";
    return /Mac/i.test(p) || /Macintosh/i.test(ua);
  }, []);
  const effectiveDark = useMemo(() => {
    const mode = settings?.themeMode ?? "system";
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return prefersDark;
  }, [prefersDark, settings?.themeMode]);

  useEffect(() => {
    // Used by CSS to adjust for macOS traffic lights.
    const root = document.documentElement;
    root.setAttribute("data-platform", isMac ? "macos" : "other");
    return () => {
      // keep it stable; do not remove on unmount
    };
  }, [isMac]);

  useEffect(() => {
    const root = document.documentElement;
    const mode = settings?.themeMode ?? "system";
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    const mono = settings?.monoFont;
    if (mono) root.style.setProperty("--mono-font", mono);
  }, [settings?.monoFont, settings?.themeMode]);

  const currentLanguage = useMemo(() => {
    const lng = i18n.language;
    if (lng === "zh-CN" || lng === "zh-TW" || lng === "en") return lng;
    if (lng.startsWith("zh")) return "zh-CN";
    return "en";
  }, [i18n.language]);

  async function onOpenGitHub() {
    await openUrl("https://github.com/poneding/ev");
  }

  async function onChangeLanguage(next: AppLanguage) {
    persistLanguage(next);
    await i18n.changeLanguage(next);
    if (settings) {
      const nextSettings: Settings = { ...settings, language: next };
      setSettings(nextSettings);
      await saveSettings(nextSettings);
    }
  }

  const [installedMonoFamilies, setInstalledMonoFamilies] = useState<string[]>([]);
  useEffect(() => {
    // WebViews can't reliably enumerate *all* installed fonts, but we can at least
    // only show options that the system can actually resolve.
    const candidates = [
      "SF Mono",
      "Menlo",
      "Monaco",
      "Consolas",
      "Cascadia Mono",
      "JetBrains Mono",
      "Fira Code",
      "Source Code Pro",
      "Hack",
      "Inconsolata",
      "Ubuntu Mono",
      "Noto Sans Mono",
      "Liberation Mono",
      "Courier New",
    ];
    const available: string[] = [];
    const seen = new Set<string>();
    for (const name of candidates) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        if (document.fonts?.check?.(`12px "${name}"`)) available.push(name);
      } catch {
        // ignore
      }
    }
    setInstalledMonoFamilies(available);
  }, []);

  const fontOptions = useMemo(() => {
    const baseStack =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    const opts = [
      { value: baseStack, label: "System monospace" },
      ...installedMonoFamilies.map((name) => ({ value: `"${name}", monospace`, label: name })),
      { value: "monospace", label: "monospace" },
    ];
    const current = settings?.monoFont;
    if (current && !opts.some((o) => o.value === current)) {
      opts.unshift({ value: current, label: "Current" });
    }
    return opts;
  }, [installedMonoFamilies, settings?.monoFont]);

  useEffect(() => {
    let mounted = true;
    void loadDb()
      .then(({ groups, settings }) => {
        if (!mounted) return;
        // restore enabled flags from activeGroupIds
        const activeIds = settings.activeGroupIds ?? [];
        const normalizedGroups = groups.map((g) =>
          g.kind === "custom" ? { ...g, enabled: activeIds.includes(g.id) } : g,
        );
        setGroups(normalizedGroups);
        setSettings(settings);
        setShowValues(!settings.hideValuesByDefault);
        if (activeIds.length) setSelectedGroupId(activeIds[0]);
      })
      .finally(() => {
        if (!mounted) return;
        setDbLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void invoke<IntegrationInfo>("get_integration_info")
      .then((info) => {
        if (!mounted) return;
        setIntegration(info);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void invoke<string>("get_app_version")
      .then((v) => {
        if (!mounted) return;
        setAppVersion(v);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function refreshCurrentEnv() {
    setCurrentEnvLoading(true);
    setCurrentEnvError(null);
    try {
      const env = await invoke<EnvVar[]>("get_current_env");
      setCurrentEnv(env);
    } catch (e) {
      setCurrentEnv(null);
      setCurrentEnvError(String(e));
    } finally {
      setCurrentEnvLoading(false);
    }
  }

  useEffect(() => {
    if (selectedGroupId !== "current") return;
    if (currentEnv != null) return;
    void refreshCurrentEnv();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  useEffect(() => {
    // close the popover when navigating away
    if (selectedGroupId !== "current") setSourceOpen(false);
  }, [selectedGroupId]);

  useEffect(() => {
    if (!sourceOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = sourceWrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setSourceOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSourceOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sourceOpen]);

  async function createGroup(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === "current") return;

    const next: EnvGroup = {
      id: newId(),
      name: trimmed,
      kind: "custom",
      enabled: false,
      format: "dotenv",
      content: "",
      updatedAt: Date.now(),
    };

    const nextGroups = [...groups, next];
    setGroups(nextGroups);
    await saveGroups(nextGroups);
    setSelectedGroupId(next.id);
  }

  async function renameGroup(groupId: string, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    const g = groups.find((x) => x.id === groupId);
    if (!g || g.kind !== "custom") return;
    const nextGroups = groups.map((x) => (x.id === groupId ? { ...x, name: trimmed, updatedAt: Date.now() } : x));
    setGroups(nextGroups);
    await saveGroups(nextGroups);
  }

  async function commitInlineRename(groupId: string, nextName: string) {
    await renameGroup(groupId, nextName);
    setRenamingGroupId(null);
    setRenamingValue("");
  }

  function buildMergedContent(nextGroups: EnvGroup[], nextActiveIds: string[]) {
    const enabled = nextGroups.filter((g) => g.kind === "custom" && nextActiveIds.includes(g.id));
    // Deterministic precedence: later groups in sidebar order override earlier ones.
    const out = new Map<string, string>();
    for (const g of enabled) {
      const content = selectedGroupId === g.id ? draftContent : g.content;
      const m = parseEnvContent(content);
      for (const [k, v] of m.entries()) out.set(k, v);
    }
    const lines: string[] = [];
    for (const [k, v] of out.entries()) lines.push(`${k}=${v}`);
    return lines.join("\n");
  }

  async function deleteGroup(groupId: string) {
    const g = groups.find((x) => x.id === groupId);
    if (!g || g.kind !== "custom") return;

    const prevActiveIds = settings?.activeGroupIds ?? [];
    const wasEnabled = prevActiveIds.includes(groupId);
    const nextActiveIds = prevActiveIds.filter((x) => x !== groupId);
    const nextGroups = groups
      .filter((x) => x.id !== groupId)
      .map((x) => (x.kind === "custom" ? { ...x, enabled: nextActiveIds.includes(x.id) } : x));

    // keep system state in sync if we removed an enabled group
    if (wasEnabled) {
      try {
        if (nextActiveIds.length === 0) {
          await invoke("disable_group");
        } else {
          await invoke("apply_group", { groupId: "multi", content: buildMergedContent(nextGroups, nextActiveIds) });
        }
      } catch {
        // ignore and still delete local state; user can re-apply later
      }
    }

    if (settings) {
      const nextSettings: Settings = { ...settings, activeGroupIds: nextActiveIds };
      setSettings(nextSettings);
      await saveSettings(nextSettings);
    }
    setGroups(nextGroups);
    await saveGroups(nextGroups);
    if (selectedGroupId === groupId) setSelectedGroupId("current");
  }

  async function onToggleApply(groupId: string, enable: boolean) {
    const g = groups.find((x) => x.id === groupId);
    if (!g || g.kind !== "custom") return;
    if (!settings) return;

    const prevActiveIds = settings.activeGroupIds ?? [];
    const nextActiveIds = enable ? Array.from(new Set([...prevActiveIds, groupId])) : prevActiveIds.filter((x) => x !== groupId);
    const nextSettings: Settings = { ...settings, activeGroupIds: nextActiveIds };
    const nextGroups = groups.map((x) => (x.kind === "custom" ? { ...x, enabled: nextActiveIds.includes(x.id) } : x));

    try {
      if (nextActiveIds.length === 0) {
        const res = await invoke<{ restart_hint?: string }>("disable_group");
        setSaveHint(res?.restart_hint ?? t("disabledHint"));
      } else {
        const res = await invoke<{ restart_hint?: string }>("apply_group", {
          groupId: "multi",
          content: buildMergedContent(nextGroups, nextActiveIds),
        });
        setSaveHint(res?.restart_hint ?? t("appliedHint"));
      }
    } catch (e) {
      setSaveHint(`${enable ? t("applyFailed") : t("disableFailed")}: ${String(e)}`);
      return;
    }

    setSettings(nextSettings);
    setGroups(nextGroups);
    await saveSettings(nextSettings);
    await saveGroups(nextGroups);
    if (saveHintTimer.current != null) window.clearTimeout(saveHintTimer.current);
    saveHintTimer.current = window.setTimeout(() => setSaveHint(null), 1200);
  }

  useEffect(() => {
    if (selectedGroupId === "current") {
      setDraftContent("");
      setIsDirty(false);
      setGroupEditMode(false);
      setGroupFilter("");
      setEditingEnvKey(null);
      setEditingKey("");
      setEditingValue("");
      return;
    }
    const g = groups.find((x) => x.id === selectedGroupId);
    setDraftContent(g?.content ?? "");
    setIsDirty(false);
    setGroupEditMode(false);
    setGroupFilter("");
    setEditingEnvKey(null);
    setEditingKey("");
    setEditingValue("");
  }, [groups, selectedGroupId]);

  const selectedCustomGroup = useMemo(() => {
    if (selectedGroupId === "current") return null;
    const g = groups.find((x) => x.id === selectedGroupId);
    return g && g.kind === "custom" ? g : null;
  }, [groups, selectedGroupId]);

  const selectedGroupVars = useMemo(() => {
    if (!selectedCustomGroup) return [] as EnvVar[];
    const m = parseEnvContent(draftContent);
    const list = Array.from(m.entries()).map(([key, value]) => ({ key, value }));
    const q = groupFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => v.key.toLowerCase().includes(q));
  }, [draftContent, groupFilter, selectedCustomGroup]);

  async function saveSelectedGroupContent(nextContent: string) {
    if (selectedGroupId === "current") return;
    const idx = groups.findIndex((g) => g.id === selectedGroupId);
    if (idx < 0) return;

    const next = [...groups];
    next[idx] = {
      ...next[idx],
      content: nextContent,
      updatedAt: Date.now(),
    };
    setGroups(next);
    await saveGroups(next);
    setIsDirty(false);

    if (saveHintTimer.current != null) {
      window.clearTimeout(saveHintTimer.current);
    }
    setSaveHint(t("savedHint"));
    saveHintTimer.current = window.setTimeout(() => setSaveHint(null), 1200);
  }

  async function saveSelectedGroup() {
    await saveSelectedGroupContent(draftContent);
  }

  async function saveAndApplySelectedGroup() {
    if (selectedGroupId === "current") return;
    const g = groups.find((x) => x.id === selectedGroupId);
    if (!g || g.kind !== "custom") return;
    await saveSelectedGroup();
    await onToggleApply(g.id, true);
  }

  const filteredEnv = useMemo(() => {
    // This calculation can be expensive (parsing + merging). Only compute when the Current panel is visible.
    if (selectedGroupId !== "current") return [] as EnvVar[];
    const base = currentEnv ?? [];
    const baseKeys = base.map((v) => v.key);
    const baseMap = new Map(base.map((v) => [v.key, v.value] as const));

    const enabledGroups = groups.filter((g) => g.kind === "custom" && activeGroupIds.includes(g.id) && g.enabled);
    const overlay = new Map<string, string>();
    for (const g of enabledGroups) {
      const content = selectedGroupId === g.id && isDirty ? draftContent : g.content;
      const m = parseEnvContent(content);
      for (const [k, v] of m.entries()) overlay.set(k, v);
    }

    const overlayKeys = new Set<string>();
    const extraKeys: string[] = [];
    for (const [k, v] of overlay.entries()) {
      overlayKeys.add(k);
      const existed = baseMap.has(k);
      baseMap.set(k, v);
      if (!existed) extraKeys.push(k);
    }

    const list: EnvVar[] = [...baseKeys, ...extraKeys].map((k) => ({ key: k, value: baseMap.get(k) ?? "" }));
    const q = currentFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => v.key.toLowerCase().includes(q));
  }, [activeGroupIds, currentEnv, currentFilter, draftContent, groups, isDirty, selectedGroupId]);

  const activeOverlayInfo = useMemo(() => {
    // Only needed by the Current panel.
    if (selectedGroupId !== "current") return null;
    const enabled = groups.filter((g) => g.kind === "custom" && activeGroupIds.includes(g.id) && g.enabled);
    if (!enabled.length) return null;
    const sourceByKey = new Map<string, string>();
    const names = enabled.map((g) => g.name || t("unnamedGroup"));
    for (const g of enabled) {
      const content = selectedGroupId === g.id && isDirty ? draftContent : g.content;
      const m = parseEnvContent(content);
      for (const k of m.keys()) sourceByKey.set(k, g.name || t("unnamedGroup"));
    }
    return { names, sourceByKey };
  }, [activeGroupIds, draftContent, groups, isDirty, selectedGroupId, t]);

  const availableSourceTabs = useMemo(() => {
    if (!integration) return [] as Array<"zsh" | "bash" | "fish">;
    const out: Array<"zsh" | "bash" | "fish"> = [];
    if (integration.source_zsh) out.push("zsh");
    if (integration.source_bash) out.push("bash");
    if (integration.source_fish) out.push("fish");
    return out;
  }, [integration]);

  useEffect(() => {
    if (!integration) return;
    // pick first available tab
    if (!availableSourceTabs.includes(sourceTab)) {
      setSourceTab(availableSourceTabs[0] ?? "zsh");
    }
  }, [availableSourceTabs, integration, sourceTab]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const update = () => {
      const btn = settingsBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const nextPos = {
        top: Math.round(r.bottom + 10),
        right: Math.round(window.innerWidth - r.right),
      };
      setSettingsPos(nextPos);

      // Align the arrow to the center of the settings button.
      const panelWidth = Math.min(420, Math.round(window.innerWidth * 0.7));
      const panelRightEdge = window.innerWidth - nextPos.right;
      const btnCenterX = r.left + r.width / 2;
      const arrowSize = 10; // matches CSS ::before square
      const raw = panelRightEdge - btnCenterX - arrowSize / 2;
      const clamped = Math.max(16, Math.min(panelWidth - 16, Math.round(raw)));
      setSettingsArrowRight(clamped);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [settingsOpen]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(text);
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopiedKey(null), 900);
    } catch (e) {
      setSaveHint(`${t("error")}: ${String(e)}`);
    } finally {
      if (saveHintTimer.current != null) window.clearTimeout(saveHintTimer.current);
      saveHintTimer.current = window.setTimeout(() => setSaveHint(null), 900);
    }
  }

  async function saveInlineEnvVar(prevKey: string | null, nextKeyRaw: string, nextValue: string) {
    if (!selectedCustomGroup) return;
    const nextKey = nextKeyRaw.trim();
    if (!isValidEnvKey(nextKey)) {
      setSaveHint(`${t("error")}: ${t("invalidEnvKey")}`);
      return;
    }
    // Prevent duplicate keys (except when keeping the same key).
    const existing = parseEnvContent(draftContent);
    if (prevKey !== nextKey && existing.has(nextKey)) {
      setSaveHint(`${t("error")}: ${t("duplicateEnvKey")}`);
      return;
    }

    let nextContent = draftContent;
    if (prevKey && prevKey !== nextKey) {
      nextContent = deleteEnvVarFromContent(nextContent, prevKey);
    }
    nextContent = upsertEnvVarInContent(nextContent, nextKey, nextValue);
    setDraftContent(nextContent);
    setIsDirty(true);
    await saveSelectedGroupContent(nextContent);
    setEditingEnvKey(null);
    setEditingKey("");
    setEditingValue("");
  }

  async function deleteInlineEnvVar(key: string) {
    if (!selectedCustomGroup) return;
    const nextContent = deleteEnvVarFromContent(draftContent, key);
    setDraftContent(nextContent);
    setIsDirty(true);
    await saveSelectedGroupContent(nextContent);
    if (editingEnvKey === key) {
      setEditingEnvKey(null);
      setEditingKey("");
      setEditingValue("");
    }
  }

  return (
    <div className="app">
      <header className="topbar" data-tauri-drag-region>
        <div className="topbar-title" aria-label={t("appName")}>
          {t("appName")}
        </div>

        <div
          className="topbar-spacer"
          onDoubleClick={
            isMac
              ? undefined
              : () => {
                  // Match native titlebar behavior (double click to maximize/restore).
                  void getCurrentWindow().toggleMaximize();
                }
          }
        />
        <div className="popover-wrap">
          <button
            className="icon-only ghost"
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            title={t("settings")}
            aria-label={t("settings")}
            ref={settingsBtnRef}
          >
            <SettingsIcon size={18} />
          </button>
        </div>
        {isMac ? null : <WindowControls />}
      </header>

      {settingsOpen
        ? createPortal(
          <>
            <div className="overlay-backdrop" onMouseDown={() => setSettingsOpen(false)} />
            <div
              className="popover-panel settings-panel"
              role="dialog"
              aria-label={t("settings")}
              style={
                {
                  top: settingsPos.top,
                  right: settingsPos.right,
                  position: "fixed",
                  ["--arrow-right" as any]: `${settingsArrowRight}px`,
                } as React.CSSProperties
              }
            >
              <div className="popover-title">
                <SettingsIcon size={16} />
                <span>{t("settings")}</span>
              </div>

              <div className="popover-section">
                <div className="popover-subtitle">{t("language")}</div>
                <div className="settings-row">
                  <Select
                    ariaLabel={t("language")}
                    value={currentLanguage}
                    options={[
                      { value: "zh-CN", label: "简体中文" },
                      { value: "zh-TW", label: "繁體中文" },
                      { value: "en", label: "English" },
                    ]}
                    onChange={(v) => void onChangeLanguage(v)}
                  />
                </div>
              </div>

              <div className="popover-section">
                <div className="popover-subtitle">{t("theme")}</div>
                <div className="segmented" role="group" aria-label={t("theme")}>
                  {(["system", "light", "dark"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={(settings?.themeMode ?? "system") === mode ? "segmented-btn is-active" : "segmented-btn"}
                      onClick={async () => {
                        if (!settings) return;
                        const nextSettings: Settings = { ...settings, themeMode: mode };
                        setSettings(nextSettings);
                        await saveSettings(nextSettings);
                      }}
                    >
                      {t(mode)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="popover-section">
                <div className="popover-subtitle">{t("font")}</div>
                <div className="settings-row">
                  <Select
                    className="mono"
                    ariaLabel={t("font")}
                    value={(settings?.monoFont ?? "monospace") as string}
                    options={fontOptions}
                    onChange={async (v) => {
                      if (!settings) return;
                      const nextSettings: Settings = { ...settings, monoFont: v };
                      setSettings(nextSettings);
                      await saveSettings(nextSettings);
                    }}
                  />
                </div>
              </div>
            </div>
          </>,
          document.body,
        )
        : null}

      <div className="layout">
        <aside className="sidebar">
          <div className="group-list" role="list">
            {/* Current at top */}
            <div
              className={selectedGroupId === "current" ? "group-row is-active" : "group-row"}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedGroupId("current")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSelectedGroupId("current");
              }}
            >
              <button type="button" className="group-name" onClick={() => setSelectedGroupId("current")}>
                {t("current")}
              </button>
              <span />
            </div>

            {/* Groups header row with New group on the right */}
            <div className="groups-header">
              <div className="sidebar-title">{t("groups")}</div>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setDialogValue("");
                  setNewGroupOpen(true);
                }}
                disabled={dbLoading}
              >
                <Plus size={16} />
                <span>{t("newGroup")}</span>
              </button>
            </div>

            {groups
              .filter((g) => g.kind === "custom")
              .map((g) => (
                <div
                  key={g.id}
                  className={selectedGroupId === g.id ? "group-row is-active" : "group-row"}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedGroupId(g.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedGroupId(g.id);
                  }}
                >
                  <div className="group-left">
                    <button
                      type="button"
                      className={g.enabled ? "check-toggle is-on" : "check-toggle"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onToggleApply(g.id, !g.enabled);
                      }}
                      disabled={dbLoading || !settings}
                      aria-label={g.enabled ? t("disable") : t("apply")}
                      title={g.enabled ? t("disable") : t("apply")}
                    >
                      {g.enabled ? <SquareCheck size={20} /> : <Square size={20} />}
                    </button>

                    {renamingGroupId === g.id ? (
                      <input
                        className="group-rename-input"
                        value={renamingValue}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenamingValue(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Escape") {
                            setRenamingGroupId(null);
                            setRenamingValue("");
                            return;
                          }
                          if (e.key === "Enter") {
                            void commitInlineRename(g.id, renamingValue);
                          }
                        }}
                        onBlur={() => void commitInlineRename(g.id, renamingValue)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="group-name"
                        onClick={() => setSelectedGroupId(g.id)}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRenamingGroupId(g.id);
                          setRenamingValue(g.name);
                        }}
                        title={g.name}
                      >
                        {g.name}
                      </button>
                    )}
                  </div>
                  <div className="group-right">
                    <button
                      className="icon-only ghost danger mini"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteGroupId(g.id);
                      }}
                      title={t("delete")}
                      aria-label={t("delete")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
          </div>

          <div className="sidebar-footer">
            <div className="version mono">{appVersion ? `v${appVersion}` : ""}</div>
            <button className="icon-only ghost" type="button" onClick={onOpenGitHub} aria-label={t("github")} title={t("github")}>
              <Github size={18} />
            </button>
          </div>
        </aside>

        <main className="main">
          <div className="panel">
            {selectedGroupId !== "current" && groupEditMode ? (
              <div className="panel-actions panel-actions-top">
                <span className={isDirty ? "badge warn" : "badge ok"}>{isDirty ? t("unsaved") : t("saved")}</span>
                {saveHint ? <span className="hint">{saveHint}</span> : null}
                <button className="btn secondary" type="button" onClick={() => setGroupEditMode(false)}>
                  {t("done")}
                </button>
                <button className="btn" type="button" onClick={saveSelectedGroup} disabled={!isDirty}>
                  {t("save")}
                </button>
                {groups.find((g) => g.id === selectedGroupId)?.enabled ? (
                  <button className="btn secondary" type="button" onClick={saveAndApplySelectedGroup} disabled={!isDirty}>
                    {t("saveAndApply")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {selectedGroupId === "current" ? (
              <div className="current-panel">
                <div className="current-toolbar">
                  <div className="current-title">
                    {t("envVars")}
                    <span className="muted">
                      {" "}
                      ·{" "}
                      {currentEnvLoading
                        ? t("loading")
                        : currentEnv
                          ? String(filteredEnv.length)
                          : "—"}
                    </span>
                  </div>
                  <div className="current-actions">
                    <label className="search">
                      <Search size={16} />
                      <input
                        className="search-input"
                        value={currentFilter}
                        onChange={(e) => setCurrentFilter(e.currentTarget.value)}
                        placeholder={t("searchPlaceholder")}
                      />
                    </label>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={async () => {
                        const next = !showValues;
                        setShowValues(next);
                        if (settings) {
                          const nextSettings: Settings = { ...settings, hideValuesByDefault: !next };
                          setSettings(nextSettings);
                          await saveSettings(nextSettings);
                        }
                      }}
                    >
                      {showValues ? <EyeOff size={16} /> : <Eye size={16} />}
                      <span className="btn-text">{showValues ? t("hideValues") : t("showValues")}</span>
                    </button>
                    <button className="btn" type="button" onClick={refreshCurrentEnv} disabled={currentEnvLoading}>
                      <RefreshCw size={16} />
                      <span className="btn-text">{t("refresh")}</span>
                    </button>

                    {integration ? (
                      <div className="popover-wrap" ref={sourceWrapRef}>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => setSourceOpen((v) => !v)}
                          aria-expanded={sourceOpen}
                          title={t("source")}
                          aria-label={t("source")}
                        >
                          <Code size={16} />
                          <span className="btn-text">{t("source")}</span>
                        </button>
                        {sourceOpen ? (
                          <div className="popover-panel popover-floating source-panel" role="dialog" aria-label={t("source")}>
                            <div className="popover-title">
                              <Code size={16} />
                              <span>{t("source")}</span>
                            </div>

                            <div className="popover-section">
                              <div className="popover-subtitle">{t("configDir")}</div>
                              <div className="field-with-actions has-two">
                                <code className="popover-code popover-code-scroll" title={integration.ev_dir}>
                                  {integration.ev_dir}
                                </code>
                                <div className="field-actions" aria-label={t("configDir")}>
                                  <button
                                    className={copiedKey === integration.ev_dir ? "field-action-btn success" : "field-action-btn"}
                                    type="button"
                                    onClick={() => copyText(integration.ev_dir)}
                                    aria-label={copiedKey === integration.ev_dir ? t("copied") : t("copyValue")}
                                    title={copiedKey === integration.ev_dir ? t("copied") : t("copyValue")}
                                  >
                                    {copiedKey === integration.ev_dir ? <Check size={16} /> : <Copy size={16} />}
                                  </button>
                                  <button
                                    className="field-action-btn"
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await openPath(integration.ev_dir);
                                      } catch (e) {
                                        try {
                                          await revealItemInDir(integration.reveal_target);
                                        } catch (e2) {
                                          setSaveHint(`${t("error")}: ${String(e2)}`);
                                        }
                                      }
                                    }}
                                    aria-label={t("openDir")}
                                    title={t("openDir")}
                                  >
                                    <FolderOpen size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {availableSourceTabs.length ? (
                              <div className="popover-section">
                                <div className="popover-tabs" role="tablist" aria-label={t("source")}>
                                  {availableSourceTabs.map((tab) => (
                                    <button
                                      key={tab}
                                      type="button"
                                      className={tab === sourceTab ? "popover-tab is-active" : "popover-tab"}
                                      onClick={() => setSourceTab(tab)}
                                      role="tab"
                                      aria-selected={tab === sourceTab}
                                    >
                                      {t(tab)}
                                    </button>
                                  ))}
                                </div>

                                <div className="field-with-actions has-one">
                                  <code className="popover-code popover-code-scroll">
                                    {sourceTab === "zsh"
                                      ? integration.source_zsh
                                      : sourceTab === "bash"
                                        ? integration.source_bash
                                        : integration.source_fish}
                                  </code>
                                  <div className="field-actions" aria-label={t("source")}>
                                    {(() => {
                                      const text =
                                        (sourceTab === "zsh"
                                          ? integration.source_zsh
                                          : sourceTab === "bash"
                                            ? integration.source_bash
                                            : integration.source_fish) ?? "";
                                      const ok = copiedKey === text;
                                      return (
                                        <button
                                          className={ok ? "field-action-btn success" : "field-action-btn"}
                                          type="button"
                                          onClick={() => copyText(text)}
                                          aria-label={ok ? t("copied") : t("copyValue")}
                                          title={ok ? t("copied") : t("copyValue")}
                                        >
                                          {ok ? <Check size={16} /> : <Copy size={16} />}
                                        </button>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="popover-hint">{integration.note}</div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                {saveHint ? <div className="hint">{saveHint}</div> : null}

                {currentEnvError ? (
                  <pre className="placeholder">
                    {t("error")}: {currentEnvError}
                  </pre>
                ) : (
                  <>
                    <div className="env-list" role="list">
                      {filteredEnv.slice(0, 500).map((v) => (
                        <div key={v.key} className="env-item" role="listitem">
                          <div className="env-key" title={v.key}>
                            <span className="env-key-text">{v.key}</span>
                            {(() => {
                              const src = activeOverlayInfo?.sourceByKey.get(v.key);
                              if (!src) return null;
                              return (
                                <span className="badge info" title={t("fromActiveGroup", { name: src })}>
                                  {src}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="env-value" title={showValues ? v.value : ""}>
                            {showValues ? v.value : "••••••"}
                          </div>
                          <div className="env-actions">
                            <button className={copiedKey === v.key ? "mini-btn ghost success" : "mini-btn ghost"} type="button" onClick={() => copyText(v.key)}>
                              {copiedKey === v.key ? <Check size={14} /> : <Copy size={14} />}
                              <span>{copiedKey === v.key ? t("copied") : t("copyKey")}</span>
                            </button>
                            <button
                              className={copiedKey === v.value ? "mini-btn ghost success" : "mini-btn ghost"}
                              type="button"
                              onClick={() => copyText(v.value)}
                              disabled={!showValues}
                            >
                              {copiedKey === v.value ? <Check size={14} /> : <Copy size={14} />}
                              <span>{copiedKey === v.value ? t("copied") : t("copyValue")}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {activeOverlayInfo ? <div className="hint">{t("currentOverlayHint", { name: activeOverlayInfo.names.join(", ") })}</div> : null}
                    {filteredEnv.length > 500 ? (
                      <div className="hint">{t("showingFirstN", { n: 500 })}</div>
                    ) : null}

                  </>
                )}
              </div>
            ) : (
              <>
                {selectedCustomGroup && !groupEditMode ? (
                  <div className="current-panel">
                    <div className="current-toolbar">
                      <div className="current-title group-toolbar-left">
                        <span>{selectedCustomGroup.name}</span>
                        <span className="muted"> · {String(selectedGroupVars.length)}</span>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => {
                            setEditingEnvKey("__new__");
                            setEditingKey("");
                            setEditingValue("");
                          }}
                          title={t("addVar")}
                          aria-label={t("addVar")}
                        >
                          <Plus size={16} />
                          <span>{t("addVar")}</span>
                        </button>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => setGroupEditMode(true)}
                          title={t("batchEdit")}
                          aria-label={t("batchEdit")}
                        >
                          <Code size={16} />
                          <span>{t("batchEdit")}</span>
                        </button>
                      </div>
                      <div className="current-actions">
                        <label className="search">
                          <Search size={16} />
                          <input
                            className="search-input"
                            value={groupFilter}
                            onChange={(e) => setGroupFilter(e.currentTarget.value)}
                            placeholder={t("searchPlaceholder")}
                          />
                        </label>
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={async () => {
                            const next = !showValues;
                            setShowValues(next);
                            if (settings) {
                              const nextSettings: Settings = { ...settings, hideValuesByDefault: !next };
                              setSettings(nextSettings);
                              await saveSettings(nextSettings);
                            }
                          }}
                        >
                          {showValues ? <EyeOff size={16} /> : <Eye size={16} />}
                          <span>{showValues ? t("hideValues") : t("showValues")}</span>
                        </button>
                      </div>
                    </div>

                    {selectedGroupVars.length || editingEnvKey === "__new__" ? (
                      <div className="env-list" role="list">
                        {editingEnvKey === "__new__" ? (
                          <div key="__new__" className="env-item is-editing" role="listitem">
                            <div className="env-key">
                              <input
                                className="env-edit-input mono"
                                value={editingKey}
                                onChange={(e) => setEditingKey(e.currentTarget.value)}
                                placeholder="KEY"
                                autoFocus
                              />
                            </div>
                            <div className="env-value">
                              <input
                                className="env-edit-input mono"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.currentTarget.value)}
                                placeholder="VALUE"
                              />
                            </div>
                            <div className="env-actions">
                              <button className="mini-btn" type="button" onClick={() => void saveInlineEnvVar(null, editingKey, editingValue)}>
                                <Check size={14} />
                                <span>{t("save")}</span>
                              </button>
                              <button
                                className="mini-btn ghost"
                                type="button"
                                onClick={() => {
                                  setEditingEnvKey(null);
                                  setEditingKey("");
                                  setEditingValue("");
                                }}
                              >
                                <span>{t("cancel")}</span>
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {selectedGroupVars.slice(0, 500).map((v) => (
                          <div key={v.key} className={editingEnvKey === v.key ? "env-item is-editing" : "env-item"} role="listitem">
                            <div className="env-key" title={v.key}>
                              {editingEnvKey === v.key ? (
                                <input
                                  className="env-edit-input mono"
                                  value={editingKey}
                                  onChange={(e) => setEditingKey(e.currentTarget.value)}
                                  autoFocus
                                />
                              ) : (
                                <span className="env-key-text">{v.key}</span>
                              )}
                            </div>
                            <div className="env-value" title={showValues ? v.value : ""}>
                              {editingEnvKey === v.key ? (
                                <input
                                  className="env-edit-input mono"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.currentTarget.value)}
                                />
                              ) : showValues ? (
                                v.value
                              ) : (
                                "••••••"
                              )}
                            </div>
                            <div className="env-actions">
                              {editingEnvKey === v.key ? (
                                <>
                                  <button className="mini-btn" type="button" onClick={() => void saveInlineEnvVar(v.key, editingKey, editingValue)}>
                                    <Check size={14} />
                                    <span>{t("save")}</span>
                                  </button>
                                  <button
                                    className="mini-btn ghost"
                                    type="button"
                                    onClick={() => {
                                      setEditingEnvKey(null);
                                      setEditingKey("");
                                      setEditingValue("");
                                    }}
                                  >
                                    <span>{t("cancel")}</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="mini-btn ghost"
                                    type="button"
                                    onClick={() => {
                                      setEditingEnvKey(v.key);
                                      setEditingKey(v.key);
                                      setEditingValue(v.value);
                                    }}
                                  >
                                    <Pencil size={14} />
                                    <span>{t("edit")}</span>
                                  </button>
                                  <button className={copiedKey === v.key ? "mini-btn ghost success" : "mini-btn ghost"} type="button" onClick={() => copyText(v.key)}>
                                    {copiedKey === v.key ? <Check size={14} /> : <Copy size={14} />}
                                    <span>{copiedKey === v.key ? t("copied") : t("copyKey")}</span>
                                  </button>
                                  <button
                                    className={copiedKey === v.value ? "mini-btn ghost success" : "mini-btn ghost"}
                                    type="button"
                                    onClick={() => copyText(v.value)}
                                    disabled={!showValues}
                                  >
                                    {copiedKey === v.value ? <Check size={14} /> : <Copy size={14} />}
                                    <span>{copiedKey === v.value ? t("copied") : t("copyValue")}</span>
                                  </button>
                                  <button className="mini-btn ghost danger" type="button" onClick={() => void deleteInlineEnvVar(v.key)}>
                                    <Trash2 size={14} />
                                    <span>{t("delete")}</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <pre className="placeholder">{t("emptyGroupHint")}</pre>
                    )}
                    {selectedGroupVars.length > 500 ? <div className="hint">{t("showingFirstN", { n: 500 })}</div> : null}
                    {isDirty ? <div className="hint">{t("unsaved")}</div> : null}
                  </div>
                ) : (
                  <Suspense fallback={<pre className="placeholder">{t("loading")}</pre>}>
                    <LazyEnvEditor
                      value={draftContent}
                      isDark={effectiveDark}
                      fontFamily={settings?.monoFont}
                      onChange={(next) => {
                        setDraftContent(next);
                        setIsDirty(true);
                      }}
                      onSave={() => void saveSelectedGroup()}
                    />
                  </Suspense>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* dialogs */}
      <Modal
        open={newGroupOpen}
        title={t("newGroup")}
        onClose={() => setNewGroupOpen(false)}
        footer={
          <>
            <button className="btn secondary" type="button" onClick={() => setNewGroupOpen(false)}>
              {t("cancel")}
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await createGroup(dialogValue);
                setNewGroupOpen(false);
              }}
            >
              {t("ok")}
            </button>
          </>
        }
      >
        <input
          className="modal-input"
          value={dialogValue}
          onChange={(e) => setDialogValue(e.currentTarget.value)}
          placeholder={t("promptNewGroupName")}
          autoFocus
        />
      </Modal>

      <Modal
        open={deleteGroupId != null}
        title={t("delete")}
        onClose={() => setDeleteGroupId(null)}
        footer={
          <>
            <button className="btn secondary" type="button" onClick={() => setDeleteGroupId(null)}>
              {t("cancel")}
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={async () => {
                if (deleteGroupId) await deleteGroup(deleteGroupId);
                setDeleteGroupId(null);
              }}
            >
              {t("ok")}
            </button>
          </>
        }
      >
        <div className="modal-text">
          {(() => {
            const g = groups.find((x) => x.id === deleteGroupId);
            return g ? t("confirmDeleteGroup", { name: g.name }) : "";
          })()}
        </div>
      </Modal>
    </div>
  );
}

export default App;

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false);
  useEffect(() => {
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;
    const onChange = () => setDark(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return dark;
}
