# 🍺 Strichliste (BeerCounter)

Eine Strichliste für eure Gruppe als Web-App fürs Handy: Jede und jeder zählt bei sich selbst mit einem großen **+**-Button,
alle Handys sehen den Stand **live**. Läuft komplett im Browser, lässt sich wie eine App auf den Startbildschirm legen
und braucht keinen eigenen Server.

**Funktionen**

- Liste aller Mitglieder mit aktuellem Zählerstand (plus echte Zählstriche und Medaillen 🥇🥈🥉 für die Spitze)
- Große **+ / −**-Buttons für jedes Mitglied
- Mitglieder hinzufügen, umbenennen und entfernen
- **Rückgängig** für den letzten Klick (pro Gerät, auch mehrfach hintereinander)
- **Gesamtsumme** oben rechts und **Reset aller Zähler** mit Sicherheitsabfrage (vorher kann der Stand geteilt werden)
- Optional: **4-stellige PIN pro Mitglied** – dann kann nur zählen, wer die PIN kennt
- „Das bin ich“: das eigene Mitglied steht oben und ist hervorgehoben
- Live-Sync über Firebase Realtime Database, funktioniert auch kurz offline
- Dark Mode, auf Deutsch, große Touch-Flächen, als App installierbar (iOS & Android)

**Technik:** reines HTML/CSS/JavaScript ohne Build-Schritt · Firebase Web-SDK per CDN · Hosting auf Vercel

---

## Inhalt des Repositorys

| Datei | Zweck |
| --- | --- |
| `index.html` | Die Seite selbst |
| `styles.css` | Aussehen (Dark Mode, Handy-Layout) |
| `app.js` | Die gesamte App-Logik |
| `config.js` | **Deine Einstellungen** – Firebase-Werte und Gruppen-ID (hier musst du etwas eintragen) |
| `database.rules.json` | Sicherheitsregeln für die Firebase-Datenbank |
| `manifest.json` | Damit sich die App auf den Startbildschirm legen lässt |
| `sw.js` | Service Worker (schneller Start, funktioniert bei Funklöchern) |
| `icons/` | App-Icon in allen nötigen Größen |

---

## Einrichtung – Schritt für Schritt vom Handy aus

Dauer: etwa 15 Minuten. Du brauchst ein **Google-Konto** (für Firebase) und dein **GitHub-Konto**.

> **Tipp für das Handy:** Die Firebase-Konsole ist auf kleinen Bildschirmen etwas eng. Wenn ein Menüpunkt fehlt oder
> abgeschnitten ist, dreh das Handy quer oder fordere die Desktop-Ansicht an
> (Safari: **aA** in der Adressleiste → „Desktop-Website anfordern“, Chrome: **⋮** → „Desktopversion“).
> Je nach Spracheinstellung heißen manche Menüpunkte englisch (z. B. „Build“, „Sign-in method“) – in Klammern
> stehen hier jeweils beide Varianten.

### Schritt 1 – Firebase-Projekt anlegen

1. Öffne **<https://console.firebase.google.com>** und melde dich mit deinem Google-Konto an.
2. Tippe auf **„Projekt erstellen“** (bzw. „Neues Firebase-Projekt erstellen“ / „Create a project“).
3. Gib einen Namen ein, z. B. `strichliste`, akzeptiere die Bedingungen und tippe auf **Weiter**.
4. KI-Unterstützung (Gemini) und **Google Analytics** werden nicht gebraucht – beides kannst du ausschalten.
5. Tippe auf **„Projekt erstellen“**, warte kurz und dann auf **Weiter**.

### Schritt 2 – Anonyme Anmeldung aktivieren

Jedes Handy meldet sich unsichtbar und ohne Passwort bei Firebase an. So kommen nur echte App-Nutzer an die Datenbank,
und jedes Gerät kann sich seine PIN-Freischaltung einzeln merken.

1. Öffne das Menü **☰** (oben links) → Bereich **„Build“ / „Entwickeln“** → **Authentication**.
2. Tippe auf **„Jetzt starten“** (Get started).
3. Wähle den Tab **„Anmeldemethode“** (Sign-in method) → Anbieter **„Anonym“** (Anonymous).
4. Schalter auf **Aktivieren** → **Speichern**.

### Schritt 3 – Realtime Database anlegen

