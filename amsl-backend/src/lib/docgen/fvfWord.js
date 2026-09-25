/** Word documents built from a Fixed vs Flex comparison. */
import {
  makeDoc, toBuffer, title, subtitle, meta, h1, h2, p, bullets, numbered, table, kpis, callout, spacer, contactBlock, savingColor,
} from "./word.js";
import { brand, gbp, gbp0, kwh, kwh0, pct, signedPct, rate, longDate, today, GOOD } from "./common.js";

const idLine = (c) => [c.account_ref && `Account ${c.account_ref}`, c.mpan && `MPAN ${c.mpan}`, c.site].filter(Boolean).join("  |  ");

function profileTable(c) {
  const rows = [["Total annual consumption", c.annual_kwh], ["Day units", c.day_kwh], ["Night units", c.night_kwh],
    ["DUoS Red band", c.duos_red_kwh], ["DUoS Amber band", c.duos_amber_kwh], ["DUoS Green band", c.duos_green_kwh]]
    .filter(([, v]) => v != null).map(([l, v]) => [l, `${kwh(v)} kWh`]);
  if (c.capacity_kva) rows.push(["Supply capacity", `${c.capacity_kva} kVA`]);
  return table([{ label: "Metric", width: 60 }, { label: "Annual volume", width: 40, align: "right" }], rows);
}

