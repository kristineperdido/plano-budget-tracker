'use client';

import {
  DEFAULT_CONFIG,
  migrateFood,
  type Config,
  type LegacyConfig,
  type LegacyFoodConfig,
  type LineItem,
} from './config';
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
    ...migrateSchemes(stored as LegacyConfig),
    moneyIn: stored.moneyIn?.length ? stored.moneyIn : DEFAULT_CONFIG.moneyIn,
    savings: { ...DEFAULT_CONFIG.savings, ...stored.savings },
    settlement: { ...DEFAULT_CONFIG.settlement, ...stored.settlement },
    pot: { ...DEFAULT_CONFIG.pot, ...stored.pot },
    // A config written before tracking had a start date would otherwise replay
    // from the 1st and invent a pot; fall back to the first of its start month.
    startDate: stored.startDate ?? `${stored.startMonth ?? DEFAULT_CONFIG.startMonth}-01`,
  };
}

/**
 * Costs used to be one flat `items` list with the pending tray mixed in, and
 * phases carried per-item payer overrides. A config written then is folded into
 * a single scheme holding the real costs, with the unpriced ones lifted out —
 * and any payer overrides a phase carried become a scheme of their own, so
 * nothing that was set is quietly lost.
 */
function migrateSchemes(stored: LegacyConfig): Pick<Config, 'phases' | 'schemes' | 'pending'> {
  const phases = (stored.phases?.length ? stored.phases : DEFAULT_CONFIG.phases) as Config['phases'];

  if (stored.schemes?.length) {
    return {
      phases: phases.map((p) => ({ ...p, schemeId: p.schemeId ?? stored.schemes![0].id })),
      schemes: stored.schemes,
      pending: stored.pending ?? [],
    };
  }

  const flat = stored.items?.length ? stored.items : DEFAULT_CONFIG.schemes[0].items;
  const base = flat.filter((i) => !i.pending);
  const pending = stored.pending ?? flat.filter((i) => Boolean(i.pending));

  const schemes: Config['schemes'] = [{ id: 'standard', label: 'Standard', items: base }];

  const next = phases.map((p) => {
    const overrides = (p as { payers?: Record<string, LineItem['payer']> }).payers ?? {};
    if (Object.keys(overrides).length === 0) return { ...p, schemeId: 'standard' };

    // A phase that reassigned who pays becomes its own scheme, carrying the
    // same line ids so recorded figures still resolve.
    const id = `scheme-${p.id}`;
    schemes.push({
      id,
      label: p.label,
      items: base.map((i) => (overrides[i.id] ? { ...i, payer: overrides[i.id] } : i)),
    });
    return { ...p, schemeId: id };
  });

  return { phases: next, schemes, pending };
}

export async function logChange(note: string): Promise<void> {
  const { error } = await supabase.from('budget_changelog').insert({ note });
  if (error) throw new Error(error.message);
}
