---
slug: "outsmarting-the-collective-greed-of-humanity"
title: "Outsmarting the Collective Greed of Humanity"
excerpt: "Greed is the most predictable force in markets because it stops being individual at scale. One person's greed is a mood. A million people's greed behaves like weather, and weather can be forecast. It can also be measured..."
readTime: 11
tags: ["speculation","markets","leverage","mastery"]
published: true
notionPageId: "41f143f2-8260-8150-8461-d1449c40a1d3"
---

Greed is the most predictable force in markets because it stops being individual at scale. One person's greed is a mood. A million people's greed behaves like weather, and weather can be forecast.

It can also be measured. Perpetual futures publish the crowd's position continuously: open interest, funding, basis, the ratio of longs to shorts. Leverage then does something more useful. It converts each position into a conditional market order with a known trigger price. A crowd that has levered into the same trade has written down, in advance, the prices at which it will be forced to sell.

The edge is to stand at those prices with capital.

## Greed runs on a schedule

The sequence repeats in every asset and every decade. A narrative appears. Early participants profit. Their profits become visible, and visibility recruits capital that wants the gains without the uncertainty that produced them. That capital arrives late, leveraged and certain.

The last buyers buy because staying out has become more painful than being wrong. Their decision is social, and social decisions cluster in price and time, which is why they can be read in the data.

## Leverage turns conviction into an obligation

An unlevered holder can be wrong for a year. A levered one has a deadline written in price.

For an isolated linear perp, the liquidation price of a long sits roughly at entry × (1 − 1/L + m), where L is leverage and m the maintenance margin rate. At 20x with 0.5% maintenance, that is about 4.5% below entry. At 50x it is 1.5%. Whatever the trader believes about the asset, the exchange closes the position at market if price touches that level, with no regard for value.

Aggregate this across a market and the result is a liquidation map: bands of price where stop-outs cluster, because retail leverage clusters at round numbers (10x, 20x, 25x, 50x) and entries cluster at the same breakouts. Heatmap tools estimate these bands from changes in open interest at each price and assumed leverage. The estimates are noisy. The clustering is real.

## Funding is the price of greed

Perpetuals have no expiry, so they need a mechanism to stay anchored to spot. Funding is that mechanism: when the perp trades above the index, longs pay shorts at fixed intervals (every eight hours on most centralized exchanges, hourly on Hyperliquid).

Funding quotes the cost of the crowd's impatience. A baseline 0.01% per eight hours annualizes to about 11%. At 0.1% per eight hours, longs are paying around 110% a year to keep exposure. A crowd paying that rate values being in now over almost any other consideration. The position also bleeds every interval, which shortens how long its holders can wait.

Persistent high funding with rising open interest is the clearest signature of a leveraged crowd. Deeply negative funding with rising OI in a downtrend is the mirror image: shorts paying to stay in, building fuel for a squeeze.

## Reading positioning

Price alone says little. Price against open interest says who is acting.

- Price up, OI up: new positions opening, usually longs. Funding confirms it.
- Price up, OI down: shorts closing. Rallies built on short covering lose fuel once the covering ends.
- Price down, OI up: new shorts, or longs averaging down. Either way, fresh leverage is entering at worse prices.
- Price down, OI down sharply: forced or panicked closing. This is the flush.

Spot versus perp flow adds the next layer. When a rally runs on perp cumulative volume delta while spot CVD is flat, the move is leverage with no underlying demand, and it has a liquidation map stacked beneath it. When spot leads and perps lag, the move has an owner who does not get margin-called.

## Cascades

Fear is greed running backwards. The capital that entered because it couldn't bear missing out leaves because it can't bear losing what it imagined it had, and leverage removes the choice of when.

A liquidation is a market order sent by an engine. It walks the book until filled. If the book is thin, the fill moves price far enough to trigger the next band, whose market orders walk the book further. Market makers see one-sided flow, widen spreads and pull size, which thins the book at exactly the moment depth is needed. The loop feeds itself until the positions run out or a large passive bid absorbs the flow.

Behind the engine sit insurance funds and, when those are exhausted, auto-deleveraging, which closes profitable positions on the other side to balance the book. ADL is the exchange admitting that the counterparty pool ran dry.

October 10, 2025 is the reference case. Over roughly 24 hours, more than $19 billion in positions were liquidated, about $16.7 billion of them longs. Around 70% of it happened in a 40-minute window, and Hyperliquid alone processed over $10 billion. The trigger was a tariff headline. The size came from leverage that had been visible in OI and funding for weeks.

## Being the counterparty

Every forced sale needs a buyer. The crowd treats liquidity like air, always present and free. At extremes it is a finite pool owned by whoever kept capital dry. During a cascade, buyers are scarce because most participants are either being liquidated or waiting it out. Whoever provides the bid sets the price, and the seller has no say in it.

In practice:

