// Petit stockage JSON dans le dossier de données de l'app (%APPDATA%\Lofi Tray).

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function createStore(fileName, defaults) {
  const file = path.join(app.getPath('userData'), fileName);
  let data = { ...defaults };
  try {
    Object.assign(data, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    // Premier lancement ou fichier illisible : on garde les valeurs par défaut.
  }

  return {
    get: () => data,
    set(patch) {
      data = { ...data, ...patch };
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      } catch (err) {
        console.error(`Impossible d'écrire ${file}:`, err);
      }
      return data;
    },
  };
}

module.exports = { createStore };
