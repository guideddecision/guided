"use client";

import React, { useEffect, useMemo, useState } from "react";

const LETTERS = ["A", "B", "C", "D"];
const QUESTION_COUNTS = [10, 30, 50];

const FALLBACK_THEMES = [
  "Core motivation", "Family", "Daily energy", "Work and business", "Social life",
  "Boredom", "Money pressure", "Sense of home", "Regret", "Short-term pain",
  "Stress", "Support system", "Freedom", "Relationships", "Routine",
  "Ambition", "Obligation", "Resentment", "Location fit", "Future self",
  "Opportunity cost", "Evidence", "Exit plan", "Risk", "Emotional clarity",
  "Recovery", "Community", "Status quo", "Bad-day test", "Best case",
  "Worst case", "Deal-breaker", "Values", "Independence", "Practical viability",
  "Quality time", "Happiness", "Six-month test", "Five-year view", "Meaning",
  "Commitment", "Need for change", "Future options", "Stability", "Lifestyle",
  "Environment", "Self-respect", "Instinct", "Reversibility", "Final weighting"
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").replace(/[“”]/g, '"').trim();
}

function extractDetails(background: string) {
  const raw = String(background || "")
    .split(/[\n.;!?]+/)
    .map((item) => normalizeText(item.replace(/^[-*•\d.)\s]+/, "")))
    .filter((item) => item.length > 5);

  const unique: string[] = [];
  raw.forEach((item) => {
    if (!unique.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
      unique.push(item.length > 150 ? item.slice(0, 147) + "..." : item);
    }
  });

  return unique.length ? unique : ["the background you provided"];
}

