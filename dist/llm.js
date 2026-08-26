import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
const SYSTEM_PROMPT = `You are an expert at reading code and producing clear, business-oriented flowcharts.

When given a piece of code, you will:
1. Understand what the code does from a business or user perspective
2. Identify the main flow: entry point, key decisions, actions, and outcomes
3. Express everything in plain English — not code or technical jargon
4. Produce a valid Mermaid flowchart diagram

Rules for the flowchart:
- Use flowchart TD (top-down) direction
- Diamond shapes ({{...}}) for decisions and conditions — write them as questions in plain English
  e.g. {{"Is the user logged in?"}} not {{"session[:user_id].present?"}}
- Rectangle shapes [...] for actions and processes — write them as plain English verb phrases
  e.g. ["Send confirmation email"] not ["mailer.deliver_now()"]
- Use plain English labels on edges where helpful (Yes/No, Success/Failure, etc.)
- Collapse low-level implementation details into higher-level business steps
- Include error paths and failure cases where they exist
- Keep node labels short (under 8 words when possible)
- Use meaningful node IDs (e.g. checkAuth, sendEmail) not generic ones like A, B, C

Your response must be ONLY valid JSON in this exact format, with no other text:
{
  "title": "Short descriptive title for this flowchart",
  "mermaid": "flowchart TD\\n  ..."
}

The mermaid value must be a valid Mermaid flowchart string with \\n for newlines.`;
function buildUserPrompt(req) {
    const parts = [];
    if (req.filePath)
        parts.push(`File: ${req.filePath}`);
    if (req.symbolName)
        parts.push(`Function/Method: ${req.symbolName}`);
    if (req.language)
        parts.push(`Language: ${req.language}`);
    if (req.extraContext)
        parts.push(`Context: ${req.extraContext}`);
    parts.push("", "Code:", "```", req.code, "```");
    parts.push("", "Produce the business-language flowchart for this code.");
    return parts.join("\n");
}
function parseResponse(raw) {
    // Strip markdown code fences if the model wrapped its response
    const cleaned = raw
        .replace(/^```(?:json)?\s*/m, "")
        .replace(/\s*```\s*$/m, "")
        .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.mermaid || !parsed.title) {
        throw new Error("LLM response missing title or mermaid fields");
    }
    // Unescape literal \\n sequences that some models emit
    parsed.mermaid = parsed.mermaid.replace(/\\n/g, "\n");
    return parsed;
}
async function callAnthropic(req) {
    const client = new Anthropic();
    const message = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(req) }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text in Anthropic response");
    }
    const parsed = parseResponse(textBlock.text);
    return { ...parsed, provider: "anthropic" };
}
async function callOpenAI(req) {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(req) },
        ],
        response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = parseResponse(raw);
    return { ...parsed, provider: "openai" };
}
export async function generateFlowchart(req, provider = "auto") {
    const hasAnthropic = !!process.env["ANTHROPIC_API_KEY"];
    const hasOpenAI = !!process.env["OPENAI_API_KEY"];
    const resolved = provider !== "auto"
        ? provider
        : hasAnthropic
            ? "anthropic"
            : hasOpenAI
                ? "openai"
                : "anthropic"; // will fail with a clear error if no key
    if (resolved === "anthropic") {
        if (!hasAnthropic) {
            throw new Error("ANTHROPIC_API_KEY environment variable is not set. " +
                "Set it or use --provider openai with OPENAI_API_KEY.");
        }
        return callAnthropic(req);
    }
    else {
        if (!hasOpenAI) {
            throw new Error("OPENAI_API_KEY environment variable is not set. " +
                "Set it or use --provider anthropic with ANTHROPIC_API_KEY.");
        }
        return callOpenAI(req);
    }
}
//# sourceMappingURL=llm.js.map