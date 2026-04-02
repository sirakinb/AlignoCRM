import type { DealStatus } from "@/types/crm";

export const ALIGNO_PURPLE_SCALE = [
  "#B97AF6",
  "#9E57EA",
  "#8640D6",
  "#6E2ABD",
  "#581A99",
  "#44106F",
] as const;

export function getPurpleScaleColor(index: number): string {
  const normalizedIndex =
    ((index % ALIGNO_PURPLE_SCALE.length) + ALIGNO_PURPLE_SCALE.length) %
    ALIGNO_PURPLE_SCALE.length;

  return ALIGNO_PURPLE_SCALE[normalizedIndex];
}

export function getStringPurpleColor(value: string): string {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return getPurpleScaleColor(hash);
}

export function getStatusPurple(status: DealStatus): string {
  switch (status) {
    case "won":
      return "#44106F";
    case "lost":
      return "#9E57EA";
    case "open":
    default:
      return "#6E2ABD";
  }
}

export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
