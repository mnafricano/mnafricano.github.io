"use strict";

const appState = {
  status: null,
  busy: false,
  mode: "auto",
  inspectedDetails: null,
  openPanel: null,
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  chatRegion: $("#chat-region"),
  emptyState: $("#empty-state"),
  messageList: $("#message-list"),
  thinkingRow: $("#thinking-row"),
  phaseStatus: $("#phase-status"),
  composer: $("#composer"),
  messageInput: $("#message-input"),
  sendButton: $("#send-button"),
  pendingBanner: $("#pending-banner"),
  pendingAction: $("#pending-action"),
  conversationTitle: $("#conversation-title"),
  conversationList: $("#conversation-list"),
  newChat: $("#new-chat"),
  cycleCount: $("#cycle-count"),
  memoryCount: $("#memory-count"),
  skillCount: $("#skill-count"),
  shellStatus: $("#shell-status"),
  modelStatus: $("#model-status"),
  modelBadge: $("#model-badge"),
  modelNotice: $("#model-notice"),
  modelNoticeTitle: $("#model-notice-title"),
  modelNoticeDetail: $("#model-notice-detail"),
  composerNote: $("#composer-note"),
  approvalStack: $("#approval-stack"),
  approvalCount: $("#approval-count"),
  workspaceStatus: $("#workspace-status"),
  maintenanceStatus: $("#maintenance-status"),
  intentChips: $("#intent-chips"),
  inspector: $("#inspector"),
  inspectorContent: $("#inspector-content"),
  inspectorClose: $("#inspector-close"),
  inspectorScrim: $("#inspector-scrim"),
  sidebar: $("#sidebar"),
  sidebarScrim: $("#sidebar-scrim"),
  sidebarClose: $("#sidebar-close"),
  menuButton: $("#menu-button"),
  workbenchPanel: $("#workbench-panel"),
  workbenchTitle: $("#workbench-title"),
  workbenchContent: $("#workbench-content"),
  workbenchClose: $("#workbench-close"),
  workbenchScrim: $("#workbench-scrim"),
  toast: $("#toast"),
};

function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

