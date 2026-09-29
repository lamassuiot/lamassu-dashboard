'use client';

import { useEffect, useState } from 'react';
import { getHTTPSchemas, getSchemas } from '@/lib/authz-api';
import type { HTTPSchemaDefinition, SchemaDefinition } from '@/types/authz';

export interface PolicySchemas {
  schemas: SchemaDefinition[];
  httpSchemas: Record<string, HTTPSchemaDefinition>;
  loading: boolean;
}

export function usePolicySchemas(): PolicySchemas {
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [httpSchemas, setHttpSchemas] = useState<Record<string, HTTPSchemaDefinition>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getSchemas(), getHTTPSchemas()]).then(([entity, http]) => {
      if (cancelled) return;
      if (entity.status === 'fulfilled') setSchemas(entity.value);
      else console.error('Failed to fetch schemas:', entity.reason);
      if (http.status === 'fulfilled') setHttpSchemas(http.value);
      else console.error('Failed to fetch HTTP schemas:', http.reason);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { schemas, httpSchemas, loading };
}
