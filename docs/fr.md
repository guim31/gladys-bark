# Bark

Recevez les messages de Gladys sur votre iPhone avec [Bark](https://bark.day.app),
une appli iOS de notifications gratuite et libre : les messages de vos scènes,
les réponses de Gladys et ses messages système, ainsi que des notifications
avec titre, niveau, son, lien et image depuis vos scènes. Utilisez le serveur
officiel de Bark (`api.day.app`) ou votre propre `bark-server`.

> **Développée sans le matériel : vos retours sont les bienvenus.** Cette
> intégration a été testée face à un vrai bark-server (v2.4.0), qui a accepté
> ses requêtes, mais ni avec un iPhone ni dans une vraie installation de
> Gladys. Si quelque chose ne marche pas comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-bark/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent, avec un accès à Internet.
- L'appli **Bark** sur chaque iPhone (ou iPad) qui reçoit les notifications,
  depuis l'App Store. Ouvrez-la une fois et autorisez les notifications.
- La **clé d'appareil** de chaque iPhone : l'appli Bark affiche une adresse du
  type `https://api.day.app/AbCdEf.../` ; la clé est la partie qui suit
  l'adresse du serveur. Copier l'adresse entière convient aussi.
- Facultatif : votre propre serveur
  ([bark-server](https://github.com/Finb/bark-server), image Docker
  `finab/bark-server`), choisi aussi dans l'appli Bark. Chaque notification
  passe malgré tout par le service de notifications d'Apple.

## Configuration

Installez l'intégration depuis **Intégrations → Installer depuis GitHub** avec
l'adresse `https://github.com/guim31/gladys-bark`, puis remplissez son écran de
configuration :

- **Adresse du serveur Bark** : `https://api.day.app` par défaut ; sinon
  l'adresse de votre bark-server (un chemin derrière un proxy inverse
  convient).
- **Clés d'appareil pour les scènes** : les clés des iPhone qui reçoivent les
  notifications des scènes et le test. Plusieurs iPhone : séparez les clés par
  des virgules.
- **Niveau par défaut** : la façon dont iOS présente les notifications (voir
  plus bas).
- **Groupe des notifications** : Bark regroupe les notifications sous ce nom
  (Gladys par défaut).
- **Clé de chiffrement (facultative)** : pour chiffrer les textes, comme
  l'appli Bark le permet. Dans l'appli, ouvrez les réglages de chiffrement,
  choisissez AES, le mode CBC, le remplissage PKCS7 et une clé de 16, 24 ou
  32 caractères (AES-128, 192 ou 256) ; saisissez la même clé ici. L'IV est
  tiré au hasard pour chaque notification : laissez celui de l'appli tel quel.
  Vide : pas de chiffrement.
- **Accepter un certificat auto-signé** : seulement pour une adresse en
  `https://` de votre serveur dont vous avez créé le certificat vous-même.
- **Langue des textes de l'intégration** : les erreurs de l'action de scène,
  la notification de test et la mention ajoutée à un message dont l'image n'a
  pas pu suivre.

Cliquez ensuite sur **Envoyer une notification de test** : l'intégration
vérifie le serveur et envoie une notification aux clés d'appareil pour les
scènes.

**Mon compte** : chaque utilisateur de Gladys décide, dans le bloc « Mon
compte » de la page de l'intégration, s'il reçoit les messages que Gladys lui
envoie :

- **Votre clé d'appareil** : la clé (ou l'adresse) affichée par VOTRE appli
  Bark. Plusieurs appareils (iPhone et iPad) : séparez-les par des virgules.
- **Niveau de vos messages** : votre propre niveau, ou _Par défaut de
  l'intégration_.

Un utilisateur sans clé ne reçoit rien : les clés d'appareil pour les scènes
ne servent jamais à un message personnel. **Supprimer mes valeurs** arrête les
messages.

## Ce que Gladys envoie

Chaque message que Gladys envoie à un utilisateur passe par Bark quand cet
utilisateur a enregistré une clé dans « Mon compte » : l'action de scène
**Envoyer un message**, les réponses de Gladys et ses messages système. Dans
l'action **Envoyer un message**, les versions récentes de Gladys permettent de
choisir le canal.

- Le titre est « Gladys », dans le groupe des notifications de la
  configuration.
- Bark ne prend les images que par leur adresse : l'image de **Envoyer une
  image de caméra** est laissée de côté, et une ligne le signale sous le texte.
- Les textes très longs sont coupés (Apple refuse une notification de plus de
  4 Ko).

Les niveaux, tels qu'iOS les présente :

| Niveau   | Notification                                                        |
| -------- | ------------------------------------------------------------------- |
| Normale  | son et bandeau                                                      |
| Urgente  | affichée même en mode Concentration                                 |
| Discrète | silencieuse, seulement ajoutée à la liste                           |
| Critique | sonne même quand l'iPhone est en silencieux (à autoriser dans Bark) |

## Tableau de bord

Le widget **Bark** affiche :

- si le serveur répond, et sa version quand il la donne ;
- les notifications envoyées aujourd'hui, et les échecs avec la dernière
  raison ;
