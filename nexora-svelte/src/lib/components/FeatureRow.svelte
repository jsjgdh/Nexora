<script lang="ts">
  /* Four capabilities, four thin marks. The row is a rhythm break between
     the hero and the shelf, not a feature-card grid: no boxes, one rule
     above, and the copy short enough to read at a glance. */

  const features = [
    {
      name: "Build",
      body: "One project, carried through every phase.",
      icon: "build",
    },
    {
      name: "Debug",
      body: "A miss names the file and the line.",
      icon: "debug",
    },
    {
      name: "Verify",
      body: "Every verdict leaves a receipt.",
      icon: "verify",
    },
    {
      name: "Grow",
      body: "The language first, then the service.",
      icon: "grow",
    },
  ] as const;
</script>

<ul class="features">
  {#each features as feature (feature.name)}
    <li>
      <span class="feature-icon" aria-hidden="true">
        {#if feature.icon === "build"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3M16 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
            <path d="m10 9-3 3 3 3M14 9l3 3-3 3" />
          </svg>
        {:else if feature.icon === "debug"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="7" y="7" width="10" height="11" rx="5" />
            <path d="M9 7V5a3 3 0 0 1 6 0v2M3 12h4M17 12h4M4 7l3 2M20 7l-3 2M4 17l3-2M20 17l-3-2M12 11v4" />
          </svg>
        {:else if feature.icon === "verify"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3 5 6v5c0 4.4 2.9 8.2 7 9.5 4.1-1.3 7-5.1 7-9.5V6l-7-3Z" />
            <path d="m8.8 12 2.1 2.1 4.3-4.6" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 18h16M7 15v3M12 11v7M17 7v11" />
            <path d="m14 7 3-3 3 3" />
          </svg>
        {/if}
      </span>
      <div>
        <p class="feature-name">{feature.name}</p>
        <p class="feature-body">{feature.body}</p>
      </div>
    </li>
  {/each}
</ul>

<style>
  .features {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5) var(--space-4);
  }

  @media (min-width: 780px) {
    .features {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
    }
  }

  .features li {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    min-width: 0;
  }

  @media (min-width: 780px) {
    .features li {
      padding-inline: var(--space-5);
      border-left: 1px solid var(--color-rule);
    }
    .features li:first-child {
      padding-left: 0;
      border-left: 0;
    }
  }

  .feature-icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    flex: none;
    color: var(--color-accent);
  }

  .feature-icon svg {
    width: 1.35rem;
    height: 1.35rem;
  }

  .feature-name {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--color-ink);
  }

  .feature-body {
    margin-top: 0.15rem;
    max-width: 22ch;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--color-muted);
  }
</style>
