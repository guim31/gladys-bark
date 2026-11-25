# Bark

Erhalte die Nachrichten von Gladys auf deinem iPhone mit
[Bark](https://bark.day.app), einer kostenlosen, quelloffenen iOS-App für
Push-Benachrichtigungen: die Nachrichten deiner Szenen, die Antworten von
Gladys und ihre Systemnachrichten, dazu Benachrichtigungen mit Titel, Stufe,
Ton, Link und Bild aus deinen Szenen. Nutze den offiziellen Bark-Server
(`api.day.app`) oder deinen eigenen `bark-server`.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Diese
> Integration wurde gegen einen echten bark-server (v2.4.0) getestet, der ihre
> Anfragen angenommen hat, aber weder mit einem iPhone noch in einer echten
> Gladys-Installation. Wenn etwas nicht wie beschrieben funktioniert, sag es
> im [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-bark/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer, mit Internetzugang.
- Die App **Bark** auf jedem iPhone (oder iPad), das die Benachrichtigungen
  erhält, aus dem App Store. Öffne sie einmal und erlaube Benachrichtigungen.
- Den **Geräteschlüssel** jedes iPhones: Die Bark-App zeigt eine Adresse wie
  `https://api.day.app/AbCdEf.../`; der Schlüssel ist der Teil nach der
  Serveradresse. Die ganze Adresse zu kopieren geht auch.
- Optional: dein eigener Server
  ([bark-server](https://github.com/Finb/bark-server), Docker-Image
  `finab/bark-server`), ebenfalls in der Bark-App gewählt. Jede
  Benachrichtigung läuft trotzdem über den Benachrichtigungsdienst von Apple.

## Einrichtung

Installiere die Integration über **Integrationen → Von GitHub installieren**
mit der Adresse `https://github.com/guim31/gladys-bark` und fülle dann ihre
Konfiguration aus:

- **Adresse des Bark-Servers**: standardmäßig `https://api.day.app`, sonst die
  Adresse deines bark-servers (ein Pfad hinter einem Reverse-Proxy geht).
- **Geräteschlüssel für Szenen**: die Schlüssel der iPhones, die die
  Szenen-Benachrichtigungen und den Test erhalten. Mehrere iPhones: Trenne die
  Schlüssel durch Kommas.
- **Standardstufe**: wie iOS die Benachrichtigungen zeigt (siehe unten).
- **Benachrichtigungsgruppe**: Bark gruppiert die Benachrichtigungen unter
  diesem Namen (standardmäßig Gladys).
- **Verschlüsselungsschlüssel (optional)**: um die Texte zu verschlüsseln, wie
  es die Bark-App erlaubt. Öffne in der App die Verschlüsselungseinstellungen,
  wähle AES, Modus CBC, Padding PKCS7 und einen Schlüssel mit 16, 24 oder
  32 Zeichen (AES-128, 192 oder 256); gib hier denselben Schlüssel ein. Der IV
  ist für jede Benachrichtigung zufällig: Lass den IV der App, wie er ist.
  Leer: unverschlüsselt. Der Schlüssel gilt für alle Nachrichten, auch die persönlichen: Jedes iPhone muss ihn in seiner Bark-App verwenden.
- **Selbstsigniertes Zertifikat akzeptieren**: nur für eine `https://`-Adresse
  deines eigenen Servers, deren Zertifikat du selbst erstellt hast.
- **Sprache der Texte der Integration**: die Fehler der Szenenaktion, die
  Testbenachrichtigung und der Hinweis in einer Nachricht, deren Bild nicht
  mitgeschickt werden konnte.

Klicke dann auf **Testbenachrichtigung senden**: Die Integration prüft den
Server und sendet eine Benachrichtigung an die Geräteschlüssel für Szenen.

**Mein Konto**: Jeder Gladys-Benutzer entscheidet im Block „Mein Konto“ der
Integrationsseite, ob er die Nachrichten erhält, die Gladys ihm sendet:

- **Dein Geräteschlüssel**: der Schlüssel (oder die Adresse) DEINER Bark-App.
  Mehrere Geräte (iPhone und iPad): Trenne sie durch Kommas.
- **Stufe deiner Nachrichten**: deine eigene Stufe oder _Standard der
  Integration_.

Ein Benutzer ohne Schlüssel erhält nichts: Die Geräteschlüssel für Szenen
dienen nie für eine persönliche Nachricht. **Meine Werte löschen** beendet die
Nachrichten.

## Was Gladys sendet

Jede Nachricht, die Gladys an einen Benutzer sendet, geht über Bark, wenn
dieser Benutzer einen Schlüssel in „Mein Konto“ gespeichert hat: die
Szenenaktion **Nachricht senden**, die Antworten von Gladys und ihre
Systemnachrichten. In der Aktion **Nachricht senden** lassen dich neuere
Gladys-Versionen den Kanal wählen.

- Der Titel ist „Gladys“, in der Benachrichtigungsgruppe der Konfiguration.
- Bark nimmt Bilder nur per Adresse: Das Bild von **Kamerabild senden** wird
  weggelassen, und eine Zeile unter dem Text sagt das.
- Sehr lange Texte werden gekürzt (Apple lehnt eine Benachrichtigung über 4 KB
  ab).

Die Stufen, wie iOS sie zeigt:

| Stufe        | Benachrichtigung                                           |
| ------------ | ---------------------------------------------------------- |
| Normal       | Ton und Banner                                             |
| Zeitkritisch | auch in einem Fokus-Modus angezeigt                        |
| Passiv       | lautlos, nur in die Liste aufgenommen                      |
| Kritisch     | klingelt auch im Stumm-Modus (in der Bark-App zu erlauben) |

## Dashboard

Das Widget **Bark** zeigt:

- ob der Server antwortet, und seine Version, wenn er sie nennt;
- die heute gesendeten Benachrichtigungen und die Fehler mit dem letzten
  Grund;
- die letzten von **Szenen** gesendeten Benachrichtigungen (Titel, Datum,
  Stufe oder „Nicht gesendet“). Die Nachrichten, die Gladys an einen einzelnen
  Benutzer sendet, werden gezählt, aber nie aufgelistet: Das Dashboard sieht
  der ganze Haushalt;
- eine Schaltfläche **Test senden**, die dasselbe tut wie der Test in der
  Konfiguration.

In den Widget-Einstellungen lassen sich die Liste und die Schaltfläche
ausblenden.

## Szenen

### Auslöser

- **Bark-Server offline**: Der Server antwortet nicht mehr. Er muss bei zwei
  Prüfungen im Abstand von 30 Sekunden scheitern (alle 5 Minuten eine Prüfung,
  und direkt nach einem Versand, der den Server nicht erreicht hat). Variable: der Fehler.
- **Bark-Server wieder online**: Der Server antwortet wieder, nachdem er
  offline war. Variable: die Serverversion (leer, wenn unbekannt).
- **Bark-Benachrichtigung nicht gesendet**: Eine Nachricht konnte nicht
  gesendet werden. Filter: der Grund (Server nicht erreichbar,
  Geräteschlüssel fehlt oder abgelehnt, Konfiguration unvollständig, Nachricht
  abgelehnt) und der Absender (eine Gladys-Nachricht oder die
  Bark-Szenenaktion). Variablen: Grund, Absender, Fehler. Um Schleifen zu
  vermeiden, löst er höchstens einmal pro Grund alle 15 Minuten aus.

Der erste nach der Installation oder nach einer neuen Adresse bekannte Zustand
wird nicht gemeldet: nur eine Änderung.

### Aktionen

**Bark-Benachrichtigung senden**, an die Geräteschlüssel für Szenen:

- **Titel** und **Untertitel** (optional).
- **Nachricht** (Pflicht). Szenenvariablen funktionieren hier wie in jedem
  Feld.
- **Stufe**: eine aus der Liste oder _Standard der Integration_.
- **Ton**: einer der Klingeltöne der Bark-App oder ihr Standardton.
- **30 Sekunden lang klingeln**: Der Ton wiederholt sich wie bei einem Anruf.
- **Gruppe** (optional): sonst die Gruppe der Konfiguration.
- **Link beim Antippen** (optional): eine `https://`-Adresse oder ein App-Link
  (`shortcuts://`, `tel:`, `mailto:`, `maps:`, `sms:`).
- **Bildadresse** und **Symboladresse** (optional): `https://`-Bilder. Dein
  iPhone lädt sie herunter: Die Bilder müssen vom Telefon aus erreichbar sein, nicht
  nur von Gladys.

Die Aktion gibt den nächsten Aktionen der Szene drei Werte weiter:
**Benachrichtigung gesendet** (ja, wenn jedes Gerät sie erhalten hat),
**Erreichte Geräte** und **Fehler** (leer bei Erfolg). Ein falsches Feld (eine
leere Nachricht, ein unbekannter Ton, ein nicht erlaubter Link) lässt die
Aktion scheitern, und das Szenenprotokoll nennt den Grund.

### Szenen-Ideen

- **Alarm**: Wenn der Alarm auslöst, **Bark-Benachrichtigung senden** mit dem
  Titel „Alarm“, Stufe Kritisch, Ton alarm, mit **30 Sekunden lang
  klingeln**.
- **Ausweichweg**: Bei **Bark-Benachrichtigung nicht gesendet** mit dem Grund
  „Server nicht erreichbar“ die Nachricht über einen anderen Kanal senden.
  Nicht mit einer weiteren Bark-Benachrichtigung antworten.
- **Waschmaschine**: Wenn die Leistung der Steckdose sinkt, eine passive
  Benachrichtigung „Wäsche fertig“, die niemanden weckt.

## Fehlerbehebung

Die Konfiguration zeigt den Zustand des Servers. Die Meldungen:

- _der Bark-Server antwortet nicht_: Prüfe die Adresse und ob Gladys
  Internetzugang hat (oder ob dein bark-server läuft). Gladys betreibt die
  Integration in einem eigenen Docker-Netz: `localhost` ist die Integration
  selbst.
- _Geräteschlüssel diesem Server unbekannt_: Der Schlüssel ist falsch oder
  gehört zu einem anderen Server (die Bark-App zeigt, zu welchem).
- _Apple kennt dieses iPhone nicht mehr_: Die Bark-App wurde gelöscht oder neu
  installiert; öffne sie und kopiere den neuen Schlüssel.
- _der Verschlüsselungsschlüssel muss 16, 24 oder 32 Zeichen haben_: Korrigiere
  den Schlüssel oder leere ihn.
- _Zertifikat abgelehnt_: Aktiviere **Selbstsigniertes Zertifikat
  akzeptieren**.
- _kein Geräteschlüssel_: Fülle **Geräteschlüssel für Szenen** aus.

Ein Benutzer erhält nichts? Prüfe, ob er einen Schlüssel in „Mein Konto“
gespeichert hat und ob die Aktion **Nachricht senden** der Szene nicht nur an
einen anderen Kanal sendet. Die Protokolle der Integration geben Details; sie
zeigen nie einen Schlüssel.

## Grenzen

- **Nur senden**: Bark hat keine Antworten. Du kannst von Bark aus nicht mit
  Gladys sprechen.
- Nur iPhone und iPad (Bark ist eine iOS-App).
- Keine Kamerabilder in Gladys-Nachrichten: Bark zeigt nur Bilder von einer
  Webadresse.
- Internet nötig: Jede Benachrichtigung läuft über Apple, auch von deinem
  eigenen Server.
- Verschlüsselung: nur AES im Modus CBC (weder ECB noch GCM), ein Schlüssel für alle iPhones.
- Keine Serveradresse mit Benutzername und Passwort (Basic-Authentifizierung).
- Gegen einen echten bark-server v2.4.0 getestet, aber weder mit einem iPhone
  noch in einem echten Gladys: Der letzte Schritt, die Zustellung durch Apple
  an das Telefon, konnte nicht geprüft werden.
- Der offizielle Server ist ein kostenloser Dienst des Bark-Autors: Halte die
  Zahl der Benachrichtigungen in vernünftigen Grenzen.

Diese Integration ist weder mit Bark noch mit seinem Autor verbunden.
