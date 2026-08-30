// ============================================================
// MySargal - Config plugin : augmente la memoire JVM de Gradle.
// Le build managed regenere android/gradle.properties a chaque prebuild ;
// sans ce plugin, le plafond Metaspace par defaut (512m) fait echouer le
// build Android (OutOfMemoryError: Metaspace) sur les gros projets.
// ============================================================

const { withGradleProperties } = require('@expo/config-plugins');

const JVM_ARGS =
  '-Xmx4608m -XX:MaxMetaspaceSize=1536m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;

    const upsert = (key, value) => {
      const found = props.find((p) => p.type === 'property' && p.key === key);
      if (found) found.value = value;
      else props.push({ type: 'property', key, value });
    };

    upsert('org.gradle.jvmargs', JVM_ARGS);
    // Un seul worker a la fois : reduit la pression memoire pendant R8/KSP.
    upsert('org.gradle.workers.max', '2');
    // Pas de daemon persistant : evite les verrous de cache entre builds locaux.
    upsert('org.gradle.daemon', 'false');

    return cfg;
  });
};
