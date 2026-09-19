# Tärningskrönikan

Dice statistics and session reports for Foundry VTT, with Dragonbane / Drakar och Demoner support.

> **Status:** Early prototype. Version 0.2.0 can start a test session and persist Dragonbane skill-test rolls in the Foundry world.

## Installera prototypen

1. Öppna Foundry VTT Setup.
2. Gå till **Add-on Modules** och välj **Install Module**.
3. Klistra in manifestadressen:

   `https://raw.githubusercontent.com/PelleRosqvist/tarningskronikan/main/module.json`

4. Installera modulen.
5. Starta din testvärld och aktivera **Tärningskrönikan** under **Manage Modules**.

## Testa sessionslagring

Öppna webbläsarens utvecklarkonsol med F12.

Starta en test-session:

```js
await game.tarningskronikan.startSession("Testsession")
```

Gör några färdighetsslag. Version 0.2.0 sparar för närvarande bara Dragonbane `skillTest`.

Visa status:

```js
game.tarningskronikan.status()
```

Avsluta sessionen:

```js
await game.tarningskronikan.stopSession()
```

Visa senast sparade session och dess registrerade slag:

```js
game.tarningskronikan.latestSession()
```

Sessionsdata sparas som en dold world setting i Foundry-världen. Endast den GM som startade sessionen skriver till sessionsarkivet.