1. Menü **☰** → **„Build“ / „Entwickeln“** → **Realtime Database** (⚠️ nicht „Firestore Database“).
2. Tippe auf **„Datenbank erstellen“** (Create Database).
3. Standort: **„Belgien (europe-west1)“** → **Weiter**.
4. Wähle **„Im gesperrten Modus starten“** (Start in locked mode) → **Aktivieren**.
5. Oben über den (noch leeren) Daten steht jetzt die Adresse deiner Datenbank, etwa
   `https://strichliste-1a2b3-default-rtdb.europe-west1.firebasedatabase.app` – das ist deine **databaseURL**.

### Schritt 4 – Sicherheitsregeln einfügen

1. Öffne in einem zweiten Tab dieses Repository auf GitHub und dort die Datei **`database.rules.json`**.
2. Tippe auf **„Raw“** (oder im **…**-Menü auf „View raw“), markiere den gesamten Text und kopiere ihn.
   Alternativ gibt es oben rechts ein Kopieren-Symbol („Copy raw file“).
3. Zurück in Firebase: **Realtime Database** → Tab **„Regeln“** (Rules).
4. Lösche alles, was im Editor steht, füge den kopierten Text ein und tippe auf **„Veröffentlichen“** (Publish).

> Zeigt der Editor einen Fehler an, wurde beim Kopieren meist etwas abgeschnitten. Der Text muss mit `{` beginnen und
> mit `}` enden.

### Schritt 5 – Web-App registrieren und Konfiguration kopieren

1. Tippe oben auf das **Zahnrad ⚙️** neben „Projektübersicht“ → **„Projekteinstellungen“**.
2. Im Tab **„Allgemein“** ganz nach unten zu **„Meine Apps“** scrollen und auf das Web-Symbol **`</>`** tippen.
3. App-Spitzname eingeben, z. B. `strichliste-web`. „Firebase Hosting“ **nicht** anhaken (wir nutzen Vercel).
   → **„App registrieren“**.
4. Jetzt erscheint ein Code-Block mit `const firebaseConfig = { … }`. Kopiere die Werte – am einfachsten den ganzen
   Block in eine Notiz-App, damit du sie gleich zur Hand hast. Danach **„Weiter zur Konsole“**.
5. Prüfe, ob darin eine Zeile **`databaseURL`** vorkommt. Falls nicht, nimm die Adresse aus Schritt 3.

> Die Werte findest du später jederzeit wieder unter Projekteinstellungen → Allgemein → Meine Apps →
> „SDK-Einrichtung und -Konfiguration“ → **„Konfiguration“**.

### Schritt 6 – Werte in `config.js` eintragen (direkt auf GitHub)

1. Öffne **github.com** im Browser (nicht in der GitHub-App – dort lassen sich Dateien kaum bearbeiten), melde dich an
   und öffne dieses Repository → Branch **`main`** → Datei **`config.js`**.
2. Tippe auf den **Stift ✏️** („Edit this file“). Siehst du keinen Stift: **…**-Menü → „Edit file“ oder Desktop-Ansicht.
3. Ersetze die Platzhalter durch deine Werte aus Schritt 5. **Die Anführungszeichen und Kommas bleiben stehen!**
   Fertig sieht es zum Beispiel so aus:

   ```js
   export const firebaseConfig = {
     apiKey: "AIzaSyB1x2y3z4…",
     authDomain: "strichliste-1a2b3.firebaseapp.com",
     databaseURL: "https://strichliste-1a2b3-default-rtdb.europe-west1.firebasedatabase.app",
     projectId: "strichliste-1a2b3",
     storageBucket: "strichliste-1a2b3.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abc123def456",
   };
   ```

4. Denk dir eine **geheime Gruppen-ID** aus und trage sie bei `groupId` ein: mindestens 12 Zeichen, nur Buchstaben
   (ohne Umlaute), Ziffern, `-` und `_`. Beispiel: `groupId: "stammtisch-K7q2xP9mWd",`
   Sie sorgt dafür, dass niemand ohne euren App-Link eure Daten findet. Wird sie später geändert, beginnt eine neue,
   leere Liste.
5. Optional: Was gezählt wird, stellst du unter `title`, `itemSingular`, `itemPlural` und `emoji` ein
   (z. B. `"Kaffeeliste"`, `"Kaffee"`, `"Kaffees"`, `"☕"`).
6. Tippe auf **„Commit changes…“**, wähle „Commit directly to the `main` branch“ und bestätige mit **„Commit changes“**.

