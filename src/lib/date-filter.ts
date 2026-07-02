import type { DateFilterValue } from '@/types/authz';
import type { GenericDateFilterValue } from '@/components/shared/filters/GenericFilterBar';

export function toApiDateFilter(filter: GenericDateFilterValue): DateFilterValue | undefined {
  if (!filter.date) return undefined;
  const date = filter.date instanceof Date ? filter.date : new Date(filter.date);
  if (Number.isNaN(date.getTime())) return undefined;

  const operator = filter.operator === 'before'
    ? 'before'
    : filter.operator === 'equal'
      ? 'equal'
      : 'after';

  return { operator, value: date.toISOString() };
}
