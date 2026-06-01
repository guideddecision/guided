"use client";

import React, { useEffect, useMemo, useState } from "react";

const LETTERS = ["A", "B", "C", "D"];
const QUESTION_COUNTS = [10, 30, 50];

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
      unique.push(item.length > 160 ? item.slice(0, 157) + "..." : item);
    }
  });

  return unique.length ? unique : ["No background details entered yet."];
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

function detectDecisionType(decision: string, choiceOne: string, choiceTwo: string, background: string) {
  const text = `${decision} ${choiceOne} ${choiceTwo} ${background}`.toLowerCase();

  if (/\b(car|cars|truck|suv|ev|hybrid|toyota|honda|bmw|mercedes|tesla|ford|audi|kia|hyundai|volvo|vehicle)\b/.test(text)) return "cars";
  if (/\b(city|cities|town|country|countries|move|moving|relocate|relocation|spain|florida|london|malaga|madrid|new york|miami)\b/.test(text)) return "places";
  if (/\b(job|career|work|business|company|startup|salary|client|market|industry)\b/.test(text)) return "career/business";
  if (/\b(relationship|marriage|partner|girlfriend|boyfriend|dating|divorce|family)\b/.test(text)) return "relationship/family";
  if (/\b(product|software|subscription|phone|laptop|service|tool|platform)\b/.test(text)) return "products/services";
  return "general life choice";
}

function assessBackgroundQuality(background: string, decision: string, choiceOne: string, choiceTwo: string) {
  const text = `${decision} ${choiceOne} ${choiceTwo} ${background}`.toLowerCase();
  const type = detectDecisionType(decision, choiceOne, choiceTwo, background);

  const checks = [
    {
      key: "clear options",
      passed: Boolean(normalizeText(choiceOne) && normalizeText(choiceTwo)),
      missing: "make both choices specific"
    },
    {
      key: "why each option matters",
      passed: background.length > 80 && background.toLowerCase().includes(choiceOne.split(" ")[0]?.toLowerCase() || "") && background.toLowerCase().includes(choiceTwo.split(" ")[0]?.toLowerCase() || ""),
      missing: "why each option is attractive or difficult"
    },
    {
      key: "timeline",
      passed: /\b(today|tomorrow|week|month|year|soon|later|now|future|12 months|six months|five years|by )\b/i.test(text),
      missing: "the timeline you are deciding for"
    },
    {
      key: "practical constraints",
      passed: /\b(cost|money|income|salary|business|work|job|rent|debt|price|budget|time|travel|legal|visa|tax|school|healthcare|insurance|maintenance)\b/i.test(text),
      missing: "money, timing, legal, work, or practical constraints"
    },
    {
      key: "people affected",
      passed: /\b(family|children|partner|friend|friends|parents|kids|team|community|single|relationship|wife|husband)\b/i.test(text),
      missing: "who else is affected"
    },
    {
      key: "risk or downside",
      passed: /\b(risk|worry|fear|downside|problem|concern|avoid|regret|bored|lonely|stress|maintenance|crime|safety|reliability)\b/i.test(text),
      missing: "the main downside or risk of each option"
    }
  ];

  const typeSpecific: Record<string, Array<{ key: string; passed: boolean; missing: string }>> = {
    cars: [
      { key: "car use case", passed: /\b(commute|miles|km|drive|family|cargo|parking|city|highway|range)\b/i.test(text), missing: "how you will use the car day to day" },
      { key: "ownership cost", passed: /\b(price|insurance|fuel|electric|maintenance|warranty|depreciation|resale)\b/i.test(text), missing: "purchase price, running cost, reliability, warranty, or resale concerns" }
    ],
    places: [
      { key: "place logistics", passed: /\b(housing|rent|cost of living|school|healthcare|flight|travel|weather|crime|safety|visa|tax|family)\b/i.test(text), missing: "cost of living, housing, safety, healthcare, family, or travel logistics" },
      { key: "daily life", passed: /\b(lifestyle|friends|community|bored|social|weather|routine|dating|language|culture)\b/i.test(text), missing: "what daily life would actually feel like in each place" }
    ],
    "career/business": [
      { key: "business/career upside", passed: /\b(market|client|income|salary|pipeline|growth|promotion|funding|opportunity|risk)\b/i.test(text), missing: "career/business upside and downside for each option" },
      { key: "financial runway", passed: /\b(runway|cash|income|salary|cost|savings|revenue|funding|debt)\b/i.test(text), missing: "money runway and financial pressure" }
    ],
    "relationship/family": [
      { key: "relationship effect", passed: /\b(family|partner|children|time together|distance|support|care|conflict|lonely|connection)\b/i.test(text), missing: "how each choice affects the relationship or family connection" }
    ],
    "products/services": [
      { key: "product criteria", passed: /\b(price|features|support|reviews|warranty|quality|reliability|availability|integration)\b/i.test(text), missing: "price, features, quality, support, reviews, or reliability criteria" }
    ],
    "general life choice": []
  };

  const all = [...checks, ...(typeSpecific[type] || [])];
  const passed = all.filter((check) => check.passed);
  const missing = all.filter((check) => !check.passed).map((check) => check.missing);
  const score = Math.round((passed.length / all.length) * 100);

  return {
    score,
    type,
    level: score >= 70 ? "Ready" : score >= 45 ? "Could use more detail" : "Needs more detail",
    strengths: passed.map((check) => check.key),
    missing,
    suggestions: missing.slice(0, 5)
  };
}