### Schritt 7 – Repository mit Vercel verbinden

1. Öffne **<https://vercel.com>** → **„Sign Up“** → Plan **„Hobby“** (kostenlos) → **„Continue with GitHub“** und
   erlaube den Zugriff.
2. Im Dashboard: **„Add New…“** → **„Project“**.
3. Unter „Import Git Repository“ dein Repository **BeerCounter** suchen → **„Import“**.
   Taucht es nicht auf: „Adjust GitHub App Permissions“ / „Configure GitHub App“ antippen und Vercel den Zugriff auf
   das Repository erlauben.
4. Einstellungen: **Framework Preset: „Other“**, Root Directory `./`, bei „Build and Output Settings“ **nichts
   eintragen** (es gibt keinen Build-Schritt). → **„Deploy“**.
5. Nach etwa einer halben Minute erscheint „Congratulations!“. Über **„Continue to Dashboard“** siehst du deine
   Adresse, z. B. `https://beercounter-xyz.vercel.app` – öffne sie. Die Strichliste sollte jetzt leer starten.

Ab jetzt veröffentlicht Vercel jede Änderung im `main`-Branch automatisch nach etwa einer Minute.

### Schritt 8 – Vercel-Adresse in Firebase freigeben (empfohlen)

Firebase → **Authentication** → Tab **„Einstellungen“** (Settings) → **„Autorisierte Domains“** →
**„Domain hinzufügen“** → deine Vercel-Adresse **ohne** `https://` eintragen, z. B. `beercounter-xyz.vercel.app`.

### Schritt 9 – App auf den Startbildschirm legen

- **iPhone / iPad (Safari):** Adresse öffnen → **Teilen-Symbol** (Quadrat mit Pfeil nach oben) →
  **„Zum Home-Bildschirm“** → „Hinzufügen“.
- **Android (Chrome):** Adresse öffnen → unten in der Liste **„App auf dem Startbildschirm installieren“** antippen,
  oder **⋮** → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

### Schritt 10 – Link an die Gruppe schicken

Schick die Vercel-Adresse in eure Gruppe. Alle öffnen sie, legen die App auf den Startbildschirm – fertig. 🍻

---

## Bedienung

| Was | Wie |
| --- | --- |
| Zählen | Großer **+**-Button beim eigenen Namen, **−** nimmt einen Strich weg |
| Rückgängig | Button unten links – macht den letzten Klick **dieses Geräts** rückgängig (mehrfach möglich) |
| Mitglied hinzufügen | Button **„+ Mitglied“** unten rechts, optional mit PIN |
| Mitglied-Menü | Auf den Namen (oder **⋯**) tippen: „Das bin ich“, Umbenennen, PIN festlegen/ändern/entfernen, auf diesem Gerät sperren, Mitglied entfernen |
| Gesamtsumme | Oben rechts |
| Stand teilen | Unter der Liste – verschickt den Stand z. B. per WhatsApp |
| Alles zurücksetzen | Unter der Liste – mit Sicherheitsabfrage, der Stand kann vorher geteilt werden |

Ist das Handy kurz offline, wird weiter gezählt und später übertragen – ein roter Hinweis zeigt das an. Bis dahin die
App bitte nicht ganz schließen.

## Die PIN – so funktioniert sie

- Eine PIN kann beim Hinzufügen oder später über das Mitglied-Menü festgelegt werden.
- Das Gerät, auf dem die PIN festgelegt wird, ist sofort entsperrt. Auf jedem anderen Gerät muss die PIN **einmal**
  eingegeben werden; danach merkt sich das Gerät die Freischaltung.
- Die PIN wird **von der Datenbank selbst** geprüft: Ohne Freischaltung lehnt Firebase jeden Strich für dieses Mitglied
  ab – auch wenn jemand an der App vorbei direkt auf die Datenbank zugreift.
- Gespeichert wird nur ein Hash der PIN, und der ist für niemanden lesbar.
- Ein entsperrtes Gerät kann die PIN ändern, entfernen oder sich über „Auf diesem Gerät sperren“ wieder sperren.
- **PIN vergessen?** Wer die PIN noch kennt, kann sie ändern. Ansonsten: Steht der Zähler auf 0 (z. B. nach
  „Alle Zähler zurücksetzen“), lässt sich das Mitglied auch ohne PIN entfernen und neu anlegen.
