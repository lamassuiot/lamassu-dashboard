export type PageSearchAccent =
  | "general"
  | "kms"
  | "pki"
  | "iot"
  | "ota"
  | "jobs"
  | "notifications"
  | "tools"
  | "security";

export const accentStyles: Record<PageSearchAccent, {
  row: string;
  rowSelected: string;
  icon: string;
  iconSelected: string;
  marker: string;
}> = {
  general: {
    row: "hover:bg-page-search-general/5",
    rowSelected: "bg-page-search-general/10",
    icon: "border-page-search-general/20 bg-page-search-general/10 text-page-search-general",
    iconSelected: "border-page-search-general/30 bg-page-search-general/15",
    marker: "bg-page-search-general",
  },
  kms: {
    row: "hover:bg-page-search-kms/5",
    rowSelected: "bg-page-search-kms/10",
    icon: "border-page-search-kms/20 bg-page-search-kms/10 text-page-search-kms",
    iconSelected: "border-page-search-kms/30 bg-page-search-kms/15",
    marker: "bg-page-search-kms",
  },
  pki: {
    row: "hover:bg-page-search-pki/5",
    rowSelected: "bg-page-search-pki/10",
    icon: "border-page-search-pki/20 bg-page-search-pki/10 text-page-search-pki",
    iconSelected: "border-page-search-pki/30 bg-page-search-pki/15",
    marker: "bg-page-search-pki",
  },
  iot: {
    row: "hover:bg-page-search-iot/5",
    rowSelected: "bg-page-search-iot/10",
    icon: "border-page-search-iot/20 bg-page-search-iot/10 text-page-search-iot",
    iconSelected: "border-page-search-iot/30 bg-page-search-iot/15",
    marker: "bg-page-search-iot",
  },
  ota: {
    row: "hover:bg-page-search-ota/5",
    rowSelected: "bg-page-search-ota/10",
    icon: "border-page-search-ota/20 bg-page-search-ota/10 text-page-search-ota",
    iconSelected: "border-page-search-ota/30 bg-page-search-ota/15",
    marker: "bg-page-search-ota",
  },
  jobs: {
    row: "hover:bg-page-search-jobs/5",
    rowSelected: "bg-page-search-jobs/10",
    icon: "border-page-search-jobs/20 bg-page-search-jobs/10 text-page-search-jobs",
    iconSelected: "border-page-search-jobs/30 bg-page-search-jobs/15",
    marker: "bg-page-search-jobs",
  },
  notifications: {
    row: "hover:bg-page-search-notifications/5",
    rowSelected: "bg-page-search-notifications/10",
    icon: "border-page-search-notifications/20 bg-page-search-notifications/10 text-page-search-notifications",
    iconSelected: "border-page-search-notifications/30 bg-page-search-notifications/15",
    marker: "bg-page-search-notifications",
  },
  tools: {
    row: "hover:bg-page-search-tools/5",
    rowSelected: "bg-page-search-tools/10",
    icon: "border-page-search-tools/20 bg-page-search-tools/10 text-page-search-tools",
    iconSelected: "border-page-search-tools/30 bg-page-search-tools/15",
    marker: "bg-page-search-tools",
  },
  security: {
    row: "hover:bg-page-search-security/5",
    rowSelected: "bg-page-search-security/10",
    icon: "border-page-search-security/20 bg-page-search-security/10 text-page-search-security",
    iconSelected: "border-page-search-security/30 bg-page-search-security/15",
    marker: "bg-page-search-security",
  },
};
