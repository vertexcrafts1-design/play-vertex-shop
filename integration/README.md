# VertexCraft: Rangumbau und Stripe-Anbindung

Stand: 2. Oktober 2026. Website und Shop behalten ihre bisherigen Domains, öffentlichen API-Routen und bestehenden Kaufverbindungen. Dieser Ordner ist ein vorbereitetes Server-Paket, keine Bestätigung einer Installation.

## Was bereits umgesetzt wurde

- Neuer Shop mit Rangvergleich, Laufzeitwahl, Kaufhilfe und einer zusätzlichen Prüfung vor dem Stripe-Checkout.
- Der gewählte Name wird vor jeder Weiterleitung erneut mit `/api/public/exists` geprüft. Lokale Browserdaten beweisen keine Anmeldung. Bedrock-Namen mit Punkt bleiben erhalten.
- Ein `payment=success`-Link zeigt keine Zahlungsbestätigung an. Auslieferung bleibt Aufgabe des signierten Stripe-Webhooks und des Fulfillment-Plugins.
- Die elf aktuell im Shop verwendeten Payment-Link-IDs sind erhalten. `fulfillment-current.yml` enthält auch die alten IDs für verspätete Checkout-Ereignisse. Nicht durch ein leeres Mapping ersetzen.
- Sechs günstigere Preise wurden in Stripe angelegt und sind **inaktiv**. Ihre echten IDs stehen in `stripe-catalog.json`. Sie sind Einmalzahlungen, auch bei 30 Tagen; kein Abo.

## Geplanter Katalog

| Rang | 30 Tage | Dauerhaft | Homes gesamt | Itemnamen / 30 Tage |
|---|---:|---:|---:|---:|
| Bronze | 2,99 € | 12,99 € | 4 | 2 |
| Gold | 4,99 € | 19,99 € | 5 | 4 |
| Diamond | 7,99 € | 29,99 € | 6 | 6 |

Alle Home-Teleports bleiben bei 5 Sekunden. Kosmetische Rangpräfixe bleiben; keine Rangpflicht für Survival, Clans, Duelle oder Bot. Bezahlt werden kleine Komfort- und optische Extras. Keine zusätzlichen Kampfwerte, Ausrüstung, Geldmultiplikatoren, PvP-Punkte oder priorisierten Wochenbelohnungen.

## Notwendige Plugin-Änderung

Die bereitgestellte `VertexPerksShop-1.0.0-CoreHomesFix`-JAR enthält neben konfigurierbaren Homes auch fest vergebene Vorteile. Weniger Homes in der YAML-Datei schalten `/feed`, `/repair` und `/fly` nicht zuverlässig ab. Die neuere RankQueue-PAPI-Version darf dabei nicht durch eine ältere JAR ersetzt werden.

Für die tatsächlich installierte Version muss der Plugin-Quellcode angepasst und neu gebaut werden:

1. Rangvergabe und Ablauf, Offline-Warteschlange, persistierte Spieler-Ränge, PAPI und `/vrank give <Spieler> <Rang> <Dauer>` erhalten.
2. Gekaufte `/feed`, `/repair`, `/fly`, God-Effekte und portable Enderchest-Rechte aus Permission-Zuweisung, Command-Interception und Rangmenüs entfernen. Verbliebene Rank-Permission-Attachments beim Wechsel bereinigen; keine pauschale Entfernung legitimer Teamrechte.
3. Maximal 4/5/6 Homes, überall 5 Sekunden Wartezeit; vorhandene Homes nicht löschen. Bei zu vielen vorhandenen Homes nur neue Setzungen blockieren. Teleport-Sperren im Kampf erhalten.
4. Rename-Limit 2/4/6 je 30 Tage und Rangpräfixe beibehalten. Umbenennen darf keine Attribute verändern oder Items verdoppeln.
5. `/keyshop` darf kaufbare Kristalle nicht gegen Fly-/God-Potions, stärkere Ausrüstung oder spielstarke Zufallskisten eintauschen. Freie Vote-Punkte getrennt halten. Optional Kristallverkauf bis zur fertigen Cosmetic-Verwendung pausieren.
6. Premium-Pass auf optische Extras umstellen. Kostenlose und bezahlte Quests/Progression dürfen keine gekaufte Kampfstärke erzeugen. Die tatsächlichen 100 Level und Spielerfortschritte erhalten.

