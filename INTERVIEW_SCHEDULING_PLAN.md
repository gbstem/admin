# Interview Scheduling: Availability Grid Proposal

## The problem

Setting up instructor interviews is tedious on both sides.

Interviewers (admin and reviewer roles) create interview slots **one at a time**
on the admin site — one form, one start time, one meeting link, one save, over
and over. An interviewer offering weekday afternoons and a couple of weekend
mornings across a few weeks is filling out that form dozens of times.

Candidate instructors who pass screening then see those slots on the portal as
a flat two-column list of radio buttons. There is no sense of what day it is,
no week structure, and no way to see "Tuesday afternoon" as a shape.

When none of those slots work, the candidate's only recourse is **Request A
Time**: a single date-and-time field, submitted once per time, each submission
emailing the admin inbox. A candidate free most weekday evenings has to choose
between filing a dozen requests and filing one and hoping. Interviewers then see
those requests in the **Interview Time Requests** card on the admin
`/interviews` page as a flat list per candidate, and fulfil one by hand.

Scheduling runs in both directions, and today both directions are lists. This
document proposes one when2meet-style grid used **symmetrically**: whichever
side goes first **paints** the times they are free, and the other side
**picks** one of them. Interviewers paint and candidates pick; when nothing
offered works, candidates paint and interviewers pick. It describes the
interviewer experience first, then the candidate experience, then the technical
design, then the options we considered and set aside.

The guiding constraint throughout: gbSTEM is maintained by a volunteer team with
high turnover. We have deliberately chosen the design that adds the least
permanent machinery, even where a more sophisticated approach was available.

---

## 1. What interviewers would see

A new **Set Your Availability** view on the admin site, alongside the existing
one-slot-at-a-time form (which stays — see §3).

**Painting availability.** A week-shaped grid: days across the top, times down
the left side, in rows the length of one interview. Click and drag to paint the
times you are free, exactly like when2meet. Painting Monday through Friday from
3:30 to 6:00, then Monday through Friday 8:00 to 9:00, then Saturday and Sunday
10:00 to 12:00 is three drags — not thirty-plus form submissions.

Above the grid:

- **Repeat these times over** — a start and end week, defaulting to the
  semester's interview window and unable to extend past it. Nobody can
  accidentally create slots in December.
- **Your meeting link** — entered once and applied to every slot generated,
  rather than retyped per slot.
- **Times shown in your local time (EDT)** — stated explicitly, because
  gbSTEM's volunteers are not all in one timezone.

Before anything is saved, a plain-language preview: _"This will create 43
interview slots per week over 5 weeks — 215 slots total."_ Interviewers see the
scale of what they are about to do and can adjust before committing.

**Reviewing and changing availability.** Below the editor, the same grid shows
what currently exists:

- **Open** cells are slots nobody has taken. Un-painting one deletes it.
- **Booked** cells show the candidate's name and are locked. They cannot be
  removed by un-painting; withdrawing a time someone has already accepted
  requires an explicit, deliberate action, because that candidate is holding a
  confirmation email for a real appointment.

That distinction is the point. Bulk editing is only safe if bulk editing cannot
quietly cancel somebody's interview.

**Picking from a candidate's availability.** The **Interview Time Requests**
card on `/interviews` stops being a list of datetimes. Each candidate who has
painted their own availability (§2) gets the same week grid, read-only, with
their free times shaded — the mirror image of what the candidate sees when
picking from interviewers' times — and when they last updated it, so a
three-week-old paint reads as one. Overlaid on it is the viewing interviewer's
own calendar, so every shaded cell reads as one of:

- **You have an open slot here** — one click assigns that existing slot to the
  candidate.
- **You are free here** — one click creates a slot at that time already
  assigned to the candidate, with your meeting link.
- **You are booked here** — shown, not selectable.

Any interviewer can pick, admin or reviewer, for their own calendar: a
candidate offering their week to interviewers should be answerable by whichever
interviewer is free, just as any interviewer's open slot is bookable by any
candidate. Either click sends the same "interview assigned" confirmation email
that **Schedule this** sends today. Once a candidate is scheduled or decided their
grid drops out of the card, exactly as their requests do now.

---

## 2. What candidates would see

The portal's **Schedule Your Interview** page becomes a calendar instead of a
list of radio buttons.

