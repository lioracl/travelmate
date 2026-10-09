package com.travelmate.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;


public class TravelMateLiveTodayWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) manager.updateAppWidget(appWidgetId, buildViews(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, TravelMateLiveTodayWidgetProvider.class);
        for (int id : manager.getAppWidgetIds(component)) manager.updateAppWidget(id, buildViews(context));
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.travelmate_live_today_widget);
        String raw = TravelMateWidgetBridgePlugin.readActiveSnapshot(context);
        if (raw == null || raw.isEmpty()) return emptyViews(context, views);
        try {
            JSONObject snapshot = new JSONObject(raw);
            if (snapshot.optInt("schemaVersion", 0) != 1) return emptyViews(context, views);
            String tripId = snapshot.optString("tripId", "");
            if (!TravelMateWidgetBridgePlugin.validId(tripId)) return emptyViews(context, views);

            long now = System.currentTimeMillis();
            JSONObject live = snapshot.optJSONObject("liveToday");
            boolean stale = snapshot.optLong("expiresAtEpochMs", 0L) <= now
                || live == null || live.optLong("validUntilEpochMs", 0L) <= now;
            views.setTextViewText(R.id.live_widget_header, context.getString(R.string.live_today_widget_title));
            bindUnread(context, views, snapshot, tripId);
            bindPlanActions(context, views, tripId);

            if (stale) {
                views.setTextViewText(R.id.live_widget_state, context.getString(R.string.live_today_widget_stale));
                views.setTextViewText(R.id.live_widget_time, "—");
                views.setViewVisibility(R.id.live_widget_activity, View.GONE);
                bindWeather(context, views, null, now);
                return views;
            }

            String selection = live.optString("state", "none");
            if ("current".equals(selection) || "next".equals(selection)) {
                views.setTextViewText(R.id.live_widget_state, context.getString("current".equals(selection) ? R.string.live_today_widget_current : R.string.live_today_widget_next));
                views.setTextViewText(R.id.live_widget_time, live.optString("time", ""));
                views.setTextViewText(R.id.live_widget_activity, context.getString(R.string.live_today_widget_activity));
                views.setViewVisibility(R.id.live_widget_activity, View.VISIBLE);
            } else {
                bindNoCommitment(context, views, snapshot.optString("phase", "UNKNOWN"));
            }

            bindWeather(context, views, snapshot.optJSONObject("weather"), now);
            return views;
        } catch (Exception error) {
            return emptyViews(context, views);
        }
    }

    private static void bindNoCommitment(Context context, RemoteViews views, String phase) {
        int text = R.string.live_today_widget_unknown;
        if ("ACTIVE".equals(phase)) text = R.string.live_today_widget_open_flexible;
        else if ("BEFORE".equals(phase)) text = R.string.live_today_widget_before;
        else if ("AFTER".equals(phase)) text = R.string.live_today_widget_after;
        views.setTextViewText(R.id.live_widget_state, context.getString(text));
        views.setTextViewText(R.id.live_widget_time, "—");
        views.setViewVisibility(R.id.live_widget_activity, View.GONE);
    }

    private static void bindWeather(Context context, RemoteViews views, JSONObject weather, long now) {
        if (weather == null || !weather.optBoolean("ready", false) || weather.optLong("validUntilEpochMs", 0L) <= now) {
            views.setTextViewText(R.id.live_widget_weather, context.getString(R.string.live_today_widget_weather_unavailable));
            return;
        }
        String label = weather.optString("label", "");
        String temperature = weather.isNull("temperatureC") ? "" : weather.optInt("temperatureC") + "°";
        String value = temperature;
        if (!label.isEmpty()) value = value.isEmpty() ? label : value + " · " + label;
        views.setTextViewText(R.id.live_widget_weather, value.isEmpty() ? context.getString(R.string.live_today_widget_weather_unavailable) : value);
    }

    private static void bindUnread(Context context, RemoteViews views, JSONObject snapshot, String tripId) {
        int unread = Math.max(0, snapshot.optInt("unreadChanges", 0));
        if (unread <= 0) {
            views.setViewVisibility(R.id.live_widget_unread, View.GONE);
            return;
        }
        views.setTextViewText(R.id.live_widget_unread, unread > 99 ? context.getString(R.string.widget_unread_many) : context.getString(R.string.widget_unread, unread));
        views.setViewVisibility(R.id.live_widget_unread, View.VISIBLE);
        PendingIntent changes = changesIntent(context, tripId, 3102);
        if (changes != null) views.setOnClickPendingIntent(R.id.live_widget_unread, changes);
    }

    private static void bindPlanActions(Context context, RemoteViews views, String tripId) {
        PendingIntent plan = planIntent(context, tripId, 3101);
        if (plan != null) {
            views.setOnClickPendingIntent(R.id.live_widget_root, plan);
            views.setOnClickPendingIntent(R.id.live_widget_open_plan, plan);
        }
    }

    private static RemoteViews emptyViews(Context context, RemoteViews views) {
        views.setTextViewText(R.id.live_widget_header, context.getString(R.string.live_today_widget_title));
        views.setTextViewText(R.id.live_widget_state, context.getString(R.string.live_today_widget_unknown));
        views.setTextViewText(R.id.live_widget_time, "—");
        views.setViewVisibility(R.id.live_widget_activity, View.GONE);
        views.setTextViewText(R.id.live_widget_weather, context.getString(R.string.live_today_widget_weather_unavailable));
        views.setViewVisibility(R.id.live_widget_unread, View.GONE);
        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(context, 3100, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.live_widget_root, open);
        views.setOnClickPendingIntent(R.id.live_widget_open_plan, open);
        return views;
    }

    private static PendingIntent planIntent(Context context, String tripId, int requestCode) {
        if (!TravelMateWidgetBridgePlugin.validId(tripId)) return null;
        Uri uri = new Uri.Builder().scheme("travelmate").authority("trip").appendPath(tripId).appendQueryParameter("view", "plan").build();
        return pendingIntent(context, uri, requestCode);
    }

    private static PendingIntent changesIntent(Context context, String tripId, int requestCode) {
        if (!TravelMateWidgetBridgePlugin.validId(tripId)) return null;
        Uri uri = new Uri.Builder().scheme("travelmate").authority("trip").appendPath(tripId).appendQueryParameter("view", "overview").appendQueryParameter("panel", "changes").build();
        return pendingIntent(context, uri, requestCode);
    }

    private static PendingIntent pendingIntent(Context context, Uri uri, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri, context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
