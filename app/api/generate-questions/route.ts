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

    const shuffledOptions = shuffleArray(question.options).map((option: any, index: number) => ({
      ...option,
      letter: ["A", "B", "C", "D"][index]
    }));

    return { ...question, options: shuffledOptions };
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

The app is not just a quiz. Your job has four steps:
1. Understand the user's decision and classify what kind of practical research is relevant.
2. Use web search for objective, practical information about the two choices when the choices are researchable.
   Examples:
   - two cars: reliability, safety, running costs, ownership costs, reviews, recalls, warranty, market prices
   - two cities: cost of living, jobs/business environment, weather, crime/safety, healthcare, schools, transport, housing, lifestyle
   - two countries: residency/visa, taxation, healthcare, cost of living, family/travel logistics
   - two products/services: pricing, reviews, features, support, current availability
   - career/business options: market demand, income ranges, risks, barriers, timing
3. Expand the user's background with the practical facts that actually matter.
4. Generate the decision questions from the expanded background and the real decision tensions.

Critical rules:
- Do not create generic questions.
- Do not simply repeat the user's background.
- Do not invent facts. If web research is weak, say that in researchLimitations.
- Use practical, current, externally grounded facts where helpful.
- Keep sources in the sources array. Include direct URLs when available.
- If the choices are not researchable, use the user's background and clearly explain that external research was limited.
- Every question must compare Choice 1 and Choice 2 directly.
- The questions should test the real practical consequences, not only feelings.
- Answer choices must be natural first-person statements the user could actually agree with.
- Do not use visible phrases like "strongly points", "slightly points", "score", "hidden score", or "trade-offs on this point" in the answer text.
- Each answer choice should represent a different real attitude, priority, condition, threshold, risk tolerance, cost acceptance, or next-step consequence.
- Each question must include exactly one answer scored -2, one scored -1, one scored 1, and one scored 2.
- Randomize which score appears under A, B, C, and D.
- Score meaning:
  -2 means the answer strongly supports Choice 1
  -1 means the answer somewhat supports Choice 1
   1 means the answer somewhat supports Choice 2
   2 means the answer strongly supports Choice 2
Return only valid JSON matching the schema.
`;

    const userPrompt = `
Life question:
${decision}

Choice 1:
${choiceOne}

Choice 2:
${choiceTwo}

User background:
${background}

Number of questions to generate:
${questionCount}

Output requirements:
- practicalContext.researchSummary should summarize what the web/practical research adds to the decision.
- practicalContext.expandedBackground should merge the user's background with the researched context in plain language.
- practicalContext.practicalFactors should list the specific factual/practical issues the user should know.
- practicalContext.sources should list sources used, with URLs when available.
- decisionTensions should explain the real conflicts after considering both user background and researched facts.
- questions must be written from the expandedBackground, practicalFactors, and decisionTensions.
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
            name: "guided_decision_research_questions",
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