Candidates see a week at a time — days across, times down — with only the times
someone is actually available shown as selectable. They can move between weeks
within the interview window, and nothing outside that window is reachable.

Clicking a time selects it; confirming books it. The confirmation names the
interviewer and shows the meeting link, as it does today. A banner states
**"Times shown in your local time (EDT)"**, so a candidate on the west coast is
never guessing whose clock a time refers to.

If two interviewers are free at the same time, the candidate sees one entry and
the system assigns the interviewer — candidates are choosing a _time_, not
shopping for a person, and showing several names per cell would clutter the grid
without helping anyone. (See §7 — this is a decision worth confirming.)

**"None of these work for me"** switches the same grid into painting mode — the
interviewer's tool from §1, pointed the other way. The candidate drags across
the times they are free, within the same interview window, in the same
15-minute rows, labeled with the same timezone. Times interviewers already offer
stay visible as selectable cells, so a candidate who paints over one is nudged
to just book it. Saving replaces whatever they painted before; returning to the
page shows their painted availability for them to adjust, rather than a history
of separate requests.

That replaces today's one-datetime-per-submission request form. The candidate
describes their week once, and interviewers pick from it (§1). We expect painting
to become the rarer path once interviewers paint generously, but it is the same
action as the interviewer's, not a lesser escape hatch.

### Symmetry

The two directions are deliberately the same experience with the roles swapped:

|                    | Interviewer offers, candidate picks | Candidate offers, interviewer picks           |
| ------------------ | ----------------------------------- | --------------------------------------------- |
| Declare            | Paint on the admin grid             | Paint on the portal grid                      |
| Bounded by         | The interview window                | The interview window                          |
| Grid               | Week view, 15-minute rows           | The same component                            |
| Timezone           | Viewer-local, labeled               | Viewer-local, labeled                         |
| The other side     | Sees only the times offered         | Sees the times offered over their own slots   |
| Select             | Candidate clicks a time and books   | Interviewer clicks a time and schedules       |
| Confirmation email | Booked email, interviewer copied    | Assigned email, interviewer copied (as today) |

Where the two differ, they differ on purpose: a candidate choosing from
interviewers' times is shown a _time_ and the system picks the interviewer
(§7, question 1), while an interviewer choosing from one candidate's times
already knows who the candidate is.

---

## 3. What does not change

Deliberately, quite a lot:

- **The one-at-a-time slot form stays.** It is the right tool for a one-off, and
  for fulfilling a specific candidate's requested time. The grid is added
  alongside it, not in place of it.
- **The booking confirmation flow, and the emails, are unchanged.**
- **How a candidate reaches the interview stage is unchanged** — screening still
  drives it.
- **Nothing about how slots are stored changes.** This is the core of the design
  and the reason the proposal is small. See §4.
- **Fulfilling a candidate's proposed time still goes through the existing
  slot route.** Creating a slot already assigned to a candidate is what
  **Schedule this** does today; the grid only changes how an interviewer
  reaches it.

What _does_ change is how a candidate's proposed times are stored: one
availability record per candidate instead of one request document per time
(§4.8).

---

## 4. Design

### 4.1 The central decision: grid for input, slots for storage

A when2meet-style _interface_ does not require when2meet-style _storage_.

The obvious reading of "let interviewers specify rules" is to persist those
rules — _Mon–Fri 15:30–18:00_ as a stored object — and resolve them into
bookable times when a candidate loads the page. That approach requires a
transactional layer to coalesce every interviewer's rules into a conflict-free
list, a server-side write path, cache invalidation when anyone edits their
availability, and careful handling of what happens when someone withdraws a rule
covering an interview that is already booked.

We propose instead that **the rules live only in the browser, during the editing
session, and are expanded into individual slot records at save time.** The
database keeps exactly what it keeps today: one document per bookable slot, in
`semesters/{semesterId}/instructorInterviewTimes`.

This is the difference between a large project and a moderate one. It means:

- No coalescing table. Slots are already discrete documents; the union across
  all interviewers _is_ the collection.
- No scheduled job and no cache invalidation. Expansion happens once,
  synchronously, when the interviewer clicks save.
- No new server-side code path for interviewers, and no change to the slot
  rules in `firestore.rules`. (The candidate side swaps one portal route and one
  read rule for another — §4.8.)
