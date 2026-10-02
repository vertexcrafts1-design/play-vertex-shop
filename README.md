# VertexCraft Shop

Statischer Shop unter play-vertex.shop. Alle elf aktuellen Stripe-Verbindungen bleiben erhalten. Faire niedrigere Rangpreise sind in Stripe inaktiv angelegt; Details und die noch notwendige Plugin-/Worker-Umstellung stehen in [integration/README.md](integration/README.md).

Prüfen: `node --test tests/checkout-contract.test.cjs tests/worker.test.cjs` und `node tests/checkout-handlers.test.cjs`. Die Handler-Tests nutzen den tatsächlichen Shop-Code mit einem simulierten DOM/Server. `tests/checkout.spec.cjs` enthält zusätzlich die Browserfälle und benötigt Playwright mit Chromium. Die Fixtures lösen keine Zahlung aus.

`checkout-core.js` enthält die festen zulässigen Stripe-URLs, Namensprüfung und API-Vorabprüfung. `shop-v3.js` verbindet die Auswahl mit den nativen Dialogen und der finalen Prüfung. `vertex.css` entspricht dem öffentlichen Design; `shop.css` enthält die Shop-Komponenten. Keine API-Secrets in Website-Dateien speichern.