function appendInlineMarkup(parent, text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      parent.append(node("strong", "", part.slice(2, -2)));
    } else if (part.startsWith("`") && part.endsWith("`")) {
      parent.append(node("code", "", part.slice(1, -1)));
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

function renderRichText(parent, text) {
  const lines = String(text).split("\n");
  let list = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      list = null;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!list) {
        list = node("ul");
        parent.append(list);
      }
      const item = node("li");
      appendInlineMarkup(item, line.replace(/^[-*]\s+/, ""));
      list.append(item);
      continue;
    }
    list = null;
    const paragraph = node("p");
    appendInlineMarkup(paragraph, line.replace(/^#{1,4}\s+/, ""));
    parent.append(paragraph);
  }
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (error) {
    throw new Error(
      "The local workbench server is offline. Reopen Cognitive MPC or run “python3 main.py --web”.",
      { cause: error },
    );
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}.`);
  }
  return payload;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 5200);
}

function renderStatus(status) {
  appState.status = status;
  const conversation = status.conversation;
  const messages = conversation.messages || [];
  elements.conversationTitle.textContent = conversation.title;
  elements.emptyState.hidden = messages.length > 0;
  elements.messageList.replaceChildren(...messages.map(renderMessage));

  elements.conversationList.replaceChildren();
  for (const item of status.conversations) {
    const button = node(
      "button",
      `conversation-button${item.active ? " active" : ""}`,
    );
    button.type = "button";
    button.dataset.conversationId = item.id;
    button.append(node("span", "conversation-icon", "◫"));
    button.append(node("span", "", item.title));
    elements.conversationList.append(button);
  }

  const runtime = status.runtime;
  elements.cycleCount.textContent = String(runtime.cycle_count);
  elements.memoryCount.textContent = String(
    runtime.episodic_count + runtime.semantic_count,
  );
  elements.skillCount.textContent = String(runtime.procedural_count);
  elements.shellStatus.textContent = runtime.shell_enabled ? "Enabled" : "Disabled";
  elements.workspaceStatus.textContent = runtime.workspace || "Not selected";
  elements.workspaceStatus.title = runtime.workspace || "";
  const maintenance = status.maintenance || {};
  elements.maintenanceStatus.textContent = maintenance.running
    ? "Running"
    : maintenance.replay_due
      ? "Replay due"
      : "Up to date";
  elements.approvalCount.textContent = String(status.pending_approvals || 0);

  const model = runtime.model;
  elements.modelStatus.textContent = model.available
    ? `${model.provider}/${model.model}`
    : "Template fallback";
  elements.modelBadge.textContent = model.available
    ? `AI · ${model.model}`
    : "AI offline · Explicit fallback";
  elements.modelBadge.classList.toggle("model-ready", model.available);
  elements.modelBadge.classList.toggle("model-offline", !model.available);
  elements.modelNotice.hidden = model.available;
  elements.modelNoticeTitle.textContent = "AI model is not ready";
  elements.modelNoticeDetail.textContent =
    `${model.detail} Deterministic control remains available, clearly labeled as template mode.`;
  elements.composerNote.textContent = model.available
    ? `Generated locally by ${model.provider}/${model.model}; deterministic verification and selection remain authoritative.`
    : "TEMPLATE MODE — no response is being presented as AI-generated.";

  if (status.pending_action) {
    elements.pendingBanner.hidden = false;
    elements.pendingAction.textContent = status.pending_action.description;
    elements.messageInput.placeholder = "Report what happened, ask a question, or choose a mode…";
  } else {
    elements.pendingBanner.hidden = true;
    elements.pendingAction.textContent = "";
    elements.messageInput.placeholder = "Describe a goal…";
  }
  updateSendButton();
  refreshApprovals();
  requestAnimationFrame(scrollToBottom);
}

function renderMessage(message) {
  const row = node("article", `message-row ${message.role}`);
  row.dataset.messageId = message.id;
  const assistant = message.role === "assistant";
  const avatar = node(
    "div",
    `avatar ${assistant ? "assistant-avatar" : "user-avatar"}`,
    assistant ? "C" : "You",
  );
  avatar.setAttribute("aria-hidden", "true");
  const content = node("div", "message-content");
  content.append(node("div", "message-role", assistant ? "Cognitive MPC" : "You"));
  const body = node("div", "message-body");
  renderRichText(body, message.content);
  content.append(body);

  if (assistant && message.details?.response_mode === "template") {
    content.prepend(node("span", "mode-label fallback", "TEMPLATE FALLBACK"));
  } else if (assistant && message.details?.response_mode === "generative") {
    content.prepend(node("span", "mode-label generated", "LOCAL AI"));
  }
  if (assistant && message.details?.kind === "control_cycle") {
    const summary = node("div", "decision-summary");
    const copy = node("span");
    const planner = message.details.planning_backend || {};
    copy.append(
      node("strong", "", `Cycle ${message.details.cycle_number} complete`),
      node(
        "small",
        "",
        `${message.details.candidates.length} plans · ${
          planner.source === "ollama" ? "AI proposed" : "heuristic proposals"
        } · deterministic MPC selected`,
      ),
    );
    const traceButton = node("button", "trace-button", "View decision trace");
    traceButton.type = "button";
    traceButton.addEventListener("click", () => openInspector(message.details));
    summary.append(copy, traceButton);
    content.append(summary);
    if (planner.warning) content.append(node("p", "inline-warning", planner.warning));
  }
  if (assistant && message.details?.kind === "intent_clarification") {
    content.append(node("p", "inline-warning", "Nothing was executed or marked complete."));
  }
  row.append(avatar, content);
  return row;
}

function renderStreamingMessage() {
  const message = {
    id: "streaming",
    role: "assistant",
    content: "",
    details: { response_mode: "generative" },
  };
  const row = renderMessage(message);
  row.classList.add("streaming");
  elements.messageList.append(row);
  return row.querySelector(".message-body");
}

async function streamChat(message, mode) {
  let response;
  try {
    response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, mode }),
    });
  } catch (error) {
    throw new Error(
      "The local server stopped responding. Reopen Cognitive MPC and retry.",
      { cause: error },
    );
  }
  if (!response.ok || !response.body) {
    throw new Error(`Streaming request failed (${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let streamedBody = null;
  let completed = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);
      if (eventName === "error") throw new Error(payload.error);
      if (eventName === "token") {
        if (!streamedBody) {
          elements.thinkingRow.hidden = true;
          streamedBody = renderStreamingMessage();
        }
        streamedBody.textContent += payload.content || "";
        scrollToBottom();
      } else if (eventName === "complete") {
        completed = payload;
      } else if (eventName === "approval_required") {
        showToast("A consequential tool call needs your approval.");
      } else {
        updatePhase(eventName, payload);
      }
      eventName = "message";
    }
    if (done) break;
  }
  if (!completed) throw new Error("The stream ended before a complete response arrived.");
  return completed;
}

