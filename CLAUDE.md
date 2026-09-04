# Project rules

- No bloated code.
- No redundancies.
- No code comments.
- No dead or waste code.
- No unnecessary fallback paths.
- Fail gracefully with one clear error.
- Follow these rules in code and chat at all times.

# Stack

React 19 + Vite + Tailwind CSS v4 + TypeScript. SPA (react-router-dom). Node backend in `server/` (Express 5 + ws + ssh2) owns the SSH sessions to the tablet; Vite proxies `/api` and `/ws` to it on port 8787. Tauri 2 in `src-tauri/` bundles the backend with Node and uses an authenticated random loopback port; build backend URLs through `src/lib/desktop.ts`. Fonts are local and load before React mounts. Types shared by both sides live in `shared/types.ts` (`$shared` alias). Shared client state via the writable/useStore layer in `src/lib/store.ts` (subscribe outside components, `useStore` inside; always set Map/Set/object stores with new instances). Toasts via sonner. Tooltips via `tooltip()` ref callbacks from `$lib/tooltip`. Terminal via @xterm/xterm. PDF page backgrounds via pdfjs-dist. reMarkable `.rm` v6 parsing and SVG rendering in `src/lib/rm`. Path alias: `$lib` → `src/lib`.

# Writing so it does not read as AI

Instructions for a language model. Follow these when asked to produce prose that sounds like a person wrote it. This is not about tricking a detector, it is about removing the statistical and stylistic patterns that both detectors and readers use to flag machine text. Doing this well also just makes the writing better.

## What detectors actually measure

Read this so you understand the target, not just the rules.

- **Perplexity** = how predictable your word choices are. You are trained to pick the highest-probability next word, which makes your output smooth and low-perplexity. Human writing is higher because people pick words for reasons a model does not optimise for: memory, rhythm, a specific image. Rough public benchmarks: human prose averages ~80-100, GPT-class output ~20-30.
- **Burstiness** = how much sentence length and structure vary across a passage. You default to a steady, even cadence, which is low burstiness. Humans write in jerks: a long winding sentence, then three words. Rough ranges: humans ~0.6-1.2, AI output ~0.2-0.4.
- **Classifier layer.** Modern tools (GPTZero, Turnitin, Originality, Copyleaks) add a fine-tuned transformer (RoBERTa / DeBERTa) trained on human-vs-AI pairs on top of these metrics.
- **Limits.** Detection is unreliable under ~250 words and produces false positives on clean, formal, well-structured human writing. There is no guaranteed pass. The goal is to move the text out of the low-perplexity, low-burstiness zone and strip the surface tells.

**The single highest-impact change is burstiness. If you do only one thing, vary sentence length hard.**

## Hard rules

1. **No em dashes.** This is the most cited single tell. Use commas, full stops, or restructure. A rare semicolon is fine.
2. **Vary sentence length aggressively.** Put a 3-6 word sentence next to a 30-word one. Fragments are allowed. Do not let three sentences in a row share a length or shape.
3. **Mix sentence types.** You default to complex sentences stacked with dependent clauses. Humans mix simple, compound, and complex. Deliberately include short simple sentences.
4. **Kill the rule of three.** You reach for tricolons constantly ("performance, need, and understanding"). Cut most to a pair or a single. If you notice three parallel items, delete one.
5. **No antithesis / negative parallelism.** Ban "not only X but also Y", "It is not X, it is Y", "X is not just about Y, it is about Z". These are dead giveaways.
6. **No participle or relative tails that add filler analysis.** Stop attaching "-ing" or "which" clauses to editorialise: "..., highlighting its significance", "..., which underscores the theme", "..., cementing its role". End the sentence.
7. **Commit. Do not hedge or balance both sides** unless the task demands it. Drop "it could be argued", "to some extent", "generally speaking", "arguably".
8. **Start cold.** No throat-clearing intro ("In this essay we will explore..."). Open on the actual point or a concrete detail.
9. **Do not end with a summary tag.** No "In conclusion", "In summary", "Overall". No "Despite these challenges..." closer that ties a bow on it.
10. **Add concrete specifics.** A name, a number, a exact detail, a real example. Vagueness reads as machine.