function buildDetailPrompts({ decision, choiceOne, choiceTwo, quality }: any) {
  const type = quality?.type || detectDecisionType(decision, choiceOne, choiceTwo, "");

  const base = [
    {
      id: "choice-one-case",
      label: `What specific facts make ${choiceOne} a serious option?`,
      placeholder: `Add practical facts, not just feelings. Example: cost, timing, people affected, upside, downside for ${choiceOne}.`
    },
    {
      id: "choice-two-case",
      label: `What specific facts make ${choiceTwo} a serious option?`,
      placeholder: `Add practical facts, not just feelings. Example: cost, timing, people affected, upside, downside for ${choiceTwo}.`
    },
    {
      id: "non-negotiable",
      label: "What facts would override the quiz result?",
      placeholder: "Example: budget limit, family need, health issue, legal requirement, deadline, children, work obligation..."
    }
  ];

  const byType: Record<string, any[]> = {
    cars: [
      { id: "car-use", label: "How will you actually use each car?", placeholder: "Commute, mileage, city/highway, passengers, parking, charging/fuel, cargo, long trips..." },
      { id: "car-cost", label: "What cost/reliability facts matter most?", placeholder: "Purchase price, insurance, fuel/electricity, repairs, warranty, resale, reliability concerns..." }
    ],
    places: [
      { id: "place-life", label: `What would daily life actually look like in ${choiceOne} vs ${choiceTwo}?`, placeholder: "Housing, friends, family, routine, weather, social life, healthcare, transport, safety, boredom..." },
      { id: "place-logistics", label: "What practical logistics matter?", placeholder: "Cost of living, rent, flights, residency/visa, tax, school, family support, work/business access..." }
    ],
    "career/business": [
      { id: "business-upside", label: "What is the real upside/downside of each work or business path?", placeholder: "Income, market, clients, risk, funding, promotion, opportunity cost, time pressure..." },
      { id: "business-runway", label: "What financial runway or pressure exists?", placeholder: "Savings, income, burn rate, debt, expected revenue, investment needed..." }
    ],
    "relationship/family": [
      { id: "family-impact", label: "How does each option affect the people closest to you?", placeholder: "Time together, support, conflict, distance, care responsibilities, loneliness, resentment..." },
      { id: "emotional-risk", label: "What emotional outcome are you trying to avoid?", placeholder: "Regret, boredom, guilt, loneliness, pressure, being stuck, disappointing someone..." }
    ],
    "products/services": [
      { id: "product-criteria", label: "What criteria should decide between the two options?", placeholder: "Price, quality, features, reviews, support, compatibility, reliability, availability..." },
      { id: "product-failure", label: "What would make one option a bad purchase?", placeholder: "Bad reviews, high cost, poor support, maintenance, missing features, risk of wasting money..." }
    ]
  };

  return [...(byType[type] || []), ...base].slice(0, 5);
}

function buildEnhancedBackground(background: string, detailPrompts: any[], detailAnswers: any) {
  const additions = detailPrompts
    .map((prompt) => ({
      label: prompt.label,
      answer: normalizeText(detailAnswers[prompt.id])
    }))
    .filter((item) => item.answer);

  if (!additions.length) return normalizeText(background);

  return `${normalizeText(background)}

Additional user details:
${additions.map((item, index) => `${index + 1}. ${item.label} ${item.answer}`).join("\n")}`;
}

function normalizeAIOptions(options: any[]) {
  if (!Array.isArray(options) || options.length !== 4) throw new Error("The AI returned a question with the wrong number of answer options.");

  const normalized = options.map((option, index) => {
    const score = Number(option.score);
    if (![-2, -1, 1, 2].includes(score)) throw new Error("The AI returned an invalid hidden score.");
    return {
      letter: LETTERS[index],
      text: normalizeText(option.text) || "Answer option",
      score
    };
  });

  const scoreSet = normalized.map((item) => item.score).sort((a, b) => a - b).join(",");
  if (scoreSet !== "-2,-1,1,2") throw new Error("Each AI question must include one answer for each hidden score.");

  return normalized;
}

