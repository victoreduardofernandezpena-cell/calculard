const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const NUMBER_FORMATTER = new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const AFP_RATE = 0.0287;
const SFS_RATE = 0.0304;

const ISR_BRACKETS = [
  { upTo: 416220, fixed: 0, rate: 0, excessOver: 0 },
  { upTo: 624329, fixed: 0, rate: 0.15, excessOver: 416220.01 },
  { upTo: 867123, fixed: 31216, rate: 0.2, excessOver: 624329.01 },
  { upTo: Infinity, fixed: 79776, rate: 0.25, excessOver: 867123.01 }
];

const BANK_RATES = [
  { name: "Banreservas", rate: 11.9 },
  { name: "Banco Popular", rate: 12.25 },
  { name: "BHD", rate: 12.5 },
  { name: "Scotiabank", rate: 13.25 },
  { name: "Asociación Popular", rate: 13.75 },
  { name: "Entidad privada", rate: 15.5 }
];

const HISTORY_KEY = "calculard_quote_history";
const DEALER_KEY = "calculard_dealer_profile";
const THEME_KEY = "calculard_theme";
let showFullAmortization = false;
let bankRates = BANK_RATES.map((bank) => ({ ...bank }));
const resultSummaries = {};

function money(value) {
  return `RD$${MONEY_FORMATTER.format(Number.isFinite(value) ? value : 0)}`;
}

