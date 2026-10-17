"""Inspect the built APK, retaining the pinned foundation packaging checks."""
import json
import pathlib
import sys
import zipfile
import importlib.util
import hashlib
import re

# Assertions are mandatory; never accept optimized Python execution.
if not __debug__:
    raise RuntimeError("APK verification requires Python assertions")
wrapper = pathlib.Path(sys.argv[2]).resolve()
spec = importlib.util.spec_from_file_location('apk_png', wrapper / 'tools/apk_png.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
png_pixels = module.png_pixels
apk = sys.argv[1]
contract = json.loads(pathlib.Path(sys.argv[3]).read_text())
expected_sha = contract['webSha']
badging = pathlib.Path(sys.argv[4]).read_text()
certificate = json.loads(pathlib.Path(sys.argv[5]).read_text())
assert certificate['stableQaCertificateVerified'] is True
assert certificate['certificateSha256'] == contract['certificateSha256']
assert re.search(r"package: name='com.travelmate.app' versionCode='" + str(contract['nativeVersionCode']) + r"' versionName='" + re.escape(contract['nativeVersion']) + r"'", badging)
assert "sdkVersion:'26'" in badging and "targetSdkVersion:'36'" in badging
assert re.fullmatch(r'[a-f0-9]{40}', expected_sha)
with zipfile.ZipFile(apk) as package:
    names = package.namelist()
    info = json.loads(package.read('assets/public/build-info.json'))
    assert info['sha'] == expected_sha and info['version'] == contract['webVersion'] and info['nativeApiLevel'] == contract['nativeApiLevel'], info
    assert len(names) == len(set(names)), 'Duplicate APK entries'
    staged = {p.relative_to(wrapper / 'dist').as_posix(): p for p in (wrapper / 'dist').rglob('*') if p.is_file()}
    packaged = {n.removeprefix('assets/public/') for n in names if n.startswith('assets/public/') and not n.endswith('/')}
    # Capacitor 8.5.2 copy.ts calls createEmptyCordovaJS with no Cordova plugins.
    generated = {'cordova.js', 'cordova_plugins.js'}
    assert not generated.intersection(staged), 'Generated Capacitor files must not be supplied by the staged app'
    assert packaged == set(staged).union(generated), 'Unexpected or missing packaged web files'
    for relative in generated:
        assert package.read('assets/public/' + relative) == b'', 'Nonempty generated Capacitor file: ' + relative
    forbidden = re.compile(r'(^|/)(?:uploads?|private|user-documents|gps-history|node_modules|\.git|\.env(?:\..*)?)(?:/|$)|\.(?:db|sqlite3?|pem|key|jks|keystore|p12)$', re.I)
    assert not any(forbidden.search(n) for n in names), 'Private data or credentials in APK'
    for relative, source in staged.items():
        assert package.read('assets/public/' + relative) == source.read_bytes(), relative
    assert info == json.loads((wrapper / 'dist/build-info.json').read_text())
    assert package.read('assets/public/assets/native-live-update.js') == (wrapper / 'assets/native-live-update.js').read_bytes()
    for relative in ['index.html', 'sw.js', 'assets/security-center.js', 'assets/cloud-sync.js', 'assets/security-center.css', 'assets/weather-widget.js', 'assets/weather-widget.css', 'assets/phone-visual-qa.css', 'assets/native-widget-snapshot.js', 'trip/custom/index.html', 'manifest.webmanifest']:
        assert package.read('assets/public/' + relative) == (wrapper / 'dist' / relative).read_bytes(), relative
    config = json.loads(package.read('assets/capacitor.config.json'))
    assert config['appId'] == 'com.travelmate.app'
    expected_config = json.loads((wrapper / 'capacitor.config.json').read_text())
    assert config.get('plugins') == expected_config.get('plugins'), 'Native plugin/security configuration drift'
    assert config['plugins']['LiveUpdate']['autoUpdateStrategy'] == 'none'
    assert config['plugins']['LiveUpdate']['autoDeleteBundles'] is False
    assert not config.get('server', {}).get('url'), 'Remote shell must never replace offline packaged assets'
    assert config.get('server', {}).get('hostname', 'localhost') == 'localhost', 'Do not strand existing origin storage'
    for density in ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']:
        for icon in ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png', 'ic_launcher_background.png']:
            packaged = next(n for n in names if n.startswith('res/mipmap-' + density) and n.endswith('/' + icon))
            original = (wrapper / 'android/app/src/main/res' / ('mipmap-' + density) / icon).read_bytes()
            assert png_pixels(package.read(packaged)) == png_pixels(original), ('Packaged icon pixels differ', packaged)
    for icon in ['ic_launcher.xml', 'ic_launcher_round.xml']:
        assert any(n.startswith('res/mipmap-anydpi-v26/') and n.endswith('/' + icon) for n in names), icon
    for provider in ['travelmate_widget_info.xml', 'travelmate_live_today_widget_info.xml']:
        assert any(n.endswith('/' + provider) for n in names), provider
report = dict(contract, apkSha256=hashlib.sha256(pathlib.Path(apk).read_bytes()).hexdigest(), apkBytes=pathlib.Path(apk).stat().st_size, stableQaCertificateVerified=True, packagedWebVerified=True)
pathlib.Path(sys.argv[6]).write_text(json.dumps(report, indent=2) + '\n')
print('PASS: APK source revision, runtime, native origin, launcher densities/adaptive resources and widget providers', expected_sha)
