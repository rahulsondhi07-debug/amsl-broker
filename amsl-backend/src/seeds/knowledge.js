/**
 * Client knowledge base: plain-English articles a client can read in their hub, and that
 * agents can attach to a proposal. Drawn from the FCT client guide, the Fixed vs Flexible
 * one-pager, the Energy Buying Strategy Guide and the consortium customer agreement.
 *
 * Body format is a small markdown subset rendered by both the portal and the document
 * generator: "## " headings, "- " bullets, "1. " numbered steps, **bold**, "| a | b |"
 * tables (first row is the header) and "> " callouts. Anything that varies by account
 * (thresholds, fees, dates) is written as a principle, not a promise.
 *
 * Seeded by slug with INSERT OR IGNORE, so an article edited in the portal is never
 * overwritten on the next boot.
 */
export const CATEGORIES = [
  "Buying strategies", "Flexible buying", "Your comparison", "Your position report",
  "Your contract", "Your bill", "Getting started",
];

export const ARTICLES = [
  {
    slug: "fixed-or-flexible", category: "Buying strategies", sort: 1,
    title: "Fixed or flexible? Choosing how to buy your energy",
    summary: "The two basic ways to buy energy, and the questions that decide which suits your business.",
    body: `Buying energy efficiently, and in significant quantities, can be a challenging and risky operation. Fundamentally it comes down to two strategies: **Fixed Price** or **Flexible**.

Which is right for your organisation depends on your appetite for risk, the scale of your consumption, and how closely you want to track the market.

| | Fixed price | Flexible |
| How it works | One price, agreed on one day, for the whole term | Energy bought in parcels at chosen points on the market curve |
| What you get | Budget certainty | Transparent pricing and the chance to buy well |
| Main risk | Timing: fix on a bad day and you pay that price for the full term | The final price isn't known until every parcel is bought |

## There is no single right answer
The best strategy depends on your risk tolerance, your consumption profile and your appetite for active market engagement.

**Choose fixed if you:**
- value budget certainty above all else
- want to know your unit cost for the full contract term
- accept you may not benefit if prices fall

**Choose flexible if you:**
- are a larger consumer, or a smaller one joining through a consortium basket
- can tolerate some price variability in exchange for lower overall cost
- want transparent, data-driven market timing on your side

> For many larger consumers, a well-managed flexible strategy, properly explained and actively monitored, offers the greater long-term advantage. The aim is an informed decision, not a guess.`,
  },
  {
    slug: "fixed-price-strategy", category: "Buying strategies", sort: 2,
    title: "The fixed price strategy: certainty, with a trade-off",
    summary: "What a fixed contract really fixes, and where it can still leave you exposed.",
    body: `A fixed price strategy means committing to buy energy for a specific period, usually one to three years, at a price agreed at a single moment in time.

In some respects it is a lottery: there will be winners and losers. If the price agreed at the outset turns out to be favourable and stays that way relative to the market, you could be said to have won.

## The trade-off
- Over one to three years, prices fluctuate considerably across seasons and years, so opportunities for significant savings can be missed.
- The price reflects the market on the day you sign. Sign during a spike and the spike is built into every unit for the whole term.
- Not every fixed contract fixes everything. Many pass network and policy charges straight through, so the bill can still move even though the headline rate has not. Always check what is actually fixed.

## Best suited to
Businesses that value budget certainty above all else and want to know their unit cost for the full contract term.

> Below the consortium entry thresholds, a well-timed fixed contract bought using a milestone strategy (watching the market from 12 to 18 months out and fixing when it offers value) is usually the better route.`,
  },
  {
    slug: "flexible-strategy", category: "Flexible buying", sort: 1,
    title: "The flexible strategy explained",
    summary: "Buying in parcels at favourable points on the curve, with full price transparency.",
    body: `A flexible strategy involves purchasing energy at wholesale prices in parcels, at favourable moments on the fluctuating seasonal price curve. The curve is forecast using the same trading-desk software energy suppliers use themselves, weighing the many local and global factors that move prices.

## What makes it different
- **Transparent pricing.** You see what was bought, when, and at what price, rather than one blended rate with the margin hidden inside it.
- **Buy ahead.** Purchases can be made well before your supply start date when forward prices are favourable.
- **Smoother cost.** Your price is the weighted average of many purchases, so one bad day cannot set it for years.
- **Your costs itemised.** Commodity, network and policy costs are shown separately, so you can see exactly where the money goes.

## Best suited to
Consumers who can tolerate some price variability in exchange for the opportunity to buy well and reduce overall cost. Traditionally that meant larger consumers only, but joining a consortium changes that. See *The consortium advantage*.`,
  },
  {
    slug: "consortium-advantage", category: "Flexible buying", sort: 2,
    title: "The consortium advantage",
    summary: "How pooling many businesses gives smaller users access to flexible buying.",
    body: `On its own, flexible purchasing has traditionally only made sense for larger consumers. The volumes needed to access wholesale pricing, and trading-desk-grade market timing, put it out of reach for smaller businesses.

## How a consortium changes that
- It pools the consumption of many member businesses into a single collective buying basket.
- That combined volume gives the whole membership the wholesale access, transparent pricing and trading expertise that would otherwise be reserved for large single consumers.
- Businesses that wouldn't qualify for a flexible strategy on their own can join the basket and share in the benefits.

## What you give up
You follow the group's buying strategy rather than a fully bespoke one. Very large sites can trade on a bespoke basis instead, with triggers and limits built around their own budget.

> If flexible buying looked out of reach for your consumption level before, the consortium basket is worth a second look.`,
  },
  {
    slug: "why-timing-matters", category: "Buying strategies", sort: 3,
    title: "Why timing matters",
    summary: "Why a single signing date is the biggest risk in a fixed contract, and how buying across the curve reduces it.",
    body: `Under a fixed strategy, a business signing today locks in a single rate at this exact point on the curve, whatever that point turns out to be.

Under a flexible strategy, a consortium or buyer can purchase steadily across many months and seasons, smoothing out short-term spikes rather than being exposed to whichever day the contract happened to be signed.

## Near-term and far-dated prices differ
Further-dated periods on the forward curve are often cheaper than the near term, especially when a supply shock pushes up prices for the coming winter. A flexible strategy is designed to capture exactly that: buying later seasons early while they are good value, and avoiding buying the expensive near term all at once.

## Electricity follows gas
Gas-fired power stations still set the UK power price much of the time, so a spike in gas feeds straight into your electricity costs, even when a lot of renewable power is on the grid.

> Figures in any market illustration are real market data at a point in time, for illustration only. Every client's own position, consumption profile and contract timing is assessed individually.`,
  },
  {
    slug: "tranche-buying", category: "Flexible buying", sort: 3,
    title: "Tranche buying in plain English",
    summary: "Buying the energy you'll use in portions over time, in five steps.",
    body: `Tranche buying means buying the energy you'll use in portions, or "tranches", over time, rather than all at once. Think of it like buying foreign currency for a holiday in several lots, not all on one day.

1. **Forecast your usage.** Your annual demand is split into delivery periods, such as seasons or quarters.
2. **Buy in stages.** Portions are bought over the months before and during delivery, for example 10 to 20% at a time.
3. **Follow a strategy.** Each purchase is driven by market analysis, price triggers and risk limits, not guesswork.
4. **Lock in as you go.** Every tranche you buy is fixed. The share still open gets smaller as delivery gets closer.
5. **Settle the balance.** Anything left unhedged is bought near or at delivery, so your final price is the weighted average of everything bought.

> The result is an average price that reflects the whole buying window, not a single moment in it.

## Power and gas behave differently
Power can usually be layered in gradually. Gas can be lumpier, because fewer volumes are on offer at a time, so the desk sometimes has to hedge a larger share in one go.`,
  },
  {
    slug: "consortium-thresholds", category: "Flexible buying", sort: 4,
    title: "Consortium thresholds explained",
    summary: "The minimum usage to join, and the price levels that trigger a purchase once you're in.",
    body: `"Thresholds" can mean two things: the minimum usage you need to join a consortium, and the price levels that trigger a purchase once you're in.

## 1. Entry thresholds
Flexible consortium frameworks are built for Industrial & Commercial (I&C) users. As a guide:

| Fuel | Minimum annual consumption |
| Electricity | around 175,000 kWh |
| Gas | around 300,000 kWh |

Below these levels you're in SME territory. There, a well-timed fixed contract, bought using a milestone strategy, is usually the better route. A multi-site portfolio is assessed on its combined volume.

## 2. Trading thresholds
- **Buy triggers.** Target prices set in advance. When the market falls to a target, a tranche is bought.
- **Stop-loss limits.** Protective ceilings. If prices rise through a limit, more volume is locked in to cap your exposure.
- **Time-based minimums.** A set percentage must be hedged by a set date, so you're never left fully open close to delivery.

Because the consortium buys for many businesses at once, it trades in larger volumes, with professional market analysis behind each decision.`,
  },
  {
    slug: "staged-buying-example", category: "Flexible buying", sort: 5,
    title: "Why buying in stages smooths out volatility: a worked example",
    summary: "Twelve monthly purchases against fixing on the best or worst day.",
    body: `Buying in stages takes timing risk off the table. You won't catch the very bottom of the market, but you won't be caught by the top either.

## The example
Imagine buying twelve equal monthly tranches of gas over a year in which the market moved between 95p and 165p per therm. *Illustrative example only, not market data.*

| Approach | Price paid |
| Fix on the worst month, paid for the whole contract | 165p/therm |
| Tranche buying: the blended average of all 12 purchases | 136.5p/therm |
| Fix on the best month, only if you call the bottom perfectly | 95p/therm |

## What the gap is worth
For a site using 300,000 kWh of gas a year (about 10,236 therms), the 28.5p gap between the worst fix and the tranche average is worth about **£2,900 a year**.

In practice a consortium desk does better than equal monthly slices, buying more when prices fall to target levels and less when the market spikes. The principle is the same: spreading purchases means one bad day can't set your price for years.

> Try the tranche calculator in your hub to run the same comparison with your own volume.`,
  },
  {
    slug: "which-strategy-suits-you", category: "Buying strategies", sort: 4,
    title: "Which strategy suits your business?",
    summary: "Two questions: how much you use, and how much price movement your budget can take.",
    body: `Start with two questions: how much you use, and how much price movement your budget can take.

| Your situation | Suggested approach | Why |
| Under about 175,000 kWh electricity or 300,000 kWh gas a year | Fixed contract, bought with a milestone strategy | Too small for flexible frameworks; timing the fix well is where the value is |
| Above the thresholds; you want expert management without a trading team | Consortium flexible buying | Staged buying, pooled volume and a professional desk, with no in-house effort |
| Large, complex or multi-site portfolio with a specific risk appetite | Bespoke flexible basket | A strategy, triggers and limits built around your own budget and risk tolerance |
| Your board needs one fixed number now, whatever the market | Fixed, or flexible with a high early hedge | Budget certainty comes first; accept the timing risk, or reduce it by hedging a large share early |

> In a volatile market, with double-digit daily swings possible, putting 100% of a multi-year contract on a single day's price is the riskiest choice most businesses can make.

You don't have to choose one for good. Many businesses move from fixed to consortium buying once they understand the risk they carry by fixing on a single day.`,
  },
  {
    slug: "renewal-checklist", category: "Getting started", sort: 1,
    title: "Checklist before your next renewal",
    summary: "Eight things to do 12 to 18 months before your contract ends.",
    body: `Start 12 to 18 months before your contract ends. Flexible buying needs time to work, and the further out you start, the more chances you get to buy well.

- Find your contract end date and any notice period
- Pull 12 months of consumption data (half-hourly data for electricity if you have it)
- Check your annual usage against the consortium entry thresholds
- Agree your budget and how much price movement the business can absorb
- Decide who signs off, and how fast, so a good price isn't missed waiting for approval
- Ask every broker or consultant to state their fee in writing, in £/MWh or p/kWh
- Check the non-commodity costs too (network, policy and supplier charges), not just the unit rate
- Plan for changes to your site: new equipment, solar, battery storage or growth`,
  },
  {
    slug: "duos-red-amber-green", category: "Your bill", sort: 1,
    title: "DUoS bands: what Red, Amber and Green mean",
    summary: "Why when you use electricity changes what you pay for the network.",
    body: `Distribution Use of System (DUoS) charges pay for the local electricity network. On a half-hourly meter they are charged by time band, so when you use power matters as well as how much.

| Band | When (typical weekday windows) | Cost |
| Red | Peak network hours, usually 16:00 to 19:00 | Highest |
| Amber | Shoulder hours, around 07:30 to 16:00 and 19:00 to 21:00 | Middle |
| Green | Off-peak, including all weekend consumption | Lowest |

Exact windows and rates are set by your Distribution Network Operator and change each charging year.

## Why it matters in a flexible contract
On a fixed contract, network costs are usually blended into one all-in unit rate. On a flexible contract they are itemised by band, so a site that uses most of its power in Amber and Green pays for exactly that, and the saving from avoiding the Red band shows up directly on the bill.`,
  },
  {
    slug: "reading-your-comparison", category: "Your comparison", sort: 1,
    title: "How to read your Fixed vs Flex comparison",
    summary: "What the figures compare, and why VAT and CCL are left out of the headline.",
    body: `Your comparison prices the same 12 months of your own metered consumption two ways: on the fixed renewal quote, and on the flexible consortium basket. The only thing that changes between the columns is how the energy is bought.

## Why the headline is "net of VAT & CCL"
VAT and the Climate Change Levy are charged at the same rate on the same consumption under either option. Including them adds the same amount to both sides, which inflates the cash figure and understates the percentage difference. They are still shown in full, and an "inc VAT" table shows what you would actually be invoiced.

## How the years line up
- **Year by year:** each year of flex is compared with the rate you would pay on a fixed contract of that length.
- **Term total:** the n-year fixed rate for every year of the term, against the sum of the flex years.

## Effective p/kWh
Dividing each total by your annual consumption gives an effective pence-per-kWh figure, which lets two very differently structured bills be compared directly.

## What is and isn't guaranteed
Fixed figures come from a supplier quote. Flex figures are a forecast built from the consortium's position and confirmed fees. Your actual monthly flex energy price follows the volume-weighted price actually achieved.`,
  },
  {
    slug: "reading-a-position-report", category: "Your position report", sort: 1,
    title: "How to read a consortium position report",
    summary: "Hedged %, locked-in average, market and saving, and what each one tells you.",
    body: `A position report shows how much of the consortium's forward requirement is already bought, at what price, and how that compares with the market today.

| Term | Meaning |
| Volume required | The peak requirement for that season: MW for power, therms/day for gas |
| Traded | How much of that requirement has already been bought |
| Open | What is still to buy, and still exposed to the market |
| Hedged % | Traded ÷ (traded + open) |
| Market | Today's live broker curve price for that season |
| Locked-in average | The weighted average price achieved on traded volume, blended with today's market for any volume still open |
| Saving | Market minus locked-in average. Positive means the consortium is paying less than today's market |

## The overall figures
- **Overall hedged** is total traded ÷ total requirement across every season tracked.
- **Weighted locked-in price** is weighted by traded volume, so a season with a lot of volume counts for far more than a season with a little.

## Near seasons are nearly full, far seasons are not
That is by design. Near seasons are close to delivery and mostly bought; later seasons are bought gradually as good value appears, so their open share is naturally higher.`,
  },
  {
    slug: "negative-saving", category: "Your position report", sort: 2,
    title: "Why can a season show a negative saving?",
    summary: "What it means when the locked-in average sits above today's market.",
    body: `Occasionally a season shows the locked-in average sitting slightly above today's market price. That is not a sign of poor trades.

It usually means the market for that season has fallen since earlier tranches were bought. New purchases in the same season may well be below market; the average still carries the earlier, higher tranches.

> Hedging protects against the market moving the wrong way. It is not a guarantee that every historical trade beats every later price.

When near- and medium-term risk skews upward, buying some volume early is the correct trade-off, even if a particular season later drifts lower. What matters is the position across the whole curve, not one season on one day.`,
  },
  {
    slug: "how-flex-price-is-built", category: "Your contract", sort: 1,
    title: "How your flexible price is built",
    summary: "Energy price, supplier charges, pass-through costs and management fees.",
    body: `A flexible supply price is a stack of transparent components rather than one all-in rate.

## 1. Final Energy Price
Each month, the energy price is the volume-weighted average of all purchases made for that month (any sales count as negative purchases). Baseload and peak purchases are averaged separately, then combined. Quarter and season purchases are spread flat across their months. If the result is ever negative, it is treated as zero.

## 2. Supplier charges
- Transmission losses
- Imbalance premium: the cost of the difference between scheduled and metered delivery each half-hour
- Swing and shape premium: the cost of consumption that doesn't match the flat blocks the energy was bought in
- The supplier's management fee and account charges

## 3. Pass-through costs, charged at cost
Network charges (DUoS, TNUoS, BSUoS), policy costs (Renewables Obligation, Capacity Market, Contracts for Difference, Feed-in Tariff, Nuclear RAB and others), metering and settlement charges, then CCL and VAT.

## 4. Consortium management fee
The consortium manager's fee, stated per MWh and recovered through your supply invoices.

> Ask to see every fee written as £/MWh or p/kWh. Transparent pricing means you can check each layer on your bill.`,
  },
  {
    slug: "volume-changes", category: "Your contract", sort: 2,
    title: "What happens if your consumption changes?",
    summary: "Revised forecasts, capacity changes and volume variance fees.",
    body: `Your share of the consortium's buying is based on your historic consumption. If that is going to change materially (a new production line, a site closing, solar or battery going in), tell us as early as possible.

## Revised forecasts
A change is notified as a revised forecast: the date it takes effect, how big it is, and the new load shape. The supplier adjusts it for network losses and may raise or lower your capacity accordingly. Energy already bought that is no longer needed is sold back at the market bid price on the day.

## Volume variance
If your actual annual consumption differs from the agreed forecast, the supplier may charge a fee reflecting the cost of buying or selling the difference at system prices. There is no fee if the calculation comes out negative.

> Unlimited revisions are allowed. A forecast updated early costs far less than a surprise at year end.`,
  },
  {
    slug: "term-and-extension", category: "Your contract", sort: 3,
    title: "Contract term, extension and leaving early",
    summary: "How the initial term works, when it extends, and what an early exit costs.",
    body: `## Initial term
A consortium agreement runs from its commencement date to a first termination date, typically three years.

## Automatic extension
It extends by further 12-month periods only if energy has already been bought for the seasons immediately after the expiry date. That keeps your forward purchases and your contract aligned, so nothing bought on your behalf is left stranded.

## Common end dates
A consortium may ask members to align to a common end date, so the whole group's forward buying can continue as one book. An extension of this kind keeps the same framework rates and terms; it is not a renegotiation.

## Leaving early
Energy bought in advance has been paid for at the prices achieved. If the agreement ends early, the cost of disposing of purchased but unbilled volume at the market price (which can be a gain or a loss) is settled on termination.`,
  },
  {
    slug: "whats-included", category: "Getting started", sort: 2,
    title: "What's included with a flexible contract",
    summary: "Ongoing service, not just a price.",
    body: `- **Monthly account reviews** of your position and consumption
- **Market updates** so you always know where prices are and why
- **Bill validation** as standard, checking every layer of every invoice
- **Meter upgrades** on request, including half-hourly metering
- **100% green tariff** available, backed by REGO certificates
- **Government grant support**, with eligibility for schemes checked during onboarding
- **Consortium buying power**: buying alongside other members on the forward curve`,
  },
  {
    slug: "onboarding-steps", category: "Getting started", sort: 3,
    title: "Joining the consortium: onboarding steps",
    summary: "The four steps from decision to supply start.",
    body: `1. **Credit check and credit insurance assessment.** The supplier confirms it can offer terms and whether any security is needed.
2. **Contract drawn up and signed.** Your agreement sets out the term, fees and supply start date.
3. **Half-hourly data reviewed and modelled.** Your consumption is modelled against the consortium's buying strategy so your capacity share is right from day one.
4. **Bill analysis and onboarding strategy agreed.** A full review of your current bills, and the onboarding plan agreed alongside the other members.

> Start early. The further ahead of your supply start you join, the more of your volume can be bought at good points on the curve.`,
  },
  {
    slug: "consultancy-not-brokerage", category: "Getting started", sort: 4,
    title: "A consultancy, not a brokerage",
    summary: "How we work, and who we work for.",
    body: `- **We work for consumers, not suppliers.** Our role is to secure the best possible deal for you, whichever strategy suits your business.
- **The same tools as the suppliers.** Access to the latest market software and trading-desk-grade forecasting used by suppliers themselves.
- **Complete transparency** in everything we do, including our management charges.
- **Modest fees**, weighed against the potential savings we help clients achieve.
- **Small, low overhead.** That efficiency is passed on to our clients.

> Our role is to make sure you understand the trade-offs clearly and are supported by the same calibre of market intelligence the suppliers themselves use.`,
  },
];

