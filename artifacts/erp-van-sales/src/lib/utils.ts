import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  // ALLAL money standard: always two decimals, space grouping, dot decimal, " DZD".
  const safe = Number.isFinite(num) ? num : 0;
  const neg = safe < 0;
  const [intPart, dec] = Math.abs(safe).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${grouped}.${dec} DZD`;
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fr-DZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}
