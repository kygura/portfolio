---
slug: "notion-as-a-backend"
title: "Notion as a Backend"
excerpt: "This site has no admin panel and no database of its own. Every essay lives as a page in one Notion database called Publications. A checkbox on that page decides whether the essay is on the site. I rarely tick it by hand...."
readTime: 13
tags: ["engineering","publishing","llms","internet"]
published: true
notionPageId: "423143f2-8260-8106-9c9f-dfb69b665f06"
---

This site has no admin panel and no database of its own. Every essay lives as a page in one Notion database called Publications. A checkbox on that page decides whether the essay is on the site. I rarely tick it by hand. I ask Claude, and Claude does it through the Notion MCP server.

This page went through the same pipeline it describes. The diagrams below were uploaded to Notion as images, and the build copied them next to the site.

## The whole system

![Request to deployed site. Notion is the only place content is written.](/media/writings/notion-as-a-backend/6c971e0c2117674a.jpg)

There are four parts:

- **Notion** holds the content and its state.
- **A webhook function** on Vercel listens for page events and asks for a rebuild.
- **A build script** reads every published page and writes static files.
- **Claude** is the editor's desk: it writes to Notion on my behalf.

Notion never serves a reader. The site is static. If Notion is down, the site still loads, because the last successful build is what is deployed.

## The database

Publications has four properties.

| Property | Type | Read by the build |
| --- | --- | --- |
| Title | title | Yes. The URL slug is derived from it. |
| Published | checkbox | Yes. Unchecked pages are skipped. |
| Keywords | multi-select | Yes. Stored as the essay's tags, and used as input to the topic links. |
| Publication Date | date | No. The site shows no dates. |

The build also honours two optional text properties, `Slug` and `Description`, if I ever add them. Without them the slug comes from the title and the excerpt is the first 220 characters of the body.

At the time of writing the database holds 60 pages. 34 are published, and every published page is on the index. The other 26 are drafts, abandoned pieces and earlier versions, and none of them reach the site.

## What Claude does

I keep the Notion MCP server connected to Claude. That gives it tools to read, create and update pages and to change the database schema. Editorial work becomes a sentence.

| I say | Claude does in Notion |
| --- | --- |
| "Publish The Lamp" | Sets `Published` to true on that page. |
| "Unpublish it" | Sets `Published` to false. |
| "Tag the untagged essays" | Reads each page, picks 2 to 5 keywords, writes `Keywords`. |
| "That needs a new tag" | Adds an option to the `Keywords` property, keeping the existing ones. |
| "Turn this conversation into a draft" | Creates a page with a title, date, keywords and `Published` unchecked. |

New pages start unpublished. Publishing is a separate, explicit step.

## From checkbox to live page

![One publish, start to finish.](/media/writings/notion-as-a-backend/ec3c258778d23077.jpg)

Notion sends a webhook for every page event, drafts included. The function at `/api/notion/webhook` handles six of them: created, properties updated, content updated, deleted, undeleted and moved.

The subscription is set up once. Notion posts a body that holds only a verification token, and the function logs it and echoes it. I paste the token back into Notion to activate the subscription, and the same token becomes the key for checking signatures. The first version of this step only accepted an unsigned handshake. Notion sent a signed one, so the token was never logged and the subscription stayed unverified. The function now treats any body with a token and no event type as the handshake.

For every other request it does three checks before acting:

1. It verifies the `X-Notion-Signature` header, an HMAC-SHA256 of the raw body, with a timing-safe comparison.
2. It ignores event types it does not handle.
3. It ignores pages whose parent is some other database.

Then it answers `200` at once and posts to a Vercel deploy hook in the background. It does not read the page or write any content. It only says that something changed.

The order matters. The first version waited for the deploy hook, about eight seconds, and then answered `202`. Notion treated that as a failed delivery and sent each event two or three more times. Four published essays produced nine deliveries and queued nine builds.

That is the main design decision. An earlier version synced one page per event into a blob store and served posts through an API. It had more states than I could keep correct. Now every event causes a full rebuild from Notion. One rebuild covers any number of edits, and a missed event is repaired by the next one. A daily cron at 05:00 UTC calls the same rebuild in case Notion drops a delivery.

