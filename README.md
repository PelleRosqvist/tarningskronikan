# Tärningskrönikan

Dice statistics and session reports for Foundry VTT, with Dragonbane / Drakar och Demoner support.

> **Status:** Early prototype. Version 0.3.0 adds the first in-Foundry GM session panel.

## Installera prototypen

1. Öppna Foundry VTT Setup.
2. Gå till **Add-on Modules** och välj **Install Module**.
3. Klistra in manifestadressen:

   `https://raw.githubusercontent.com/PelleRosqvist/tarningskronikan/main/module.json`

4. Installera modulen.
5. Starta din testvärld och aktivera **Tärningskrönikan** under **Manage Modules**.

## Använd sessionspanelen

Som GM:

1. Välj **Token Controls** i verktygsfältet till vänster.
2. Klicka på knappen med d20-ikonen och tooltip **Tärningskrönikan**.
3. Klicka **Starta spelmöte**.
4. Ange sessionsnamn.
5. Gör Dragonbane-färdighetsslag som vanligt.
6. Panelen visar löpande antal registrerade slag.
7. Klicka **Avsluta spelmöte** när sessionen är klar.

Version 0.3.0 sparar fortfarande endast Dragonbane `skillTest`.

Sessionsdata sparas som en dold world setting i Foundry-världen. Endast den GM som startade sessionen skriver till sessionsarkivet.

## Felsökning

Konsolkommandona finns kvar under prototypfasen:

```js
game.tarningskronikan.status()
game.tarningskronikan.latestSession()
game.tarningskronikan.open()
```
