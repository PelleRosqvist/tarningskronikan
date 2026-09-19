const MODULE_ID = "tarningskronikan";
const SOCKET_NAME = `module.${MODULE_ID}`;
const DEBUG_RAW_MESSAGES = false;
const PUSH_TIMEOUT_MS = 60000;

const pendingPushes = new Map();
let sessionWriteQueue = Promise.resolve();

function createEmptySessionStore() {
  return {
    version: 1,
    activeSessionId: null,
    sessions: []
  };
}

function normalizeSessionStore(raw) {
  const store = raw && typeof raw === "object" ? raw : createEmptySessionStore();

  return {
    version: Number(store.version) || 1,
    activeSessionId: store.activeSessionId ?? null,
    sessions: Array.isArray(store.sessions) ? store.sessions : []
  };
}

function cloneStore(raw) {
  return JSON.parse(JSON.stringify(normalizeSessionStore(raw)));
}

function getSessionStore() {
  return cloneStore(game.settings.get(MODULE_ID, "sessionStore"));
}

function getActiveSession(store = getSessionStore()) {
  if (!store.activeSessionId) return null;
  return store.sessions.find((session) => session.id === store.activeSessionId) ?? null;
}

function isRecordingClient(session) {
  return !!session && game.user?.id === session.recorderUserId;
}

async function saveSessionStore(store) {
  await game.settings.set(MODULE_ID, "sessionStore", store);
}

function enqueueSessionWrite(task) {
  sessionWriteQueue = sessionWriteQueue
    .then(task)
    .catch((error) => {
      console.error("Tärningskrönikan | Kunde inte spara sessionsdata", error);
      ui.notifications?.error("Tärningskrönikan kunde inte spara sessionsdata.");
    });

  return sessionWriteQueue;
}

function summarizeRolls(rolls = []) {
  return rolls.map((roll, index) => ({
    index,
    formula: roll.formula ?? null,
    total: roll.total ?? null,
    dice: Array.from(roll.dice ?? []).map((die) => ({
      faces: die.faces ?? null,
      number: die.number ?? null,
      results: Array.from(die.results ?? []).map((result) => ({
        result: result.result ?? null,
        active: result.active ?? null,
        discarded: result.discarded ?? null
      }))
    }))
  }));
}

function getDragonbaneOutcome(system = {}) {
  if (system.isDragon) return "dragon";
  if (system.isDemon) return "demon";
  return system.success ? "success" : "failure";
}

function getBoonBaneMode(system = {}) {
  const boons = Number(system.boons) || 0;
  const banes = Number(system.banes) || 0;

  if (boons > 0 && banes === 0) return "boon";
  if (banes > 0 && boons === 0) return "bane";
  if (boons === 0 && banes === 0) return "normal";
  return "mixed";
}

function extractD20Results(rolls = []) {
  const all = [];

  for (const roll of rolls) {
    for (const die of roll.dice ?? []) {
      if (die.faces !== 20) continue;

      for (const result of die.results ?? []) {
        all.push({
          value: result.result ?? null,
          active: result.active === true,
          discarded: result.discarded === true
        });
      }
    }
  }

  return {
    all,
    kept: all.filter((entry) => entry.active && !entry.discarded).map((entry) => entry.value),
    discarded: all.filter((entry) => entry.discarded || !entry.active).map((entry) => entry.value)
  };
}

function pushKey(data) {
  return [
    data.userId ?? "",
    data.messageType ?? "",
    data.actorUuid ?? "",
    data.skillUuid ?? ""
  ].join("|");
}

function storePendingPush(data) {
  if (!data?.sourceMessageId || !data?.userId) return;

  pendingPushes.set(pushKey(data), {
    sourceMessageId: data.sourceMessageId,
    userId: data.userId,
    actorUuid: data.actorUuid ?? null,
    messageType: data.messageType ?? null,
    skillUuid: data.skillUuid ?? null,
    sourceResult: data.sourceResult ?? null,
    sourceOutcome: data.sourceOutcome ?? null,
    capturedAt: Number(data.capturedAt) || Date.now()
  });
}

