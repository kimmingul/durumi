import { ipcMain } from 'electron';
import { getPreferences } from '../preferences';
import {
  resolveDOI,
  resolveORCID,
  searchCrossref,
  searchKoreaMed,
  searchPubMed,
} from '../bibliographyFetch';

/**
 * Remote bibliography search / resolve handlers (DOI, Crossref, PubMed,
 * KoreaMed, ORCID). Split from `bibliography.ts` to keep both under 200
 * lines per the v0.2 hardening spec.
 */
export function registerBibliographyFetchHandlers(): void {
  ipcMain.handle('bibliography:resolveDoi', async (_e, doi: string) => {
    const prefs = await getPreferences();
    const r = await resolveDOI(doi, {
      email: prefs.bibliography?.email ?? null,
      ncbiApiKey: prefs.bibliography?.ncbiApiKey ?? null,
    });
    if (r.ok) return { ok: true as const, entry: r.data };
    return { ok: false as const, code: r.code, message: r.message };
  });

  ipcMain.handle(
    'bibliography:searchCrossref',
    async (_e, query: string, limit?: number) => {
      const prefs = await getPreferences();
      const r = await searchCrossref(query, {
        email: prefs.bibliography?.email ?? null,
        limit,
      });
      if (r.ok) return { ok: true as const, hits: r.data };
      return { ok: false as const, code: r.code, message: r.message };
    },
  );

  ipcMain.handle(
    'bibliography:searchPubmed',
    async (_e, query: string, limit?: number) => {
      const prefs = await getPreferences();
      const r = await searchPubMed(query, {
        email: prefs.bibliography?.email ?? null,
        ncbiApiKey: prefs.bibliography?.ncbiApiKey ?? null,
        limit,
      });
      if (r.ok) return { ok: true as const, hits: r.data };
      return { ok: false as const, code: r.code, message: r.message };
    },
  );

  ipcMain.handle(
    'bibliography:searchKoreamed',
    async (_e, query: string, limit?: number) => {
      const prefs = await getPreferences();
      const r = await searchKoreaMed(query, {
        email: prefs.bibliography?.email ?? null,
        limit,
      });
      if (r.ok) return { ok: true as const, hits: r.data };
      return { ok: false as const, code: r.code, message: r.message };
    },
  );

  ipcMain.handle('bibliography:resolveOrcid', async (_e, iD: string) => {
    const r = await resolveORCID(iD);
    if (r.ok) return { ok: true as const, profile: r.data };
    return { ok: false as const, code: r.code, message: r.message };
  });
}
