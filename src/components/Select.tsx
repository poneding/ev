import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
};

export function Select<T extends string>(props: {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const current = useMemo(
    () => props.options.find((o) => o.value === props.value) ?? props.options[0],
    [props.options, props.value],
  );

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={props.className ? `ui-select ${props.className}` : "ui-select"} ref={wrapRef}>
      <button
        type="button"
        className="ui-select-btn"
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <span className="ui-select-label">{current?.label ?? ""}</span>
        <ChevronDown size={16} />
      </button>

      {open ? (
        <div className="ui-select-menu" role="listbox" aria-label={props.ariaLabel}>
          {props.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === props.value}
              className={opt.value === props.value ? "ui-select-item is-selected" : "ui-select-item"}
              onClick={() => {
                props.onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default Select;


