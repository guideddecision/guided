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
    mode: "ai_research_expanded_background",
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

The user complained that previous versions asked generic questions. Do not do that.

You must:
1. Research the two choices when they are researchable.
2. Expand the user's background with practical, external, current facts.
3. Identify specific decision tensions.
4. Generate exactly the requested number of multiple-choice questions from the expanded background.

Examples:
- Two cars: research reliability, ownership cost, fuel/EV cost, safety, recalls, reviews, resale, warranty, driving use case.
- Two cities/countries: research cost of living, housing, safety, weather, healthcare, taxes/residency if relevant, work/business environment, transport, lifestyle.
- Two products/services: research pricing, features, reviews, support, limitations, alternatives.
- Career/business options: research market demand, salary/income, risks, timing, barriers.

Rules:
- Use the web search tool when practical facts could help.
- Do not invent facts. If research is limited, explain that in researchLimitations.
- practicalContext.expandedBackground must combine the user's background with researched practical facts.
- Questions must be specific to the two choices, not generic self-reflection.
- Each question must mention concrete practical consequences, thresholds, costs, risks, lifestyle effects, or facts from the expanded background.
- Answer choices must be natural first-person positions. Do not say "strongly points" or "slightly points" in the visible answer text.
- Every question must have exactly one option scored -2, one -1, one 1, and one 2.
- Randomize the visible A-D ordering.
Return only valid JSON matching the schema.
`;

    const userPrompt = `
Decision:
${decision}

Choice 1:
${choiceOne}

Choice 2:
${choiceTwo}

User background, including any added detail:
${background}

Question count:
${questionCount}

Make the output detailed, practical, researched, and specific to these choices.
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
        tool_choice: "required",
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
