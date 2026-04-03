import { registerSkill } from "../skill-registry.js";
import { callAI } from "./ai-helper.js";

registerSkill("review_code", async (args, context) => {
  const code = String(args.code || "");
  const language = String(args.language || "unknown");
  const focus = String(args.focus || "all");

  if (!code.trim()) {
    return { success: false, text: "No code provided for review." };
  }

  const systemPrompt =
    `You are an expert code reviewer. Review the following ${language} code with a focus on: ${focus}.` +
    `\n\nProvide your review in this structure:` +
    `\n1. Summary (1-2 sentences)` +
    `\n2. Issues Found (numbered list with severity: critical/warning/info)` +
    `\n3. Suggestions for Improvement` +
    `\n\nBe specific, reference line numbers or code patterns. Be constructive.`;

  const result = await callAI(
    context.provider,
    context.model,
    systemPrompt,
    `Review this code:\n\`\`\`${language}\n${code}\n\`\`\``
  );

  return { success: true, text: result };
});

registerSkill("explain_code", async (args, context) => {
  const code = String(args.code || "");
  const language = String(args.language || "");
  const detailLevel = String(args.detail_level || "detailed");

  if (!code.trim()) {
    return { success: false, text: "No code provided to explain." };
  }

  const systemPrompt =
    `You are a patient and clear code explainer. Explain the following code at a "${detailLevel}" level.` +
    `\n\nStructure your explanation:` +
    `\n1. Purpose: What does this code do? (1-2 sentences)` +
    `\n2. How it works: Step-by-step walkthrough` +
    `\n3. Key patterns/concepts used` +
    (detailLevel === "beginner-friendly"
      ? `\n4. Glossary: Define any technical terms used`
      : "");

  const langHint = language ? ` (${language})` : "";
  const result = await callAI(
    context.provider,
    context.model,
    systemPrompt,
    `Explain this code${langHint}:\n\`\`\`${language}\n${code}\n\`\`\``
  );

  return { success: true, text: result };
});
