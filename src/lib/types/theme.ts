export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  hitPerfect: string;
  hitGood: string;
  hitEarly: string;
  hitLate: string;
  hitMiss: string;
  padColors: string[];
}

export interface ThemeEffects {
  glowEnabled: boolean;
  gradientBackground: boolean;
  animationIntensity: "none" | "reduced" | "full";
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  effects: ThemeEffects;
}

export type ThemeId = "dark" | "vibrant" | "minimal";
