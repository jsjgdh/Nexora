<script lang="ts">
  import { page } from "$app/state";
  import VerifyEmailPage from "$lib/components/VerifyEmailPage.svelte";

  /* The friendly verification page.
   *
   * It is where the sign-up flow sends a learner, and it also answers a link
   * of the shape /auth/verify?token=. The code is read here and handed to the
   * one component that does the work, which then takes it out of the address
   * bar so it does not go on into a server log or a Referer. */
  const token = (
    page.url.searchParams.get("token") ??
    page.url.searchParams.get("code") ??
    ""
  ).trim();
  /** True when the sign-up flow sent the learner here. */
  const created = page.url.searchParams.get("created") === "1";
</script>

<VerifyEmailPage {token} {created} canonical="/auth/verify" />
