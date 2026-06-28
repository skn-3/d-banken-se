export function Smaarty({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`smaarty-float ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="smaartyBody" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#5FD39B" />
          <stop offset="100%" stopColor="#1E9E6A" />
        </radialGradient>
        <radialGradient id="smaartyCheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FBE3C0" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FBE3C0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* leaf sprout on head */}
      <path d="M60 18 C 54 8, 44 8, 42 14 C 44 22, 54 24, 60 22 Z" fill="#7BD3A2" />
      <path d="M60 18 C 66 8, 76 8, 78 14 C 76 22, 66 24, 60 22 Z" fill="#5FBF87" />
      <rect x="58.5" y="18" width="3" height="10" rx="1.5" fill="#3E8C5E" />

      {/* body */}
      <ellipse cx="60" cy="70" rx="38" ry="36" fill="url(#smaartyBody)" />

      {/* cheeks */}
      <ellipse cx="38" cy="76" rx="9" ry="6" fill="url(#smaartyCheek)" />
      <ellipse cx="82" cy="76" rx="9" ry="6" fill="url(#smaartyCheek)" />

      {/* eyes */}
      <ellipse className="smaarty-eye" cx="48" cy="64" rx="4.5" ry="6" fill="#0B3D2E" />
      <ellipse className="smaarty-eye" cx="72" cy="64" rx="4.5" ry="6" fill="#0B3D2E" />
      <circle cx="49.5" cy="62" r="1.6" fill="#fff" />
      <circle cx="73.5" cy="62" r="1.6" fill="#fff" />

      {/* smile */}
      <path d="M50 80 Q 60 88, 70 80" stroke="#0B3D2E" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
