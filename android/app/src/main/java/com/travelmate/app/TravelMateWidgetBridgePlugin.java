package com.travelmate.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "TravelMateWidgetBridge")
public class TravelMateWidgetBridgePlugin extends Plugin {
    static final String PREFS_NAME = "travelmate_widget";
    static final String ACTIVE_SNAPSHOT_KEY = "active_snapshot_key";
    private static final String SNAPSHOT_PREFIX = "snapshot_json:";
    private static final int MAX_AGENDA_ITEMS = 8;
    private static final long MAX_AGE_MS = 60L * 60L * 1000L;
    private static final double MAX_MONEY = 1000000000d;

    static boolean validId(String value) {
        return value != null && value.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,179}");
    }

    private static boolean validCurrency(String value) {
        return value != null && value.matches("[A-Z]{3}");
    }

    private static String safeText(String value, int limit) {
        String cleaned = value == null ? "" : value.replaceAll("[\\p{Cntrl}]", " ").trim();
        return cleaned.substring(0, Math.min(limit, cleaned.length()));
    }

    private static double boundedMoney(double value) {
        return Double.isFinite(value) && value >= 0d && value <= MAX_MONEY ? value : 0d;
    }

    private static String snapshotKey(String accountId, String tripId) {
        return SNAPSHOT_PREFIX + accountId + ":" + tripId;
    }

    static String readActiveSnapshot(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String key = prefs.getString(ACTIVE_SNAPSHOT_KEY, null);
        return key == null ? null : prefs.getString(key, null);
    }

    private static JSONObject sanitizeBudget(JSONObject input, long now) throws JSONException {
        if (input == null) return null;
        String mode = input.optString("mode", "limited");
        if (!"limited".equals(mode) && !"unlimited".equals(mode)) mode = "limited";
        String tripCurrency = input.optString("tripCurrency", "");
        String homeCurrency = input.optString("homeCurrency", "");
        if (!validCurrency(tripCurrency) || !validCurrency(homeCurrency)) return null;

        JSONObject safe = new JSONObject();
        safe.put("ready", input.optBoolean("ready", false));
        safe.put("mode", mode);
        safe.put("tripCurrency", tripCurrency);
        safe.put("homeCurrency", homeCurrency);
        safe.put("spent", boundedMoney(input.optDouble("spent", 0d)));
        safe.put("limit", "limited".equals(mode) ? boundedMoney(input.optDouble("limit", 0d)) : JSONObject.NULL);
        safe.put("remaining", "limited".equals(mode) ? boundedMoney(input.optDouble("remaining", 0d)) : JSONObject.NULL);
        safe.put("overrun", "limited".equals(mode) ? boundedMoney(input.optDouble("overrun", 0d)) : JSONObject.NULL);
        safe.put("dailyPace", boundedMoney(input.optDouble("dailyPace", 0d)));
        String paceState = input.optString("paceState", "unavailable");
        if (!paceState.matches("active|before-trip|completed|unavailable")) paceState = "unavailable";
        safe.put("paceState", paceState);

        JSONObject incomingFx = input.optJSONObject("fx");
        JSONObject fx = new JSONObject();
        String freshness = incomingFx == null ? "unavailable" : incomingFx.optString("freshness", "unavailable");
        if (!freshness.matches("fresh|stale|unavailable")) freshness = "unavailable";
        String from = incomingFx == null ? tripCurrency : incomingFx.optString("fromCurrency", tripCurrency);
        String to = incomingFx == null ? homeCurrency : incomingFx.optString("toCurrency", homeCurrency);
        double rate = incomingFx == null ? 0d : incomingFx.optDouble("rate", 0d);
        long cachedAt = incomingFx == null ? 0L : incomingFx.optLong("cachedAtEpochMs", 0L);
        if (!validCurrency(from) || !validCurrency(to) || !Double.isFinite(rate) || rate <= 0d || rate > 1000000d || cachedAt <= 0L || cachedAt > now + 120000L) {
            freshness = "unavailable";
            rate = 0d;
            cachedAt = 0L;
        }
        fx.put("fromCurrency", from);
        fx.put("toCurrency", to);
        fx.put("rate", rate);
        fx.put("convertedSpentValue", freshness.equals("unavailable") ? JSONObject.NULL : boundedMoney(incomingFx.optDouble("convertedSpentValue", 0d)));
        fx.put("asOf", freshness.equals("unavailable") ? "" : safeText(incomingFx.optString("asOf", ""), 40));
        fx.put("cachedAtEpochMs", cachedAt);
        fx.put("freshness", freshness);
        safe.put("fx", fx);
        return safe;
    }

    private static JSONObject sanitize(JSObject input) throws JSONException {
        if (input == null || input.optInt("schemaVersion") != 1 || !"redacted".equals(input.optString("privacyMode"))) return null;
        String accountId = input.optString("accountId", "");
        String tripId = input.optString("tripId", "");
        if (!validId(accountId) || !validId(tripId)) return null;
        long now = System.currentTimeMillis();
        long updated = input.optLong("updatedAtEpochMs", 0L);
        long expires = input.optLong("expiresAtEpochMs", 0L);
        if (updated <= 0L || updated > now + 120000L || expires <= now || expires > now + MAX_AGE_MS || updated > expires) return null;

        JSONObject safe = new JSONObject();
        safe.put("schemaVersion", 1);
        safe.put("accountId", accountId);
        safe.put("tripId", tripId);
        safe.put("updatedAtEpochMs", updated);
        safe.put("expiresAtEpochMs", expires);
        safe.put("privacyMode", "redacted");
        safe.put("unreadChanges", Math.max(0, Math.min(999, input.optInt("unreadChanges", 0))));
        String phase = input.optString("phase", "UNKNOWN");
        if (!phase.matches("BEFORE|ACTIVE|AFTER|UNKNOWN")) phase = "UNKNOWN";
        safe.put("phase", phase);

        JSONArray agenda = new JSONArray();
        JSONArray incoming = input.optJSONArray("agenda");
        if (incoming != null) {
            for (int i = 0; i < incoming.length() && agenda.length() < MAX_AGENDA_ITEMS; i++) {
                JSONObject item = incoming.optJSONObject(i);
                if (item == null) continue;
                long start = item.optLong("startEpochMs", 0L);
                long end = item.optLong("endEpochMs", 0L);
                if (start <= 0L || end <= start || end - start > 86400000L) continue;
                String time = item.optString("time", "");
                if (!time.matches("[0-2][0-9]:[0-5][0-9]")) time = "";
                JSONObject safeItem = new JSONObject();
                safeItem.put("time", time);
                safeItem.put("startEpochMs", start);
                safeItem.put("endEpochMs", end);
                agenda.put(safeItem);
            }
        }
        safe.put("agenda", agenda);

        JSONObject weather = input.optJSONObject("weather");
        JSONObject safeWeather = new JSONObject();
        long validUntil = weather == null ? 0L : weather.optLong("validUntilEpochMs", 0L);
        boolean ready = weather != null && weather.optBoolean("ready", false) && validUntil > now && validUntil <= now + MAX_AGE_MS;
        safeWeather.put("ready", ready);
        safeWeather.put("validUntilEpochMs", ready ? validUntil : 0L);
        if (ready) {
            safeWeather.put("label", safeText(weather.optString("label", ""), 64));
            if (!weather.isNull("temperatureC")) {
                int temp = weather.optInt("temperatureC", 999);
                if (temp >= -90 && temp <= 65) safeWeather.put("temperatureC", temp);
            }
        }
        safe.put("weather", safeWeather);
        safe.put("budgetWidget", sanitizeBudget(input.optJSONObject("budgetWidget"), now));
        return safe;
    }

    @PluginMethod
    public void updateSnapshot(PluginCall call) {
        JSONObject safe;
        try {
            safe = sanitize(call.getObject("snapshot"));
        } catch (JSONException error) {
            call.reject("Malformed widget snapshot", "INVALID_WIDGET_SNAPSHOT");
            return;
        }
        if (safe == null || safe.optJSONObject("budgetWidget") == null) {
            call.reject("Invalid or stale privacy-scoped widget snapshot", "INVALID_WIDGET_SNAPSHOT");
            return;
        }
        Context context = getContext().getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String key = snapshotKey(safe.optString("accountId"), safe.optString("tripId"));
        String previous = prefs.getString(ACTIVE_SNAPSHOT_KEY, null);
        SharedPreferences.Editor editor = prefs.edit().putString(key, safe.toString()).putString(ACTIVE_SNAPSHOT_KEY, key);
        if (previous != null && !previous.equals(key)) editor.remove(previous);
        if (!editor.commit()) {
            call.reject("Unable to save widget snapshot", "WIDGET_STORAGE_FAILED");
            return;
        }
        TravelMateWidgetProvider.refreshAll(context);
        TravelMateLiveTodayWidgetProvider.refreshAll(context);
        JSObject result = new JSObject();
        result.put("saved", true);
        call.resolve(result);
    }

    @PluginMethod
    public void clearSnapshot(PluginCall call) {
        Context context = getContext().getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String active = prefs.getString(ACTIVE_SNAPSHOT_KEY, null);
        SharedPreferences.Editor editor = prefs.edit().remove(ACTIVE_SNAPSHOT_KEY);
        if (active != null) editor.remove(active);
        boolean cleared = editor.commit();
        TravelMateWidgetProvider.refreshAll(context);
        TravelMateLiveTodayWidgetProvider.refreshAll(context);
        if (!cleared) {
            call.reject("Unable to clear widget snapshot", "WIDGET_STORAGE_FAILED");
            return;
        }
        call.resolve();
    }
}