- les dernières notifications envoyées par des **scènes** (titre, date,
  niveau, ou « Non envoyée »). Les messages que Gladys envoie à un seul
  utilisateur sont comptés mais jamais listés : le tableau de bord est vu par
  toute la maison ;
- un bouton **Envoyer un test**, qui fait la même chose que le test de la
  configuration.

Les réglages du widget permettent de masquer la liste et le bouton.

## Scènes

### Déclencheurs

- **Serveur Bark hors ligne** : le serveur ne répond plus. Il doit échouer à
  deux vérifications à 30 secondes d'écart (une vérification toutes les
  5 minutes, et juste après un envoi raté). Variable : l'erreur.
- **Serveur Bark de retour** : le serveur répond de nouveau après avoir été
  hors ligne. Variable : la version du serveur (vide si inconnue).
- **Notification Bark non envoyée** : un message n'a pas pu être envoyé.
  Filtres : la raison (serveur injoignable, clé d'appareil absente ou refusée,
  configuration incomplète, message refusé) et l'origine (un message de Gladys
  ou l'action de scène Bark). Variables : raison, origine, erreur. Pour éviter
  les boucles, il se déclenche au plus une fois par raison toutes les
  15 minutes.

Le premier état connu après l'installation, ou après un changement d'adresse,
n'est pas annoncé : seul un changement l'est.

### Actions

**Envoyer une notification Bark**, aux clés d'appareil pour les scènes :

- **Titre** et **Sous-titre** (facultatifs).
- **Message** (obligatoire). Les variables de scène fonctionnent ici, comme
  dans tous les champs.
- **Niveau** : un niveau de la liste, ou _Par défaut de l'intégration_.
- **Son** : une des sonneries de l'appli Bark, ou celle par défaut.
- **Sonner pendant 30 secondes** : le son se répète, comme un appel.
- **Groupe** (facultatif) : sinon le groupe de la configuration.
- **Lien ouvert au toucher** (facultatif) : une adresse en `https://`, ou un
  lien d'appli (`shortcuts://`, `tel:`, `mailto:`, `maps:`, `sms:`).
- **Adresse d'une image** et **Adresse d'une icône** (facultatives) : des
  images en `https://`. Votre iPhone les télécharge : elles doivent être
  joignables depuis le téléphone, pas seulement depuis Gladys.

L'action transmet trois valeurs aux actions suivantes de la scène :
**Notification envoyée** (oui quand tous les appareils l'ont reçue),
**Appareils atteints** et **Erreur** (vide en cas de succès). Un champ erroné
(message vide, son inconnu, lien non autorisé) fait échouer l'action, et le
journal de la scène en donne la raison.

### Idées de scènes

- **Alarme** : quand l'alarme se déclenche, **Envoyer une notification Bark**
  intitulée « Alarme », niveau Critique, son alarm, avec **Sonner pendant
  30 secondes**.
- **Solution de repli** : sur **Notification Bark non envoyée** avec la raison
  « Serveur injoignable », envoyer le message par un autre canal. Ne pas y
  répondre par une autre notification Bark.
- **Lave-linge** : quand la puissance de la prise retombe, une notification
  Discrète « Lessive terminée » qui ne réveille personne.

## Dépannage

L'écran de configuration affiche l'état du serveur. Les messages :

- _le serveur Bark ne répond pas_ : vérifiez l'adresse, et que Gladys a accès
  à Internet (ou que votre bark-server tourne). Gladys fait tourner
  l'intégration dans son propre réseau Docker : `localhost` désigne
  l'intégration elle-même.
- _clé d'appareil inconnue de ce serveur_ : la clé est fausse, ou elle
  appartient à un autre serveur (l'appli Bark indique lequel).
- _Apple ne connaît plus cet iPhone_ : l'appli Bark a été supprimée ou
  réinstallée ; ouvrez-la et copiez sa nouvelle clé.
- _la clé de chiffrement doit compter 16, 24 ou 32 caractères_ : corrigez la
  clé, ou videz-la.
- _certificat refusé_ : cochez **Accepter un certificat auto-signé**.
- _aucune clé d'appareil_ : remplissez **Clés d'appareil pour les scènes**.

Un utilisateur ne reçoit rien ? Vérifiez qu'il a enregistré une clé dans
« Mon compte », et que l'action **Envoyer un message** de la scène n'envoie pas
seulement vers un autre canal. Les logs de l'intégration donnent le détail ;
ils n'affichent jamais de clé.

## Limites

- **Envoi seulement** : Bark n'a pas de réponse. On ne peut pas parler à
  Gladys depuis Bark.
- iPhone et iPad seulement (Bark est une appli iOS).
- Pas d'image de caméra dans les messages de Gladys : Bark n'affiche que des
  images publiées sur le web.
- Internet est nécessaire : chaque notification passe par Apple, même depuis
  votre propre serveur.
- Chiffrement : AES en mode CBC seulement (ni ECB ni GCM).
- Testée face à un vrai bark-server v2.4.0, mais ni avec un iPhone ni dans une
  vraie installation de Gladys : la dernière étape, la remise par Apple au
  téléphone, n'a pas pu être vérifiée.
- Le serveur officiel est un service gratuit tenu par l'auteur de Bark : gardez
  un nombre raisonnable de notifications.

Cette intégration n'est affiliée ni à Bark ni à son auteur.
