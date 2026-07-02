'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BookmarkPaginationFooterProps {
  pageSizeId: string;
  pageSize: string;
  onPageSizeChange: (value: string) => void;
  isLoading: boolean;
  currentPageIndex: number;
  canGoNext: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function BookmarkPaginationFooter({
  pageSizeId,
  pageSize,
  onPageSizeChange,
  isLoading,
  currentPageIndex,
  canGoNext,
  onPreviousPage,
  onNextPage,
}: BookmarkPaginationFooterProps) {
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2">
        <Label htmlFor={pageSizeId} className="text-sm text-muted-foreground whitespace-nowrap">Page size:</Label>
        <Select value={pageSize} onValueChange={onPageSizeChange} disabled={isLoading}>
          <SelectTrigger id={pageSizeId} className="w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onPreviousPage} disabled={isLoading || currentPageIndex === 0}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        <Button
          variant="secondary"
          onClick={onNextPage}
          disabled={isLoading || !canGoNext}
        >
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
