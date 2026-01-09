import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useCallback } from "react";

export function WindowControls() {
  const onMinimize = useCallback(() => {
    void getCurrentWindow().minimize();
  }, []);

  const onToggleMaximize = useCallback(() => {
    void getCurrentWindow().toggleMaximize();
  }, []);

  const onClose = useCallback(() => {
    void getCurrentWindow().close();
  }, []);

  return (
    <div className="window-controls" aria-label="Window controls">
      <button className="window-control-btn" type="button" onClick={onMinimize} aria-label="Minimize" title="Minimize">
        <Minus size={16} />
      </button>
      <button
        className="window-control-btn"
        type="button"
        onClick={onToggleMaximize}
        aria-label="Toggle maximize"
        title="Toggle maximize"
      >
        <Square size={14} />
      </button>
      <button className="window-control-btn danger" type="button" onClick={onClose} aria-label="Close" title="Close">
        <X size={16} />
      </button>
    </div>
  );
}

