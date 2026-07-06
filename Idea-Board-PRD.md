# Product Requirements Document (PRD)
## Internal Idea Board — Company-Wide Idea Management Platform

**Status:** Draft for team review
**Prepared for:** Two-team build (4 members each)
**Document owner:** [Your name]
**Version:** 1.0

---

## 1. Overview

The Idea Board is an internal company platform that lets any employee submit, discuss, and vote on ideas — spanning product features, process improvements, engineering initiatives, or anything else worth pursuing. It evolves from a small feedback-board prototype into an official, company-wide tool that leadership and teams use to surface, evaluate, and track ideas from submission through to delivery.

The platform is not just a suggestion box — it's a lightweight idea-to-execution pipeline with visibility, accountability, and recognition built in.

---

## 2. Problem Statement

Today, good ideas inside the company are scattered across chat threads, meetings, and hallway conversations. They:

- Get lost or forgotten
- Aren't visible to people outside the room they were raised in
- Have no clear owner or status once raised
- Receive no structured feedback loop back to the person who raised them

There is no single, transparent place where an idea can be raised, discussed, prioritized, and tracked to a decision.

---

## 3. Goals

- Give every employee a simple way to submit an idea and see it acknowledged.
- Give teams and leadership a transparent way to review, discuss, and decide on ideas.
- Make the lifecycle of an idea (submitted → decided → built) visible to everyone, not just the person who owns it.
- Encourage participation through visibility, fair moderation, and light recognition.
- Provide leadership with reporting on participation and outcomes, to justify continued investment in the tool.

### Non-Goals (out of scope for this version)

- Replacing formal project management tools (Jira/Linear/etc.) — the board hands off to those tools, it doesn't replace them.
- Performance review integration (e.g., tying idea submission to appraisals).
- External/customer-facing idea submission — this is an internal-only tool.

---

## 4. Target Users & Roles

| Role | Who they are | What they can do |
|---|---|---|
| **Employee (Member)** | Any employee in the company | Submit ideas, comment, vote, edit/withdraw their own pending ideas, view lifecycle status |
| **Team Lead** | Nominated lead for a team/department | Everything a Member can do, plus: move their team's ideas through review stages, leave rejection reasons, tag/categorize ideas |
| **Company Admin** | Product/leadership owner(s) of the platform | Everything a Team Lead can do, across all teams, plus: manage users/roles, view analytics dashboard, moderate/remove content, manage categories and org structure |

---

## 5. Core Concepts