function normalizeAIQuestions(data: any, questionCount: number) {
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  if (questions.length !== questionCount) throw new Error(`The AI returned ${questions.length} questions instead of ${questionCount}.`);

  return questions.map((question: any, index: number) => {
    const prompt = normalizeText(question.question || question.prompt);
    const theme = normalizeText(question.theme) || `Decision factor ${index + 1}`;
    if (!prompt) throw new Error("The AI returned a question with no text.");

    return {
      id: index + 1,
      theme,
      groundingDetail: normalizeText(question.groundingDetail) || theme,
      prompt,
      options: normalizeAIOptions(question.options)
    };
  });
}

function normalizeAITensions(data: any) {
  const tensions = Array.isArray(data?.decisionTensions) ? data.decisionTensions : [];
  return tensions
    .map((item: any, index: number) => ({
      title: normalizeText(item.title) || `Decision tension ${index + 1}`,
      explanation: normalizeText(item.explanation) || "This is one of the main trade-offs behind the decision."
    }))
    .filter((item: any) => item.title && item.explanation)
    .slice(0, 6);
}

function normalizePracticalContext(data: any) {
  const context = data?.practicalContext || {};
  const factors = Array.isArray(context.practicalFactors) ? context.practicalFactors : [];
  const sources = Array.isArray(context.sources) ? context.sources : [];

  return {
    decisionType: normalizeText(context.decisionType) || "General decision",
    researchSummary: normalizeText(context.researchSummary) || "",
    expandedBackground: normalizeText(context.expandedBackground) || "",
    researchLimitations: normalizeText(context.researchLimitations) || "",
    practicalFactors: factors
      .map((item: any, index: number) => ({
        title: normalizeText(item.title) || `Practical factor ${index + 1}`,
        explanation: normalizeText(item.explanation) || "",
        relevance: normalizeText(item.relevance) || ""
      }))
      .filter((item: any) => item.title && (item.explanation || item.relevance))
      .slice(0, 8),
    sources: sources
      .map((item: any, index: number) => ({
        title: normalizeText(item.title) || `Source ${index + 1}`,
        url: normalizeText(item.url),
        note: normalizeText(item.note)
      }))
      .filter((item: any) => item.title || item.url)
      .slice(0, 8)
  };
}

function fallbackOptions(choiceOne: string, choiceTwo: string, random: () => number) {
  return shuffle([
    { score: -2, text: `I would choose ${choiceOne} because the current facts make that path worth the downside.` },
    { score: -1, text: `${choiceOne} seems better, but only if I can manage the biggest practical risk.` },
    { score: 1, text: `${choiceTwo} seems better, but only if the practical details check out.` },
    { score: 2, text: `I would choose ${choiceTwo} because the facts make that path worth the disruption.` }
  ], random).map((option, index) => ({ ...option, letter: LETTERS[index] }));
}

function buildFallbackQuestions({ decision, background, choiceOne, choiceTwo, questionCount }: any) {
  const details = extractDetails(background);
  const seed = hashString(`${decision}|${background}|${choiceOne}|${choiceTwo}|${Date.now()}`);
  const random = seededRandom(seed);
  const themes = ["Practical fit", "Cost", "Daily life", "Risk", "People affected", "Regret", "Timeline", "Freedom", "Stability", "Next step", "Lifestyle", "Long term", "Support", "Reversibility", "Pressure"];

  return Array.from({ length: questionCount }, (_, index) => {
    const detail = details[index % details.length];
    const theme = themes[index % themes.length];
    return {
      id: index + 1,
      theme,
      groundingDetail: detail,
      prompt: `Using this detail — “${detail}” — which option gives you the better real-world outcome on ${theme.toLowerCase()}?`,
      options: fallbackOptions(choiceOne, choiceTwo, random)
    };
  });
}

