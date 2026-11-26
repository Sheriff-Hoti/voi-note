/* global describe, it, expect */
const { releaseVersion } = require('./release-version');

describe('releaseVersion', () => {
  it('turns the first release tag into versionName 0.1.0 and versionCode 100', () => {
    expect(releaseVersion('v0.1.0')).toEqual({ versionName: '0.1.0', versionCode: 100 });
  });

  it('weights major, minor and patch as X*10000 + Y*100 + Z', () => {
    expect(releaseVersion('v1.2.3')).toEqual({ versionName: '1.2.3', versionCode: 10203 });
    expect(releaseVersion('v0.12.7')).toEqual({ versionName: '0.12.7', versionCode: 1207 });
  });

  it.each(['0.1.0', 'v0.1', 'v0.1.0-rc1', 'main', ''])(
    'rejects %p, which is not a release tag',
    (tag) => {
      expect(() => releaseVersion(tag)).toThrow('not a release tag');
    }
  );

  it('rejects a minor or patch over 99, which would collide with the next version up', () => {
    expect(() => releaseVersion('v0.100.0')).toThrow('0-99');
    expect(() => releaseVersion('v0.1.100')).toThrow('0-99');
  });
});