- „Alle Zähler zurücksetzen“ ist bewusst für alle erlaubt und setzt auch Mitglieder mit PIN auf 0.
- Ehrlich gesagt: Eine 4-stellige PIN schützt gut vor versehentlichem oder frechem Mitzählen unter Freunden – gegen
  jemanden, der gezielt per Skript alle 10.000 Kombinationen durchprobiert, ist sie kein Tresor.

## Sicherheit – was die Regeln in `database.rules.json` tun

- **Nur angemeldete Geräte** (anonyme Anmeldung über die App) dürfen lesen und schreiben.
- Gelesen werden kann nur **innerhalb einer Gruppe** (`groups/<groupId>`). Die Liste aller Gruppen und die gesamte
  Datenbank sind gesperrt – wer eure Gruppen-ID nicht kennt, findet eure Daten nicht.
- **Daten werden geprüft:** Namen 1–30 Zeichen, Zähler nur ganze Zahlen von 0 bis 9999, pro Schreibvorgang nur
  **+1, −1 oder Reset auf 0** (niemand kann sich „mal eben 50 Bier“ eintragen), keine zusätzlichen Felder.
- Mitglieder mit PIN: Zählen, Umbenennen und PIN ändern nur mit Freischaltung; Entfernen nur mit Freischaltung oder bei
  Zählerstand 0.
- PIN-Hashes und Freischaltungen sind nicht lesbar.

Gut zu wissen:

- Der `apiKey` in `config.js` ist **kein Geheimnis** – bei Firebase-Web-Apps ist er immer öffentlich sichtbar.
  Geschützt werden die Daten durch die Regeln oben.
- Wer den Link zu eurer App hat, kann mitmachen. Teilt ihn also nur in der Gruppe.

## Anpassen

- **Was gezählt wird, Titel, Emoji:** `appConfig` in `config.js`
- **Name unter dem App-Icon:** `name` und `short_name` in `manifest.json` sowie `<title>` und
  `apple-mobile-web-app-title` in `index.html`
- **Farben:** Variablen ganz oben in `styles.css` (`--accent` ist das Bier-Orange)
- **Icon:** `icons/icon.svg` und die PNG-Dateien in `icons/`
- **Firebase-SDK-Version:** steht in `app.js` und `sw.js` (`FIREBASE_VERSION`), beide gleich halten

## Fehlerbehebung

| Meldung / Problem | Lösung |
| --- | --- |
| „Noch nicht eingerichtet“ | In `config.js` stehen noch Platzhalter – siehe Schritt 6. |
| „config.js ist fehlerhaft“ | Tippfehler in `config.js`: Fehlt ein Anführungszeichen `"`, ein Komma oder eine Klammer? |
| „Anonyme Anmeldung ist nicht aktiviert“ | Schritt 2 nachholen. |
| „Zugriff verweigert“ | Regeln aus Schritt 4 veröffentlicht? Gruppen-ID mindestens 12 Zeichen, nur erlaubte Zeichen? |
| Bleibt bei „Verbinde …“ hängen | `databaseURL` prüfen (genau die Adresse aus Schritt 3, inkl. Region) und Internetverbindung prüfen. |
| Änderungen kommen nicht an | Vercel braucht nach einem Commit etwa eine Minute. Danach die App einmal ganz schließen und neu öffnen. |
| iPhone fragt in der Startbildschirm-App erneut nach der PIN | Normal: Safari und die installierte App haben getrennte Speicher. PIN einmal in der App eingeben. |

## Kosten

Für eine Gruppe reicht der kostenlose **Spark-Tarif** von Firebase locker (Realtime Database: 1 GB Speicher,
10 GB Download pro Monat, 100 gleichzeitige Verbindungen). Ein Upgrade auf „Blaze“ ist nicht nötig.
**Vercel Hobby** ist für private Projekte ebenfalls kostenlos.

## Für Neugierige

**Datenmodell** in der Realtime Database:

```text
groups/
  <groupId>/
    members/<id>          { name, count, createdAt, hasPin }
    pins/<id>             SHA-256-Hash der PIN (nicht lesbar)
    unlocks/<id>/<uid>    Freischaltung eines Geräts (nicht lesbar)
    meta/resetAt          Zeitpunkt des letzten Resets
```

**Lokal testen** (am Rechner, optional): Im Projektordner `python3 -m http.server 8080` starten und
<http://localhost:8080> öffnen. Die PIN-Funktion braucht HTTPS oder `localhost`.
