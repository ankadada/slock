import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UIComponent } from "@slock/shared";
import { GenerativeUI } from "./generative-ui";

interface ToolResultCardProps {
  toolName: string;
  args: Record<string, unknown>;
  result: {
    success: boolean;
    text: string;
    uiComponent?: UIComponent;
  };
}

export function ToolResultCard({ toolName, args, result }: ToolResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border bg-muted/30 overflow-hidden max-w-lg">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-accent/30 transition-colors"
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground">
          Used <span className="font-mono">{toolName}</span>
        </span>
        {result.success ? (
          <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        )}
        <span className="flex-1" />
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-2">
          {/* Arguments */}
          {Object.keys(args).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Arguments</p>
              <pre className="text-xs bg-background rounded p-2 overflow-x-auto max-h-32">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {/* Text result */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Result</p>
            <div
              className={cn(
                "text-xs rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap",
                result.success ? "bg-background" : "bg-destructive/10 text-destructive"
              )}
            >
              {result.text.length > 500
                ? result.text.slice(0, 500) + "..."
                : result.text}
            </div>
          </div>

          {/* UI Component if present */}
          {result.uiComponent && (
            <div className="mt-2">
              <GenerativeUI component={result.uiComponent} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
