'use client';

import { CertificatePaginationControls } from '@/components/shared/CertificatePaginationControls';
import { CLIENT_PAGE_SIZE_OPTIONS, type ClientPagination } from '@/hooks/useClientPagination';

/** Page size + previous/next for a list paged with useClientPagination. Hidden while every row already
 *  fits on the smallest page, so a short list shows no controls at all. */
export function ClientPaginationFooter<T>({ pagination, id }: { pagination: ClientPagination<T>; id: string }) {
  if (pagination.total <= Number(CLIENT_PAGE_SIZE_OPTIONS[0])) return null;
  return (
    <CertificatePaginationControls
      pageSize={pagination.pageSize}
      onPageSizeChange={pagination.setPageSize}
      pageSizeOptions={CLIENT_PAGE_SIZE_OPTIONS}
      pageSizeLabel="Rows per page:"
      pageSizeSelectId={id}
      isLoading={false}
      onPreviousPage={pagination.goPrevious}
      onNextPage={pagination.goNext}
      canGoPrevious={pagination.canGoPrevious}
      canGoNext={pagination.canGoNext}
      pageIndicator={pagination.rangeLabel}
      compact
      className="pt-3"
    />
  );
}
