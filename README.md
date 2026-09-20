# Tärningskrönikan

Dice statistics and session reports for Foundry VTT, with Dragonbane / Drakar och Demoner support.

> **Status:** Early prototype. Version 0.5.0 adds per-character skill statistics and the first chronicle highlights.

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
7. Klicka **Visa statistik** för en enkel sessionsöversikt.
8. Klicka **Avsluta spelmöte** när sessionen är klar.

Version 0.3.0 sparar fortfarande endast Dragonbane `skillTest`.

Sessionsdata sparas som en dold world setting i Foundry-världen. Endast den GM som startade sessionen skriver till sessionsarkivet.

## Felsökning

Konsolkommandona finns kvar under prototypfasen:

```js
game.tarningskronikan.status()
game.tarningskronikan.latestSession()
game.tarningskronikan.open()
```


## Enkel statistik i v0.4.0

Statistikfönstret visar:

- antal registrerade färdighetsslag
- lyckade och misslyckade slag samt lyckandegrad
- antal Drakar och Demoner
- antal pushade slag
- antal slag med Boon respektive Bane
- d20-fördelning 1–20 för den tärning som faktiskt räknades
- enkel sammanställning per rollperson

Push-omslag räknas som ett eget registrerat slag. Vid Boon/Bane räknas endast den behållna d20:n i huvudfördelningen.


## Fördjupad statistik i v0.5.0

- rollpersoner grupperas på `actorUuid` i stället för visningsnamn
- varje rollperson får en utfällbar färdighetsöversikt
- per färdighet visas antal slag, lyckade, lyckandegrad, Drakar, Demoner och Pushar
- statistikvyn visar ett första block med **Ur kvällens krönika**
- höjdpunkterna visar mest använda färdighet samt rollperson med flest Drakar, Demoner och Pushar när sådana finns
- delade förstaplaceringar visas tillsammans
