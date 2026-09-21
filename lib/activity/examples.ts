/** Reviewed, dated AI outputs. These links never trigger a new model run. */
export type CuratedExample = {
  id: string;
  title: string;
  agency: string;
  description: string;
};
export const curatedExamples: CuratedExample[] = [
  {
    id: "2026-19072",
    title: "Power plant greenhouse gas rules",
    agency: "Environmental Protection Agency",
    description:
      "A final-rule forecast with a checked historical comparison and legal counterarguments.",
  },
  {
    id: "2026-09067",
    title: "Foreign influence in defense contracting",
    agency: "Department of Defense",
    description:
      "Statutory obligations and a past acquisition rule inform the next-action forecast.",
  },
  {
    id: "2026-13347",
    title: "Nondiscrimination requirements for new construction",
    agency: "Department of Energy",
    description:
      "A delay forecast tied to interagency review and a sequence of earlier postponements.",
  },
  {
    id: "2026-13304",
    title: "Nondiscrimination in education programs",
    agency: "Department of Energy",
    description:
      "An assessment of further delay, possible withdrawal, and the signals to watch.",
  },
  {
    id: "2026-13302",
    title: "Low-level radioactive waste disposal",
    agency: "Nuclear Regulatory Commission",
    description:
      "A detailed AI analysis explaining why the evidence cannot yet support a prediction.",
  },
  {
    id: "2026-13305",
    title: "Nondiscrimination in federally funded programs",
    agency: "Department of Energy",
    description:
      "The original example: repeated delays and a dependency on Justice Department action.",
  },
];
