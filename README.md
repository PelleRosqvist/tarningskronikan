# Tärningskrönikan

Dice statistics and session reports for Foundry VTT, with Dragonbane / Drakar och Demoner support.

> **Status:** Early prototype. Version 0.7.0 can publish a session summary directly to Discord through a webhook.

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

Version 0.6.0 sparar Dragonbane `skillTest` och `attributeTest`.

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


## Egenskapsslag i v0.6.0

Tärningskrönikan registrerar nu även Dragonbane `attributeTest`.

Egenskapsslag får samma grundstatistik som färdighetsslag:

- resultat och målvärde
- lyckat eller misslyckat
- Drake och Demon
- Boon och Bane
- Push och koppling till originalslaget

I rollpersonsöversikten visas de tillsammans med övriga tester, till exempel som `Egenskap: STY` eller systemets lokaliserade namn.

v0.6.0 flyttar dessutom den vertikala scrollningen till Foundrys egen `.window-content`, så statistikfönstret ska kunna scrollas även när innehållet är högre än tillgänglig skärmyta.


## Discord-export i v0.7.0

Tärningskrönikan kan skicka statistikrapporten direkt till en Discord-kanal utan någon extra Foundry-modul.

1. Skapa en webhook i Discord för den kanal som ska ta emot krönikan.
2. Öppna en Tärningskrönikan-statistikrapport som GM.
3. Klicka **Konfigurera Discord** och klistra in webhook-URL:en.
4. Klicka **Skicka till Discord**.

Webhook-URL:en sparas som en Foundry `user`-setting för den GM-användare som konfigurerar den och är inte en del av Tärningskrönikans world-data.

Discord-meddelandet skickas som en embed med:

- sessionens namn och tid
- totalt antal slag och lyckandegrad
- Drakar, Demoner, Pushar, Boon och Bane
- krönikehöjdpunkter
- en kompakt sammanfattning per rollperson

Publicering är manuell. Att avsluta en session skickar inget automatiskt till Discord.