export const GLOSSARY = [
  ["AAHEDC", "Assistance for Areas with High Electricity Distribution Costs. A levy that supports customers in the north of Scotland, charged on all consumption.", "Policy costs"],
  ["Agreed Supply Capacity (ASC)", "The maximum power, in kVA, your site is allowed to draw from the network. Capacity charges are based on it.", "Network"],
  ["Baseload", "A flat block of power delivered at the same rate in every half-hour of a period.", "Trading"],
  ["Bid / Offer price", "The price a buyer will pay (bid) and a seller will accept (offer) in the wholesale market. Unused volume is sold back at the bid; shortfalls are bought at the offer.", "Trading"],
  ["BSUoS", "Balancing Services Use of System. The cost the system operator incurs keeping supply and demand balanced second by second, passed through to consumers.", "Network"],
  ["Capacity charge", "A daily charge per kVA of your agreed supply capacity, paid whether or not you use it.", "Network"],
  ["Capacity Market", "A government scheme paying generators to be available at times of peak demand, funded through a charge on consumption.", "Policy costs"],
  ["CCL", "Climate Change Levy. An environmental tax on business energy use, charged per kWh at the same rate under any contract type.", "Tax"],
  ["CfD", "Contracts for Difference. The scheme that guarantees a price to low-carbon generators, funded by a levy on suppliers that is passed through to consumers.", "Policy costs"],
  ["Clip", "A single block of energy bought or sold in one trade, e.g. 0.20 MW of Winter 2028 power.", "Trading"],
  ["Commodity cost", "The wholesale cost of the energy itself, as distinct from network, policy and supplier charges.", "Pricing"],
  ["Consortium", "A group of businesses whose demand is pooled and bought together as one basket by a specialist trading desk.", "Flexible buying"],
  ["Consortium capacity", "The total volume the consortium buys against. Each member's capacity is a share of it.", "Flexible buying"],
  ["Consortium manager", "The company that runs the consortium's buying strategy and trades on members' behalf.", "Flexible buying"],
  ["Contract year", "Each consecutive 12-month period from the contract commencement date.", "Contract"],
  ["Default date", "The last date on which energy for a period can be traded. Anything still unbought is deemed bought at the market offer price on that date.", "Trading"],
  ["DNO", "Distribution Network Operator. The company that owns and runs the local electricity network in your area.", "Network"],
  ["DUoS", "Distribution Use of System charges. The cost of the local network, charged by Red, Amber and Green time bands on half-hourly meters.", "Network"],
  ["Effective p/kWh", "A bill's total cost divided by the kWh consumed. It lets two differently structured bills be compared directly.", "Pricing"],
  ["Feed-in Tariff (FiT)", "A legacy scheme paying small renewable generators, funded by a levy passed through on consumption.", "Policy costs"],
  ["Final Energy Price", "On a flexible contract, the monthly energy price: the volume-weighted average of all purchases (less sales) made for that month.", "Flexible buying"],
  ["Forward curve", "Today's prices for energy delivered in each future month, quarter, season and year.", "Trading"],
  ["Half-hourly (HH) metering", "A meter that records consumption every 30 minutes. Mandatory for larger sites and required to price flexible and banded charges accurately.", "Metering"],
  ["Hedged %", "The share of a period's requirement already bought: traded ÷ (traded + open).", "Flexible buying"],
  ["Imbalance", "The difference between the energy scheduled for a half-hour and the energy actually metered. It is settled at system (cash-out) prices.", "Trading"],
  ["kVA", "Kilovolt-amperes. The unit used for supply capacity.", "Metering"],
  ["Locked-in average", "The weighted average price achieved on volume already bought, blended with today's market price for any volume still open.", "Flexible buying"],
  ["Management fee", "A consultant's, broker's or supplier's charge for managing your supply, ideally stated openly as £/MWh or p/kWh.", "Pricing"],
  ["MPAN", "Meter Point Administration Number. The 21-digit electricity supply number. Its last 13 digits (the core) identify the supply point.", "Metering"],
  ["MPRN", "Meter Point Reference Number. The identifier for a gas supply point.", "Metering"],
  ["MHHS", "Market-wide Half-Hourly Settlement. The industry programme moving all electricity meters to half-hourly settlement.", "Metering"],
  ["NBP", "National Balancing Point. The virtual trading point for UK gas, and the reference point at which flexible purchases are priced.", "Trading"],
  ["Non-commodity costs", "Everything on an energy bill other than the wholesale energy: network, policy, metering and supplier charges.", "Pricing"],
  ["Nuclear RAB levy", "A levy funding new nuclear power stations under the Regulated Asset Base model, charged per kWh.", "Policy costs"],
  ["Open position", "Volume still to be bought and so still exposed to market movements.", "Flexible buying"],
  ["Peak", "Power delivered on weekdays between 07:00 and 19:00, traded as a separate product from baseload.", "Trading"],
  ["p/therm", "Pence per therm, the unit in which UK wholesale gas is traded. One therm is about 29.31 kWh.", "Units"],
  ["REGO", "Renewable Energy Guarantee of Origin. A certificate proving a MWh was generated from renewable sources, used to back green tariffs.", "Green energy"],
  ["Renewables Obligation (RO)", "A scheme requiring suppliers to source a share of electricity from renewables, funded through a charge on consumption.", "Policy costs"],
  ["Season", "Summer runs April to September; Winter runs October to March. Winter 2026 means October 2026 to March 2027.", "Trading"],
  ["Standing charge", "A fixed daily charge for your supply, regardless of how much you use.", "Pricing"],
  ["Stop-loss", "A price ceiling that, if breached, triggers buying more volume to cap exposure.", "Trading"],
  ["Swing and shape", "Swing is the cost of consuming more or less than the contracted capacity in a half-hour; shape is the cost of the gap between flat traded blocks and your real load profile.", "Flexible buying"],
  ["TNUoS", "Transmission Network Use of System charges. The cost of the national high-voltage network.", "Network"],
  ["Tranche", "One portion of your energy bought at one time as part of a staged strategy.", "Flexible buying"],
  ["Transmission losses", "Energy lost moving power across the national network, recovered as a charge.", "Network"],
  ["Volume tolerance", "How far your actual consumption may vary from the agreed forecast before a fee applies.", "Contract"],
  ["£/MWh", "Pounds per megawatt-hour, the unit in which power is traded. £10/MWh equals 1p/kWh.", "Units"],
];
