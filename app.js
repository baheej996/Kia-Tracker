const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const STORAGE_KEY = "sonetpay-tracker-state";
const KFS_VERSION = "CF04058719-2026-03-26";

const seedState = {
  settings: {
    kfsVersion: KFS_VERSION,
    vehicleCost: 1343580,
    downPayment: 957768,
    targetMonthlyPayment: 15995,
    loanAmount: 929000,
    sanctionedLoanAmount: 957768,
    netDisbursedAmount: 922500,
    totalInterest: 385812,
    feesAndCharges: 35268,
    rateOfInterest: 10.1,
    apr: 11.31,
    loanTermMonths: 84,
    repaymentStartDate: "2026-05-05"
  },
  payments: [
    { id: crypto.randomUUID(), date: "2026-05-05", amount: 15995, mode: "EMI", reference: "KFS-CF04058719-EMI-01", status: "Pending", note: "EMI 1 of 84 as per KFS" },
    { id: crypto.randomUUID(), date: "2026-06-05", amount: 15995, mode: "EMI", reference: "KFS-CF04058719-EMI-02", status: "Pending", note: "EMI 2 of 84 as per KFS" },
    { id: crypto.randomUUID(), date: "2026-07-05", amount: 15995, mode: "EMI", reference: "KFS-CF04058719-EMI-03", status: "Pending", note: "EMI 3 of 84 as per KFS" },
    { id: crypto.randomUUID(), date: "2026-08-05", amount: 15995, mode: "EMI", reference: "KFS-CF04058719-EMI-04", status: "Pending", note: "EMI 4 of 84 as per KFS" },
    { id: crypto.randomUUID(), date: "2026-09-05", amount: 15995, mode: "EMI", reference: "KFS-CF04058719-EMI-05", status: "Pending", note: "EMI 5 of 84 as per KFS" },
    { id: crypto.randomUUID(), date: "2026-10-05", amount: 15995, mode: "EMI", reference: "KFS-CF04058719-EMI-06", status: "Pending", note: "EMI 6 of 84 as per KFS" }
  ],
  debts: [
    { id: crypto.randomUUID(), name: "Father", type: "Borrowed", amount: 150000, date: "2026-04-15", note: "Downpayment support" },
    { id: crypto.randomUUID(), name: "Father", type: "Returned", amount: 50000, date: "2026-05-20", note: "Part payment return" },
    { id: crypto.randomUUID(), name: "Ahmad (Friend)", type: "Borrowed", amount: 30000, date: "2026-05-10", note: "Insurance cost support" }
  ],
  theme: "light"
};

let state = loadState();
let pendingDeletePaymentId = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(seedState);

  try {
    const parsed = JSON.parse(stored);
    if (!parsed.debts) parsed.debts = [];
    return migrateState({ ...structuredClone(seedState), ...parsed });
  } catch {
    return structuredClone(seedState);
  }
}

