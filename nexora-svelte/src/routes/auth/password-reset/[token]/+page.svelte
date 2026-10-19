<script lang="ts">
  import { page } from "$app/state";
  import PasswordResetPage from "$lib/components/PasswordResetPage.svelte";

  /* The path form of the reset link: /auth/password-reset/<token>.
   *
   * The platform's own link is the query form, /auth/password-reset/confirm?token=,
   * and this route is kept working because a link a learner pasted can be
   * either shape. The token is read here and handed to the one component that
   * does the work, which then takes it out of the address bar. */
  const token = (page.params.token ?? "").trim();
</script>

<PasswordResetPage {token} />
