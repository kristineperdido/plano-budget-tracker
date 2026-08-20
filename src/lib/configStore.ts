'use client';

import { DEFAULT_CONFIG, type Config } from './config';
import { supabase } from './supabase';

const ROW_ID = 'main';

/**
 * The config row is created on first read so a fresh database comes up with the
 * plan from the handoff rather than an empty screen.
 */
export async function fetchConfig(): Promise<Config> {
  const { data, error } = await supabase
    .from('budget_config')
    .select('config')
    .eq('id', ROW_ID)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.config) return migrate(data.config as Config);

  await saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

export async function saveConfig(config: Config): Promise<void> {
  const { error } = await supabase
    .from('budget_config')
    .upsert({ id: ROW_ID, config, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Fill in anything a stored config predates, so old rows keep working. */
function migrate(stored: Config): Config {
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    food: { ...DEFAULT_CONFIG.food, ...stored.food },
    phases: stored.phases?.length ? stored.phases : DEFAULT_CONFIG.phases,
    items: stored.items?.length ? stored.items : DEFAULT_CONFIG.items,
    moneyIn: stored.moneyIn?.length ? stored.moneyIn : DEFAULT_CONFIG.moneyIn,
  };
}

export async function logChange(note: string): Promise<void> {
  const { error } = await supabase.from('budget_changelog').insert({ note });
  if (error) throw new Error(error.message);
}
