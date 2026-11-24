/**
 * Task K2: everything about search comes from one settings file,
 * config/search.config.json: record types and their fields and weights,
 * filters, code normalisation, old unit codes, synonyms, ranking and limits.
 */
import settings from "@/config/search.config.json";

export type SearchEntity = keyof typeof settings.entities;
export type SearchSettings = typeof settings;

export const SEARCH_SETTINGS: SearchSettings = settings;
export const SEARCH_ENTITIES = Object.keys(settings.entities) as SearchEntity[];
export const entityLabel = (type: string) =>
  (settings.entities as Record<string, { label: string }>)[type]?.label ?? type;
