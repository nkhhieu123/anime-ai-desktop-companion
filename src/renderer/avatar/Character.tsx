/**
 * Default companion: an original chibi-style anime girl drawn as inline SVG
 * (no external assets, CSP-friendly). Animated with CSS: idle breathing,
 * periodic blinking and a slight hair sway. Stage 7 adds swappable character
 * packs; this component stays as the built-in fallback.
 */
export function Character() {
  return (
    <svg className="character" viewBox="0 0 200 280" role="img" aria-label="Companion">
      <defs>
        <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6a6c9" />
          <stop offset="1" stopColor="#d9709f" />
        </linearGradient>
        <linearGradient id="dress" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6c7cf0" />
          <stop offset="1" stopColor="#4a55c4" />
        </linearGradient>
        <radialGradient id="iris" cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#8fe3ff" />
          <stop offset="0.6" stopColor="#3b8fd9" />
          <stop offset="1" stopColor="#1f4f9a" />
        </radialGradient>
        <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="268" rx="52" ry="8" fill="url(#shadow)" />

      <g className="character-body">
        {/* Back hair / twin tails */}
        <g className="hair-sway">
          <path d="M44 92 C18 130 22 190 40 214 C46 186 50 150 58 120 Z" fill="url(#hair)" />
          <path d="M156 92 C182 130 178 190 160 214 C154 186 150 150 142 120 Z" fill="url(#hair)" />
        </g>
        <path d="M50 70 C50 30 150 30 150 70 L156 150 C130 160 70 160 44 150 Z" fill="url(#hair)" />

        {/* Legs */}
        <rect x="82" y="226" width="12" height="34" rx="6" fill="#ffe3d3" />
        <rect x="106" y="226" width="12" height="34" rx="6" fill="#ffe3d3" />
        <ellipse cx="88" cy="261" rx="10" ry="5" fill="#3a3550" />
        <ellipse cx="112" cy="261" rx="10" ry="5" fill="#3a3550" />

        {/* Dress */}
        <path d="M74 160 L126 160 L146 232 C120 240 80 240 54 232 Z" fill="url(#dress)" />
        <path d="M74 160 L100 182 L126 160 Z" fill="#fff" />
        <path d="M94 172 L100 186 L106 172 L100 168 Z" fill="#ff6f9f" />
        <path d="M58 226 C80 234 120 234 142 226" stroke="#fff" strokeWidth="3" fill="none" opacity="0.8" />

        {/* Arms */}
        <path d="M76 166 C62 180 58 198 62 212" stroke="#ffe3d3" strokeWidth="11" strokeLinecap="round" fill="none" />
        <path d="M124 166 C138 180 142 198 138 212" stroke="#ffe3d3" strokeWidth="11" strokeLinecap="round" fill="none" />

        {/* Neck + head */}
        <rect x="92" y="146" width="16" height="18" rx="6" fill="#f8d2c0" />
        <ellipse cx="100" cy="104" rx="50" ry="48" fill="#ffe7da" />

        {/* Bangs */}
        <path
          d="M50 100 C48 60 70 44 100 44 C130 44 152 60 150 100 C142 84 134 76 126 72 C124 84 118 90 110 94 C110 82 104 76 98 72 C94 84 84 92 72 94 C76 86 76 80 74 74 C64 80 56 90 50 100 Z"
          fill="url(#hair)"
        />
        <path d="M70 52 C80 46 92 44 102 46" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.5" fill="none" />

        {/* Hair ribbons */}
        <path d="M44 74 L30 62 L32 84 Z M44 74 L58 62 L56 84 Z" fill="#ff6f9f" />
        <circle cx="44" cy="74" r="5" fill="#ff8fb5" />
        <path d="M156 74 L142 62 L144 84 Z M156 74 L170 62 L168 84 Z" fill="#ff6f9f" />
        <circle cx="156" cy="74" r="5" fill="#ff8fb5" />

        {/* Eyes */}
        <g className="eyes">
          <g>
            <ellipse cx="80" cy="112" rx="11" ry="14" fill="#fff" />
            <ellipse cx="80" cy="114" rx="9" ry="12" fill="url(#iris)" />
            <circle cx="80" cy="115" r="4.5" fill="#173a73" />
            <circle cx="76" cy="108" r="3.6" fill="#fff" />
            <circle cx="84" cy="119" r="1.6" fill="#fff" />
          </g>
          <g>
            <ellipse cx="120" cy="112" rx="11" ry="14" fill="#fff" />
            <ellipse cx="120" cy="114" rx="9" ry="12" fill="url(#iris)" />
            <circle cx="120" cy="115" r="4.5" fill="#173a73" />
            <circle cx="116" cy="108" r="3.6" fill="#fff" />
            <circle cx="124" cy="119" r="1.6" fill="#fff" />
          </g>
        </g>
        <path d="M67 99 C73 94 85 94 92 99" stroke="#5a3048" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M108 99 C115 94 127 94 133 99" stroke="#5a3048" strokeWidth="3" strokeLinecap="round" fill="none" />

        {/* Blush + mouth */}
        <ellipse cx="68" cy="130" rx="8" ry="4" fill="#ff9fb8" opacity="0.6" />
        <ellipse cx="132" cy="130" rx="8" ry="4" fill="#ff9fb8" opacity="0.6" />
        <path d="M94 133 Q100 139 106 133" stroke="#a24a62" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}
