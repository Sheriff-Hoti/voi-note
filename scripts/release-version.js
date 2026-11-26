// Android version for a release build, from its git tag (ticket #8):
// vX.Y.Z gives versionName "X.Y.Z" and versionCode X*10000 + Y*100 + Z.
// Builds without a release tag (a push to main, a manual run) keep app.json's version.
//   node scripts/release-version.js v0.1.0   # prints versionName=0.1.0 and versionCode=100
const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

function releaseVersion(tag) {
  const m = TAG.exec(tag);
  if (!m) throw new Error(`"${tag}" is not a release tag (want vX.Y.Z, e.g. v0.1.0)`);
  const [x, y, z] = m.slice(1).map(Number);
  if (y > 99 || z > 99)
    throw new Error(`"${tag}": minor and patch must be 0-99 to fit the versionCode`);
  return { versionName: `${x}.${y}.${z}`, versionCode: x * 10000 + y * 100 + z };
}

module.exports = { releaseVersion };

if (require.main === module) {
  try {
    const { versionName, versionCode } = releaseVersion(process.argv[2] ?? '');
    console.log(`versionName=${versionName}\nversionCode=${versionCode}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