function scoreToRecommendation(raw: number, maxAbs: number, choiceOne: string, choiceTwo: string) {
  const strengthPercent = maxAbs ? Math.round((Math.abs(raw) / maxAbs) * 100) : 0;

  if (raw === 0 || strengthPercent < 10) {
    return {
      label: "No clear winner yet",
      explanation: "Your answers were very close to balanced. Neither option clearly won based on the answers you selected."
    };
  }

  const favoredChoice = raw < 0 ? choiceOne : choiceTwo;

  if (strengthPercent >= 50) {
    return {
      label: `Strong recommendation: ${favoredChoice}`,
      explanation: `Your answers showed a strong pattern toward ${favoredChoice}. Most of the weighted answers pointed this way.`
    };
  }

  if (strengthPercent >= 25) {
    return {
      label: `Clear recommendation: ${favoredChoice}`,
      explanation: `Your answers showed a clear lean toward ${favoredChoice}. There may still be trade-offs, but the overall weighting is meaningfully stronger in this direction.`
    };
  }

  return {
    label: `Slight lean: ${favoredChoice}`,
    explanation: `Your answers slightly favored ${favoredChoice}. This is a real lean, but you should review the strongest signals before making a final decision.`
  };
}

function preferenceSummary(raw: number, maxAbs: number, choiceOne: string, choiceTwo: string) {
  const strengthPercent = maxAbs ? Math.round((Math.abs(raw) / maxAbs) * 100) : 0;

  if (raw === 0 || strengthPercent < 10) {
    return {
      label: "Balanced",
      note: `Your answers were almost evenly split between ${choiceOne} and ${choiceTwo}.`,
      strengthPercent,
      favoredChoice: "Balanced"
    };
  }

  const favoredChoice = raw < 0 ? choiceOne : choiceTwo;
  const label = strengthPercent >= 50 ? "Strong lean" : strengthPercent >= 25 ? "Clear lean" : "Slight lean";

  return {
    label,
    note: `Your answers leaned ${strengthPercent}% toward ${favoredChoice}.`,
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

  return {
    favoredChoice,
    topReasonsOne: choiceOneSignals.map(topReasonText),
    topReasonsTwo: choiceTwoSignals.map(topReasonText),
    unresolvedConflict: opposingSignals.length ? `The main unresolved pull is ${topReasonText(opposingSignals[0])}` : "There was no major opposing signal in your answers.",
    suggestedNextStep: favoredChoice === "Balanced" ? "Identify the one or two facts that would break the tie, then rerun the decision with those details included." : `Before acting on ${favoredChoice}, test it against the biggest unresolved conflict and any non-negotiable facts.`
  };
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

function BackgroundQualityCard({ quality }: any) {
  if (!quality) return null;
  const tone = quality.score >= 70 ? "emerald" : quality.score >= 45 ? "amber" : "red";
  return (
    <Card className={cx("p-5", tone === "emerald" ? "border-emerald-200 bg-emerald-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={cx("text-xs font-black uppercase tracking-[0.18em]", tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-800" : "text-red-700")}>Background quality</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{quality.level} · {quality.score}/100</h3>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">Decision type detected: {quality.type}</p>
        </div>
      </div>
      {quality.suggestions?.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-black text-slate-800">Add more detail about:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {quality.suggestions.map((item: string) => <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">{item}</span>)}
          </div>
        </div>
      )}
    </Card>
  );
}

function PracticalContextCard({ practicalContext }: any) {
  if (!practicalContext) return null;
  const factors = practicalContext.practicalFactors || [];
  const sources = practicalContext.sources || [];
  return (
    <Card className="p-6 sm:p-7">
      <Eyebrow>Expanded background and research</Eyebrow>
      <h2 className="mt-2 text-2xl font-black tracking-tight">Extra detail used to create the questions</h2>
      {practicalContext.researchSummary && <p className="mt-4 text-sm font-semibold leading-relaxed text-slate-600">{practicalContext.researchSummary}</p>}
      {practicalContext.expandedBackground && (
        <div className="mt-5 rounded-3xl border border-cyan-100 bg-cyan-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Expanded background used</p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">{practicalContext.expandedBackground}</p>
        </div>
      )}
      {factors.length > 0 && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {factors.map((factor: any, index: number) => (
            <div key={`${factor.title}-${index}`} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="font-black text-slate-900">{factor.title}</p>
              {factor.explanation && <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{factor.explanation}</p>}
              {factor.relevance && <p className="mt-2 text-xs font-bold leading-relaxed text-cyan-700">Why it matters: {factor.relevance}</p>}
            </div>
          ))}
        </div>
      )}
      {sources.length > 0 && (
        <div className="mt-5 rounded-3xl border border-slate-100 bg-white p-5">
          <p className="font-black text-slate-900">Sources used</p>
          <div className="mt-3 space-y-2">
            {sources.map((source: any, index: number) => (
              <p key={`${source.url}-${index}`} className="text-xs font-semibold leading-relaxed text-slate-600">
                {source.url ? <a className="text-cyan-700 underline" href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a> : source.title}
                {source.note ? ` — ${source.note}` : ""}
              </p>
            ))}
          </div>
        </div>
      )}
      {practicalContext.researchLimitations && (
        <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-800">Research limitation: {practicalContext.researchLimitations}</p>
      )}
    </Card>
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
      <div className="mt-3 text-center text-sm font-bold text-white/70">Direction marker: <span className="text-white">{score}/100</span></div>
      <div className="mt-1 text-center text-sm font-bold text-white/70">Lean strength: <span className="text-white">{strengthPercent}% toward {favoredChoice}</span></div>
    </div>
  );
}

