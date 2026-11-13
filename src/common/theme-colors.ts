export interface ThemePalette {
  primary: string;
  accent: string;
  textColor?: string;
  backgroundHint?: string;
}

export const THEME_PALETTES: Record<string, ThemePalette> = {
  celebration: {
    primary: '#F59E0B', // Amber / Gold
    accent: '#EC4899',  // Pink
    textColor: '#FFFFFF',
    backgroundHint: 'warm glow'
  },
  birthday: {
    primary: '#F59E0B', // Bright Gold
    accent: '#A855F7',  // Vibrant Purple
    textColor: '#FFFFFF',
    backgroundHint: 'festive glow'
  },
  urgency: {
    primary: '#EF4444', // Red
    accent: '#F97316',  // Orange
    textColor: '#FFFFFF',
    backgroundHint: 'intense'
  },
  success: {
    primary: '#10B981', // Emerald Green
    accent: '#06B6D4',  // Cyan
    textColor: '#FFFFFF',
    backgroundHint: 'positive'
  },
  tech: {
    primary: '#3B82F6', // Tech Blue
    accent: '#8B5CF6',  // Purple / Violet
    textColor: '#FFFFFF',
    backgroundHint: 'digital'
  },
  luxury: {
    primary: '#EAB308', // Champagne Gold
    accent: '#F8FAFC',  // Bright Platinum
    textColor: '#FFFFFF',
    backgroundHint: 'dark metallic'
  },
  brand: {
    primary: '#C92A2A', // Staff India Red
    accent: '#1E293B',  // Slate Dark
    textColor: '#FFFFFF',
    backgroundHint: 'corporate'
  }
};

export function detectTheme(prompt: string): string | null {
  const p = prompt.toLowerCase();
  if (/\bbirthday\b|\bb-day\b/i.test(p)) return 'birthday';
  if (/\bcelebrat|\banniversary|\bcongratulat|\bparty|\bcongrats|\bfestiv|\bcheer/i.test(p)) return 'celebration';
  if (/\burgent|\bwarning|\balert|\bcritical|\bhurry|\bdeadline|\bdanger|\berror/i.test(p)) return 'urgency';
  if (/\bsuccess|\bwin\b|\bgrow|\bprofit|\bachieve|\bcomplete|\bpassed|\bboost/i.test(p)) return 'success';
  if (/\btech\b|\bsaas\b|\bsoftware|\bcloud|\bcode|\bai\b|\bcyber|\bdata/i.test(p)) return 'tech';
  if (/\bluxury|\bpremium|\bplatinum|\belegant|\bwealth|\bgolden\b/i.test(p)) return 'luxury';
  return null;
}

export function resolvePalette(themeOrPrompt: string, brandColors?: Record<string, string>): ThemePalette {
  if (brandColors?.primary) {
    return {
      primary: brandColors.primary,
      accent: brandColors.accent || '#1E293B',
      textColor: brandColors.text || '#FFFFFF'
    };
  }
  const theme = THEME_PALETTES[themeOrPrompt] ? themeOrPrompt : detectTheme(themeOrPrompt);
  if (theme && THEME_PALETTES[theme]) {
    return THEME_PALETTES[theme];
  }
  // Default fallback (Staff India / neutral punch)
  return THEME_PALETTES.brand;
}

