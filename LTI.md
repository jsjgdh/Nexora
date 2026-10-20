# LTI and statements: the last institutional pieces

> What `COHORTS.md` leaves open: no LTI, no grade passback, no certificates.
> This note decides how the first two are built and why the third is not a
> certificate at all.
>
> Status: decided 2026-10-20. Not yet built.

## LTI 1.3, the way universities actually hand a course in

A course cannot be launched from Canvas or Moodle by a link. The way it is
launched is LTI, and the version that exists now is 1.3: the LMS starts an
OIDC login, the tool signs a token, and the LMS posts it to the tool. The
other half of it is AGS, the Assignment and Grade Services, where the tool
posts a score back to the LMS.

We build LTI 1.3 with AGS grade passback. The shape:

- The tool has a key pair. The public half is published as a JWKS, and the
  private half signs the id token. It is the same signing discipline the
  platform already uses for receipts, and the key never leaves the service.
- An institution registers a deployment with us: a client id, a deployment
  id, and the institution's name. One row, in the auth service's database,
  and it is the operator who adds it, because a deployment is a trust
  decision about who may launch our course.
- The login initiation endpoint takes the OIDC parameters, signs an id
  token with the LTI claims (`iss`, `aud`, `sub`, `nonce`, `lti_message_hint`,
  `lti_deployment_id`, the roles, the context and the resource link), and
  redirects the browser back to the LMS.
- The launch endpoint validates the id token against our own JWKS, checks
  the deployment id, checks the nonce, checks that the roles carry the
  instructor or the learner role for the deployment, and only then starts
  the session. A launch from an unregistered deployment is refused.
- AGS posts a score for a phase: the score is the receipt, not a number we
  made up. A learner who finished a phase has a receipt, and that receipt
  is what is posted. A learner who did not has nothing to post, and the LMS
  is told nothing, because "no score" is not "a zero".

The learner identity in an LTI launch is the LMS's user id, not an email we
can trust. So an LTI-launched learner is a local account bound to the LMS
identity: the first launch creates the account from the LMS's `sub` and the
launch's email claim, and the binding is recorded, so a later launch finds
the same account. The binding is one way: the LMS owns the identity, and a
launch never overwrites an account that already has an email the learner
chose themselves. A collision is a refusal, and it is a real one, because
the alternative is one learner taking another's account.

### What this needs to be provable without a partner

An LMS is a second system, and we do not have one. So the proof is a
harness that plays the LMS: it starts the OIDC login, receives the id
token, posts the launch, and receives the AGS score. The harness is a test
fixture, not a fake in the product: the product code is the same code a
real LMS would exercise.

The honest limit, and it goes on the page: our implementation speaks LTI
1.3 and we have proved it against our own harness. We have not yet run it
inside Canvas or Moodle, because that needs a partner institution and a
test course. The page says exactly that, and it names the two things that
have to be true before a university can use it: a deployment registered
with us, and a course configured in their LMS.

## A statement, not a certificate

The site says there are no certificates, and it is right to. A certificate
is a PDF of a claim with a seal on it, and the claim behind it is already
made, in a form anybody can check: the receipt. A learner who finished a
phase has a signed receipt; anybody can re-derive it at /verify with no
account.

What a registrar or a credit office wants is not a seal. It wants a
statement of what was judged, for a named learner, over a period, with the
evidence attached. So the product produces that, and calls it what it is:

- A statement lists the learner, the course, the term, the phases that were
  verified, the verdict for each, the date, and the receipt that proves it.
- It is signed by the platform, with the same key discipline as a receipt,
  so a statement can be checked the way a receipt is checked.
- It is not a grade, not a certificate, not a transcript, and it carries no
  credit. It says who the learner is, what the platform judged, and when.
- It is exportable as CSV by the instructor, and a single learner's
  statement can be produced for a learner who asks for it.

A university that wants a certificate with a seal on it will have to put
the seal on it themselves. We are not in the business of issuing
qualifications, and the one thing we can do is make the evidence perfect
enough that their seal is worth putting on.

## The proof

1. An LTI login initiation returns a redirect whose id token verifies
   against our own JWKS and carries the deployment and the roles.
2. A launch with a valid token, a known deployment and a fresh nonce
   creates the account and the session; a launch with an unknown deployment,
   a replayed nonce or a missing role is refused.
3. AGS posts the receipt of a finished phase, and posts nothing for a phase
   that was not finished.
4. A statement for a named learner lists the verified work with its
   receipts, is signed, and verifies.
5. The site says LTI is supported and names the two conditions, and says
   that no certificate is issued and why.
