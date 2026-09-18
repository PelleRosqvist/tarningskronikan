const MODULE_ID = "tarningskronikan";

Hooks.once("init", () => {
  console.log("Tärningskrönikan | Initierad");
});

Hooks.once("ready", () => {
  console.log("Tärningskrönikan | Redo att lyssna på tärningsslag");
});

Hooks.on("createChatMessage", (message, options, userId) => {
  if (!Array.isArray(message.rolls) || message.rolls.length === 0) return;

  console.log("Tärningskrönikan | Tärningsslag upptäckt!");

  console.log({
    module: MODULE_ID,
    userId,
    author: message.author?.name ?? null,
    speaker: message.speaker ?? null,
    rolls: message.rolls
  });
});