/** Fixed vs Flex cost breakdown: the written, client-facing version of the comparison. */
export async function fvfBreakdown(r) {
  const c = r.comparison;
  const b = brand();
  const y1 = r.years.find((y) => y.comparable);
  const kids = [
    title("Fixed vs Flex Cost Breakdown"),
    subtitle(c.client_name),
    meta(`${idLine(c)}${idLine(c) ? "  |  " : ""}Prepared by ${c.prepared_by || b.company}, ${longDate(today())}`),
    kpis([
      r.term ? { label: `${r.term.years}-year saving with flex`, value: gbp0(r.term.saving_net), sub: `${pct(r.term.saving_pct)} net of VAT & CCL`, color: r.term.saving_net >= 0 ? GOOD : "B91C1C" }
        : { label: "Year 1 saving", value: y1 ? gbp0(y1.saving_ex_ccl_vat) : "—", sub: "net of VAT & CCL" },
      { label: "Year 1 difference", value: y1 ? pct(y1.saving_pct) : "—", sub: "flex vs 1-year fixed" },
      { label: "Annual consumption", value: `${kwh0(c.annual_kwh)} kWh`, sub: c.metering ? `${c.metering} metered` : "" },
    ]),
    spacer(160),
    h1("Current vs Renewal vs Flex — the headline"),
    p(`${c.current_contract_end ? `The current contract ends on ${longDate(c.current_contract_end)}. ` : ""}The options are to renew at the rates quoted${c.fixed_quote_ref ? ` in supplier quote ${c.fixed_quote_ref}` : ""}${r.years.filter((y) => y.has_fixed).length ? ` (${r.years.filter((y) => y.has_fixed).map((y) => y.year_no).join(", ")}-year terms)` : ""}, or to move onto the flexible consortium basket${c.flex_supplier ? ` with ${c.flex_supplier}` : ""}${c.flex_start ? ` from ${longDate(c.flex_start)}` : ""}. The comparison uses the same annual consumption profile and identical network and pass-through charges throughout, so the only thing that changes between rows is how the energy is bought.`),
    h2("Annual consumption profile"),
    profileTable(c),
  ];
  if (c.consumption_period) kids.push(p(`Source: ${c.consumption_period}.`, { size: 18, color: "64748B" }));

  const optTable = (basis) => {
    const net = basis === "net";
    return table(
      [{ label: "Option", width: 46 }, { label: "Annual cost", width: 18, align: "right" }, { label: "Monthly cost", width: 18, align: "right" }, { label: "vs Current", width: 18, align: "right" }],
      r.options.map((o) => {
        const v = net ? o.vs_current_net_pct : o.vs_current_inc_pct;
        return { cells: [o.label, gbp(net ? o.annual_net : o.annual_inc), gbp(net ? o.monthly_net : o.monthly_inc), o.kind === "current" ? "—" : signedPct(v)],
          bold: o.kind === "current", colors: [undefined, undefined, undefined, v == null ? undefined : v < 0 ? GOOD : "B91C1C"] };
      }),
    );
  };
  if (r.options.length) {
    kids.push(h1("Annual & monthly cost — net of VAT & CCL"));
    kids.push(p("CCL and VAT are charged at the same rate on the same consumption under every option, so they are excluded here to isolate the true commercial difference. The next table adds them back in."));
    kids.push(optTable("net"));
    kids.push(h1("Annual & monthly cost — inc VAT (as invoiced)"));
    kids.push(optTable("inc"));
  }

  kids.push(h1("Year by year: fixed renewal vs flex"));
  kids.push(p("Each row compares the annual cost on a fixed renewal of that term length against the flex forecast for the same year. The term total applies the longest fixed rate to every year of the term."));
  const yrRows = r.years.filter((y) => y.comparable).map((y) => ({ cells: [
    `Year ${y.year_no}: ${y.year_no}-year fixed vs flex ${y.year_label.replace(/^Year \d+\s*/, "")}`, gbp(y.fixed.subtotal_ex_ccl_vat), gbp(y.flex.subtotal_ex_ccl_vat), gbp(y.saving_ex_ccl_vat), pct(y.saving_pct),
  ], colors: [undefined, undefined, undefined, savingColor(y.saving_ex_ccl_vat), savingColor(y.saving_ex_ccl_vat)] }));
  if (r.term) yrRows.push({ cells: [r.term.label, gbp(r.term.fixed_net), gbp(r.term.flex_net), gbp(r.term.saving_net), pct(r.term.saving_pct)], bold: true, fill: "EEF2F7" });
  r.years.filter((y) => y.flex.priced && !y.has_fixed).forEach((y) => yrRows.push([`Year ${y.year_no}: flex only (no fixed equivalent quoted)`, "—", gbp(y.flex.subtotal_ex_ccl_vat), "—", "—"]));
  kids.push(table([{ label: "Term (net of VAT & CCL)", width: 40 }, { label: "Fixed", width: 16, align: "right" }, { label: "Flex", width: 16, align: "right" }, { label: "Saving", width: 16, align: "right" }, { label: "%", width: 12, align: "right" }], yrRows));

  if (r.unit_rates.length) {
    kids.push(h2("Unit rates — current vs renewal"));
    kids.push(table([{ label: "Option", width: 34 }, { label: "Standing (p/day)", width: 22, align: "right" }, { label: "Day (p/kWh)", width: 22, align: "right" }, { label: "Night (p/kWh)", width: 22, align: "right" }],
      r.unit_rates.map((u) => [u.label, rate(u.standing, 2), rate(u.day), rate(u.night)])));
    kids.push(p("Standing charge and all network pass-throughs are unchanged between the current contract and every renewal term; only the day and night unit rates move."));
  }
  if (r.flex_build.length) {
    kids.push(h2("Flex — rate build-up (p/kWh)"));
    const ys = r.flex_years;
    kids.push(table([{ label: "Component", width: 40 }, ...ys.map((y) => ({ label: `Year ${y}`, width: Math.floor(60 / ys.length), align: "right" }))],
      r.flex_build.map((f) => [f.label, ...f.by_year.map((v) => rate(v, 3))])));
    kids.push(p("Network charges (standing, transmission, distribution, capacity) and policy costs are charged on the same basis as the fixed quote."));
  }

  if (r.findings.length) { kids.push(h1("Key findings")); kids.push(...bullets(r.findings)); }
  const notes = [...(c.assumptions_list || []), c.market_note].filter(Boolean);
  if (notes.length) { kids.push(h1("Notes & assumptions")); kids.push(...bullets(notes)); }
  kids.push(spacer(200));
  kids.push(...contactBlock());
  return toBuffer(makeDoc({ title: "Fixed vs Flex Cost Breakdown", headerText: `${c.client_name} — Fixed vs Flex`, children: kids }));
}

