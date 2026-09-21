import { createHash } from "node:crypto";
import { load } from "cheerio";
import {
  activityWindow,
  inWindow,
  documentId,
  type ActivityCase,
} from "./model";
import { getDocument, collectRelated } from "./client";
import { classifyDocument, assessStatus, ACTIVITY_METHOD } from "./analysis";
import { getActivityCase, saveActivityCase } from "./repository";
const pending = new Map<string, Promise<ActivityCase>>();
export async function assessActivity(
  id: string,
  force = false,
): Promise<ActivityCase> {
  documentId.parse(id);
  const saved = await getActivityCase(id);
  const now = new Date();
  const window = activityWindow(now);
  if (saved && !inWindow(saved.selected.publication_date, window))
    throw new Error(
      "This activity is outside the last six months. Search for a more recent update.",
    );
  if (
    !force &&
    saved &&
    saved.assessment.method === ACTIVITY_METHOD &&
    saved.checked_at.slice(0, 10) === window.to &&
    Date.now() - Date.parse(saved.checked_at) < 3600000
  )
    return { ...saved, window };
  let promise = pending.get(id);
  if (!promise) {
    promise = collect(id, now).finally(() => pending.delete(id));
    pending.set(id, promise);
  }
  return promise;
}
async function collect(id: string, now: Date): Promise<ActivityCase> {
  const window = activityWindow(now);
  const selected = await getDocument(id);
  if (!inWindow(selected.publication_date, window))
    throw new Error(
      "This publication is outside the last six months. Older documents are used only as supporting history.",
    );
  const related = await collectRelated(selected, window.to);
  const history = related.documents
    .map(classifyDocument)
    .sort(
      (a, b) =>
        b.document.publication_date.localeCompare(
          a.document.publication_date,
        ) ||
        b.document.document_number.localeCompare(a.document.document_number),
    );
  const assessment = assessStatus(
    history,
    related.complete,
    related.linkage !== "title",
    now.toISOString(),
  );
  // The selected update is quoted, not rewritten as a claim of current legal effect.
  const excerpt = load(selected.abstract ?? "").text();
  const payload = {
    id,
    selected,
    history,
    related_excluded: related.excluded,
    history_complete: related.complete,
    linkage: related.linkage,
    limitations: related.limitations,
    assessment,
    summary: { text: excerpt, method: "official-excerpt" as const },
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const record: ActivityCase = {
    ...payload,
    fingerprint,
    checked_at: now.toISOString(),
    window,
  };
  await saveActivityCase(record);
  return record;
}
