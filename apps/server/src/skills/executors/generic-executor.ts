import { registerSkill } from "../skill-registry.js";
import { callAI } from "./ai-helper.js";

/**
 * Generic LLM freeform executor.
 * Used for custom skills and the default "llm_freeform" skill.
 * Also serves as fallback executor for QA and writer roles.
 */

registerSkill("llm_freeform", async (args, context) => {
  const task = String(args.task || "");
  const extraContext = String(args.context || "");

  if (!task.trim()) {
    return { success: false, text: "No task provided." };
  }

  const systemPrompt =
    "You are a helpful AI assistant. Complete the requested task thoroughly and concisely.";

  const userMsg = extraContext
    ? `Task: ${task}\n\nContext: ${extraContext}`
    : `Task: ${task}`;

  const result = await callAI(context.provider, context.model, systemPrompt, userMsg);
  return { success: true, text: result };
});

// QA skills

registerSkill("generate_test_cases", async (args, context) => {
  const feature = String(args.feature || "");
  const testType = String(args.type || "all");

  if (!feature.trim()) {
    return { success: false, text: "No feature provided for test case generation." };
  }

  const systemPrompt =
    `You are a QA engineer generating comprehensive test cases.` +
    `\nTest type focus: ${testType}` +
    `\n\nFor each test case, include:` +
    `\n- Test ID (TC-001, TC-002, etc.)` +
    `\n- Test name` +
    `\n- Preconditions` +
    `\n- Steps` +
    `\n- Expected result` +
    `\n- Category (happy path / edge case / error handling / boundary)` +
    `\n\nCover at least: 2 happy path, 2 edge cases, 1 error handling scenario.`;

  const result = await callAI(
    context.provider,
    context.model,
    systemPrompt,
    `Generate ${testType} test cases for: ${feature}`
  );

  return { success: true, text: result };
});

registerSkill("review_test_coverage", async (args, context) => {
  const code = String(args.code || "");
  const existingTests = String(args.existing_tests || "");

  if (!code.trim()) {
    return { success: false, text: "No code provided for test coverage review." };
  }

  const systemPrompt =
    `You are a QA engineer reviewing test coverage.` +
    `\n\nAnalyze the code and identify:` +
    `\n1. What is currently tested (if existing tests are provided)` +
    `\n2. What is NOT tested (gaps)` +
    `\n3. Suggested additional test cases` +
    `\n4. Edge cases that should be covered` +
    `\n5. Overall coverage assessment`;

  const userMsg = existingTests
    ? `Code to analyze:\n\`\`\`\n${code}\n\`\`\`\n\nExisting tests:\n\`\`\`\n${existingTests}\n\`\`\``
    : `Code to analyze:\n\`\`\`\n${code}\n\`\`\`\n\nNo existing tests provided.`;

  const result = await callAI(context.provider, context.model, systemPrompt, userMsg);

  return { success: true, text: result };
});

// Writer skills

registerSkill("generate_documentation", async (args, context) => {
  const subject = String(args.subject || "");
  const docType = String(args.doc_type || "user_guide");
  const audience = String(args.audience || "developers");

  if (!subject.trim()) {
    return { success: false, text: "No subject provided for documentation." };
  }

  const docTemplates: Record<string, string> = {
    api_reference:
      "Create API reference documentation with: endpoint, method, parameters, request/response examples, error codes.",
    user_guide:
      "Create a user guide with: overview, getting started, step-by-step instructions, tips, troubleshooting.",
    tutorial:
      "Create a step-by-step tutorial with: prerequisites, objectives, steps with code examples, summary.",
    readme:
      "Create a README with: description, features, installation, usage examples, configuration, contributing.",
  };

  const systemPrompt =
    `You are a technical writer creating documentation for ${audience}.` +
    `\nDocument type: ${docType}` +
    `\n\n${docTemplates[docType] || docTemplates.user_guide}` +
    `\n\nUse clear headings, concise language, and practical examples.`;

  const result = await callAI(
    context.provider,
    context.model,
    systemPrompt,
    `Create documentation for: ${subject}`
  );

  return { success: true, text: result };
});

registerSkill("review_content", async (args, context) => {
  const content = String(args.content || "");
  const tone = String(args.tone || "technical");

  if (!content.trim()) {
    return { success: false, text: "No content provided for review." };
  }

  const systemPrompt =
    `You are a technical editor reviewing content.` +
    `\nDesired tone: ${tone}` +
    `\n\nReview for:` +
    `\n1. Clarity and readability` +
    `\n2. Grammar and spelling` +
    `\n3. Technical accuracy` +
    `\n4. Tone consistency (should be ${tone})` +
    `\n5. Structure and organization` +
    `\n\nProvide specific suggestions with line references where applicable.`;

  const result = await callAI(
    context.provider,
    context.model,
    systemPrompt,
    `Review this content:\n\n${content}`
  );

  return { success: true, text: result };
});
