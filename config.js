// ============================================================
//  Konfiguration der Strichliste
//  Ersetze die Platzhalter durch deine eigenen Werte.
//  Eine Schritt-für-Schritt-Anleitung steht in README.md.
// ============================================================

// 1) Firebase-Konfiguration
//    Zu finden in der Firebase-Konsole unter
//    Projekteinstellungen → Allgemein → Meine Apps → SDK-Einrichtung und -Konfiguration → „Konfiguration“.
export const firebaseConfig = {
  apiKey: "DEIN_API_KEY",
  authDomain: "DEIN-PROJEKT.firebaseapp.com",
  databaseURL: "https://DEIN-PROJEKT-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "DEIN-PROJEKT",
  storageBucket: "DEIN-PROJEKT.firebasestorage.app",
  messagingSenderId: "DEINE_SENDER_ID",
  appId: "DEINE_APP_ID",
};

// 2) Einstellungen der Strichliste
export const appConfig = {
  // Geheimer Name eurer Gruppe – wer ihn kennt (bzw. die App-Adresse hat), kann mitzählen.
  // Mindestens 12 Zeichen, erlaubt sind nur A–Z, a–z, 0–9, - und _
  // Beispiel: "stammtisch-K7q2xP9mWd"
  groupId: "HIER-GEHEIME-GRUPPEN-ID",

  // Was wird gezählt?
  title: "Strichliste",
  itemSingular: "Bier",
  itemPlural: "Biere",
  emoji: "🍺",
};
