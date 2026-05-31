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

const rewriteSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rewrittenBackground", "improvements"],
  properties: {
    rewrittenBackground: { type: "string" },
    improvements: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export async function POST(req: Request) {
  try {
    const { decision, choiceOne, choiceTwo, background } = await req.json();

    if (!decision || !choiceOne || !choiceTwo || !background) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const systemPrompt = `
You rewrite user-provided background for a guided life-decision app.

Your job:
- Clarify the background.
- Keep the user's meaning.
- Preserve uncertainty and trade-offs.
- Do not make the decision for the user.
- Do not invent facts.
- Do not add emotional claims the user did not imply.
- Make the rewritten version more useful for generating constructive decision questions.
- Use plain language.
Return only valid JSON.
`;

    const userPrompt = `
Life question:
${decision}

Choice 1:
${choiceOne}

Choice 2:
${choiceTwo}

Original background:
${background}

Rewrite the background so it is clearer, more balanced, and more useful for generating decision questions.
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
            name: "rewrite_background",
            strict: true,
            schema: rewriteSchema
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
    const parsed = safeJsonParse(outputText);

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to rewrite background", detail: error?.message || String(error) }, { status: 500 });
  }
}
