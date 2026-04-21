export function appendSingleOrMultiFilter(
  params: URLSearchParams,
  values: readonly string[],
  buildSingleValueFilter: (value: string) => string,
  buildMultiValueFilter: (values: readonly string[]) => string
) {
  if (values.length === 1) {
    params.append('filter', buildSingleValueFilter(values[0]));
  } else if (values.length > 1) {
    params.append('filter', buildMultiValueFilter(values));
  }
}
