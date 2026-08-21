'use client';

import { DEFAULT_CONFIG, migrateFood, type Config, type LegacyFoodConfig } from './config';
import { supabase } from './supabase';

const ROW_ID = 'main';

/** A config together with the version it was read at. */
export type LoadedConfig = { config: Config; version: string };

/**
 * Thrown when the row moved on since it was read — the other phone saved first.
 * Overwriting anyway would silently revert their edit, so the caller has to
 * reload and decide.
 */
export class ConfigConflict extends Error {
  constructor() {
    super('Someone else changed the plan while this was open.');
    this.name = 'ConfigConflict';
  }
}

/**
 * The config row is created on first read so a fresh database comes up with the
 * plan from the handoff rather than an empty screen.
 */
export async function fetchConfig(): Promise<LoadedConfig> {
  const { data, error } = await supabase
    .from('budget_config')
    .select('config, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.config) {
    return { config: migrate(data.config as Config), version: data.updated_at as string };
  }

  const seeded = await supabase
    .from('budget_config')
    .insert({ id: ROW_ID, config: DEFAULT_CONFIG })
    .select('updated_at')
    .single();
  if (seeded.error) throw new Error(seeded.error.message);
  return { config: DEFAULT_CONFIG, version: seeded.data.updated_at as string };
}

/**
 * Write the config, but only if nobody else has written since `version`.
 *
 * The whole document is replaced on every save, so a stale write does not merge
 * badly — it reverts. The guard turns that into a visible failure instead.
 */
export async function saveConfig(config: Config, version: string): Promise<string> {
  const next = new Date().toISOString();
  const { data, error } = await supabase
    .from('budget_config')
    .update({ config, updated_at: next })
    .eq('id', ROW_ID)
    .eq('updated_at', version)
    .select('updated_at');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ConfigConflict();
  return next;
}

/** Fill in anything a stored config predates, so old rows keep working. */
function migrate(stored: Config): Config {
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    food: migrateFood(stored.food as LegacyFoodConfig | undefined),
    phases: stored.phases?.length ? stored.phases : DEFAULT_CONFIG.phases,
    items: stored.items?.length ? stored.items : DEFAULT_CONFIG.items,
    moneyIn: stored.moneyIn?.length ? stored.moneyIn : DEFAULT_CONFIG.moneyIn,
    savings: { ...DEFAULT_CONFIG.savings, ...stored.savings },
    settlement: { ...DEFAULT_CONFIG.settlement, ...stored.settlement },
    pot: { ...DEFAULT_CONFIG.pot, ...stored.pot },
    // A config written before tracking had a start date would otherwise replay
    // from the 1st and invent a pot; fall back to the first of its start month.
    startDate: stored.startDate ?? `${stored.startMonth ?? DEFAULT_CONFIG.startMonth}-01`,
  };
}

export async function logChange(note: string): Promise<void> {
  const { error } = await supabase.from('budget_changelog').insert({ note });
  if (error) throw new Error(error.message);
}
