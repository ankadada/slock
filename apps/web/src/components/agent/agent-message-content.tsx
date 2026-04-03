import ReactMarkdown from "react-markdown";
import type { UIComponent } from "@slock/shared";
import { GenerativeUI } from "@/components/agent/generative-ui";
import { cn } from "@/lib/utils";

interface AgentMessageContentProps {
  content: string;
  uiComponent?: UIComponent;
  isStreaming?: boolean;
}

export function AgentMessageContent({
  content,
  uiComponent,
  isStreaming,
}: AgentMessageContentProps) {
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "prose prose-sm prose-invert max-w-none",
          "prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1",
          "prose-pre:bg-background prose-pre:border prose-pre:rounded-lg",
          "prose-code:text-purple-300 prose-code:before:content-none prose-code:after:content-none",
          "prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
        )}
      >
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      {uiComponent && !isStreaming && <GenerativeUI component={uiComponent} />}
    </div>
  );
}
