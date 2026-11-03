export const colors = {
  brand: '#00AFA3',
  brandDark: '#007F79',
  ink: '#14263F',
  muted: '#728097',
  background: '#F5F7FB',
  surface: '#FFFFFF',
  line: '#E6EBF2',
  pale: '#E8F8F5',
  danger: '#C93748',
  warning: '#D48B26',
  navy: '#132944',
  white: '#FFFFFF',
} as const;

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 28 } as const;

export const shadows = {
  card: { shadowColor: '#162A45', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 4 }, shadowRadius: 16, elevation: 2 },
};
