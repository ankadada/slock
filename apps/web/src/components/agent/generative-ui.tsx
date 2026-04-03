import { useState } from "react";
import type {
  UIComponent,
  CardProps,
  FormProps,
  TableProps,
  CodeProps,
  ApprovalProps,
  ChartProps,
} from "@slock/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getSocket } from "@/lib/socket";
import { Check, X, Copy, CheckCheck } from "lucide-react";

interface GenerativeUIProps {
  component: UIComponent;
}

export function GenerativeUI({ component }: GenerativeUIProps) {
  if (!component || !component.type) return null;

  try {
    return <GenerativeUIInner component={component} />;
  } catch {
    return <div className="text-xs text-muted-foreground italic p-2">[UI component render error]</div>;
  }
}

function GenerativeUIInner({ component }: GenerativeUIProps) {
  switch (component.type) {
    case "card":
      return <UICard props={component.props as unknown as CardProps} />;
    case "form":
      return (
        <UIForm
          componentId={component.id}
          props={component.props as unknown as FormProps}
          actions={component.actions}
        />
      );
    case "table":
      return <UITable props={component.props as unknown as TableProps} />;
    case "code":
      return <UICode props={component.props as unknown as CodeProps} />;
    case "approval":
      return (
        <UIApproval
          componentId={component.id}
          props={component.props as unknown as ApprovalProps}
          actions={component.actions}
        />
      );
    case "chart":
      return <UIChart props={component.props as unknown as ChartProps} />;
    default:
      return null;
  }
}

function UICard({ props }: { props: CardProps | undefined }) {
  if (!props) return null;
  return (
    <div className="rounded-lg border bg-card p-4 max-w-md">
      {props.image && (
        <img
          src={props.image}
          alt={props.title}
          className="mb-3 rounded-md w-full object-cover max-h-48"
        />
      )}
      <h4 className="font-semibold text-foreground">{props.title}</h4>
      {props.description && (
        <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
      )}
      {props.content && (
        <p className="mt-2 text-sm text-foreground">{props.content}</p>
      )}
      {props.footer && (
        <p className="mt-3 text-xs text-muted-foreground border-t pt-2">
          {props.footer}
        </p>
      )}
    </div>
  );
}

