'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { flattenCaTree, formatCaSubject } from '@/lib/ca-utils';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { downloadFile } from '@/lib/utils';
import {
  deleteCrlSettings,
  downloadCrl,
  fetchCrlSettingsList,
  type CrlSettingsResponse,
} from '@/lib/va-api';

/** CRL settings of a CA, with the name and subject DN of the CA when it still exists and can be read. */
export interface CrlSettingsListItem {
  settings: CrlSettingsResponse;
  caName: string | null;
  /** One-line subject DN, e.g. `CN=Root, O=Acme, C=ES`. */
  caSubject: string | null;
  cryptoEngine: ApiCryptoEngine | null;
}

/**
 * Lists the CRL settings of every CA, including the `ARCHIVED` ones of deleted CAs, which can only
 * be reached from here: their last CRL can be downloaded, or purged along with them.
 */
export function useCrlSettingsList() {
  const [items, setItems] = useState<CrlSettingsListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCaIds, setBusyCaIds] = useState<ReadonlySet<string>>(() => new Set());

  const setBusy = (caId: string, busy: boolean) => {
    setBusyCaIds((current) => {
      const next = new Set(current);
      if (busy) next.add(caId);
      else next.delete(caId);
      return next;
    });
  };

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // The CA names only decorate the list: without them, the settings are listed by CA ID.
      const [settingsList, cas, engines] = await Promise.all([
        fetchCrlSettingsList(),
        fetchAndProcessCAs().catch(() => []),
        fetchCryptoEngines().catch(() => []),
      ]);
      const caById = new Map(flattenCaTree(cas).map((ca) => [ca.id, ca]));
      const engineById = new Map(engines.map((engine) => [engine.id, engine]));
      setItems(settingsList.map((settings) => {
        const ca = caById.get(settings.ca_id);
        return {
          settings,
          caName: ca?.name ?? null,
          caSubject: ca ? formatCaSubject(ca) : null,
          cryptoEngine: ca?.kmsKeyId ? engineById.get(ca.kmsKeyId) ?? null : null,
        };
      }));
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
    setBusy(caId, true);
    try {
      const crlData = await downloadCrl(caId);
      downloadFile(crlData, `${caId}.crl`, 'application/pkix-crl');
      sileo.success({ title: 'Success', description: 'CRL download has started.' });
    } catch (e: any) {
      sileo.error({ title: 'Download Failed', description: e?.message });
    } finally {
      setBusy(caId, false);
    }
  };

  const purge = async (caId: string) => {
    setBusy(caId, true);
    try {
      await deleteCrlSettings(caId);
      setItems((current) => current.filter((item) => item.settings.ca_id !== caId));
      sileo.success({ title: 'CRL Settings Deleted', description: `The archived CRL settings of "${caId}" have been deleted.` });
    } catch (e: any) {
      sileo.error({ title: 'Deletion Failed', description: e?.message });
      // A 404 or 409 means the list is out of date.
      if (e?.status === 404 || e?.status === 409) void reload();
    } finally {
      setBusy(caId, false);
    }
  };

  return { items, isLoading, error, busyCaIds, reload, download, purge };
}
