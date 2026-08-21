'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConfigConflict, fetchConfig, logChange, saveConfig } from './configStore';
import { supabase } from './supabase';
import type { Config } from './config';

/**
 * Load the plan, keep it in step with the other phone, and save it safely.
 *
 * Every screen that edits the plan used to do this itself, which meant eight
 * copies of the same fetch-and-upsert — and none of them noticed that a save
 * replaces the whole document, so two people editing different line items
 * would quietly overwrite each other. Saves now carry the version they were
 * read at and fail loudly if the row has moved on.
 */
export function useConfig() {
  const [config, setConfig] = useState<Config | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchConfig().then(
      (loaded) => {
        if (cancelled) return;
        setConfig(loaded.config);
        setVersion(loaded.version);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the plan.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Follow the other phone.
  useEffect(() => {
    const channel = supabase
      .channel('budget_config_sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'budget_config' },
        () => setReloadKey((k) => k + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const persist = useCallback(
    async (next: Config, note: string) => {
      if (version === null) return;
      // Show the change immediately; a conflict puts the stored version back.
      setConfig(next);
      setSaving(true);
      try {
        const v = await saveConfig(next, version);
        setVersion(v);
        await logChange(note);
        setError(null);
      } catch (e) {
        if (e instanceof ConfigConflict) {
          setError('That change didn’t save — the plan was edited elsewhere. Reloading.');
          setReloadKey((k) => k + 1);
        } else {
          setError(e instanceof Error ? e.message : 'Could not save.');
        }
      } finally {
        setSaving(false);
      }
    },
    [version],
  );

  return { config, setConfig, persist, saving, error, setError, reload: () => setReloadKey((k) => k + 1) };
}
