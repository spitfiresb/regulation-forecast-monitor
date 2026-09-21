import { categoryFor } from "./browse";
import { load } from "cheerio";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  catalogSchema,
  catalogEntrySchema,
  ruleIdForRin,
  type Catalog,
  type CatalogEntry,
} from "./model";
import { atomicJson, localDirectory, supabase } from "./storage";

export const CATALOG_INDEX =
  "https://www.reginfo.gov/public/do/eAgendaXmlReport";
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
export function discoverCatalogUrl(html: string): string {
  const $ = load(html);
  const urls = $("a[href]")
    .toArray()
    .map((a) => {
      try {
        return new URL($(a).attr("href")!, CATALOG_INDEX);
      } catch {
        return null;
      }
    })
    .filter(
      (u): u is URL =>
        !!u &&
        u.protocol === "https:" &&
        u.hostname === "www.reginfo.gov" &&
        u.pathname === "/public/do/XMLViewFileAction" &&
        /^REGINFO_RIN_DATA_\d{6}\.xml$/.test(u.searchParams.get("f") ?? ""),
    );
  urls.sort((a, b) =>
    b.searchParams.get("f")!.localeCompare(a.searchParams.get("f")!),
  );
  if (!urls.length)
    throw new Error("No current Unified Agenda XML catalog found");
  return urls[0].href;
}
export function parseCatalog(
  xml: string,
  sourceUrl: string,
  importedAt: string,
): Catalog {
  const $ = load(xml, { xml: true });
  const entries: CatalogEntry[] = $("REGINFO_RIN_DATA > RIN_INFO")
    .toArray()
    .map((element) => {
      const row = $(element);
      const field = (selector: string) =>
        clean(row.find(selector).first().text());
      const rin = clean(row.children("RIN").text());
      const publication = field("PUBLICATION > PUBLICATION_ID");
      const abstract = row.children("ABSTRACT").text();
      const body = load(abstract);
      body("script, style, head").remove();
      return catalogEntrySchema.parse({
        id: ruleIdForRin(rin),
        rin,
        title: field("RULE_TITLE"),
        agency: [
          field("PARENT_AGENCY > NAME"),
          clean(row.children("AGENCY").children("NAME").text()),
        ]
          .filter((a, i, all) => a && all.indexOf(a) === i)
          .join(" / "),
        agency_code: clean(row.children("AGENCY").children("CODE").text()),
        summary: clean(body.text()),
        stage: field("RULE_STAGE"),
        cfr_citation: row
          .find("CFR_LIST > CFR")
          .toArray()
          .map((c) => clean($(c).text()).replace(/\bCFR\s+Part\s+/i, "CFR ")),
        publication_id: publication,
        source_url: `https://www.reginfo.gov/public/do/eAgendaViewRule?RIN=${rin}&pubId=${publication}`,
        legal_deadline:
          clean(row.children("LEGAL_DLINE_LIST").text()) || "Not specified",
        timetable: row
          .find("TIMETABLE_LIST > TIMETABLE")
          .toArray()
          .map((t) => ({
            action: clean($(t).find("TTBL_ACTION").text()),
            date: clean($(t).find("TTBL_DATE").text()),
            fr_citation: clean($(t).find("FR_CITATION").text()),
          })),
      });
    });
  return catalogSchema.parse({
    publication_id: entries[0]?.publication_id,
    source_url: sourceUrl,
    imported_at: importedAt,
    entries,
  });
}
async function fetchText(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
    headers: {
      "User-Agent": "RegulatoryForecastMonitor/1.0",
      Accept: "application/xml, text/html",
    },
  });
  if (!response.ok)
    throw new Error(`Catalog source returned HTTP ${response.status}`);
  return response.text();
}
export async function collectCatalog(): Promise<Catalog> {
  const sourceUrl = discoverCatalogUrl(await fetchText(CATALOG_INDEX));
  return parseCatalog(
    await fetchText(sourceUrl),
    sourceUrl,
    new Date().toISOString(),
  );
}
export async function saveCatalog(
  catalog: Catalog,
): Promise<"supabase" | "local"> {
  const parsed = catalogSchema.parse(catalog);
  const client = supabase();
  if (client) {
    const { error } = await client.rpc("save_rule_catalog", {
      p_catalog: parsed,
    });
    if (error)
      throw new Error(
        `Catalog could not be saved (${error.code}); check that the catalog migration is applied.`,
      );
    return "supabase";
  }
  // A full catalog is replaced atomically; a failed download never clears it.
  try {
    const previous = catalogSchema.parse(
      JSON.parse(
        await readFile(join(localDirectory(), "catalog.json"), "utf8"),
      ),
    );
    if (
      previous.imported_at > parsed.imported_at ||
      previous.publication_id > parsed.publication_id
    )
      throw new Error("Stale catalog");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await atomicJson(join(localDirectory(), "catalog.json"), parsed);
  return "local";
}
export const catalogQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  category: z
    .string()
    .refine((value) => value === "" || !!categoryFor(value), "Unknown category")
    .default(""),
  agency: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export type CatalogResults = {
  entries: CatalogEntry[];
  checked_ids: string[];
  total: number;
  limit: number;
  offset: number;
  storage: "supabase" | "local";
  metadata: {
    publication_id: string;
    source_url: string;
    imported_at: string;
    entry_count: number;
  } | null;
};
export async function searchCatalog(
  input: z.input<typeof catalogQuerySchema> = {},
): Promise<CatalogResults> {
  const { q, agency, category, limit, offset } =
    catalogQuerySchema.parse(input);
  const client = supabase();
  if (client) {
    const query = client.rpc("browse_rule_catalog", {
      p_prefixes: categoryFor(category)?.prefixes ?? null,
      p_query: q,
      p_agency: agency ?? null,
      p_limit: limit,
      p_offset: offset,
    });
    const [rows, metadata] = await Promise.all([
      query,
      client
        .from("catalog_import")
        .select("publication_id,source_url,imported_at,entry_count")
        .eq("singleton", true)
        .maybeSingle(),
    ]);
    if (rows.error || metadata.error)
      throw new Error("Catalog could not be loaded");
    return {
      entries: rows.data.map((r: { entry: unknown }) =>
        catalogEntrySchema.parse(r.entry),
      ),
      checked_ids: rows.data
        .filter((r: { has_snapshot: boolean }) => r.has_snapshot)
        .map((r: { entry: { id: string } }) => r.entry.id),
      total: Number(rows.data[0]?.total ?? 0),
      metadata: metadata.data,
      limit,
      offset,
      storage: "supabase" as const,
    };
  }
  let catalog: Catalog;
  try {
    catalog = catalogSchema.parse(
      JSON.parse(
        await readFile(join(localDirectory(), "catalog.json"), "utf8"),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return {
        entries: [],
        checked_ids: [] as string[],
        total: 0,
        metadata: null,
        limit,
        offset,
        storage: "local" as const,
      };
    throw error;
  }
  const prefixes = categoryFor(category)?.prefixes;
  const rows = catalog.entries
    .filter(
      (r) =>
        !prefixes ||
        prefixes.some((prefix) => r.agency_code.startsWith(prefix)),
    )
    .filter(
      (r) =>
        ((!agency || r.agency_code === agency) &&
          [r.title, r.rin, r.agency, ...r.cfr_citation, r.summary]
            .join(" ")
            .toLowerCase()
            .includes(q.toLowerCase())) ||
        ((!agency || r.agency_code === agency) &&
          q
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
            .every((token) =>
              [r.title, r.rin, r.agency, ...r.cfr_citation, r.summary]
                .join(" ")
                .toLowerCase()
                .includes(token),
            )),
    )
    .sort((a, b) => {
      const rank = (r: CatalogEntry) =>
        r.rin.toLowerCase() === q.toLowerCase()
          ? 1000
          : r.title.toLowerCase().includes(q.toLowerCase())
            ? 100
            : 0;
      return rank(b) - rank(a) || a.id.localeCompare(b.id);
    });
  return {
    entries: rows.slice(offset, offset + limit),
    checked_ids: [] as string[],
    total: rows.length,
    metadata: {
      publication_id: catalog.publication_id,
      source_url: catalog.source_url,
      imported_at: catalog.imported_at,
      entry_count: catalog.entries.length,
    },
    limit,
    offset,
    storage: "local" as const,
  };
}

export async function getCatalogEntry(
  rin: string,
): Promise<CatalogEntry | null> {
  const client = supabase();
  if (client) {
    const { data, error } = await client
      .from("rule_catalog")
      .select("entry")
      .eq("rin", rin)
      .maybeSingle();
    if (error) throw new Error("Catalog entry could not be loaded");
    return data ? catalogEntrySchema.parse(data.entry) : null;
  }
  const results = await searchCatalog({ q: rin, limit: 100 });
  return results.entries.find((r) => r.rin === rin) ?? null;
}
