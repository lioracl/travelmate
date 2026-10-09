import WidgetKit
import SwiftUI
import Foundation

private let travelMateAppGroup = "group.com.travelmate.app"
private let activeSnapshotKey = "active_snapshot_key"

private struct BudgetFX: Codable {
    let fromCurrency: String
    let toCurrency: String
    let rate: Double
    let cachedAtEpochMs: Double
    let freshness: String
}

private struct BudgetState: Codable {
    let ready: Bool
    let mode: String
    let tripCurrency: String
    let homeCurrency: String
    let spent: Double
    let limit: Double?
    let remaining: Double?
    let overrun: Double?
    let dailyPace: Double
    let paceState: String
    let fx: BudgetFX?
}

private struct WidgetSnapshot: Codable {
    let schemaVersion: Int
    let tripId: String
    let expiresAtEpochMs: Double
    let privacyMode: String
    let unreadChanges: Int?
    let budgetWidget: BudgetState?
}

private struct BudgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

private struct BudgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> BudgetEntry { BudgetEntry(date: Date(), snapshot: nil) }

    func getSnapshot(in context: Context, completion: @escaping (BudgetEntry) -> Void) {
        completion(BudgetEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BudgetEntry>) -> Void) {
        let now = Date()
        let snapshot = loadSnapshot()
        let entry = BudgetEntry(date: now, snapshot: snapshot)
        var refresh = now.addingTimeInterval(30 * 60)
        if let expiryMs = snapshot?.expiresAtEpochMs {
            let expiry = Date(timeIntervalSince1970: expiryMs / 1000)
            if expiry > now { refresh = min(refresh, expiry) }
        }
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func loadSnapshot() -> WidgetSnapshot? {
        guard let defaults = UserDefaults(suiteName: travelMateAppGroup),
              let scopedKey = defaults.string(forKey: activeSnapshotKey),
              scopedKey.hasPrefix("snapshot_json:"),
              let raw = defaults.string(forKey: scopedKey),
              let data = raw.data(using: .utf8),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
              snapshot.schemaVersion == 1,
              snapshot.privacyMode == "redacted",
              snapshot.tripId.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$", options: .regularExpression) != nil else { return nil }
        return snapshot
    }
}

private struct BudgetWidgetView: View {
    let entry: BudgetEntry

    var body: some View {
        let snapshot = entry.snapshot
        let budget = snapshot?.budgetWidget
        let stale = snapshot.map { Date(timeIntervalSince1970: $0.expiresAtEpochMs / 1000) <= entry.date } ?? true
        let tripId = snapshot?.tripId ?? ""
        let budgetURL = deepLink(tripId: tripId, action: nil)
        let quickURL = deepLink(tripId: tripId, action: "quick-expense")
        let converterURL = deepLink(tripId: tripId, action: "converter")

        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("TravelMate · תקציב")
                    .font(.caption.bold())
                    .foregroundColor(Color(red: 0.14, green: 0.20, blue: 0.18))
                Spacer(minLength: 4)
                if let unread = snapshot?.unreadChanges, unread > 0 {
                    Text(unread > 99 ? "99+" : "\(unread)")
                        .font(.caption2.bold())
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .foregroundColor(.white)
                        .background(Color(red: 0.15, green: 0.49, blue: 0.46))
                        .clipShape(Capsule())
                        .accessibilityLabel("\(unread) עדכונים שלא נקראו")
                }
            }

