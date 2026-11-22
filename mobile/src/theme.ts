export const colors = {
  // Identidade visual oficial da SPA Splash (frontend/src/App.css).
  brand: '#7861F9',
  brandDark: '#624CDE',
  ink: '#1B2540',
  muted: '#79829A',
  background: '#F7F8FC',
  surface: '#FFFFFF',
  line: '#E9EAF2',
  pale: '#EFEAFF',
  danger: '#C93748',
  warning: '#D48B26',
  navy: '#24184E',
  white: '#FFFFFF',
} as const;

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 28 } as const;

export const shadows = {
  card: { shadowColor: '#291D51', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 4 }, shadowRadius: 16, elevation: 2 },
};
