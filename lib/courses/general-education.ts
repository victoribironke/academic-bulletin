/**
 * The General Education block (rule W1): university-wide GST and BU-GST
 * courses, run by the General Education desk. Every draft has it; a Head of
 * Department cannot edit or delete its rows.
 */
export function isGeneralEducationMaster(
  master: { type: string; ownership: string } | null | undefined,
): boolean {
  return Boolean(master) && master!.ownership === "INSTITUTIONAL" && ["GST_NUC", "GST_BU"].includes(master!.type);
}

export const GENERAL_EDUCATION_LOCKED_MESSAGE =
  "General Education courses are set by the General Education desk for every programme, so they can't be changed or removed here (rule W1). Ask DAP if one is wrong.";
