# Patterns

How components compose into pages. Every template lists its sections in order, the question each section answers, and what must be true for it to ship.

## Contents
1. Section patterns
2. Explorer templates
3. Mobile templates
4. Composition rules

---

## 1. Section patterns

Reusable page sections. Use these before inventing a layout.

| Pattern | Source of the idea | Seametry form |
|---|---|---|
| Incident hero | none of the references; our own | The landing opens on a real replayed incident, not a slogan over a gradient |
| Living fragment | Infisical, Directus | A product section whose visual is the real component with labelled data |
| Claim grid | Unkey, Directus | Two to six Claim lines, each literally true of the shipped product |
| The loop | Langfuse | Watch, Notice, Inspect, Preflight, Approve, Verify, drawn once as a sequence |
| Proof strip | Langfuse, Infisical | Verifiable facts only, each a link |
| Ritual | none; our own | The verification ritual, embedded |
| Agent panel | Langfuse, Infisical | Prompts, endpoints, machine-readable version |
| Glossary bridge | Unkey | Three terms from the page, defined, linking to the glossary |
| Register footer | all | Real destinations only |

Banned sections: logo marquee (until real integrations exist), testimonial walls, vanity counters, generic three-feature icon rows, pricing teasers before a product exists, "trusted by" without names that consented.

---

## 2. Explorer templates

### Landing

```
+---------------------------------------------------------------+
| Seametry            Catalogue  Verify  Glossary  API   [Key]  |
+---------------------------------------------------------------+
| Know what it's made of.                                       |
| One sentence: what Seametry is.                               |
|                                                               |
| [ REPLAY: UNHx, 12 September 2026 ------------------------- ] |
| [ corporate action | issuer halt | oracles | executable route]|
| scrub; events link to evidence                                |
+---------------------------------------------------------------+
| Claim grid: keyless / graded / sealed / survives issuers      |
+---------------------------------------------------------------+
| Living fragment: a lot entry with provenance and condition    |
+---------------------------------------------------------------+
| Living fragment: live assay feed                              |
+---------------------------------------------------------------+
| Ritual: verify a hallmark                                     |
+---------------------------------------------------------------+
| The loop                                                      |
+---------------------------------------------------------------+
| Proof strip          | Agent panel                            |
+---------------------------------------------------------------+
| Register footer                                               |
+---------------------------------------------------------------+
```

The hero's first screen answers one question: what goes wrong without Seametry. The replay shows it before a word is read. Halftone texture sits behind the replay only.

### Lot (constituent)

```
Lot header: Lot n, name, ticker and grade, hero figure with state
Provenance line
Condition report
Evidence rows (every source, including silent ones)
Depth at size: 100, 1,000, 10,000 USDC
Corporate actions: scheduled and effective, outside-session flagged
Literature: issuer terms, mint, attestations
Cross-issuer: same underlying from other issuers, grades side by side
```

### Alloy

```
Lot header with Good Delivery or NGD stamp
Formula: constituents, units per share, value weights and their drift
Catalogue table of constituents
NAV with weakest evidence stated
Hall facts: program, instance, share mint prerogatives (none), the Key
Strike and melt history as Decision rows
```

### Hallmark

```
Hallmark row, large
Public record, readable
Seal status, then the verification ritual prefilled with this serial
Links: alloy or allocation, policy version, evidence
```

### Catalogue

Title and one sentence on the Good Delivery rules with a link to the published rule set; filter by stamp, grade, issuer; Catalogue table; NGD entries visible, never hidden.

### Glossary term

Definition; where you meet it in the product (live component excerpt); the real-world origin (assay, bullion, auction, finance); related terms. Generated from the registry.

### Status

Every source and service as an Evidence row about itself: last observation, lag, state. The Office's own freshness is evidence.

### The Key

A still page. The program ID, the upgrade authority, the transaction that made it final or the words "Key still in hand". No motion at all. Stillness is the point.

---

## 3. Mobile templates

### Today

```
Portfolio value (figure-l) with change by sign
Carousel: Needs a look (n), small cards, one statement and one detail
Holdings: alloys and allocations as rows, provenance dot where evidence is weak
Floating tab bar: Today, Catalogue, Activity
```

### Lot

Lot header; Condition report; Evidence rows; chart with the Touchstone streak gesture; Key in the thumb zone.

### Order sheet

Occluding sheet at `radius.sheet`; amount on custom keypad; path chosen by the plan; Quote block; Key "Approve and sign"; expiry. Background scales and dims.

### Hallmark

Hallmark row; the Strike on first view only; settled against approved; seal status; export certificate.

### Claims

Held legs, each with the issuer action that holds it and the time it began. Notification promise stated: "You will be told when this can be withdrawn."

---

## 4. Composition rules

1. **One Key per view.** Everything else is quiet.
2. **Rules before boxes.** Separate with a rule; use a surface only when content must lift above the page.
3. **One ceremony per surface.** Landing: the ritual. Hallmark: the Strike. Key page: none.
4. **Every section answers a named question.** If you cannot name it, cut the section.
5. **Fixture data is labelled.** A living fragment with sample data says so in `text.tertiary` beneath it.
6. **Empty is an invitation.** "No hallmarks yet. Your first trade produces one." Never "Nothing here".
7. **Density goes in tables, air goes around them.** A catalogue page can be dense; its margins cannot.
8. **Mobile first for the app, content first for the Explorer.** The Explorer is read before it is used.
