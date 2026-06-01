import { NextResponse } from "next/server";

function getOutputText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;
  const parts: string[] = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function safeJsonParse(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found in model response");
    return JSON.parse(match[0]);
  }
}

function shuffleArray(items: any[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shuffleAnswerOptions(parsed: any) {
  if (!Array.isArray(parsed.questions)) return parsed;
  parsed.questions = parsed.questions.map((question: any) => {
    if (!Array.isArray(question.options) || question.options.length !== 4) return question;
    const shuffled = shuffleArray(question.options).map((option: any, index: number) => ({
      ...option,
      letter: ["A", "B", "C", "D"][index]
    }));
    return { ...question, options: shuffled };
  });
  return parsed;
}

const questionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["practicalContext", "decisionTensions", "questions"],
  properties: {
    practicalContext: {
      type: "object",
      additionalProperties: false,
      required: ["decisionType", "researchSummary", "expandedBackground", "practicalFactors", "sources", "researchLimitations"],
      properties: {
        decisionType: { type: "string" },
        researchSummary: { type: "string" },
        expandedBackground: { type: "string" },
        practicalFactors: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "explanation", "relevance"],
            properties: {
              title: { type: "string" },
              explanation: { type: "string" },
              relevance: { type: "string" }
            }
          }
        },
        sources: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "url", "note"],
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              note: { type: "string" }
            }
          }
        },
        researchLimitations: { type: "string" }
      }
    },
    decisionTensions: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "explanation"],
        properties: {
          title: { type: "string" },
          explanation: { type: "string" }
        }
      }
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "theme", "groundingDetail", "question", "options"],
        properties: {
          id: { type: "number" },
          theme: { type: "string" },
          groundingDetail: { type: "string" },
          question: { type: "string" },
          options: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["letter", "text", "score"],
              properties: {
                letter: { type: "string", enum: ["A", "B", "C", "D"] },
                text: { type: "string" },
                score: { type: "number", enum: [-2, -1, 1, 2] }
              }
            }
          }
        }
      }
    }
  }
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasKey: Boolean(process.env.OPENAI_API_KEY),
    mode: "deep_research_questions",
    webResearch: true
  });
}

export async function POST(req: Request) {
  try {
    const { decision, choiceOne, choiceTwo, background, questionCount } = await req.json();

    if (!decision || !choiceOne || !choiceTwo || !background || !questionCount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (![10, 30, 50].includes(Number(questionCount))) {
      return NextResponse.json({ error: "questionCount must be 10, 30, or 50" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";

    const systemPrompt = `
You are a practical guided-decision research coach.

The user wants better detail, not generic questions. You must do three jobs:

1. Research and expand the background:
- If the choices are researchable, use web search to find practical, current information about BOTH choices.
- Examples: cars, cities, countries, schools, jobs, products, business options, travel options, neighborhoods.
- Bring in facts that would change the decision: cost, safety, reliability, market conditions, lifestyle, logistics, legal/regulatory issues, time, risk, availability, reviews, common complaints, and objective pros/cons.
- If the choices are personal and not researchable, expand the background using the user's facts and clearly say external research was limited.

2. Generate practical decision tensions:
- Identify the real conflicts after adding researched context.
- These must be specific to the choices, not generic categories.

3. Generate exactly the requested number of questions:
- Questions must be based on the expanded background and researched practical factors.
- Do NOT use generic stems like "which choice feels better".
- Do NOT simply ask "strongly/slightly".
- Each answer must be a specific first-person position, threshold, risk tolerance, cost acceptance, or condition.
- The answer choices should sound different from each other.
- The answer choices must not reveal scoring.
- Each question must contain one answer scored -2, one -1, one 1, and one 2.
- Randomize answer order.

Return only valid JSON matching the schema.
`;

    const userPrompt = `
Decision:
${decision}

Choice 1:
${choiceOne}

Choice 2:
${choiceTwo}

User background:
${background}

Question count:
${questionCount}

Important:
The user complained the prior version still asked the same generic questions. Make this output specific, practical, researched, and grounded in the actual two choices.
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          { type: "web_search", search_context_size: "medium" }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "guided_decision_researched_questions",
            strict: true,
            schema: questionSchema
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: "OpenAI request failed", detail: errorText }, { status: 500 });
    }

    const data = await response.json();
    const outputText = getOutputText(data);
    const parsed = shuffleAnswerOptions(safeJsonParse(outputText));

    if (!Array.isArray(parsed.questions) || parsed.questions.length !== Number(questionCount)) {
      return NextResponse.json({ error: "AI returned the wrong number of questions" }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to generate researched questions", detail: error?.message || String(error) }, { status: 500 });
  }
}
