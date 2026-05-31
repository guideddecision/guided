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

    return {
      ...question,
      options: shuffledOptions
    };
  });

  return parsed;
}


const questionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decisionTensions", "questions"],
  properties: {
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
    hasKey: Boolean(process.env.OPENAI_API_KEY)
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

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const systemPrompt = `
You are a practical guided-decision coach.

Your job is not to create generic quiz questions.
Your job is to read the user's life question and background, infer the real trade-offs, then create constructive questions that help the user understand what they actually value.

Rules:
- Use only the information provided by the user.
- Do not invent facts.
- First identify the real decision tensions.
- Then write exactly the requested number of multiple-choice questions.
- Each question must be specific to the user's life choice and background.
- Each question must compare Choice 1 and Choice 2 directly.
- Avoid vague questions like "which feels better?"
- Avoid therapy-sounding language.
- Avoid generic quiz wording.
- Do not simply repeat the background.
- Do not write answer choices that all follow the same template.
- Do not use visible phrases like "strongly points", "slightly points", "strongly favors", "slightly favors", "score", "hidden score", or "trade-offs on this point" in the answer choice text.
- The answer choices must be natural first-person statements the user could actually agree with.
- Each answer choice should represent a different real attitude, priority, fear, sacrifice, or condition related to that specific question.
- The answer choices should be specific enough that the user feels the AI understood the actual decision.
- Every question must have exactly four options.
- Each question must include one option scored -2, one scored -1, one scored 1, and one scored 2.
- Randomize which score appears under A, B, C, and D.
- Do not use the same score-letter pattern across questions.
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

Background:
${background}

Number of questions to generate:
${questionCount}

Make the questions constructive. They should test the real trade-offs in the user's background, not simply repeat the background.

For every answer choice:
- Make it concrete and specific to the user's situation.
- Make A, B, C, and D meaningfully different from each other.
- Do not label answers as strong/slight or choice 1/choice 2 in the visible text.
- Avoid using the same sentence structure across all answers.
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
        text: {
          format: {
            type: "json_schema",
            name: "guided_decision_questions",
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
    return NextResponse.json({ error: "Failed to generate questions", detail: error?.message || String(error) }, { status: 500 });
  }
}
