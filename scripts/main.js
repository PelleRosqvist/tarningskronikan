const MODULE_ID = "tarningskronikan";

Hooks.once("init", () => {
  console.log("Tärningskrönikan | Initierad");
});

Hooks.once("ready", () => {
  console.log("Tärningskrönikan | Redo att lyssna på tärningsslag");
});

Hooks.on("createChatMessage", (message, options, userId) => {
  if (!Array.isArray(message.rolls) || message.rolls.length === 0) return;

  const rollSummary = message.rolls.map((roll, index) => ({
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

  const debugData = {
    module: MODULE_ID,
    messageId: message.id ?? null,
    userId,
    author: message.author?.name ?? null,
    speaker: message.speaker ?? null,
    flavor: message.flavor ?? null,
    content: message.content ?? null,
    flags: message.flags ?? {},
    rolls: rollSummary
  };

  console.log("Tärningskrönikan | Tärningsslag upptäckt!");
  console.log("Tärningskrönikan | Sammanfattning:");
  console.log(JSON.stringify(debugData, null, 2));

  try {
    console.log("Tärningskrönikan | Rå ChatMessage:");
    console.log(JSON.stringify(message.toObject(), null, 2));
  } catch (error) {
    console.warn("Tärningskrönikan | Kunde inte serialisera rått ChatMessage", error);
  }
});