function rememberPushFromClick(event) {
  const button = event.target?.closest?.("button.push-roll");
  if (!button) return;

  const chatMessageElement = button.closest(".chat-message");
  const sourceMessageId = chatMessageElement?.dataset?.messageId;
  if (!sourceMessageId) return;

  const sourceMessage = game.messages.get(sourceMessageId);
  if (!sourceMessage) return;

  const data = {
    sourceMessageId,
    userId: game.user?.id ?? null,
    actorUuid: sourceMessage.system?.actorUuid ?? null,
    messageType: sourceMessage.type ?? null,
    skillUuid: sourceMessage.system?.skillUuid ?? null,
    sourceResult: sourceMessage.system?.result ?? null,
    sourceOutcome: getDragonbaneOutcome(sourceMessage.system ?? {}),
    capturedAt: Date.now()
  };

  storePendingPush(data);
  game.socket?.emit(SOCKET_NAME, { type: "pushPending", data });

  console.log(
    `Tärningskrönikan | Push registrerad:\n${JSON.stringify(data, null, 2)}`
  );
}

function consumeMatchingPush(message, userId) {
  const system = message.system ?? {};
  const key = pushKey({
    userId,
    messageType: message.type,
    actorUuid: system.actorUuid ?? null,
    skillUuid: system.skillUuid ?? null
  });

  const pending = pendingPushes.get(key);
  if (!pending) return null;

  const age = Date.now() - pending.capturedAt;
  if (age > PUSH_TIMEOUT_MS) {
    pendingPushes.delete(key);
    return null;
  }

  pendingPushes.delete(key);
  return pending;
}

function summarizeDragonbaneSkillTest(message, userId, rolls) {
  const system = message.system ?? {};
  const d20 = extractD20Results(rolls);
  const pushedFrom = consumeMatchingPush(message, userId);

  return {
    kind: "skillTest",
    messageId: message.id ?? null,
    timestamp: message.timestamp ?? Date.now(),

    userId,
    userName: message.author?.name ?? null,

    actorId: message.speaker?.actor ?? null,
    actorName: message.speaker?.alias ?? null,
    actorUuid: system.actorUuid ?? null,

    skillName: system.skillName ?? null,
    skillUuid: system.skillUuid ?? null,
    skillValue: system.skillValue ?? null,

    target: system.target ?? null,
    result: system.result ?? rolls?.[0]?.total ?? null,
    success: system.success ?? null,
    outcome: getDragonbaneOutcome(system),

    isDragon: system.isDragon ?? false,
    isDemon: system.isDemon ?? false,

    boons: Number(system.boons) || 0,
    banes: Number(system.banes) || 0,
    boonBaneMode: getBoonBaneMode(system),

    pushAvailable: system.canPush ?? false,
    wasPushed: !!pushedFrom,
    pushSourceMessageId: pushedFrom?.sourceMessageId ?? null,
    pushOriginalResult: pushedFrom?.sourceResult ?? null,
    pushOriginalOutcome: pushedFrom?.sourceOutcome ?? null,

    autoSuccess: system.autoSuccess ?? false,

    formula: rolls?.[0]?.formula ?? null,
    d20,
    rolls
  };
}

function recordSessionEntry(entry) {
  return enqueueSessionWrite(async () => {
    const store = getSessionStore();
    const session = getActiveSession(store);

    if (!session || !isRecordingClient(session)) return;
    if (session.entries?.some((item) => item.messageId === entry.messageId)) return;

    session.entries ??= [];

    if (entry.wasPushed && entry.pushSourceMessageId) {
      const source = session.entries.find(
        (item) => item.messageId === entry.pushSourceMessageId
      );

      if (source) {
        source.pushUsed = true;
        source.pushResultMessageId = entry.messageId;
      }
    }

    session.entries.push(entry);
    await saveSessionStore(store);

    console.log(
      `Tärningskrönikan | Sparat slag #${session.entries.length} i session "${session.name}"`
    );
  });
}