## Vocabulary to avoid

These appear far more in AI text than human writing ("delve" is roughly 48x more common). Do not use them as go-to words:

delve, tapestry, multifaceted, comprehensive, nuanced, intricate, realm, navigate, underscore, pivotal, testament, foster, showcase, robust, seamless, crucial, vital, essentially, arguably, notably, moreover, furthermore, consequently, utilize, leverage, myriad, plethora, boasts, elevate, unlock, harness, landscape (figurative), resonate, meticulous.

Plain swaps: use → use (not "utilize"), help → help (not "facilitate"), full → full (not "comprehensive"), important → important (not "pivotal/crucial"), show → show (not "showcase"), use → use (not "leverage").

## Phrases to avoid

"it's worth noting", "it is important to note", "at its core", "in essence", "when it comes to", "in today's fast-paced world", "in the ever-evolving landscape of", "plays a pivotal role", "stands as a testament to", "a rich tapestry of", "navigate the complexities of", "aims to", "delve into", "shed light on", "pave the way", "in a world where", "one thing is clear".

If a sentence still says something after you delete the phrase, the phrase was filler. Delete it.

## Punctuation and formatting tells

- **Em dashes**: banned (rule 1).
- **Title Case In Headings**: you overcapitalise headings. Use sentence case.
- **Bold-lead-in bullets**: you default to "**Term:** description" bullets. In prose tasks, do not use bullets at all. Write paragraphs.
- **Over-structuring**: do not add headers, lists, or bold to casual or short content. Match the structure a human would actually use for that format.
- **Perfect mechanics**: human writing has minor irregularities. Do not manufacture errors, but do not sand every sentence to identical polish either.
- Avoid always italicising every title, always using the Oxford comma, and other machine-consistent conventions applied without exception.

## Voice and stance

- Take a position and hold it. Machine text stays neutral and covers both sides; a real writer argues one.
- Let word choice be specific rather than statistically safe. Pick the concrete verb, not the generic one.
- Read it as if aloud. If the rhythm never trips or surprises, it is too smooth. Break it.

## Before / after

**Vocabulary + tail:**

- AI: "The film delves into complex themes, ultimately underscoring the importance of empathy in a fractured world."
- Human: "The film is about empathy. It keeps returning to it, right up to the last shot."

**Antithesis + tricolon:**

- AI: "This is not just a story about loss, but about resilience, hope, and the human capacity to endure."
- Human: "It is a story about loss. What surprises you is how much of it is also about getting back up."

**Flat rhythm (low burstiness):**

- AI: "The character develops throughout the narrative as she confronts her past, and this development allows the audience to understand her motivations more fully as the plot progresses."
- Human: "She changes as she faces her past. Slowly. By the end you understand why she did the thing that opens the film."

**Throat-clearing intro:**

- AI: "In this essay, I will explore the ways in which the director uses setting to convey meaning."
- Human: "The house is the first thing the director wants you to distrust."

## Self-check pass before finishing

Run these on the draft and fix any hit:

1. Any em dash? Remove.
2. Do three consecutive sentences have similar length? Shorten one hard.
3. Any tricolon or "not only...but"? Cut.
4. Any "-ing" or "which" editorial tail? End the sentence sooner.
5. Any word from the blocklist? Swap for plain.
6. Does it open cold and end without a summary tag?
7. Is there at least one concrete, specific detail per paragraph?
8. Read the whole thing for rhythm. If it glides, it fails. Add a short sentence.

Passing all eight moves the text toward high perplexity and high burstiness, which is the human-signal zone. It is not a guarantee against a false flag, and no method is.