function percent(value) {
  return `${NUMBER_FORMATTER.format(value)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getFormValues(form) {
  return Object.fromEntries(
    new FormData(form).entries().map(([key, value]) => {
      if (value instanceof File) return [key, value];
      if (typeof value !== "string") return [key, value];
      if (value.trim() === "") return [key, ""];

      const numberValue = Number(value);
      return [key, Number.isNaN(numberValue) ? value : numberValue];
    })
  );
}

function hasValue(form, name) {
  const field = form?.elements?.[name];
  return !!field && String(field.value || "").trim() !== "";
}

function hasAnyValue(form, names) {
  return names.some((name) => hasValue(form, name));
}

function hasRequiredValues(form, names) {
  return names.every((name) => hasValue(form, name));
}

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Storage can be unavailable in private mode; the app still works without history.
  }
}

function sanitizeDealerProfile(profile = {}) {
  const cleaned = { ...profile };
  const legacyDefaults = {
    dealerName: "AutoPremium RD",
    dealerPhone: "809-000-0000",
    salesperson: "Asesor comercial",
    salesRole: "Ejecutivo de ventas"
  };

  Object.entries(legacyDefaults).forEach(([key, value]) => {
    if (cleaned[key] === value) cleaned[key] = "";
  });

  return cleaned;
}

function monthlyPayment(principal, annualRate, years) {
  const months = years * 12;
  const monthlyRate = annualRate / 100 / 12;

  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;

  const growth = Math.pow(1 + monthlyRate, months);
  return principal * (monthlyRate * growth) / (growth - 1);
}

function principalFromPayment(payment, annualRate, years) {
  const months = years * 12;
  const monthlyRate = annualRate / 100 / 12;

  if (payment <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return payment * months;

  const growth = Math.pow(1 + monthlyRate, months);
  return payment * ((growth - 1) / (monthlyRate * growth));
}

function calculateAnnualIsr(taxableAnnualSalary) {
  const bracket = ISR_BRACKETS.find((item) => taxableAnnualSalary <= item.upTo);
  if (!bracket || bracket.rate === 0) return 0;

  return bracket.fixed + (taxableAnnualSalary - bracket.excessOver) * bracket.rate;
}

function buildAmortization(principal, annualRate, years, monthsToShow = 12) {
  const payment = monthlyPayment(principal, annualRate, years);
  const monthlyRate = annualRate / 100 / 12;
  const rows = [];
  let balance = principal;

  for (let month = 1; month <= Math.min(years * 12, monthsToShow); month += 1) {
    const interest = monthlyRate === 0 ? 0 : balance * monthlyRate;
    const capital = Math.min(payment - interest, balance);
    balance = Math.max(balance - capital, 0);

    rows.push({ month, payment, interest, capital, balance });
  }

  return rows;
}

function renderResults(name, rows) {
  const target = document.querySelector(`[data-results="${name}"]`);
  if (!target) return;

  resultSummaries[name] = rows.map((row) => `${row.label}: ${row.value}`).join("\n");

  target.innerHTML = rows
    .map(
      (row) => `
        <div class="result-row ${row.variant || ""}">
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderEmptyResult(name, message = "Ingresa tus datos para calcular.") {
  const target = document.querySelector(`[data-results="${name}"]`);
  if (!target) return;

  resultSummaries[name] = "";
  target.innerHTML = `
    <div class="result-row empty-result">
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function calculateLoan(form) {
  if (!hasAnyValue(form, ["amount", "rate", "years"])) {
    renderEmptyResult("loan");
    return;
  }

  const { amount, rate, years } = getFormValues(form);
  const payment = monthlyPayment(amount, rate, years);
  const months = years * 12;
  const totalPaid = payment * months;
  const interest = Math.max(totalPaid - amount, 0);

  renderResults("loan", [
    { label: "Cuota mensual estimada", value: money(payment), variant: "highlight" },
    { label: "Total de intereses", value: money(interest), variant: "warning" },
    { label: "Total pagado", value: money(totalPaid) }
  ]);
}

function calculateSalary(form) {
  if (!hasAnyValue(form, ["salary", "otherIncome", "bonus", "dependents"])) {
    renderEmptyResult("salary");
    return;
  }

  const { salary, otherIncome, bonus, dependents } = getFormValues(form);
  const grossSalary = salary || 0;
  const extraIncome = (otherIncome || 0) + (bonus || 0);
  const grossMonthlyIncome = grossSalary + extraIncome;
  const afp = grossSalary * AFP_RATE;
  const sfs = grossSalary * SFS_RATE;
  const taxableMonthly = Math.max(grossMonthlyIncome - afp - sfs, 0);
  const annualIsr = calculateAnnualIsr(taxableMonthly * 12);
  const monthlyIsr = annualIsr / 12;
  const netSalary = Math.max(grossMonthlyIncome - afp - sfs - monthlyIsr, 0);

  renderResults("salary", [
    { label: "Salario bruto mensual", value: money(grossSalary) },
    { label: "Otros ingresos", value: money(extraIncome) },
    { label: "AFP", value: money(afp) },
    { label: "SFS", value: money(sfs) },
    { label: "ISR mensual estimado", value: money(monthlyIsr), variant: monthlyIsr > 0 ? "danger" : "" },
    { label: "Sueldo neto mensual", value: money(netSalary), variant: "highlight" },
    { label: "Sueldo neto anual estimado", value: money(netSalary * 12) },
    { label: "Dependientes informados", value: NUMBER_FORMATTER.format(dependents || 0) }
  ]);
}

function calculateVehicle(form) {
  if (!hasAnyValue(form, ["price", "downPayment", "rate", "years"])) {
    renderEmptyResult("vehicle");
    return;
  }

  const { price, downPayment, rate, years } = getFormValues(form);
  const financed = Math.max(price - downPayment, 0);
  const payment = monthlyPayment(financed, rate, years);
  const totalPaid = payment * years * 12;
  const interest = Math.max(totalPaid - financed, 0);

  renderResults("vehicle", [
    { label: "Monto financiado", value: money(financed) },
    { label: "Cuota mensual estimada", value: money(payment), variant: "highlight" },
    { label: "Intereses del financiamiento", value: money(interest), variant: "warning" },
    { label: "Inicial + pagos", value: money(downPayment + totalPaid) }
  ]);
}

function calculatePersonalCapacity(form) {
  if (!hasAnyValue(form, ["income", "expenses", "debts", "maxPercent", "rate", "years"])) {
    renderEmptyResult("personalCapacity");
    const noteNode = document.querySelector("[data-personal-capacity-note]");
    if (noteNode) noteNode.textContent = "";
    return;
  }

  const { income, expenses, debts, maxPercent, rate, years } = getFormValues(form);
  const monthlyIncome = income || 0;
  const monthlyExpenses = expenses || 0;
  const currentDebts = debts || 0;
  const recommendedShare = Math.max(maxPercent || 0, 0) / 100;
  const availableAfterExpenses = Math.max(monthlyIncome - monthlyExpenses - currentDebts, 0);
  const maxByIncome = monthlyIncome * recommendedShare;
  const recommendedPayment = Math.max(Math.min(maxByIncome, availableAfterExpenses), 0);
  const financeableAmount = principalFromPayment(recommendedPayment, rate || 0, years || 1);
  const debtRatio = monthlyIncome > 0 ? ((currentDebts + recommendedPayment) / monthlyIncome) * 100 : 0;
  const level = debtRatio <= 30 && availableAfterExpenses > recommendedPayment ? "Saludable" : debtRatio <= 40 ? "Ajustado" : "Riesgoso";
  const variant = level === "Saludable" ? "highlight" : level === "Ajustado" ? "warning" : "danger";
  const note = level === "Saludable"
    ? "Tu nivel de endeudamiento estimado se mantiene en un rango prudente."
    : level === "Ajustado"
      ? "La cuota podría funcionar, pero deja menos margen ante imprevistos."
      : "El escenario luce riesgoso. Considera reducir deudas, bajar el monto o ampliar la inicial.";

  renderResults("personalCapacity", [
    { label: "Cuota máxima recomendada", value: money(recommendedPayment), variant: "highlight" },
    { label: "Monto aproximado financiable", value: money(financeableAmount) },
    { label: "Nivel de riesgo", value: level, variant },
    { label: "Endeudamiento estimado", value: percent(debtRatio), variant }
  ]);

  const noteNode = document.querySelector("[data-personal-capacity-note]");
  if (noteNode) noteNode.textContent = note;
}

function calculateLateFee(form) {
  if (!hasAnyValue(form, ["payment", "daysLate", "monthlyLateRate", "fixedCharge"])) {
    renderEmptyResult("lateFee");
    return;
  }

  const { payment, daysLate, monthlyLateRate, fixedCharge } = getFormValues(form);
  const monthlyPaymentValue = payment || 0;
  const dailyRate = (monthlyLateRate || 0) / 100 / 30;
  const lateFee = monthlyPaymentValue * dailyRate * (daysLate || 0) + (fixedCharge || 0);
  const total = monthlyPaymentValue + lateFee;

  renderResults("lateFee", [
    { label: "Mora estimada", value: money(lateFee), variant: "warning" },
    { label: "Total a pagar", value: money(total), variant: "highlight" },
    { label: "Días de atraso", value: NUMBER_FORMATTER.format(daysLate || 0) },
    { label: "Cargo fijo incluido", value: money(fixedCharge || 0) }
  ]);
}

function calculateSavings(form) {
  if (!hasAnyValue(form, ["initial", "monthly", "rate", "years"])) {
    renderEmptyResult("savings");
    return;
  }

  const { initial, monthly, rate, years } = getFormValues(form);
  const months = (years || 0) * 12;
  const monthlyRate = (rate || 0) / 100 / 12;
  let balance = initial || 0;

  for (let month = 0; month < months; month += 1) {
    balance = balance * (1 + monthlyRate) + (monthly || 0);
  }

  const totalContributed = (initial || 0) + (monthly || 0) * months;
  const interest = Math.max(balance - totalContributed, 0);

  renderResults("savings", [
    { label: "Monto final estimado", value: money(balance), variant: "highlight" },
    { label: "Intereses generados", value: money(interest), variant: "warning" },
    { label: "Total aportado", value: money(totalContributed) }
  ]);
}

function getAffordabilityVerdict({ income, freeBeforeVehicle, freeAfterVehicle, reserveAfterSavings, vehicleShare, downPaymentPercent, years }) {
  if (income <= 0 || freeBeforeVehicle <= 0 || freeAfterVehicle < 0 || reserveAfterSavings < 0 || vehicleShare > 30) {
    return {
      level: "danger",
      title: "Riesgoso",
      note: "Con estos datos, el vehículo consume demasiado margen mensual. Conviene aumentar inicial, bajar precio o reducir otros compromisos antes de comprar."
    };
  }

  if (vehicleShare > 20 || downPaymentPercent < 20 || years > 5 || reserveAfterSavings < income * 0.1) {
    return {
      level: "warning",
      title: "Ajustado",
      note: "La compra puede funcionar, pero deja poco margen. Revisa seguro, combustible, inicial y plazo antes de comprometerte."
    };
  }

  return {
    level: "good",
    title: "Recomendable",
    note: "La compra luce manejable con estos datos, manteniendo margen mensual luego de gastos, vehículo y ahorro mínimo."
  };
}

function calculateAffordability(form) {
  if (!hasAnyValue(form, [
    "income",
    "expenses",
    "savingsGoal",
    "vehiclePrice",
    "downPayment",
    "rate",
    "years",
    "insurance",
    "fuel",
    "maintenance"
  ])) {
    const verdictNode = document.querySelector("[data-affordability-verdict]");
    const meter = document.querySelector("[data-affordability-meter]");
    const note = document.querySelector("[data-affordability-note]");

    if (verdictNode) {
      verdictNode.className = "affordability-verdict";
      verdictNode.querySelector("strong").textContent = "Ingresa tus datos";
    }
    if (meter) {
      meter.style.width = "0%";
      meter.className = "";
    }
    if (note) note.textContent = "";
    renderEmptyResult("affordability", "Completa los datos para evaluar la compra.");
    return;
  }

  const values = getFormValues(form);
  const income = values.income || 0;
  const expenses = values.expenses || 0;
  const savingsGoal = values.savingsGoal || 0;
  const vehiclePrice = values.vehiclePrice || 0;
  const downPayment = Math.min(values.downPayment || 0, vehiclePrice);
  const financed = Math.max(vehiclePrice - downPayment, 0);
  const years = values.years || 1;
  const rate = values.rate || 0;
  const loanPayment = monthlyPayment(financed, rate, years);
  const ownershipCosts = (values.insurance || 0) + (values.fuel || 0) + (values.maintenance || 0);
  const totalVehicleCost = loanPayment + ownershipCosts;
  const freeBeforeVehicle = income - expenses;
  const freeAfterVehicle = freeBeforeVehicle - totalVehicleCost;
  const reserveAfterSavings = freeAfterVehicle - savingsGoal;
  const vehicleShare = income > 0 ? (totalVehicleCost / income) * 100 : 0;
  const downPaymentPercent = vehiclePrice > 0 ? (downPayment / vehiclePrice) * 100 : 0;
  const verdict = getAffordabilityVerdict({
    income,
    freeBeforeVehicle,
    freeAfterVehicle,
    reserveAfterSavings,
    vehicleShare,
    downPaymentPercent,
    years
  });

  renderAffordabilityVerdict(verdict, vehicleShare);
  renderResults("affordability", [
    { label: "Libre antes del vehículo", value: money(freeBeforeVehicle), variant: freeBeforeVehicle > 0 ? "" : "danger" },
    { label: "Cuota estimada", value: money(loanPayment), variant: "highlight" },
    { label: "Seguro, combustible y mantenimiento", value: money(ownershipCosts), variant: "warning" },
    { label: "Costo mensual total", value: money(totalVehicleCost), variant: vehicleShare > 30 ? "danger" : "warning" },
    { label: "Libre después del vehículo", value: money(freeAfterVehicle), variant: freeAfterVehicle < 0 ? "danger" : "" },
    { label: "Después de ahorro mínimo", value: money(reserveAfterSavings), variant: reserveAfterSavings < 0 ? "danger" : "highlight" },
    { label: "Ingreso destinado al vehículo", value: percent(vehicleShare), variant: vehicleShare > 30 ? "danger" : vehicleShare > 20 ? "warning" : "" },
    { label: "Inicial sobre precio", value: percent(downPaymentPercent), variant: downPaymentPercent < 20 ? "warning" : "" }
  ]);
}

function renderAffordabilityVerdict(verdict, vehicleShare) {
  const verdictNode = document.querySelector("[data-affordability-verdict]");
  const meter = document.querySelector("[data-affordability-meter]");
  const note = document.querySelector("[data-affordability-note]");
  const cappedShare = Math.min(Math.max(vehicleShare, 0), 100);

  if (verdictNode) {
    verdictNode.className = `affordability-verdict ${verdict.level}`;
    verdictNode.querySelector("strong").textContent = verdict.title;
  }

  if (meter) {
    meter.style.width = `${cappedShare}%`;
    meter.className = verdict.level;
  }

  if (note) {
    note.textContent = verdict.note;
  }
}

function getDealerProfile() {
  const saved = sanitizeDealerProfile(readStorage(DEALER_KEY, {}));
  const form = document.querySelector("[data-dealer-form]");
  const values = form ? getFormValues(form) : {};

  return {
    dealerName: values.dealerName || saved.dealerName || "Tu negocio",
    dealerPhone: values.dealerPhone || saved.dealerPhone || "Teléfono o WhatsApp",
    salesperson: values.salesperson || saved.salesperson || "Asesor comercial",
    salesRole: values.salesRole || saved.salesRole || "Área comercial",
    logo: saved.logo || ""
  };
}

function getSelectedBank(values) {
  if (values.bank === "custom") {
    return {
      name: "Tasa personalizada",
      rate: Math.max(Number(values.customRate) || 0, 0),
      isCustom: true
    };
  }

  return bankRates.find((bank) => bank.name === values.bank) || bankRates[0];
}

function getCommercialQuote() {
  const form = document.querySelector("[data-commercial-form]");
  if (!form) return null;

  if (!hasRequiredValues(form, ["price", "years", "bank"])) return null;
  if (form.elements.bank.value === "custom" && !hasValue(form, "customRate")) return null;

  const values = getFormValues(form);
  const bank = getSelectedBank(values);
  const price = values.price || 0;
  const downPayment = Math.min(values.downPayment || 0, price);
  const financed = Math.max(price - downPayment, 0);
  const years = values.years || 1;
  const payment = monthlyPayment(financed, bank.rate, years);
  const totalPaid = payment * years * 12;
  const interest = Math.max(totalPaid - financed, 0);

  return {
    clientName: values.clientName || "Cliente",
    clientPhone: values.clientPhone || "",
    itemName: values.itemName || "Producto o vehículo",
    price,
    downPayment,
    financed,
    years,
    bank,
    payment,
    interest,
    totalPaid,
    totalWithDownPayment: downPayment + totalPaid,
    createdAt: new Date()
  };
}

function quoteSummary(quote, dealer = getDealerProfile()) {
  return [
    `Cotización ${dealer.dealerName}`,
    `Fecha: ${quote.createdAt.toLocaleDateString("es-DO")}`,
    `Cliente: ${quote.clientName}`,
    `Producto: ${quote.itemName}`,
    `Precio: ${money(quote.price)}`,
    `Inicial: ${money(quote.downPayment)}`,
    `Monto financiado: ${money(quote.financed)}`,
    `Entidad: ${quote.bank.name}`,
    `Tasa referencial: ${percent(quote.bank.rate)}`,
    `Plazo: ${quote.years * 12} meses`,
    `Cuota mensual estimada: ${money(quote.payment)}`,
    `Asesor: ${dealer.salesperson} - ${dealer.dealerPhone}`,
    "Cotización referencial sujeta a aprobación y condiciones finales."
  ].join("\n");
}

function quoteLineItems(quote) {
  return [
    ["Cliente", quote.clientName],
    ["Precio", money(quote.price)],
    ["Inicial", money(quote.downPayment)],
    ["Monto financiado", money(quote.financed)],
    ["Entidad", quote.bank.name],
    ["Tasa referencial", percent(quote.bank.rate)],
    ["Plazo", `${quote.years * 12} meses`],
    ["Cuota mensual estimada", money(quote.payment)],
    ["Total estimado con inicial", money(quote.totalWithDownPayment)]
  ];
}

function renderLogo(node, logo) {
  node.replaceChildren();

  if (!logo) {
    node.textContent = "RD";
    return;
  }

  const image = document.createElement("img");
  image.src = logo;
  image.alt = "";
  node.append(image);
}

function renderCommercialResults(quote) {
  renderResults("commercial", [
    { label: "Inicial requerida", value: money(quote.downPayment) },
    { label: "Monto financiado", value: money(quote.financed) },
    { label: "Tasa referencial", value: `${quote.bank.name} · ${percent(quote.bank.rate)}` },
    { label: "Cuota mensual", value: money(quote.payment), variant: "highlight" },
    { label: "Intereses estimados", value: money(quote.interest), variant: "warning" },
    { label: "Total con inicial", value: money(quote.totalWithDownPayment) }
  ]);
}

function renderBankTable(quote) {
  const target = document.querySelector("[data-bank-table]");
  if (!target) return;

  if (!quote) {
    target.innerHTML = "";
    return;
  }

  const rates = quote.bank.isCustom ? [quote.bank, ...bankRates] : bankRates;

  target.innerHTML = rates.map((bank) => {
    const payment = monthlyPayment(quote.financed, bank.rate, quote.years);
    const totalPaid = payment * quote.years * 12;
    const interest = Math.max(totalPaid - quote.financed, 0);
    const editable = bank.isCustom ? "" : `
          <input
            class="bank-rate-input"
            data-bank-rate="${escapeHtml(bank.name)}"
            type="number"
            min="0"
            step="0.01"
            value="${bank.rate}"
            aria-label="Tasa anual ${escapeHtml(bank.name)}"
          >
        `;

    return `
      <tr>
        <td>${escapeHtml(bank.name)}</td>
        <td>${editable || percent(bank.rate)}</td>
        <td>${money(payment)}</td>
        <td>${money(interest)}</td>
      </tr>
    `;
  }).join("");
}

function renderAmortizationTable(quote) {
  const target = document.querySelector("[data-amortization-table]");
  const toggle = document.querySelector("[data-toggle-amortization]");
  if (!target) return;

  if (!quote) {
    target.innerHTML = "";
    if (toggle) toggle.textContent = "Ver más meses";
    return;
  }

  const monthsToShow = showFullAmortization ? quote.years * 12 : 6;
  target.innerHTML = buildAmortization(quote.financed, quote.bank.rate, quote.years, monthsToShow)
    .map(
      (row) => `
        <tr>
          <td>${row.month}</td>
          <td>${money(row.payment)}</td>
          <td>${money(row.interest)}</td>
          <td>${money(row.capital)}</td>
          <td>${money(row.balance)}</td>
        </tr>
      `
    )
    .join("");

  if (toggle) {
    toggle.textContent = showFullAmortization ? "Ver menos meses" : "Ver más meses";
  }
}

function renderQuotePreview(quote) {
  const dealer = getDealerProfile();
  const logoNodes = document.querySelectorAll("[data-quote-logo]");
  const dealerNode = document.querySelector("[data-quote-dealer]");
  const contactNode = document.querySelector("[data-quote-contact]");
  const titleNode = document.querySelector("[data-quote-title]");
  const dateNode = document.querySelector("[data-quote-date]");
  const advisorNode = document.querySelector("[data-quote-advisor]");
  const linesNode = document.querySelector("[data-quote-lines]");

  logoNodes.forEach((node) => renderLogo(node, dealer.logo));
  if (dealerNode) dealerNode.textContent = dealer.dealerName;
  if (contactNode) contactNode.textContent = `${dealer.dealerPhone} · ${dealer.salesperson}`;
  if (!quote) {
    if (titleNode) titleNode.textContent = "Cotización pendiente";
    if (dateNode) dateNode.textContent = "Ingresa los datos para generar una cotización.";
    if (advisorNode) advisorNode.textContent = `${dealer.salesperson} · ${dealer.salesRole}`;
    if (linesNode) linesNode.innerHTML = "";
    return;
  }
  if (titleNode) titleNode.textContent = quote.itemName;
  if (dateNode) dateNode.textContent = `Emitida el ${quote.createdAt.toLocaleDateString("es-DO")}`;
  if (advisorNode) advisorNode.textContent = `${dealer.salesperson} · ${dealer.salesRole}`;
  if (!linesNode) return;

  linesNode.innerHTML = quoteLineItems(quote)
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderCharts(quote) {
  const donut = document.querySelector("[data-donut-chart]");
  const donutLabel = document.querySelector("[data-donut-label]");
  const bars = document.querySelector("[data-bar-chart]");
  if (!quote) {
    if (donut) donut.style.setProperty("--interest", "0%");
    if (donutLabel) donutLabel.textContent = "0%";
    if (bars) bars.innerHTML = "";
    return;
  }
  const total = quote.financed + quote.interest;
  const interestPercent = total > 0 ? Math.round((quote.interest / total) * 100) : 0;

  if (donut) {
    donut.style.setProperty("--interest", `${interestPercent}%`);
  }
  if (donutLabel) {
    donutLabel.textContent = `${interestPercent}%`;
  }
  if (!bars) return;

  const rows = buildAmortization(quote.financed, quote.bank.rate, quote.years, 6);
  const maxPayment = Math.max(...rows.map((row) => row.payment), 1);
  bars.innerHTML = rows
    .map((row) => {
      const interestWidth = Math.max((row.interest / maxPayment) * 100, 2);
      const capitalWidth = Math.max((row.capital / maxPayment) * 100, 2);
      return `
        <div class="bar-row">
          <span>Mes ${row.month}</span>
          <div class="bar-track">
            <i class="bar-capital" style="width:${capitalWidth}%"></i>
            <i class="bar-interest" style="width:${interestWidth}%"></i>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderDealerPreview() {
  const dealer = getDealerProfile();
  const form = document.querySelector("[data-dealer-form]");
  const logoNode = document.querySelector("[data-dealer-logo]");
  const nameNode = document.querySelector("[data-dealer-name]");
  const phoneNode = document.querySelector("[data-dealer-phone]");

  if (logoNode) renderLogo(logoNode, dealer.logo);
  if (nameNode) nameNode.textContent = dealer.dealerName;
  if (phoneNode) phoneNode.textContent = dealer.dealerPhone;

  if (form && hasAnyValue(form, ["dealerName", "dealerPhone", "salesperson", "salesRole"])) {
    writeStorage(DEALER_KEY, dealer);
  }
}

function renderHistory() {
  const target = document.querySelector("[data-history-list]");
  if (!target) return;

  const history = readStorage(HISTORY_KEY, []);
  if (!history.length) {
    target.innerHTML = `
      <div class="empty-state">
        <strong>No hay simulaciones guardadas todavía</strong>
        <span>Guarda una cotización para verla aquí durante la conversación con el cliente.</span>
      </div>
    `;
    return;
  }

  target.innerHTML = history
    .map(
      (item) => `
        <div class="history-item">
          <div>
            <strong>${escapeHtml(item.itemName)}</strong>
            <span>${escapeHtml(item.clientName)} · ${escapeHtml(item.bankName)}</span>
          </div>
          <strong>${money(item.payment)}</strong>
        </div>
      `
    )
    .join("");
}

function saveCurrentQuote() {
  const quote = getCommercialQuote();
  const status = document.querySelector("[data-copy-status]");
  if (!quote) return;

  const history = readStorage(HISTORY_KEY, []);
  const nextHistory = [
    {
      clientName: quote.clientName,
      itemName: quote.itemName,
      bankName: quote.bank.name,
      payment: quote.payment,
      savedAt: new Date().toISOString()
    },
    ...history
  ].slice(0, 6);

  writeStorage(HISTORY_KEY, nextHistory);
  renderHistory();
  if (status) status.textContent = "Simulación guardada en el historial de este navegador.";
}

function updateCommercialDashboard() {
  const quote = getCommercialQuote();

  toggleCustomRateField();
  renderDealerPreview();

  if (!quote) {
    renderEmptyResult("commercial", "Ingresa precio, plazo y entidad para calcular la cotización.");
    renderBankTable(null);
    renderAmortizationTable(null);
    renderQuotePreview(null);
    renderCharts(null);
    return;
  }

  renderCommercialResults(quote);
  renderBankTable(quote);
  renderAmortizationTable(quote);
  renderQuotePreview(quote);
  renderCharts(quote);
}

async function copyCurrentQuote() {
  const quote = getCommercialQuote();
  const status = document.querySelector("[data-copy-status]");
  if (!quote) return;

  try {
    await navigator.clipboard.writeText(quoteSummary(quote));
    if (status) status.textContent = "Resumen copiado. Puedes pegarlo en WhatsApp, correo o CRM.";
  } catch (error) {
    if (status) status.textContent = "No se pudo copiar automáticamente. Selecciona el texto desde la cotización.";
  }
}

function sendCurrentQuoteToWhatsapp() {
  const quote = getCommercialQuote();
  if (!quote) return;

  const phone = String(quote.clientPhone || "").replace(/\D/g, "");
  const target = phone ? `https://wa.me/${phone}` : "https://wa.me/";
  const message = encodeURIComponent(quoteSummary(quote));
  window.open(`${target}?text=${message}`, "_blank", "noopener,noreferrer");
}

function saveCurrentQuoteAsImage() {
  const quote = getCommercialQuote();
  if (!quote) return;

  const dealer = getDealerProfile();
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = 900 * scale;
  canvas.height = 1120 * scale;

  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, 900, 1120);
  context.fillStyle = "#101820";
  context.font = "700 34px Arial";
  context.fillText(dealer.dealerName, 60, 84);
  context.font = "18px Arial";
  context.fillStyle = "#52606d";
  context.fillText(`${dealer.dealerPhone} · ${dealer.salesperson}`, 60, 116);

  context.fillStyle = "#2bd4a0";
  context.fillRect(60, 150, 780, 5);

  context.fillStyle = "#101820";
  context.font = "800 42px Arial";
  context.fillText("Cotización de financiamiento", 60, 230);
  context.font = "20px Arial";
  context.fillStyle = "#52606d";
  context.fillText(`Emitida el ${quote.createdAt.toLocaleDateString("es-DO")}`, 60, 264);

  const lines = [["Producto", quote.itemName], ...quoteLineItems(quote)];

  let y = 334;
  lines.forEach(([label, value]) => {
    context.fillStyle = "#52606d";
    context.font = "20px Arial";
    context.fillText(label, 60, y);
    context.fillStyle = "#101820";
    context.font = label === "Cuota mensual estimada" ? "800 30px Arial" : "700 24px Arial";
    context.fillText(value, 330, y);
    y += label === "Cuota mensual" ? 62 : 54;
  });

  context.fillStyle = "#edf2f7";
  context.fillRect(60, 920, 780, 92);
  context.fillStyle = "#101820";
  context.font = "700 22px Arial";
  context.fillText(`${dealer.salesperson} · ${dealer.salesRole}`, 88, 958);
  context.font = "17px Arial";
  context.fillStyle = "#52606d";
  context.fillText("Simulación referencial sujeta a aprobación y condiciones finales.", 88, 988);

  const link = document.createElement("a");
  link.download = `cotizacion-${quote.itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function initializeCommercialDashboard() {
  const commercialForm = document.querySelector("[data-commercial-form]");
  const dealerForm = document.querySelector("[data-dealer-form]");
  if (!commercialForm || !dealerForm) return;

  const savedDealer = sanitizeDealerProfile(readStorage(DEALER_KEY, {}));
  Object.entries(savedDealer).forEach(([key, value]) => {
    const field = dealerForm.elements[key];
    if (field && field.type !== "file") field.value = value;
  });

  const bankSelect = commercialForm.elements.bank;
  if (bankSelect.options.length === 0) {
    bankSelect.innerHTML = [
      ...bankRates.map((bank) => `<option value="${bank.name}">${bank.name} · ${percent(bank.rate)}</option>`),
      '<option value="custom">Tasa personalizada</option>'
    ].join("");
  }

  commercialForm.addEventListener("input", updateCommercialDashboard);
  commercialForm.addEventListener("change", updateCommercialDashboard);
  dealerForm.addEventListener("input", updateCommercialDashboard);
  dealerForm.addEventListener("change", updateCommercialDashboard);

  dealerForm.elements.dealerLogo.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const profile = getDealerProfile();
      profile.logo = reader.result;
      writeStorage(DEALER_KEY, profile);
      updateCommercialDashboard();
    });
    reader.readAsDataURL(file);
  });

  document.querySelector("[data-save-quote]")?.addEventListener("click", saveCurrentQuote);
  document.querySelector("[data-copy-quote]")?.addEventListener("click", copyCurrentQuote);
  document.querySelector("[data-whatsapp-quote]")?.addEventListener("click", sendCurrentQuoteToWhatsapp);
  document.querySelector("[data-save-image]")?.addEventListener("click", saveCurrentQuoteAsImage);
  document.querySelector("[data-print-quote]")?.addEventListener("click", () => window.print());
  document.querySelector("[data-bank-table]")?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-bank-rate]");
    if (!input) return;

    bankRates = bankRates.map((bank) => (
      bank.name === input.dataset.bankRate
        ? { ...bank, rate: Math.max(Number(input.value) || 0, 0) }
        : bank
    ));
    updateCommercialDashboard();
  });
  document.querySelector("[data-toggle-amortization]")?.addEventListener("click", () => {
    showFullAmortization = !showFullAmortization;
    updateCommercialDashboard();
  });
  document.querySelectorAll("[data-tab-button]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tabButton;

      document.querySelectorAll("[data-tab-button]").forEach((item) => {
        const isActive = item.dataset.tabButton === tab;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });

      document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.tabPanel === tab);
      });
    });
  });
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const [downPaymentPercent, years] = button.dataset.preset.split(":").map(Number);
      const price = Number(commercialForm.elements.price.value) || 0;
      commercialForm.elements.downPayment.value = Math.round(price * (downPaymentPercent / 100));
      commercialForm.elements.years.value = years;
      updateCommercialDashboard();
    });
  });

  renderHistory();
  toggleCustomRateField();
  updateCommercialDashboard();
}

function toggleCustomRateField() {
  const commercialForm = document.querySelector("[data-commercial-form]");
  const field = document.querySelector("[data-custom-rate-field]");
  if (!commercialForm || !field) return;

  const isCustomRate = commercialForm.elements.bank.value === "custom";
  field.hidden = !isCustomRate;
}

function fillAffordabilityFromCurrentQuote(form) {
  const quote = getCommercialQuote();
  if (!quote) return;

  form.elements.vehiclePrice.value = Math.round(quote.price);
  form.elements.downPayment.value = Math.round(quote.downPayment);
  form.elements.rate.value = quote.bank.rate;
  form.elements.years.value = quote.years;
  calculateAffordability(form);
}

function initializeAffordabilityCalculator() {
  const form = document.querySelector("[data-affordability-form]");
  if (!form) return;

  const update = () => calculateAffordability(form);
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  document.querySelector("[data-use-current-quote]")?.addEventListener("click", () => {
    fillAffordabilityFromCurrentQuote(form);
  });
  update();
}

const calculators = {
  loan: calculateLoan,
  salary: calculateSalary,
  vehicle: calculateVehicle,
  personalCapacity: calculatePersonalCapacity,
  lateFee: calculateLateFee,
  savings: calculateSavings
};

document.querySelectorAll("[data-calculator]").forEach((form) => {
  const calculator = form.dataset.calculator;
  const update = () => calculators[calculator](form);

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
});

async function copySimpleResult(name) {
  const text = resultSummaries[name];
  if (!text) return;

  try {
    await navigator.clipboard.writeText(`CalculaRD\n${text}`);
  } catch (error) {
    // Clipboard may be unavailable outside secure contexts.
  }
}

function shareSimpleResult(name) {
  const text = resultSummaries[name];
  if (!text) return;

  window.open(`https://wa.me/?text=${encodeURIComponent(`CalculaRD\n${text}`)}`, "_blank", "noopener,noreferrer");
}

function initializeShareActions() {
  document.querySelectorAll("[data-copy-result]").forEach((button) => {
    button.addEventListener("click", () => copySimpleResult(button.dataset.copyResult));
  });

  document.querySelectorAll("[data-whatsapp-result]").forEach((button) => {
    button.addEventListener("click", () => shareSimpleResult(button.dataset.whatsappResult));
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    // Theme persistence is optional.
  }
  document.querySelector("[data-theme-toggle]")?.replaceChildren(theme === "light" ? "Modo oscuro" : "Modo claro");
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(savedTheme);
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  });
}

function initializeMotion() {
  const animatedSelectors = [
    ".section-heading",
    ".settings-panel",
    ".quote-builder",
    ".data-panel",
    ".calculator-card",
    ".faq-grid details"
  ];
  const items = [...document.querySelectorAll(animatedSelectors.join(","))];

  items.forEach((item, index) => {
    item.classList.add("reveal-item");
    item.style.setProperty("--reveal-delay", `${Math.min(index % 6, 5) * 70}ms`);
  });

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  items.forEach((item) => observer.observe(item));
}

initializeCommercialDashboard();
initializeAffordabilityCalculator();
initializeShareActions();
initializeTheme();
initializeMotion();

document.querySelectorAll("[data-current-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});

window.addEventListener("load", () => {
  document.body.classList.add("app-ready");
});
