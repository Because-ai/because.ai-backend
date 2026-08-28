# Because.ai — demo video script

Target length **4:30–5:00**. Every figure spoken is read off the screen at that moment, so
re-record the numbers if you re-run `bun run demo`.

Setup before recording:

```bash
bun run demo                      # reset, load, seed calendar/notes/sparse/marketing, populate
bun run dev                       # backend on :4000
# in because.ai-main
bun run dev                       # frontend on :3000
```

Open `http://localhost:3000` as the **CFO** role, browser at 100% zoom, devtools closed.

---

## 00:00 – 00:20 · The problem

**On screen** — the findings inbox, already populated. Do not scroll yet.

> A dashboard tells you sales fell eight percent. It cannot tell you whether that is normal,
> where it came from, or what to do about it. Someone has to go and find out, and by the time
> they have, the week is gone.
>
> This is Because.ai. There is no search box and nothing to ask. It runs on a schedule,
> decides on its own which numbers moved in a way worth explaining, and the answers are
> already written when you open it.

---

## 00:20 – 00:50 · The inbox

**On screen** — scroll the findings list slowly. Pause on the stat row, then on a quiet card.

> Twenty metric-and-region pairs were checked automatically. Only some of them are here as
> findings. The rest stayed quiet — and they are still shown, greyed out, with the reason
> stated. This one moved, but it was inside the normal range for that series.
>
> That distinction matters. A system that reports everything is a dashboard with more words.
> The quiet cards are the system telling you it looked and found nothing.

**Point at the stat row.**

> Mean coverage, and cost per insight, both measured from the actual run. We will come back
> to both of those.

---

## 00:50 – 01:30 · One finding, and its proof

**On screen** — click into the largest critical finding. Let the trend chart draw.

> Here is one finding. The movement, the six-month trend, and the explanation.
>
> Every sentence with an underline carries its own evidence.

**Click an underlined sentence. The evidence drawer opens.**

> This is the actual SQL that produced that number, and the actual rows it returned. Not a
> description of the query — the query.
>
> And the source is stamped: which system it came from, what grain it sits at, when it last
> refreshed, and which method produced it. Deterministic SQL, here.

**Scroll the drawer to a CRM note.**

> This is a customer note, retrieved by vector search and shown word for word. Nothing on
> this screen is paraphrased or written at display time.

---

## 01:30 – 02:05 · The checker

**On screen** — close the drawer, scroll to the dark verifier panel.

> Now the part I actually want to show you.
>
> After the first model writes the explanation, a second model reads it. It sees two things:
> the sentences, and the evidence those sentences cite. It never sees the first model's
> prompt, its reasoning, or the list of causes. If it inherited that context it would inherit
> the same assumptions and agree with itself.
>
> Its job is adversarial — find the claims that are not supported.

**Point at the stripped claims.**

> These were deleted. Not flagged — deleted, before anyone saw them. A flag is a warning the
> reader has to judge. A deletion is a decision the system already took.
>
> And the coverage figure is computed in code from those rulings, never asserted by the
> model. A model asked to score its own work will score it well.

---

## 02:05 – 02:30 · What is a model, and what is not

**On screen** — scroll up to the "How this was computed" panel.

> This is the breakdown for this finding.
>
> Detection, suppression and attribution are statistics and SQL. No model is involved, and
> every number you have read came from there. Retrieval is a vector search. Only two steps
> are language models: one writes the prose, and one deletes what it cannot back.
>
> The model never produced a number. It was handed them.

---

## 02:30 – 02:55 · Three readers, one finding

**On screen** — scroll to the narrative, click through the persona switcher.

> The same verified finding, read by three different people.
>
> The executive gets three sentences, the impact, and the decision — delivered in the Monday
> leadership digest.
>
> The regional manager gets the named accounts and this week's actions, in Slack.
>
> The analyst gets everything, including every gap in the evidence.
>
> Each version is a subset of the sentences the verifier already approved. Switching persona
> never adds a claim.

---

## 02:55 – 03:25 · Who is allowed to see it

**On screen** — top nav, switch role from CFO to **Ops viewer**. Let the page reload.

> Entitlement is enforced at the API, not in the interface.
>
> As the CFO, everything was in scope. As an operations viewer, profit has disappeared —
> requesting it returns a four-oh-three, not a filtered page. The regions in scope have
> changed. And customer names are redacted.

**Open a finding as the ops viewer, open the evidence drawer.**

> Same evidence, same query, names removed. And the finding records which role it was viewed
> as, so there is an audit trail behind the decision.

**Switch back to CFO.**

---

## 03:25 – 03:45 · What it costs

**On screen** — scroll to the "Run cost and timing" panel.

> Every finding carries its own telemetry. Two model calls. The token counts. Wall-clock time
> per step, and the estimated cost — a fraction of a cent.
>
> Notice the shape of it. The deterministic steps are milliseconds, and free. The expensive
> part only runs on findings that were actually raised. Cost scales with what moved, not with
> how much data you have.

---

## 03:45 – 04:15 · It learns

**On screen** — click "Not material" on a finding, twice on the same series.

> When an analyst says a finding is not worth their time, that goes somewhere.

**Navigate to `/learned`.**

> Two of those, and the significance band for that series has widened — from one-point-five
> sigma to one-point-eight. The next run is less sensitive on that metric and region, and the
> reason is recorded.
>
> Mark a driver as wrong twice and it stops appearing for that series. This is not a backlog
> ticket. It changes the next run.

---

## 04:15 – 04:45 · When it will not answer

**On screen** — back to the inbox, open the abstained finding.

> Two more cases, and these are the ones I would look at first.
>
> Here the numbers were unambiguous — a large, statistically significant move. But the
> evidence contradicted itself. Accounts were flagged as declining while every note retrieved
> for them said business as usual.
>
> So it did not write an explanation. It published the movement, said what it had checked,
> and asked a specific question instead.

**Open the sparse "Online" card.**

> And this is a newly launched region with two months of history. Six are needed before a
> movement can be judged, so it says so — and spends nothing. No model call was made here at
> all.

---

## 04:45 – 05:00 · Close

**On screen** — back to the inbox, full list visible.

> Two connectors are stand-ins. The warehouse is Postgres rather than Snowflake, and the
> customer notes are generated. Everything after those connectors is running live: the
> statistics, the SQL, real vector search, both model calls, and the checker.
>
> The connectors are a swap. Everything after them is the system.

---

## Recording notes

- **Do not open devtools.** `Run check` fires a Next.js server action, so the call to the
  backend happens server-to-server and never appears in the browser network tab. If you want
  to show a live run, put the backend terminal on screen instead.
- Record the **feedback beat last**, or `bun run demo` again afterwards — it permanently
  changes the band for that series.
- If a finding shows zero CRM notes, pick another. `populate:demo --scan` selects the most
  notable month per series, which is not always a month with seeded notes attached.
- Keep the cursor still while speaking. Move, pause, then talk.
- Read the numbers off the screen. Do not read them off this script.
