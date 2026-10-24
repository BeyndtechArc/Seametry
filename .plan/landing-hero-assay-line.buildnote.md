Surface:     Explorer (clients/web), the public landing page.
Template:    Landing (patterns.md), rewritten to this order on 24 October
             2026 after Storm's review: section 02 was the most broken, the
             sections below it lacked layers and real product, the loop,
             the agent panel and the bundle comparison did not need to be on
             the landing, and baskets, questions and a close were missing.
Question:    What is an open-AP ETF, and what happens to a holder's basket
             when an issuer uses its powers?
Sections:    1. House rail: one bar across the content width, a step of the
                page ground toward its ink so it reads as the page while it
                scrolls, the brand at left, the three public routes as one
                segmented group in the centre with the current route on a
                deeper chip, the theme control and Open app at right
                (Storm's mockup and review, 23 October 2026).
             2. Hero copy (left): eyebrow, display title "Open AP ETFs",
                the one-sentence promise, Open app and Read mechanism.
             3. Hero instrument (right): the Hall as an assay line telling
                the Hall's story from four camera stations in turn, over
                the disc field.
             4. The recorded incident, its card starting over the disc band.
                Answers: does a Melt survive an issuer's freeze?
             5. 01 Claim grid. Answers: what does the Hall make checkable?
             6. 02 Opened Alloy. Answers: what does one share hold, and what
                can each holding's issuer still do?
             7. 03 Strike steps. Answers: what happens when I Strike, Melt,
                and an issuer freezes a leg?
             8. 04 Basket cards. Answers: which baskets can a wallet buy
                today, and what do they hold?
             9. 05 Proof strip and the anchor chain. Answers: which claims
                have a public artifact today, and how far can a Hallmark be
                verified?
             10. 06 Question list. Answers: what do people ask before they
                trust this?
             11. Register footer, opening on the Hall bench and ending on the
                Closing wordmark. Answers: what does the Hall do when I work
                it?
Components:  House rail, Hero instrument, Incident ledger, Mechanism plate,
             Opened Alloy, Photo frame, Basket card, Basket plate, Lot mark,
             Condition report facts, Grade, Stamp, Digest, Strike steps,
             Proof strip, Anchor chain, Question list,
             Hall bench, Register footer, Closing wordmark, RouteAction,
             QuietLink. Section heading: patterns.md composition rule 9.
Data:        Founding record of Stoic Crew (shared/evidence/alloys/index.json,
             Solana devnet, recorded 6 October 2026); the admissions
             snapshot through allocationOffer() (policy-2026.10.1); the
             published baskets (allocationIndexes); How it works, read from
             the docs source; photographs listed in src/lib/photos.ts. No
             live market figure is shown, so none needs a live age; every
             fragment names its record and capture.
States:      instrument: as in its contract. Opened Alloy and basket cards
             read files compiled into the build, so they have no loading
             state; a missing record removes the fragment rather than
             drawing it empty, and a missing logo draws the lettered Lot
             mark. Photo unavailable: the frame and caption remain over the
             touch ground. Question list: closed, open, and working without
             script. Phone: every layered fragment stacks in reading order.
Ceremony:    None. The tour is the instrument's own motion, not a ceremony.
Names:       Formula, Strike, Melt, Claim, Hall, Alloy, issuer powers,
             freeze, Grade, basket (foundations section 3).
Assumptions: 1. Four stations and their story: the Formula (the vault and
                its meters, at rest); the Strike (one of each constituent
                leaves the wallet, travels through the open gates into the
                vault, the ram strokes and a share lands on the holder's
                stack); issuer powers (an issuer lowers and padlocks its
                leg's gate); the Melt (the share returns, a Claim is filed on
                every leg, every open leg comes out of the vault to the
                wallet, and the frozen leg's unit halts at its gate while
                its Claim stays). Leaving the Melt the freeze lifts and the
                held Claim is delivered, so the bench ends where it began.
                Holds are 4.5, 6, 4.5 and 7 s; moves 2.4 s.
             2. A station changes azimuth, elevation and framing. The
                machine is built from upright prisms; moving parts ride in
                groups with declared travel, and each pair's separating plane
                is found over the whole travel, so a test proves no cycle at
                every frame of the story. While it turns it is drawn on a
                canvas, and a device too slow to draw every frame skips
                frames rather than stopping, so the turn stays visible; the
                crossfade that preceded this was removed.
             3. The discs are flat (no gradient), nested in equal steps
                measured from Storm's mockup: each 22.7vw larger in radius
                and 15.8vw lower than the one inside it, so the gaps are
                even at the top and even at the bottom. Their colours are
                touch-500 blended into the page's ground at 15, 45 and 80
                percent, as the mockup measures; the touch scale's light
                steps were tried first and read as saturated lime (Storm,
                24 October 2026). They are never cut by a straight edge:
                they flow behind the sections, whose grounds cover them, and
                from above the field's middle break into 2.4vw square
                fragments that thin out and fade, gone well before the
                discs' bottom. Falling isometric cubes were tried and
                removed (Storm, 24 October 2026). Recorded as a named
                exception in foundations section 9.
             4. Callouts dock to the figure's left or right side: placed
                beside their parts they covered the machine they named and
                left the frame. On a phone the notes read below the drawing.
             5. Labels stay sentence case: the mockup's capitals were not
                confirmed, and foundations bans all-caps labels.
             6. The disc field rises about 13% faster than the page over
                the first 120vh of scroll, on a CSS scroll timeline so no
                script runs per scroll; still where scroll timelines are
                missing and under reduced motion (Storm, 24 October 2026).
             7. Every public page's section heading is one title that is
                its own answer, the question folded into a quieter second
                clause, two lines at most, the number heavy and in a rule's
                tone at the right end (patterns.md, composition rule 9). The
                alloy page in the app keeps its own heading, which this note
                does not cover.
             8. Stock photographs appear only in Photo frames, by Storm's
                decision of 24 October 2026, recorded in foundations section
                9; five, under the Unsplash License, shown through the house
                duotone and captioned as illustrative.
             9. The Opened Alloy uses Stoic Crew because it is the one Alloy
                with a founding record, and AMZNx as the featured leg because
                it is the first leg of that record. The featured baskets are
                the first four of the published order, all wholly admitted
                in the snapshot.
             10. The new sections are illustrations, not screens (Storm, 24
                October 2026: the layered fragment "is not an illustration
                and it is too filled with information"). The opened Alloy,
                the Strike steps and the close share one drawn vocabulary:
                a coin per constituent carrying its logo, a tile per share
                carrying the Alloy's artwork, dotted flows between them.
                Words are kept to symbols, exact units and one-word power
                chips whose sentences sit in their titles; every source is
                in one caption. Short power names are keyed by the policy's
                reason codes, and an unknown code shows as itself.
             11. The Opened Alloy turns (Storm, 24 October 2026): every 4.5 s
                the orbit turns one leg on to the leader in 0.9 s and the
                card opens that leg, with its own photograph; it holds while
                pointed at or focused, offscreen, in a hidden tab and under
                reduced motion. Five photographs serve six legs, so GOOGLx
                and MSFTx share the server cabinets. Photographs are shorter
                (2:1 and 16:9) and carry no credit on the page. The quieter
                clause of a heading is tertiary blended 75% into the ground,
                3.28:1 light and 4.39:1 dark, display-size text at the
                large-text floor; the section number is set in the sans.
             12. The public pages are 1320px wide (size.public), the app stays
                at 1200px; phones are unchanged. The closing band is gone:
                the footer's Hall bench closes every public page, and a band
                with the hero's actions beside it said the same thing twice.
                The footer keeps seven links, the team's address removed too, dropping what the House rail
                and the app already reach. The Q&A asks four questions as a
                tab list (Storm, 24 October 2026).
             13. Write-ups cut (Storm, 24 October 2026): the Opened Alloy shows
                no caption, its sources moved into the drawing's description;
                the steps' and baskets' notes are two lines each, so the
                "illustrative" labels and the eligibility clause left the
                page. The orbit holds only while the card or a coin is
                pointed at or focused, and a tap on a coin opens that leg.
             14. Storm, 24 October 2026: the closing band returns (it "wasn't
                bad"); the page ends on a Closing wordmark below the links,
                the hero's discs rising into the letters of "Seametry" and
                breaking into squares above it. A gradient was suggested and
                not used: the system bans them, and the discs carry the same
                pull without one. The tab Q&A went back to the accordion with
                short question labels; the team's address left the footer.
             15. Storm, 24 October 2026: the closing band is off the page and
                its contract marked reserved; the anchor chain's stamp is
                gone; photographs are muted and the basket covers 21:9; a
                basket card states its count on the code line and its marks
                sit on a full-width tray; the footer's links are small and
                quiet with no rule above, and the operator's note became one
                small tracked line on the wordmark's top edge; the wordmark's squares now
                scatter loose across the word instead of stacking in rows;
                the bench lost its description, gained a two-line status and
                answers each act (lift, seat, frost, punch, shake).