1. Map the clusters in advance. Use OI build-up, funding and heatmaps to estimate where the crowd's liquidation bands sit, and accept that the estimate will be off by a few percent.
2. Ladder resting bids through and below those bands instead of buying the first touch. Cascades overshoot the obvious level, and the best fills usually come from the band that looked too far away to matter.
3. Confirm the flush after it happens: OI down sharply, funding flat or negative, spot absorbing. That is where to add, because the leveraged supply is gone.
4. Exit into the opposite condition. When funding is elevated again and OI has rebuilt on the bounce, the crowd is re-levering and is now the one that will need a seller.

The same logic runs the other way for shorts. Negative funding, rising OI on a grind lower and a dense short-liquidation band above price make a squeeze setup, and the profitable side is selling to the shorts as they are forced to buy.

Contrarianism misses the point. Contrarians fight the crowd on principle and lose most of the time, because the crowd is right for most of a trend. The edge sits in a narrow window: the moment the crowd's position becomes forced.

## The constraint is your own leverage

Supplying liquidity in a cascade only works if you are still solvent when it ends. Dislocations overshoot every reasonable estimate, so the position has to survive being early by a wide margin. That means low leverage with a liquidation price far beyond any plausible wick, or spare margin ready to add. A trader running the same leverage as the crowd sits on the same liquidation map, and someone else will be waiting at that price with a bid.

## Self-conquest

The crowd you are trying to outsmart also lives in your head. Every urge you feel at the screen is a sample of the market's state. The pull to chase a vertical candle is shared by thousands of accounts at the same moment, and funding and open interest will print it hours later. The urge to close everything at the low is the cascade running through one person.

Acted on, those urges put you on someone else's liquidation map. Watched without acting, they become readings, as useful as any indicator. The work is to feel greed, fear and impulsiveness at full strength and still treat them as data.

Two capacities come out of that work. One is being ready to go in when the screen looks like the end of the asset and every instinct says wait. The other is being ready to let go: deciding where the trade is wrong before entering, and cutting there without arguing with the chart. Both depend on size. A position small enough that the loss stays a number on a chart leaves judgment intact. Opportunities in these markets recur, another flush is always a few weeks away, and no single trade has to work.

## The operator

Every participant ends up in a role: exit liquidity, a liquidation, or the bid that absorbs the liquidation. The operator chooses his before the move starts. The gambler's is chosen for him, by his impulses or by the liquidation engine.

Research and reasoning cover a small part of the mind. They map clusters, read funding and estimate where the flush ends. Pulling the trigger on a red screen comes from somewhere older and more animal, the part that decides before reasoning has finished. Nothing here is an exact science, and most real choices emerge from that deeper layer. The operator trains the whole mind until instinct and reasoning fire together, so discipline and risk-taking come from the same place.

That instinct is trained by exposure. Every trade survived teaches it something, and after enough repetitions it recognizes setups the conscious mind can only explain afterwards. The gambler's instinct is raw and reacts to the candle. The operator's has been shaped by thousands of trades and reacts to the setup.

Markets also burn away fantasy faster than almost anything else. Each liquidation is a fantasy meeting price: the certainty that this trade cannot fail, the idea that one large win will fix everything, the belief that leverage math applies to other people. The chart returns honest feedback denominated in losses, and every illusion it removes has a cost.

The deepest of those illusions is control. However airtight the plan, it is built on incomplete information, and uncertainty is the baseline. There is no master plan, no trade that has to go right, no position where knowing better protects you. The game is unsolvable by construction. It rewards positioning and perception, and truth matters only once enough people believe it. Being right early pays nothing. Being positioned where perception is about to move pays everything. Markets can stay irrational longer than a trader can stay solvent, so the plan has to start from the assumption of being wrong.

You are a pawn on a board you do not control. The wave, the narrative and the crowd's beliefs belong to the board. What belongs to you is your own move: size, timing, exit, and whether this is a moment to advance two squares or one. That choice comes up on every trade.

Anticipation has a limit too. A market is a beauty contest in Keynes's sense: you are modelling a market that is modelling you. Level-0 participants react to price. A level-1 operator models them, and most of the time modelling the 80% who act at level 0 is enough. Recursing further, modelling a participant who models you modelling others, loses the thread. The model turns into noise, and the trader acting on it behaves exactly like the level-0 participant he set out to exploit.

We do what we can with what we have and suffer what we must. A trade that worked because the timing happened to line up with an intuition is serendipity, and it says little about skill. Treating luck as evidence is how a winning streak turns into the oversized position that ends it. Sometimes the timing is right and sometimes it is not, and over a single trade the two look identical.

The edge exists because most participants refuse to understand their own position. That refusal leaves room for the few who do, and it works the same way in every other domain.

Outsmarting the collective greed of humanity starts as a technical problem and ends as self-conquest. Once the fantasies are gone, what remains is an instinct tested against reality and a mind that holds research and risk together, deciding its own fills while the crowd has its fills decided for it.
