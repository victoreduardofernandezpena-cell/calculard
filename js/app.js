import { readStorage, writeStorage } from "./storage.js";
import { initializeTheme } from "./theme.js";
import { validateForm } from "./validators.js";

const HISTORY_KEY = "calculard_history";
const FAVORITES_KEY = "calculard_favorites";
const ITBIS_RATE = 0.18;
const AFP_RATE = 0.0287;
const SFS_RATE = 0.0304;
const ISR_BRACKETS = [
  { upTo: 416220, fixed: 0, rate: 0, excessOver: 0 },
  { upTo: 624329, fixed: 0, rate: 0.15, excessOver: 416220.01 },
  { upTo: 867123, fixed: 31216, rate: 0.2, excessOver: 624329.01 },
  { upTo: Infinity, fixed: 79776, rate: 0.25, excessOver: 867123.01 }
];

const currency = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const numberFormat = new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const state = {
  lastLoan: null,
  showFullAmortization: false,
  favorites: readStorage(FAVORITES_KEY, [])
};

const calculatorLabels = {
  loan: "Prestamo",
  compare: "Comparador",
  salary: "Sueldo neto",
  itbis: "ITBIS",
  withholding: "Retenciones",
  hourly: "Pago por hora",
  vacation: "Vacaciones",
  savings: "Ahorro"
};

const repeatTargets = {
  loan: "[data-form='loan']",
  compare: "[data-form='compare']",
  salary: "[data-form='salary']",
  itbis: "[data-form='itbis']",
  withholding: "[data-form='withholding']",
  hourly: "[data-form='hourly']",
  vacation: "[data-form='vacation']",
  savings: "[data-form='savings']"
};

function money(value) {
  return `RD$${currency.format(Number.isFinite(value) ? value : 0)}`;
}

