import type { AgentRole, ToolDefinition } from "@slock/shared";

/**
 * Preset tool definitions organized by agent role.
 * Each tool has a full parameter schema and an executorKey
 * that maps to a registered skill executor.
 */
export const PRESET_TOOL_DEFINITIONS: Record<AgentRole, ToolDefinition[]> = {
  engineer: [
    {
      name: "review_code",
      description:
        "Review a code snippet for bugs, style issues, performance problems, and security concerns. Returns detailed feedback with suggestions.",
      parameters: {
        code: {
          type: "string",
          description: "The code snippet to review",
          required: true,
        },
        language: {
          type: "string",
          description: "Programming language of the code (e.g. typescript, python, go)",
          required: false,
        },
        focus: {
          type: "string",
          description: "Specific focus area for the review",
          enum: ["bugs", "performance", "security", "style", "all"],
          required: false,
        },
      },
      executorKey: "review_code",
      isBuiltIn: true,
    },
    {
      name: "explain_code",
      description:
        "Explain what a code snippet does in plain language, including its purpose, logic flow, and key patterns used.",
      parameters: {
        code: {
          type: "string",
          description: "The code snippet to explain",
          required: true,
        },
        language: {
          type: "string",
          description: "Programming language of the code",
          required: false,
        },
        detail_level: {
          type: "string",
          description: "Level of detail in the explanation",
          enum: ["brief", "detailed", "beginner-friendly"],
          required: false,
        },
      },
      executorKey: "explain_code",
      isBuiltIn: true,
    },
  ],

  designer: [
    {
      name: "generate_color_palette",
      description:
        "Generate a harmonious color palette based on a base color, mood, or theme. Returns a card UI component with color swatches.",
      parameters: {
        theme: {
          type: "string",
          description: "The theme or mood for the palette (e.g. 'warm sunset', 'ocean breeze', 'corporate')",
          required: true,
        },
        base_color: {
          type: "string",
          description: "Optional base color in hex format (e.g. '#3B82F6')",
          required: false,
        },
        count: {
          type: "number",
          description: "Number of colors to generate (default: 5)",
          required: false,
        },
      },
      executorKey: "generate_color_palette",
      isBuiltIn: true,
    },
    {
      name: "review_design",
      description:
        "Review a UI/UX design description and provide feedback on usability, accessibility, visual hierarchy, and consistency.",
      parameters: {
        design_description: {
          type: "string",
          description: "Description of the design to review, including layout, colors, typography, and interactions",
          required: true,
        },
        target_audience: {
          type: "string",
          description: "The target audience for the design",
          required: false,
        },
        platform: {
          type: "string",
          description: "Target platform",
          enum: ["web", "mobile", "desktop", "responsive"],
          required: false,
        },
      },
      executorKey: "review_design",
      isBuiltIn: true,
    },
  ],

  analyst: [
    {
      name: "create_chart",
      description:
        "Create a chart visualization from data. Returns a chart UI component that renders in the chat.",
      parameters: {
        chart_type: {
          type: "string",
          description: "Type of chart to create",
          enum: ["bar", "line", "pie"],
          required: true,
        },
        title: {
          type: "string",
          description: "Title for the chart",
          required: true,
        },
        data_description: {
          type: "string",
          description: "Description of the data to visualize, or raw data as JSON string",
          required: true,
        },
      },
      executorKey: "create_chart",
      isBuiltIn: true,
    },
    {
      name: "generate_report",
      description:
        "Generate a structured analytical report on a given topic with insights, findings, and recommendations.",
      parameters: {
        topic: {
          type: "string",
          description: "The topic or question to analyze",
          required: true,
        },
        context: {
          type: "string",
          description: "Additional context, data, or background information",
          required: false,
        },
        format: {
          type: "string",
          description: "Report format",
          enum: ["executive_summary", "detailed", "bullet_points"],
          required: false,
        },
      },
      executorKey: "generate_report",
      isBuiltIn: true,
    },
  ],

  product_manager: [
    {
      name: "create_user_story",
      description:
        "Create a well-structured user story with acceptance criteria. Returns a card UI component.",
      parameters: {
        feature: {
          type: "string",
          description: "The feature or functionality to create a user story for",
          required: true,
        },
        persona: {
          type: "string",
          description: "The user persona (e.g. 'admin user', 'new customer')",
          required: false,
        },
        context: {
          type: "string",
          description: "Additional context about the product or feature",
          required: false,
        },
      },
      executorKey: "create_user_story",
      isBuiltIn: true,
    },
    {
      name: "prioritize_features",
      description:
        "Analyze and prioritize a list of features using RICE or MoSCoW framework. Returns a table UI component.",
      parameters: {
        features: {
          type: "string",
          description: "Comma-separated list of features to prioritize",
          required: true,
        },
        framework: {
          type: "string",
          description: "Prioritization framework to use",
          enum: ["rice", "moscow", "value_effort"],
          required: false,
        },
        context: {
          type: "string",
          description: "Product context and business goals",
          required: false,
        },
      },
      executorKey: "prioritize_features",
      isBuiltIn: true,
    },
  ],

  qa: [
    {
      name: "generate_test_cases",
      description:
        "Generate comprehensive test cases for a feature or requirement, covering happy path, edge cases, and error scenarios.",
      parameters: {
        feature: {
          type: "string",
          description: "The feature or requirement to generate test cases for",
          required: true,
        },
        type: {
          type: "string",
          description: "Type of tests to generate",
          enum: ["unit", "integration", "e2e", "all"],
          required: false,
        },
      },
      executorKey: "generate_test_cases",
      isBuiltIn: true,
    },
    {
      name: "review_test_coverage",
      description:
        "Review test coverage for a piece of code and suggest additional test cases that are missing.",
      parameters: {
        code: {
          type: "string",
          description: "The code to analyze for test coverage",
          required: true,
        },
        existing_tests: {
          type: "string",
          description: "Existing test code, if any",
          required: false,
        },
      },
      executorKey: "review_test_coverage",
      isBuiltIn: true,
    },
  ],

  writer: [
    {
      name: "generate_documentation",
      description:
        "Generate clear, well-structured documentation for code, APIs, or features.",
      parameters: {
        subject: {
          type: "string",
          description: "The code, API, or feature to document",
          required: true,
        },
        doc_type: {
          type: "string",
          description: "Type of documentation to generate",
          enum: ["api_reference", "user_guide", "tutorial", "readme"],
          required: false,
        },
        audience: {
          type: "string",
          description: "Target audience (e.g. 'developers', 'end users', 'admins')",
          required: false,
        },
      },
      executorKey: "generate_documentation",
      isBuiltIn: true,
    },
    {
      name: "review_content",
      description:
        "Review written content for clarity, grammar, tone, and technical accuracy.",
      parameters: {
        content: {
          type: "string",
          description: "The content to review",
          required: true,
        },
        tone: {
          type: "string",
          description: "Desired tone",
          enum: ["formal", "casual", "technical", "friendly"],
          required: false,
        },
      },
      executorKey: "review_content",
      isBuiltIn: true,
    },
  ],

  custom: [
    {
      name: "llm_freeform",
      description:
        "Execute a freeform AI task with a custom prompt. Useful for any task that doesn't fit a specific skill.",
      parameters: {
        task: {
          type: "string",
          description: "The task to perform",
          required: true,
        },
        context: {
          type: "string",
          description: "Additional context for the task",
          required: false,
        },
      },
      executorKey: "llm_freeform",
      isBuiltIn: true,
    },
  ],
};
