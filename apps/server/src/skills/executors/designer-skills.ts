import { v4 as uuid } from "uuid";
import { registerSkill } from "../skill-registry.js";
import { callAI } from "./ai-helper.js";

registerSkill("generate_color_palette", async (args, context) => {
  const theme = String(args.theme || "modern");
  const baseColor = String(args.base_color || "");
  const count = Number(args.count) || 5;

  const systemPrompt =
    `You are a color theory expert and UI designer.` +
    `\nGenerate a harmonious color palette of ${count} colors.` +
    `\n\nYou MUST respond with ONLY a valid JSON array of objects.` +
    `\nEach object must have: "hex" (string, hex color), "name" (string, descriptive name), "usage" (string, suggested UI usage).` +
    `\nExample: [{"hex":"#3B82F6","name":"Ocean Blue","usage":"Primary buttons & links"}]` +
    `\n\nDo NOT include any markdown, code fences, or explanation. Just the raw JSON array.`;

  const userMsg = baseColor
    ? `Create a "${theme}" color palette starting from base color ${baseColor}.`
    : `Create a "${theme}" color palette.`;

  const rawResult = await callAI(context.provider, context.model, systemPrompt, userMsg);

  let colors: Array<{ hex: string; name: string; usage: string }>;
  try {
    const jsonMatch = rawResult.match(/\[[\s\S]*\]/);
    colors = JSON.parse(jsonMatch ? jsonMatch[0] : rawResult);
  } catch {
    colors = [
      { hex: "#3B82F6", name: "Primary Blue", usage: "Buttons & links" },
      { hex: "#10B981", name: "Success Green", usage: "Success states" },
      { hex: "#F59E0B", name: "Warning Amber", usage: "Warning indicators" },
      { hex: "#EF4444", name: "Error Red", usage: "Error states" },
      { hex: "#6366F1", name: "Accent Indigo", usage: "Accents & highlights" },
    ];
  }

  const paletteHtml = colors
    .map(
      (c) =>
        `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">` +
        `<div style="width:32px;height:32px;border-radius:6px;background:${c.hex};border:1px solid rgba(0,0,0,0.1)"></div>` +
        `<strong>${c.hex}</strong> ${c.name} - <em>${c.usage}</em></div>`
    )
    .join("");

  return {
    success: true,
    text: `Generated "${theme}" color palette with ${colors.length} colors.`,
    uiComponent: {
      id: uuid(),
      type: "card" as const,
      props: {
        title: `Color Palette: ${theme}`,
        description: `${colors.length} harmonious colors`,
        content: colors
          .map((c) => `${c.hex} - ${c.name} (${c.usage})`)
          .join("\n"),
        footer: baseColor ? `Based on: ${baseColor}` : "AI-generated palette",
      },
    },
  };
});

registerSkill("review_design", async (args, context) => {
  const designDescription = String(args.design_description || "");
  const targetAudience = String(args.target_audience || "general users");
  const platform = String(args.platform || "web");

  if (!designDescription.trim()) {
    return { success: false, text: "No design description provided for review." };
  }

  const systemPrompt =
    `You are a senior UI/UX designer reviewing a design.` +
    `\nTarget audience: ${targetAudience}` +
    `\nPlatform: ${platform}` +
    `\n\nProvide your review in these sections:` +
    `\n1. Overall Impression (1-2 sentences)` +
    `\n2. Strengths (what works well)` +
    `\n3. Usability Issues` +
    `\n4. Accessibility Concerns (WCAG compliance)` +
    `\n5. Visual Hierarchy & Layout` +
    `\n6. Recommendations (prioritized)` +
    `\n\nBe specific and constructive. Reference design principles where relevant.`;

  const result = await callAI(
    context.provider,
    context.model,
    systemPrompt,
    `Review this design:\n${designDescription}`
  );

  return { success: true, text: result };
});
