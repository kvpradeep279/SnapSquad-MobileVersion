/**
 * Plexida Mockup Theme — Typography
 * 
 * Exact fonts matching Plexida_full_mockup.html
 */

export const fontFamily = {
  // Brand / Headings (Mapped to Inter)
  syneRegular: 'Inter_400Regular',
  syneSemiBold: 'Inter_600SemiBold',
  syneBold: 'Inter_700Bold',
  syneExtraBold: 'Inter_800ExtraBold',

  // Body / UI (Mapped to Inter)
  dmSansLight: 'Inter_300Light',
  dmSansRegular: 'Inter_400Regular',
  dmSansMedium: 'Inter_500Medium',
  
  // Fallbacks used during font loading
  fallbackSans: 'sans-serif',
};

// Aliases for easier use in generic components
// Keeping original signatures to avoid refactoring 100s of files, but mapping all to Inter
export const getFont = (family: 'Syne' | 'DMSans' | 'Inter', weight: '300' | '400' | '500' | '600' | '700' | '800') => {
  switch (weight) {
    case '300': return fontFamily.dmSansLight;
    case '400': return fontFamily.syneRegular;
    case '500': return fontFamily.dmSansMedium;
    case '600': return fontFamily.syneSemiBold;
    case '700': return fontFamily.syneBold;
    case '800': return fontFamily.syneExtraBold;
    default: return fontFamily.syneRegular;
  }
};

export const fontSize = {
  xs: 10,
  sm: 11,
  base: 13,
  md: 15,
  lg: 18,
  xl: 22,
  '2xl': 26,
  '3xl': 28, // "Every face."
};
