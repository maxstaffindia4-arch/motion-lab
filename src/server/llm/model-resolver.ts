// Single source of truth for the active Gemini model on the server side.
// Priority: DB setting (persists across restarts) > .env GEMINI_MODEL > last-resort default.

import { dbService } from '../db.js';

const DEFAULT_MODEL = 'gemini-3.5-flash';

export function activeModel(): string {
  const db = dbService.getSetting('active_model');
  if (db) return db;
  const env = process.env.GEMINI_MODEL;
  if (env) return env;
  return DEFAULT_MODEL;
}

// Short user-facing label currently in the UI.
export function activeModelShortLabel(): string | null {
  return dbService.getSetting('active_model_normalized') || null;
}

// Normalize a user-typed model choice to the model's service FQDN that we
// actually pass to the Gemini SDK. If we can't resolve it, return the
// user's string unchanged so ListModels already-validated choices still work.
export function normalizeModelFqdn(choice: string): string {
  const lower = choice.toLowerCase();
  if (lower.startsWith('models/')) return choice;
  if (lower.startsWith('gemini-')) return 'models/' + choice;
  return choice;
}
