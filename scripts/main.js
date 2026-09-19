const MODULE_ID = "tarningskronikan";
const DEBUG_RAW_MESSAGES = true;
const PUSH_TIMEOUT_MS = 60000;

let pendingPush = null;

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

function rememberPushFromClick(event) {
  const button = event.target?.closest?.("button.push-roll");
  if (!button) return;

  const chatMessageElement = button.closest(".chat-message");
  const sourceMessageId = chatMessageElement?.dataset?.messageId;
  if (!sourceMessageId) return;

  const sourceMessage = game.messages.get(sourceMessageId);
  if (!sourceMessage) return;

  pendingPush = {
    sourceMessageId,
    userId: game.user?.id ?? null,
    actorUuid: sourceMessage.system?.actorUuid ?? null,
    messageType: sourceMessage.type ?? null,
    skillUuid: sourceMessage.system?.skillUuid ?? null,
    sourceResult: sourceMessage.system?.result ?? null,
    sourceOutcome: getDragonbaneOutcome(sourceMessage.system ?? {}),
    capturedAt: Date.now()
  };

  console.log(
    `Tärningskrönikan | Push registrerad:\n${JSON.stringify(pendingPush, null, 2)}`
  );
}

function consumeMatchingPush(message, userId) {
  if (!pendingPush) return null;

  const age = Date.now() - pendingPush.capturedAt;
  if (age > PUSH_TIMEOUT_MS) {
    pendingPush = null;
    return null;
  }

  const system = message.system ?? {};
  const matches =
    pendingPush.userId === userId &&
    pendingPush.messageType === message.type &&
    pendingPush.actorUuid === (system.actorUuid ?? null) &&
    pendingPush.skillUuid === (system.skillUuid ?? null);

  if (!matches) return null;

  const matched = pendingPush;
  pendingPush = null;
  return matched;
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

Hooks.once("init", () => {
  console.log("Tärningskrönikan | Initierad");
});

Hooks.once("ready", () => {
  document.addEventListener("click", rememberPushFromClick, true);

  console.log(
    `Tärningskrönikan | Redo | Foundry ${game.version} | System ${game.system.id} ${game.system.version}`
  );
});

Hooks.on("createChatMessage", (message, options, userId) => {
  if (!Array.isArray(message.rolls) || message.rolls.length === 0) return;

  const rolls = summarizeRolls(message.rolls);

  console.log("Tärningskrönikan | Tärningsslag upptäckt!");

  if (game.system.id === "dragonbane" && message.type === "skillTest") {
    const entry = summarizeDragonbaneSkillTest(message, userId, rolls);
    console.log(
      `Tärningskrönikan | Dragonbane skillTest:\n${JSON.stringify(entry, null, 2)}`
    );
  } else {
    const entry = {
      kind: message.type ?? "unknown",
      messageId: message.id ?? null,
      userId,
      userName: message.author?.name ?? null,
      actorId: message.speaker?.actor ?? null,
      actorName: message.speaker?.alias ?? null,
      rolls
    };

    console.log(
      `Tärningskrönikan | Generiskt slag:\n${JSON.stringify(entry, null, 2)}`
    );
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
