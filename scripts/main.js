const MODULE_ID = "tarningskronikan";
const SOCKET_NAME = `module.${MODULE_ID}`;
const DEBUG_RAW_MESSAGES = false;
const PUSH_TIMEOUT_MS = 60000;

const pendingPushes = new Map();
let sessionWriteQueue = Promise.resolve();
let sessionPanelApp = null;
let statisticsApp = null;

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

function formatDateTime(timestamp) {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return "";
  const totalMinutes = Math.max(0, Math.round((endedAt - startedAt) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}

function refreshSessionPanel() {
  if (sessionPanelApp?.rendered) {
    sessionPanelApp.render({ force: true });
  }

  if (statisticsApp?.rendered) {
    statisticsApp.render({ force: true });
  }
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
  const testIdentity =
    data.skillUuid ??
    (data.attribute ? `attribute:${data.attribute}` : "");

  return [
    data.userId ?? "",
    data.messageType ?? "",
    data.actorUuid ?? "",
    testIdentity
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
    attribute: data.attribute ?? null,
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
    attribute: sourceMessage.system?.attribute ?? null,
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
    skillUuid: system.skillUuid ?? null,
    attribute: system.attribute ?? null
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

function summarizeDragonbaneTestBase(message, userId, rolls) {
  const system = message.system ?? {};
  const d20 = extractD20Results(rolls);
  const pushedFrom = consumeMatchingPush(message, userId);

  return {
    messageId: message.id ?? null,
    timestamp: message.timestamp ?? Date.now(),

    userId,
    userName: message.author?.name ?? null,

    actorId: message.speaker?.actor ?? null,
    actorName: message.speaker?.alias ?? null,
    actorUuid: system.actorUuid ?? null,

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

function summarizeDragonbaneSkillTest(message, userId, rolls) {
  const system = message.system ?? {};

  return {
    kind: "skillTest",
    ...summarizeDragonbaneTestBase(message, userId, rolls),

    skillName: system.skillName ?? null,
    skillUuid: system.skillUuid ?? null,
    skillValue: system.skillValue ?? null
  };
}

function summarizeDragonbaneAttributeTest(message, userId, rolls) {
  const system = message.system ?? {};
  const attribute = system.attribute ?? null;
  const localizedAttribute = attribute
    ? game.i18n.localize(`DoD.attributes.${attribute}`)
    : null;

  return {
    kind: "attributeTest",
    ...summarizeDragonbaneTestBase(message, userId, rolls),

    attribute,
    attributeName:
      localizedAttribute && localizedAttribute !== `DoD.attributes.${attribute}`
        ? localizedAttribute
        : attribute?.toUpperCase?.() ?? null
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


function calculateSessionStatistics(session) {
  const entries = Array.isArray(session?.entries) ? session.entries : [];

  const successes = entries.filter((entry) => entry.success === true).length;
  const failures = entries.filter((entry) => entry.success === false).length;
  const dragons = entries.filter((entry) => entry.isDragon === true).length;
  const demons = entries.filter((entry) => entry.isDemon === true).length;
  const pushed = entries.filter((entry) => entry.wasPushed === true).length;
  const boonRolls = entries.filter((entry) => (Number(entry.boons) || 0) > 0).length;
  const baneRolls = entries.filter((entry) => (Number(entry.banes) || 0) > 0).length;

  const d20Counts = Array.from({ length: 20 }, (_, index) => ({
    value: index + 1,
    count: 0
  }));

  const actorMap = new Map();
  const sessionSkillMap = new Map();

  for (const entry of entries) {
    for (const value of entry.d20?.kept ?? []) {
      if (Number.isInteger(value) && value >= 1 && value <= 20) {
        d20Counts[value - 1].count += 1;
      }
    }

    const actorKey =
      entry.actorUuid ||
      (entry.actorId ? `actor:${entry.actorId}` : null) ||
      (entry.actorName ? `name:${entry.actorName}` : "unknown");

    const actor = actorMap.get(actorKey) ?? {
      id: actorKey,
      uuid: entry.actorUuid ?? null,
      name: entry.actorName || "Okänd",
      rolls: 0,
      successes: 0,
      failures: 0,
      dragons: 0,
      demons: 0,
      pushes: 0,
      boons: 0,
      banes: 0,
      skills: new Map()
    };

    if (entry.actorName) actor.name = entry.actorName;

    actor.rolls += 1;
    if (entry.success === true) actor.successes += 1;
    if (entry.success === false) actor.failures += 1;
    if (entry.isDragon === true) actor.dragons += 1;
    if (entry.isDemon === true) actor.demons += 1;
    if (entry.wasPushed === true) actor.pushes += 1;
    if ((Number(entry.boons) || 0) > 0) actor.boons += 1;
    if ((Number(entry.banes) || 0) > 0) actor.banes += 1;

    const testName =
      entry.skillName ||
      (entry.attributeName ? `Egenskap: ${entry.attributeName}` : null) ||
      "Okänt test";
    const testKey =
      entry.skillUuid ||
      (entry.attribute ? `attribute:${entry.attribute}` : null) ||
      `test:${testName.toLocaleLowerCase("sv")}`;

    const skill = actor.skills.get(testKey) ?? {
      id: testKey,
      name: testName,
      rolls: 0,
      successes: 0,
      failures: 0,
      dragons: 0,
      demons: 0,
      pushes: 0
    };

    skill.rolls += 1;
    if (entry.success === true) skill.successes += 1;
    if (entry.success === false) skill.failures += 1;
    if (entry.isDragon === true) skill.dragons += 1;
    if (entry.isDemon === true) skill.demons += 1;
    if (entry.wasPushed === true) skill.pushes += 1;

    actor.skills.set(testKey, skill);
    actorMap.set(actorKey, actor);

    const sessionSkillKey = testName.toLocaleLowerCase("sv");
    const sessionSkill = sessionSkillMap.get(sessionSkillKey) ?? {
      name: testName,
      rolls: 0
    };
    sessionSkill.rolls += 1;
    sessionSkillMap.set(sessionSkillKey, sessionSkill);
  }

  const maxD20Count = Math.max(1, ...d20Counts.map((item) => item.count));
  const distribution = d20Counts.map((item) => ({
    ...item,
    heightPercent: Math.round((item.count / maxD20Count) * 100)
  }));

  const actors = [...actorMap.values()]
    .map((actor) => ({
      ...actor,
      successRate: actor.rolls
        ? Math.round((actor.successes / actor.rolls) * 100)
        : 0,
      skills: [...actor.skills.values()]
        .map((skill) => ({
          ...skill,
          successRate: skill.rolls
            ? Math.round((skill.successes / skill.rolls) * 100)
            : 0
        }))
        .sort(
          (a, b) =>
            b.rolls - a.rolls ||
            a.name.localeCompare(b.name, "sv")
        )
    }))
    .sort(
      (a, b) =>
        b.rolls - a.rolls ||
        a.name.localeCompare(b.name, "sv")
    );

  function actorLeader(field) {
    if (!actors.length) return null;

    const max = Math.max(...actors.map((actor) => Number(actor[field]) || 0));
    if (max <= 0) return null;

    const names = actors
      .filter((actor) => (Number(actor[field]) || 0) === max)
      .map((actor) => actor.name);

    return {
      names: names.join(" & "),
      count: max,
      tied: names.length > 1
    };
  }

  const mostUsedSkill = [...sessionSkillMap.values()]
    .sort(
      (a, b) =>
        b.rolls - a.rolls ||
        a.name.localeCompare(b.name, "sv")
    )[0] ?? null;

  const dragonLeader = actorLeader("dragons");
  const demonLeader = actorLeader("demons");
  const pushLeader = actorLeader("pushes");

  const highlights = [
    mostUsedSkill
      ? {
          icon: "fa-solid fa-hand-sparkles",
          title: "Mest använda test",
          primary: mostUsedSkill.name,
          detail: `${mostUsedSkill.rolls} slag`
        }
      : null,
    dragonLeader
      ? {
          icon: "fa-solid fa-dragon",
          title: "Flest Drakar",
          primary: dragonLeader.names,
          detail: `${dragonLeader.count} ${dragonLeader.count === 1 ? "Drake" : "Drakar"}`
        }
      : null,
    demonLeader
      ? {
          icon: "fa-solid fa-skull",
          title: "Flest Demoner",
          primary: demonLeader.names,
          detail: `${demonLeader.count} ${demonLeader.count === 1 ? "Demon" : "Demoner"}`
        }
      : null,
    pushLeader
      ? {
          icon: "fa-solid fa-arrow-rotate-right",
          title: "Flest Pushar",
          primary: pushLeader.names,
          detail: `${pushLeader.count} ${pushLeader.count === 1 ? "Push" : "Pushar"}`
        }
      : null
  ].filter(Boolean);

  const total = entries.length;
  const successRate = total ? Math.round((successes / total) * 100) : 0;

  return {
    total,
    successes,
    failures,
    successRate,
    dragons,
    demons,
    pushed,
    boonRolls,
    baneRolls,
    distribution,
    actors,
    highlights
  };
}

function getDiscordWebhookUrl() {
  return String(game.settings.get(MODULE_ID, "discordWebhookUrl") ?? "").trim();
}

function isDiscordWebhookUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const allowedHost =
      hostname === "discord.com" ||
      hostname.endsWith(".discord.com") ||
      hostname === "discordapp.com" ||
      hostname.endsWith(".discordapp.com");

    return (
      url.protocol === "https:" &&
      allowedHost &&
      /^\/api(?:\/v\d+)?\/webhooks\/[^/]+\/[^/]+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function configureDiscordWebhook() {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Endast GM kan konfigurera Discord-export.");
    return false;
  }

  const existing = getDiscordWebhookUrl();
  const escapedExisting = foundry.utils.escapeHTML(existing);
  const dialogV2 = foundry.applications?.api?.DialogV2;

  if (!dialogV2?.prompt) {
    ui.notifications?.error("Tärningskrönikan kunde inte öppna Discord-inställningen.");
    return false;
  }

  const value = await dialogV2.prompt({
    window: { title: "Konfigurera Discord" },
    content: `
      <form class="tarningskronikan-discord-form">
        <div class="form-group">
          <label for="tk-discord-webhook">Discord webhook-URL</label>
          <input
            id="tk-discord-webhook"
            name="discordWebhook"
            type="password"
            value="${escapedExisting}"
            autocomplete="off"
            placeholder="https://discord.com/api/webhooks/..."
          >
          <p class="hint">
            Webhooken sparas endast för din Foundry-användare i den här världen.
            Lämna fältet tomt för att ta bort den.
          </p>
        </div>
      </form>
    `,
    ok: {
      icon: "fa-brands fa-discord",
      label: "Spara",
      callback: (_event, button) =>
        button.form?.elements?.discordWebhook?.value?.trim() ?? ""
    }
  });

  if (value === null || value === undefined) return false;

  if (value && !isDiscordWebhookUrl(value)) {
    ui.notifications?.error(
      "Webhook-URL:en ser inte ut som en giltig Discord-webhook."
    );
    return false;
  }

  await game.settings.set(MODULE_ID, "discordWebhookUrl", value);
  refreshSessionPanel();

  ui.notifications?.info(
    value
      ? "Tärningskrönikan sparade Discord-webhooken."
      : "Tärningskrönikan tog bort Discord-webhooken."
  );

  return !!value;
}

function buildDiscordSessionPayload(session, stats) {
  const fields = [
    {
      name: "🎲 Registrerade slag",
      value: String(stats.total),
      inline: true
    },
    {
      name: "✅ Lyckade",
      value: `${stats.successes} (${stats.successRate} %)`,
      inline: true
    },
    {
      name: "❌ Misslyckade",
      value: String(stats.failures),
      inline: true
    },
    {
      name: "🐉 Drakar",
      value: String(stats.dragons),
      inline: true
    },
    {
      name: "💀 Demoner",
      value: String(stats.demons),
      inline: true
    },
    {
      name: "🔄 Pushar",
      value: String(stats.pushed),
      inline: true
    },
    {
      name: "⬆️ Boon",
      value: String(stats.boonRolls),
      inline: true
    },
    {
      name: "⬇️ Bane",
      value: String(stats.baneRolls),
      inline: true
    }
  ];

  if (stats.highlights?.length) {
    fields.push({
      name: "📜 Ur kvällens krönika",
      value: stats.highlights
        .map((item) => `**${item.title}:** ${item.primary} · ${item.detail}`)
        .join("\n")
        .slice(0, 1024),
      inline: false
    });
  }

  for (const actor of stats.actors.slice(0, 8)) {
    fields.push({
      name: `🛡️ ${actor.name}`.slice(0, 256),
      value: [
        `${actor.rolls} slag · ${actor.successRate} % lyckade`,
        `🐉 ${actor.dragons} · 💀 ${actor.demons} · 🔄 ${actor.pushes}`
      ].join("\n"),
      inline: true
    });
  }

  if (stats.actors.length > 8) {
    fields.push({
      name: "Fler rollpersoner",
      value: `+${stats.actors.length - 8} ytterligare i Foundry-rapporten`,
      inline: false
    });
  }

  const endTime = session.endedAt ?? Date.now();
  const descriptionParts = [
    `Startad ${formatDateTime(session.startedAt)}`,
    session.endedAt ? `Avslutad ${formatDateTime(session.endedAt)}` : "Sessionen pågår",
    session.endedAt ? formatDuration(session.startedAt, session.endedAt) : ""
  ].filter(Boolean);

  return {
    username: "Tärningskrönikan",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `🐉 ${session.name}`.slice(0, 256),
        description: descriptionParts.join(" · ").slice(0, 2048),
        color: 9136717,
        fields: fields.slice(0, 25),
        footer: {
          text: `Tärningskrönikan v${game.modules.get(MODULE_ID)?.version ?? ""}`
        },
        timestamp: new Date(endTime).toISOString()
      }
    ]
  };
}

async function sendSessionToDiscord(sessionId) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Endast GM kan skicka Tärningskrönikan till Discord.");
    return false;
  }

  const store = getSessionStore();
  const session = store.sessions.find((item) => item.id === sessionId);

  if (!session) {
    ui.notifications?.error("Tärningskrönikan kunde inte hitta sessionen.");
    return false;
  }

  let webhookUrl = getDiscordWebhookUrl();

  if (!webhookUrl) {
    const configured = await configureDiscordWebhook();
    if (!configured) return false;
    webhookUrl = getDiscordWebhookUrl();
  }

  if (!isDiscordWebhookUrl(webhookUrl)) {
    ui.notifications?.error(
      "Den sparade Discord-webhooken är ogiltig. Konfigurera den på nytt."
    );
    return false;
  }

  const stats = calculateSessionStatistics(session);
  const payload = buildDiscordSessionPayload(session, stats);
  const endpoint = new URL(webhookUrl);
  endpoint.searchParams.set("wait", "true");

  try {
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Discord svarade ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`
      );
    }

    ui.notifications?.info(
      `Tärningskrönikan skickade "${session.name}" till Discord.`
    );
    return true;
  } catch (error) {
    console.error("Tärningskrönikan | Discord-export misslyckades", error);
    ui.notifications?.error(
      "Kunde inte skicka till Discord. Se webbläsarkonsolen för detaljer."
    );
    return false;
  }
}

class TarningskronikanStatistics extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "tarningskronikan-statistics",
    classes: ["tarningskronikan-statistics"],
    window: {
      title: "Tärningskrönikan · Statistik",
      icon: "fas fa-chart-column",
      resizable: true
    },
    position: {
      width: 860,
      height: 720
    }
  };

  static PARTS = {
    root: {
      template: `modules/${MODULE_ID}/templates/session-statistics.hbs`,
      root: true
    }
  };

  constructor(sessionId, options = {}) {
    super(options);
    this.sessionId = sessionId;
  }

  async _prepareContext() {
    const store = getSessionStore();
    const session = store.sessions.find((item) => item.id === this.sessionId) ?? null;

    if (!session) {
      return {
        missing: true,
        sessionName: "Sessionen kunde inte hittas"
      };
    }

    const stats = calculateSessionStatistics(session);

    return {
      missing: false,
      sessionId: session.id,
      sessionName: session.name,
      discordConfigured: !!getDiscordWebhookUrl(),
      active: session.id === store.activeSessionId,
      startedAt: formatDateTime(session.startedAt),
      endedAt: session.endedAt ? formatDateTime(session.endedAt) : "",
      duration: session.endedAt
        ? formatDuration(session.startedAt, session.endedAt)
        : "",
      ...stats
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const scope =
      this.window?.content ??
      this.element ??
      document.getElementById(this.id);

    if (!scope) return;

    if (this._listenerScope === scope && this._clickHandler) return;

    if (this._listenerScope && this._clickHandler) {
      this._listenerScope.removeEventListener("click", this._clickHandler);
    }

    this._listenerScope = scope;
    this._clickHandler = async (event) => {
      const button = event.target?.closest?.("[data-action]");
      if (!button) return;

      const action = button.dataset.action;

      if (action === "configure-discord") {
        await configureDiscordWebhook();
        this.render({ force: true });
      }

      if (action === "send-discord") {
        button.disabled = true;
        try {
          await sendSessionToDiscord(this.sessionId);
        } finally {
          button.disabled = false;
        }
      }
    };

    scope.addEventListener("click", this._clickHandler);
  }
}

function openStatistics(sessionId) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Tärningskrönikans statistik är just nu endast för GM.");
    return;
  }

  const store = getSessionStore();
  const session = store.sessions.find((item) => item.id === sessionId);

  if (!session) {
    ui.notifications?.warn("Tärningskrönikan kunde inte hitta den valda sessionen.");
    return;
  }

  if (!statisticsApp) {
    statisticsApp = new TarningskronikanStatistics(sessionId);
    statisticsApp.render(true);
    return;
  }

  statisticsApp.sessionId = sessionId;
  statisticsApp.render({ force: true });
}

async function promptForSessionName() {
  const dialogV2 = foundry.applications?.api?.DialogV2;

  if (dialogV2?.prompt) {
    return dialogV2.prompt({
      window: { title: "Starta spelmöte" },
      content: `
        <form class="tarningskronikan-start-form">
          <div class="form-group">
            <label for="tk-session-name">Sessionsnamn</label>
            <input
              id="tk-session-name"
              name="sessionName"
              type="text"
              value="Spelmöte ${new Date().toLocaleDateString("sv-SE")}"
              autofocus
            >
          </div>
        </form>
      `,
      ok: {
        icon: "fa-solid fa-play",
        label: "Starta",
        callback: (_event, button) =>
          button.form?.elements?.sessionName?.value?.trim() || "Spelmöte"
      }
    });
  }

  return window.prompt(
    "Sessionsnamn",
    `Spelmöte ${new Date().toLocaleDateString("sv-SE")}`
  );
}

class TarningskronikanPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "tarningskronikan-panel",
    classes: ["tarningskronikan-panel"],
    window: {
      title: "Tärningskrönikan",
      icon: "fas fa-dice-d20",
      resizable: false
    },
    position: {
      width: 430,
      height: "auto"
    }
  };

  static PARTS = {
    root: {
      template: `modules/${MODULE_ID}/templates/session-panel.hbs`,
      root: true
    }
  };

  async _prepareContext() {
    const store = getSessionStore();
    const active = getActiveSession(store);
    const latestCompleted =
      [...store.sessions].reverse().find((session) => !!session.endedAt) ?? null;

    return {
      isGM: !!game.user?.isGM,
      active: active
        ? {
            id: active.id,
            name: active.name,
            startedAt: formatDateTime(active.startedAt),
            entryCount: active.entries?.length ?? 0,
            recorder: active.recorderUserName ?? ""
          }
        : null,
      latest: latestCompleted
        ? {
            id: latestCompleted.id,
            name: latestCompleted.name,
            endedAt: formatDateTime(latestCompleted.endedAt),
            entryCount: latestCompleted.entries?.length ?? 0,
            duration: formatDuration(
              latestCompleted.startedAt,
              latestCompleted.endedAt
            )
          }
        : null,
      savedSessionCount: store.sessions.length,
      version: game.modules.get(MODULE_ID)?.version ?? ""
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const scope =
      this.window?.content ??
      this.element ??
      document.getElementById(this.id);

    if (!scope) return;

    if (this._listenerScope === scope && this._clickHandler) return;

    if (this._listenerScope && this._clickHandler) {
      this._listenerScope.removeEventListener("click", this._clickHandler);
    }

    this._listenerScope = scope;
    this._clickHandler = async (event) => {
      const button = event.target?.closest?.("[data-action]");
      if (!button) return;

      const action = button.dataset.action;

      if (action === "start-session") {
        const name = await promptForSessionName();
        if (!name) return;
        await startSession(name);
      }

      if (action === "stop-session") {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Avsluta spelmöte" },
          content: "<p>Avsluta den aktiva Tärningskrönikan-sessionen?</p>",
          modal: true
        });
        if (!confirmed) return;
        await stopSession();
      }

      if (action === "show-statistics") {
        const sessionId = button.dataset.sessionId;
        if (sessionId) openStatistics(sessionId);
      }

      if (action === "refresh") {
        this.render({ force: true });
      }
    };

    scope.addEventListener("click", this._clickHandler);
  }
}

function openSessionPanel() {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Tärningskrönikans sessionspanel är just nu endast för GM.");
    return;
  }

  if (!sessionPanelApp) {
    sessionPanelApp = new TarningskronikanPanel();
  }

  sessionPanelApp.render(true);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "discordWebhookUrl", {
    name: "Tärningskrönikan Discord webhook",
    scope: "user",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "sessionStore", {
    name: "Tärningskrönikan sessionsdata",
    scope: "world",
    config: false,
    type: Object,
    default: createEmptySessionStore(),
    onChange: () => refreshSessionPanel()
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
    latestSession,
    open: openSessionPanel,
    statistics: openStatistics,
    configureDiscord: configureDiscordWebhook,
    sendToDiscord: sendSessionToDiscord
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

  if (game.system.id === "dragonbane" && message.type === "attributeTest") {
    const entry = summarizeDragonbaneAttributeTest(message, userId, rolls);

    console.log(
      `Tärningskrönikan | Dragonbane attributeTest:\n${JSON.stringify(entry, null, 2)}`
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


Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM || !controls) return;

  const tokenControls = Array.isArray(controls)
    ? controls.find((control) => control?.name === "token")
    : controls.tokens ?? controls.token;

  if (!tokenControls) return;

  const tool = {
    name: "tarningskronikan",
    title: "Tärningskrönikan",
    icon: "fas fa-dice-d20",
    button: true,
    visible: true,
    onChange: () => openSessionPanel()
  };

  if (Array.isArray(tokenControls.tools)) {
    const existing = tokenControls.tools.findIndex(
      (entry) => entry?.name === tool.name
    );

    if (existing >= 0) {
      tokenControls.tools[existing] = {
        ...tokenControls.tools[existing],
        ...tool
      };
    } else {
      tokenControls.tools.push(tool);
    }

    return;
  }

  tokenControls.tools ??= {};
  tokenControls.tools[tool.name] = tool;
});