`perks-homes-target.yml` ist nur ein **Merge-Ausschnitt** für bekannte Home-Einstellungen. Er ist kein vollständiger Ersatz für die Plugin-Konfiguration und keine Lösung für die fest vergebenen Vorteile. Kein ungebautes oder ungetestetes Ersatz-Plugin wurde als einsatzbereit ausgegeben.

## Reihenfolge der Aktivierung

1. Aktuelle Server-Version, Plugin-Quellcode und Konfiguration sichern. Bestehende Käufe/Ränge und Checkout-Session-Deduplizierung erhalten. Gewährte Alt-Käufe bei der Umstellung gesondert berücksichtigen, statt Vorteile unangekündigt zu entziehen.
2. Die angepasste Plugin-Version auf einem Testserver mit kostenlosen, Bronze-, Gold-, Diamond-, Bedrock- und Team-Spielern prüfen, inklusive Ablauf, Neustart und Offline-Auslieferung.
3. `worker.mjs` als vorbereitete Version 3.4.1 im bestehenden Cloudflare-Worker bereitstellen. Alle bestehenden Umgebungswerte behalten. Der Origin muss vor einer Umstellung auf HTTPS eine funktionierende HTTPS-Adresse erhalten: Die bisherige Vorlage verwendet HTTP und einen Bearer-Token. Diese Vorlage allein behebt den unverschlüsselten Origin-Transport nicht.
4. Gewünschte neue Stripe-Preise aktivieren und neue Payment Links anlegen: genau ein Artikel mit Menge 1, keine variable Menge, verpflichtendes Textfeld **minecraft_name**, 1–32 Zeichen, Rechnung/Beleg und Rückkehr zur bestehenden Shop-Adresse. Dynamische Stripe-Zahlarten verwenden. Steuer-Einstellungen anhand der vorhandenen Stripe-Konfiguration/Registrierungen übernehmen; die neuen Preise sind als inklusive hinterlegt.
5. Die **tatsächlich neuen Payment-Link-IDs** zusätzlich unter `products` im Fulfillment-Plugin eintragen. Befehle bleiben `vrank give {player} bronze|gold|diamond 30d|permanent`. Alte Einträge für verspätete bezahlte Sessions erhalten. Ohne dieses Mapping keine neuen Links verkaufen.
6. Signierten Test-Checkout ausliefern; denselben Event zweimal senden und prüfen, dass der Checkout-Session-ID wegen genau einmal geliefert wird. Unbezahlte, ungültig signierte und falsche Spieler-Ereignisse dürfen keine Befehle auslösen.
7. Erst danach `checkout-core.js`, Produktpreise/-vorteile im Shop und den Vergleich auf die aktivierten Angebote umstellen; `faire-raenge.html` vom geplanten zum aktiven Stand ändern. Website-Vorteile, Checkout-Betrag und Server-Auslieferung müssen übereinstimmen.

## Vorbereitete Worker-Verbesserungen

`worker.mjs` basiert auf der bereitgestellten Produktionsvorlage 3.4.0. Änderungen: Zahlungsstatus bei beiden akzeptierten Event-Typen prüfen; Spielername vor Übergabe an Commands streng validieren und Bedrock-Punkt erlauben. HMAC-Signaturprüfung, Zeitfenster, öffentliche GET-Routen, Team-Sitzungen, Rollen, Management-Befehle, Origin und Retry-Verhalten bleiben erhalten. Keine neuen Secrets im Browser.

Die Session-Deduplizierung liegt weiterhin beim bestehenden Fulfillment-Plugin. Ein nicht erreichbarer Origin liefert 502 an Stripe, damit Stripe erneut zustellt. HTTP-Rückkehr-Parameter sind nie Auslieferungsbelege.

## Prüfung und Grenzen

`node --test tests/checkout-contract.test.cjs tests/worker.test.cjs` prüft Namensvalidierung, erlaubte Links, API-Ausfälle, falsche Erfolgsmeldung, signierte Events, verzögerte Zahlungen, ungültige Spieler, abgelaufene Signaturen, Origin-Ausfälle und die Trennung öffentlicher und geschützter Routen. Die Fixtures lösen keine echte Zahlung aus.

Ein tatsächlicher Kauf, Server-Neustart, Plugin-Upgrade und Live-Webhook konnten ohne Server-/Cloudflare-Zugriff nicht nachgewiesen werden. Der vorhandene öffentliche Worker antwortete aus dieser Umgebung mit Cloudflare 403 / Fehler 1010. Das beweist keinen allgemeinen Serverausfall. Für die vollständige Umstellung fehlen der aktuelle Plugin-Quellcode und eine Möglichkeit, die Server-/Worker-Änderungen einzuspielen.
