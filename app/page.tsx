"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { publicSupabase, supabase } from "@/lib/supabase";
import { MeetingAiResult, MeetingAiWorkspace } from "@/app/components/MeetingAiWorkspace";
import { WorkspaceAssistant } from "@/app/components/WorkspaceAssistant";

type WorkspacePage = "agenda" | "schedule" | "report" | "tasks" | "redmine";
type SaveState = "saved" | "saving" | "error";

type MeetingTask = {
  text: string;
  owner: string;
  due: string;
  workTaskId?: number;
};

type Agenda = {
  title: string;
  decideTarget: string;
  note: string;
  decision: string;
  continueThinking: string;
  tasks: MeetingTask[];
};

type Meeting = {
  id: string;
  title: string;
  date: string;
  time: string;
  participants: string;
  agendas: Agenda[];
  participantNotes: Record<string, Record<string, string>>;
  summary: string;
};

type WorkTask = {
  id: number;
  title: string;
  category: string;
  assignee: string;
  status: "未着手" | "作業中" | "確認中" | "完了";
  priority: "高" | "中" | "低";
  due_date: string | null;
  shooting_date: string | null;
  related_url: string;
  notes: string;
  sort_order: number;
  source_meeting_id: string | null;
  source_label: string;
  created_at: string;
  updated_at: string;
};

type WorkRecordKind = "schedule" | "report";

type WorkRecord = {
  id: string;
  kind: WorkRecordKind;
  person: string;
  work_date: string;
  title: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type TimeEntry = {
  id: string;
  start: string;
  end: string;
  category: string;
  detail: string;
};

type SchedulePayload = {
  tasks: string;
  items: TimeEntry[];
  priorities: string;
  dailyGoal: string;
  weeklyGoal: string;
};

type ReportPayload = {
  entries: TimeEntry[];
  reportContent: string;
  consultationContent: string;
  reflection: string;
  improvements: string;
  nextFocus: string;
  nextWorkDate: string;
  nextSchedule: string;
  undatedTasks: string;
  other: string;
};

const navItems: { key: WorkspacePage; label: string; eyebrow: string }[] = [
  { key: "agenda", label: "会議アジェンダ", eyebrow: "MEETING WORKSPACE" },
  { key: "schedule", label: "業務予定", eyebrow: "WORK SCHEDULE" },
  { key: "report", label: "日報", eyebrow: "DAILY REPORT" },
  { key: "tasks", label: "タスク管理", eyebrow: "TASK MANAGEMENT" },
  { key: "redmine", label: "Redmine文章", eyebrow: "REDMINE TEXT MAKER" },
];

const people = ["羽賀", "佐藤", "安田"];
const emptyAgenda = (): Agenda => ({
  title: "",
  decideTarget: "",
  note: "",
  decision: "",
  continueThinking: "",
  tasks: [],
});

function normalizeAgenda(value: unknown): Agenda {
  const raw = (value ?? {}) as Partial<Agenda>;
  return {
    title: typeof raw.title === "string" ? raw.title : "",
    decideTarget: typeof raw.decideTarget === "string" ? raw.decideTarget : "",
    note: typeof raw.note === "string" ? raw.note : "",
    decision: typeof raw.decision === "string" ? raw.decision : "",
    continueThinking: typeof raw.continueThinking === "string" ? raw.continueThinking : "",
    tasks: Array.isArray(raw.tasks)
      ? raw.tasks.map((task) => ({
          text: typeof task?.text === "string" ? task.text : "",
          owner: typeof task?.owner === "string" ? task.owner : "",
          due: typeof task?.due === "string" ? task.due : "",
          ...(Number.isFinite(task?.workTaskId) ? { workTaskId: task.workTaskId } : {}),
        }))
      : [],
  };
}

function normalizeMeeting(row: Record<string, unknown>): Meeting {
  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    date: typeof row.date === "string" ? row.date : "",
    time: typeof row.time === "string" ? row.time : "",
    participants: typeof row.participants === "string" ? row.participants : "",
    agendas: Array.isArray(row.agendas) ? row.agendas.map(normalizeAgenda) : [],
    participantNotes:
      row.participant_notes && typeof row.participant_notes === "object"
        ? (row.participant_notes as Record<string, Record<string, string>>)
        : {},
    summary: typeof row.summary === "string" ? row.summary : "",
  };
}

function initialPage(): WorkspacePage {
  if (typeof window === "undefined") return "agenda";
  const page = new URLSearchParams(window.location.search).get("page");
  return navItems.some((item) => item.key === page) ? (page as WorkspacePage) : "agenda";
}

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function createEntry(): TimeEntry {
  return { id: crypto.randomUUID(), start: "09:00", end: "10:00", category: "", detail: "" };
}

function normalizeEntries(value: unknown): TimeEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const raw = (item ?? {}) as Partial<TimeEntry>;
    return {
      id: typeof raw.id === "string" ? raw.id : `legacy-${index}`,
      start: typeof raw.start === "string" ? raw.start : "",
      end: typeof raw.end === "string" ? raw.end : "",
      category: typeof raw.category === "string" ? raw.category : "",
      detail: typeof raw.detail === "string" ? raw.detail : typeof (raw as { content?: unknown }).content === "string" ? String((raw as { content: string }).content) : "",
    };
  });
}

function normalizeSchedule(value: Record<string, unknown> | undefined): SchedulePayload {
  return {
    tasks: typeof value?.tasks === "string" ? value.tasks : "",
    items: normalizeEntries(value?.items),
    priorities: typeof value?.priorities === "string" ? value.priorities : "",
    dailyGoal: typeof value?.dailyGoal === "string" ? value.dailyGoal : "",
    weeklyGoal: typeof value?.weeklyGoal === "string" ? value.weeklyGoal : "",
  };
}