async function startSession(name = "Testsession") {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Endast GM kan starta en Tärningskrönikan-session.");
    return null;
  }

  await sessionWriteQueue;

  const store = getSessionStore();
  const existing = getActiveSession(store);

  if (existing) {
    ui.notifications?.warn(`Sessionen "${existing.name}" är redan aktiv.`);
    return existing;
  }

  const session = {
    id: foundry.utils.randomID(),
    name: String(name || "Testsession").trim() || "Testsession",
    startedAt: Date.now(),
    endedAt: null,
    recorderUserId: game.user.id,
    recorderUserName: game.user.name,
    foundryVersion: game.version,
    systemId: game.system.id,
    systemVersion: game.system.version,
    entries: []
  };

  store.sessions.push(session);
  store.activeSessionId = session.id;
  await saveSessionStore(store);

  ui.notifications?.info(`Tärningskrönikan startade sessionen "${session.name}".`);
  console.log("Tärningskrönikan | Session startad:", session);

  return session;
}

async function stopSession() {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Endast GM kan avsluta en Tärningskrönikan-session.");
    return null;
  }

  await sessionWriteQueue;

  const store = getSessionStore();
  const session = getActiveSession(store);

  if (!session) {
    ui.notifications?.warn("Ingen Tärningskrönikan-session är aktiv.");
    return null;
  }

  if (!isRecordingClient(session)) {
    ui.notifications?.warn(
      `Sessionen spelas in av ${session.recorderUserName ?? "en annan GM"}.`
    );
    return null;
  }

  session.endedAt = Date.now();
  store.activeSessionId = null;
  await saveSessionStore(store);

  ui.notifications?.info(
    `Tärningskrönikan avslutade "${session.name}" med ${session.entries?.length ?? 0} registrerade slag.`
  );

  console.log("Tärningskrönikan | Session avslutad:", session);
  return session;
}

function sessionStatus() {
  const store = getSessionStore();
  const session = getActiveSession(store);

  const status = session
    ? {
        active: true,
        id: session.id,
        name: session.name,
        recorder: session.recorderUserName,
        startedAt: new Date(session.startedAt).toLocaleString(),
        entries: session.entries?.length ?? 0
      }
    : {
        active: false,
        sessionsSaved: store.sessions.length
      };

  console.log(
    `Tärningskrönikan | Sessionsstatus:\n${JSON.stringify(status, null, 2)}`
  );
}

function latestSession() {
  const store = getSessionStore();
  const session = store.sessions.at(-1) ?? null;

  console.log(
    `Tärningskrönikan | Senaste session:\n${JSON.stringify(session, null, 2)}`
  );
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "sessionStore", {
    name: "Tärningskrönikan sessionsdata",
    scope: "world",
    config: false,
    type: Object,
    default: createEmptySessionStore()
  });

  console.log("Tärningskrönikan | Initierad");
});

Hooks.once("ready", () => {
  document.addEventListener("click", rememberPushFromClick, true);

  game.socket?.on(SOCKET_NAME, (payload) => {
    if (payload?.type === "pushPending") {
      storePendingPush(payload.data);
    }
  });

  game.tarningskronikan = {
    startSession: async (...args) => { await startSession(...args); },
    stopSession: async (...args) => { await stopSession(...args); },
    status: sessionStatus,
    latestSession
  };

  console.log(
    `Tärningskrönikan | Redo | Foundry ${game.version} | System ${game.system.id} ${game.system.version}`
  );
  console.log(
    'Tärningskrönikan | Testkommandon: await game.tarningskronikan.startSession("Testsession"), game.tarningskronikan.status(), await game.tarningskronikan.stopSession()'
  );
});

Hooks.on("createChatMessage", (message, options, userId) => {
  if (!Array.isArray(message.rolls) || message.rolls.length === 0) return;

  const rolls = summarizeRolls(message.rolls);

  if (game.system.id === "dragonbane" && message.type === "skillTest") {
    const entry = summarizeDragonbaneSkillTest(message, userId, rolls);

    console.log(
      `Tärningskrönikan | Dragonbane skillTest:\n${JSON.stringify(entry, null, 2)}`
    );

    void recordSessionEntry(entry);
  }

  if (DEBUG_RAW_MESSAGES) {
    try {
      console.log(
        `Tärningskrönikan | Rå ChatMessage:\n${JSON.stringify(message.toObject(), null, 2)}`
      );
    } catch (error) {
      console.warn("Tärningskrönikan | Kunde inte serialisera rått ChatMessage", error);
    }
  }
});
