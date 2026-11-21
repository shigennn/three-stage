// Icons for small buttons. They use the text color (currentColor).

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg className="icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const EyeIcon = () => (
  <Svg>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);

export const EyeOffIcon = () => (
  <Svg>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
    <path d="M2.5 13.5l11-11" />
  </Svg>
);

export const LockIcon = () => (
  <Svg>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Svg>
);

export const UnlockIcon = () => (
  <Svg>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1" />
  </Svg>
);

export const EyedropperIcon = () => (
  <Svg>
    <path d="M10.5 2.5l3 3-1.5 1.5-3-3z" />
    <path d="M9 4l3 3-6.5 6.5H2.5v-3z" />
  </Svg>
);

export const FullscreenIcon = () => (
  <Svg>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </Svg>
);
