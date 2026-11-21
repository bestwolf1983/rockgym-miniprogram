/* 由 design/tokens.json 生成，请勿手改。改动请跑 pnpm design:build */
export const tokens = {
  color: {
    'primary': "#2FC4A7",
    'primary-strong': "#1FA98F",
    'primary-soft': "#E6F8F4",
    'accent': "#F2C078",
    'accent-soft': "#FDF4E6",
    'pass': "#22C55E",
    'pass-soft': "#EAFBF0",
    'pass-ink': "#128A3E",
    'warn': "#F59E0B",
    'warn-soft': "#FEF6E7",
    'warn-ink': "#A9670A",
    'block': "#F04E4E",
    'block-soft': "#FDECEC",
    'block-ink': "#C22E2E",
    'accent-ink': "#8A5A12",
    'bg': "#F5FAF9",
    'surface': "#FFFFFF",
    'surface-sunken': "#F0F6F5",
    'line': "#E8EFED",
    'text-1': "#16211F",
    'text-2': "#5B6B68",
    'text-3': "#93A29F",
    'text-inverse': "#FFFFFF",
    'accent-strong': "#E0A24E",
  },
  font: {
    'display': 56,
    'h1': 40,
    'h2': 34,
    'body': 28,
    'sub': 26,
    'cap': 22,
  },
  space: {
    '1': 8,
    '2': 12,
    '3': 16,
    '4': 24,
    '5': 32,
    '6': 48,
  },
  radius: {
    'sm': 12,
    'md': 20,
    'lg': 28,
    'xl': 40,
    'full': 999,
  },
  shadow: {
    'card': "0 4rpx 20rpx rgba(22, 33, 31, 0.04)",
    'rise': "0 8rpx 32rpx rgba(47, 196, 167, 0.18)",
    'float': "0 12rpx 40rpx rgba(22, 33, 31, 0.10)",
  },
  motion: {
    'fast': "160ms",
    'base': "240ms",
    'slow': "320ms",
    'ease': "cubic-bezier(.2,.8,.2,1)",
  },
} as const;

export type ColorToken = keyof typeof tokens.color;

/** rpx → px，用于 canvas 等需要真实像素的场景 */
export function rpx2px(rpx: number): number {
  const { windowWidth } = wx.getWindowInfo();
  return (rpx * windowWidth) / 750;
}
