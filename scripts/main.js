const MODULE_ID = "tarningskronikan";
const DEBUG_RAW_MESSAGES = true;

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

function summarizeDragonbaneSkillTest(message, userId, rolls) {
  const system = message.system ?? {};

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
    boons: system.boons ?? 0,
    banes: system.banes ?? 0,
    canPush: system.canPush ?? false,
    autoSuccess: system.autoSuccess ?? false,

    formula: rolls?.[0]?.formula ?? null,
    rolls
  };
}

Hooks.once("init", () => {
  console.log("Tärningskrönikan | Initierad");
});

Hooks.once("ready", () => {
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
