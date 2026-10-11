<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/format";

  type Variant = "primary" | "ghost" | "outline" | "danger" | "subtle";
  type Size = "sm" | "md" | "lg";

  let {
    children,
    variant = "primary",
    size = "md",
    disabled = false,
    type = "button",
    title,
    onclick,
    ...rest
  }: {
    children: Snippet;
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    title?: string;
    onclick?: (e: MouseEvent) => void;
    [key: string]: unknown;
  } = $props();
</script>

<button
  {type}
  {disabled}
  {title}
  {onclick}
  {...rest}
  class={cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    size === "sm" && "px-3 py-1.5 text-[13px]",
    size === "md" && "px-4 py-2.5 text-sm",
    size === "lg" && "px-6 py-3 text-[15px]",
    variant === "primary" && "bg-mint text-graphite hover:bg-[#6ff0cf] disabled:hover:bg-mint",
    variant === "ghost" && "text-muted hover:bg-elevated-2 hover:text-ink",
    variant === "outline" && "border border-line text-ink hover:border-mint hover:text-mint",
    variant === "subtle" && "bg-elevated-2 text-ink hover:bg-line",
    variant === "danger" && "border border-error/50 text-error hover:bg-error/10"
  )}
>
  {@render children()}
</button>
