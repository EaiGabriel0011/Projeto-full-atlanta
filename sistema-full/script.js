const STORAGE_KEY = "controle_full_envios_v1";

let shipments = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
let draftProducts = [];
let currentShipmentId = null;

const $ = (id) => document.getElementById(id);

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shipments));
    updateDashboard();
    renderHistory();
}

function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}

function showSection(id, title = null) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active-section"));
    $(id).classList.add("active-section");
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.section === id));
    $("page-title").textContent = title || ({
        dashboard: "Dashboard",
        "novo-envio": "Novo envio",
        historico: "Histórico",
        conferencia: "Conferência"
    }[id] || "Controle Full");
}

document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
});

$("new-shipment-top").addEventListener("click", () => {
    resetDraft();
    showSection("novo-envio");
});

$("go-history").addEventListener("click", () => showSection("historico"));

function resetDraft() {
    draftProducts = [];
    $("shipment-number").value = "";
    $("shipment-note").value = "";
    $("sku").value = "";
    $("product-name").value = "";
    $("expected-qty").value = 1;
    renderDraft();
}

function renderDraft() {
    const box = $("draft-products");
    if (!draftProducts.length) {
        box.innerHTML = '<div class="empty">Nenhum produto adicionado. Cadastre os itens do envio acima.</div>';
        return;
    }

    box.innerHTML = `
        <table>
            <thead><tr><th>SKU</th><th>Produto</th><th>Quantidade</th><th>Ação</th></tr></thead>
            <tbody>
                ${draftProducts.map((p, i) => `
                    <tr>
                        <td><strong>${escapeHtml(p.sku)}</strong></td>
                        <td>${escapeHtml(p.name)}</td>
                        <td>${p.expected}</td>
                        <td><button class="danger-outline" onclick="removeDraft(${i})">Remover</button></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>`;
}

window.removeDraft = (i) => {
    draftProducts.splice(i, 1);
    renderDraft();
};

$("add-product").addEventListener("click", () => {
    const sku = $("sku").value.trim();
    const name = $("product-name").value.trim();
    const expected = Number($("expected-qty").value);

    if (!sku || !name || !Number.isInteger(expected) || expected < 1) {
        showToast("Preencha SKU, produto e quantidade corretamente.");
        return;
    }

    const existing = draftProducts.find(p => p.sku.toLowerCase() === sku.toLowerCase());
    if (existing) {
        existing.expected += expected;
    } else {
        draftProducts.push({ sku, name, expected, checked: 0 });
    }

    $("sku").value = "";
    $("product-name").value = "";
    $("expected-qty").value = 1;
    $("sku").focus();
    renderDraft();
});

$("clear-draft").addEventListener("click", resetDraft);

$("start-check").addEventListener("click", () => {
    const number = $("shipment-number").value.trim();

    if (!number) {
        showToast("Informe o número do envio.");
        return;
    }
    if (!draftProducts.length) {
        showToast("Adicione pelo menos um produto.");
        return;
    }

    const shipment = {
        id: Date.now(),
        number,
        note: $("shipment-note").value.trim(),
        createdAt: new Date().toISOString(),
        finishedAt: null,
        status: "Pendente",
        products: draftProducts.map(p => ({...p, checked: 0}))
    };

    shipments.unshift(shipment);
    currentShipmentId = shipment.id;
    save();
    openCheck(shipment.id);
});

function openCheck(id) {
    const shipment = shipments.find(s => s.id === id);
    if (!shipment) return;

    currentShipmentId = id;
    $("check-title").textContent = `Envio ${shipment.number}`;
    $("check-note").textContent = shipment.note || "Sem observações.";
    showSection("conferencia", "Conferência");
    renderCheck();
}

function renderCheck() {
    const shipment = shipments.find(s => s.id === currentShipmentId);
    if (!shipment) return;

    let expectedTotal = 0, checkedTotal = 0, exact = true;

    $("check-products").innerHTML = shipment.products.map((p, i) => {
        expectedTotal += p.expected;
        checkedTotal += p.checked;
        if (p.checked !== p.expected) exact = false;

        const difference = p.checked - p.expected;
        const status = difference === 0
            ? '<span class="status-badge ok">✓ OK</span>'
            : difference < 0
                ? `<span class="status-badge pending">Faltam ${Math.abs(difference)}</span>`
                : `<span class="status-badge error">Excesso ${difference}</span>`;

        return `
            <div class="check-item ${difference === 0 ? "ok" : "error"}">
                <div class="product-info">
                    <strong>${escapeHtml(p.name)}</strong>
                    <span>SKU: ${escapeHtml(p.sku)}</span>
                </div>
                <div class="qty-box"><span>Esperado</span><strong>${p.expected}</strong></div>
                <input class="check-input" type="number" min="0" value="${p.checked}"
                    onchange="changeChecked(${i}, this.value)">
                ${status}
            </div>`;
    }).join("");

    const percent = expectedTotal ? Math.min(100, Math.round((checkedTotal / expectedTotal) * 100)) : 0;
    $("progress-bar").style.width = `${percent}%`;
    $("progress-text").textContent = `${percent}%`;
    $("sum-expected").textContent = expectedTotal;
    $("sum-checked").textContent = checkedTotal;
    $("sum-difference").textContent = checkedTotal - expectedTotal;

    const statusEl = $("check-status");
    statusEl.textContent = exact ? "✓ Tudo correto" : (checkedTotal > expectedTotal ? "Divergência" : "Pendente");
    statusEl.className = `status-badge ${exact ? "ok" : checkedTotal > expectedTotal ? "error" : "pending"}`;
    $("finish-check").disabled = !exact;
}

window.changeChecked = (index, value) => {
    const shipment = shipments.find(s => s.id === currentShipmentId);
    if (!shipment) return;

    let qty = Math.max(0, parseInt(value, 10) || 0);
    shipment.products[index].checked = qty;

    // Ao editar a conferência, o envio volta a ser pendente até ser finalizado.
    if (shipment.status === "Conferido") {
        shipment.status = "Pendente";
        shipment.finishedAt = null;
    }

    save();
    renderCheck();
};

$("finish-check").addEventListener("click", () => {
    const shipment = shipments.find(s => s.id === currentShipmentId);
    if (!shipment) return;

    const exact = shipment.products.every(p => p.checked === p.expected);
    if (!exact) {
        showToast("Ainda existem divergências.");
        return;
    }

    shipment.status = "Conferido";
    shipment.finishedAt = new Date().toISOString();
    save();
    showToast("Envio conferido com sucesso!");
    setTimeout(() => showSection("dashboard"), 700);
});

$("back-dashboard").addEventListener("click", () => showSection("dashboard"));

function updateDashboard() {
    const total = shipments.length;
    const ok = shipments.filter(s => s.status === "Conferido").length;
    const pending = shipments.filter(s => s.status === "Pendente").length;
    const error = shipments.filter(s => hasDivergence(s)).length;

    $("stat-total").textContent = total;
    $("stat-ok").textContent = ok;
    $("stat-pending").textContent = pending;
    $("stat-error").textContent = error;

    const recent = shipments.slice(0, 8);
    $("recent-list").innerHTML = recent.length ? buildShipmentTable(recent, true) :
        '<div class="empty">Nenhum envio cadastrado ainda.</div>';
}

function hasDivergence(shipment) {
    return shipment.status !== "Conferido" &&
        shipment.products.some(p => p.checked !== p.expected && p.checked > 0);
}

function buildShipmentTable(list, recent = false) {
    return `
        <table>
            <thead><tr>
                <th>Envio</th><th>Itens</th><th>Conferidos</th><th>Data</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
                ${list.map(s => {
                    const expected = s.products.reduce((a,p) => a + p.expected, 0);
                    const checked = s.products.reduce((a,p) => a + p.checked, 0);
                    const cls = s.status === "Conferido" ? "ok" : hasDivergence(s) ? "error" : "pending";
                    return `<tr>
                        <td><strong>${escapeHtml(s.number)}</strong></td>
                        <td>${expected}</td>
                        <td>${checked}</td>
                        <td>${formatDate(s.createdAt)}</td>
                        <td><span class="status-badge ${cls}">${s.status}</span></td>
                        <td><button class="ghost-btn" onclick="openCheck(${s.id})">${s.status === "Conferido" ? "Ver" : "Conferir"}</button></td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>`;
}

function renderHistory() {
    const box = $("history-list");
    box.innerHTML = shipments.length ? buildShipmentTable(shipments) :
        '<div class="empty">O histórico está vazio.</div>';
}

$("clear-history").addEventListener("click", () => {
    if (!shipments.length) return;
    if (confirm("Deseja apagar todos os envios salvos neste navegador?")) {
        shipments = [];
        localStorage.removeItem(STORAGE_KEY);
        updateDashboard();
        renderHistory();
        showToast("Histórico apagado.");
    }
});

function formatDate(iso) {
    return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
}

renderDraft();
updateDashboard();
renderHistory();