function normalizeReport(value: Record<string, unknown> | undefined): ReportPayload {
  const text = (key: keyof ReportPayload) => typeof value?.[key] === "string" ? String(value[key]) : "";
  return {
    entries: normalizeEntries(value?.entries),
    reportContent: text("reportContent"),
    consultationContent: text("consultationContent"),
    reflection: text("reflection"),
    improvements: text("improvements"),
    nextFocus: text("nextFocus"),
    nextWorkDate: text("nextWorkDate"),
    nextSchedule: text("nextSchedule"),
    undatedTasks: text("undatedTasks"),
    other: text("other"),
  };
}

export default function Home() {
  const [page, setPage] = useState<WorkspacePage>("agenda");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [workRecords, setWorkRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [googleProviderToken, setGoogleProviderToken] = useState("");
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const recordSaveQueues = useRef<Map<string, Promise<void>>>(new Map());

  const selected = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedId) ?? meetings[0],
    [meetings, selectedId],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const [meetingResult, taskResult, recordResult] = await Promise.all([
      publicSupabase.from("meetings").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      publicSupabase.from("work_tasks").select("*").order("sort_order").order("created_at", { ascending: false }),
      publicSupabase.from("work_records").select("*").order("work_date", { ascending: false }).order("updated_at", { ascending: false }),
    ]);
    if (meetingResult.error || taskResult.error || recordResult.error) {
      setMessage("データを読み込めませんでした。ログイン状態または通信をご確認ください。");
      setSaveState("error");
    } else {
      const normalized = (meetingResult.data ?? []).map((row) => normalizeMeeting(row));
      setMeetings(normalized);
      setSelectedId((current) => normalized.some((item) => item.id === current) ? current : normalized[0]?.id ?? "");
      setTasks((taskResult.data ?? []) as WorkTask[]);
      setWorkRecords((recordResult.data ?? []) as WorkRecord[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setPage(initialPage());
    void loadAll();
    return () => timers.current.forEach(clearTimeout);
  }, [loadAll]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      const token = data.session?.provider_token || window.localStorage.getItem("google_tasks_provider_token") || "";
      setGoogleProviderToken(token);
    };
    void restore();
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession?.provider_token) {
        window.localStorage.setItem("google_tasks_provider_token", nextSession.provider_token);
        setGoogleProviderToken(nextSession.provider_token);
      }
      if (event === "SIGNED_OUT") {
        window.localStorage.removeItem("google_tasks_provider_token");
        setGoogleProviderToken("");
      }
      setConnectingGoogle(false);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  async function connectGoogle() {
    setConnectingGoogle(true);
    setMessage("");
    const redirect = new URL(window.location.href);
    redirect.searchParams.set("page", page);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/tasks",
        redirectTo: redirect.toString(),
        queryParams: { access_type: "offline", include_granted_scopes: "true", prompt: "consent" },
      },
    });
    if (error) {
      setConnectingGoogle(false);
      setMessage("Google接続を開始できませんでした。");
    }
  }

  async function disconnectGoogle() {
    await supabase.auth.signOut();
  }

  function switchPage(nextPage: WorkspacePage) {
    setPage(nextPage);
    const url = new URL(window.location.href);
    url.searchParams.set("page", nextPage);
    window.history.replaceState(null, "", url);
  }

  async function persistMeeting(meeting: Meeting) {
    setSaveState("saving");
    const { error } = await supabase
      .from("meetings")
      .update({
        title: meeting.title.trim(),
        date: meeting.date,
        time: meeting.time,
        participants: meeting.participants,
        agendas: meeting.agendas,
        participant_notes: meeting.participantNotes,
        summary: meeting.summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", meeting.id);

    if (error) {
      setSaveState("error");
      setMessage("変更を保存できませんでした。");
      return;
    }

    const linkedTasks = meeting.agendas.flatMap((agenda) => agenda.tasks);
    const results = await Promise.all(
      linkedTasks
        .filter((task) => Number.isFinite(task.workTaskId))
        .map((task) =>
          supabase
            .from("work_tasks")
            .update({
              title: task.text.trim(),
              assignee: people.includes(task.owner) ? task.owner : "",
              due_date: task.due || null,
              source_label: meeting.title.trim(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", task.workTaskId!),
        ),
    );

    if (results.some((result) => result.error)) {
      setSaveState("error");
      setMessage("会議は保存されましたが、一部のToDo連携を更新できませんでした。");
      return;
    }
    setTasks((current) => current.map((task) => {
      const linked = linkedTasks.find((item) => item.workTaskId === task.id);
      return linked
        ? { ...task, title: linked.text, assignee: people.includes(linked.owner) ? linked.owner : "", due_date: linked.due || null, source_label: meeting.title }
        : task;
    }));
    setMessage("");
    setSaveState("saved");
  }

  function updateMeeting(transform: (meeting: Meeting) => Meeting) {
    if (!selected) return;
    const nextMeeting = transform(selected);
    setMeetings((current) => current.map((meeting) => meeting.id === selected.id ? nextMeeting : meeting));
    setSaveState("saving");
    const existing = timers.current.get(selected.id);
    if (existing) clearTimeout(existing);
    timers.current.set(selected.id, setTimeout(() => {
      void persistMeeting(nextMeeting);
    }, 650));
  }

  async function createMeeting(input: { title: string; date: string; time: string; participants: string }) {
    setSaveState("saving");
    const { data, error } = await supabase
      .from("meetings")
      .insert({ ...input, agendas: [emptyAgenda()], participant_notes: {}, summary: "" })
      .select("*")
      .single();
    if (error || !data) {
      setMessage("会議を作成できませんでした。");
      setSaveState("error");
      return;
    }
    const meeting = normalizeMeeting(data);
    setMeetings((current) => [meeting, ...current]);
    setSelectedId(meeting.id);
    setNewMeetingOpen(false);
    setSaveState("saved");
  }

  async function addAgendaTask(agendaIndex: number, draft: MeetingTask) {
    if (!selected || !draft.text.trim()) return;
    setSaveState("saving");
    const agenda = selected.agendas[agendaIndex];
    const { data, error } = await supabase
      .from("work_tasks")
      .insert({
        title: draft.text.trim(),
        category: "その他",
        assignee: people.includes(draft.owner) ? draft.owner : "",
        status: "未着手",
        priority: "中",
        due_date: draft.due || null,
        source_meeting_id: selected.id,
        source_label: selected.title,
        notes: agenda.title ? `会議アジェンダ: ${agenda.title}` : "会議アジェンダ",
      })
      .select("*")
      .single();
    if (error || !data) {
      setMessage("ToDoをタスク管理へ追加できませんでした。");
      setSaveState("error");
      return;
    }
    const linked = { ...draft, text: draft.text.trim(), workTaskId: Number(data.id) };
    setTasks((current) => [data as WorkTask, ...current]);
    updateMeeting((meeting) => ({
      ...meeting,
      agendas: meeting.agendas.map((item, index) => index === agendaIndex ? { ...item, tasks: [...item.tasks, linked] } : item),
    }));
  }

  async function removeAgendaTask(agendaIndex: number, taskIndex: number) {
    if (!selected) return;
    const task = selected.agendas[agendaIndex].tasks[taskIndex];
    if (task.workTaskId) {
      const { error } = await supabase.from("work_tasks").delete().eq("id", task.workTaskId);
      if (error) {
        setMessage("ToDoを削除できませんでした。");
        return;
      }
      setTasks((current) => current.filter((item) => item.id !== task.workTaskId));
    }
    updateMeeting((meeting) => ({
      ...meeting,
      agendas: meeting.agendas.map((agenda, index) => index === agendaIndex
        ? { ...agenda, tasks: agenda.tasks.filter((_, index) => index !== taskIndex) }
        : agenda),
    }));
  }

  async function applyMeetingAi(result: MeetingAiResult) {
    if (!selected) return;
    setSaveState("saving");
    const existingTexts = new Set(selected.agendas.flatMap((agenda) => agenda.tasks.map((task) => task.text.trim().toLowerCase())).filter(Boolean));
    const created = new Map<string, MeetingTask>();
    const seenAiTasks = new Set<string>();
    const pending = result.agendas.flatMap((agenda, agendaIndex) => agenda.tasks.map((task, taskIndex) => ({ agenda, agendaIndex, task, taskIndex })))
      .filter(({ task }) => {
        const key = task.text.trim().toLowerCase();
        if (!key || existingTexts.has(key) || seenAiTasks.has(key)) return false;
        seenAiTasks.add(key);
        return true;
      });

    const inserts = await Promise.all(pending.map(async ({ agenda, agendaIndex, task, taskIndex }) => {
      const { data, error } = await supabase.from("work_tasks").insert({
        title: task.text.trim(),
        category: "その他",
        assignee: people.includes(task.owner) ? task.owner : "",
        status: "未着手",
        priority: "中",
        due_date: task.due || null,
        source_meeting_id: selected.id,
        source_label: selected.title,
        notes: agenda.title ? `AI議事録: ${agenda.title}` : "AI議事録",
      }).select("*").single();
      return { key: `${agendaIndex}:${taskIndex}`, data: data as WorkTask | null, error };
    }));

    if (inserts.some((item) => item.error || !item.data)) {
      const insertedIds = inserts.flatMap((item) => item.data ? [item.data.id] : []);
      if (insertedIds.length) await supabase.from("work_tasks").delete().in("id", insertedIds);
      setSaveState("error");
      setMessage("AI議事録のToDoをタスク管理へ連携できませんでした。");
      return;
    }
    inserts.forEach((item) => {
      if (item.data) created.set(item.key, { text: item.data.title, owner: item.data.assignee, due: item.data.due_date ?? "", workTaskId: item.data.id });
    });
    setTasks((current) => [...inserts.flatMap((item) => item.data ? [item.data] : []), ...current]);

    const used = new Set<number>();
    const merged = selected.agendas.map((agenda) => {
      const index = result.agendas.findIndex((candidate, candidateIndex) => !used.has(candidateIndex) && candidate.title.trim().toLowerCase() === agenda.title.trim().toLowerCase());
      if (index < 0) return agenda;
      used.add(index);
      const draft = result.agendas[index];
      const additions = draft.tasks.flatMap((task, taskIndex) => {
        if (existingTexts.has(task.text.trim().toLowerCase())) return [];
        const linked = created.get(`${index}:${taskIndex}`);
        return linked ? [linked] : [];
      });
      return {
        ...agenda,
        title: agenda.title.trim() ? agenda.title : draft.title,
        decideTarget: agenda.decideTarget.trim() ? agenda.decideTarget : draft.decideTarget,
        note: agenda.note.trim() ? `${agenda.note}\n\n${draft.note}`.trim() : draft.note,
        decision: agenda.decision.trim() ? agenda.decision : draft.decision,
        continueThinking: agenda.continueThinking.trim() ? agenda.continueThinking : draft.continueThinking,
        tasks: [...agenda.tasks, ...additions],
      };
    });
    result.agendas.forEach((agenda, agendaIndex) => {
      if (used.has(agendaIndex)) return;
      merged.push({ ...agenda, tasks: agenda.tasks.flatMap((_, taskIndex) => {
        const linked = created.get(`${agendaIndex}:${taskIndex}`);
        return linked ? [linked] : [];
      }) });
    });
    const nextMeeting = { ...selected, agendas: merged, summary: result.summary || selected.summary };
    setMeetings((current) => current.map((meeting) => meeting.id === nextMeeting.id ? nextMeeting : meeting));
    await persistMeeting(nextMeeting);
  }

  async function updateWorkTask(id: number, patch: Partial<WorkTask>) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
    setSaveState("saving");
    const { error } = await supabase.from("work_tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      setSaveState("error");
      setMessage("タスクを保存できませんでした。");
      await loadAll();
    } else {
      const linkedTask = tasks.find((task) => task.id === id);
      if (linkedTask?.source_meeting_id && (patch.title !== undefined || patch.assignee !== undefined || patch.due_date !== undefined)) {
        const linkedMeeting = meetings.find((meeting) => meeting.id === linkedTask.source_meeting_id);
        if (linkedMeeting) {
          const updatedMeeting = {
            ...linkedMeeting,
            agendas: linkedMeeting.agendas.map((agenda) => ({
              ...agenda,
              tasks: agenda.tasks.map((task) => task.workTaskId === id ? {
                ...task,
                ...(patch.title !== undefined ? { text: patch.title } : {}),
                ...(patch.assignee !== undefined ? { owner: patch.assignee } : {}),
                ...(patch.due_date !== undefined ? { due: patch.due_date ?? "" } : {}),
              } : task),
            })),
          };
          const meetingResult = await supabase.from("meetings").update({ agendas: updatedMeeting.agendas, updated_at: new Date().toISOString() }).eq("id", updatedMeeting.id);
          if (meetingResult.error) {
            setSaveState("error");
            setMessage("タスクは保存されましたが、会議ToDoへ反映できませんでした。");
            return;
          }
          setMeetings((current) => current.map((meeting) => meeting.id === updatedMeeting.id ? updatedMeeting : meeting));
        }
      }
      setSaveState("saved");
    }
  }

  function saveWorkRecord(kind: WorkRecordKind, person: string, workDate: string, payload: Record<string, unknown>) {
    const key = `${kind}:${person}:${workDate}`;
    setSaveState("saving");
    const previous = recordSaveQueues.current.get(key) ?? Promise.resolve();
    const next = previous.then(async () => {
      const { data: existing, error: lookupError } = await supabase
        .from("work_records")
        .select("id")
        .eq("kind", kind)
        .eq("person", person)
        .eq("work_date", workDate)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lookupError) throw lookupError;
      const values = { kind, person, work_date: workDate, title: kind === "schedule" ? "業務予定" : "日報", payload, updated_at: new Date().toISOString() };
      const result = existing?.id
        ? await supabase.from("work_records").update(values).eq("id", existing.id).select("*").single()
        : await supabase.from("work_records").insert(values).select("*").single();
      if (result.error || !result.data) throw result.error ?? new Error("保存結果がありません");
      const saved = result.data as WorkRecord;
      setWorkRecords((current) => [saved, ...current.filter((record) => record.id !== saved.id)]);
      setMessage("");
      setSaveState("saved");
    }).catch(() => {
      setSaveState("error");
      setMessage("業務記録を保存できませんでした。");
    }).finally(() => {
      if (recordSaveQueues.current.get(key) === next) recordSaveQueues.current.delete(key);
    });
    recordSaveQueues.current.set(key, next);
    return next;
  }

  async function deleteWorkRecord(id: string) {
    setSaveState("saving");
    const { error } = await supabase.from("work_records").delete().eq("id", id);
    if (error) {
      setSaveState("error");
      setMessage("業務記録を削除できませんでした。");
      return;
    }
    setWorkRecords((current) => current.filter((record) => record.id !== id));
    setSaveState("saved");
  }

  async function addToGoogleTasks(task: WorkTask) {
    if (!session || !googleProviderToken) {
      await connectGoogle();
      return false;
    }
    const response = await fetch("/api/google-tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ providerToken: googleProviderToken, title: task.title, notes: [task.notes, task.source_label ? `元データ: ${task.source_label}` : ""].filter(Boolean).join("\n"), due: task.due_date }),
    });
    const result = await response.json() as { id?: string; error?: string };
    if (!response.ok || !result.id) {
      setMessage(result.error || "Google Tasksへ追加できませんでした。");
      return false;
    }
    const notes = `${task.notes}${task.notes ? "\n" : ""}[google-task:${result.id}]`;
    await updateWorkTask(task.id, { notes });
    return true;
  }

  const nav = navItems.find((item) => item.key === page) ?? navItems[0];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div>
            <p className="eyebrow">{nav.eyebrow}</p>
            <h1>{nav.label}</h1>
          </div>
          <nav className="app-nav" aria-label="メインページ切り替え">
            {navItems.map((item) => (
              <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => switchPage(item.key)}>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="top-actions">
          <span className={`save-state ${saveState}`}>{saveState === "saving" ? "保存中…" : saveState === "error" ? "保存できませんでした" : "✓ 保存済み"}</span>
          {session ? <div className="google-session"><span>{session.user.email ?? "Google接続済み"}</span><button onClick={() => void disconnectGoogle()}>解除</button></div> : <button className="google-connect" disabled={connectingGoogle} onClick={() => void connectGoogle()}>{connectingGoogle ? "接続中…" : "G Google接続"}</button>}
          {page === "agenda" && <button className="primary-button" onClick={() => setNewMeetingOpen(true)}>＋ 新しい会議</button>}
        </div>
      </header>

      {message && <div className="global-message">{message}<button onClick={() => void loadAll()}>再読み込み</button></div>}

      {page === "agenda" && (
        <AgendaWorkspace
          meetings={meetings}
          selected={selected}
          selectedId={selectedId}
          loading={loading}
          onSelect={setSelectedId}
          onUpdate={updateMeeting}
          onAddTask={addAgendaTask}
          onRemoveTask={removeAgendaTask}
          onApplyAi={applyMeetingAi}
          isConnected={Boolean(session)}
          onConnect={connectGoogle}
        />
      )}

      {page === "tasks" && <TaskWorkspace tasks={tasks} loading={loading} onUpdate={updateWorkTask} onAddGoogle={addToGoogleTasks} isGoogleConnected={Boolean(session && googleProviderToken)} onConnectGoogle={connectGoogle} />}

      {page === "schedule" && <WorkRecordWorkspace kind="schedule" records={workRecords} loading={loading} onSave={saveWorkRecord} onDelete={deleteWorkRecord} />}
      {page === "report" && <WorkRecordWorkspace kind="report" records={workRecords} loading={loading} onSave={saveWorkRecord} onDelete={deleteWorkRecord} />}
      {page === "redmine" && <RedmineWorkspace />}

      <WorkspaceAssistant isConnected={Boolean(session)} onConnect={connectGoogle} context={{
        currentPage: page,
        selectedMeeting: selected ? { title: selected.title, date: selected.date, participants: selected.participants, summary: selected.summary, agendas: selected.agendas } : null,
        tasks: tasks.slice(0, 150).map(({ id, title, assignee, status, priority, due_date, category, source_label }) => ({ id, title, assignee, status, priority, due_date, category, source_label })),
        workRecords: workRecords.slice(0, 30),
      }} />

      {newMeetingOpen && <NewMeetingModal onClose={() => setNewMeetingOpen(false)} onSubmit={createMeeting} />}
    </main>
  );
}

function AgendaWorkspace({ meetings, selected, selectedId, loading, onSelect, onUpdate, onAddTask, onRemoveTask, onApplyAi, isConnected, onConnect }: {
  meetings: Meeting[];
  selected?: Meeting;
  selectedId: string;
  loading: boolean;
  onSelect: (id: string) => void;
  onUpdate: (transform: (meeting: Meeting) => Meeting) => void;
  onAddTask: (agendaIndex: number, task: MeetingTask) => Promise<void>;
  onRemoveTask: (agendaIndex: number, taskIndex: number) => Promise<void>;
  onApplyAi: (result: MeetingAiResult) => Promise<void>;
  isConnected: boolean;
  onConnect: () => Promise<void>;
}) {
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="section-heading"><span>会議一覧</span><strong>{meetings.length}</strong></div>
        <div className="meeting-list">
          {meetings.map((meeting) => (
            <button key={meeting.id} className={`meeting-card ${selectedId === meeting.id ? "active" : ""}`} onClick={() => onSelect(meeting.id)}>
              <small>{meeting.date.replaceAll("-", ".")}</small>
              <strong>{meeting.title}</strong>
              <span>{meeting.time || "時間未定"} ・ {meeting.agendas.length}件の議題</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="content">
        {loading && <div className="empty-state">読み込み中…</div>}
        {!loading && !selected && <div className="empty-state">会議を作成してください。</div>}
        {selected && (
          <>
            <div className="meeting-header">
              <div className="meeting-title-block">
                <span className="status-pill">会議メモ</span>
                <input aria-label="会議名" className="meeting-title" value={selected.title} onChange={(event) => onUpdate((meeting) => ({ ...meeting, title: event.target.value }))} />
                <div className="meeting-meta">
                  <label>日付 <input type="date" value={selected.date} onChange={(event) => onUpdate((meeting) => ({ ...meeting, date: event.target.value }))} /></label>
                  <label>時間 <input type="time" value={selected.time} onChange={(event) => onUpdate((meeting) => ({ ...meeting, time: event.target.value }))} /></label>
                </div>
              </div>
              <label className="participants"><span>参加者</span><input value={selected.participants} onChange={(event) => onUpdate((meeting) => ({ ...meeting, participants: event.target.value }))} /></label>
            </div>

            <div className="agenda-heading">
              <div><p className="eyebrow">AGENDA</p><h2>今回の議題</h2></div>
              <button className="secondary-button" onClick={() => onUpdate((meeting) => ({ ...meeting, agendas: [...meeting.agendas, emptyAgenda()] }))}>＋ 議題を追加</button>
            </div>

            <div className="agenda-list">
              {selected.agendas.map((agenda, agendaIndex) => (
                <AgendaCard
                  key={agendaIndex}
                  agenda={agenda}
                  index={agendaIndex}
                  onChange={(patch) => onUpdate((meeting) => ({
                    ...meeting,
                    agendas: meeting.agendas.map((item, index) => index === agendaIndex ? { ...item, ...patch } : item),
                  }))}
                  onAddTask={(task) => onAddTask(agendaIndex, task)}
                  onRemoveTask={(taskIndex) => onRemoveTask(agendaIndex, taskIndex)}
                />
              ))}
            </div>

            <section className="meeting-summary">
              <p className="eyebrow">MEETING SUMMARY</p>
              <h2>会議の要約</h2>
              <p>会議全体の結論や重要なポイントを、最後にまとめて残せます。</p>
              <textarea aria-label="会議の要約" value={selected.summary} placeholder="会議全体の要約を入力" onChange={(event) => onUpdate((meeting) => ({ ...meeting, summary: event.target.value }))} />
            </section>

            <MeetingAiWorkspace
              context={{ title: selected.title, participants: selected.participants, agendaTitles: selected.agendas.map((agenda) => agenda.title).filter(Boolean) }}
              onApply={onApplyAi}
              isConnected={isConnected}
              onConnect={onConnect}
            />
          </>
        )}
      </section>
    </div>
  );
}

function AgendaCard({ agenda, index, onChange, onAddTask, onRemoveTask }: {
  agenda: Agenda;
  index: number;
  onChange: (patch: Partial<Agenda>) => void;
  onAddTask: (task: MeetingTask) => Promise<void>;
  onRemoveTask: (taskIndex: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MeetingTask>({ text: "", owner: "", due: "" });
  const [adding, setAdding] = useState(false);

  function updateTask(taskIndex: number, patch: Partial<MeetingTask>) {
    onChange({ tasks: agenda.tasks.map((task, index) => index === taskIndex ? { ...task, ...patch } : task) });
  }

  async function addTask() {
    if (!draft.text.trim() || adding) return;
    setAdding(true);
    await onAddTask(draft);
    setDraft({ text: "", owner: "", due: "" });
    setAdding(false);
  }

  return (
    <article className="agenda-card">
      <div className="agenda-number">{String(index + 1).padStart(2, "0")}</div>
      <div className="agenda-body">
        <input className="agenda-title" value={agenda.title} placeholder="議題のタイトルを入力" onChange={(event) => onChange({ title: event.target.value })} />
        <Field label="今回決定すること" tone="target" value={agenda.decideTarget} onChange={(value) => onChange({ decideTarget: value })} />
        <Field label="共有・議論メモ" value={agenda.note} onChange={(value) => onChange({ note: value })} />
        <Field label="決定事項" tone="decision" value={agenda.decision} onChange={(value) => onChange({ decision: value })} />
        <Field label="引き続き考えること" tone="continue" value={agenda.continueThinking} onChange={(value) => onChange({ continueThinking: value })} />
        <div className="task-area">
          <strong>ToDo</strong>
          {agenda.tasks.map((task, taskIndex) => (
            <div className="task-row saved" key={`${task.workTaskId ?? "new"}-${taskIndex}`}>
              <span>✓</span>
              <input aria-label="タスク内容" value={task.text} onChange={(event) => updateTask(taskIndex, { text: event.target.value })} />
              <input aria-label="担当者" value={task.owner} onChange={(event) => updateTask(taskIndex, { owner: event.target.value })} />
              <input aria-label="期限" type="date" value={task.due} onChange={(event) => updateTask(taskIndex, { due: event.target.value })} />
              <button aria-label="ToDoを削除" onClick={() => void onRemoveTask(taskIndex)}>×</button>
            </div>
          ))}
          <div className="task-row">
            <input placeholder="タスク内容" value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
            <input placeholder="担当者" value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
            <input type="date" aria-label="新しいToDoの期限" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} />
            <button disabled={adding} onClick={() => void addTask()}>{adding ? "追加中" : "追加"}</button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Field({ label, value, tone = "", onChange }: { label: string; value: string; tone?: string; onChange: (value: string) => void }) {
  return <label className={`field ${tone}`}><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TaskWorkspace({ tasks, loading, onUpdate, onAddGoogle, isGoogleConnected, onConnectGoogle }: {
  tasks: WorkTask[];
  loading: boolean;
  onUpdate: (id: number, patch: Partial<WorkTask>) => Promise<void>;
  onAddGoogle: (task: WorkTask) => Promise<boolean>;
  isGoogleConnected: boolean;
  onConnectGoogle: () => Promise<void>;
}) {
  const [person, setPerson] = useState("全員");
  const [status, setStatus] = useState("すべて");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => tasks.filter((task) =>
    (person === "全員" || task.assignee === person) &&
    (status === "すべて" || task.status === status) &&
    (!query || `${task.title} ${task.source_label} ${task.notes}`.toLowerCase().includes(query.toLowerCase())),
  ), [tasks, person, status, query]);
  const counts = useMemo(() => ({
    all: tasks.length,
    open: tasks.filter((task) => task.status !== "完了").length,
    done: tasks.filter((task) => task.status === "完了").length,
  }), [tasks]);

  return (
    <section className="task-workspace">
      <div className="task-heading">
        <div><p className="eyebrow">TASK MANAGEMENT</p><h2>タスク管理</h2><p>会議のToDoを含む、すべての業務タスクを管理します。</p></div>
        <div className="task-heading-actions">{!isGoogleConnected ? <button className="secondary-button" onClick={() => void onConnectGoogle()}>G Google Tasksを接続</button> : null}<div className="task-stats"><span><strong>{counts.all}</strong>すべて</span><span><strong>{counts.open}</strong>未完了</span><span><strong>{counts.done}</strong>完了</span></div></div>
      </div>
      <div className="person-tabs">{["全員", ...people].map((item) => <button key={item} className={person === item ? "active" : ""} onClick={() => setPerson(item)}>{item}</button>)}</div>
      <div className="task-toolbar">
        <input aria-label="タスク検索" placeholder="タスクを検索" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option>すべて</option><option>未着手</option><option>作業中</option><option>確認中</option><option>完了</option></select>
        <span>{visible.length}件</span>
      </div>
      {loading && <div className="empty-state">読み込み中…</div>}
      <div className="managed-task-list">
        {visible.map((task) => (
          <ManagedTaskCard key={task.id} task={task} onUpdate={onUpdate} onAddGoogle={onAddGoogle} isGoogleConnected={isGoogleConnected} />
        ))}
      </div>
    </section>
  );
}

function ManagedTaskCard({ task, onUpdate, onAddGoogle, isGoogleConnected }: { task: WorkTask; onUpdate: (id: number, patch: Partial<WorkTask>) => Promise<void>; onAddGoogle: (task: WorkTask) => Promise<boolean>; isGoogleConnected: boolean }) {
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState(task.category);
  const [googleBusy, setGoogleBusy] = useState(false);
  const syncedToGoogle = task.notes.includes("[google-task:");
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setCategory(task.category), [task.category]);

  return (
    <article className={`managed-task status-${task.status}`}>
      <div className="task-accent" />
      <div className="managed-task-main">
        <div className="managed-task-top">
          <select aria-label="状態" value={task.status} onChange={(event) => void onUpdate(task.id, { status: event.target.value as WorkTask["status"] })}><option>未着手</option><option>作業中</option><option>確認中</option><option>完了</option></select>
          <select aria-label="優先度" value={task.priority} onChange={(event) => void onUpdate(task.id, { priority: event.target.value as WorkTask["priority"] })}><option>高</option><option>中</option><option>低</option></select>
          {task.source_meeting_id ? <span className="meeting-source">会議ToDo</span> : null}
          <button className={`google-task-button ${syncedToGoogle ? "synced" : ""}`} disabled={googleBusy || syncedToGoogle} onClick={async () => { setGoogleBusy(true); await onAddGoogle(task); setGoogleBusy(false); }}>{syncedToGoogle ? "✓ Google Tasks登録済み" : googleBusy ? "登録中…" : isGoogleConnected ? "G Google Tasksへ追加" : "G 接続して追加"}</button>
        </div>
        <input aria-label="タスク名" className="managed-task-title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => title !== task.title && void onUpdate(task.id, { title })} />
        <div className="managed-fields">
          <label><span>担当者</span><select value={task.assignee} onChange={(event) => void onUpdate(task.id, { assignee: event.target.value })}><option value="">未定</option>{people.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>期限</span><input type="date" value={task.due_date ?? ""} onChange={(event) => void onUpdate(task.id, { due_date: event.target.value || null })} /></label>
          <label><span>分類</span><input value={category} onChange={(event) => setCategory(event.target.value)} onBlur={() => category !== task.category && void onUpdate(task.id, { category })} /></label>
          <label><span>元データ</span><input value={task.source_label} disabled /></label>
        </div>
      </div>
    </article>
  );
}

function WorkRecordWorkspace({ kind, records, loading, onSave, onDelete }: {
  kind: WorkRecordKind;
  records: WorkRecord[];
  loading: boolean;
  onSave: (kind: WorkRecordKind, person: string, workDate: string, payload: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [person, setPerson] = useState(people[0]);
  const [workDate, setWorkDate] = useState(today());
  const record = useMemo(() => records.find((item) => item.kind === kind && item.person === person && item.work_date === workDate), [records, kind, person, workDate]);
  const [schedule, setSchedule] = useState<SchedulePayload>(() => normalizeSchedule(record?.payload));
  const [report, setReport] = useState<ReportPayload>(() => normalizeReport(record?.payload));
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSchedule(normalizeSchedule(record?.payload));
    setReport(normalizeReport(record?.payload));
  }, [record?.id, kind, person, workDate]);

  function queueSave(payload: SchedulePayload | ReportPayload) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const compatiblePayload = kind === "report"
        ? { ...payload, entries: (payload as ReportPayload).entries.map((entry) => ({ ...entry, content: entry.detail })) }
        : payload;
      void onSave(kind, person, workDate, compatiblePayload as unknown as Record<string, unknown>);
    }, 650);
  }

  function changeSchedule(transform: (current: SchedulePayload) => SchedulePayload) {
    setSchedule((current) => {
      const next = transform(current);
      queueSave(next);
      return next;
    });
  }

  function changeReport(transform: (current: ReportPayload) => ReportPayload) {
    setReport((current) => {
      const next = transform(current);
      queueSave(next);
      return next;
    });
  }

  function changeEntry(entryKind: WorkRecordKind, id: string, patch: Partial<TimeEntry>) {
    if (entryKind === "schedule") changeSchedule((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item) }));
    else changeReport((current) => ({ ...current, entries: current.entries.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  const entries = kind === "schedule" ? schedule.items : report.entries;
  const generated = kind === "schedule" ? buildScheduleText(person, workDate, schedule) : buildReportText(person, workDate, report);

  async function copyText() {
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="record-workspace">
      <div className="record-heading">
        <div><p className="eyebrow">{kind === "schedule" ? "WORK SCHEDULE" : "DAILY REPORT"}</p><h2>{kind === "schedule" ? "業務予定" : "日報"}</h2><p>担当者と日付ごとに記録し、入力内容は自動保存されます。</p></div>
        <div className="record-context">
          <label><span>担当者</span><select value={person} onChange={(event) => setPerson(event.target.value)}>{people.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>日付</span><input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
        </div>
      </div>
      {loading ? <div className="empty-state">読み込み中…</div> : (
        <div className="record-grid">
          <div className="record-editor">
            <section className="record-card">
              <div className="record-card-heading"><div><span>01</span><h3>時間別の業務</h3></div><button className="secondary-button" onClick={() => kind === "schedule" ? changeSchedule((current) => ({ ...current, items: [...current.items, createEntry()] })) : changeReport((current) => ({ ...current, entries: [...current.entries, createEntry()] }))}>＋ 行を追加</button></div>
              <div className="time-entry-list">
                {entries.length === 0 ? <p className="record-empty">まだ時間別の業務がありません。</p> : null}
                {entries.map((entry) => <TimeEntryRow key={entry.id} entry={entry} onChange={(patch) => changeEntry(kind, entry.id, patch)} onRemove={() => kind === "schedule" ? changeSchedule((current) => ({ ...current, items: current.items.filter((item) => item.id !== entry.id) })) : changeReport((current) => ({ ...current, entries: current.entries.filter((item) => item.id !== entry.id) }))} />)}
              </div>
            </section>

            {kind === "schedule" ? (
              <section className="record-card record-fields">
                <RecordField label="今日のタスク" value={schedule.tasks} onChange={(value) => changeSchedule((current) => ({ ...current, tasks: value }))} />
                <RecordField label="優先順位" value={schedule.priorities} onChange={(value) => changeSchedule((current) => ({ ...current, priorities: value }))} />
                <div className="two-column"><RecordField label="今日の目標" value={schedule.dailyGoal} onChange={(value) => changeSchedule((current) => ({ ...current, dailyGoal: value }))} /><RecordField label="今週の目標" value={schedule.weeklyGoal} onChange={(value) => changeSchedule((current) => ({ ...current, weeklyGoal: value }))} /></div>
              </section>
            ) : (
              <section className="record-card record-fields">
                <RecordField label="本日の業務内容" value={report.reportContent} onChange={(value) => changeReport((current) => ({ ...current, reportContent: value }))} />
                <RecordField label="相談・確認事項" value={report.consultationContent} onChange={(value) => changeReport((current) => ({ ...current, consultationContent: value }))} />
                <div className="two-column"><RecordField label="振り返り" value={report.reflection} onChange={(value) => changeReport((current) => ({ ...current, reflection: value }))} /><RecordField label="改善点" value={report.improvements} onChange={(value) => changeReport((current) => ({ ...current, improvements: value }))} /></div>
                <RecordField label="次回の重点" value={report.nextFocus} onChange={(value) => changeReport((current) => ({ ...current, nextFocus: value }))} />
                <div className="two-column"><label className="record-field"><span>次回出勤日</span><input type="date" value={report.nextWorkDate} onChange={(event) => changeReport((current) => ({ ...current, nextWorkDate: event.target.value }))} /></label><RecordField label="次回予定" value={report.nextSchedule} onChange={(value) => changeReport((current) => ({ ...current, nextSchedule: value }))} /></div>
                <RecordField label="期限未定タスク" value={report.undatedTasks} onChange={(value) => changeReport((current) => ({ ...current, undatedTasks: value }))} />
                <RecordField label="その他" value={report.other} onChange={(value) => changeReport((current) => ({ ...current, other: value }))} />
              </section>
            )}
            {record ? <button className="danger-button" onClick={() => void onDelete(record.id)}>この日の記録を削除</button> : null}
          </div>
          <aside className="record-preview">
            <div className="preview-heading"><div><p className="eyebrow">READY TO SHARE</p><h3>{kind === "schedule" ? "業務予定の完成文" : "日報の完成文"}</h3></div><button className="primary-button" onClick={() => void copyText()}>{copied ? "コピー済み ✓" : "文章をコピー"}</button></div>
            <pre>{generated}</pre>
          </aside>
        </div>
      )}
    </section>
  );
}

function TimeEntryRow({ entry, onChange, onRemove }: { entry: TimeEntry; onChange: (patch: Partial<TimeEntry>) => void; onRemove: () => void }) {
  return <div className="time-entry"><input aria-label="開始時刻" type="time" value={entry.start} onChange={(event) => onChange({ start: event.target.value })} /><span>–</span><input aria-label="終了時刻" type="time" value={entry.end} onChange={(event) => onChange({ end: event.target.value })} /><input aria-label="分類" placeholder="分類" value={entry.category} onChange={(event) => onChange({ category: event.target.value })} /><input aria-label="業務内容" placeholder="業務内容" value={entry.detail} onChange={(event) => onChange({ detail: event.target.value })} /><button aria-label="行を削除" onClick={onRemove}>×</button></div>;
}

function RecordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="record-field"><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function buildScheduleText(person: string, workDate: string, payload: SchedulePayload) {
  const lines = [`【業務予定】${workDate} / ${person}`];
  if (payload.items.length) lines.push("", "■ 時間別", ...payload.items.map((item) => `${item.start || "--:--"}〜${item.end || "--:--"}  ${item.category ? `[${item.category}] ` : ""}${item.detail}`));
  if (payload.tasks) lines.push("", "■ 今日のタスク", payload.tasks);
  if (payload.priorities) lines.push("", "■ 優先順位", payload.priorities);
  if (payload.dailyGoal) lines.push("", "■ 今日の目標", payload.dailyGoal);
  if (payload.weeklyGoal) lines.push("", "■ 今週の目標", payload.weeklyGoal);
  return lines.join("\n");
}

function buildReportText(person: string, workDate: string, payload: ReportPayload) {
  const lines = [`【日報】${workDate} / ${person}`];
  if (payload.entries.length) lines.push("", "■ 時間別", ...payload.entries.map((item) => `${item.start || "--:--"}〜${item.end || "--:--"}  ${item.category ? `[${item.category}] ` : ""}${item.detail}`));
  const sections: [string, string][] = [["本日の業務内容", payload.reportContent], ["相談・確認事項", payload.consultationContent], ["振り返り", payload.reflection], ["改善点", payload.improvements], ["次回の重点", payload.nextFocus], ["次回出勤日", payload.nextWorkDate], ["次回予定", payload.nextSchedule], ["期限未定タスク", payload.undatedTasks], ["その他", payload.other]];
  sections.forEach(([label, value]) => { if (value) lines.push("", `■ ${label}`, value); });
  return lines.join("\n");
}

function RedmineWorkspace() {
  const [form, setForm] = useState({ title: "", background: "", current: "", request: "", notes: "" });
  const [copied, setCopied] = useState(false);
  const text = [`h1. ${form.title || "チケットタイトル"}`, "", "h2. 背景・目的", form.background || "（背景・目的を入力）", "", "h2. 現状", form.current || "（現在の状況を入力）", "", "h2. 対応内容・依頼事項", form.request || "（対応内容を入力）", ...(form.notes ? ["", "h2. 補足", form.notes] : [])].join("\n");
  async function copyText() { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }
  return <section className="record-workspace"><div className="record-heading"><div><p className="eyebrow">REDMINE TEXT MAKER</p><h2>Redmine文章</h2><p>要点を入力すると、そのまま貼り付けられるTextile形式の文章を作成します。</p></div></div><div className="record-grid"><div className="record-editor"><section className="record-card record-fields"><label className="record-field"><span>タイトル</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><RecordField label="背景・目的" value={form.background} onChange={(value) => setForm({ ...form, background: value })} /><RecordField label="現状" value={form.current} onChange={(value) => setForm({ ...form, current: value })} /><RecordField label="対応内容・依頼事項" value={form.request} onChange={(value) => setForm({ ...form, request: value })} /><RecordField label="補足" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} /></section></div><aside className="record-preview"><div className="preview-heading"><div><p className="eyebrow">TEXTILE PREVIEW</p><h3>完成文</h3></div><button className="primary-button" onClick={() => void copyText()}>{copied ? "コピー済み ✓" : "文章をコピー"}</button></div><pre>{text}</pre></aside></div></section>;
}

function NewMeetingModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: { title: string; date: string; time: string; participants: string }) => Promise<void> }) {
  const [form, setForm] = useState({ title: "", date: today(), time: "", participants: "" });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.date || busy) return;
    setBusy(true);
    await onSubmit({ ...form, title: form.title.trim(), participants: form.participants.trim() });
    setBusy(false);
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><div><p className="eyebrow">NEW MEETING</p><h2>新しい会議を作成</h2></div><button type="button" onClick={onClose}>×</button></div>
        <label><span>会議名</span><input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <div className="form-grid"><label><span>日付</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label><span>時間</span><input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label></div>
        <label><span>参加者</span><input placeholder="例：羽賀・佐藤・安田" value={form.participants} onChange={(event) => setForm({ ...form, participants: event.target.value })} /></label>
        <button className="primary-button full" disabled={busy}>{busy ? "作成中…" : "会議を作成する"}</button>
      </form>
    </div>
  );
}
