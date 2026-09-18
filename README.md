# Tärningskrönikan

Dice statistics and session reports for Foundry VTT, with Dragonbane / Drakar och Demoner support.

> **Status:** Early prototype. Version 0.1.0 only verifies that Foundry dice rolls can be detected.

## Installera prototypen

1. Öppna Foundry VTT Setup.
2. Gå till **Add-on Modules** och välj **Install Module**.
3. Klistra in manifestadressen:

   `https://raw.githubusercontent.com/PelleRosqvist/tarningskronikan/main/module.json`

4. Installera modulen.
5. Starta din testvärld och aktivera **Tärningskrönikan** under **Manage Modules**.

## Test

Öppna webbläsarens utvecklarkonsol med F12 och gör ett tärningsslag.

Prototypen ska skriva bland annat:

```text
Tärningskrönikan | Initierad
Tärningskrönikan | Redo att lyssna på tärningsslag
Tärningskrönikan | Tärningsslag upptäckt!
```

Ingen statistik sparas ännu.
