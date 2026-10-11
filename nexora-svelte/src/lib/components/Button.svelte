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
    "inline-flex cursor-pointer items-center justify-center gap-2 border border-transparent font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
    size === "sm" && "px-3 py-1.5 text-[13px]",
    size === "md" && "px-4 py-2.5 text-sm",
    size === "lg" && "px-6 py-3 text-[15px]",
    variant === "primary" && "bg-accent text-ground hover:bg-accent-bright disabled:hover:bg-accent",
    variant === "ghost" && "text-muted hover:bg-raised hover:text-white",
    variant === "outline" && "border-rule text-white hover:border-accent hover:text-accent",
    variant === "subtle" && "border-rule bg-raised text-white hover:border-rule-strong",
    variant === "danger" && "border-removed text-removed"
  )}
>
  {@render children()}
</button>