function UIForm({
  componentId,
  props,
  actions,
}: {
  componentId: string;
  props: FormProps | undefined;
  actions?: UIComponent["actions"];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  if (!props) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const socket = getSocket();
    const action = actions?.[0];
    if (action) {
      socket.emit("ui:action", {
        messageId: componentId,
        actionId: action.id,
        payload: values,
      });
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="rounded-lg border bg-card p-4 max-w-md">
        <div className="flex items-center gap-2 text-green-400">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">Submitted</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4 max-w-md space-y-3">
      {props.title && (
        <h4 className="font-semibold text-foreground">{props.title}</h4>
      )}
      {props.fields.map((field) => (
        <div key={field.name}>
          <label className="text-xs font-medium text-muted-foreground">
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
          {field.type === "textarea" ? (
            <textarea
              value={values[field.name] || field.defaultValue || ""}
              onChange={(e) =>
                setValues({ ...values, [field.name]: e.target.value })
              }
              placeholder={field.placeholder}
              required={field.required}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
            />
          ) : field.type === "select" ? (
            <select
              value={values[field.name] || field.defaultValue || ""}
              onChange={(e) =>
                setValues({ ...values, [field.name]: e.target.value })
              }
              required={field.required}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select...</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              type={field.type === "number" ? "number" : "text"}
              value={values[field.name] || field.defaultValue || ""}
              onChange={(e) =>
                setValues({ ...values, [field.name]: e.target.value })
              }
              placeholder={field.placeholder}
              required={field.required}
              className="mt-1"
            />
          )}
        </div>
      ))}
      <Button type="submit" size="sm">
        {props.submitLabel || "Submit"}
      </Button>
    </form>
  );
}

function UITable({ props }: { props: TableProps | undefined }) {
  if (!props) return null;
  return (
    <div className="rounded-lg border overflow-hidden max-w-2xl">
      {props.caption && (
        <div className="bg-card px-4 py-2 border-b">
          <p className="text-sm font-medium text-foreground">{props.caption}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {props.columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-2 text-left font-medium text-muted-foreground"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-accent/30">
                {props.columns.map((col) => (
                  <td key={col.key} className="px-4 py-2 text-foreground">
                    {String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UICode({ props }: { props: CodeProps | undefined }) {
  if (!props) return null;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border overflow-hidden max-w-2xl">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-1.5 border-b">
        <span className="text-xs text-muted-foreground">
          {props.filename || props.language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <CheckCheck className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm">
        <code className="text-foreground">{props.code}</code>
      </pre>
    </div>
  );
}

function UIApproval({
  componentId,
  props,
  actions,
}: {
  componentId: string;
  props: ApprovalProps | undefined;
  actions?: UIComponent["actions"];
}) {
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  if (!props) return null;

  const handleAction = (approved: boolean) => {
    const socket = getSocket();
    const action = actions?.find((a) =>
      approved ? a.variant === "primary" : a.variant === "danger"
    ) || actions?.[approved ? 0 : 1];

    if (action) {
      socket.emit("ui:action", {
        messageId: componentId,
        actionId: action.id,
        payload: { approved },
      });
    }
    setDecision(approved ? "approved" : "rejected");
  };

  return (
    <div className="rounded-lg border bg-card p-4 max-w-md">
      <h4 className="font-semibold text-foreground">{props.title}</h4>
      <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
      {decision ? (
        <div
          className={cn(
            "mt-3 flex items-center gap-2 text-sm font-medium",
            decision === "approved" ? "text-green-400" : "text-red-400"
          )}
        >
          {decision === "approved" ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
          <span>{decision === "approved" ? "Approved" : "Rejected"}</span>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => handleAction(true)}
          >
            {props.approveLabel || "Approve"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleAction(false)}
          >
            {props.rejectLabel || "Reject"}
          </Button>
        </div>
      )}
    </div>
  );
}

function UIChart({ props }: { props: ChartProps | undefined }) {
  if (!props) return null;
  const data = props.data || [];
  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  if (props.type === "pie") {
    // Simple text-based pie representation
    const total = data.reduce((sum, d) => sum + d.value, 0);
    return (
      <div className="rounded-lg border bg-card p-4 max-w-md">
        {props.title && (
          <h4 className="font-semibold text-foreground mb-3">{props.title}</h4>
        )}
        <div className="space-y-2">
          {data.map((d, i) => {
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
            const colors = [
              "bg-blue-500",
              "bg-green-500",
              "bg-amber-500",
              "bg-red-500",
              "bg-purple-500",
              "bg-cyan-500",
              "bg-pink-500",
              "bg-indigo-500",
            ];
            return (
              <div key={i} className="flex items-center gap-2">
                <div className={cn("h-3 w-3 rounded-full shrink-0", colors[i % colors.length])} />
                <span className="text-sm text-foreground flex-1 truncate">{d.name}</span>
                <span className="text-xs text-muted-foreground">{pct}%</span>
                <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", colors[i % colors.length])}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Bar chart (default) / Line chart
  return (
    <div className="rounded-lg border bg-card p-4 max-w-lg">
      {props.title && (
        <h4 className="font-semibold text-foreground mb-3">{props.title}</h4>
      )}
      <div className="flex items-end gap-1 h-40">
        {data.map((d, i) => {
          const height = (d.value / maxValue) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground">{d.value}</span>
              <div
                className={cn(
                  "w-full rounded-t transition-all",
                  props.type === "line" ? "bg-primary/60" : "bg-primary"
                )}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
              <span className="text-xs text-muted-foreground truncate w-full text-center">
                {d.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
