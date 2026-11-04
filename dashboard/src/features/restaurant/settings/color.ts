/** Black or white text, whichever reads better on `hex` (same rule as the public menu). */
export function readableTextOn(hex: string): '#ffffff' | '#1c2420' {
  const [r, g, b] = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.0661 ? '#ffffff' : '#1c2420';
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
