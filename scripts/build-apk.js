#!/usr/bin/env node
/**
 * build-apk.js
 * Compila o APK Android do NailDash.
 *
 * O app é um wrapper Capacitor que carrega https://naildash.netlify.app numa
 * WebView (server.url no capacitor.config.ts). Não há build web embutido —
 * o site Next.js roda no Netlify e é servido ao vivo. Este script só
 * sincroniza o projeto nativo e compila o APK.
 *
 * Passos:
 *  1. Move APKs de public/downloads/ para temp (evita bundling nos assets android)
 *  2. npx cap sync android
 *  3. gradlew assembleDebug com JAVA_HOME do Android Studio
 *  4. Copia o APK gerado para public/downloads/NailDash.apk
 *  5. Restaura/limpa APKs do temp
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const DOWNLOADS = path.join(ROOT, 'public', 'downloads');
const TEMP      = path.join(ROOT, '.apk-temp');
const ANDROID   = path.join(ROOT, 'android');
const APK_OUT   = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr';
const DEST_NAME = 'NailDash.apk';

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

// ── 1. Mover APKs de public/downloads/ para temp ───────────────────────────
fs.mkdirSync(DOWNLOADS, { recursive: true });
fs.mkdirSync(TEMP, { recursive: true });
const moved = [];
for (const f of fs.readdirSync(DOWNLOADS)) {
  if (f.endsWith('.apk')) {
    fs.renameSync(path.join(DOWNLOADS, f), path.join(TEMP, f));
    moved.push(f);
    console.log(`📦 Movido temporariamente: ${f}`);
  }
}

try {
  // ── 2. Cap sync ──────────────────────────────────────────────────────────
  run('npx cap sync android', { cwd: ROOT });

  // ── 3. Gradle build ──────────────────────────────────────────────────────
  if (process.platform === 'win32') {
    run(
      `powershell -NoProfile -Command "` +
      `$env:JAVA_HOME='${JAVA_HOME}'; ` +
      `Set-Location '${ANDROID.replace(/'/g, "''")}'; ` +
      `.\\gradlew.bat assembleDebug"`,
      { cwd: ANDROID, env: { ...process.env, JAVA_HOME } }
    );
  } else {
    run('./gradlew assembleDebug', { cwd: ANDROID, env: { ...process.env, JAVA_HOME } });
  }

  // ── 4. Copiar APK gerado para public/downloads/ ──────────────────────────
  fs.copyFileSync(APK_OUT, path.join(DOWNLOADS, DEST_NAME));
  const { size } = fs.statSync(path.join(DOWNLOADS, DEST_NAME));
  console.log(`\n✅ APK copiado: public/downloads/${DEST_NAME} (${(size / 1024 / 1024).toFixed(1)} MB)`);

} finally {
  // ── 5. Restaurar/limpar APKs antigos do temp ─────────────────────────────
  for (const f of moved) {
    const src  = path.join(TEMP, f);
    const dest = path.join(DOWNLOADS, f);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.renameSync(src, dest);
    } else if (fs.existsSync(src)) {
      fs.unlinkSync(src); // APK novo já está no lugar
    }
  }
  fs.rmSync(TEMP, { recursive: true, force: true });
}

console.log('\n🚀 Build do APK concluído com sucesso!');
console.log('   Próximo passo: git add public/downloads + commit + push');
