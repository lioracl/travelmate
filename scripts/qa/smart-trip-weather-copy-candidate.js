'use strict';
const fs=require('node:fs');
function replaceOnce(path,from,to){const src=fs.readFileSync(path,'utf8');const count=src.split(from).length-1;if(count!==1)throw new Error(`${path}: expected one match, found ${count}`);fs.writeFileSync(path,src.replace(from,to));}
replaceOnce('assets/smart-trip-decisions.js',
"        if (wetWeather(hourlyWeather)) add('weather:' + String(outdoor.record.id), 65, '???? ????? ????? ?????', '?????? ???? ??????? ?????? ?? ???. ?? ????? ????.', 'weather:' + String(hourlyWeather.source || 'hourly'), 'medium', { type: 'open-places', href: '#places' }, outdoor.record.id);",
"        if (wetWeather(hourlyWeather)) add('weather:' + String(outdoor.record.id), 65, 'גשם צפוי בזמן הפעילות', 'התחזית לשעת הפעילות מצביעה על גשם או מזג אוויר רטוב. כדאי להכין חלופה מקורה.', 'weather:' + String(hourlyWeather.source || 'hourly'), 'medium', { type: 'open-places', href: '#places' }, outdoor.record.id);");
replaceOnce('assets/smart-trip-decisions.js',
"        add('weather:' + String(outdoor.record.id), 65, '???? ????? ????? ?????', '???? ??? ?????? ???????? ??????? ?? ??? ???? ???????. ?? ????? ????.', 'weather:' + String(weather.source || 'current'), 'low', { type: 'open-places', href: '#places' }, outdoor.record.id);",
"        add('weather:' + String(outdoor.record.id), 65, 'מזג האוויר עלול להפריע לפעילות', 'מזג האוויר הנוכחי עלול להשפיע על פעילות שמתחילה בקרוב. כדאי להכין חלופה מקורה.', 'weather:' + String(weather.source || 'current'), 'low', { type: 'open-places', href: '#places' }, outdoor.record.id);");
replaceOnce('tests/smart-trip-decisions.test.js',
"  assert.equal(warning.provenance, 'weather:Open-Meteo:hourly');assert.equal(warning.confidence, 'medium');",
"  assert.equal(warning.provenance, 'weather:Open-Meteo:hourly');assert.equal(warning.confidence, 'medium');\n  assert.equal(warning.title, 'גשם צפוי בזמן הפעילות');\n  assert.match(warning.reason, /התחזית לשעת הפעילות/);\n  assert.doesNotMatch(warning.title + warning.reason, /\\?{2,}/);");
