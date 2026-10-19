<script lang="ts">
  import { page } from "$app/state";
  import PasswordResetPage from "$lib/components/PasswordResetPage.svelte";

  /* The query form of the reset link: /auth/password-reset/confirm?token=.
   *
   * This is the platform's default, and the route it names. The token is read
   * from the query string here and handed to the one component that does the
   * work, which then takes it out of the address bar so it does not go on
   * into a server log or a Referer. */
  const token = (page.url.searchParams.get("token") ?? "").trim();
</script>

<PasswordResetPage {token} />
