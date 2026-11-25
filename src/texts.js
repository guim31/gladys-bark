// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, the "Send a test notification" report, the errors of the
// scene action, the line replacing a dropped image. Four languages, the four
// of the Gladys interface; German says "du", Spanish "usted".
// test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';
import { ERROR_KINDS } from './bark/client.js';

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** Applies `render` to each language of a table of functions. */
export const each = (table, render) =>
  Object.fromEntries(Object.entries(table).map(([lang, value]) => [lang, render(value, lang)]));

// Appended to a Gladys message whose camera image could not follow.
export const IMAGE_DROPPED = {
  en: 'Image not sent: Bark only shows images from a web address.',
  fr: "Image non transmise : Bark n'affiche que des images publiées sur le web.",
  de: 'Bild nicht gesendet: Bark zeigt nur Bilder von einer Webadresse.',
  es: 'Imagen no enviada: Bark solo muestra imágenes de una dirección web.',
};

// One short explanation per error kind (src/bark/client.js), plus the
// invalid scene action fields.
export const ERROR_TEXT = {
  [ERROR_KINDS.NO_SERVER]: {
    en: 'enter the address of the Bark server in the configuration',
    fr: "saisissez l'adresse du serveur Bark dans la configuration",
    de: 'gib die Adresse des Bark-Servers in der Konfiguration ein',
    es: 'introduzca la dirección del servidor Bark en la configuración',
  },
  [ERROR_KINDS.INVALID_URL]: {
    en: 'address not understood, e.g. https://api.day.app',
    fr: 'adresse incomprise, ex. https://api.day.app',
    de: 'Adresse nicht verstanden, z. B. https://api.day.app',
    es: 'dirección no válida, p. ej. https://api.day.app',
  },
  [ERROR_KINDS.NO_KEY]: {
    en: 'no device key: copy it from the Bark app into the configuration',
    fr: "aucune clé d'appareil : copiez-la depuis l'appli Bark dans la configuration",
    de: 'kein Geräteschlüssel: Kopiere ihn aus der Bark-App in die Konfiguration',
    es: 'ninguna clave de dispositivo: cópiela de la aplicación Bark en la configuración',
  },
  [ERROR_KINDS.BAD_ENCRYPTION_KEY]: {
    en: 'the encryption key must have 16, 24 or 32 characters',
    fr: 'la clé de chiffrement doit compter 16, 24 ou 32 caractères',
    de: 'der Verschlüsselungsschlüssel muss 16, 24 oder 32 Zeichen haben',
    es: 'la clave de cifrado debe tener 16, 24 o 32 caracteres',
  },
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'the Bark server does not answer',
    fr: 'le serveur Bark ne répond pas',
    de: 'der Bark-Server antwortet nicht',
    es: 'el servidor Bark no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept a self-signed certificate"',
    fr: 'certificat refusé : cochez « Accepter un certificat auto-signé »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsigniertes Zertifikat akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar un certificado autofirmado»',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.NOT_BARK]: {
    en: 'no Bark server at this address',
    fr: 'aucun serveur Bark à cette adresse',
    de: 'kein Bark-Server unter dieser Adresse',
    es: 'no hay ningún servidor Bark en esta dirección',
  },
  [ERROR_KINDS.UNKNOWN_KEY]: {
    en: 'device key unknown to this server: check the key and the server in the Bark app',
    fr: "clé d'appareil inconnue de ce serveur : vérifiez la clé et le serveur dans l'appli Bark",
    de: 'Geräteschlüssel diesem Server unbekannt: Prüfe Schlüssel und Server in der Bark-App',
    es: 'clave desconocida para este servidor: compruebe la clave y el servidor en la aplicación Bark',
  },
  [ERROR_KINDS.DEVICE_GONE]: {
    en: 'Apple no longer knows this iPhone: open the Bark app and copy its new key',
    fr: "Apple ne connaît plus cet iPhone : ouvrez l'appli Bark et copiez sa nouvelle clé",
    de: 'Apple kennt dieses iPhone nicht mehr: Öffne die Bark-App und kopiere den neuen Schlüssel',
    es: 'Apple ya no reconoce este iPhone: abra la aplicación Bark y copie su nueva clave',
  },
  [ERROR_KINDS.REJECTED]: {
    en: 'Bark refused the notification, see the logs',
    fr: 'Bark a refusé la notification, voir les logs',
    de: 'Bark hat die Benachrichtigung abgelehnt, sieh in den Protokollen nach',
    es: 'Bark ha rechazado la notificación, consulte los registros',
  },
  [ERROR_KINDS.SERVER_ERROR]: {
    en: 'the Bark server answered with an error, see the logs',
    fr: 'le serveur Bark a répondu par une erreur, voir les logs',
    de: 'der Bark-Server hat mit einem Fehler geantwortet, sieh in den Protokollen nach',
    es: 'el servidor Bark ha respondido con un error, consulte los registros',
  },
  invalid: {
    en: 'invalid notification, see the scene logs',
    fr: 'notification invalide, voir les logs de la scène',
    de: 'ungültige Benachrichtigung, sieh in den Protokollen der Szene nach',
    es: 'notificación no válida, consulte los registros de la escena',
  },
  unknown: {
    en: 'unexpected error, see the logs',
    fr: 'erreur inattendue, voir les logs',
    de: 'unerwarteter Fehler, sieh in den Protokollen nach',
    es: 'error inesperado, consulte los registros',
  },
};

