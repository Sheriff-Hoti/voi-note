// Android build settings for voi-note (see docs/adr/0002).
// - arm64-v8a for the Galaxy A54, x86_64 for the emulator.
// - R8 off: react-native-sherpa-onnx ships no keep rules for com.k2fsa.sherpa.onnx.*, whose fields the
//   sherpa JNI reads by name; minified release builds (Expo SDK 58 default) can crash there.
// - After every assembleDebug/assembleRelease, scripts/check-ort-symbol.sh fails the build unless the APK
//   pairs sherpa-onnx 2.0.3 with ONNX Runtime 1.28.2 (OrtGetApiBase@VERS_1.28.2).
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const MARKER = '// voi-note: ORT symbol check (ADR 0002)';
const CHECK_TASK = `
${MARKER}
afterEvaluate {
    ['Debug', 'Release'].each { variant ->
        def assemble = tasks.findByName('assemble' + variant)
        if (assemble == null) return
        def apkDir = layout.buildDirectory.dir('outputs/apk/' + variant.toLowerCase()).get().asFile
        def script = new File(rootDir, '../scripts/check-ort-symbol.sh')
        assemble.doLast {
            def proc = ['bash', script.absolutePath, apkDir.absolutePath].execute()
            proc.waitForProcessOutput(System.out, System.err)
            if (proc.exitValue() != 0) {
                throw new GradleException("APK lacks OrtGetApiBase@VERS_1.28.2: the sherpa-onnx/ORT swap did not apply (see docs/adr/0002)")
            }
        }
    }
}
`;

const withProperties = (config) =>
  withGradleProperties(config, (c) => {
    const set = (key, value) => {
      c.modResults = c.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      c.modResults.push({ type: 'property', key, value });
    };
    set('reactNativeArchitectures', 'arm64-v8a,x86_64');
    set('android.enableMinifyInReleaseBuilds', 'false');
    set('android.enableShrinkResourcesInReleaseBuilds', 'false');
    return c;
  });

const withOrtCheck = (config) =>
  withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes(MARKER)) c.modResults.contents += CHECK_TASK;
    return c;
  });

module.exports = (config) => withOrtCheck(withProperties(config));