- No change to the `Data.InterviewSlot` shape, and no data migration.
- No new booking race. A candidate still claims exactly one document.
- **The "availability withdrawn after it was booked" problem does not exist.**
  A booked slot carries its own status; bulk operations simply refuse to touch
  it. The rules-as-storage model _manufactures_ that edge case. This one has
  never had it.

It also inverts a difficulty. Supporting several separate availability blocks —
weekday afternoons _and_ weekday evenings _and_ weekend mornings — is awkward in
a form with day-range and time-range fields, which is where you would need
multiple stored rule objects. On a grid it is just more painted cells. The union
of arbitrary blocks is what a grid natively represents, so the feature we were
most worried about is free.

### 4.2 Expansion

Two pure functions in `src/lib/shared/`:

```
expandGrid(selection, weekRange, durationMinutes) → Date[]
expandGridToSlots(selection, weekRange, durationMinutes, interviewer, meetingLink)
  → Data.InterviewSlot[]
```

`expandGrid` turns painted cells into instants and is the half both sides use:
interviewers wrap each instant in a slot, candidates store the instants as they
are (§4.8). No I/O, no framework coupling, unit-tested under `__tests__/` like
the rest of `src/lib`. Times in the past are skipped. The interviewer's slots
are written with a single `writeBatch`, chunked to Firestore's 500-operation
limit — the example pattern over five weeks is 215 slots, but a full-window
paint can exceed 500.

The grid component and `expandGrid` live in `src/lib/shared/` in **both repos,
file for file**, under the existing rule for that directory (nothing imported
from `#lib`, changed in both repos together on branches of the same name). The
symmetry in §2 is then not a matter of two teams keeping two grids in step: it
is one component, mounted in two places.

### 4.3 Slot identity

Slot document ids are already `${epochMillis}${interviewerUid}` — deterministic
on the pair (instant, interviewer). That is good: regenerating an overlapping
range cannot create duplicates.

With bulk generation, "I need to add Thursdays too" → repaint → regenerate is
the _normal_ workflow, so regenerating must never reset a booked slot to open.
`createInterviewSlot` already guarantees this for one slot: it runs in a
transaction and refuses to overwrite a booked one. **The bulk path must keep
that guarantee**, checking each slot inside its write and skipping booked ones
rather than failing the whole save.

### 4.4 Deletion

Un-painting deletes only slots that are still open; booked slots are skipped,
and shown in the UI as locked cells. Deleting a booked slot on purpose already
works one at a time — it frees the applicant to book again and emails them a
cancellation — and stays the only way to withdraw a booked time. A bulk delete
that could cancel real interviews is the most destructive thing this feature
could ship, so the grid must never reach that path implicitly.

### 4.5 Time and timezone

Storage is already correct and needs no migration: slots are stored as absolute
instants, not wall-clock strings. The gap is that **nothing in either interface
currently states which timezone a displayed time is in.**

We propose **viewer-local, explicitly labeled**, on both sides. An interviewer
in Pacific paints 4:00 PM and creates a 4:00 PM Pacific appointment; an Eastern
candidate sees it as 7:00 PM Eastern. Both are correct, and both are now legible
because the label says so.

### 4.6 Interview duration

**Interviews are 15 minutes.** Until now that number was recorded nowhere in the
system — not in the data model, not in the schema, not in any of the interview
email templates — and existed only as shared understanding among interviewers.

The grid needs it, because it defines the row height and therefore how a painted
block becomes a count of slots. We propose a single shared constant, surfaced in
three places: the interviewer's view, the candidate's view, and the confirmation
email sent when an interview is booked.

To candidates we propose phrasing it as **"usually 15 minutes"** rather than as a
commitment. A candidate who reads a firm 15 and then has a 25-minute
conversation has been misled, and interviewers should not feel clock-bound by
our wording.

It is also what makes "is this interviewer double-booked?" a question a computer
can answer. Nothing today prevents an interviewer having a booked 4:00 slot and
an open 4:15 slot — two candidates, one interviewer, overlapping calls. That is
currently prevented only by interviewers spacing their own slots by hand, which
is exactly the discipline bulk generation removes.

Both confirmation emails (a candidate booking a slot, and an interviewer
assigning one) are sent to the candidate with the interviewer copied, so a
single sentence reaches both audiences.

