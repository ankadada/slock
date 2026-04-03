interface TypingIndicatorProps {
  names: string[];
}

export function TypingIndicator({ names }: TypingIndicatorProps) {
  if (names.length === 0) return null;

  const text =
    names.length === 1
      ? `${names[0]} is thinking`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are thinking`
        : `${names[0]} and ${names.length - 1} others are thinking`;

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex gap-1">
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-purple-400" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-purple-400" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-purple-400" />
      </div>
      <span className="text-xs text-muted-foreground">{text}...</span>
    </div>
  );
}
