import { cn, getInitials, getAvatarColor } from "@/lib/utils";

interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  isAgent?: boolean;
  isOnline?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

export function Avatar({
  name,
  src,
  size = "md",
  isAgent = false,
  isOnline,
  className,
}: AvatarProps) {
  const initials = getInitials(name);
  const colorClass = getAvatarColor(name);

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn(
            "rounded-full object-cover",
            sizeClasses[size],
            isAgent && "rounded-lg"
          )}
        />
      ) : (
        <div
          className={cn(
            "flex items-center justify-center font-medium text-white",
            sizeClasses[size],
            colorClass,
            isAgent ? "rounded-lg" : "rounded-full"
          )}
        >
          {initials}
        </div>
      )}
      {isAgent && (
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-purple-500 border-2 border-background flex items-center justify-center">
          <svg
            className="h-1.5 w-1.5 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
          </svg>
        </div>
      )}
      {isOnline !== undefined && !isAgent && (
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
            isOnline ? "bg-green-500" : "bg-gray-400"
          )}
        />
      )}
    </div>
  );
}
