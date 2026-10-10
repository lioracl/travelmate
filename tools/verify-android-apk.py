"""Inspect the built APK, not a source-only packaging approximation."""
import json
import pathlib
import sys
import zipfile

apk, expected_sha = sys.argv[1:]
with zipfile.ZipFile(apk) as package:
    names = package.namelist()
    info = json.loads(package.read('assets/public/build-info.json'))
    assert info == dict(sha=expected_sha, version='2.21.0', buildType='debug'), info
    for relative in ['index.html', 'sw.js', 'assets/security-center.js', 'assets/cloud-sync.js', 'assets/security-center.css', 'assets/native-widget-snapshot.js', 'trip/custom/index.html', 'manifest.webmanifest']:
        assert package.read('assets/public/' + relative) == pathlib.Path('dist', relative).read_bytes(), relative
    config = json.loads(package.read('assets/capacitor.config.json'))
    assert config['appId'] == 'com.travelmate.app'
    assert not config.get('server', {}).get('url'), 'Remote shell must never replace offline packaged assets'
    assert config.get('server', {}).get('hostname', 'localhost') == 'localhost', 'Do not strand existing origin storage'
    for density in ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']:
        for icon in ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']:
            assert any(n.startswith('res/mipmap-' + density) and n.endswith('/' + icon) for n in names), (density, icon)
    for icon in ['ic_launcher.xml', 'ic_launcher_round.xml']:
        assert any(n.startswith('res/mipmap-anydpi-v26/') and n.endswith('/' + icon) for n in names), icon
    for provider in ['travelmate_widget_info.xml', 'travelmate_live_today_widget_info.xml']:
        assert any(n.endswith('/' + provider) for n in names), provider
print('PASS: APK source revision, runtime, native origin, launcher densities/adaptive resources and widget providers', expected_sha)