function updatePhase(eventName) {
  const labels = {
    intent: "Routing intent…",
    planning: "Generating candidate plans…",
    simulation: "Simulating likely outcomes…",
    verification: "Checking constraints and safety…",
    selection: "Selecting one next action…",
  };
  if (labels[eventName]) elements.phaseStatus.textContent = labels[eventName];
}

async function sendMessage(text) {
  const clean = text.trim();
  if (!clean || appState.busy) return;
  elements.messageInput.value = "";
  setBusy(true);
  try {
    const payload = await streamChat(clean, appState.mode);
    renderStatus(payload.status);
  } catch (error) {
    showToast(error.message);
    try {
      renderStatus(await api("/api/status"));
    } catch {
      // The actionable error above is enough if the server is offline.
    }
  } finally {
    setBusy(false);
    elements.messageInput.focus();
  }
}

function openInspector(details) {
  appState.inspectedDetails = details;
  elements.inspectorContent.replaceChildren();
  const meta = node("div", "trace-meta");
  meta.append(
    node("span", "trace-chip", `Cycle ${details.cycle_number}`),
    node(
      "span",
      "trace-chip",
      details.observation_outcome
        ? `${details.observation_outcome} observation`
        : "new goal",
    ),
    node("span", "trace-chip", (details.scheduler || []).join(" · ")),
  );
  elements.inspectorContent.append(meta);
  if (details.planning_backend?.warning) {
    elements.inspectorContent.append(
      node("p", "panel-notice warning", details.planning_backend.warning),
    );
  }
  for (const candidate of details.candidates || []) {
    const selected = candidate.id === details.selected_plan_id;
    const card = node("section", `candidate-card${selected ? " selected" : ""}`);
    const head = node("div", "candidate-head");
    const title = node("h3", "", candidate.title);
    if (selected) title.append(" · selected");
    const score = node("div", "candidate-score");
    score.append(
      node("strong", "", candidate.adjusted_score.toFixed(2)),
      node("span", "", "adjusted utility"),
    );
    head.append(title, score);
    card.append(head, node("p", "candidate-rationale", candidate.rationale));
    const scoreGrid = node("div", "score-grid");
    const cells = [
      ["Benefit", candidate.score.benefit, false],
      ["Compounding", candidate.score.compounding_value, false],
      ["Reversibility", candidate.score.reversibility, false],
      ["Cost", candidate.score.cost, true],
      ["Risk", candidate.score.risk, true],
      ["Uncertainty", candidate.score.uncertainty, true],
    ];
    for (const [label, value, negative] of cells) {
      const cell = node("div", `score-cell${negative ? " negative" : ""}`);
      cell.append(
        node("span", "", label),
        node("strong", "", Number(value).toFixed(2)),
      );
      scoreGrid.append(cell);
    }
    card.append(scoreGrid);
    appendTraceList(card, "Assumptions", candidate.assumptions);
    appendTraceList(card, "Predicted risks", candidate.risks);
    appendTraceList(card, "Verifier warnings", candidate.warnings);
    if (candidate.next_step) {
      card.append(node("div", "next-step", `Available next step: ${candidate.next_step}`));
    }
    elements.inspectorContent.append(card);
  }
  elements.inspector.classList.add("open");
  elements.inspector.setAttribute("aria-hidden", "false");
  elements.inspectorScrim.classList.add("open");
}

function appendTraceList(parent, title, items) {
  if (!items?.length) return;
  const section = node("div", "trace-section");
  section.append(node("strong", "", title));
  const list = node("ul");
  for (const item of items) list.append(node("li", "", item));
  section.append(list);
  parent.append(section);
}

function closeInspector() {
  elements.inspector.classList.remove("open");
  elements.inspector.setAttribute("aria-hidden", "true");
  elements.inspectorScrim.classList.remove("open");
}

