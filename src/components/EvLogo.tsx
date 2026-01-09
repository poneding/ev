export function EvLogo(props: { size?: number; title?: string }) {
  const size = props.size ?? 22;
  const title = props.title ?? "ev";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        {/* Accent gradient (fits the current blue theme). */}
        <linearGradient id="ev-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="1" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Outer mark */}
      <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.6" />

      {/* Inner "toggle" + "env" idea: a slider track with a knob, and two small bars */}
      <rect x="6.3" y="7.4" width="11.4" height="3.1" rx="1.55" fill="url(#ev-accent)" opacity="0.95" />
      <circle cx="14.9" cy="8.95" r="1.55" fill="#ffffff" opacity="0.92" />

      <rect x="6.3" y="13.3" width="7.4" height="1.8" rx="0.9" fill="currentColor" opacity="0.72" />
      <rect x="6.3" y="16.0" width="11.4" height="1.8" rx="0.9" fill="currentColor" opacity="0.50" />
    </svg>
  );
}


