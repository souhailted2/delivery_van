import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("fr-DZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num) + " DZD";
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fr-DZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}