- **Idea** — A single submission: title, description, category/tag, optional attachment, submitter, current status, votes, comments.
- **Status** — The current stage of an idea in its lifecycle (see Section 6).
- **Team** — A group within the company (maps to the org's actual team structure). Ideas can be team-scoped or company-wide.
- **Vote** — A single up-vote per idea per person, used as a signal of interest/support.
- **Comment** — A threaded discussion item attached to an idea.

---

## 6. Idea Lifecycle & Workflow

This is the heart of the product. Every idea moves through a defined lifecycle, and every transition is visible to the submitter and (depending on visibility settings) the wider company.

### 6.1 Lifecycle stages

1. **Submitted** — Idea has been posted and is awaiting triage.
2. **Under Review** — A Team Lead or Admin has picked it up and is actively evaluating it (may involve comment-thread discussion, clarifying questions).
3. **Planned** — Idea has been accepted and is queued for execution, but work hasn't started.
4. **In Progress** — Work has started (optionally linked out to an external ticket/project for tracking).
5. **Done** — Idea has been delivered/implemented. Submitter is notified.
6. **Declined** — Idea will not be pursued. A reason is required from whoever declines it.

Ideas can only move forward or into "Declined" — they cannot skip stages silently without a status-change event being recorded (see Audit Workflow, 6.5).

### 6.2 Submission workflow

1. Employee opens the board and selects "Submit an Idea."
2. They provide: title, description, category/tag, optional attachment, and choose visibility (team-only or company-wide).
3. They may optionally submit anonymously (see Section 8.6).
4. On submission, the system checks for possible duplicate ideas (based on similar titles/descriptions) and shows the submitter any close matches before final submission, so they can choose to upvote an existing idea instead of creating a duplicate.
5. Once submitted, the idea appears on the board with status **Submitted**, visible to its intended audience (team or company-wide).
6. The submitter receives a confirmation notification.

### 6.3 Review & triage workflow

1. A Team Lead (for team-scoped ideas) or Admin (for company-wide ideas) reviews new submissions in a queue, sorted by newest or most-voted.
2. They can:
   - Move the idea to **Under Review** and open a comment thread to ask clarifying questions.
   - Tag/re-categorize the idea.
   - Move it directly to **Planned** if it's a clear yes.
   - **Decline** it, which requires entering a short reason. The submitter is notified with the reason.
3. Discussion in the comment thread is open to all users who can see the idea (subject to visibility rules), not just the reviewer and submitter — this allows the wider team to weigh in before a decision is made.

### 6.4 Execution & completion workflow

1. Once an idea is **Planned**, a Team Lead/Admin can optionally attach a reference/link to an external tracking ticket (e.g., a project board item) so people can follow execution progress outside the Idea Board.
2. When work begins, the status is updated to **In Progress**.
3. When work is finished, the status is updated to **Done**, and:
   - The original submitter is notified automatically.
   - Anyone who voted or commented on the idea is optionally notified (per their notification preferences).
   - The idea is flagged in reporting as a "shipped idea," which feeds into recognition and analytics.

### 6.5 Status-change audit workflow

Every time an idea's status changes, the system records: who changed it, from what status to what status, when, and (for Declined) the reason given. This log is visible to Admins for accountability and is used to calculate time-to-resolution metrics.

### 6.6 Voting workflow

1. Any Member can cast one vote per idea.
2. A member cannot vote on their own idea.
3. Votes can be withdrawn (toggled off) by the voter at any time before the idea reaches a terminal state (Done/Declined).
4. Vote counts are visible on the idea card and are one of the available sort options on the board.

### 6.7 Commenting workflow

1. Any user who can view an idea can add a comment.
2. Comments are threaded (can reply to a specific comment).
3. The submitter and any prior commenters are notified of new comments (subject to notification preferences).
4. Team Leads/Admins can remove inappropriate comments; the removal is logged.

### 6.8 Notification workflow

Users are notified (via in-app notification and/or email, per their preference) when:
- Their idea changes status.
- Someone comments on their idea or a thread they've participated in.
- An idea they voted on changes status.
- (Optional, digest mode) A weekly summary of new and trending ideas relevant to their team.

### 6.9 Anonymous submission workflow

1. At submission, the employee may toggle "Submit anonymously."
2. If chosen, the idea is displayed to all other users without an attributed name.
3. Admins retain the ability to see the true submitter for moderation/abuse purposes only, and this access is itself logged.
4. Anonymous submissions still follow the same lifecycle and notification rules — the system knows the real submitter internally for notification purposes even though the identity isn't shown publicly.

### 6.10 Reporting/escalation workflow

1. Any user can flag a comment or idea as inappropriate/spam.
2. Flagged content is routed to a moderation queue visible to Admins.
3. Admins can dismiss the flag, remove the content, or (for repeated abuse) restrict a user's posting ability.

---

## 7. Roles & Permissions Summary

| Action | Member | Team Lead | Company Admin |
|---|---|---|---|
| Submit idea | ✅ | ✅ | ✅ |
| Vote / comment | ✅ | ✅ | ✅ |
| Edit/withdraw own pending idea | ✅ | ✅ | ✅ |
| Move idea through lifecycle (own team) | ❌ | ✅ | ✅ |
| Move idea through lifecycle (any team) | ❌ | ❌ | ✅ |
| Decline idea + give reason | ❌ | ✅ (own team) | ✅ |
| Tag/categorize ideas | ❌ | ✅ | ✅ |
| View analytics dashboard | ❌ | Team-level only | Company-wide |
| Manage users/roles | ❌ | ❌ | ✅ |
| Moderate flagged content | ❌ | Team-level only | Company-wide |

---

## 8. Feature Requirements

### 8.1 Idea lifecycle & content
- Multi-stage status workflow (Section 6.1).
- Categories/tags for filtering.
- Threaded comments per idea.
- Rejection reason required on Decline.
- Duplicate-idea detection at submission time.
- Support for rich text and file/image attachments on submissions.

### 8.2 Organization & access
- Company org structure (teams/departments) reflected in the platform.
- Team-scoped vs. company-wide idea visibility, set at submission time.
- Three-tier role model: Member, Team Lead, Company Admin.

### 8.3 Engagement & discovery
- Search by keyword.
- Filter by status, category/tag, team, submitter.
- Sort by newest, most voted (all-time), most voted (this week), most discussed.
- Pagination for the idea list as volume grows.
- Lightweight recognition: "Top contributor" (by ideas submitted or engagement) and "Most impactful idea" (by votes + shipped status), shown periodically (e.g., monthly).

### 8.4 Notifications
- In-app notification center.
- Per-user notification preferences (immediate vs. digest vs. off).
- Optional weekly digest email of new/trending ideas.
- Optional integration to post new ideas / status changes into a team chat channel.

### 8.5 Admin & moderation
- Analytics dashboard: submissions over time, participation rate by team, time-to-resolution, ideas by status.
- Full audit log of status changes.
- Bulk actions: merge duplicate ideas, bulk re-tag.
- Flagging/reporting queue for inappropriate content.
- Rate limiting on submissions/votes to prevent spam.

### 8.6 Anonymous submissions
- Per Section 6.9.

### 8.7 Data & reporting
- Export idea data (CSV/JSON) for offline reporting.
- Defined retention policy for stale/declined ideas (e.g., archived after N months of inactivity, not deleted).

### 8.8 Accessibility & experience
- Fully responsive on mobile and desktop.
- Keyboard navigable; screen-reader labeled.
- Meets standard color-contrast accessibility guidelines.
- Company branding (logo, color palette) applied throughout.
- Optional dark mode.

---

## 9. Success Metrics

| Metric | Why it matters |
|---|---|
| % of employees who submit at least one idea per quarter | Measures adoption/participation |
| Median time from Submitted → first status change | Measures responsiveness of review process |
| % of submitted ideas that reach Done or Declined (vs. stuck) | Measures whether ideas actually get resolved, not lost |
| Number of ideas shipped ("Done") per quarter | Measures actual delivered value |
| Repeat submission rate (submitters who return) | Measures sustained engagement, not one-off use |

---

## 10. Risks & Open Questions

- **Intake volume:** Does every idea get formally reviewed, or only those crossing a vote threshold? This needs a decision before the review workflow is finalized.
- **Ownership after Planned:** Who is accountable for actually delivering a "Planned" idea — the Team Lead who approved it, or whoever picks up the resulting ticket? Needs a clear answer to avoid ideas stalling in "Planned."
- **Anonymous submission and moderation tension:** Anonymity increases honest input but complicates accountability for spam/abuse — the moderation workflow (8.5) needs to be trusted by employees for anonymity to be adopted.
- **Team split for build:** With two teams of four, work should be divided in a way that minimizes collision on shared data models/contracts — recommend splitting by feature area (e.g., lifecycle/roles/org structure vs. discovery/notifications/UX) rather than by vertical slice, and agreeing on any shared-contract changes upfront.

---

## 11. Suggested Phasing

**Phase 1 (MVP for pitch):** Multi-stage lifecycle, categories/tags, comments, rejection reasons, team-scoped visibility, basic roles (Member/Team Lead/Admin), search & filters, audit log.

**Phase 2:** Notifications center + digest emails, analytics dashboard, duplicate detection, anonymous submissions, recognition/leaderboard.

**Phase 3:** Chat-channel integration, bulk moderation tooling, data export/retention policy, accessibility/branding polish, dark mode.

---

*End of document.*