/** The error text of any error, in one language. */
export function errorText(err, language) {
  const kind = err?.name === 'InvalidMessageError' ? 'invalid' : err?.kind;
  return pick(ERROR_TEXT[kind] ?? ERROR_TEXT.unknown, language);
}

/** The same, as a multi-language object (connection status, action reports). */
export function errorTexts(err) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, errorText(err, lang)]));
}

// The "Send a test notification" report and the test notification itself.
export const REPORT_TEXT = {
  en: {
    reachable: (version) => (version ? `Bark server ${version} answers.` : 'Bark server answers.'),
    sent: (count) => `Test notification sent to ${count} device(s).`,
    partly: (sent, total, reason) =>
      `Test notification sent to ${sent} of ${total} devices; the others: ${reason}.`,
    failed: (reason) => `Test notification not sent: ${reason}.`,
    unreachable: (reason) => `Bark cannot be reached: ${reason}.`,
    title: 'Gladys test',
    message: 'Gladys can send you notifications through Bark.',
  },
  fr: {
    reachable: (version) =>
      version ? `Le serveur Bark ${version} répond.` : 'Le serveur Bark répond.',
    sent: (count) => `Notification de test envoyée à ${count} appareil(s).`,
    partly: (sent, total, reason) =>
      `Notification de test envoyée à ${sent} appareil(s) sur ${total} ; les autres : ${reason}.`,
    failed: (reason) => `Notification de test non envoyée : ${reason}.`,
    unreachable: (reason) => `Bark est injoignable : ${reason}.`,
    title: 'Test de Gladys',
    message: 'Gladys peut vous envoyer des notifications par Bark.',
  },
  de: {
    reachable: (version) =>
      version ? `Bark-Server ${version} antwortet.` : 'Der Bark-Server antwortet.',
    sent: (count) => `Testbenachrichtigung an ${count} Gerät(e) gesendet.`,
    partly: (sent, total, reason) =>
      `Testbenachrichtigung an ${sent} von ${total} Geräten gesendet; die anderen: ${reason}.`,
    failed: (reason) => `Testbenachrichtigung nicht gesendet: ${reason}.`,
    unreachable: (reason) => `Bark ist nicht erreichbar: ${reason}.`,
    title: 'Gladys-Test',
    message: 'Gladys kann dir Benachrichtigungen über Bark senden.',
  },
  es: {
    reachable: (version) =>
      version ? `El servidor Bark ${version} responde.` : 'El servidor Bark responde.',
    sent: (count) => `Notificación de prueba enviada a ${count} dispositivo(s).`,
    partly: (sent, total, reason) =>
      `Notificación de prueba enviada a ${sent} de ${total} dispositivos; los demás: ${reason}.`,
    failed: (reason) => `Notificación de prueba no enviada: ${reason}.`,
    unreachable: (reason) => `No se puede contactar con Bark: ${reason}.`,
    title: 'Prueba de Gladys',
    message: 'Gladys puede enviarle notificaciones a través de Bark.',
  },
};
