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

import java.text.NumberFormat;
import java.util.Currency;
import java.util.Locale;

public class TravelMateWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) manager.updateAppWidget(appWidgetId, buildViews(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, TravelMateWidgetProvider.class);
        for (int id : manager.getAppWidgetIds(component)) manager.updateAppWidget(id, buildViews(context));
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.travelmate_widget);
        String raw = TravelMateWidgetBridgePlugin.readActiveSnapshot(context);
        if (raw == null || raw.isEmpty()) return emptyViews(context, views);
        try {
            JSONObject snapshot = new JSONObject(raw);
            if (snapshot.optInt("schemaVersion", 0) != 1) return emptyViews(context, views);
            String tripId = snapshot.optString("tripId", "");
            if (!TravelMateWidgetBridgePlugin.validId(tripId)) return emptyViews(context, views);
            JSONObject budget = snapshot.optJSONObject("budgetWidget");
            if (budget == null) return emptyViews(context, views);
            int unread = Math.max(0, snapshot.optInt("unreadChanges", 0));
            if (!budget.optBoolean("ready", false)) return unavailableBudgetViews(context, views, tripId, unread);

            long now = System.currentTimeMillis();
            boolean stale = snapshot.optLong("expiresAtEpochMs", 0L) <= now;
            String currency = budget.optString("tripCurrency", "EUR");
            double spent = finite(budget.optDouble("spent", 0d));
            views.setTextViewText(R.id.widget_header, context.getString(R.string.widget_title));
            views.setTextViewText(R.id.widget_spent, money(spent, currency));

            String mode = budget.optString("mode", "limited");
            String paceState = budget.optString("paceState", "unavailable");
            double remaining = finite(budget.optDouble("remaining", 0d));
            double overrun = finite(budget.optDouble("overrun", 0d));
            double pace = finite(budget.optDouble("dailyPace", 0d));
            String status;
            if (stale) {
                status = context.getString(R.string.widget_stale);
            } else if ("unlimited".equals(mode)) {
                if ("before-trip".equals(paceState)) status = context.getString(R.string.widget_before_trip);
                else if ("completed".equals(paceState)) status = context.getString(R.string.widget_completed);
                else status = context.getString(R.string.widget_unlimited_pace, money(pace, currency));
            } else if (overrun > 0d) {
                status = context.getString(R.string.widget_overrun, money(overrun, currency));
            } else {
                status = context.getString(R.string.widget_remaining, money(remaining, currency));
            }
            views.setTextViewText(R.id.widget_budget_status, status);

            JSONObject fx = budget.optJSONObject("fx");
            String fxText = context.getString(R.string.widget_fx_unavailable);
            if (fx != null && !"unavailable".equals(fx.optString("freshness", "unavailable"))) {
                String from = fx.optString("fromCurrency", currency);
                String to = fx.optString("toCurrency", "");
                double rate = finite(fx.optDouble("rate", 0d));
                if (rate > 0d && !to.isEmpty()) {
                    String formattedRate = trimRate(rate);
                    int id = "stale".equals(fx.optString("freshness")) ? R.string.widget_fx_stale : R.string.widget_fx_rate;
                    fxText = context.getString(id, from, formattedRate, to);
                }
            }
            views.setTextViewText(R.id.widget_fx, fxText);

            if (unread > 0) {
                views.setTextViewText(R.id.widget_unread, unread > 99 ? context.getString(R.string.widget_unread_many) : context.getString(R.string.widget_unread, unread));
                views.setViewVisibility(R.id.widget_unread, View.VISIBLE);
            } else {
                views.setTextViewText(R.id.widget_unread, "");
                views.setViewVisibility(R.id.widget_unread, View.GONE);
            }

            PendingIntent budgetIntent = deepLinkIntent(context, tripId, null, 2001);
            PendingIntent expenseIntent = deepLinkIntent(context, tripId, "quick-expense", 2002);
            PendingIntent converterIntent = deepLinkIntent(context, tripId, "converter", 2003);
            if (budgetIntent != null) views.setOnClickPendingIntent(R.id.widget_root, budgetIntent);
            if (expenseIntent != null) views.setOnClickPendingIntent(R.id.widget_quick_expense, expenseIntent);
            if (converterIntent != null) {
                views.setOnClickPendingIntent(R.id.widget_converter, converterIntent);
                views.setOnClickPendingIntent(R.id.widget_fx, converterIntent);
            }
            return views;
        } catch (Exception error) {
            return emptyViews(context, views);
        }
    }


    private static RemoteViews unavailableBudgetViews(Context context, RemoteViews views, String tripId, int unread) {
        views = emptyViews(context, views);
        if (unread > 0) {
            views.setTextViewText(R.id.widget_unread, unread > 99 ? context.getString(R.string.widget_unread_many) : context.getString(R.string.widget_unread, unread));
            views.setViewVisibility(R.id.widget_unread, View.VISIBLE);
        }
        PendingIntent budgetIntent = deepLinkIntent(context, tripId, null, 2101);
        PendingIntent expenseIntent = deepLinkIntent(context, tripId, "quick-expense", 2102);
        PendingIntent converterIntent = deepLinkIntent(context, tripId, "converter", 2103);
        if (budgetIntent != null) views.setOnClickPendingIntent(R.id.widget_root, budgetIntent);
        if (expenseIntent != null) views.setOnClickPendingIntent(R.id.widget_quick_expense, expenseIntent);
        if (converterIntent != null) {
            views.setOnClickPendingIntent(R.id.widget_converter, converterIntent);
            views.setOnClickPendingIntent(R.id.widget_fx, converterIntent);
        }
        return views;
    }

    private static RemoteViews emptyViews(Context context, RemoteViews views) {
        views.setTextViewText(R.id.widget_header, context.getString(R.string.widget_title));
        views.setTextViewText(R.id.widget_spent, context.getString(R.string.widget_open_app));
        views.setTextViewText(R.id.widget_budget_status, context.getString(R.string.widget_prepare));
        views.setTextViewText(R.id.widget_fx, context.getString(R.string.widget_fx_unavailable));
        views.setViewVisibility(R.id.widget_unread, View.GONE);
        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 2000, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        views.setOnClickPendingIntent(R.id.widget_quick_expense, pendingIntent);
        views.setOnClickPendingIntent(R.id.widget_converter, pendingIntent);
        return views;
    }

    private static PendingIntent deepLinkIntent(Context context, String tripId, String action, int requestCode) {
        if (!TravelMateWidgetBridgePlugin.validId(tripId)) return null;
        Uri.Builder builder = new Uri.Builder().scheme("travelmate").authority("trip").appendPath(tripId).appendQueryParameter("view", "budget");
        if ("quick-expense".equals(action) || "converter".equals(action)) builder.appendQueryParameter("action", action);
        Intent intent = new Intent(Intent.ACTION_VIEW, builder.build(), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static double finite(double value) { return Double.isFinite(value) ? Math.max(0d, value) : 0d; }

    private static String money(double value, String currencyCode) {
        try {
            NumberFormat format = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("he-IL"));
            format.setCurrency(Currency.getInstance(currencyCode));
            format.setMaximumFractionDigits(value >= 1000d ? 0 : 2);
            return format.format(value);
        } catch (Exception error) {
            return trimRate(value) + " " + currencyCode;
        }
    }

    private static String trimRate(double value) {
        if (!Double.isFinite(value)) return "0";
        String text = String.format(Locale.US, "%.4f", value);
        return text.replaceAll("0+$", "").replaceAll("\\.$", "");
    }
}
