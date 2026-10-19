<script lang="ts">
  import { page } from "$app/state";
  import VerifyEmailPage from "$lib/components/VerifyEmailPage.svelte";

  /* The platform's own verification link: /auth/verify-email/confirm?token=.
   *
   * The friendly page at /auth/verify is the one the sign-up flow points at,
   * and this route is the one the platform's email names. Both read the code
   * the same way and both take it out of the address bar once it has been
   * read, so the two can never disagree about what a code is or where it
   * goes. */
  const token = (page.url.searchParams.get("token") ?? "").trim();
</script>

<VerifyEmailPage {token} canonical="/auth/verify-email/confirm" />
