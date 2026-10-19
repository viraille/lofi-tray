// Build Android : APK signé copié dans dist/LofiTray-android-<jour.mois.année.heure>.apk
// Usage : npm run build:android

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const androidDir = path.join(root, 'android');

// Java installé pour le projet (voir README) si JAVA_HOME n'est pas défini.
const env = { ...process.env };
if (!env.JAVA_HOME) {
  const jdk = path.join(env.LOCALAPPDATA || '', 'Programs', 'jdk-21');
  if (fs.existsSync(jdk)) env.JAVA_HOME = jdk;
}

const isWindows = process.platform === 'win32';
const gradlew = path.join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');
// (sous Windows, un .bat se lance via le shell : commande complète en une seule chaîne)
const result = isWindows
  ? spawnSync(`"${gradlew}" assembleRelease`, { cwd: androidDir, env, stdio: 'inherit', shell: true })
  : spawnSync(gradlew, ['assembleRelease'], { cwd: androidDir, env, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

const outDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release');
const { versionName, outputFile } = JSON.parse(
  fs.readFileSync(path.join(outDir, 'output-metadata.json'), 'utf8'),
).elements[0];
const target = path.join(root, 'dist', `LofiTray-android-${versionName}.apk`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(path.join(outDir, outputFile), target);
console.log(`\nLofi Tray Android version ${versionName}\n  ${target}`);
