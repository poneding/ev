import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export type AppLanguage = "en" | "zh-CN" | "zh-TW";

const STORAGE_KEY = "ev.language";

function normalizeLanguage(input: string | null | undefined): AppLanguage {
  const v = (input ?? "").trim();
  if (!v) return "en";

  const lower = v.toLowerCase();
  // Common mappings from browsers/OS.
  if (lower.startsWith("zh-hans")) return "zh-CN";
  if (lower.startsWith("zh-hant")) return "zh-TW";
  if (lower === "zh-cn" || lower.startsWith("zh-cn")) return "zh-CN";
  if (lower === "zh-tw" || lower.startsWith("zh-tw")) return "zh-TW";
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("en")) return "en";
  return "en";
}

export function getInitialLanguage(): AppLanguage {
  if (localStorage.getItem(STORAGE_KEY) != null) {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
  }
  const nav = normalizeLanguage(navigator.languages?.[0] ?? navigator.language);
  return nav;
}

export function persistLanguage(lng: AppLanguage) {
  localStorage.setItem(STORAGE_KEY, lng);
}

void i18n.use(initReactI18next).init({
  fallbackLng: "en",
  lng: getInitialLanguage(),
  interpolation: { escapeValue: false },
  resources: {
    en: {
      translation: {
        appName: "ev",
        groups: "Groups",
        current: "Current",
        newGroup: "New group",
        refresh: "Refresh",
        loading: "Loading…",
        envVars: "Environment variables",
        showValues: "Show values",
        hideValues: "Hide values",
        save: "Save",
        saved: "Saved",
        unsaved: "Unsaved",
        savedHint: "Saved to local store",
        enabled: "Enabled",
        disabled: "Disabled",
        apply: "Apply",
        disable: "Disable",
        appliedHint: "Applied (new terminals needed)",
        disabledHint: "Disabled (new terminals needed)",
        rename: "Rename",
        delete: "Delete",
        confirmDeleteGroup: "Delete group '{{name}}'?",
        renameGroupPrompt: "Rename group",
        applyFailed: "Apply failed",
        disableFailed: "Disable failed",
        search: "Search",
        searchPlaceholder: "Filter by key…",
        copyKey: "Copy key",
        copyValue: "Copy value",
        copied: "Copied",
        active: "Active",
        fromActiveGroup: "From active group: {{name}}",
        currentOverlayHint: "Current includes variables from active group '{{name}}' (overlay).",
        showingFirstN: "Showing first {{n}} items",
        integration: "Integration",
        source: "Source",
        configDir: "Config directory",
        openDir: "Open",
        zsh: "zsh",
        bash: "bash",
        fish: "fish",
        saveAndApply: "Save & apply",
        edit: "Edit",
        done: "Done",
        emptyGroupHint: "No variables yet. Click Edit to add.",
        ok: "OK",
        cancel: "Cancel",
        unnamedGroup: "Untitled",
        promptNewGroupName: "New group name",
        error: "Error",
        editor: "Editor",
        editorPlaceholder: "Select a group on the left.\n\n(Current is read-only and synced from your system environment variables.)",
        github: "GitHub",
        language: "Language",
        settings: "Settings",
        theme: "Theme",
        system: "System",
        light: "Light",
        dark: "Dark",
        font: "Font",
      },
    },
    "zh-CN": {
      translation: {
        appName: "ev",
        groups: "分组",
        current: "Current（当前）",
        newGroup: "新建分组",
        refresh: "刷新",
        loading: "加载中…",
        envVars: "环境变量",
        showValues: "显示值",
        hideValues: "隐藏值",
        save: "保存",
        saved: "已保存",
        unsaved: "未保存",
        savedHint: "已保存到本地",
        enabled: "已生效",
        disabled: "未生效",
        apply: "生效",
        disable: "取消生效",
        appliedHint: "已生效（新终端/应用可见）",
        disabledHint: "已取消（新终端/应用可见）",
        rename: "重命名",
        delete: "删除",
        confirmDeleteGroup: "确认删除分组「{{name}}」？",
        renameGroupPrompt: "重命名分组",
        applyFailed: "生效失败",
        disableFailed: "取消生效失败",
        search: "搜索",
        searchPlaceholder: "按变量名过滤…",
        copyKey: "复制 Key",
        copyValue: "复制 Value",
        copied: "已复制",
        active: "生效中",
        fromActiveGroup: "来自已生效分组：{{name}}",
        currentOverlayHint: "Current 已合并已生效分组「{{name}}」的变量（覆盖同名 Key）。",
        showingFirstN: "仅显示前 {{n}} 条",
        integration: "集成",
        source: "Source",
        configDir: "配置目录",
        openDir: "打开",
        zsh: "zsh",
        bash: "bash",
        fish: "fish",
        saveAndApply: "保存并生效",
        edit: "编辑",
        done: "完成",
        emptyGroupHint: "暂无变量，点击「编辑」添加。",
        ok: "确定",
        cancel: "取消",
        unnamedGroup: "未命名",
        promptNewGroupName: "新分组名称",
        error: "错误",
        editor: "编辑",
        editorPlaceholder: "在左侧选择一个分组。\n\n（Current 分组只读，用于同步当前环境变量。）",
        github: "GitHub",
        language: "语言",
        settings: "设置",
        theme: "主题",
        system: "跟随系统",
        light: "浅色",
        dark: "深色",
        font: "字体",
      },
    },
    "zh-TW": {
      translation: {
        appName: "ev",
        groups: "群組",
        current: "Current（目前）",
        newGroup: "新增群組",
        refresh: "重新整理",
        loading: "載入中…",
        envVars: "環境變數",
        showValues: "顯示值",
        hideValues: "隱藏值",
        save: "儲存",
        saved: "已儲存",
        unsaved: "未儲存",
        savedHint: "已儲存到本機",
        enabled: "已生效",
        disabled: "未生效",
        apply: "生效",
        disable: "取消生效",
        appliedHint: "已生效（新終端/應用可見）",
        disabledHint: "已取消（新終端/應用可見）",
        rename: "重新命名",
        delete: "刪除",
        confirmDeleteGroup: "確認刪除群組「{{name}}」？",
        renameGroupPrompt: "重新命名群組",
        applyFailed: "生效失敗",
        disableFailed: "取消生效失敗",
        search: "搜尋",
        searchPlaceholder: "依變數名稱篩選…",
        copyKey: "複製 Key",
        copyValue: "複製 Value",
        copied: "已複製",
        active: "生效中",
        fromActiveGroup: "來自已生效群組：{{name}}",
        currentOverlayHint: "Current 已合併已生效群組「{{name}}」的變數（覆蓋同名 Key）。",
        showingFirstN: "僅顯示前 {{n}} 筆",
        integration: "整合",
        source: "Source",
        configDir: "設定目錄",
        openDir: "打開",
        zsh: "zsh",
        bash: "bash",
        fish: "fish",
        saveAndApply: "儲存並生效",
        edit: "編輯",
        done: "完成",
        emptyGroupHint: "尚無變數，點擊「編輯」新增。",
        ok: "確定",
        cancel: "取消",
        unnamedGroup: "未命名",
        promptNewGroupName: "新群組名稱",
        error: "錯誤",
        editor: "編輯",
        editorPlaceholder: "在左側選擇一個群組。\n\n（Current 群組唯讀，用於同步目前環境變數。）",
        github: "GitHub",
        language: "語言",
        settings: "設定",
        theme: "主題",
        system: "跟隨系統",
        light: "淺色",
        dark: "深色",
        font: "字體",
      },
    },
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;


