const MONEY_FORMATTER = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 2
});

const NUMBER_FORMATTER = new Intl.NumberFormat("es-DO", {
  maximumFractionDigits: 2
});

const ITBIS_RATE = 0.18;
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
  { name: "Financiera local", rate: 15.5 }
];

const HISTORY_KEY = "calculard_quote_history";
const DEALER_KEY = "calculard_dealer_profile";

function money(value) {
  return MONEY_FORMATTER.format(Number.isFinite(value) ? value : 0);
}

function percent(value) {
  return `${NUMBER_FORMATTER.format(value)}%`;
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

function monthlyPayment(principal, annualRate, years) {
  const months = years * 12;
  const monthlyRate = annualRate / 100 / 12;

  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;

  const growth = Math.pow(1 + monthlyRate, months);
  return principal * (monthlyRate * growth) / (growth - 1);
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

  target.innerHTML = rows
    .map(
      (row) => `
        <div class="result-row ${row.variant || ""}">
          <span>${row.label}</span>
          <strong>${row.value}</strong>
        </div>
      `
    )
    .join("");
}

function calculateLoan(form) {
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

function calculateItbis(form) {
  const { price, mode } = getFormValues(form);
  const base = mode === "extract" ? price / (1 + ITBIS_RATE) : price;
  const tax = mode === "extract" ? price - base : price * ITBIS_RATE;
  const total = mode === "extract" ? price : base + tax;

  renderResults("itbis", [
    { label: "Base imponible", value: money(base) },
    { label: `ITBIS (${percent(ITBIS_RATE * 100)})`, value: money(tax), variant: "warning" },
    { label: "Total", value: money(total), variant: "highlight" }
  ]);
}

function calculateSalary(form) {
  const { salary } = getFormValues(form);
  const afp = salary * AFP_RATE;
  const sfs = salary * SFS_RATE;
  const taxableMonthly = Math.max(salary - afp - sfs, 0);
  const annualIsr = calculateAnnualIsr(taxableMonthly * 12);
  const monthlyIsr = annualIsr / 12;
  const netSalary = Math.max(salary - afp - sfs - monthlyIsr, 0);

  renderResults("salary", [
    { label: "AFP", value: money(afp) },
    { label: "SFS", value: money(sfs) },
    { label: "ISR mensual estimado", value: money(monthlyIsr), variant: monthlyIsr > 0 ? "danger" : "" },
    { label: "Sueldo neto", value: money(netSalary), variant: "highlight" }
  ]);
}

function calculateVehicle(form) {
  const { price, downPayment, rate, years } = getFormValues(form);
  const financed = Math.max(price - downPayment, 0);
  const payment = monthlyPayment(financed, rate, years);
  const totalPaid = payment * years * 12;
  const interest = Math.max(totalPaid - financed, 0);

  renderResults("vehicle", [
    { label: "Monto a financiar", value: money(financed) },
    { label: "Cuota mensual estimada", value: money(payment), variant: "highlight" },
    { label: "Intereses del financiamiento", value: money(interest), variant: "warning" },
    { label: "Inicial + pagos", value: money(downPayment + totalPaid) }
  ]);
}

function getDealerProfile() {
  const saved = readStorage(DEALER_KEY, {});
  const form = document.querySelector("[data-dealer-form]");
  const values = form ? getFormValues(form) : {};

  return {
    dealerName: values.dealerName || saved.dealerName || "Tu Dealer RD",
    dealerPhone: values.dealerPhone || saved.dealerPhone || "809-000-0000",
    salesperson: values.salesperson || saved.salesperson || "Asesor comercial",
    salesRole: values.salesRole || saved.salesRole || "Ejecutivo de ventas",
    logo: saved.logo || ""
  };
}

function getSelectedBank(bankName) {
  return BANK_RATES.find((bank) => bank.name === bankName) || BANK_RATES[0];
}

function getCommercialQuote() {
  const form = document.querySelector("[data-commercial-form]");
  if (!form) return null;

  const values = getFormValues(form);
  const bank = getSelectedBank(values.bank);
  const price = values.price || 0;
  const downPayment = Math.min(values.downPayment || 0, price);
  const financed = Math.max(price - downPayment, 0);
  const years = values.years || 1;
  const payment = monthlyPayment(financed, bank.rate, years);
  const totalPaid = payment * years * 12;
  const interest = Math.max(totalPaid - financed, 0);

  return {
    clientName: values.clientName || "Cliente interesado",
    clientPhone: values.clientPhone || "",
    itemName: values.itemName || "Producto cotizado",
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
    `Monto a financiar: ${money(quote.financed)}`,
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
    ["Monto a financiar", money(quote.financed)],
    ["Entidad", quote.bank.name],
    ["Tasa referencial", percent(quote.bank.rate)],
    ["Plazo", `${quote.years * 12} meses`],
    ["Cuota mensual estimada", money(quote.payment)],
    ["Total estimado con inicial", money(quote.totalWithDownPayment)]
  ];
}

function renderCommercialResults(quote) {
  renderResults("commercial", [
    { label: "Inicial requerida", value: money(quote.downPayment) },
    { label: "Monto a financiar", value: money(quote.financed) },
    { label: "Tasa referencial", value: `${quote.bank.name} · ${percent(quote.bank.rate)}` },
    { label: "Cuota mensual", value: money(quote.payment), variant: "highlight" },
    { label: "Intereses estimados", value: money(quote.interest), variant: "warning" },
    { label: "Total con inicial", value: money(quote.totalWithDownPayment) }
  ]);
}

function renderBankTable(quote) {
  const target = document.querySelector("[data-bank-table]");
  if (!target) return;

  target.innerHTML = BANK_RATES.map((bank) => {
    const payment = monthlyPayment(quote.financed, bank.rate, quote.years);
    const totalPaid = payment * quote.years * 12;
    const interest = Math.max(totalPaid - quote.financed, 0);

    return `
      <tr>
        <td>${bank.name}</td>
        <td>${percent(bank.rate)}</td>
        <td>${money(payment)}</td>
        <td>${money(interest)}</td>
      </tr>
    `;
  }).join("");
}

function renderAmortizationTable(quote) {
  const target = document.querySelector("[data-amortization-table]");
  if (!target) return;

  target.innerHTML = buildAmortization(quote.financed, quote.bank.rate, quote.years)
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

  logoNodes.forEach((node) => {
    node.innerHTML = dealer.logo ? `<img src="${dealer.logo}" alt="">` : "RD";
  });
  if (dealerNode) dealerNode.textContent = dealer.dealerName;
  if (contactNode) contactNode.textContent = `${dealer.dealerPhone} · ${dealer.salesperson}`;
  if (titleNode) titleNode.textContent = quote.itemName;
  if (dateNode) dateNode.textContent = `Emitida el ${quote.createdAt.toLocaleDateString("es-DO")}`;
  if (advisorNode) advisorNode.textContent = `${dealer.salesperson} · ${dealer.salesRole}`;
  if (!linesNode) return;

  linesNode.innerHTML = quoteLineItems(quote)
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderCharts(quote) {
  const donut = document.querySelector("[data-donut-chart]");
  const donutLabel = document.querySelector("[data-donut-label]");
  const bars = document.querySelector("[data-bar-chart]");
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
  const logoNode = document.querySelector("[data-dealer-logo]");
  const nameNode = document.querySelector("[data-dealer-name]");
  const phoneNode = document.querySelector("[data-dealer-phone]");

  if (logoNode) logoNode.innerHTML = dealer.logo ? `<img src="${dealer.logo}" alt="">` : "RD";
  if (nameNode) nameNode.textContent = dealer.dealerName;
  if (phoneNode) phoneNode.textContent = dealer.dealerPhone;

  writeStorage(DEALER_KEY, dealer);
}

function renderHistory() {
  const target = document.querySelector("[data-history-list]");
  if (!target) return;

  const history = readStorage(HISTORY_KEY, []);
  if (!history.length) {
    target.innerHTML = `<p class="note">Aún no hay simulaciones guardadas.</p>`;
    return;
  }

  target.innerHTML = history
    .map(
      (item) => `
        <div class="history-item">
          <div>
            <strong>${item.itemName}</strong>
            <span>${item.clientName} · ${item.bankName}</span>
          </div>
          <strong>${money(item.payment)}</strong>
        </div>
      `
    )
    .join("");
}

function saveCurrentQuote() {
  const quote = getCommercialQuote();
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
}

function updateCommercialDashboard() {
  const quote = getCommercialQuote();
  if (!quote) return;

  renderDealerPreview();
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

  const savedDealer = readStorage(DEALER_KEY, {});
  Object.entries(savedDealer).forEach(([key, value]) => {
    const field = dealerForm.elements[key];
    if (field && field.type !== "file") field.value = value;
  });

  const bankSelect = commercialForm.elements.bank;
  if (bankSelect.options.length === 0) {
    bankSelect.innerHTML = BANK_RATES.map((bank) => `<option value="${bank.name}">${bank.name} · ${percent(bank.rate)}</option>`).join("");
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
  updateCommercialDashboard();
}

const calculators = {
  loan: calculateLoan,
  itbis: calculateItbis,
  salary: calculateSalary,
  vehicle: calculateVehicle
};

document.querySelectorAll("[data-calculator]").forEach((form) => {
  const calculator = form.dataset.calculator;
  const update = () => calculators[calculator](form);

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
});

initializeCommercialDashboard();

window.addEventListener("load", () => {
  document.body.classList.add("app-ready");
});
