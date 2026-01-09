import { Store } from "@tauri-apps/plugin-store";

export type GroupKind = "current" | "custom";

export type EnvGroup = {
  id: string;
  name: string;
  kind: GroupKind;
  enabled: boolean;
  format: "dotenv";
  content: string;
  updatedAt: number;
};

export type Settings = {
  language: "en" | "zh-CN" | "zh-TW";
  hideValuesByDefault: boolean;
  activeGroupIds: string[];
  themeMode: "system" | "light" | "dark";
  monoFont: string;
};

type DbShape = {
  settings: Settings;
  groups: EnvGroup[];
};

const DEFAULTS: DbShape = {
  settings: {
    language: "en",
    hideValuesByDefault: true,
    activeGroupIds: [],
    themeMode: "system",
    monoFont:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  groups: [
    {
      id: "current",
      name: "Current",
      kind: "current",
      enabled: false,
      format: "dotenv",
      content: "",
      updatedAt: Date.now(),
    },
  ],
};

let _store: Store | null = null;

export async function getEvStore(): Promise<Store> {
  if (_store) return _store;
  _store = await Store.load("ev.json", {
    defaults: DEFAULTS,
    autoSave: true,
  });
  return _store;
}

export async function loadDb(): Promise<DbShape> {
  const store = await getEvStore();
  const storedSettings = ((await store.get<Record<string, unknown>>("settings")) ?? {}) as Record<string, unknown>;

  // Back-compat: older versions stored a single activeGroupId.
  const activeGroupIdsRaw =
    (storedSettings.activeGroupIds as unknown) ??
    (typeof storedSettings.activeGroupId === "string" && storedSettings.activeGroupId ? [storedSettings.activeGroupId] : []);
  const activeGroupIds = Array.isArray(activeGroupIdsRaw)
    ? activeGroupIdsRaw.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  const settings: Settings = {
    ...DEFAULTS.settings,
    ...(storedSettings as Partial<Settings>),
    activeGroupIds,
  };
  const groups = (await store.get<EnvGroup[]>("groups")) ?? DEFAULTS.groups;
  return { settings, groups };
}

export async function saveGroups(groups: EnvGroup[]) {
  const store = await getEvStore();
  await store.set("groups", groups);
}

export async function saveSettings(settings: Settings) {
  const store = await getEvStore();
  await store.set("settings", settings);
}


