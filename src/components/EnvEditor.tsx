import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useRef } from "react";

// NOTE: this import wires Monaco workers for Vite.
// Keep it inside this dynamically-loaded module to avoid pulling Monaco into the initial bundle.
import "../monaco";

export function EnvEditor(props: {
  value: string;
  onChange: (next: string) => void;
  isDark: boolean;
  onSave: () => void;
  fontFamily?: string;
}) {
  const theme = useMemo(() => (props.isDark ? "vs-dark" : "vs"), [props.isDark]);
  const onSaveRef = useRef(props.onSave);
  useEffect(() => {
    onSaveRef.current = props.onSave;
  }, [props.onSave]);

  return (
    <Editor
      height="100%"
      language="ini"
      value={props.value}
      theme={theme}
      onChange={(v) => props.onChange(v ?? "")}
      onMount={(editor, monaco) => {
        // Cmd+S / Ctrl+S: save (and prevent the WebView default "save page" behavior).
        editor.addAction({
          id: "ev.save",
          label: "Save",
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
          run: () => {
            onSaveRef.current();
            return;
          },
        });
        editor.onKeyDown((e) => {
          if ((e.metaKey || e.ctrlKey) && e.keyCode === monaco.KeyCode.KeyS) {
            e.preventDefault();
            onSaveRef.current();
          }
        });
      }}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: props.fontFamily,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
        padding: { top: 12, bottom: 12 },
      }}
    />
  );
}

export default EnvEditor;