function percent(value) {
  return `${numberFormat.format(Number.isFinite(value) ? value : 0)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function monthlyPayment(principal, annualRate, months) {
  const monthlyRate = annualRate / 100 / 12;
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;

  const growth = Math.pow(1 + monthlyRate, months);
  return principal * (monthlyRate * growth) / (growth - 1);
}

function loanSummary({ amount, downPayment = 0, rate, months }) {
  const financed = Math.max(amount - downPayment, 0);
  const payment = monthlyPayment(financed, rate, months);
  const totalPaid = payment * months;
  const interest = Math.max(totalPaid - financed, 0);
  const interestShare = totalPaid > 0 ? (interest / totalPaid) * 100 : 0;

  return { amount, downPayment, rate, months, financed, payment, totalPaid, interest, interestShare };
}

function amortizationRows(summary) {
  const monthlyRate = summary.rate / 100 / 12;
  const rows = [];
  let balance = summary.financed;

  for (let month = 1; month <= summary.months; month += 1) {
    const interest = monthlyRate === 0 ? 0 : balance * monthlyRate;
    const capital = Math.min(summary.payment - interest, balance);
    balance = Math.max(balance - capital, 0);
    rows.push({ month, payment: summary.payment, capital, interest, balance });
  }

  return rows;
}

function renderResults(name, rows) {
  const target = document.querySelector(`[data-results="${name}"]`);
  if (!target) return;

  target.innerHTML = rows.map((row) => `
    <div class="result-row ${row.variant || ""}">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(row.value)}</strong>
    </div>
  `).join("");
}

function renderExplanation(name, html) {
  const target = document.querySelector(`[data-explanation="${name}"]`);
  if (target) target.innerHTML = html;
}

function addHistory(type, inputs, result) {
  const history = readStorage(HISTORY_KEY, []);
  const nextHistory = [
    {
      id: crypto.randomUUID(),
      type,
      label: calculatorLabels[type],
      savedAt: new Date().toISOString(),
      inputs,
      result
    },
    ...history
  ].slice(0, 25);

  writeStorage(HISTORY_KEY, nextHistory);
  renderHistory();
}

function drawLoanChart(summary) {
  const canvas = document.querySelector("[data-loan-chart]");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
  context.font = "15px Segoe UI";
  if (!summary) {
    context.fillText("Calcula un prestamo para ver la visualizacion.", 34, 132);
    return;
  }

  const total = summary.financed + summary.interest;
  const capitalAngle = total ? (summary.financed / total) * Math.PI * 2 : 0;
  const centerX = 112;
  const centerY = 112;
  const radius = 70;

  context.beginPath();
  context.moveTo(centerX, centerY);
  context.fillStyle = "#2fd6a3";
  context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + capitalAngle);
  context.fill();

  context.beginPath();
  context.moveTo(centerX, centerY);
  context.fillStyle = "#f2c14e";
  context.arc(centerX, centerY, radius, -Math.PI / 2 + capitalAngle, Math.PI * 1.5);
  context.fill();

  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text").trim();
  context.font = "700 18px Segoe UI";
  context.fillText(`Capital ${Math.round((summary.financed / total) * 100 || 0)}%`, 220, 84);
  context.fillText(`Intereses ${Math.round(summary.interestShare)}%`, 220, 124);
  context.font = "14px Segoe UI";
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
  context.fillText("Balance baja cada mes con la porcion de capital.", 220, 166);

  const rows = amortizationRows(summary).filter((_, index) => index % Math.ceil(summary.months / 8) === 0);
  const startX = 34;
  const startY = 226;
  const width = 350;
  context.strokeStyle = "#2fd6a3";
  context.beginPath();
  rows.forEach((row, index) => {
    const x = startX + (index / Math.max(rows.length - 1, 1)) * width;
    const y = startY - ((summary.financed - row.balance) / Math.max(summary.financed, 1)) * 48;
    if (index === 0) context.moveTo(x, y);
    context.lineTo(x, y);
  });
  context.stroke();
}

function renderAmortization(summary) {
  const target = document.querySelector("[data-amortization-table]");
  const button = document.querySelector("[data-toggle-amortization]");
  if (!target || !summary) {
    if (target) target.innerHTML = "";
    return;
  }

  const rows = amortizationRows(summary);
  const visibleRows = state.showFullAmortization ? rows : rows.slice(0, 12);
  target.innerHTML = visibleRows.map((row) => `
    <tr>
      <td>${row.month}</td>
      <td>${money(row.payment)}</td>
      <td>${money(row.capital)}</td>
      <td>${money(row.interest)}</td>
      <td>${money(row.balance)}</td>
    </tr>
  `).join("");

  if (button) button.textContent = state.showFullAmortization ? "Contraer tabla" : "Expandir tabla";
}

function handleLoanSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const { valid, values } = validateForm(form, {
    amount: { required: true, number: true, min: 1, max: 100000000, minMessage: "Monto debe ser mayor que RD$0." },
    downPayment: { number: true, min: 0, max: 100000000 },
    rate: { required: true, number: true, min: 0, max: 80, maxMessage: "Usa una tasa menor o igual a 80%." },
    term: { required: true, number: true, min: 1, max: 480 }
  });
  if (!valid) return;

  const months = values.termUnit === "years" ? values.term * 12 : values.term;
  const summary = loanSummary({ amount: Number(values.amount), downPayment: Number(values.downPayment) || 0, rate: Number(values.rate), months });

  if (summary.downPayment >= summary.amount) {
    validateForm(form, { downPayment: { required: true, number: true, max: summary.amount - 1, maxMessage: "La inicial debe ser menor que el monto." } });
    return;
  }

  state.lastLoan = summary;
  renderResults("loan", [
    { label: "Monto financiado", value: money(summary.financed) },
    { label: "Pago mensual", value: money(summary.payment), variant: "highlight" },
    { label: "Total pagado", value: money(summary.totalPaid) },
    { label: "Intereses", value: money(summary.interest), variant: "warning" },
    { label: "Porcentaje a intereses", value: percent(summary.interestShare) }
  ]);
  renderExplanation("loan", `
    <strong>Como obtuvimos este resultado</strong><br>
    Monto financiado: ${money(summary.financed)}. Tasa anual: ${percent(summary.rate)}.
    Tasa mensual: ${percent(summary.rate / 12)}. Plazo: ${summary.months} meses.
    La cuota estimada queda en ${money(summary.payment)} usando pagos mensuales fijos.
  `);
  renderAmortization(summary);
  drawLoanChart(summary);
  addHistory("loan", { amount: summary.amount, downPayment: summary.downPayment, rate: summary.rate, term: values.term, termUnit: values.termUnit }, `${money(summary.payment)} mensual`);
}

function handleCompareSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const { valid, values } = validateForm(form, {
    aAmount: { required: true, number: true, min: 1 },
    aDownPayment: { number: true, min: 0 },
    aRate: { required: true, number: true, min: 0, max: 80 },
    aMonths: { required: true, number: true, min: 1, max: 480 },
    bAmount: { required: true, number: true, min: 1 },
    bDownPayment: { number: true, min: 0 },
    bRate: { required: true, number: true, min: 0, max: 80 },
    bMonths: { required: true, number: true, min: 1, max: 480 }
  });
  if (!valid) return;

  const a = loanSummary({ amount: Number(values.aAmount), downPayment: Number(values.aDownPayment) || 0, rate: Number(values.aRate), months: Number(values.aMonths) });
  const b = loanSummary({ amount: Number(values.bAmount), downPayment: Number(values.bDownPayment) || 0, rate: Number(values.bRate), months: Number(values.bMonths) });
  const winner = a.totalPaid <= b.totalPaid ? "A" : "B";
  const savings = Math.abs(a.totalPaid - b.totalPaid);

  renderResults("compare", [
    { label: "Cuota A", value: money(a.payment) },
    { label: "Intereses A", value: money(a.interest) },
    { label: "Cuota B", value: money(b.payment) },
    { label: "Intereses B", value: money(b.interest) },
    { label: "Ahorro estimado", value: money(savings), variant: "highlight" }
  ]);
  renderExplanation("compare", `
    <strong>Resultado de la comparacion</strong><br>
    El prestamo ${winner} te permite ahorrar ${money(savings)} frente al prestamo ${winner === "A" ? "B" : "A"}.
    La diferencia sale de comparar total pagado, intereses y duracion. Una cuota menor no siempre gana si el plazo alarga demasiado los intereses.
  `);
  addHistory("compare", values, `Ahorro ${money(savings)} con prestamo ${winner}`);
}

function calculateAnnualIsr(taxableAnnualSalary) {
  const bracket = ISR_BRACKETS.find((item) => taxableAnnualSalary <= item.upTo);
  if (!bracket || bracket.rate === 0) return 0;
  return bracket.fixed + (taxableAnnualSalary - bracket.excessOver) * bracket.rate;
}

function handleSimpleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const type = form.dataset.form;
  const rules = getRules(type);
  const { valid, values } = validateForm(form, rules);
  if (!valid) return;

  const rows = calculateSimple(type, values);
  renderResults(type, rows);
  addHistory(type, values, rows.find((row) => row.variant === "highlight")?.value || rows[0]?.value || "Calculado");
}

function getRules(type) {
  const baseMoney = { required: true, number: true, min: 1, minMessage: "Monto debe ser mayor que RD$0." };
  return {
    salary: { salary: baseMoney, otherIncome: { number: true, min: 0 } },
    itbis: { amount: baseMoney },
    withholding: { amount: baseMoney, rate: { required: true, number: true, min: 0, max: 100 } },
    hourly: { salary: baseMoney, weeklyHours: { required: true, number: true, min: 1, max: 80 }, overtimeHours: { number: true, min: 0, max: 200 } },
    vacation: { salary: baseMoney, days: { required: true, number: true, min: 1, max: 60 } },
    savings: { initial: { number: true, min: 0 }, monthly: { number: true, min: 0 }, rate: { number: true, min: 0, max: 80 }, years: { required: true, number: true, min: 1, max: 60 } }
  }[type];
}

function calculateSimple(type, values) {
  if (type === "salary") {
    const gross = Number(values.salary);
    const otherIncome = Number(values.otherIncome) || 0;
    const afp = gross * AFP_RATE;
    const sfs = gross * SFS_RATE;
    const taxableMonthly = Math.max(gross + otherIncome - afp - sfs, 0);
    const isr = calculateAnnualIsr(taxableMonthly * 12) / 12;
    const net = gross + otherIncome - afp - sfs - isr;
    return [
      { label: "AFP", value: money(afp) },
      { label: "SFS", value: money(sfs) },
      { label: "ISR mensual", value: money(isr), variant: isr > 0 ? "warning" : "" },
      { label: "Sueldo neto", value: money(net), variant: "highlight" }
    ];
  }

  if (type === "itbis") {
    const amount = Number(values.amount);
    const tax = values.mode === "extract" ? amount - amount / (1 + ITBIS_RATE) : amount * ITBIS_RATE;
    const subtotal = values.mode === "extract" ? amount - tax : amount;
    const total = values.mode === "extract" ? amount : amount + tax;
    return [
      { label: "Subtotal", value: money(subtotal) },
      { label: "ITBIS 18%", value: money(tax), variant: "warning" },
      { label: "Total", value: money(total), variant: "highlight" }
    ];
  }

  if (type === "withholding") {
    const amount = Number(values.amount);
    const retained = amount * (Number(values.rate) / 100);
    return [
      { label: "Monto factura", value: money(amount) },
      { label: "Retencion", value: money(retained), variant: "warning" },
      { label: "Neto a recibir", value: money(amount - retained), variant: "highlight" }
    ];
  }

  if (type === "hourly") {
    const hourly = Number(values.salary) / (Number(values.weeklyHours) * 4.333);
    const overtime = hourly * 1.35 * (Number(values.overtimeHours) || 0);
    return [
      { label: "Pago por hora", value: money(hourly), variant: "highlight" },
      { label: "Hora extra referencial", value: money(hourly * 1.35) },
      { label: "Total horas extras", value: money(overtime) }
    ];
  }

  if (type === "vacation") {
    const daily = Number(values.salary) / 23.83;
    const total = daily * Number(values.days);
    return [
      { label: "Salario diario referencial", value: money(daily) },
      { label: "Dias", value: String(values.days) },
      { label: "Pago estimado", value: money(total), variant: "highlight" }
    ];
  }

  const initial = Number(values.initial) || 0;
  const monthly = Number(values.monthly) || 0;
  const months = Number(values.years) * 12;
  const monthlyRate = (Number(values.rate) || 0) / 100 / 12;
  let balance = initial;
  for (let index = 0; index < months; index += 1) {
    balance = balance * (1 + monthlyRate) + monthly;
  }
  const contributed = initial + monthly * months;
  return [
    { label: "Aportado", value: money(contributed) },
    { label: "Interes ganado", value: money(Math.max(balance - contributed, 0)), variant: "warning" },
    { label: "Balance final", value: money(balance), variant: "highlight" }
  ];
}

function downloadLoanCsv() {
  if (!state.lastLoan) return;
  const rows = amortizationRows(state.lastLoan);
  const csvRows = [
    ["numero de cuota", "cuota", "capital", "interes", "balance restante"],
    ...rows.map((row) => [row.month, row.payment.toFixed(2), row.capital.toFixed(2), row.interest.toFixed(2), row.balance.toFixed(2)])
  ];
  const blob = new Blob([csvRows.map((row) => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "calculard-amortizacion.csv";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function renderHistory() {
  const target = document.querySelector("[data-history-list]");
  if (!target) return;
  const history = readStorage(HISTORY_KEY, []);

  if (!history.length) {
    target.innerHTML = `<div class="empty-state">Aun no tienes calculos guardados.</div>`;
    return;
  }

  target.innerHTML = history.map((item) => {
    const date = new Date(item.savedAt);
    const mainData = Object.values(item.inputs).filter((value) => value !== "").slice(0, 4).join(" · ");
    return `
      <article class="history-item">
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(mainData)}</span>
          <span>${date.toLocaleDateString("es-DO")} ${date.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}</span>
          <span>${escapeHtml(item.result)}</span>
        </div>
        <div class="history-item-actions">
          <button type="button" data-history-view="${item.id}">Ver nuevamente</button>
          <button type="button" data-history-repeat="${item.id}">Repetir calculo</button>
          <button type="button" data-history-delete="${item.id}">Eliminar</button>
        </div>
      </article>
    `;
  }).join("");
}

function initializeHistory() {
  const section = document.querySelector("[data-history-list]");
  section?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const history = readStorage(HISTORY_KEY, []);
    const id = button.dataset.historyDelete || button.dataset.historyRepeat || button.dataset.historyView;
    const item = history.find((entry) => entry.id === id);

    if (button.dataset.historyDelete) {
      writeStorage(HISTORY_KEY, history.filter((entry) => entry.id !== id));
      renderHistory();
      return;
    }

    if (!item) return;

    if (button.dataset.historyView) {
      button.closest(".history-item")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const form = document.querySelector(repeatTargets[item.type]);
    if (!form) return;
    Object.entries(item.inputs).forEach(([name, value]) => {
      if (form.elements[name]) form.elements[name].value = value;
    });
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelector("[data-clear-history]")?.addEventListener("click", () => {
    writeStorage(HISTORY_KEY, []);
    renderHistory();
  });

  renderHistory();
}

function initializeSearch() {
  const input = document.querySelector("[data-tool-search]");
  const cards = [...document.querySelectorAll("[data-tool-card]")];
  const empty = document.querySelector("[data-search-empty]");

  input?.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const text = `${card.dataset.title} ${card.dataset.category} ${card.dataset.keywords}`.toLowerCase();
      const match = text.includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
  });
}

function initializeFavorites() {
  const buttons = [...document.querySelectorAll("[data-favorite-toggle]")];
  const grid = document.querySelector("[data-favorites-grid]");
  const empty = document.querySelector("[data-favorites-empty]");

  function paint() {
    buttons.forEach((button) => {
      const active = state.favorites.includes(button.dataset.favoriteToggle);
      button.textContent = active ? "★" : "☆";
      button.setAttribute("aria-pressed", String(active));
    });

    if (!grid || !empty) return;
    const cards = [...document.querySelectorAll("[data-tool-card]")]
      .filter((card) => state.favorites.includes(card.dataset.toolKey));
    empty.hidden = cards.length > 0;
    grid.innerHTML = cards.map((card) => `
      <article class="tool-card">
        <span class="tool-icon" aria-hidden="true">${escapeHtml(card.querySelector(".tool-icon")?.textContent || "")}</span>
        <h3>${escapeHtml(card.dataset.title)}</h3>
        <p>${escapeHtml(card.querySelector("p")?.textContent || "")}</p>
        <a class="tool-link" href="${card.querySelector("a")?.getAttribute("href")}">Abrir →</a>
      </article>
    `).join("");
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.favoriteToggle;
      state.favorites = state.favorites.includes(key)
        ? state.favorites.filter((item) => item !== key)
        : [key, ...state.favorites];
      writeStorage(FAVORITES_KEY, state.favorites);
      paint();
    });
  });

  paint();
}

function initializeForms() {
  document.querySelector("[data-form='loan']")?.addEventListener("submit", handleLoanSubmit);
  document.querySelector("[data-form='compare']")?.addEventListener("submit", handleCompareSubmit);
  document.querySelectorAll(".mini-calculator [data-form]").forEach((form) => {
    form.addEventListener("submit", handleSimpleSubmit);
  });

  document.querySelector("[data-toggle-amortization]")?.addEventListener("click", () => {
    state.showFullAmortization = !state.showFullAmortization;
    renderAmortization(state.lastLoan);
  });
  document.querySelector("[data-download-csv]")?.addEventListener("click", downloadLoanCsv);
  document.querySelector("[data-print-result]")?.addEventListener("click", () => window.print());
  drawLoanChart(null);
}

function initializePwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    });
  }
}

initializeTheme();
initializeSearch();
initializeFavorites();
initializeHistory();
initializeForms();
initializePwa();
