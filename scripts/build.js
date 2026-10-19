// Build Windows avec une version jour.mois.année.heure (ex. 19.10.2026.20).
// Usage : npm run build

const builder = require('electron-builder');

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const [day, month, year, hour] = [now.getDate(), now.getMonth() + 1, now.getFullYear(), now.getHours()];
const label = `${pad(day)}.${pad(month)}.${year}.${pad(hour)}`;

builder
  .build({
    targets: builder.Platform.WINDOWS.createTarget(),
    config: {
      // electron-builder veut une version à 3 nombres : jour.mois.année,
      // et l'heure devient le 4e nombre de la version Windows de l'exe.
      extraMetadata: { version: `${day}.${month}.${year}`, versionLabel: label },
      buildNumber: String(hour),
      nsis: { artifactName: `LofiTray-Setup-${label}.\${ext}` },
      portable: { artifactName: `LofiTray-portable-${label}.\${ext}` },
    },
  })
  .then((files) => {
    console.log(`\nLofi Tray version ${label}`);
    for (const file of files.filter((f) => f.endsWith('.exe'))) console.log(`  ${file}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