function migrateState(currentState) {
  if (currentState.settings?.kfsVersion === KFS_VERSION) return currentState;

  const placeholderData = currentState.payments?.some((payment) => payment.reference?.startsWith("AUTO-EMI") || payment.reference === "KIA-DP-001");
  const nextState = {
    ...currentState,
    settings: { ...currentState.settings, ...structuredClone(seedState.settings) }
  };

  if (placeholderData) {
    nextState.payments = structuredClone(seedState.payments);
  }

  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function paidPayments() {
  return state.payments.filter((payment) => payment.status === "Paid");
}

function totalPaid() {
  return paidPayments().reduce((sum, payment) => sum + Number(payment.amount), 0);
}

function remainingBalance() {
  return Math.max(state.settings.vehicleCost - totalPaid(), 0);
}

function progressPercentage() {
  return Math.min(Math.round((totalPaid() / state.settings.vehicleCost) * 100), 100);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function monthKey(value) {
  return value.slice(0, 7);
}

function expectedCompletionDate() {
  const remaining = remainingBalance();
  if (remaining === 0) return "Completed";
  const months = Math.ceil(remaining / state.settings.targetMonthlyPayment);
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(date);
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  renderMetrics();
  renderPayments();
  renderInstallments();
  renderDebts();
  saveState();
}

function renderMetrics() {
  const paid = totalPaid();
  const remaining = remainingBalance();
  const progress = progressPercentage();

  $("#metricCost").textContent = INR.format(state.settings.vehicleCost);
  $("#metricDown").textContent = INR.format(state.settings.downPayment);
  $("#metricPaid").textContent = INR.format(paid);
  $("#metricRemaining").textContent = INR.format(remaining);
  $("#expectedDate").textContent = `APR ${state.settings.apr}% - ${state.settings.loanTermMonths} months`;
  $("#progressLabel").textContent = `${progress}%`;
  $("#ringText").textContent = `${progress}%`;
  $("#progressBar").style.width = `${progress}%`;
  $("#progressRing").style.strokeDashoffset = `${320 - (320 * progress) / 100}`;
  $("#progressNarrative").textContent = `${INR.format(paid)} paid toward ${INR.format(state.settings.vehicleCost)} total payable. ${INR.format(remaining)} remains across the KFS repayment schedule.`;
  $("#paidCount").textContent = state.payments.filter((item) => item.status === "Paid").length;
  $("#pendingCount").textContent = state.payments.filter((item) => item.status === "Pending").length;
}

function renderPayments() {
  const search = $("#paymentSearch").value.trim().toLowerCase();
  const status = $("#statusFilter").value;
  const month = $("#monthFilter").value;

  const rows = state.payments
    .filter((payment) => status === "all" || payment.status === status)
    .filter((payment) => !month || monthKey(payment.date) === month)
    .filter((payment) => {
      const haystack = `${payment.mode} ${payment.reference} ${payment.note}`.toLowerCase();
      return !search || haystack.includes(search);
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  $("#paymentRows").innerHTML = rows.map((payment) => `
    <tr>
      <td data-label="Date">${formatDate(payment.date)}</td>
      <td data-label="Mode">${payment.mode}</td>
      <td data-label="Reference">${payment.reference || "No reference"}</td>
      <td data-label="Amount"><strong>${INR.format(payment.amount)}</strong></td>
      <td data-label="Status"><span class="status ${payment.status}">${payment.status}</span></td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="icon-btn" type="button" title="Edit" data-edit-payment="${payment.id}">Edit</button>
          <button class="icon-btn" type="button" title="Delete" data-delete-payment="${payment.id}">Del</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="6">No payments match the current filters.</td></tr>`;
}

function renderInstallments() {
  const items = state.payments
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((payment, index) => `
      <div class="installment ${payment.status === "Pending" ? "pending" : ""}">
        <strong>${index === 0 ? "Down payment" : `Installment ${index}`}: ${INR.format(payment.amount)}</strong>
        <span>${formatDate(payment.date)} - ${payment.status} via ${payment.mode}</span>
      </div>
    `);

  $("#installmentList").innerHTML = items.join("");
}

function renderDebts() {
  const aggregates = {};
  state.debts.forEach((d) => {
    const name = d.name.trim();
    if (!aggregates[name]) {
      aggregates[name] = { borrowed: 0, returned: 0 };
    }
    if (d.type === "Borrowed") {
      aggregates[name].borrowed += Number(d.amount);
    } else if (d.type === "Returned") {
      aggregates[name].returned += Number(d.amount);
    }
  });

  const summaryHtml = Object.keys(aggregates).map((name) => {
    const data = aggregates[name];
    const outstanding = Math.max(data.borrowed - data.returned, 0);
    return `
      <tr>
        <td data-label="Funder"><strong>${name}</strong></td>
        <td data-label="Total Borrowed">${INR.format(data.borrowed)}</td>
        <td data-label="Total Returned">${INR.format(data.returned)}</td>
        <td data-label="Net Outstanding"><strong style="color: ${outstanding > 0 ? "var(--red)" : "#13a15f"}">${INR.format(outstanding)}</strong></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4">No borrowing balances recorded yet.</td></tr>`;
  $("#debtSummaryRows").innerHTML = summaryHtml;

  const logsHtml = state.debts
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((d) => `
      <tr>
        <td data-label="Date">${formatDate(d.date)}</td>
        <td data-label="Funder"><strong>${d.name}</strong></td>
        <td data-label="Action"><span class="status ${d.type === "Borrowed" ? "Pending" : "Paid"}">${d.type}</span></td>
        <td data-label="Amount"><strong>${INR.format(d.amount)}</strong></td>
        <td data-label="Note">${d.note || "-"}</td>
        <td data-label="Action">
          <button class="icon-btn" type="button" title="Delete" data-delete-debt="${d.id}">Del</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="6">No transaction logs recorded yet.</td></tr>`;
  $("#debtLogRows").innerHTML = logsHtml;
}





function openPaymentDialog(payment = null) {
  $("#dialogTitle").textContent = payment ? "Edit payment" : "Add payment";
  $("#paymentId").value = payment?.id || "";
  $("#paymentDate").value = payment?.date || new Date().toISOString().slice(0, 10);
  $("#paymentAmount").value = payment?.amount || "";
  $("#paymentMode").value = payment?.mode || "";
  $("#paymentReference").value = payment?.reference || "";
  $("#paymentStatus").value = payment?.status || "Paid";
  $("#paymentNote").value = payment?.note || "";
  $("#paymentDialog").showModal();
}

function openDeletePaymentDialog(paymentId) {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment) return;

  pendingDeletePaymentId = paymentId;
  $("#confirmMessage").textContent = `${INR.format(payment.amount)} from ${formatDate(payment.date)} will be removed. This will update your total paid and remaining balance.`;
  $("#confirmDialog").showModal();
}

function closeMobileMenu() {
  document.body.classList.remove("menu-open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
}

function closeExportMenu() {
  $(".export-menu").classList.remove("open");
  $("#exportToggle").setAttribute("aria-expanded", "false");
}

function savePaymentFromForm() {
  if (!$("#paymentForm").reportValidity()) return;

  const payment = {
    id: $("#paymentId").value || crypto.randomUUID(),
    date: $("#paymentDate").value,
    amount: Number($("#paymentAmount").value),
    mode: $("#paymentMode").value.trim(),
    reference: $("#paymentReference").value.trim(),
    status: $("#paymentStatus").value,
    note: $("#paymentNote").value.trim()
  };

  if (!payment.date || !payment.amount || !payment.mode) return;

  const existingIndex = state.payments.findIndex((item) => item.id === payment.id);
  if (existingIndex >= 0) {
    state.payments[existingIndex] = payment;
  } else {
    state.payments.push(payment);
  }

  $("#paymentDialog").close();
  render();
}

function exportExcel() {
  const rows = [
    ["SonetPay Tracker Export"],
    ["Total Vehicle Cost", state.settings.vehicleCost],
    ["Total Paid", totalPaid()],
    ["Remaining Balance", remainingBalance()],
    [],
    ["Date", "Mode", "Reference", "Amount", "Status", "Note"],
    ...state.payments.map((payment) => [payment.date, payment.mode, payment.reference, payment.amount, payment.status, payment.note])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  download(`sonetpay-tracker-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".export-menu")) closeExportMenu();

  const target = event.target.closest("button, a");
  if (!target) return;

  if (target.matches("[data-open-payment]")) openPaymentDialog();

  if (target.id === "exportToggle") {
    const menu = $(".export-menu");
    const isOpen = menu.classList.toggle("open");
    $("#exportToggle").setAttribute("aria-expanded", String(isOpen));
  }

  const editId = target.dataset.editPayment;
  if (editId) openPaymentDialog(state.payments.find((payment) => payment.id === editId));

  const deletePayment = target.dataset.deletePayment;
  if (deletePayment) {
    openDeletePaymentDialog(deletePayment);
  }
  const deleteDebtId = target.dataset.deleteDebt;
  if (deleteDebtId) {
    state.debts = state.debts.filter((d) => d.id !== deleteDebtId);
    render();
  }

  if (target.closest(".mobile-nav-item")) {
    $$(".mobile-nav-item").forEach((item) => item.classList.remove("active"));
    target.closest(".mobile-nav-item").classList.add("active");
  }

  if (target.closest(".nav-list a")) closeMobileMenu();
});

$("#savePayment").addEventListener("click", savePaymentFromForm);
$("#confirmDeletePayment").addEventListener("click", () => {
  if (!pendingDeletePaymentId) return;

  state.payments = state.payments.filter((payment) => payment.id !== pendingDeletePaymentId);
  pendingDeletePaymentId = "";
  $("#confirmDialog").close();
  render();
});
$("#confirmDialog").addEventListener("close", () => {
  pendingDeletePaymentId = "";
});
$("#menuToggle").addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("menu-open");
  $("#menuToggle").setAttribute("aria-expanded", String(isOpen));
});
$("#paymentSearch").addEventListener("input", renderPayments);
$("#statusFilter").addEventListener("change", renderPayments);
$("#monthFilter").addEventListener("change", renderPayments);
$("#exportExcel").addEventListener("click", () => {
  closeExportMenu();
  exportExcel();
});
$("#exportPdf").addEventListener("click", () => {
  closeExportMenu();
  window.print();
});
$("#themeToggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  render();
});
$("#debtForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.debts.push({
    id: crypto.randomUUID(),
    name: $("#debtName").value.trim(),
    type: $("#debtType").value,
    amount: Number($("#debtAmount").value),
    date: $("#debtDate").value,
    note: $("#debtNote").value.trim()
  });
  event.target.reset();
  $("#debtDate").value = new Date().toISOString().slice(0, 10);
  render();
});

$("#debtDate").value = new Date().toISOString().slice(0, 10);
render();