/** "The agreement you're signing": a one-document summary of the flex contract terms. */
export async function contractSummary(r, basket) {
  const c = r.comparison;
  const b = brand();
  const fee = (label) => r.years.find((y) => y.flex.priced)?.flex.lines.find((l) => new RegExp(label, "i").test(l.label))?.rate;
  const consortiumFee = fee("consortium management|fct management");
  const supplierFee = fee("supplier management|platform|evolve");
  const kids = [
    title("Your Flexible Supply Agreement"),
    subtitle(c.client_name),
    meta(`${idLine(c)}${c.agreement_ref ? `  |  Agreement ${c.agreement_ref}` : ""}  |  Summary prepared ${longDate(today())}`),
    callout("This is a plain-English summary to help you review the agreement. It does not replace it: where anything here differs from the signed agreement and the supplier's standard terms, the agreement applies."),
    spacer(),
    h1("The key terms"),
    table([{ label: "Term", width: 34 }, { label: "Detail", width: 66 }], [
      ["Supplier", c.flex_supplier || basket?.supplier_name || "—"],
      ["Consortium manager", basket?.manager_name || b.company],
      ["Consortium", basket?.name || "—"],
      ["Supply start", c.flex_start ? longDate(c.flex_start) : "—"],
      ["Initial term", c.flex_term_months ? `${c.flex_term_months} months${c.flex_end ? `, to ${longDate(c.flex_end)}` : ""}` : (c.flex_end ? `To ${longDate(c.flex_end)}` : "—")],
      ["Extension", "Extends by further 12-month periods only if energy has already been bought for the seasons that follow the expiry date, so no purchase made on your behalf is left stranded."],
      ["How energy is bought", "The consortium manager buys in tranches against the consortium's pooled capacity, following the group strategy. You do not trade directly."],
      ["Metering", c.metering || "—"],
    ]),
    h1("What you pay"),
    p("Your monthly supply price is a stack of transparent components:"),
    ...numbered([
      "**Final Energy Price** — the volume-weighted average of all purchases made for that month, applied to your actual metered consumption.",
      "**Supplier charges** — transmission losses, imbalance and swing/shape premiums, and the supplier's management fee and account charges.",
      "**Pass-through costs at cost** — network (DUoS, TNUoS, BSUoS), policy costs (RO, CfD, Capacity Market, FiT, Nuclear RAB and others), metering and settlement.",
      "**Consortium management fee** — recovered through your supply invoices.",
      "**CCL and VAT** on top.",
    ]),
    table([{ label: "Fee", width: 50 }, { label: "Rate", width: 50, align: "right" }], [
      ["Consortium management fee", consortiumFee != null ? `${rate(consortiumFee, 3)}p/kWh (£${(consortiumFee * 10).toFixed(2)}/MWh)` : (basket?.management_fee != null ? `${basket.management_fee}p/kWh` : "—")],
      ["Supplier management fee", supplierFee != null ? `${rate(supplierFee, 3)}p/kWh (£${(supplierFee * 10).toFixed(2)}/MWh)` : "—"],
      ...(c.onboarding_fee ? [["One-off onboarding fee", `${gbp(c.onboarding_fee)}, payable on signing`]] : []),
    ]),
    h1("If your consumption changes"),
    p("Tell us as early as possible about any material change: new equipment, a site closing, solar or battery storage. A change is notified as a revised forecast (date, size and new load shape). Capacity can then be adjusted, and energy no longer needed is sold back at the market bid price on the day."),
    p("If actual annual consumption differs from the agreed forecast, the supplier may charge a fee reflecting the cost of buying or selling the difference at system prices. Unlimited revisions are allowed, and an early revision costs far less than a surprise at year end."),
    h1("Leaving early"),
    p("Energy bought in advance has been paid for at the prices achieved. If the agreement ends early, the cost of disposing of purchased but unbilled volume at the market price, which can be a gain or a loss, is settled on termination."),
    ...(c.early_termination_pct != null && c.current_contract_end ? [p(`Note also your **current** contract: leaving it before ${longDate(c.current_contract_end)} costs ${c.early_termination_pct}% of the remaining contract value.`)] : []),
    h1("Before you sign — checklist"),
    ...bullets([
      "Supply start date matches your current contract end date",
      "Every fee is stated in £/MWh or p/kWh and matches this summary",
      "Your consumption forecast reflects any planned changes on site",
      "Payment terms and direct debit arrangements are agreed",
      "Credit check completed and any security requirement understood",
      "Notice period and termination date diarised",
    ]),
    spacer(200), ...contactBlock(),
  ];
  return toBuffer(makeDoc({ title: "Your Flexible Supply Agreement", headerText: `${c.client_name} — agreement summary`, children: kids }));
}

