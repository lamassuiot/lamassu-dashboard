'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { flattenCaTree } from '@/lib/ca-utils';
import { sileo } from '@/lib/toast';
import { downloadFile } from '@/lib/utils';
import {
  deleteCrlSettings,
  downloadCrl,
  fetchCrlSettingsList,
  type CrlSettingsResponse,
} from '@/lib/va-api';

/** CRL settings of a CA, with the name of the CA when it still exists and can be read. */
export interface CrlSettingsListItem {
  settings: CrlSettingsResponse;
  caName: string | null;
}

/**
 * Lists the CRL settings of every CA, including the `ARCHIVED` ones of deleted CAs, which can only
 * be reached from here: their last CRL can be downloaded, or purged along with them.
 */
export function useCrlSettingsList() {
  const [items, setItems] = useState<CrlSettingsListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCaId, setBusyCaId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // The CA names only decorate the list: without them, the settings are listed by CA ID.
      const [settingsList, cas] = await Promise.all([
        fetchCrlSettingsList(),
        fetchAndProcessCAs().catch(() => []),
      ]);
      const caNames = new Map(flattenCaTree(cas).map((ca) => [ca.id, ca.name]));
      setItems(settingsList.map((settings) => ({ settings, caName: caNames.get(settings.ca_id) ?? null })));
    } catch (e: any) {
      setItems([]);
      setError(e?.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const download = async (caId: string) => {
    setBusyCaId(caId);
    try {
      const crlData = await downloadCrl(caId);
      downloadFile(crlData, `${caId}.crl`, 'application/pkix-crl');
      sileo.success({ title: 'Success', description: 'CRL download has started.' });
    } catch (e: any) {
      sileo.error({ title: 'Download Failed', description: e?.message });
    } finally {
      setBusyCaId(null);
    }
  };

  const purge = async (caId: string) => {
    setBusyCaId(caId);
    try {
      await deleteCrlSettings(caId);
      setItems((current) => current.filter((item) => item.settings.ca_id !== caId));
      sileo.success({ title: 'CRL Settings Deleted', description: `The archived CRL settings of "${caId}" have been deleted.` });
    } catch (e: any) {
      sileo.error({ title: 'Deletion Failed', description: e?.message });
      // A 404 or 409 means the list is out of date.
      if (e?.status === 404 || e?.status === 409) void reload();
    } finally {
      setBusyCaId(null);
    }
  };

  return { items, isLoading, error, busyCaId, reload, download, purge };
}
