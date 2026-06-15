import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export { formatCertificateUsageLabel, downloadFile } from '@/lib/cert-utils';
export { setCookie, getCookie } from '@/lib/cookies';
