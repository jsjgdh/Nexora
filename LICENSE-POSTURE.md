# NEXORA licence posture

**This is a decision document, not legal advice.** It records what the
copyright holder has decided about licensing, what that decision blocks, and
what is still open. It is not an opinion on what anyone should do, and
nothing here is a substitute for a lawyer reading the code and the contracts.

**Date: 2026-10-20.**

---

## 1. The decision

**The code in this repository ships as proprietary software. All rights
reserved. No licence is granted.**

This is not a decision to defer. A licence file already exists at the
repository root (`LICENSE`) and it says exactly this: "This repository is NOT
open source, and no licence is granted by its presence here. Nothing in it may
be copied, modified, distributed, sublicensed or used to build a competing
product without the copyright holder's prior written permission."

This document records the decision, the reason for it, and its consequences.
It does not change the licence, and it does not create one.

### 1.1 What "proprietary, all rights reserved" means in practice

- Nobody may copy, modify, distribute, sublicense or use the code to build a
  competing product without the copyright holder's written permission.
- Reading the repository grants no rights over it. Access is not a licence.
- The copyright holder is the only party that can grant rights, and it has
  not granted any to anybody.
- The third-party components in the dependency trees remain under their own
  licences, which are inventoried in `platform/package-lock.json` and
  `nexora-svelte/package-lock.json`. Their terms are unaffected by this
  decision.

### 1.2 Why

Three reasons, in the order they mattered.

**The product's claim is the mechanism, and the mechanism is the code.** What
this platform sells is that a learner's completion can be re-judged rather
than trusted: the platform signs what it observed, and the attestation path
re-derives the verdict from that signature instead of from the client's word.
A learner cannot forge a verdict, and a competitor should not be able to take
the implementation and ship the same claim with a weaker guarantee. A
permissive licence hands the mechanism to anyone who asks.

**The curriculum is the product.** The phases, the labs, the answer keys and
the signed-receipt design are what a learner pays for. The code that runs
them is the part that must not be redistributed.

**Nothing in the product's shape requires an open-source licence.** It is a
hosted service sold as a subscription, with an operator's console, an
institutional surface, a payment provider and a single-host deployment. There
is no community to grow by publishing the source, and no ecosystem to attract
by giving it away.

### 1.3 The alternative that was considered

An open-source licence (MIT, Apache-2.0, or a source-available licence such
as BSL or AGPL) was considered and not chosen. The specific blockers:

- **The repository has no CLA.** `CONTRIBUTING.md` accepts contributions only
  under terms the operator describes, and asks that nothing be sent which the
  sender cannot license to the copyright holder. That is the right instinct,
  but a permissive licence needs every contributor's copyright to be either
  assigned or covered by a CLA, and this repository has neither.
- **The repository has no history of outside contributions.** Every one of the
  33 commits in the history at the time of writing is from the operator's own
  work, so there is no third-party copyright to license out. That makes
  relicensing easy today and it is the reason to decide today rather than
  later.
- **The decision has not been made by a person with the authority to make
  it.** The copyright holder in the LICENSE file is a placeholder (see
  section 3). A licence is a legal instrument and the person who signs it has
  to be the person who owns the copyright.

---

## 2. What the decision blocks

| Blocked | Concretely |
|---|---|
| Distribution of the source | A customer cannot run a copy of the platform for themselves. The only thing that can be handed over is a running deployment, which is a contract, not a licence. |
| Use by a third party as a component | The service kit, the gateway, the attestation and receipt machinery cannot be lifted into another product. |
| A hosted competitor built on this code | The mechanism and the curriculum stay with the operator. |
| Self-hosting by a customer | A customer buys the service, not the stack. A school that wants the platform on its own hardware is a conversation about a contract, not a download. |
| Public forks and pull requests from strangers | A pull request from someone outside the company is a licensing question before it is a code review. |
| Publication of the curriculum under an open licence | The phases and the labs cannot be re-licensed separately from the platform. |

**What it does not block.** The operator can still publish the platform's
public documentation, the marketing site, the pricing, the terms of service
and the privacy notice. The product can still be sold. The operator can still
grant a bespoke licence to a specific partner, and a bespoke licence is
compatible with "all rights reserved".

**What it costs.** Two things, stated rather than assumed away.

- **Diligence friction.** A customer's counsel, an investor or an acquirer's
  counsel will ask what licence the code is under, and "all rights reserved,
  with a named copyright holder" is a real answer but not an open-source
  answer. The counter is that the product is sold as a service, not as
  software, so the codebase's licence is a normal question with a normal
  answer.
