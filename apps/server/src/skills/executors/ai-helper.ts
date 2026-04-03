import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getProviderConfig } from "../../routes/settings.js";

/**
 * Shared non-streaming AI call for skill executors.
 * Wraps the same logic as callAINonStreaming in agent-service
 * but is importable from skill executor files.
 */
export async function callAI(
  provider: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const config = getProviderConfig(provider);
  if (!config.apiKey) {
    throw new Error(`API key for provider "${provider}" not configured.`);
  }

  if (provider === "anthropic") {
    const client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } else {
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }
}
