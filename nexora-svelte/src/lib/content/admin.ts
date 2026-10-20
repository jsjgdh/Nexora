/* The operator's console: its own copy, and not in the marketing module.
 *
 * The site's copy module is the public voice of the product: the words a
 * reader sees on the front door. This is the other half of the product,
 * the words the person who runs the studio sees, and the two do not belong
 * in the same file. A public module that also held the console's wording
 * would be a module that grew a second audience, and the second audience is
 * the one nobody on the front door needs to read.
 *
 * The voice is the same house voice: plain, exact sentences, no em dash or
 * en dash in anything a person reads, and every claim about what the
 * console does is true of the console. */

export const ADMIN = {
  title: "The console",
  lede: "What the platform holds, and what an operator can do about it. Every action here is written to the operator's log, with the name of the person who did it.",
  notAnOperator: {
    title: "This console is for operators.",
    body: "Your account is signed in and it is not one of ours, so there is nothing here to see. If you run the studio and you need this, the flag is granted on the machine, with the operator's tooling.",
    back: "Back to your account",
  },
  signedOut: {
    title: "Sign in to use the console.",
    body: "The console is behind a session, because it holds other people's accounts.",
    action: "Sign in",
  },
  checking: {
    stamp: "checking",
    body: "The platform has to say who you are before this page shows anything.",
  },
  panels: {
    overview: "Overview",
    accounts: "Accounts",
    rights: "Data requests",
    operators: "Operators",
    activity: "Activity",
  },
  overview: {
    accounts: "Accounts",
    activeSessions: "Live sessions",
    proofs: "Verified proofs",
    operators: "Operators",
    openRequests: "Open data requests",
    pendingErasures: "Erasures to finish",
    pendingProcessorDeletions: "Processor deletions to finish",
    configuration: "Configuration",
    recentActions: "What was done lately",
    empty: "Nothing has been done yet.",
  },
  configuration: {
    authMode: "Sign-in method",
    authModeLocal: "Email and password, on this platform",
    authModeClerk: "Clerk",
    mailConfigured: "Mail provider",
    mailOn: "Configured",
    mailOff: "Not configured",
    meshKey: "Mesh key",
    meshOn: "Present, so the services authenticate each other",
    meshOff: "Absent",
    cohortsAvailable: "Cohorts",
    cohortsOn: "This build has cohorts",
    cohortsOff: "This build has no cohorts",
    note: "A flag says whether something is configured. A key is never shown here, and never leaves the service that holds it.",
  },
  accounts: {
    search: "Search by address or by id",
    searchButton: "Search",
    empty: "No account matches that.",
    columns: {
      address: "Address",
      created: "Made",
      sessions: "Sessions",
      proofs: "Proofs",
      requests: "Open requests",
      verified: "Address verified",
    },
    open: "Open the account",
    detail: {
      account: "The account",
      sessions: "Sessions",
      proofs: "Verified work",
      consents: "What it accepted",
      requests: "Its data requests",
      cohorts: "Its cohorts",
      noSessions: "No session has ever been opened for this account.",
      noProofs: "Nothing has been verified for this account yet. The work is judged in the IDE and syncs when the learner syncs it.",
      noConsents: "This account has accepted no document.",
      noRequests: "This account has filed no data request.",
      noCohorts: "This account is in no cohort.",
      endSessions: "End every session",
      endSessionsNote: "The learner has to sign in again. The work they have done is untouched, because a receipt is a record of work and ending a session does not unprove anything.",
      ended: "Every session of that account is ended.",
    },
  },
  rights: {
    requests: "Requests",
    erasures: "Erasures",
    processors: "Processor deletions",
    columns: {
      kind: "What was asked",
      who: "Who",
      due: "Due",
      status: "State",
    },
    noRequests: "No data request has been filed.",
    noErasures: "No erasure is waiting.",
    noProcessors: "No processor deletion is waiting.",
    note: "A request with a due date that nobody answered is a breach with a date on it. The erasures and the processor deletions are here for the same reason: an unactioned row is visible instead of being a claim in a document.",
    erasureNote: "Erasure is not a button here. The learner can ask for it themselves, and the operator's tooling does it when the operator must, so that the act leaves a receipt.",
  },
  operators: {
    list: "Operators",
    grant: "Grant the flag",
    grantNote: "The person has to have an account already. The flag is written to the log with your name on it.",
    grantButton: "Grant",
    revoke: "Take the flag away",
    revokeButton: "Take it away",
    granted: "Granted",
    by: "By",
    selfNote: "You cannot take your own flag away from this panel. The operator's tooling on the machine can do that, and it leaves a record too.",
  },
  activity: {
    empty: "Nothing has been done yet.",
    columns: {
      when: "When",
      what: "What",
      who: "Who",
    },
  },
  errors: {
    notAnswered: "The platform did not answer. Nothing was changed.",
    refused: "The platform refused that.",
    noSession: "The session is not an operator's session any more. Sign in again.",
  },
} as const;
