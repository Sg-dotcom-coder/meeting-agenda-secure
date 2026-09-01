(() => {
  const SUPABASE_URL = "https://wlftsodmwfdhixwlsojo.supabase.co";
  const SUPABASE_KEY = "sb_publishable_rgjg1TjQkY7NuQmGrpOSqQ_Pjs4-zJY";
  const SUMMARY_KEY = "__meetingSummary";
  let activeMeeting = null;
  let activeSignature = null;
  let saveTimer = null;
  let lastSavedValue = null;
  let isSaving = false;
  let pendingValue = null;

  const style = document.createElement("style");
  style.textContent = `
    .meeting-summary-editor {
      margin-top: 24px;
      padding: 24px;
      border: 1px solid rgba(20, 48, 78, .14);
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(235, 245, 255, .95), rgba(255, 255, 255, .98));
      box-shadow: 0 10px 30px rgba(20, 48, 78, .07);
    }
    .meeting-summary-editor .eyebrow {
      margin: 0 0 4px;
      color: #4381b8;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .14em;
    }
    .meeting-summary-editor h3 { margin: 0 0 6px; font-size: 20px; }
    .meeting-summary-editor p { margin: 0 0 14px; color: #6b7785; font-size: 13px; }
    .meeting-summary-editor textarea {
      width: 100%;
      min-height: 150px;
      resize: vertical;
      box-sizing: border-box;
      border: 1px solid rgba(20, 48, 78, .16);
      border-radius: 12px;
      padding: 14px 16px;
      background: #fff;
      color: inherit;
      font: inherit;
      line-height: 1.7;
    }
    .meeting-summary-editor textarea:focus {
      outline: 2px solid rgba(67, 129, 184, .2);
      border-color: #4381b8;
    }
    .meeting-summary-status { display: block; min-height: 18px; margin-top: 8px; color: #6b7785; font-size: 12px; }
    @media (max-width: 720px) { .meeting-summary-editor { padding: 18px; } }
  `;
  document.head.appendChild(style);

  function accessToken() {
    const exactKey = "sb-wlftsodmwfdhixwlsojo-auth-token";
    const candidateKeys = [
      exactKey,
      ...Object.keys(localStorage).filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))
    ];

    for (const key of candidateKeys) {
      try {
        const session = JSON.parse(localStorage.getItem(key) || "null");
        if (session?.access_token) return session.access_token;
      } catch {
        // Ignore unrelated or stale local-storage entries.
      }
    }
    return null;
  }

  async function request(path, options = {}) {
    const token = accessToken();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token || SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function currentMeetingMeta() {
    const title = document.querySelector('input[aria-label="会議名"]')?.value?.trim();
    const date = document.querySelector('input[type="date"]')?.value;
    return title && date ? { title, date } : null;
  }

  async function resolveMeeting() {
    const meta = currentMeetingMeta();
    if (!meta) return null;
    const title = encodeURIComponent(meta.title);
    const date = encodeURIComponent(meta.date);
    const rows = await request(`meetings?select=id,title,date,participant_notes&title=eq.${title}&date=eq.${date}&order=created_at.desc&limit=1`);
    return rows?.[0] || null;
  }

  async function saveSummary(value, status) {
    pendingValue = value;
    if (isSaving) return;
    isSaving = true;
    while (pendingValue !== null) {
      const nextValue = pendingValue;
      pendingValue = null;
      if (nextValue === lastSavedValue) continue;
      status.textContent = "保存中…";
      try {
        // Resolve again at save time so a quick meeting switch never writes
        // the summary into the previously selected meeting.
        activeMeeting = await resolveMeeting();
        if (!activeMeeting) throw new Error("Active meeting was not found");
        const rows = await request(`meetings?select=participant_notes&id=eq.${encodeURIComponent(activeMeeting.id)}&limit=1`);
        const participantNotes = rows?.[0]?.participant_notes || {};
        participantNotes[SUMMARY_KEY] = { share: nextValue };
        await request(`meetings?id=eq.${encodeURIComponent(activeMeeting.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ participant_notes: participantNotes, updated_at: new Date().toISOString() })
        });
        lastSavedValue = nextValue;
        status.textContent = "✓ 保存済み";
      } catch (error) {
        console.error("meeting summary save failed", error);
        status.textContent = "保存できませんでした";
      }
    }
    isSaving = false;
  }

  async function mount() {
    const agendaList = document.querySelector(".agenda-list");
    if (!agendaList) return;

    const meta = currentMeetingMeta();
    const signature = meta ? `${meta.title}\u0000${meta.date}` : null;
    const existing = document.querySelector(".meeting-summary-editor");
    if (existing) {
      if (signature && signature !== activeSignature) {
        const textarea = existing.querySelector("textarea");
        const status = existing.querySelector(".meeting-summary-status");
        status.textContent = "読み込み中…";
        try {
          activeMeeting = await resolveMeeting();
          const value = activeMeeting?.participant_notes?.[SUMMARY_KEY]?.share || "";
          textarea.value = value;
          lastSavedValue = value;
          activeSignature = signature;
          status.textContent = "✓ 保存済み";
        } catch (error) {
          console.error("meeting summary reload failed", error);
          status.textContent = "読み込めませんでした";
        }
      }
      return;
    }

    const section = document.createElement("section");
    section.className = "meeting-summary-editor";
    section.innerHTML = `
      <p class="eyebrow">MEETING SUMMARY</p>
      <h3>会議の要約</h3>
      <p>会議全体の結論や重要なポイントを、最後にまとめて残せます。</p>
      <textarea aria-label="会議の要約" placeholder="会議全体の要約を入力"></textarea>
      <small class="meeting-summary-status"></small>
    `;
    agendaList.insertAdjacentElement("afterend", section);

    const textarea = section.querySelector("textarea");
    const status = section.querySelector(".meeting-summary-status");
    status.textContent = "読み込み中…";

    try {
      activeMeeting = await resolveMeeting();
      const value = activeMeeting?.participant_notes?.[SUMMARY_KEY]?.share || "";
      textarea.value = value;
      lastSavedValue = value;
      activeSignature = signature;
      status.textContent = "✓ 保存済み";
    } catch (error) {
      console.error("meeting summary load failed", error);
      status.textContent = "読み込めませんでした";
    }

    textarea.addEventListener("input", () => {
      status.textContent = "未保存";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveSummary(textarea.value, status), 700);
    });

    const saveState = document.querySelector(".save-state");
    if (saveState) {
      new MutationObserver(() => {
        if (saveState.textContent.includes("保存済み") && textarea.value) {
          lastSavedValue = null;
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => saveSummary(textarea.value, status), 250);
        }
      }).observe(saveState, { childList: true, subtree: true, characterData: true });
    }
  }

  new MutationObserver(() => {
    if (!document.querySelector(".agenda-list")) {
      activeMeeting = null;
      activeSignature = null;
      lastSavedValue = null;
    }
    mount();
  }).observe(document.body, { childList: true, subtree: true });

  mount();
  setInterval(mount, 1000);
})();
