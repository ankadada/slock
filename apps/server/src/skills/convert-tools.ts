import type { ToolDefinition } from "@slock/shared";

/**
 * Convert ToolDefinition[] to Anthropic's tool format.
 */
export function convertToAnthropicTools(
  tools: ToolDefinition[]
): Array<{
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}> {
  return tools.map((tool) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [paramName, param] of Object.entries(tool.parameters)) {
      const prop: Record<string, unknown> = {
        type: param.type,
        description: param.description,
      };
      if (param.enum) {
        prop.enum = param.enum;
      }
      properties[paramName] = prop;
      if (param.required) {
        required.push(paramName);
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object" as const,
        properties,
        required,
      },
    };
  });
}

/**
 * Convert ToolDefinition[] to OpenAI's function calling format.
 */
export function convertToOpenAITools(
  tools: ToolDefinition[]
): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}> {
  return tools.map((tool) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [paramName, param] of Object.entries(tool.parameters)) {
      const prop: Record<string, unknown> = {
        type: param.type,
        description: param.description,
      };
      if (param.enum) {
        prop.enum = param.enum;
      }
      properties[paramName] = prop;
      if (param.required) {
        required.push(paramName);
      }
    }

    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties,
          required,
        },
      },
    };
  });
}
