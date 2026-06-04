/**
 * Shared quality rubric (PROJECT.md §7). Fed to BOTH the generator and the
 * critic so they optimize against the same bar.
 */
export const RUBRIC = `QUALITY RUBRIC — every question must satisfy all of these:
1. GROUNDING: the best answer and its explanation cite at least one SPECIFIC fact from the
   candidate's resume facts. Never invent employers, metrics, projects, or skills not present
   in the provided resume facts.
2. DISTRACTORS: the 3 wrong options are plausible things a real candidate might say, each with
   a distinct, identifiable flaw (too generic / dodges the question / wrong emphasis / shaky).
   No obviously-silly throwaway options.
3. JD ALIGNMENT: the question or its answer connects to an explicit requirement, named skill,
   or stated value from the JD facts or company research.
4. EXPLANATION: states WHY the best answer wins AND why the most tempting wrong option falls
   short. Reasoned, not merely assertive.
5. DELIVERY: tactical, specific in-the-room guidance (timing, structure, what to emphasize,
   the trap to avoid). Never generic ("be confident", "smile").
6. BALANCE: spread questions across Culture Fit, Behavioral, Technical, Situational, Role Fit.
7. MUST-HAVE: include at least one strong Role-Fit question addressing the candidate's biggest
   apparent gap or career pivot relative to the JD.`;