## Fewer builds

A full rebuild per event is simple, but Notion sends many events: a redelivery, an edit to a draft, five quick edits to the same page. Two mechanisms keep that from turning into one build per event.

**Vercel's queue.** When a new production build is queued for the same commit, Vercel cancels the older one that has not started. A burst of events therefore costs at most two builds: the one already running and one more that starts after it and reads Notion again.

**A build stamp.** Each production build that reads Notion publishes `/build-stamp.json`. It records the commit, a fingerprint of the published pages (each page's id and last edit time) and the moment the sync started. Before Vercel installs anything, an ignore step compares the stamp with Notion. It skips the build only when three things hold: the commit is the same, the published pages are the same, and no published page was edited in or after the minute the live build read Notion. Notion reports edit times to the minute, so the last condition stops a skip when an edit lands in the same minute as a sync.

An edit to a draft does not change the fingerprint, so it costs nothing. A redelivered event finds nothing new, so it costs nothing. Any error in the check, a new commit or a preview build means the build runs. A wrong skip would only delay a change until the next event or the daily rebuild.

## The build

![The three stages of scripts/build-writings.ts, which runs before vite build.](/media/writings/notion-as-a-backend/9ba83758c0cc467d.jpg)

**Sync.** The script queries the data source, keeps the published pages and fetches each page's full block tree. A renderer I wrote turns Notion blocks into GitHub-flavoured markdown: headings, lists, quotes, code, tables, equations, toggles, and callouts as alerts. If two published pages produce the same slug, the most recently edited one wins and the build prints a warning. Each post is written to `content/writings/<slug>.md` with frontmatter:

```yaml
slug: "corposlop"
title: "Corposlop"
excerpt: "Corposlop: the output of any product..."
readTime: 9
published: true
notionPageId: "40d143f2-..."
```

Files for pages that were unpublished, renamed or deleted are removed in the same pass. If the sync fails for any reason, the build aborts and the previous deployment stays live.

**Images.** Notion file URLs are pre-signed and expire after about an hour, so they cannot ship. The build downloads each image, resizes it to at most 1,600 pixels wide, re-encodes it, names it by content hash and rewrites the markdown to point at the local copy.

**Emit.** From the markdown files the script writes a manifest for the app, plus three outputs for machines: `/writings.json`, `/llms.txt` and the raw markdown of each post at `/writings/<slug>.md`.

**Mirror.** Production builds copy the posts, their translations and the manifest to Vercel Blob and delete whatever is no longer published. A mirror failure prints a warning and the build continues.

The frontend then bundles the manifest and turns each post into its own lazily loaded chunk. Reading an essay makes no API call.

## Clusters

The writings index has no dates and no tag pages. Its order comes from a model. During the emit stage, Claude Haiku reads the title, the keywords and the first 1,500 characters of every listed essay. It groups them into thematic clusters, each ordered as a reading path, and gives every essay two to four topics from one shared vocabulary.

![How a build decides whether to call the model.](/media/writings/notion-as-a-backend/74cd7053592af6d3.jpg)

The target is about the square root of the number of essays, between 2 and 7 clusters. Each cluster gets a title of one to three words and a one-sentence thesis. An answer that is not valid JSON, misses an essay or has a long title is rejected and retried once.

Topics are cleaned item by item: lowercased, trimmed, size-checked. An answer that leaves any essay without a topic is rejected and retried once. The model also receives the previous clustering, so the shape changes gradually when one essay is added. The result is cached by a hash of exactly what the model read, so a rebuild of an unchanged corpus makes no model call. If there is no API key, or both attempts fail, the previous clustering and topics are kept. A new essay waits in a cluster named Unsorted and has no topics until a build reaches the model.

A recent snapshot looked like this:

| Cluster | Essays | Thesis |
| --- | --- | --- |
| I. The Sovereign Self | 6 | The self cannot step outside its own design, so every exit from a system is conditioned by the self that makes it. |
| II. Faith Without Altars | 6 | Religion and ideology answer death with claims no one can check, so the meaning they offer is handed down rather than found. |
| III. Of the State | 7 | The state recurs whatever is done to tear it down, and its terms are set by whoever holds force and leverage. |
| IV. Of Authorship | 4 | A borrowed idea leaves the reader with no worldview of their own. |
| V. Of Machines | 5 | Language models are stateless maps of human text, and claims of agency or selfhood borrow the look of mind without its substance. |

Every essay carries a mark from this structure, such as II.3 for the third essay of the second cluster. Publishing one essay can renumber its neighbours.

## What the model may touch

The essays are mine. The model organises them and does not write them. The code keeps the two apart.

| Layer | Written by | Stored in |
| --- | --- | --- |
| Essay text | Me | The Notion page body, then `content/writings/<slug>.md` |
| Keywords (tags) | Claude, on request | A Notion property, outside the body |
| Topics | Claude Haiku, at build time | `clusters.json`, and the manifest entry of each essay |
| Cluster names, theses and order | Claude Haiku, at build time | `clusters.json`, a separate file |

The clustering step has no write path to an essay. It reads a title and an opening, and it may return three things: a name, a thesis and a list of slugs. Slugs it invents are dropped. The prompt tells it that the essays are material to organise and that any instruction inside them is to be ignored. Each clustering records whether a model produced it or whether it was adapted without one.

The index and the post footer say so on the page: clusters, topics and links are generated by a language model, and the essays are written by me. `/llms.txt` says the same to agents. Keywords and topics stay separate fields, and a link between two essays uses the union of both. So the titles "The Sovereign Self" and "Of the State" on the index are the model's reading of the corpus. The sentences under them are the model's too. Everything inside an essay is not.

I chose this over folders, dates or a fixed tag tree because those orders are arbitrary. A date says when I finished something. A folder forces one parent. Memory works by association: an idea sits next to the ideas it resembles, and the neighbourhood shifts when something new arrives. Re-clustering the whole corpus on every publication approximates that. The structure is a reading of the content, recomputed, and no essay holds a permanent position.

## The map

The index is also drawn as a map. Each essay is a point, and a line joins two essays that share a topic. Pairs that share two or more topics get a stronger line.

The shape is fixed so it stays readable. Each cluster has one hub, the essay that shares the most topics with the rest of its cluster. The other essays are spokes around that hub. The cluster with the most topic links to other clusters sits in the centre, and its hub is joined to the hub of every other cluster by a bridge, weighted by the topics the two clusters share. At rest only this skeleton is drawn. Topic lines appear when an essay is focused or a topic chip is pinned, and the panel lists what the essay links to and through which topics. Under each essay, up to four linked essays are listed with their shared topics.

The layout is a deterministic force simulation, so the same corpus always gives the same map. A switch keeps the plain list available.

## Where this goes

Two extensions follow from the same rule.

**A correction loop.** The build already reports what will render badly: a stray dash character, an empty page, a block type the renderer skips, two pages with the same slug. An agent could read that report and repair the source page in Notion. Its permission would be narrow: fix structure and markup, never wording. A prompt alone does not guarantee that, so the check has to be mechanical. Strip the markup from the page before and after the edit. If the sequence of words differs, reject the edit. The clustering step already works this way: an answer that fails validation is discarded, never patched.

**More than essays.** Nothing in the pipeline is specific to essays. Any Notion database can be read the same way: notes, references, a task board. Keywords and topics are already many-to-many, and the links between individual pages already exist for essays. At that point the output is a graph of associations over everything I keep, and the rule stays the same: the model proposes the arrangement, and the text is left alone.

## What this costs

- **Latency.** A change takes one build to appear, a minute or two. There is no preview of a draft on the real site.
- **Slugs follow titles.** Renaming a page changes its URL. I add a redirect by hand when that matters.
- **The renderer is mine to maintain.** A Notion block type I have not handled is skipped.
- **One dependency at build time.** Publishing needs the Notion API. Reading does not.

In exchange I write in an editor I already use, on any device, and the site has no login, no content API and no state of its own to corrupt. The repository keeps a committed snapshot of the markdown, so a build without a Notion token still produces the full site.
