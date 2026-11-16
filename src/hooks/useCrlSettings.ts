'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { sileo } from '@/lib/toast';
import { downloadFile } from '@/lib/utils';
import {
  downloadCrl,
  fetchCrlSettings,
  fetchSignerCertificateDisplay,
  toCrlSettings,
  toCrlSettingsUpdatePayload,
  updateCrlSettings,
  type CrlSettings,
  type LatestCrlInfo,
} from '@/lib/va-api';
import { useLatestRequest } from '@/hooks/useLatestRequest';

/**
 * Loads and edits the CRL settings of a CA. The settings are created by the backend when the CA
 * is, so a CA without them (`notFound`) has nothing to edit until they appear.
 */
export function useCrlSettings(ca: CA | null) {
  const [settings, setSettings] = useState<CrlSettings | null>(null);
  const [latestCrl, setLatestCrl] = useState<LatestCrlInfo | null>(null);
  const [signerDisplay, setSignerDisplay] = useState<CertificateData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloadingCrl, setIsDownloadingCrl] = useState(false);
  const startRequest = useLatestRequest();

  const caId = ca?.id ?? null;
  // The CA currently shown, so a save that finishes after the user moved to another CA
  // does not overwrite the settings of the new one.
  const currentCaId = useRef(caId);
  useEffect(() => {
    currentCaId.current = caId;
  }, [caId]);

  const reload = useCallback(async () => {
    const isLatest = startRequest();
    setSettings(null);
    setLatestCrl(null);
    setSignerDisplay(null);
    setError(null);
    setNotFound(false);
    if (!caId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchCrlSettings(caId);
      if (!isLatest()) return;
      if (data === null) {
        setNotFound(true);
        return;
      }

      const loaded = toCrlSettings(data);
      setSettings(loaded);
      setLatestCrl(data.latest_crl ?? null);
      if (loaded.signerSerialNumber) {
        const display = await fetchSignerCertificateDisplay(loaded.signerSerialNumber);
        if (isLatest()) setSignerDisplay(display);
      }
    } catch (e: any) {
      if (isLatest()) setError(e?.message || 'An unknown error occurred.');
    } finally {
      if (isLatest()) setIsLoading(false);
    }
  }, [caId, startRequest]);

  useEffect(() => {
    reload();
  }, [reload]);

  const selectSigner = (certificate: CertificateData) => {
    setSettings((current) => current && { ...current, signerSerialNumber: certificate.serialNumber ?? null });
    setSignerDisplay(certificate);
  };

  const clearSigner = () => {
    setSettings((current) => current && { ...current, signerSerialNumber: null });
    setSignerDisplay(null);
  };

  const setDuration = (key: 'refreshInterval' | 'validity', value: string) => {
    setSettings((current) => current && { ...current, [key]: value });
  };

  const toggleRegenerateOnRevoke = () => {
    setSettings((current) => current && { ...current, regenerateOnRevoke: !current.regenerateOnRevoke });
  };

  const save = async () => {
    if (!ca || !settings) return;
    const savedCaId = ca.id;
    const isStillShown = () => currentCaId.current === savedCaId;
    const signerAtSave = signerDisplay;
    setIsSubmitting(true);
    try {
      const saved = await updateCrlSettings(savedCaId, toCrlSettingsUpdatePayload(settings));
      if (saved && isStillShown()) {
        // A reload started before the update finished may have read the old settings:
        // supersede it so its late response cannot overwrite the saved ones.
        startRequest();
        setIsLoading(false);
        const savedSettings = toCrlSettings(saved);
        setSettings(savedSettings);
        setLatestCrl(saved.latest_crl ?? null);
        // That reload also cleared the signer display; restore it while it is still the saved signer.
        if (signerAtSave && signerAtSave.serialNumber === savedSettings.signerSerialNumber) {
          setSignerDisplay(signerAtSave);
        }
      }
      sileo.success({ title: 'Success!', description: `CRL settings for "${ca.name}" have been saved.` });
    } catch (e: any) {
      sileo.error({ title: 'Save Failed', description: e?.message });
      // A 409 means the settings stopped being ACTIVE: reload to show their current state.
      if (e?.status === 409 && isStillShown()) reload();
    } finally {
      setIsSubmitting(false);
    }
  };

  const download = async () => {
    if (!ca) return;
    setIsDownloadingCrl(true);
    try {
      const crlData = await downloadCrl(ca.id);
      downloadFile(crlData, `${ca.id}.crl`, 'application/pkix-crl');
      sileo.success({ title: 'Success', description: 'CRL download has started.' });
    } catch (e: any) {
      sileo.error({ title: 'Download Failed', description: e?.message });
    } finally {
      setIsDownloadingCrl(false);
    }
  };

  return {
    settings,
    latestCrl,
    signerDisplay,
    isLoading,
    error,
    notFound,
    isReadOnly: settings !== null && settings.status !== 'ACTIVE',
    isSubmitting,
    isDownloadingCrl,
    reload,
    selectSigner,
    clearSigner,
    setDuration,
    toggleRegenerateOnRevoke,
    save,
    download,
  };
}

export type CrlSettingsState = ReturnType<typeof useCrlSettings>;
