import {
  formatDegrees,
  formatLength,
  type Length,
  type PairParam,
  type ParamId,
  type PelvicAnalysis,
  type PelvicParam,
  type SingleParam,
} from "@/lib/pelvic-analysis";

/**
 * Plain-language summary of the pelvic parameters for the doctor: what each
 * measured parameter shows, which ones fall outside the paper's normal
 * ranges, and what to check next. Suggestions only; the doctor decides.
 *
 * Gonstead readings follow the usual AP-film conventions: the longer
 * innominate suggests PI and the shorter AS; the wider ilium suggests IN and
 * the narrower EX.
 */

export interface SummaryFinding {
  id: ParamId;
  outside: boolean;
  text: string;
}

export interface PelvicSummary {
  headline: string;
  findings: SummaryFinding[];
  suggestions: string[];
}

const NAME: Record<ParamId, string> = {
  FHHD: "Femoral heads",
  ALFHRF: "Femoral head line",
  ICHD: "Iliac crests",
  DOCS: "Pubic symphysis",
  IM: "Innominate length",
  SAM: "Sacral ala",
  ISM: "Ilium width",
};

function finding(param: PelvicParam, unit: "mm" | "px"): string | null {
  const fmt = (v: Length) => formatLength(v, unit);
  const normal = `normal ${param.normal}`;
  if (param.kind === "single") return singleText(param as SingleParam, fmt, normal);
  const pair = param as PairParam;
  if (!pair.diff || !pair.right || !pair.left) return null;
  const sides = `R ${fmt(pair.right)}, L ${fmt(pair.left)}`;
  if (!pair.direction) return `${NAME[pair.id]}: equal (${sides}).`;
  // direction is e.g. "R longer": "R longer by 6.0 mm".
  return `${NAME[pair.id]}: ${pair.direction} by ${fmt(pair.diff)} (${sides}; ${normal}).`;
}

function singleText(param: SingleParam, fmt: (v: Length) => string, normal: string): string | null {
  if (param.id === "ALFHRF") {
    if (param.degrees == null) return null;
    return `${NAME.ALFHRF}: tilted ${formatDegrees(param.degrees)}${param.direction ? `, ${param.direction}` : ""} (${normal}).`;
  }
  if (!param.value) return null;
  if (!param.direction) return `${NAME[param.id]}: level (${normal}).`;
  if (param.id === "DOCS") return `${NAME.DOCS}: ${fmt(param.value)} ${param.direction} of the S2 line (${normal}).`;
  return `${NAME[param.id]}: ${param.direction} by ${fmt(param.value)} (${normal}).`;
}

/** "R lower" → "R". */
function sideOf(direction: string | null): string | null {
  return direction?.split(" ")[0] ?? null;
}

export function pelvicSummary(analysis: PelvicAnalysis, unit: "mm" | "px"): PelvicSummary {
  const byId = new Map(analysis.params.map((p) => [p.id, p]));
  const outside = (id: ParamId) => byId.get(id)?.status === "outside";

  const findings: SummaryFinding[] = analysis.params.flatMap((p) => {
    const text = finding(p, unit);
    return text ? [{ id: p.id, outside: p.status === "outside", text }] : [];
  });
  // Outside the range first; otherwise the paper's order.
  findings.sort((a, b) => Number(b.outside) - Number(a.outside));

  const suggestions: string[] = [];
  const head = byId.get("FHHD");
  const crest = byId.get("ICHD");
  if (outside("FHHD") || outside("ALFHRF")) {
    suggestions.push(
      `Uneven femoral heads (${head?.direction ?? "one side lower"}): check for a leg length inequality, e.g. supine and prone leg checks.`,
    );
  }
  if (outside("ICHD")) {
    // ICHD is measured against the femoral head line, so a short leg alone leaves it level.
    suggestions.push(
      `Iliac crests uneven against the femoral head line (${crest?.direction ?? "one side lower"}): points to innominate rotation rather than leg length; compare with IM.`,
    );
  }
  if (outside("IM")) {
    const longer = sideOf(byId.get("IM")?.direction ?? null);
    suggestions.push(
      `Innominate lengths differ: on a Gonstead reading the longer side${longer ? ` (${longer})` : ""} suggests a PI ilium and the shorter an AS ilium; confirm with motion palpation.`,
    );
  }
  if (outside("ISM")) {
    const wider = sideOf(byId.get("ISM")?.direction ?? null);
    suggestions.push(
      `Ilium widths differ: on a Gonstead reading the wider ilium${wider ? ` (${wider})` : ""} suggests IN and the narrower EX; confirm with motion palpation.`,
    );
  }
  if (outside("DOCS")) {
    suggestions.push(
      `Symphysis off the S2 line (${byId.get("DOCS")?.direction ?? "off midline"}): suggests pelvic rotation; review the sacrum and both ilia.`,
    );
  }
  if (outside("SAM")) {
    suggestions.push(
      "Sacral ala widths differ: may reflect sacral rotation. The AI is least reliable on landmarks 7, 11 and 12, so check them before relying on this.",
    );
  }
  if (!analysis.calibrated) {
    suggestions.push(
      "Calibrate the film (Calibrate tool, K) to judge the distances against the paper's normal ranges in mm.",
    );
  }
  if (findings.length < analysis.params.length) {
    suggestions.push("Some parameters can't be measured yet: place the missing landmarks listed below.");
  }

  const measured = findings.length;
  const outsideCount = findings.filter((f) => f.outside).length;
  let headline: string;
  if (measured === 0) headline = "Place landmarks 1 and 2 (femoral heads) to start measuring.";
  else if (outsideCount > 0) headline = `${outsideCount} of ${measured} measured parameters outside the normal range.`;
  else if (!analysis.calibrated) headline = "Measured in pixels: calibrate to judge the distances against the normal ranges.";
  else headline = `All ${measured} measured parameters within the normal range.`;

  return { headline, findings, suggestions };
}

/** Text for the visit notes: headline, findings, suggestions. */
export function pelvicSummaryText(summary: PelvicSummary): string {
  return [
    `Pelvic X-ray analysis (Moon et al. 2024): ${summary.headline}`,
    ...summary.findings.map((f) => `- ${f.text}${f.outside ? " [outside range]" : ""}`),
    ...(summary.suggestions.length ? ["Suggestions:", ...summary.suggestions.map((s) => `- ${s}`)] : []),
  ].join("\n");
}