- **The dependency on the operator.** The code, the deployment, the
  curriculum and the operations are one operator's work. There is no
  community to fall back on, and no bus factor other than the number of
  people the operator employs.

---

## 3. What is still open

These are the gaps, and each one is a task rather than a decision this
document makes.

### 3.1 The copyright holder is a placeholder

The LICENSE file reads:

```
Copyright (c) 2026 [[ operator legal name — set before publishing ]]
```

**A licence with a placeholder copyright holder is not a licence.** Until the
legal name of the copyright holder is filled in, the notice does not identify
who holds the copyright, and a notice that does not identify the holder is
weaker than it looks. The same placeholder appears in a place where it is
worse, because it is visible to learners: `OPERATOR_LEGAL_NAME` in the
platform's environment, and with it the `controller` field of every account
export and every erasure receipt. The default value is the literal string
above, and it reaches a learner's data file.

**What closes it.** Set `OPERATOR_LEGAL_NAME` to the operator's legal name in
the deployment's environment, and put the same name in the LICENSE file. The
first is a deployment step and is in `ENVIRONMENT.md`; the second is an edit
to a file this work did not touch.

### 3.2 The references in the LICENSE file point at things that are not here

The LICENSE file refers to `nexora-ide/LICENSE.txt` and
`nexora-ide/ThirdPartyNotices.txt` for the desktop IDE, which is a separate
repository and a fork of an editor with its own upstream licence. Those files
are not in this repository, which is consistent with the IDE living
elsewhere, and the statement is about that other repository.

It also says the decision "is recorded in `company/DECISIONS.md`". **There is
no `company` directory in this repository.** The same is true of the
`company/legal/RETENTION-DELETION.md` that
[platform/docs/OPERATIONS.md](platform/docs/OPERATIONS.md) cites as the
authority for the retention schedule, and of the
`company/LEGAL-COMPLIANCE-AUDIT.md` that the code's own comments cite for
the findings the rights module answers.

Those documents are either in a repository that is not this one, or they were
never written. Until they exist somewhere, the citations in this repository
point at nothing, and a reader following them finds a dead end. **What closes
it:** either publish the decision record where the citations point, or change
the citations to point at the documents that do exist, which for this
decision is this file.

### 3.3 The "third-party notices" inventory is a lockfile

The LICENSE file says a machine-readable inventory of third-party components
is maintained in the two lockfiles. That is true and it is the right place
for the dependency tree. It is not a notice file: a lockfile says what is
installed, not what licence each package is under, and a downstream
recipient who needs the notices for the binaries needs a generated THIRD-PARTY
NOTICES file.

**What closes it:** generate the notices from the lockfiles at build time and
ship them with the images. Nothing in this repository does that today.

### 3.4 The proprietary licence is not the same as a commercial contract

The code being unlicensed for outside use does not by itself settle what a
customer gets. The terms of service, the privacy notice, the acceptable use
policy and the data processing agreement are the documents that govern the
relationship with a customer, and the licence governs the relationship with a
reader of the source. **Both sets are needed and they are different
documents.** The terms of service are published by the site; whether they are
in this repository was not established.

---

## 4. How this decision changes

| Trigger | What it does to this document |
|---|---|
| The operator decides to open source | Section 1 is replaced. A CLA or a copyright assignment is needed first, because the history has outside contributions by then. A licence cannot be applied retroactively to a contributor who has not agreed to it. |
| The operator relicenses to a source-available licence (BSL, AGPL, Elastic) | Section 1 is replaced with the new terms and the conversion date. The change is not retroactive either. |
| The IDE is merged into this repository | Section 3.2 changes: the notices have to be brought in, and the third-party inventory covers the editor's own dependencies. |
| The operator's legal name is set | Section 3.1 closes. The LICENSE file and the `OPERATOR_LEGAL_NAME` default are updated together. |
| A customer asks to run it themselves | The answer is a bespoke licence or a contract, not a download. Section 2 is the boundary. |

---

## 5. What this document does not say

- It does not say the current licence is enforceable. That is a question for
  a lawyer, and the placeholder copyright holder is a real problem for it.
- It does not say the operator has the right to license this code. That
  depends on who wrote it, and on whether anyone outside the operator's
  organisation has contributed. The history at the time of writing suggests
  nobody has, and "suggests" is not "establishes".
- It does not cover the desktop IDE, which is a separate repository with its
  own upstream licence and its own notices.
- It does not cover the third-party dependencies, whose licences are their
  own and are unaffected by this decision.
- It does not claim that any customer, investor or partner has accepted this
  posture. Nobody has been asked.