### 4.7 Volume

The example pattern is 43 slots per interviewer per week at a 30-minute length.
Bounded by an explicit interview window, a full-window paint is roughly 280 per
interviewer; across ten interviewers the ceiling is a few thousand documents.
Firestore is untroubled by this, but the portal currently reads the _entire_ slot
collection and filters in the browser, which at that size becomes a meaningful
download on a phone. Making that a bounded query (with the composite index it
requires) is part of this work, and the explicit window is what makes it
expressible.

### 4.8 Candidate availability

Candidate-painted availability is stored differently from interviewer-painted
availability, and the reason is the same principle as §4.1 applied to a
different shape of data.

Slots are one document each because each is **claimed individually, by whoever
gets there first** — that is what makes booking a single-document transaction.
A candidate's availability is never claimed cell by cell: it belongs to one
person, is read by interviewers, and is superseded as a whole whenever the
candidate edits it or is scheduled. So we propose **one document per candidate**,
`semesters/{semesterId}/interviewAvailability/{uid}`, holding the painted times
as a list of absolute instants (the output of `expandGrid`) and when it was last
saved.

That gives the candidate side the same properties §4.1 gives the interviewer
side:

- **Still no stored rules.** The document holds instants, not "weekday
  evenings", so nothing is resolved at read time and nothing needs coalescing.
- **Saving is one atomic write.** Replacing a candidate's availability is a
  single `set`, rather than diffing and batch-deleting dozens of per-time
  request documents. No chunking: a full-window paint is a few hundred
  timestamps in one small document.
- **No withdrawal race worth designing for.** A candidate whose interview is
  scheduled is shown that interview, not the grid, and the save route refuses
  them by the same `interviewIneligibility` check `recordSlotRequest` uses now.
  An interviewer who picks a time the candidate un-painted a moment earlier has
  still picked a time the candidate offered; the confirmation email lets them
  sort it out, as it would today.
- **Writes stay server-side.** A portal API route replaces today's
  `/api/slotRequest`: it checks the applicant is eligible, drops times outside
  the interview window, writes the document, and emails admins **once per save**
  with a summary, not once per time. `firestore.rules` keeps the read it grants
  today on `interviewTimeRequests` (`isAdminOrReviewer()`), moved to the new
  collection; the candidate reads their own back through portal's server.

The document id is the candidate's uid, which also retires the oddity of
today's request ids carrying the applicant's wall-clock `YYYY-MM-DDTHH:mm`.

Picking from it (§1) needs one change on the server. Both selectable cells are
the existing `/api/interviewSlot` create-with-assignee operation that **Schedule
this** uses: slot ids are deterministic on (instant, interviewer), so creating
at the time of one of your open slots takes that slot over, and the create path
already refuses to overwrite a booked one (§4.3). That operation is admin-only
today; it opens to reviewers, and stays limited to the caller's own slot, which
it already is because a created slot is always the caller's. The overlay of the
interviewer's own calendar is computed in the browser from slots the page
already loads.

Nothing expires a candidate's availability. It stands until they edit it or are
scheduled, past times simply stop showing, and the saved time is shown as "last
updated" on the admin grid so interviewers can judge a stale one themselves.

`interviewTimeRequests` is retired rather than migrated: the grid lands at a
semester boundary (§8), when there are no open requests to carry over. The
admin card stops reading it at the same time; old semesters' documents can stay
where they are.

---

## 5. Prerequisite work

Two smaller changes should land before the grid. Each stands on its own merits
and improves the current system whether or not the grid is ever built, and
neither changes how slots are booked, so they are safe to land during a live
interview cycle in a way the grid is not.

1. **An explicit interview window** in the semester dates, replacing the current
   practice of borrowing the instructor-orientation date as a de facto interview
   deadline. Also fixes window boundaries shifting by up to three hours
   depending on the viewer's timezone.
2. **Timezone labels and a duration constant** in both interfaces (§4.5, §4.6).

---

## 6. Alternatives considered

### 6.1 Third-party scheduling (Cal.com, Koalendar)

The conventional answer, and genuinely strong on features: a mature availability
UI, automatic meeting links, real conflict detection against interviewers'
personal calendars, and double-booking prevention we would otherwise build
ourselves. Each interviewer creates a free account and sets their own schedule.

