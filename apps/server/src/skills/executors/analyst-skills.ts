import { v4 as uuid } from "uuid";
import { registerSkill } from "../skill-registry.js";
import { callAI } from "./ai-helper.js";

registerSkill("create_chart", async (args, context) => {
  const chartType = String(args.chart_type || "bar");
  const title = String(args.title || "Chart");
  const dataDescription = String(args.data_description || "");

  if (!dataDescription.trim()) {
    return { success: false, text: "No data description provided for chart." };
  }

  const systemPrompt =
    `You are a data visualization assistant. Based on the user's data description, generate chart data.` +
    `\n\nYou MUST respond with ONLY a valid JSON array of objects. Each object must have a "name" field (string) and a "value" field (number).` +
    `\nExample: [{"name":"Q1","value":100},{"name":"Q2","value":200}]` +
    `\n\nDo NOT include any markdown, code fences, or explanation. Just the raw JSON array.`;

  const rawData = await callAI(
    context.provider,
    context.model,
    systemPrompt,
    `Generate ${chartType} chart data for: ${dataDescription}`
  );

  let data: Array<{ name: string; value: number }>;
  try {
    // Try to extract JSON from the response in case the model wraps it
    const jsonMatch = rawData.match(/\[[\s\S]*\]/);
    data = JSON.parse(jsonMatch ? jsonMatch[0] : rawData);
  } catch {
    // Fallback: create simple placeholder data
    data = [
      { name: "Category A", value: 40 },
      { name: "Category B", value: 65 },
      { name: "Category C", value: 30 },
    ];
  }

  return {
    success: true,
    text: `Created a ${chartType} chart: "${title}" with ${data.length} data points.`,
    uiComponent: {
      id: uuid(),
      type: "chart" as const,
      props: {
        type: chartType,
        title,
        data,
        xKey: "name",
        yKey: "value",
      },
    },
  };
});

registerSkill("generate_report", async (args, context) => {
  const topic = String(args.topic || "");
  const extraContext = String(args.context || "");
  const format = String(args.format || "detailed");

  if (!topic.trim()) {
    return { success: false, text: "No topic provided for the report." };
  }

  const formatInstructions: Record<string, string> = {
    executive_summary:
      "Write a concise executive summary (3-5 paragraphs). Start with key findings, then analysis, then recommendations.",
    detailed:
      "Write a comprehensive report with sections: Executive Summary, Background, Analysis, Key Findings, Recommendations, Next Steps.",
    bullet_points:
      "Present the analysis as organized bullet points grouped by category. Use clear headers for each section.",
  };

  const systemPrompt =
    `You are a business analyst creating a professional report.` +
    `\n\nFormat: ${formatInstructions[format] || formatInstructions.detailed}` +
    `\n\nBe data-driven, specific, and actionable. Avoid vague statements.`;

  const userMsg = extraContext
    ? `Topic: ${topic}\n\nAdditional context: ${extraContext}`
    : `Topic: ${topic}`;

  const result = await callAI(context.provider, context.model, systemPrompt, userMsg);

  return { success: true, text: result };
});
