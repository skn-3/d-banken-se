import { useId } from "react";

export function Smaarty({ size = 96, className = "" }: { size?: number; className?: string }) {
  const uid = useId().replace(/[:]/g, "");
  const bodyId = `smBody-${uid}`;
  const leafId = `smLeaf-${uid}`;
  const armId = `smArm-${uid}`;

  return (
    <div className={`smaarty-float inline-block ${className}`} style={{ width: size, height: size }}>
      <svg className="smaarty" viewBox="0 0 220 230" fill="none" aria-hidden="true" width="100%" height="100%">
        <defs>
          <radialGradient id={bodyId} cx="40%" cy="32%" r="74%">
            <stop offset="0%" stopColor="#93D6B0" />
            <stop offset="52%" stopColor="#50B07F" />
            <stop offset="100%" stopColor="#369A65" />
          </radialGradient>
          <linearGradient id={leafId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#74CB97" />
            <stop offset="100%" stopColor="#2E8B57" />
          </linearGradient>
          <linearGradient id={armId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3CA171" />
            <stop offset="100%" stopColor="#2A8351" />
          </linearGradient>
        </defs>
        <ellipse cx="110" cy="212" rx="48" ry="8" fill="#0B3D2E" opacity=".07" />
        <ellipse cx="52" cy="162" rx="17" ry="11" fill={`url(#${armId})`} transform="rotate(26 52 162)" />
        <ellipse cx="168" cy="162" rx="17" ry="11" fill={`url(#${armId})`} transform="rotate(-26 168 162)" />
        <ellipse cx="110" cy="142" rx="61" ry="57" fill={`url(#${bodyId})`} />
        <path d="M55 158 A61 57 0 0 0 165 158 A61 57 0 0 1 55 158Z" fill="#2A8351" opacity=".22" />
        <ellipse cx="86" cy="114" rx="25" ry="16" fill="#fff" opacity=".22" />
        <path d="M110 90 C110 74 110 64 110 56" stroke="#2E8B57" strokeWidth="6.5" strokeLinecap="round" />
        <path d="M110 70 C100 57 83 57 73 66 C81 81 101 80 110 70Z" fill={`url(#${leafId})`} />
        <path d="M110 70 C120 57 137 57 147 66 C139 81 119 80 110 70Z" fill={`url(#${leafId})`} />
        <path d="M110 70 C108 64 106 60 102 57" stroke="#2E8B57" strokeWidth="1.4" strokeLinecap="round" opacity=".5" />
        <path d="M110 70 C112 64 114 60 118 57" stroke="#2E8B57" strokeWidth="1.4" strokeLinecap="round" opacity=".5" />
        <ellipse cx="80" cy="152" rx="12" ry="7.5" fill="#F4A86A" opacity=".68" />
        <ellipse cx="140" cy="152" rx="12" ry="7.5" fill="#F4A86A" opacity=".68" />
        <g className="smaarty-eye">
          <ellipse cx="90" cy="135" rx="11" ry="13.5" fill="#fff" />
          <circle cx="91" cy="138" r="7" fill="#4A2E1A" />
          <circle cx="93.6" cy="134" r="2.6" fill="#fff" />
        </g>
        <g className="smaarty-eye">
          <ellipse cx="130" cy="135" rx="11" ry="13.5" fill="#fff" />
          <circle cx="131" cy="138" r="7" fill="#4A2E1A" />
          <circle cx="133.6" cy="134" r="2.6" fill="#fff" />
        </g>
        <path d="M99 156 Q110 166 121 156" stroke="#0B3D2E" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}
