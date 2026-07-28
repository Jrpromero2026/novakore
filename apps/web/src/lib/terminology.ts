import "server-only";
import { cache } from "react";
import {
  resolveTerm,
  type TermDisplay,
  type TermKey,
  type TerminologyOverrides,
} from "@novakore/domain";
import { supabaseServer } from "./supabase/server";

/** Load an organization's terminology overrides (cached per request). */
export const getTerminology = cache(async (organizationId: string) => {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("organization_terminology")
    .select("term_key, singular, plural, short_form")
    .eq("organization_id", organizationId);

  const overrides: TerminologyOverrides = {};
  for (const row of data ?? []) {
    const display: TermDisplay = { singular: row.singular, plural: row.plural };
    if (row.short_form) display.short = row.short_form;
    overrides[row.term_key as TermKey] = display;
  }

  return {
    overrides,
    term: (key: TermKey): TermDisplay => resolveTerm(key, overrides),
  };
});