            if let budget, budget.ready {
                Text("הוצאתי עד עכשיו")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text(money(budget.spent, code: budget.tripCurrency))
                    .font(.title2.bold())
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .accessibilityLabel("הוצאתי עד עכשיו \(money(budget.spent, code: budget.tripCurrency))")
                Text(statusText(budget: budget, stale: stale))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Text(fxText(budget.fx))
                    .font(.caption2)
                    .foregroundColor(Color(red: 0.18, green: 0.49, blue: 0.46))
                    .lineLimit(1)
            } else {
                Text("פתח את TravelMate כדי להכין את התקציב")
                    .font(.headline)
                    .foregroundColor(.primary)
                Text("הווידג׳ט משתמש רק במידע השמור במכשיר")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                if let quickURL {
                    Link(destination: quickURL) {
                        Text("＋ הוצאה")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .foregroundColor(.white)
                            .background(Color(red: 0.16, green: 0.48, blue: 0.44))
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    }
                    .accessibilityLabel("הוספת הוצאה מהירה")
                }
                if let converterURL {
                    Link(destination: converterURL) {
                        Text("ממיר")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .foregroundColor(Color(red: 0.14, green: 0.27, blue: 0.24))
                            .background(Color(red: 0.88, green: 0.94, blue: 0.92))
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    }
                    .accessibilityLabel("פתיחת ממיר מטבע")
                }
            }
            .font(.caption.bold())
        }
        .padding(14)
        .background(Color(red: 0.96, green: 0.98, blue: 0.97))
        .widgetURL(budgetURL)
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func deepLink(tripId: String, action: String?) -> URL? {
        guard tripId.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$", options: .regularExpression) != nil else { return nil }
        var components = URLComponents()
        components.scheme = "travelmate"
        components.host = "trip"
        components.path = "/\(tripId)"
        var items = [URLQueryItem(name: "view", value: "budget")]
        if let action { items.append(URLQueryItem(name: "action", value: action)) }
        components.queryItems = items
        return components.url
    }

    private func statusText(budget: BudgetState, stale: Bool) -> String {
        if stale { return "מידע שמור במכשיר · פתח לעדכון" }
        if budget.mode == "unlimited" {
            if budget.paceState == "before-trip" { return "המעקב מוכן לטיול" }
            if budget.paceState == "completed" { return "הטיול הסתיים · זה הסכום שנרשם" }
            if budget.paceState == "active" { return "ממוצע \(money(budget.dailyPace, code: budget.tripCurrency)) ליום" }
            return "ללא הגבלת תקציב"
        }
        if let overrun = budget.overrun, overrun > 0 { return "חריגה של \(money(overrun, code: budget.tripCurrency))" }
        return "נשארו \(money(budget.remaining ?? 0, code: budget.tripCurrency))"
    }

    private func fxText(_ fx: BudgetFX?) -> String {
        guard let fx, fx.rate > 0, fx.freshness == "fresh" || fx.freshness == "stale" else { return "פתח את הממיר לעדכון שער" }
        let prefix = fx.freshness == "stale" ? "שער שמור · " : ""
        return "\(prefix)1 \(fx.fromCurrency) ≈ \(trimRate(fx.rate)) \(fx.toCurrency)"
    }

    private func money(_ value: Double, code: String) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "he_IL")
        formatter.numberStyle = .currency
        formatter.currencyCode = code
        formatter.maximumFractionDigits = value >= 1000 ? 0 : 2
        return formatter.string(from: NSNumber(value: max(0, value))) ?? "\(trimRate(value)) \(code)"
    }

    private func trimRate(_ value: Double) -> String {
        String(format: "%.4f", max(0, value)).replacingOccurrences(of: "0+$", with: "", options: .regularExpression).replacingOccurrences(of: "\\.$", with: "", options: .regularExpression)
    }
}

private struct TravelMateBudgetWidget: Widget {
    let kind = "TravelMateBudgetWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BudgetProvider()) { entry in
            BudgetWidgetView(entry: entry)
        }
        .configurationDisplayName("TravelMate · תקציב")
        .description("הוצאות, הוצאה מהירה והמרת מטבע מהטיול הפעיל")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct TravelMateBudgetWidgetBundle: WidgetBundle {
    var body: some Widget {
        TravelMateBudgetWidget()
        TravelMateLiveTodayWidget()
    }
}