function hashString(value: string) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function seededRandom(seed: number) {
  let state = seed || 987654321;
  return function next() {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function fallbackQuestionText(theme: string, detail: string, choiceOne: string, choiceTwo: string) {
  const endings: Record<string, string> = {
    "Core motivation": `which option is closer to the real reason you are asking this question: ${choiceOne} or ${choiceTwo}?`,
    Family: "which option better supports the family connection you actually want?",
    "Daily energy": "which option is more likely to give you energy on an ordinary day?",
    "Work and business": "which option gives your work, business, or future plans the better chance to move forward?",
    "Social life": "which option is more likely to reduce loneliness or social frustration?",
    Boredom: "which option is less likely to leave you bored, stuck, or mentally flat?",
    "Money pressure": "which option feels more financially realistic without creating unnecessary pressure?",
    "Sense of home": "which option feels more like a real home rather than just a practical address?",
    Regret: "which option would you be less likely to regret one year from now?",
    "Short-term pain": "which option has short-term discomfort you would be more willing to accept?"
  };

  return `Given this detail — “${detail}” — ${endings[theme] || `which option gives you the better overall trade-off between ${choiceOne} and ${choiceTwo}?`}`;
}

function fallbackOptions(choiceOne: string, choiceTwo: string, theme: string, detail: string, random: () => number) {
  const focus = theme.toLowerCase();
  return shuffle([
    {
      score: -2,
      text: `For ${focus}, ${choiceOne} protects the part of this decision I would regret losing most.`
    },
    {
      score: -1,
      text: `${choiceOne} seems more workable here, but only if I make a clear plan for the downside shown in this detail.`
    },
    {
      score: 1,
      text: `${choiceTwo} may solve the more important problem, although I would need to accept some discomfort to make it work.`
    },
    {
      score: 2,
      text: `For ${focus}, ${choiceTwo} answers the deeper need behind “${detail}” better than the alternative.`
    }
  ], random).map((option, index) => ({ ...option, letter: LETTERS[index] }));
}

function buildFallbackQuestions({ decision, background, choiceOne, choiceTwo, questionCount }: any) {
  const details = extractDetails(background);
  const seed = hashString(decision + "|" + background + "|" + choiceOne + "|" + choiceTwo + "|" + Date.now());
  const random = seededRandom(seed);

  return FALLBACK_THEMES.slice(0, questionCount).map((theme, index) => {
    const detail = details[index % details.length];
    return {
      id: index + 1,
      theme,
      groundingDetail: detail,
      prompt: fallbackQuestionText(theme, detail, choiceOne, choiceTwo),
      options: fallbackOptions(choiceOne, choiceTwo, theme, detail, random)
    };
  });
}

function buildFallbackTensions(choiceOne: string, choiceTwo: string, background: string) {
  const details = extractDetails(background).slice(0, 4);
  return details.map((detail, index) => ({
    title: `Trade-off ${index + 1}`,
    explanation: detail || `A decision factor between ${choiceOne} and ${choiceTwo}.`
  }));
}

function normalizeAIOptions(options: any[]) {
  if (!Array.isArray(options) || options.length !== 4) throw new Error("Bad AI options");

  const normalized = options.map((option, index) => {
    const score = Number(option.score);
    if (![-2, -1, 1, 2].includes(score)) throw new Error("Bad AI score");
    return {
      letter: LETTERS[index],
      text: normalizeText(option.text) || "Answer option",
      score
    };
  });

  const scoreSet = normalized.map((item) => item.score).sort((a, b) => a - b).join(",");
  if (scoreSet !== "-2,-1,1,2") throw new Error("AI scores must include -2, -1, 1, 2");

  return normalized;
}

function normalizeAIQuestions(data: any, questionCount: number) {
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  if (questions.length !== questionCount) throw new Error("Wrong AI question count");

  return questions.map((question: any, index: number) => {
    const prompt = normalizeText(question.question || question.prompt);
    const theme = normalizeText(question.theme) || `Decision factor ${index + 1}`;
    if (!prompt) throw new Error("Missing AI question text");

    return {
      id: index + 1,
      theme,
      groundingDetail: normalizeText(question.groundingDetail) || theme,
      prompt,
      options: normalizeAIOptions(question.options)
    };
  });
}

function normalizeAITensions(data: any, choiceOne: string, choiceTwo: string, background: string) {
  const tensions = Array.isArray(data?.decisionTensions) ? data.decisionTensions : [];
  const cleaned = tensions
    .map((item: any, index: number) => ({
      title: normalizeText(item.title) || `Decision tension ${index + 1}`,
      explanation: normalizeText(item.explanation) || "This is one of the main trade-offs behind the decision."
    }))
    .filter((item: any) => item.title && item.explanation)
    .slice(0, 6);

  return cleaned.length ? cleaned : buildFallbackTensions(choiceOne, choiceTwo, background);
}

function scoreToRecommendation(raw: number, maxAbs: number, choiceOne: string, choiceTwo: string) {
  const strength = maxAbs ? Math.abs(raw) / maxAbs : 0;
  const favoredChoice = raw < 0 ? choiceOne : choiceTwo;

  if (raw === 0 || strength < 0.10) {
    return {
      label: "No clear winner yet",
      explanation: "Your answers are very close to balanced. This means neither option clearly won based on the answers you gave."
    };
  }

  if (strength >= 0.50) {
    return {
      label: `Strong recommendation: ${favoredChoice}`,
      explanation: `Your answers showed a strong pattern toward ${favoredChoice}. This is not just a small preference; the majority of your stronger answers pointed this way.`
    };
  }

  if (strength >= 0.25) {
    return {
      label: `Clear recommendation: ${favoredChoice}`,
      explanation: `Your answers showed a clear lean toward ${favoredChoice}. There may still be trade-offs, but your weighting is meaningfully stronger in this direction.`
    };
  }

  return {
    label: `Slight lean: ${favoredChoice}`,
    explanation: `Your answers slightly favored ${favoredChoice}. This is a real lean, but you should review the strongest answer signals before making a final decision.`
  };
}

function preferenceSummary(raw: number, maxAbs: number, choiceOne: string, choiceTwo: string) {
  const strengthPercent = maxAbs ? Math.round((Math.abs(raw) / maxAbs) * 100) : 0;

  if (raw === 0 || strengthPercent < 10) {
    return {
      label: "Balanced",
      note: `Your answers are almost evenly split between ${choiceOne} and ${choiceTwo}.`,
      strengthPercent,
      favoredChoice: "Balanced"
    };
  }

  const favoredChoice = raw < 0 ? choiceOne : choiceTwo;
  const label = strengthPercent >= 50 ? "Strong lean" : strengthPercent >= 25 ? "Clear lean" : "Slight lean";

  return {
    label,
    note: `Your answers leaned ${strengthPercent}% toward ${favoredChoice}. This is based on the weighted answer choices, not the 0–100 direction marker.`,
    strengthPercent,
    favoredChoice
  };
}

function categoryBreakdown(questions: any[], answers: any) {
  return questions
    .map((question) => ({ question, answer: answers[question.id] }))
    .filter((item) => item.answer)
    .map(({ question, answer }) => ({
      theme: question.theme,
      score: answer.score,
      direction: answer.score < 0 ? "left" : answer.score > 0 ? "right" : "balanced"
    }));
}

function categoryMeaning(item: any, choiceOne: string, choiceTwo: string) {
  const favoredChoice = item.direction === "left" ? choiceOne : item.direction === "right" ? choiceTwo : "Balanced";
  const strength = Math.abs(item.score) === 2 ? "Strong signal" : Math.abs(item.score) === 1 ? "Slight signal" : "Balanced";
  return {
    favoredChoice,
    strength,
    explanation: item.direction === "balanced" ? "This area did not clearly point either way." : `${item.theme} pointed ${strength.toLowerCase()} toward ${favoredChoice}.`,
    strengthPercent: Math.abs(item.score) * 50
  };
}

function assessBackgroundQuality(background: string, decision: string, choiceOne: string, choiceTwo: string) {
  const text = normalizeText(background);
  const lower = text.toLowerCase();
  const wordCount = text ? text.split(/\s+/).length : 0;

  const checks = [
    {
      key: "enough detail",
      passed: wordCount >= 80,
      missing: "more detail about what is really driving the decision"
    },
    {
      key: "both options",
      passed: lower.includes(choiceOne.toLowerCase().split(" ")[0] || "choiceone") || lower.includes(choiceTwo.toLowerCase().split(" ")[0] || "choicetwo"),
      missing: "how each option would actually look in real life"
    },
    {
      key: "timeline",
      passed: /\b(today|tomorrow|week|month|year|soon|later|now|future|12 months|six months|five years)\b/i.test(text),
      missing: "the time period you are deciding for"
    },
    {
      key: "people",
      passed: /\b(family|children|partner|friend|friends|parents|kids|team|community|single|relationship)\b/i.test(text),
      missing: "who else is affected by the choice"
    },
    {
      key: "money or practical pressure",
      passed: /\b(money|cost|income|business|work|job|career|rent|debt|salary|cash|financial|afford|company)\b/i.test(text),
      missing: "money, work, or practical constraints"
    },
    {
      key: "emotional stakes",
      passed: /\b(fear|worry|bored|lonely|stress|happy|regret|excited|sad|pressure|energy|motivation|love|like|hate)\b/i.test(text),
      missing: "the emotional cost of each option"
    },
    {
      key: "risk or reversibility",
      passed: /\b(risk|reverse|reversible|irreversible|hard to change|fallback|backup|exit|safe|uncertain|guarantee)\b/i.test(text),
      missing: "what happens if the first choice is wrong"
    }
  ];

  const passed = checks.filter((check) => check.passed);
  const missing = checks.filter((check) => !check.passed).map((check) => check.missing);
  const score = Math.round((passed.length / checks.length) * 100);
  const level = score >= 75 ? "Strong" : score >= 45 ? "Medium" : "Needs more detail";

  return {
    score,
    level,
    strengths: passed.map((check) => check.key),
    missing,
    suggestions: missing.slice(0, 4)
  };
}

function buildFollowUpQuestions({ decision, choiceOne, choiceTwo, backgroundQuality }: any) {
  const missing = Array.isArray(backgroundQuality?.missing) ? backgroundQuality.missing : [];
  const questions = [
    {
      id: "best-case-one",
      label: `What is the strongest real reason to choose ${choiceOne}?`,
      placeholder: `Example: ${choiceOne} would be better because...`
    },
    {
      id: "best-case-two",
      label: `What is the strongest real reason to choose ${choiceTwo}?`,
      placeholder: `Example: ${choiceTwo} would be better because...`
    },
    {
      id: "worst-case",
      label: "What is the outcome you most want to avoid?",
      placeholder: "Example: I do not want to end up..."
    },
    {
      id: "non-negotiable",
      label: "Is there any non-negotiable fact that should override the quiz result?",
      placeholder: "Example: money, family, health, legal, children, timing..."
    },
    {
      id: "decision-test",
      label: "What would make you feel, six months from now, that this was the right decision?",
      placeholder: "Example: I would know it was right if..."
    }
  ];

  const missingQuestionMap: Record<string, any> = {
    "the time period you are deciding for": {
      id: "timeline",
      label: "What timeline are you really deciding for?",
      placeholder: "Example: the next 6 months, 12 months, 5 years..."
    },
    "who else is affected by the choice": {
      id: "people-affected",
      label: "Who is most affected by this decision, besides you?",
      placeholder: "Example: family, children, partner, team, friends..."
    },
    "money, work, or practical constraints": {
      id: "practical-constraints",
      label: "What practical or financial constraints matter most?",
      placeholder: "Example: income, business momentum, housing, work, debt..."
    },
    "the emotional cost of each option": {
      id: "emotional-cost",
      label: "What is the emotional cost of each option?",
      placeholder: "Example: loneliness, boredom, pressure, guilt, regret..."
    },
    "what happens if the first choice is wrong": {
      id: "reversibility",
      label: "If your first choice is wrong, how easy would it be to change course?",
      placeholder: "Example: I could reverse it by..., or it would be hard because..."
    }
  };

  const extra = missing.map((item: string) => missingQuestionMap[item]).filter(Boolean);
  const combined = [...extra, ...questions];
  const seen = new Set();
  return combined.filter((question) => {
    if (seen.has(question.id)) return false;
    seen.add(question.id);
    return true;
  }).slice(0, 5);
}

function buildEnhancedBackground(background: string, followUpQuestions: any[], followUpAnswers: any) {
  const answered = followUpQuestions
    .map((question) => ({
      label: question.label,
      answer: normalizeText(followUpAnswers[question.id])
    }))
    .filter((item) => item.answer);

  if (!answered.length) return normalizeText(background);

  return `${normalizeText(background)}

Additional clarification from follow-up questions:
${answered.map((item, index) => `${index + 1}. ${item.label} ${item.answer}`).join("\n")}`;
}

function getDecisionInsights(session: any, answers: any, scoreData: any) {
  const answered = session.questions
    .map((question: any) => ({ question, answer: answers[question.id] }))
    .filter((item: any) => item.answer);

  const choiceOneSignals = answered
    .filter((item: any) => item.answer.score < 0)
    .sort((a: any, b: any) => Math.abs(b.answer.score) - Math.abs(a.answer.score))
    .slice(0, 3);

  const choiceTwoSignals = answered
    .filter((item: any) => item.answer.score > 0)
    .sort((a: any, b: any) => Math.abs(b.answer.score) - Math.abs(a.answer.score))
    .slice(0, 3);

  const favoredChoice = scoreData.raw < 0 ? session.choiceOne : scoreData.raw > 0 ? session.choiceTwo : "Balanced";
  const opposingSignals = favoredChoice === session.choiceOne ? choiceTwoSignals : favoredChoice === session.choiceTwo ? choiceOneSignals : [...choiceOneSignals, ...choiceTwoSignals];

  const topReasonText = (item: any) => item ? `${item.question.theme}: ${item.answer.text}` : "No strong signal recorded.";

  const unresolvedConflict = opposingSignals.length
    ? `The main unresolved pull is ${topReasonText(opposingSignals[0])}`
    : "There was no major opposing signal in your answers, but you should still check for any hard fact you may not have included.";

  const suggestedNextStep = favoredChoice === "Balanced"
    ? "List the one or two facts that would break the tie, then rerun the decision with those details included."
    : `Before acting on ${favoredChoice}, test the decision against the unresolved conflict and any non-negotiable facts. If those still hold, make a small practical next step toward ${favoredChoice}.`;

  return {
    favoredChoice,
    topReasonsOne: choiceOneSignals.map(topReasonText),
    topReasonsTwo: choiceTwoSignals.map(topReasonText),
    unresolvedConflict,
    suggestedNextStep
  };
}

function BackgroundQualityCard({ quality }: any) {
  const color = quality.level === "Strong" ? "emerald" : quality.level === "Medium" ? "amber" : "red";
  const classes: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800"
  };

  return (
    <div className={cx("rounded-3xl border p-5", classes[color])}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] opacity-80">Background quality</p>
          <p className="mt-1 text-2xl font-black">{quality.level}</p>
        </div>
        <div className="rounded-2xl bg-white/70 px-4 py-2 text-lg font-black">{quality.score}/100</div>
      </div>
      {quality.suggestions?.length > 0 && (
        <div className="mt-3 space-y-1 text-sm font-semibold leading-relaxed">
          <p>Add more detail about:</p>
          {quality.suggestions.map((item: string, index: number) => <p key={`${item}-${index}`}>• {item}</p>)}
        </div>
      )}
    </div>
  );
}