function ApiStatusBadge({ status }: any) {
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

  return <div className={cx("inline-flex items-center rounded-full border px-4 py-2 text-sm font-black", styles[status] || styles.offline)}>{labels[status] || "AI not connected"}</div>;
}

export default function GuidedDecisionAIApp() {
  const [decision, setDecision] = useState("");
  const [choiceOne, setChoiceOne] = useState("");
  const [choiceTwo, setChoiceTwo] = useState("");
  const [background, setBackground] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [useAi, setUseAi] = useState(true);
  const [apiStatus, setApiStatus] = useState("checking");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState("");

  const [detailReviewOpen, setDetailReviewOpen] = useState(false);
  const [detailPrompts, setDetailPrompts] = useState<any[]>([]);
  const [detailAnswers, setDetailAnswers] = useState<any>({});
  const [backgroundQuality, setBackgroundQuality] = useState<any>(null);

  const [session, setSession] = useState<any>(null);
  const [answers, setAnswers] = useState<any>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  const completedCount = Object.keys(answers).length;
  const currentQuestion = session?.questions?.[activeIndex];
  const previewDetails = useMemo(() => extractDetails(background).slice(0, 5), [background]);
  const liveQuality = useMemo(() => assessBackgroundQuality(background, decision, choiceOne, choiceTwo), [background, decision, choiceOne, choiceTwo]);

  useEffect(() => {
    checkApiConnection();
  }, []);

  async function checkApiConnection() {
    setApiStatus("checking");
    try {
      const response = await fetch("/api/generate-questions", { method: "GET" });
      if (!response.ok) throw new Error("API route not available");
      const data = await response.json();
      setApiStatus(data.hasKey ? "connected" : "missingKey");
    } catch {
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

    if (!response.ok) {
      let message = "AI generation failed.";
      try {
        const data = await response.json();
        message = data?.detail || data?.error || message;
      } catch {
        message = await response.text();
      }
      throw new Error(message);
    }

    const data = await response.json();
    const practicalContext = normalizePracticalContext(data);

    return {
      questions: normalizeAIQuestions(data, questionCount),
      decisionTensions: normalizeAITensions(data),
      practicalContext
    };
  }

  function openDetailReview() {
    if (!normalizeText(decision) || !normalizeText(choiceOne) || !normalizeText(choiceTwo) || !normalizeText(background)) return;
    const quality = assessBackgroundQuality(background, decision, choiceOne, choiceTwo);
    setBackgroundQuality(quality);
    setDetailPrompts(buildDetailPrompts({ decision, choiceOne, choiceTwo, quality }));
    setDetailAnswers({});
    setAiError("");
    setDetailReviewOpen(true);
  }

  async function startQuiz(skipExtraDetails = false) {
    if (isGenerating || !normalizeText(decision) || !normalizeText(choiceOne) || !normalizeText(choiceTwo) || !normalizeText(background)) return;

    const effectiveBackground = buildEnhancedBackground(background, detailPrompts, skipExtraDetails ? {} : detailAnswers);
    const quality = backgroundQuality || assessBackgroundQuality(background, decision, choiceOne, choiceTwo);

    setIsGenerating(true);
    setAiError("");

    let questions;
    let decisionTensions;
    let practicalContext = null;
    let source = useAi ? "ai" : "local";

    try {
      if (useAi) {
        const generated = await generateWithAI(effectiveBackground);
        questions = generated.questions;
        decisionTensions = generated.decisionTensions;
        practicalContext = generated.practicalContext;
        setApiStatus("connected");
      } else {
        questions = buildFallbackQuestions({ decision, background: effectiveBackground, choiceOne, choiceTwo, questionCount });
        decisionTensions = [];
        practicalContext = null;
        source = "local";
      }
    } catch (error: any) {
      setIsGenerating(false);
      setAiError(error?.message || "AI generation failed. The app did not fall back to generic questions because AI research mode is selected.");
      return;
    }

    setSession({
      decision: normalizeText(decision),
      background: normalizeText(practicalContext?.expandedBackground || effectiveBackground),
      originalBackground: normalizeText(background),
      practicalContext,
      choiceOne: normalizeText(choiceOne),
      choiceTwo: normalizeText(choiceTwo),
      questionCount,
      source,
      backgroundQuality: quality,
      addedDetails: detailPrompts
        .map((prompt) => ({ question: prompt.label, answer: normalizeText(detailAnswers[prompt.id]) }))
        .filter((item) => item.answer),
      decisionTensions,
      questions
    });
    setAnswers({});
    setActiveIndex(0);
    setFinished(false);
    setDetailReviewOpen(false);
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
    setDecision("");
    setChoiceOne("");
    setChoiceTwo("");
    setBackground("");
    setQuestionCount(10);
    setDetailReviewOpen(false);
    setDetailPrompts([]);
    setDetailAnswers({});
    setBackgroundQuality(null);
    setSession(null);
    setAnswers({});
    setActiveIndex(0);
    setFinished(false);
    setAiError("");
  }

  async function downloadConclusionReport() {
    if (!session || !scoreData) return;

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 44;
      const width = pageWidth - margin * 2;
      let y = margin;

      const clean = (value: any) => String(value ?? "").replace(/\s+/g, " ").trim();
      const fileSafe = (value: any) => clean(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 44) || "decision-report";
      const insights = getDecisionInsights(session, answers, scoreData);
      const reportBreakdown = categoryBreakdown(session.questions, answers);
      const answeredQuestions = session.questions.map((q: any) => ({ question: q, answer: answers[q.id] })).filter((x: any) => x.answer);
      const strongest = answeredQuestions.sort((a: any, b: any) => Math.abs(b.answer.score) - Math.abs(a.answer.score)).slice(0, 8);

      function pageBreak(needed = 40) {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      }

      function textBlock(text: any, size = 10, style = "normal", color: [number, number, number] = [51, 65, 85], gap = 10) {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(clean(text), width);
        lines.forEach((line: string) => {
          pageBreak(size + 8);
          doc.text(line, margin, y);
          y += size + 5;
        });
        y += gap;
      }

      function title(text: string) {
        pageBreak(60);
        y += 8;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42);
        doc.text(text, margin, y);
        y += 10;
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y, pageWidth - margin, y);
        y += 18;
      }

      function bullet(items: string[]) {
        const list = items.length ? items : ["None recorded."];
        list.forEach((item) => {
          const lines = doc.splitTextToSize(clean(item), width - 18);
          pageBreak(lines.length * 13 + 8);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(51, 65, 85);
          doc.text("•", margin, y);
          doc.text(lines, margin + 14, y);
          y += lines.length * 13 + 7;
        });
      }

      doc.setFillColor(2, 6, 23);
      doc.roundedRect(margin, y, width, 128, 18, 18, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(165, 243, 252);
      doc.text("GUIDED DECISION REPORT", margin + 24, y + 30);
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text(doc.splitTextToSize(clean(scoreData.recommendation.label), width - 48).slice(0, 2), margin + 24, y + 62);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(226, 232, 240);
      doc.text(doc.splitTextToSize(clean(scoreData.recommendation.explanation), width - 48).slice(0, 3), margin + 24, y + 98);
      y += 158;

      title("1. Executive summary");
      textBlock(`Life question: ${session.decision}`);
      textBlock(`Choice 1: ${session.choiceOne}`);
      textBlock(`Choice 2: ${session.choiceTwo}`);
      textBlock(`Decision lean: ${scoreData.leanSummary.label}. ${scoreData.leanSummary.note}`);
      textBlock(`Direction marker: ${scoreData.score}/100. Raw weighted tally: ${scoreData.raw}.`);

      if (session.practicalContext) {
        title("2. Practical research and expanded background");
        textBlock(`Decision type: ${session.practicalContext.decisionType || "General decision"}`);
        if (session.practicalContext.researchSummary) textBlock(session.practicalContext.researchSummary);
        if (session.practicalContext.expandedBackground) textBlock(`Expanded background used: ${session.practicalContext.expandedBackground}`);
        if (session.practicalContext.practicalFactors?.length) {
          textBlock("Practical factors:", 11, "bold", [15, 23, 42], 4);
          bullet(session.practicalContext.practicalFactors.map((f: any) => `${f.title}: ${f.explanation}${f.relevance ? " Why it matters: " + f.relevance : ""}`));
        }
        if (session.practicalContext.sources?.length) {
          textBlock("Sources:", 11, "bold", [15, 23, 42], 4);
          bullet(session.practicalContext.sources.map((s: any) => `${s.title || s.url}${s.url ? " — " + s.url : ""}${s.note ? " — " + s.note : ""}`));
        }
      }

      title("3. Why the result leaned this way");
      textBlock(`Top reasons toward ${session.choiceOne}:`, 11, "bold", [15, 23, 42], 4);
      bullet(insights.topReasonsOne);
      textBlock(`Top reasons toward ${session.choiceTwo}:`, 11, "bold", [15, 23, 42], 4);
      bullet(insights.topReasonsTwo);
      textBlock(`Biggest unresolved conflict: ${insights.unresolvedConflict}`);
      textBlock(`Suggested next step: ${insights.suggestedNextStep}`);

      title("4. Decision tensions");
      bullet((session.decisionTensions || []).map((t: any) => `${t.title}: ${t.explanation}`));

      title("5. Strongest answer signals");
      bullet(strongest.map(({ question, answer }: any) => `${question.theme}: ${question.prompt} Selected ${answer.letter}: ${answer.text}`));

      title("6. Category breakdown");
      bullet(reportBreakdown.map((item: any) => {
        const insight = categoryMeaning(item, session.choiceOne, session.choiceTwo);
        return `${item.theme}: ${insight.explanation}`;
      }));

      title("7. Background used");
      textBlock(session.background);

      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Guided Decision Report · Page ${page} of ${pages}`, margin, pageHeight - 22);
      }

      doc.save(`${fileSafe(session.decision)}.pdf`);
    } catch (error) {
      alert("The PDF could not be generated. Make sure jspdf is installed: npm install jspdf");
    }
  }

  if (detailReviewOpen) {
    const answeredCount = Object.values(detailAnswers).filter((value) => normalizeText(value)).length;

    return (
      <PageShell>
        <div className="mx-auto max-w-5xl space-y-6">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-7 text-white sm:p-9">
              <Eyebrow light>Needs more detail</Eyebrow>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Add facts that will make the AI questions specific.</h1>
              <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-200">
                These are not generic quiz questions. They are detail prompts. Your answers are added to the background before the AI researches the choices and creates the final quiz.
              </p>
            </div>
          </Card>

          <BackgroundQualityCard quality={backgroundQuality} />

          <Card className="p-6 sm:p-8">
            <div className="space-y-5">
              {detailPrompts.map((prompt, index) => (
                <Field key={prompt.id} label={`${index + 1}. ${prompt.label}`}>
                  <textarea
                    value={detailAnswers[prompt.id] || ""}
                    onChange={(event) => setDetailAnswers((previous: any) => ({ ...previous, [prompt.id]: event.target.value }))}
                    rows={3}
                    className={inputClass()}
                    placeholder={prompt.placeholder}
                  />
                </Field>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SecondaryButton onClick={() => setDetailReviewOpen(false)}>Back to setup</SecondaryButton>
              <div className="flex flex-col gap-3 sm:flex-row">
                <SecondaryButton onClick={() => startQuiz(true)} disabled={isGenerating}>Generate without extra details</SecondaryButton>
                <PrimaryButton onClick={() => startQuiz(false)} disabled={isGenerating}>
                  {isGenerating ? (useAi ? "Researching choices and creating questions..." : "Creating local questions...") : `Generate ${questionCount} questions${answeredCount ? ` with ${answeredCount} added detail${answeredCount === 1 ? "" : "s"}` : ""}`}
                </PrimaryButton>
              </div>
            </div>

            {aiError && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-relaxed text-red-700">
                {aiError}
              </div>
            )}
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
                  <SecondaryButton onClick={downloadConclusionReport}>Download PDF report</SecondaryButton>
                  <div className={cx("rounded-2xl px-4 py-3 text-sm font-bold", session.source === "ai" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                    {session.source === "ai" ? "AI research mode" : "Local test mode"}
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950 p-7 sm:p-9">
                <ResultGauge score={scoreData.score} raw={scoreData.raw} maxAbs={scoreData.maxAbs} choiceOne={session.choiceOne} choiceTwo={session.choiceTwo} />
                <div className="mt-5 grid gap-3">
                  <StatCard label="Decision lean" value={scoreData.leanSummary.label} note={scoreData.leanSummary.note} />
                  <StatCard label="Questions" value={`${completedCount}/${session.questions.length}`} note="Every question was grounded in your expanded background." />
                </div>
              </div>
            </div>
          </Card>

          <PracticalContextCard practicalContext={session.practicalContext} />

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

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6 sm:p-7">
              <Eyebrow>Signal review</Eyebrow>
              <h2 className="mt-2 text-2xl font-black tracking-tight">Strongest answer signals</h2>
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
                <SecondaryButton onClick={() => { setSession(null); setAnswers({}); setActiveIndex(0); setFinished(false); }} className="border-white/20 bg-white/10 text-white hover:bg-white/20">Edit setup</SecondaryButton>
              </div>
              <div className="mt-6"><ProgressBar value={progress} dark /></div>
            </div>
          </Card>

          {activeIndex === 0 && <PracticalContextCard practicalContext={session.practicalContext} />}

          {activeIndex === 0 && session.source === "local" && (
            <Card className="border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-relaxed text-amber-800">
              This quiz is in Local test mode. It does not use AI research and will be less specific.
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
                  <button
                    key={option.letter}
                    onClick={() => selectAnswer(option)}
                    className={cx("group flex w-full gap-4 rounded-[1.7rem] border p-5 text-left transition duration-200", selected ? "border-slate-950 bg-slate-950 text-white shadow-2xl shadow-slate-950/20" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/40 hover:shadow-xl hover:shadow-slate-950/10")}
                  >
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
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-200">The app researches practical facts about your two choices, expands your background, then creates specific guided questions.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {["AI research", "10 / 30 / 50", "PDF report"].map((item) => (
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
                <div className="mt-4"><ApiStatusBadge status={apiStatus} /></div>
                <p className="mt-4 text-sm font-medium leading-relaxed text-slate-600">
                  AI research mode uses OpenAI and web search. Local test mode uses simple local questions and does not use credits.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
          <Card className="p-6 sm:p-8">
            <div className="space-y-5">
              <Field label="Question mode">
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => { setUseAi(true); setAiError(""); }} className={cx("min-h-[58px] rounded-2xl border px-4 py-4 text-center font-black transition", useAi ? "border-emerald-600 bg-emerald-600 text-white shadow-xl shadow-emerald-900/20" : "border-slate-200 bg-white text-slate-700")}>AI research mode</button>
                  <button type="button" onClick={() => { setUseAi(false); setAiError(""); }} className={cx("min-h-[58px] rounded-2xl border px-4 py-4 text-center font-black transition", !useAi ? "border-slate-950 bg-slate-950 text-white shadow-xl shadow-slate-950/20" : "border-slate-200 bg-white text-slate-700")}>Local test mode</button>
                </div>
              </Field>

              <Field label="Life question"><textarea value={decision} onChange={(event) => setDecision(event.target.value)} rows={3} className={inputClass()} placeholder="Example: Should I buy car A or car B? Should I move to city A or city B?" /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Choice 1"><input value={choiceOne} onChange={(event) => setChoiceOne(event.target.value)} className={inputClass()} placeholder="Example: Toyota RAV4 Hybrid or Stay in Spain" /></Field>
                <Field label="Choice 2"><input value={choiceTwo} onChange={(event) => setChoiceTwo(event.target.value)} className={inputClass("fuchsia")} placeholder="Example: Honda CR-V Hybrid or Move to Florida" /></Field>
              </div>

              <Field label="Number of questions">
                <div className="grid grid-cols-3 gap-3">
                  {QUESTION_COUNTS.map((count) => (
                    <button key={count} type="button" onClick={() => setQuestionCount(count)} className={cx("min-h-[58px] rounded-2xl border px-4 py-4 text-center font-black transition", questionCount === count ? "border-slate-950 bg-slate-950 text-white shadow-xl shadow-slate-950/20" : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/50")}>{count}</button>
                  ))}
                </div>
              </Field>

              <Field label="Background"><textarea value={background} onChange={(event) => setBackground(event.target.value)} rows={8} className={inputClass()} placeholder="Add what you already know, your concerns, budget, location, timing, people affected, practical limits, and why each option matters." /></Field>
            </div>

            <BackgroundQualityCard quality={liveQuality} />

            {aiError && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-relaxed text-red-700">{aiError}</div>
            )}

            <PrimaryButton onClick={openDetailReview} disabled={isGenerating || !normalizeText(decision) || !normalizeText(choiceOne) || !normalizeText(choiceTwo) || !normalizeText(background)} className="mt-7 w-full py-5 text-lg">
              Continue to detail check
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
              <p className="mt-4 text-sm font-medium leading-relaxed text-slate-500">AI research will compare these two options and expand the background before writing the questions.</p>
            </Card>

            <Card className="p-6 sm:p-7">
              <Eyebrow>Current background details</Eyebrow>
              <h2 className="mt-2 text-2xl font-black tracking-tight">What the app starts with</h2>
              <div className="mt-5 space-y-3">
                {normalizeText(background) ? previewDetails.map((detail, index) => (
                  <div key={`${detail}-${index}`} className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-600 shadow-sm">{detail}</div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-400">Your background details will appear here once you start typing.</div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
