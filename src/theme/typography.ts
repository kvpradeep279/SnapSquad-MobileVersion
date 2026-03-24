/**
 * SnapSquad Mockup Theme — Typography
 * 
 * Exact fonts matching snapsquad_full_mockup.html
 */

export const fontFamily = {
  // Brand / Headings
  syneRegular: 'Syne_400Regular',
  syneSemiBold: 'Syne_600SemiBold',
  syneBold: 'Syne_700Bold',
  syneExtraBold: 'Syne_800ExtraBold',

  // Body / UI
  dmSansLight: 'DMSans_300Light',
  dmSansRegular: 'DMSans_400Regular',
  dmSansMedium: 'DMSans_500Medium',
  
  // Fallbacks used during font loading
  fallbackSans: 'sans-serif',
};

// Aliases for easier use in generic components
export const getFont = (family: 'Syne' | 'DMSans', weight: '400' | '500' | '600' | '700' | '800') => {
  if (family === 'Syne') {
    switch (weight) {
      case '400': return fontFamily.syneRegular;
      case '600': return fontFamily.syneSemiBold;
      case '700': return fontFamily.syneBold;
      case '800': return fontFamily.syneExtraBold;
      default: return fontFamily.syneRegular;
    }
  } else {
    switch (weight) {
      case '400': return fontFamily.dmSansRegular;
      case '500': return fontFamily.dmSansMedium;
      default: return fontFamily.dmSansRegular;
    }
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