async function refreshApprovals() {
  try {
    const payload = await api("/api/approvals?status=pending");
    renderApprovalStack(payload.approvals);
    elements.approvalCount.textContent = String(payload.approvals.length);
    if (appState.openPanel === "approvals") renderApprovalsPanel(payload.approvals);
  } catch {
    // Status rendering should not fail because a secondary panel failed.
  }
}

function renderApprovalStack(approvals) {
  elements.approvalStack.replaceChildren();
  for (const approval of approvals.slice(0, 2)) {
    const card = node("section", "approval-card");
    const copy = node("div");
    copy.append(
      node("strong", "", `${approval.tool_name} needs approval`),
      node("code", "", JSON.stringify(approval.arguments)),
      node("small", "", `Expires ${new Date(approval.expires_at).toLocaleTimeString()}`),
    );
    const actions = node("div", "approval-actions");
    actions.append(
      actionButton("Deny", "secondary", () => resolveApproval(approval.id, "deny")),
      actionButton("Approve once", "primary", () =>
        resolveApproval(approval.id, "approve"),
      ),
    );
    card.append(copy, actions);
    elements.approvalStack.append(card);
  }
}

function actionButton(label, style, handler) {
  const button = node("button", `panel-button ${style}`, label);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

async function resolveApproval(id, action) {
  try {
    const result = await api(`/api/approvals/${encodeURIComponent(id)}/${action}`, {
      method: "POST",
      body: "{}",
    });
    showToast(
      action === "approve"
        ? result.result?.success
          ? "Approved and executed exactly once."
          : `Approved, but execution failed: ${result.result?.error || "unknown error"}`
        : "Tool call denied. No change was made.",
    );
    await refreshApprovals();
  } catch (error) {
    showToast(error.message);
  }
}

async function openWorkbench(panel) {
  appState.openPanel = panel;
  elements.workbenchTitle.textContent =
    panel.charAt(0).toUpperCase() + panel.slice(1);
  elements.workbenchContent.replaceChildren(node("p", "panel-loading", "Loading…"));
  elements.workbenchPanel.classList.add("open");
  elements.workbenchPanel.setAttribute("aria-hidden", "false");
  elements.workbenchScrim.classList.add("open");
  closeSidebar();
  try {
    if (panel === "settings") await renderSettingsPanel();
    if (panel === "memories") await renderMemoriesPanel();
    if (panel === "backups") await renderBackupsPanel();
    if (panel === "approvals") {
      const payload = await api("/api/approvals");
      renderApprovalsPanel(payload.approvals);
    }
  } catch (error) {
    elements.workbenchContent.replaceChildren(
      node("p", "panel-notice warning", error.message),
    );
  }
}

function closeWorkbench() {
  appState.openPanel = null;
  elements.workbenchPanel.classList.remove("open");
  elements.workbenchPanel.setAttribute("aria-hidden", "true");
  elements.workbenchScrim.classList.remove("open");
}

async function renderSettingsPanel() {
  const settings = await api("/api/settings");
  const form = node("form", "settings-form");
  form.innerHTML = `
    <label>Local model<input name="model" value="${escapeAttribute(settings.model)}"></label>
    <label>Ollama URL<input name="ollama_url" value="${escapeAttribute(settings.ollama_url)}"></label>
    <label class="wide">Selected workspace
      <input name="workspace_path" placeholder="/Users/you/Projects/workspace" value="${escapeAttribute(settings.workspace_path)}">
      <small>File tools cannot access anything outside this folder.</small>
    </label>
    <label class="toggle wide"><input type="checkbox" name="shell_enabled" ${settings.shell_enabled ? "checked" : ""}>
      <span>Enable shell proposals (every exact command still requires approval)</span>
    </label>
    <label>Replay idle minutes<input type="number" min="1" max="120" name="replay_idle_minutes" value="${settings.replay_idle_minutes}"></label>
    <label>Backup retention<input type="number" min="1" max="30" name="backup_retention" value="${settings.backup_retention}"></label>
  `;
  const actions = node("div", "panel-actions wide");
  actions.append(actionButton("Save settings", "primary", () => form.requestSubmit()));
  form.append(actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          model: data.get("model"),
          ollama_url: data.get("ollama_url"),
          workspace_path: data.get("workspace_path"),
          shell_enabled: data.get("shell_enabled") === "on",
          replay_idle_minutes: Number(data.get("replay_idle_minutes")),
          backup_retention: Number(data.get("backup_retention")),
        }),
      });
      showToast("Settings saved.");
      renderStatus(await api("/api/status"));
    } catch (error) {
      showToast(error.message);
    }
  });
  elements.workbenchContent.replaceChildren(
    node(
      "p",
      "panel-notice",
      "Everything stays local. Qwen proposes; deterministic verification, scoring, and permissions decide.",
    ),
    form,
  );
}