We set it aside for three reasons.

**Setup cost recurs forever.** gbSTEM's interviewers are high school and college
volunteers who typically stay four to six semesters. Each new interviewer would
need to create an account, configure availability, and grant calendar access
individually — gbSTEM uses personal email addresses rather than a Google
Workspace or Microsoft 365 domain, so there is no central administration to
delegate through. This is not a one-time migration cost; it is an onboarding tax
paid at every turnover, forever.

**Accounts outlive the volunteers.** A booking page lives in an account gbSTEM
does not own. When an interviewer graduates, that page is still live and there
is no admin console to reclaim or disable it. Code we maintain can at least be
read and changed by whoever comes next; an orphaned third-party account holding
a live booking link cannot be recovered at all. Cal.com's organization plan
solves this, but requires paying and owning a domain.

**It would not actually keep our code small.** Embedding it in the portal still
requires mapping each candidate to the right interviewer's booking page and
getting completed bookings back into our database so the candidate is marked as
scheduled and the slot appears to staff. That means webhook handling, signature
verification, and retry logic — real server-side code with an external
dependency, maintained by the same volunteer team, and it fails _silently_: a
dropped webhook means a booking that exists at the vendor and is invisible to
gbSTEM. The alternative — dropping the in-portal flow and emailing candidates a
link — breaks the screening pipeline that depends on candidates being marked as
scheduled.

This remains the right answer for an organization with a managed email domain
and stable staff. gbSTEM is neither.

### 6.2 Storing availability as rules

The fuller when2meet model: persist _Mon–Fri 15:30–18:00_ as a rule and resolve
rules into bookable times on demand. More flexible, and a smaller database.

Set aside as the largest option with the worst failure modes: it needs a
transactional layer coalescing all interviewers' rules, a server-side write path,
invalidation whenever anyone edits availability, and explicit handling of
withdrawn availability that has already been booked. §4.1 covers why expanding
at save time gets the same interface for a fraction of the permanent complexity —
and why the hardest edge case simply does not arise.

The candidate side does not store rules either. §4.8 keeps a candidate's
availability in one document, but as the expanded instants, not as a pattern.

### 6.3 Keeping per-time requests for candidates

The candidate grid could save each painted cell as its own
`interviewTimeRequests` document, keeping today's collection and the admin
card's existing grouping code. Set aside because every save would become a diff
— delete the times no longer painted, create the new ones, chunked past 500 —
for data that is only ever read and replaced as a whole, and because it keeps
one notification email per time. The per-document shape earns its cost for
slots, which are claimed one at a time; candidate availability never is.

### 6.4 Doing nothing

Worth stating: the current system works, and interviews are being scheduled with
it right now. The cost is entirely in interviewers' time and candidates'
experience, both of which are real but neither of which is an outage. This is
why we propose landing the prerequisite fixes during the cycle and the grid at
the semester boundary, rather than rushing.

---

## 7. Open questions

1. **Should candidates see interviewer names in the grid, or only on
   confirmation?** §2 proposes the latter for legibility; the current system
   shows names. **DECISION:** no interviewer names on the grid.
2. **Should candidates be able to reschedule or cancel themselves?** There is no
   such path today — rescheduling means emailing someone. A calendar interface
   will make people expect self-service, so it is worth deciding deliberately
   rather than by omission. **DECISION:** Yes.

---

## 8. Sequencing

**During the current cycle:** the two prerequisite changes (§5). Neither
touches booking, and both are independently valuable.

**At the semester boundary:** the grid itself, on both sites at once, as
paired admin and portal PRs on branches of the same name. Slot generation should
land when the collection is empty, so a mistake in expansion cannot damage live
bookings, and the candidate grid replaces `interviewTimeRequests` (§4.8), which
mid-cycle would strand requests candidates have already filed. Shipping only the
interviewer grid would leave the two directions asymmetric again, so they land
together. Interviews are actively being scheduled right now, and no interface improvement
justifies putting real appointments at risk.

---

_Written for review by gbSTEM leadership and whoever maintains this next. If you
are picking this up cold: §4.1 is the decision everything else follows from,
§4.8 is the same decision applied to candidates, and §4.3 is the guarantee bulk
generation must not bypass._
