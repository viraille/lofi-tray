# Lofi Tray 🎧

Petite app Windows qui vit dans la zone de notification (les icônes cachées à côté de l'horloge)
et joue les lives de [Lofi Girl](https://www.youtube.com/@LofiGirl/streams) en arrière-plan.

- **Clic gauche** sur l'icône : ouvre la liste des lives en cours (miniature, titre, nombre d'auditeurs).
- **Clic molette** : lecture / pause.
- **Clic droit** : menu rapide (lecture/pause, changer de live, lancement au démarrage, quitter).
- La musique continue quand la fenêtre est fermée. Fermer la fenêtre ≠ quitter l'app.
- **Glisser la barre du haut** pour déplacer la fenêtre : sa position est retenue
  (Réglages → « Replacer » pour la remettre près de l'icône).
- Molette de la souris sur le lecteur = volume. `Espace` = lecture/pause, `/` = recherche, `Échap` = fermer.

La liste est lue directement sur la page « En direct » de la chaîne (pas de clé d'API) et se met
à jour toute seule toutes les 5 minutes, même fenêtre fermée : les lives terminés disparaissent,
les nouveaux apparaissent. Si le live en cours s'arrête et que Lofi Girl le relance avec un
nouveau lien, l'app bascule dessus automatiquement.

L'icône utilise le logo de Lofi Girl (`assets/lofigirl-logo.png`, tiré de lofigirl.com) :
c'est leur marque, à garder pour un usage perso.

## Lancer en mode développement

```bash
npm install
npm start
```

## Créer l'exécutable

```bash
npm run build
```

La version est la date et l'heure du build, au format `jour.mois.année.heure` (ex. `19.10.2026.20`),
affichée en bas des Réglages. Le dossier `dist/` contient alors :

- `LofiTray-Setup-<version>.exe` : installeur (raccourci dans le menu Démarrer) ;
- `LofiTray-portable-<version>.exe` : version portable, sans installation.

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/main.js` | Icône de la zone de notification, fenêtre popup, menu, lancement au démarrage |
| `src/youtube.js` | Récupère et lit la liste des lives Lofi Girl |
| `src/renderer/` | Interface (HTML/CSS/JS) et lecteur YouTube intégré |
| `scripts/make-icons.ps1` | Génère les icônes dans `assets/` |

Les réglages (volume, dernier live écouté…) sont dans `%APPDATA%\Lofi Tray\settings.json`.
