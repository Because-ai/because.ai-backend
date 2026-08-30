# Because.ai: demo video script

Target **2:50**, hard ceiling 3:00. Every figure spoken is read off the screen at that
moment, so re-record the numbers if you re-run `bun run demo`.

Pace is about 165 words per minute. A word budget is noted on each beat so you can hear when
you are running long. Do not ad-lib: at this length there is no slack.

Setup before recording:

```bash
ollama serve                      # leave running in its own terminal
bun run demo                      # reset, load, seed, populate. Allow about an hour on CPU
bun run dev                       # backend on :4000
# in because.ai-main
bun run dev                       # frontend on :3000
```

Run `ollama serve` rather than the desktop app: the desktop app checks for updates hourly,
and a restart mid-sweep drops every in-flight request. The first `demo` also downloads the
embedding model (~90MB), then caches it.

Do the populate well before recording. The interface reads cached findings, so it is instant
on camera, but generating them is not.

Open `http://localhost:3000` as the **CFO** role, browser at 100% zoom, devtools closed.

---

## 0:00 – 0:15 · Greeting and the problem
*45 words*

**On screen:** the findings inbox, already populated. Still.

> Hi, we are Team Status 200, and this is Because.ai.
>
> A dashboard tells you sales fell eight percent. It cannot tell you if that is normal, what
> caused it, or what to do. Someone has to find out, and by then the week is gone.

---

## 0:15 – 0:35 · The inbox
*55 words*

**On screen:** scroll the list slowly. Pause on a quiet greyed-out card.

> So there is no search box, and nothing to ask. It runs on a schedule and decides for itself
> what is worth explaining.
>
> Twenty metric and region pairs were checked. Only some became findings. The rest stayed
> quiet, and it still shows them, with the reason. A system that reports everything is just a
> dashboard.

---

## 0:35 – 1:05 · A finding, and its proof
*72 words*

**On screen:** open the largest critical finding. Let the trend draw, then click an
underlined sentence to open the evidence drawer.

> Here is one finding. What moved, the trend, and the explanation. Every underlined sentence
> carries its own evidence.
>
> This is the actual SQL that produced that number, and the actual rows it returned. Not a
> description of the query. The query. And it is stamped with the source system, the grain,
> and when it last refreshed.

**Scroll the drawer to a CRM note.**

> This is a customer note, found by vector search, shown word for word. Nothing is paraphrased.

---

## 1:05 – 1:35 · The checker
*73 words*

**On screen:** close the drawer, scroll to the dark verifier panel. Point at the stripped
claims.

> Now the part that matters most.
>
> After one model writes the explanation, a second model reads it. It sees only the sentences
> and the evidence they cite. Never the first model's prompt or reasoning. If it inherited
> that context it would inherit the same assumptions and agree with itself.
>
> These claims were deleted. Not flagged. Deleted, before anyone saw them. And the coverage
> score is computed in code, never asserted by the model.

---

## 1:35 – 1:50 · What is a model, and what is not
*36 words*

**On screen:** the "How this was computed" panel.

> Detection, suppression and attribution are statistics and SQL. Every number you have read
> came from there, with no model involved. Only two steps are language models: one writes the
> prose, one deletes what it cannot back.

---

## 1:50 – 2:05 · Three readers
*41 words*

**On screen:** click through the persona switcher.

> The same verified finding, for three people. The executive gets three sentences and the
> decision. The regional manager gets named accounts and this week's actions. The analyst gets
> everything, including the gaps. Each is a subset of what the verifier approved.

---

## 2:05 – 2:20 · Who is allowed to see it
*36 words*

**On screen:** switch role from CFO to **Ops viewer**. Let it reload. Open a finding.

> Entitlement is enforced at the API, not the interface. As an operations viewer, profit is
> gone, asking for it returns a four oh three, and customer names are redacted. The finding
> records which role read it.

---

## 2:20 – 2:35 · When it will not answer
*38 words*

**On screen:** the abstained finding, then the sparse `Online` card.

> Here the move was real, but the evidence contradicted itself. So it wrote no explanation. It
> asked a question instead.
>
> And this region has two months of history. Six are needed, so it says so, and spends nothing.

---

## 2:35 – 2:50 · Where it runs, and close
*44 words*

**On screen:** the "Run cost and timing" panel, then back to the inbox.

> Both models run on this machine. No API keys, no per-token cost, and no customer data leaves
> the network, which for a tool that just redacted customer names is the point.
>
> The connectors are a swap. Everything after them is the system. Thank you.

---

## Cut for time

These were in the five-minute version. Restore them only if you have room, in this order.

1. **The feedback loop.** Two "not material" responses widen that series' band, from 1.5 to
   1.8 sigma, visible on `/learned`. This is the most painful cut and the first to restore.
2. **Latency detail.** A finding takes about five and a half minutes to generate on a laptop
   with no GPU, and the deterministic steps that produce every number finish in under a tenth
   of a second.
3. **The contradiction detail.** Accounts were flagged as declining while every retrieved note
   said business as usual.

All three are in the README if they come up in questions instead.

## Recording notes

- **Do not open devtools.** `Run check` fires a Next.js server action, so the backend call
  happens server to server and never appears in the browser network tab.
- If you restore the feedback beat, record it **last**, or re-run `bun run demo` afterwards,
  since it permanently changes the band for that series.
- If a finding shows zero CRM notes, pick another. `populate:demo --scan` picks the month with
  the largest movement, which is not always a month with seeded notes attached.
- Keep the cursor still while speaking. Move, pause, then talk.
- Read the numbers off the screen, not off this script.
- If a judge asks whether a small local model can really do the checking: the verifier prompt
  carries three worked examples, and it needs them. Without them it caught a fabricated causal
  claim 2 times out of 6; with them, 6 out of 6 with no false positives. `bun run bench:verifier`
  reproduces that.