/** Next-steps / onboarding letter to the client. */
export async function onboardingLetter(r, { contact_name } = {}) {
  const c = r.comparison;
  const b = brand();
  const first = r.years.find((y) => y.comparable);
  const kids = [
    p(longDate(today()), { color: "64748B" }), spacer(80),
    p(`**${c.client_name}**`), ...(c.site ? [p(c.site)] : []), spacer(160),
    p(`Dear ${contact_name || "Sir or Madam"},`),
    p(`**Moving to flexible purchasing${c.flex_start ? ` from ${longDate(c.flex_start)}` : ""}**`, { color: b.primary }),
    p(`Thank you for your time reviewing the options for ${c.account_ref ? `account ${c.account_ref}` : "your supply"}.${r.term
      ? ` On the same 12 months of consumption, the flexible consortium basket is forecast at ${gbp0(r.term.flex_net)} over ${r.term.years} years against ${gbp0(r.term.fixed_net)} on the ${r.term.years}-year fixed renewal: a saving of ${gbp0(r.term.saving_net)} (${pct(r.term.saving_pct)}) net of VAT and CCL.`
      : first ? ` In year one the flexible basket is forecast at ${gbp0(first.flex.subtotal_ex_ccl_vat)} against ${gbp0(first.fixed.subtotal_ex_ccl_vat)} on the one-year fixed renewal (${pct(first.saving_pct)} lower, net of VAT and CCL).` : ""}`),
    p("To get you onboard, the next steps are:"),
    ...numbered([
      "**Credit check and credit insurance assessment**, so the supplier can confirm terms.",
      "**Contract drawn up and signed**, setting out the term, fees and supply start date.",
      "**Half-hourly data reviewed and modelled** against the consortium's buying strategy, so your capacity share is right from day one.",
      "**Full bill analysis and onboarding strategy** agreed alongside the other consortium members.",
    ]),
    ...(c.onboarding_fee ? [p(`A one-off onboarding administration fee of ${gbp(c.onboarding_fee)} is payable on signing.`)] : []),
    ...(c.current_contract_end ? [p(`Your current contract runs to ${longDate(c.current_contract_end)}. Please don't give notice or sign anything with your current supplier until we have confirmed the start date with you.`)] : []),
    p("As standard you will receive monthly account reviews, market updates and bill validation. Meter upgrades and a 100% green tariff are available on request, and we will check your eligibility for government grant schemes as part of onboarding."),
    p("If you have any questions at all, please get in touch."),
    spacer(120), p("Yours sincerely,"), spacer(300),
    ...contactBlock(),
  ];
  return toBuffer(makeDoc({ title: "Next steps", headerText: `${c.client_name} — next steps`, children: kids }));
}