async function renderMemoriesPanel(query = "", kind = "") {
  const payload = await api(
    `/api/memories?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}`,
  );
  const controls = node("div", "panel-search");
  const input = node("input");
  input.placeholder = "Search episodic, semantic, and procedural memory";
  input.value = query;
  const select = node("select");
  for (const [value, label] of [
    ["", "All types"],
    ["episodic", "Episodic"],
    ["semantic", "Semantic"],
    ["procedural", "Procedural"],
  ]) {
    const option = node("option", "", label);
    option.value = value;
    option.selected = value === kind;
    select.append(option);
  }
  select.addEventListener("change", () => renderMemoriesPanel(input.value, select.value));
  controls.append(
    input,
    select,
    actionButton("Search", "secondary", () =>
      renderMemoriesPanel(input.value, select.value),
    ),
  );
  const list = node("div", "record-list");
  if (!payload.memories.length) list.append(node("p", "empty-panel", "No matching memories."));
  for (const memory of payload.memories) {
    const card = node("article", "record-card");
    const head = node("div", "record-head");
    head.append(
      node("span", "record-kind", memory.kind),
      node("time", "", new Date(memory.timestamp).toLocaleString()),
    );
    card.append(head, node("p", "", memory.content));
    const provenance = node("details");
    provenance.append(
      node("summary", "", "Provenance & metadata"),
      node("pre", "", JSON.stringify({
        id: memory.id,
        tags: memory.tags,
        source_episode_ids: memory.source_episode_ids,
        metadata: memory.metadata,
      }, null, 2)),
    );
    card.append(provenance);
    const actions = node("div", "record-actions");
    actions.append(
      actionButton(
        memory.metadata?.pinned ? "Unpin" : "Pin",
        "secondary",
        async () => {
          await api(`/api/memories/${encodeURIComponent(memory.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ pinned: !memory.metadata?.pinned }),
          });
          renderMemoriesPanel(input.value, select.value);
        },
      ),
      actionButton("Delete…", "danger", async () => {
        if (!confirm("Permanently delete this memory? This cannot be undone.")) return;
        await api(`/api/memories/${encodeURIComponent(memory.id)}`, {
          method: "DELETE",
        });
        renderMemoriesPanel(input.value, select.value);
      }),
    );
    card.append(actions);
    list.append(card);
  }
  elements.workbenchContent.replaceChildren(controls, list);
}

async function renderBackupsPanel() {
  const payload = await api("/api/backups");
  const actions = node("div", "panel-actions");
  actions.append(
    actionButton("Create backup now", "primary", async () => {
      await api("/api/backups", { method: "POST", body: "{}" });
      showToast("Backup created.");
      renderBackupsPanel();
    }),
    actionButton("Run replay now", "secondary", async () => {
      const result = await api("/api/maintenance/run", { method: "POST", body: "{}" });
      showToast(result.ran ? "Replay and backup maintenance completed." : result.reason);
    }),
    actionButton("Open JSON export", "secondary", () => {
      window.open("/api/backups/export", "_blank", "noopener");
    }),
  );
  const list = node("div", "record-list");
  if (!payload.backups.length) list.append(node("p", "empty-panel", "No backups yet."));
  for (const backup of payload.backups) {
    const card = node("article", "record-card");
    card.append(
      node("strong", "", backup.id),
      node("p", "", `${backup.reason || "snapshot"} · ${new Date(backup.created_at).toLocaleString()}`),
    );
    card.append(actionButton("Restore…", "danger", async () => {
      if (!confirm("Restore this backup? A safety backup will be created first.")) return;
      await api(`/api/backups/${encodeURIComponent(backup.id)}/restore`, {
        method: "POST",
        body: "{}",
      });
      showToast("Backup restored and runtime reloaded.");
      renderStatus(await api("/api/status"));
    }));
    list.append(card);
  }
  elements.workbenchContent.replaceChildren(
    node("p", "panel-notice", "Daily snapshots rotate automatically while the app runs. Restore always creates a safety snapshot first."),
    actions,
    list,
  );
}

function renderApprovalsPanel(approvals) {
  const list = node("div", "record-list");
  if (!approvals.length) list.append(node("p", "empty-panel", "No approval requests."));
  for (const approval of approvals) {
    const card = node("article", "record-card");
    card.append(
      node("span", `record-kind ${approval.status}`, approval.status),
      node("h3", "", approval.tool_name),
      node("p", "", approval.rationale),
      node("pre", "", JSON.stringify(approval.arguments, null, 2)),
      node("small", "", `Risk: ${approval.risk} · Expires: ${new Date(approval.expires_at).toLocaleString()}`),
    );
    if (approval.status === "pending") {
      const actions = node("div", "record-actions");
      actions.append(
        actionButton("Deny", "secondary", () => resolveApproval(approval.id, "deny")),
        actionButton("Approve exact call once", "primary", () =>
          resolveApproval(approval.id, "approve"),
        ),
      );
      card.append(actions);
    }
    list.append(card);
  }
  elements.workbenchContent.replaceChildren(
    node("p", "panel-notice warning", "Approvals expire after 10 minutes and can be used only once. The displayed arguments cannot be changed."),
    list,
  );
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function setBusy(busy) {
  appState.busy = busy;
  elements.thinkingRow.hidden = !busy;
  elements.phaseStatus.textContent = "Routing intent…";
  elements.messageInput.disabled = busy;
  updateSendButton();
  if (busy) requestAnimationFrame(scrollToBottom);
}

function updateSendButton() {
  elements.sendButton.disabled = appState.busy || !elements.messageInput.value.trim();
}

function scrollToBottom() {
  elements.chatRegion.scrollTop = elements.chatRegion.scrollHeight;
}

function openSidebar() {
  elements.sidebar.classList.add("open");
  elements.sidebarScrim.classList.add("open");
}

function closeSidebar() {
  elements.sidebar.classList.remove("open");
  elements.sidebarScrim.classList.remove("open");
}

async function newChat() {
  if (appState.busy) return;
  try {
    renderStatus(await api("/api/conversations", { method: "POST", body: "{}" }));
    closeSidebar();
    elements.messageInput.focus();
  } catch (error) {
    showToast(error.message);
  }
}

async function selectConversation(conversationId) {
  if (appState.busy) return;
  try {
    renderStatus(
      await api("/api/conversations/select", {
        method: "POST",
        body: JSON.stringify({ conversation_id: conversationId }),
      }),
    );
    closeSidebar();
  } catch (error) {
    showToast(error.message);
  }
}

elements.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(elements.messageInput.value);
});
elements.messageInput.addEventListener("input", updateSendButton);
elements.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});
elements.intentChips.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  appState.mode = button.dataset.mode;
  for (const chip of elements.intentChips.querySelectorAll("button")) {
    chip.classList.toggle("active", chip === button);
  }
});
elements.newChat.addEventListener("click", newChat);
elements.conversationList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-conversation-id]");
  if (button) selectConversation(button.dataset.conversationId);
});
document.querySelectorAll("[data-panel]").forEach((button) => {
  button.addEventListener("click", () => openWorkbench(button.dataset.panel));
});
document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});
elements.inspectorClose.addEventListener("click", closeInspector);
elements.inspectorScrim.addEventListener("click", closeInspector);
elements.workbenchClose.addEventListener("click", closeWorkbench);
elements.workbenchScrim.addEventListener("click", closeWorkbench);
elements.menuButton.addEventListener("click", openSidebar);
elements.sidebarClose.addEventListener("click", closeSidebar);
elements.sidebarScrim.addEventListener("click", closeSidebar);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeInspector();
    closeWorkbench();
    closeSidebar();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    newChat();
  }
});

api("/api/status")
  .then(renderStatus)
  .catch((error) => {
    showToast(error.message);
    elements.modelBadge.textContent = "Workbench offline";
    elements.modelBadge.classList.add("model-offline");
    elements.modelNotice.hidden = false;
    elements.modelNoticeTitle.textContent = "Local server unavailable";
    elements.modelNoticeDetail.textContent = error.message;
  });
