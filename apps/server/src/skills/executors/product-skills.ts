import { v4 as uuid } from "uuid";
import { registerSkill } from "../skill-registry.js";
import { callAI } from "./ai-helper.js";

registerSkill("create_user_story", async (args, context) => {
  const feature = String(args.feature || "");
  const persona = String(args.persona || "user");
  const extraContext = String(args.context || "");

  if (!feature.trim()) {
    return { success: false, text: "No feature provided for user story." };
  }

  const systemPrompt =
    `You are an experienced product manager writing user stories.` +
    `\n\nCreate a well-structured user story for the given feature.` +
    `\nRespond with ONLY valid JSON in this format (no markdown, no code fences):` +
    `\n{` +
    `\n  "title": "short title",` +
    `\n  "story": "As a [persona], I want to [action], so that [benefit].",` +
    `\n  "acceptance_criteria": ["criterion 1", "criterion 2", "criterion 3"],` +
    `\n  "priority": "high|medium|low",` +
    `\n  "estimated_points": 3` +
    `\n}`;

  const userMsg = extraContext
    ? `Feature: ${feature}\nPersona: ${persona}\nContext: ${extraContext}`
    : `Feature: ${feature}\nPersona: ${persona}`;

  const rawResult = await callAI(context.provider, context.model, systemPrompt, userMsg);

  let story: {
    title: string;
    story: string;
    acceptance_criteria: string[];
    priority: string;
    estimated_points: number;
  };

  try {
    const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
    story = JSON.parse(jsonMatch ? jsonMatch[0] : rawResult);
  } catch {
    return {
      success: true,
      text: rawResult,
    };
  }

  const acList = story.acceptance_criteria
    .map((ac, i) => `${i + 1}. ${ac}`)
    .join("\n");

  return {
    success: true,
    text: `Created user story: "${story.title}"`,
    uiComponent: {
      id: uuid(),
      type: "card" as const,
      props: {
        title: story.title,
        description: story.story,
        content: `**Acceptance Criteria:**\n${acList}`,
        footer: `Priority: ${story.priority} | Estimate: ${story.estimated_points} pts`,
      },
    },
  };
});

registerSkill("prioritize_features", async (args, context) => {
  const features = String(args.features || "");
  const framework = String(args.framework || "rice");
  const extraContext = String(args.context || "");

  if (!features.trim()) {
    return { success: false, text: "No features provided for prioritization." };
  }

  const frameworkDescriptions: Record<string, string> = {
    rice: "Use RICE scoring: Reach (1-10), Impact (1-3), Confidence (0.5-1.0), Effort (1-10). Score = (Reach * Impact * Confidence) / Effort",
    moscow:
      "Use MoSCoW: Must have, Should have, Could have, Won't have. Explain reasoning for each category.",
    value_effort:
      "Use Value/Effort matrix: Rate each feature on Value (1-10) and Effort (1-10). Priority = Value / Effort.",
  };

  const systemPrompt =
    `You are a product strategist prioritizing features.` +
    `\nFramework: ${frameworkDescriptions[framework] || frameworkDescriptions.rice}` +
    `\n\nRespond with ONLY valid JSON in this format (no markdown, no code fences):` +
    `\n[{"feature":"name","score":8.5,"reach":8,"impact":3,"confidence":0.9,"effort":3,"priority":"P1","reasoning":"short explanation"}]` +
    `\n\nSort by priority (highest first). Use the fields relevant to the ${framework} framework.`;

  const userMsg = extraContext
    ? `Features to prioritize: ${features}\nContext: ${extraContext}`
    : `Features to prioritize: ${features}`;

  const rawResult = await callAI(context.provider, context.model, systemPrompt, userMsg);

  let prioritizedFeatures: Array<{
    feature: string;
    score?: number;
    priority: string;
    reasoning: string;
    [key: string]: unknown;
  }>;

  try {
    const jsonMatch = rawResult.match(/\[[\s\S]*\]/);
    prioritizedFeatures = JSON.parse(jsonMatch ? jsonMatch[0] : rawResult);
  } catch {
    return { success: true, text: rawResult };
  }

  // Build columns based on framework
  const columns =
    framework === "moscow"
      ? [
          { key: "feature", label: "Feature", width: "30%" },
          { key: "priority", label: "Category", width: "20%" },
          { key: "reasoning", label: "Reasoning", width: "50%" },
        ]
      : [
          { key: "feature", label: "Feature", width: "25%" },
          { key: "score", label: "Score", width: "10%" },
          { key: "priority", label: "Priority", width: "10%" },
          { key: "reasoning", label: "Reasoning", width: "55%" },
        ];

  const rows = prioritizedFeatures.map((f) => ({
    feature: f.feature,
    score: f.score != null ? String(Math.round(f.score * 10) / 10) : "-",
    priority: f.priority,
    reasoning: f.reasoning,
  }));

  return {
    success: true,
    text: `Prioritized ${prioritizedFeatures.length} features using ${framework.toUpperCase()} framework.`,
    uiComponent: {
      id: uuid(),
      type: "table" as const,
      props: {
        columns,
        rows,
        caption: `Feature Prioritization (${framework.toUpperCase()})`,
      },
    },
  };
});