function PageShell({ children }: any) {
  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 text-slate-950">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-28 -top-28 h-96 w-96 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="absolute right-0 top-24 h-[30rem] w-[30rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-amber-300/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return <div className={cx("rounded-[2rem] border border-white/70 bg-white/90 shadow-2xl shadow-slate-950/15 backdrop-blur-xl", className)}>{children}</div>;
}

function Eyebrow({ children, light = false }: any) {
  return <p className={cx("text-xs font-black uppercase tracking-[0.22em]", light ? "text-cyan-100/80" : "text-cyan-700")}>{children}</p>;
}

function PrimaryButton({ children, className = "", ...props }: any) {
  return (
    <button className={cx("rounded-2xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 px-6 py-4 font-black text-white shadow-xl shadow-blue-950/20 transition hover:-translate-y-0.5 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0", className)} {...props}>
      {children}
    </button>
  );
}

function SecondaryButton({ children, className = "", ...props }: any) {
  return (
    <button className={cx("rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0", className)} {...props}>
      {children}
    </button>
  );
}

function ProgressBar({ value, dark = false }: any) {
  return (
    <div className={cx("h-3 w-full overflow-hidden rounded-full", dark ? "bg-white/20 ring-1 ring-white/20" : "bg-slate-200")}>
      <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-fuchsia-400 shadow-lg shadow-cyan-500/30 transition-all duration-500" style={{ width: Math.min(100, Math.max(0, value)) + "%" }} />
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <div className="text-sm font-extrabold text-slate-700">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function inputClass(accent = "cyan") {
  const focus = accent === "fuchsia" ? "focus:border-fuchsia-400 focus:ring-fuchsia-100" : "focus:border-cyan-400 focus:ring-cyan-100";
  return cx("w-full rounded-3xl border border-slate-200 bg-slate-50/80 p-5 font-medium leading-relaxed outline-none transition focus:bg-white focus:ring-4", focus);
}

function ChoicePreview({ label, value, side }: any) {
  return (
    <div className={cx("rounded-3xl border p-5 shadow-sm", side === "left" ? "border-cyan-100 bg-cyan-50" : "border-fuchsia-100 bg-fuchsia-50")}>
      <p className={cx("text-xs font-black uppercase tracking-[0.18em]", side === "left" ? "text-cyan-700" : "text-fuchsia-700")}>{label}</p>
      <p className="mt-2 text-lg font-black leading-snug text-slate-900">{value}</p>
    </div>
  );
}

function StatCard({ label, value, note }: any) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{value}</p>
      <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">{note}</p>
    </div>
  );
}

function ResultGauge({ score, raw, maxAbs, choiceOne, choiceTwo }: any) {
  const strengthPercent = maxAbs ? Math.round((Math.abs(raw) / maxAbs) * 100) : 0;
  const favoredChoice = raw < 0 ? choiceOne : raw > 0 ? choiceTwo : "Balanced";

  return (
    <div className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-inner">
      <div className="mb-3 flex justify-between gap-4 text-xs font-black uppercase tracking-[0.14em] text-white/60">
        <span>{choiceOne}</span>
        <span className="text-right">{choiceTwo}</span>
      </div>
      <div className="relative h-6 rounded-full bg-white/10">
        <div className="absolute left-0 top-0 h-6 rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-fuchsia-400" style={{ width: score + "%" }} />
        <div className="absolute -top-2 h-10 w-1.5 rounded-full bg-white shadow-lg shadow-white/30" style={{ left: "calc(" + score + "% - 3px)" }} />
      </div>
      <div className="mt-3 text-center text-sm font-bold text-white/70">
        Direction marker: <span className="text-white">{score}/100</span>
      </div>
      <div className="mt-1 text-center text-sm font-bold text-white/70">
        Lean strength: <span className="text-white">{strengthPercent}% toward {favoredChoice}</span>
      </div>
    </div>
  );
}

function ApiStatusBadge({ status, hasKey }: any) {
  const styles: any = {
    checking: "bg-slate-100 text-slate-600 border-slate-200",
    connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
    missingKey: "bg-amber-50 text-amber-800 border-amber-200",
    offline: "bg-red-50 text-red-700 border-red-200"
  };

  const labels: any = {
    checking: "Checking AI connection...",
    connected: "AI connected",
    missingKey: "API route found, key missing",
    offline: "AI not connected"
  };

  return (
    <div className={cx("inline-flex items-center rounded-full border px-4 py-2 text-sm font-black", styles[status] || styles.offline)}>
      {labels[status] || "AI not connected"}{status === "connected" && hasKey ? "" : ""}
    </div>
  );
}

export default function GuidedDecisionAIApp() {
  const [decision, setDecision] = useState("");
  const [choiceOne, setChoiceOne] = useState("");
  const [choiceTwo, setChoiceTwo] = useState("");
  const [background, setBackground] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [useAi, setUseAi] = useState(true);

  const [apiStatus, setApiStatus] = useState("checking");
  const [apiHasKey, setApiHasKey] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteDraft, setRewriteDraft] = useState("");
  const [rewriteNotes, setRewriteNotes] = useState<string[]>([]);
  const [rewriteError, setRewriteError] = useState("");

  const [showFollowUps, setShowFollowUps] = useState(false);
  const [followUpQuestions, setFollowUpQuestions] = useState<any[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<any>({});
  const [backgroundQuality, setBackgroundQuality] = useState<any>(null);

  const [session, setSession] = useState<any>(null);
  const [answers, setAnswers] = useState<any>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  const completedCount = Object.keys(answers).length;
  const currentQuestion = session?.questions?.[activeIndex];
  const previewDetails = useMemo(() => extractDetails(background).slice(0, 5), [background]);
  const previewBackgroundQuality = useMemo(
    () => assessBackgroundQuality(background, decision, choiceOne, choiceTwo),
    [background, decision, choiceOne, choiceTwo]
  );

  useEffect(() => {
    checkApiConnection();
  }, []);

  async function checkApiConnection() {
    setApiStatus("checking");
    try {
      const response = await fetch("/api/generate-questions", { method: "GET" });
      if (!response.ok) throw new Error("API route not available");
      const data = await response.json();
      setApiHasKey(Boolean(data.hasKey));
      setApiStatus(data.hasKey ? "connected" : "missingKey");
    } catch {
      setApiHasKey(false);
      setApiStatus("offline");
    }
  }

  const scoreData = useMemo(() => {
    if (!session) return null;
    const raw = session.questions.reduce((total: number, question: any) => total + (answers[question.id]?.score || 0), 0);
    const maxAbs = session.questions.length * 2;
    const score = Math.round(((raw + maxAbs) / (maxAbs * 2)) * 100);
    return {
      raw,
      maxAbs,
      score,
      leanSummary: preferenceSummary(raw, maxAbs, session.choiceOne, session.choiceTwo),
      recommendation: scoreToRecommendation(raw, maxAbs, session.choiceOne, session.choiceTwo)
    };
  }, [answers, session]);

  const breakdown = useMemo(() => {
    if (!session) return [];
    return categoryBreakdown(session.questions, answers);
  }, [answers, session]);

  async function generateWithAI(effectiveBackground: string) {
    const response = await fetch("/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: normalizeText(decision),
        choiceOne: normalizeText(choiceOne),
        choiceTwo: normalizeText(choiceTwo),
        background: normalizeText(effectiveBackground),
        questionCount
      })
    });

    if (!response.ok) throw new Error("AI generation failed");
    const data = await response.json();

    return {
      questions: normalizeAIQuestions(data, questionCount),
      decisionTensions: normalizeAITensions(data, choiceOne, choiceTwo, effectiveBackground)
    };
  }

  async function rewriteBackground() {
    if (!useAi) {
      setRewriteError("AI mode is switched off. Turn AI mode on to rewrite the background.");
      return;
    }
    if (isRewriting || !normalizeText(decision) || !normalizeText(choiceOne) || !normalizeText(choiceTwo) || !normalizeText(background)) return;

    setIsRewriting(true);
    setRewriteError("");
    setRewriteDraft("");
    setRewriteNotes([]);

    try {
      const response = await fetch("/api/rewrite-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: normalizeText(decision),
          choiceOne: normalizeText(choiceOne),
          choiceTwo: normalizeText(choiceTwo),
          background: normalizeText(background)
        })
      });

      if (!response.ok) throw new Error("Rewrite failed");
      const data = await response.json();

      setRewriteDraft(normalizeText(data.rewrittenBackground || ""));
      setRewriteNotes(Array.isArray(data.improvements) ? data.improvements.map(normalizeText).filter(Boolean) : []);
    } catch {
      setRewriteError("AI rewrite is not available. Check that /api/rewrite-background exists and your API key is set.");
    } finally {
      setIsRewriting(false);
    }
  }

  function beginFollowUpReview() {
    if (isGenerating || !normalizeText(decision) || !normalizeText(choiceOne) || !normalizeText(choiceTwo) || !normalizeText(background)) return;

    const quality = assessBackgroundQuality(background, decision, choiceOne, choiceTwo);
    const questions = buildFollowUpQuestions({ decision, choiceOne, choiceTwo, backgroundQuality: quality });

    setBackgroundQuality(quality);
    setFollowUpQuestions(questions);
    setFollowUpAnswers({});
    setShowFollowUps(true);
    setSession(null);
    setAnswers({});
    setActiveIndex(0);
    setFinished(false);
  }

  async function startQuiz(skipFollowUps = false) {
    if (isGenerating || !normalizeText(decision) || !normalizeText(choiceOne) || !normalizeText(choiceTwo) || !normalizeText(background)) return;

    const effectiveBackground = buildEnhancedBackground(background, followUpQuestions, skipFollowUps ? {} : followUpAnswers);
    const quality = backgroundQuality || assessBackgroundQuality(background, decision, choiceOne, choiceTwo);

    setIsGenerating(true);
    let questions;
    let decisionTensions;
    let source = useAi ? "ai" : "local";

    if (!useAi) {
      questions = buildFallbackQuestions({ decision, background: effectiveBackground, choiceOne, choiceTwo, questionCount });
      decisionTensions = buildFallbackTensions(choiceOne, choiceTwo, effectiveBackground);
    } else {
      try {
        const generated = await generateWithAI(effectiveBackground);
        questions = generated.questions;
        decisionTensions = generated.decisionTensions;
        setApiStatus("connected");
        setApiHasKey(true);
      } catch {
        questions = buildFallbackQuestions({ decision, background: effectiveBackground, choiceOne, choiceTwo, questionCount });
        decisionTensions = buildFallbackTensions(choiceOne, choiceTwo, effectiveBackground);
        source = "fallback";
        if (apiStatus === "checking") setApiStatus("offline");
      }
    }

    setSession({
      decision: normalizeText(decision),
      background: normalizeText(effectiveBackground),
      originalBackground: normalizeText(background),
      choiceOne: normalizeText(choiceOne),
      choiceTwo: normalizeText(choiceTwo),
      questionCount,
      source,
      backgroundQuality: quality,
      followUpAnswers: followUpQuestions.map((question) => ({
        question: question.label,
        answer: normalizeText(followUpAnswers[question.id])
      })).filter((item) => item.answer),
      decisionTensions,
      questions
    });
    setAnswers({});
    setActiveIndex(0);
    setFinished(false);
    setShowFollowUps(false);
    setIsGenerating(false);
  }

  function selectAnswer(option: any) {
    if (!currentQuestion) return;
    setAnswers((previous: any) => ({
      ...previous,
      [currentQuestion.id]: {
        score: option.score,
        letter: option.letter,
        text: option.text,
        theme: currentQuestion.theme,
        question: currentQuestion.prompt
      }
    }));
  }

  function goNext() {
    if (!session || !currentQuestion || !answers[currentQuestion.id]) return;
    if (activeIndex < session.questions.length - 1) {
      setActiveIndex((index) => index + 1);
    } else if (completedCount === session.questions.length) {
      setFinished(true);
    }
  }

  function resetAll() {
    setSession(null);
    setAnswers({});
    setActiveIndex(0);
    setFinished(false);
    setQuestionCount(10);
    setDecision("");
    setChoiceOne("");
    setChoiceTwo("");
    setBackground("");
    setRewriteDraft("");
    setRewriteNotes([]);
    setRewriteError("");
    setShowFollowUps(false);
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setBackgroundQuality(null);
  }

  function getSourceLabel(source: string) {
    if (source === "ai") return "AI-generated questions";
    if (source === "local") return "Local test mode - AI off";
    return "Fallback questions used";
  }

  async function downloadConclusionReport() {
    if (!session || !scoreData) return;

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 44;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const clean = (value: any) => String(value ?? "").replace(/\s+/g, " ").trim();
      const fileSafe = (value: any) => clean(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 44) || "decision-report";
      const reportDate = new Date().toLocaleString();
      const reportBreakdown = categoryBreakdown(session.questions, answers);
      const leanStrength = scoreData.maxAbs ? Math.round((Math.abs(scoreData.raw) / scoreData.maxAbs) * 100) : 0;
      const favoredChoice = scoreData.raw < 0 ? session.choiceOne : scoreData.raw > 0 ? session.choiceTwo : "Balanced";
      const reportInsights = getDecisionInsights(session, answers, scoreData);
      const reportQuality = session.backgroundQuality || assessBackgroundQuality(session.originalBackground || session.background, session.decision, session.choiceOne, session.choiceTwo);
      const answeredQuestions = session.questions
        .map((question: any) => ({ question, answer: answers[question.id] }))
        .filter((item: any) => item.answer);
      const strongestSignals = answeredQuestions
        .sort((a: any, b: any) => Math.abs(b.answer.score) - Math.abs(a.answer.score))
        .slice(0, 8);

      function setColor(color: [number, number, number]) {
        doc.setTextColor(color[0], color[1], color[2]);
      }

      function addPageIfNeeded(requiredHeight = 40) {
        if (y + requiredHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      }

      function writeText(text: any, options: any = {}) {
        const x = options.x || margin;
        const width = options.width || contentWidth;
        const fontSize = options.fontSize || 10;
        const lineHeight = options.lineHeight || fontSize + 4;
        const style = options.style || "normal";
        const color = options.color || [51, 65, 85];
        const before = options.before || 0;
        const after = options.after || 0;

        y += before;
        doc.setFont("helvetica", style);
        doc.setFontSize(fontSize);
        setColor(color);

        const paragraphs = String(text ?? "")
          .replace(/\r/g, "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);

        if (!paragraphs.length) {
          return;
        }

        paragraphs.forEach((paragraph, paragraphIndex) => {
          const lines = doc.splitTextToSize(paragraph, width);
          lines.forEach((line: string) => {
            addPageIfNeeded(lineHeight + 2);
            doc.text(line, x, y);
            y += lineHeight;
          });
          if (paragraphIndex < paragraphs.length - 1) y += Math.max(4, lineHeight / 2);
        });

        y += after;
      }

      function sectionTitle(title: string) {
        addPageIfNeeded(55);
        y += 12;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        setColor([15, 23, 42]);
        doc.text(title, margin, y);
        y += 9;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(1);
        doc.line(margin, y, pageWidth - margin, y);
        y += 18;
      }

      function subTitle(title: string) {
        addPageIfNeeded(34);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        setColor([15, 23, 42]);
        doc.text(title, margin, y);
        y += 16;
      }

      function bulletList(items: any[], emptyText = "None recorded.") {
        const list = items && items.length ? items : [emptyText];
        list.forEach((item) => {
          const textLines = doc.splitTextToSize(clean(item), contentWidth - 18);
          addPageIfNeeded(textLines.length * 13 + 10);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          setColor([51, 65, 85]);
          doc.text("•", margin, y);
          doc.text(textLines, margin + 14, y);
          y += textLines.length * 13 + 6;
        });
      }

      function keyValue(label: string, value: any) {
        addPageIfNeeded(34);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        setColor([100, 116, 139]);
        doc.text(label.toUpperCase(), margin, y);
        y += 13;
        writeText(value, { fontSize: 10, lineHeight: 14, color: [30, 41, 59], after: 6 });
      }

      function callout(title: string, body: any, accent: "cyan" | "fuchsia" | "slate" = "slate") {
        const fill = accent === "cyan" ? [236, 254, 255] : accent === "fuchsia" ? [253, 244, 255] : [248, 250, 252];
        const stroke = accent === "cyan" ? [165, 243, 252] : accent === "fuchsia" ? [245, 208, 254] : [226, 232, 240];

        const titleLines = doc.splitTextToSize(clean(title), contentWidth - 28);
        const bodyLines = doc.splitTextToSize(clean(body), contentWidth - 28);
        const height = Math.max(72, 18 + titleLines.length * 14 + bodyLines.length * 13 + 22);

        if (height > pageHeight - margin * 2) {
          subTitle(title);
          writeText(body, { fontSize: 10, lineHeight: 14, after: 8 });
          return;
        }

        addPageIfNeeded(height + 10);
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
        doc.roundedRect(margin, y, contentWidth, height, 14, 14, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        setColor([15, 23, 42]);
        doc.text(titleLines, margin + 14, y + 22);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        setColor([51, 65, 85]);
        doc.text(bodyLines, margin + 14, y + 22 + titleLines.length * 15 + 8);

        y += height + 10;
      }

      function compactTableRow(columns: string[], widths: number[], header = false) {
        const lineArrays = columns.map((col, index) => doc.splitTextToSize(clean(col), widths[index] - 12));
        const rowHeight = Math.max(28, ...lineArrays.map((lines) => lines.length * 11 + 14));
        addPageIfNeeded(rowHeight + 2);

        let x = margin;
        columns.forEach((_, index) => {
          if (header) {
            doc.setFillColor(15, 23, 42);
            doc.setDrawColor(15, 23, 42);
          } else {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
          }

          doc.rect(x, y, widths[index], rowHeight, "FD");
          doc.setFont("helvetica", header ? "bold" : "normal");
          doc.setFontSize(header ? 8 : 8.5);
          setColor(header ? [255, 255, 255] : [51, 65, 85]);
          doc.text(lineArrays[index], x + 6, y + 13);
          x += widths[index];
        });

        y += rowHeight;
      }

      // Cover / header
      doc.setFillColor(2, 6, 23);
      doc.roundedRect(margin, y, contentWidth, 136, 20, 20, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setColor([165, 243, 252]);
      doc.text("GUIDED DECISION REPORT", margin + 24, y + 30);

      doc.setFontSize(22);
      setColor([255, 255, 255]);
      doc.text(doc.splitTextToSize(clean(scoreData.recommendation.label), contentWidth - 48).slice(0, 2), margin + 24, y + 60);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      setColor([226, 232, 240]);
      doc.text(doc.splitTextToSize(clean(scoreData.recommendation.explanation), contentWidth - 48).slice(0, 3), margin + 24, y + 100);

      y += 166;

      sectionTitle("1. Executive summary");
      keyValue("Life question", session.decision);
      keyValue("Choice 1", session.choiceOne);
      keyValue("Choice 2", session.choiceTwo);
      keyValue("Report date", reportDate);
      keyValue("Question mode", getSourceLabel(session.source));
      keyValue("Questions answered", `${Object.keys(answers).length}/${session.questions.length}`);

      callout(
        "Decision lean",
        `${scoreData.leanSummary.label}. ${scoreData.leanSummary.note}\nDirection marker: ${scoreData.score}/100.\nLean strength: ${leanStrength}% toward ${favoredChoice}.\nRaw weighted tally: ${scoreData.raw}.`,
        "slate"
      );

      sectionTitle("2. Why the result leaned this way");
      callout(`Top reasons toward ${session.choiceOne}`, reportInsights.topReasonsOne.length ? reportInsights.topReasonsOne.join("\n") : "No strong signal recorded.", "cyan");
      callout(`Top reasons toward ${session.choiceTwo}`, reportInsights.topReasonsTwo.length ? reportInsights.topReasonsTwo.join("\n") : "No strong signal recorded.", "fuchsia");
      callout("Biggest unresolved conflict", reportInsights.unresolvedConflict, "slate");
      callout("Suggested next step", reportInsights.suggestedNextStep, "slate");

      sectionTitle("3. Background quality and follow-up context");
      keyValue("Background quality", `${reportQuality.level} (${reportQuality.score}/100)`);
      if (reportQuality.strengths?.length) {
        subTitle("Useful background included");
        bulletList(reportQuality.strengths);
      }
      if (reportQuality.suggestions?.length) {
        subTitle("Missing or thin areas");
        bulletList(reportQuality.suggestions);
      }

      if (session.followUpAnswers?.length) {
        subTitle("Follow-up answers used");
        session.followUpAnswers.forEach((item: any, index: number) => {
          callout(`Follow-up ${index + 1}`, `${item.question}\n${item.answer}`, index % 2 === 0 ? "cyan" : "fuchsia");
        });
      } else {
        writeText("No follow-up answers were added before the quiz.", { color: [100, 116, 139], after: 8 });
      }

      sectionTitle("4. Decision tensions");
      if (session.decisionTensions?.length) {
        session.decisionTensions.forEach((tension: any, index: number) => {
          callout(`${index + 1}. ${tension.title}`, tension.explanation, index % 2 === 0 ? "cyan" : "fuchsia");
        });
      } else {
        writeText("No decision tensions were recorded.", { color: [100, 116, 139] });
      }

      sectionTitle("5. Strongest answer signals");
      if (strongestSignals.length) {
        strongestSignals.forEach(({ question, answer }: any, index: number) => {
          callout(
            `Signal ${index + 1}: ${question.theme}`,
            `${question.prompt}\nSelected ${answer.letter}: ${answer.text}\nHidden score: ${answer.score}`,
            "slate"
          );
        });
      } else {
        writeText("No strongest signals were recorded.", { color: [100, 116, 139] });
      }

      sectionTitle("6. Category breakdown");
      if (reportBreakdown.length) {
        const widths = [112, 80, 112, contentWidth - 304];
        compactTableRow(["Area", "Signal", "Leans toward", "Meaning"], widths, true);
        reportBreakdown.forEach((item: any) => {
          const insight = categoryMeaning(item, session.choiceOne, session.choiceTwo);
          compactTableRow([item.theme, insight.strength, insight.favoredChoice, insight.explanation], widths, false);
        });
      } else {
        writeText("No category breakdown was recorded.", { color: [100, 116, 139] });
      }

      sectionTitle("7. Full answer log");
      if (answeredQuestions.length) {
        answeredQuestions.forEach(({ question, answer }: any) => {
          subTitle(`Question ${question.id}: ${question.theme}`);
          writeText(question.prompt, { fontSize: 9.5, lineHeight: 13, color: [30, 41, 59], after: 3 });
          writeText(`Selected ${answer.letter}: ${answer.text}`, { fontSize: 9.5, lineHeight: 13, color: [71, 85, 105], after: 3 });
          writeText(`Hidden score: ${answer.score}`, { fontSize: 8.5, lineHeight: 11, color: [100, 116, 139], after: 7 });
        });
      } else {
        writeText("No answer log was recorded.", { color: [100, 116, 139] });
      }

      sectionTitle("8. Background used");
      writeText(session.background, { fontSize: 10, lineHeight: 14, color: [51, 65, 85] });

      sectionTitle("Important note");
      writeText(
        "This report is a structured reflection tool, not a guarantee of the correct life choice. Use it to understand your weighting, revisit non-negotiable facts, and sanity-check the result before making a final decision.",
        { fontSize: 9, lineHeight: 12, color: [100, 116, 139] }
      );

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        setColor([148, 163, 184]);
        doc.text(`Guided Decision Report · Page ${page} of ${pageCount}`, margin, pageHeight - 22);
        doc.text(reportDate, pageWidth - margin, pageHeight - 22, { align: "right" });
      }

      doc.save(`${fileSafe(session.decision)}.pdf`);
    } catch (error) {
      console.error(error);
      alert("The PDF could not be generated. Make sure the jspdf package is installed by running: npm install jspdf");
    }
  }




  if (showFollowUps) {
    const answeredCount = Object.values(followUpAnswers).filter((value) => normalizeText(value)).length;

    return (
      <PageShell>
        <div className="mx-auto max-w-5xl space-y-6">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-7 text-white sm:p-9">
              <Eyebrow light>Clarify before the quiz</Eyebrow>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Add the details that make the questions better.</h1>
              <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-200">
                These follow-up answers are added to your background before the AI creates the quiz. They are optional, but they help the questions and final report become more specific.
              </p>
            </div>
          </Card>

          {backgroundQuality && <BackgroundQualityCard quality={backgroundQuality} />}

          <Card className="p-6 sm:p-8">
            <div className="space-y-5">
              {followUpQuestions.map((question, index) => (
                <Field key={question.id} label={`${index + 1}. ${question.label}`}>
                  <textarea
                    value={followUpAnswers[question.id] || ""}
                    onChange={(event) => setFollowUpAnswers((previous: any) => ({ ...previous, [question.id]: event.target.value }))}
                    rows={3}
                    className={inputClass()}
                    placeholder={question.placeholder}
                  />
                </Field>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SecondaryButton onClick={() => setShowFollowUps(false)}>Back to setup</SecondaryButton>
              <div className="flex flex-col gap-3 sm:flex-row">
                <SecondaryButton onClick={() => startQuiz(true)} disabled={isGenerating}>Skip follow-ups</SecondaryButton>
                <PrimaryButton onClick={() => startQuiz(false)} disabled={isGenerating}>
                  {isGenerating ? "Creating questions..." : `Generate ${questionCount} questions${answeredCount ? ` with ${answeredCount} clarification${answeredCount === 1 ? "" : "s"}` : ""}`}
                </PrimaryButton>
              </div>
            </div>
          </Card>
        </div>
      </PageShell>
    );
  }

  if (finished && session && scoreData) {
    const strongestSignals = session.questions
      .map((question: any) => ({ question, answer: answers[question.id] }))
      .filter((item: any) => item.answer)
      .sort((a: any, b: any) => Math.abs(b.answer.score) - Math.abs(a.answer.score))
      .slice(0, 6);
    const decisionInsights = getDecisionInsights(session, answers, scoreData);

    return (
      <PageShell>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="bg-white p-7 sm:p-9">
                <Eyebrow>Final recommendation</Eyebrow>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{scoreData.recommendation.label}</h1>
                <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-600">{scoreData.recommendation.explanation}</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <SecondaryButton onClick={resetAll}>New decision</SecondaryButton>
                  <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">{session.questions.length} questions completed</div>
                  <div className={cx("rounded-2xl px-4 py-3 text-sm font-bold", session.source === "ai" ? "bg-emerald-50 text-emerald-700" : session.source === "local" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800")}>
                    {getSourceLabel(session.source)}
                  </div>
                  <SecondaryButton onClick={downloadConclusionReport}>Download PDF report</SecondaryButton>
                </div>
              </div>
              <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950 p-7 sm:p-9">
                <ResultGauge score={scoreData.score} raw={scoreData.raw} maxAbs={scoreData.maxAbs} choiceOne={session.choiceOne} choiceTwo={session.choiceTwo} />
                <div className="mt-5 grid gap-3">
                  <StatCard label="Decision lean" value={scoreData.leanSummary.label} note={scoreData.leanSummary.note} />
                  <StatCard label="Questions" value={`${completedCount}/${session.questions.length}`} note="Every question was grounded in your background." />
                </div>
              </div>
            </div>
          </Card>

          {session.decisionTensions?.length > 0 && (
            <Card className="p-6 sm:p-7">
              <Eyebrow>Decision tensions</Eyebrow>
              <h2 className="mt-2 text-2xl font-black tracking-tight">The real trade-offs behind your answers</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {session.decisionTensions.map((tension: any, index: number) => (
                  <div key={`${tension.title}-${index}`} className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
                    <p className="font-black text-slate-900">{tension.title}</p>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{tension.explanation}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6 sm:p-7">
            <Eyebrow>Conclusion details</Eyebrow>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Why the result leaned this way</h2>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-5">
                <p className="font-black text-cyan-800">Top reasons toward {session.choiceOne}</p>
                <div className="mt-3 space-y-2">
                  {decisionInsights.topReasonsOne.length ? decisionInsights.topReasonsOne.map((reason: string, index: number) => (
                    <p key={`${reason}-${index}`} className="text-sm font-semibold leading-relaxed text-slate-700">• {reason}</p>
                  )) : <p className="text-sm font-semibold text-slate-500">No strong signal recorded.</p>}
                </div>
              </div>
              <div className="rounded-3xl border border-fuchsia-100 bg-fuchsia-50 p-5">
                <p className="font-black text-fuchsia-800">Top reasons toward {session.choiceTwo}</p>
                <div className="mt-3 space-y-2">
                  {decisionInsights.topReasonsTwo.length ? decisionInsights.topReasonsTwo.map((reason: string, index: number) => (
                    <p key={`${reason}-${index}`} className="text-sm font-semibold leading-relaxed text-slate-700">• {reason}</p>
                  )) : <p className="text-sm font-semibold text-slate-500">No strong signal recorded.</p>}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
                <p className="font-black text-amber-800">Biggest unresolved conflict</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">{decisionInsights.unresolvedConflict}</p>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                <p className="font-black text-slate-900">Suggested next step</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">{decisionInsights.suggestedNextStep}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6 sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Eyebrow>Signal review</Eyebrow>
                  <h2 className="mt-2 text-2xl font-black tracking-tight">Strongest answer signals</h2>
                </div>
                <div className="rounded-full bg-cyan-50 px-4 py-2 text-sm font-black text-cyan-700">Top 6</div>
              </div>
              <div className="mt-5 space-y-4">
                {strongestSignals.map(({ question, answer }: any) => (
                  <div key={question.id} className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Question {question.id} · {question.theme}</p>
                    <p className="mt-2 font-bold leading-relaxed text-slate-800">{question.prompt}</p>
                    <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-medium text-slate-600 shadow-sm">Selected {answer.letter}: {answer.text}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 sm:p-7">
              <Eyebrow>Breakdown</Eyebrow>
              <h2 className="mt-2 text-2xl font-black tracking-tight">What each area is telling you</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">This shows which parts of your life are pushing you toward each option.</p>
              <div className="mt-5 max-h-[560px] space-y-3 overflow-auto pr-1">
                {breakdown.map((item: any) => {
                  const insight = categoryMeaning(item, session.choiceOne, session.choiceTwo);
                  return (
                    <div key={item.theme} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-black text-slate-900">{item.theme}</p>
                          <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{insight.explanation}</p>
                        </div>
                        <span className={cx("shrink-0 rounded-full px-3 py-1 text-xs font-black", item.direction === "left" ? "bg-cyan-50 text-cyan-700" : item.direction === "right" ? "bg-fuchsia-50 text-fuchsia-700" : "bg-slate-100 text-slate-600")}>{insight.strength}</span>
                      </div>
                      <div className="mt-4">
                        <div className="mb-2 flex justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                          <span>{session.choiceOne}</span>
                          <span className="text-right">{session.choiceTwo}</span>
                        </div>
                        <div className="relative h-3 rounded-full bg-slate-100">
                          <div className="absolute left-1/2 top-0 h-3 w-px bg-slate-300" />
                          {item.direction !== "balanced" && (
                            <div className={cx("absolute top-0 h-3 rounded-full", item.direction === "left" ? "right-1/2 bg-cyan-400" : "left-1/2 bg-fuchsia-400")} style={{ width: insight.strengthPercent / 2 + "%" }} />
                          )}
                        </div>
                        <p className="mt-2 text-xs font-bold text-slate-500">Leans toward: {insight.favoredChoice}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </PageShell>
    );
  }

  if (session && currentQuestion) {
    const selectedLetter = answers[currentQuestion.id]?.letter;
    const progress = (completedCount / session.questions.length) * 100;

    return (
      <PageShell>
        <div className="mx-auto max-w-5xl space-y-6">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white sm:p-8">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <Eyebrow light>Question flow</Eyebrow>
                  <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{session.choiceOne} <span className="text-cyan-300">vs</span> {session.choiceTwo}</h1>
                  <p className="mt-3 text-sm font-semibold text-white/60">Question {activeIndex + 1} of {session.questions.length} · {completedCount} answered</p>
                </div>
                <SecondaryButton onClick={resetAll} className="border-white/20 bg-white/10 text-white hover:bg-white/20">Edit setup</SecondaryButton>
              </div>
              <div className="mt-6"><ProgressBar value={progress} dark /></div>
            </div>
          </Card>

          {session.source === "fallback" && activeIndex === 0 && (
            <Card className="border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-relaxed text-amber-800">
              AI generation is not connected yet, so this quiz is using the built-in fallback questions.
            </Card>
          )}

          {activeIndex === 0 && session.decisionTensions?.length > 0 && (
            <Card className="p-6 sm:p-7">
              <Eyebrow>Decision tensions</Eyebrow>
              <h2 className="mt-2 text-2xl font-black tracking-tight">What the decision is really about</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {session.decisionTensions.map((tension: any, index: number) => (
                  <div key={`${tension.title}-${index}`} className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
                    <p className="font-black text-slate-900">{tension.title}</p>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{tension.explanation}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6 sm:p-8">
            <div className="mb-6 rounded-[1.7rem] border border-cyan-100 bg-gradient-to-br from-cyan-50 to-blue-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Question theme</p>
              <p className="mt-2 text-base font-semibold leading-relaxed text-slate-700">{currentQuestion.groundingDetail}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white">{currentQuestion.theme}</span>
              <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Hidden scoring</span>
            </div>
            <h2 className="mt-5 text-xl font-black leading-snug tracking-tight text-slate-950 sm:text-2xl lg:text-3xl">{currentQuestion.prompt}</h2>

            <div className="mt-7 grid gap-4">
              {currentQuestion.options.map((option: any) => {
                const selected = selectedLetter === option.letter;
                return (
                  <button key={option.letter} onClick={() => selectAnswer(option)} className={cx("group flex w-full gap-4 rounded-[1.7rem] border p-5 text-left transition duration-200", selected ? "border-slate-950 bg-slate-950 text-white shadow-2xl shadow-slate-950/20" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/40 hover:shadow-xl hover:shadow-slate-950/10")}>
                    <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-black transition", selected ? "bg-white text-slate-950" : "bg-slate-100 text-slate-700 group-hover:bg-cyan-100 group-hover:text-cyan-800")}>{option.letter}</span>
                    <span className={cx("pt-2 text-base font-bold leading-relaxed", selected ? "text-white" : "text-slate-700")}>{option.text}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-7 flex items-center justify-between gap-3">
              <SecondaryButton onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} disabled={activeIndex === 0}>Back</SecondaryButton>
              <PrimaryButton onClick={goNext} disabled={!selectedLetter}>{activeIndex === session.questions.length - 1 ? "See recommendation" : "Next question"}</PrimaryButton>
            </div>
          </Card>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-7 text-white sm:p-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-cyan-100 shadow-lg backdrop-blur"><span>✦</span> Guided Decision AI App</div>
              <h1 className="mt-6 text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl">Make a hard choice feel clearer.</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-200">The app checks the AI API, can rewrite your background for clarity, then creates constructive questions with varied answer choices around the real trade-offs in your decision.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {["AI status", "10 / 30 / 50", "Hidden scoring"].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-black text-white/90 backdrop-blur">{item}</div>
                ))}
              </div>
            </div>
            <div className="bg-white p-7 sm:p-10">
              <div className="rounded-[2rem] bg-gradient-to-br from-cyan-50 via-white to-fuchsia-50 p-6 shadow-inner">
                <div className="flex items-center justify-between gap-3">
                  <Eyebrow>AI connection</Eyebrow>
                  <button onClick={checkApiConnection} className="text-xs font-black text-cyan-700 underline">Recheck</button>
                </div>
                <div className="mt-4"><ApiStatusBadge status={apiStatus} hasKey={apiHasKey} /></div>
                <p className="mt-4 text-sm font-medium leading-relaxed text-slate-600">
                  If connected, the app uses AI-generated questions. If not, it still works with fallback questions.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
          <Card className="p-6 sm:p-8">
            <div className="space-y-5">
              <Field label="Life question"><textarea value={decision} onChange={(event) => setDecision(event.target.value)} rows={3} className={inputClass()} placeholder="Type your life question here. Example: Should I stay in Spain or move back to Florida?" /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Choice 1"><input value={choiceOne} onChange={(event) => setChoiceOne(event.target.value)} className={inputClass()} placeholder="Type option 1. Example: Stay in Spain" /></Field>
                <Field label="Choice 2"><input value={choiceTwo} onChange={(event) => setChoiceTwo(event.target.value)} className={inputClass("fuchsia")} placeholder="Type option 2. Example: Move back to Florida" /></Field>
              </div>
              <Field label="Number of questions">
                <div className="grid grid-cols-3 gap-3">
                  {[10, 30, 50].map((count) => (
                    <button key={count} type="button" onClick={() => setQuestionCount(count)} onTouchStart={() => setQuestionCount(count)} className={cx("min-h-[58px] touch-manipulation select-none rounded-2xl border px-4 py-4 text-center font-black transition", questionCount === count ? "border-slate-950 bg-slate-950 text-white shadow-xl shadow-slate-950/20" : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/50")}>{count}</button>
                  ))}
                </div>
              </Field>

              <Field label="Question mode">
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setUseAi(true)}
                    className={cx("min-h-[64px] rounded-2xl border px-4 py-4 text-left font-black transition", useAi ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
                  >
                    AI mode
                    <span className="mt-1 block text-xs font-semibold text-slate-500">Uses OpenAI credits and generates custom questions.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUseAi(false); setRewriteDraft(""); setRewriteNotes([]); setRewriteError(""); }}
                    className={cx("min-h-[64px] rounded-2xl border px-4 py-4 text-left font-black transition", !useAi ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
                  >
                    Local test mode
                    <span className="mt-1 block text-xs font-semibold text-slate-500">No API calls. Uses built-in test questions.</span>
                  </button>
                </div>
              </Field>
              <Field label="Background">
                <textarea value={background} onChange={(event) => setBackground(event.target.value)} rows={8} className={inputClass()} placeholder="Tell the app the background. Example: Spain gives me business momentum, but I am away from family. Florida would put me closer to family, but I worry I would be bored there." />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <SecondaryButton onClick={rewriteBackground} disabled={!useAi || isRewriting || !normalizeText(decision) || !normalizeText(choiceOne) || !normalizeText(choiceTwo) || !normalizeText(background)}>
                    {isRewriting ? "Rewriting background..." : "AI rewrite background"}
                  </SecondaryButton>
                  <p className="text-sm font-medium text-slate-500">Only available in AI mode. The user can approve the rewrite or keep the original.</p>
                </div>
              </Field>

              {rewriteError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{rewriteError}</div>
              )}

              {rewriteDraft && (
                <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">AI rewrite suggestion</p>
                  <textarea value={rewriteDraft} onChange={(event) => setRewriteDraft(event.target.value)} rows={7} className="mt-3 w-full rounded-2xl border border-cyan-100 bg-white p-4 text-sm font-medium leading-relaxed text-slate-700 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100" />
                  {rewriteNotes.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {rewriteNotes.map((note, index) => <p key={`${note}-${index}`} className="text-xs font-bold text-slate-500">• {note}</p>)}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <PrimaryButton onClick={() => { setBackground(rewriteDraft); setRewriteDraft(""); setRewriteNotes([]); }} className="py-3">Approve rewrite</PrimaryButton>
                    <SecondaryButton onClick={() => { setRewriteDraft(""); setRewriteNotes([]); }}>Keep original</SecondaryButton>
                  </div>
                </div>
              )}
            </div>

            <PrimaryButton onClick={beginFollowUpReview} disabled={isGenerating || !normalizeText(decision) || !normalizeText(choiceOne) || !normalizeText(choiceTwo) || !normalizeText(background)} className="mt-7 w-full py-5 text-lg">
              {isGenerating ? (useAi ? "Creating constructive questions..." : "Creating local test questions...") : "Review background & continue →"}
            </PrimaryButton>
          </Card>

          <div className="space-y-6">
            <Card className="p-6 sm:p-7">
              <Eyebrow>Decision paths</Eyebrow>
              <h2 className="mt-2 text-2xl font-black tracking-tight">Your two options</h2>
              <div className="mt-5 space-y-4">
                <ChoicePreview label="Choice 1" value={normalizeText(choiceOne) || "Enter your first option"} side="left" />
                <ChoicePreview label="Choice 2" value={normalizeText(choiceTwo) || "Enter your second option"} side="right" />
              </div>
              <p className="mt-4 text-sm font-medium leading-relaxed text-slate-500">The scoring now only calls the result unclear when your answers are very close to balanced.</p>
            </Card>

            <Card className="p-6 sm:p-7">
              <Eyebrow>Grounding</Eyebrow>
              <h2 className="mt-2 text-2xl font-black tracking-tight">What the AI will use</h2>
              <div className="mt-5 space-y-3">
                {normalizeText(background) ? previewDetails.map((detail, index) => (
                  <div key={`${detail}-${index}`} className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-600 shadow-sm">{detail}</div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-400">Your background details will appear here once you start typing.</div>
                )}
              </div>
              <p className="mt-4 text-sm font-medium leading-relaxed text-slate-500">The richer the background, the more constructive and relevant the AI-generated questions will be.</p>
            </Card>

            <BackgroundQualityCard quality={previewBackgroundQuality} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
