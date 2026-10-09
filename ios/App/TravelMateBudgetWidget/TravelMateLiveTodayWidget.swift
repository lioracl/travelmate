import WidgetKit
import SwiftUI
import Foundation

private let liveTravelMateAppGroup = "group.com.travelmate.app"
private let liveActiveSnapshotKey = "active_snapshot_key"

private struct LiveAgendaItem: Codable {
    let time: String
    let startEpochMs: Double
    let endEpochMs: Double
}

private struct LiveWeather: Codable {
    let ready: Bool
    let validUntilEpochMs: Double
    let label: String?
    let temperatureC: Int?
}

private struct LiveSnapshot: Codable {
    let schemaVersion: Int
    let accountId: String
    let tripId: String
    let expiresAtEpochMs: Double
    let privacyMode: String
    let phase: String
    let agenda: [LiveAgendaItem]
    let weather: LiveWeather?
    let unreadChanges: Int?
}

private struct LiveTodayEntry: TimelineEntry {
    let date: Date
    let snapshot: LiveSnapshot?
}

private struct LiveTodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> LiveTodayEntry {
        LiveTodayEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (LiveTodayEntry) -> Void) {
        completion(LiveTodayEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LiveTodayEntry>) -> Void) {
        let now = Date()
        let snapshot = loadSnapshot()
        let entry = LiveTodayEntry(date: now, snapshot: snapshot)
        var refresh = now.addingTimeInterval(30 * 60)

        if let snapshot {
            let expiry = Date(timeIntervalSince1970: snapshot.expiresAtEpochMs / 1000)
            if expiry > now { refresh = min(refresh, expiry) }
            if let item = selectedItem(snapshot.agenda, at: now) {
                let start = Date(timeIntervalSince1970: item.startEpochMs / 1000)
                let end = Date(timeIntervalSince1970: item.endEpochMs / 1000)
                if start > now.addingTimeInterval(30) { refresh = min(refresh, start) }
                if end > now.addingTimeInterval(30) { refresh = min(refresh, end) }
            }
        }

        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func loadSnapshot() -> LiveSnapshot? {
        guard let defaults = UserDefaults(suiteName: liveTravelMateAppGroup),
              let scopedKey = defaults.string(forKey: liveActiveSnapshotKey),
              scopedKey.hasPrefix("snapshot_json:"),
              let raw = defaults.string(forKey: scopedKey),
              let data = raw.data(using: .utf8),
              let snapshot = try? JSONDecoder().decode(LiveSnapshot.self, from: data),
              snapshot.schemaVersion == 1,
              snapshot.privacyMode == "redacted",
              validId(snapshot.accountId),
              validId(snapshot.tripId) else { return nil }
        return snapshot
    }

    private func validId(_ value: String) -> Bool {
        value.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$", options: .regularExpression) != nil
    }
}

private func selectedItem(_ agenda: [LiveAgendaItem], at now: Date) -> LiveAgendaItem? {
    let nowMs = now.timeIntervalSince1970 * 1000
    return agenda
        .filter { $0.startEpochMs > 0 && $0.endEpochMs > $0.startEpochMs && $0.endEpochMs - $0.startEpochMs <= 86_400_000 && $0.endEpochMs > nowMs }
        .sorted { lhs, rhs in
            if lhs.startEpochMs == rhs.startEpochMs { return lhs.endEpochMs < rhs.endEpochMs }
            return lhs.startEpochMs < rhs.startEpochMs
        }
        .first
}

private struct LiveTodayWidgetView: View {
    let entry: LiveTodayEntry

    var body: some View {
        let snapshot = entry.snapshot
        let stale = snapshot.map { Date(timeIntervalSince1970: $0.expiresAtEpochMs / 1000) <= entry.date } ?? true
        let item = snapshot.flatMap { selectedItem($0.agenda, at: entry.date) }
        let tripId = snapshot?.tripId ?? ""
        let planURL = deepLink(tripId: tripId, view: "plan", panel: nil)
        let changesURL = deepLink(tripId: tripId, view: "overview", panel: "changes")
        let unread = max(0, min(999, snapshot?.unreadChanges ?? 0))

        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("TravelMate · היום")
                    .font(.caption.bold())
                    .foregroundColor(Color(red: 0.14, green: 0.20, blue: 0.18))
                Spacer(minLength: 4)
                if unread > 0, let changesURL {
                    Link(destination: changesURL) {
                        Text(unread > 99 ? "99+" : "\(unread)")
                            .font(.caption2.bold())
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .foregroundColor(.white)
                            .background(Color(red: 0.15, green: 0.49, blue: 0.46))
                            .clipShape(Capsule())
                    }
                    .accessibilityLabel("\(unread) עדכונים שלא נקראו")
                }
            }

            if stale {
                Text("מידע שמור · פתח לעדכון")
                    .font(.headline)
                Text("TravelMate יעדכן את הווידג׳ט בפעם הבאה שהאפליקציה פעילה")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            } else if let item {
                let nowMs = entry.date.timeIntervalSince1970 * 1000
                let current = item.startEpochMs <= nowMs && item.endEpochMs > nowMs
                Text(current ? "מתקיים עכשיו" : "הבא בתוכנית")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(item.time.isEmpty ? formattedTime(item.startEpochMs) : item.time)
                    .font(.title2.bold())
                    .lineLimit(1)
                Text("פעילות מתוכננת")
                    .font(.headline)
                    .lineLimit(1)
                    .accessibilityLabel(current ? "פעילות מתוכננת מתקיימת עכשיו" : "הפעילות המתוכננת הבאה")
            } else {
                Text(phaseText(snapshot?.phase ?? "UNKNOWN"))
                    .font(.headline)
                    .lineLimit(2)
                Text("אין התחייבות קבועה קרובה")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            HStack(spacing: 8) {
                Text(weatherText(snapshot?.weather, at: entry.date))
                    .font(.caption)
                    .foregroundColor(Color(red: 0.18, green: 0.49, blue: 0.46))
                    .lineLimit(1)
                Spacer(minLength: 4)
                if let planURL {
                    Link(destination: planURL) {
                        Text("פתח תוכנית")
                            .font(.caption.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(Color(red: 0.16, green: 0.48, blue: 0.44))
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    }
                    .accessibilityLabel("פתיחת תוכנית הטיול")
                }
            }
        }
        .padding(14)
        .background(Color(red: 0.96, green: 0.98, blue: 0.97))
        .widgetURL(planURL)
        .environment(\.layoutDirection, .rightToLeft)
        .privacySensitive()
    }

    private func phaseText(_ phase: String) -> String {
        switch phase {
        case "ACTIVE": return "היום פתוח וגמיש"
        case "BEFORE": return "הטיול עוד לא התחיל"
        case "AFTER": return "הטיול הסתיים"
        default: return "פתח את TravelMate לעדכון"
        }
    }

    private func weatherText(_ weather: LiveWeather?, at now: Date) -> String {
        guard let weather, weather.ready,
              Date(timeIntervalSince1970: weather.validUntilEpochMs / 1000) > now else { return "מזג אוויר לא זמין" }
        let temperature = weather.temperatureC.map { "\($0)°" } ?? ""
        let label = (weather.label ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if temperature.isEmpty { return label.isEmpty ? "מזג אוויר לא זמין" : label }
        return label.isEmpty ? temperature : "\(temperature) · \(label)"
    }

    private func formattedTime(_ epochMs: Double) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "he_IL")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: Date(timeIntervalSince1970: epochMs / 1000))
    }

    private func deepLink(tripId: String, view: String, panel: String?) -> URL? {
        guard tripId.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$", options: .regularExpression) != nil,
              view == "plan" || view == "overview" else { return nil }
        var components = URLComponents()
        components.scheme = "travelmate"
        components.host = "trip"
        components.path = "/\(tripId)"
        var items = [URLQueryItem(name: "view", value: view)]
        if view == "overview", panel == "changes" { items.append(URLQueryItem(name: "panel", value: "changes")) }
        components.queryItems = items
        return components.url
    }
}

struct TravelMateLiveTodayWidget: Widget {
    let kind = "TravelMateLiveTodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LiveTodayProvider()) { entry in
            LiveTodayWidgetView(entry: entry)
        }
        .configurationDisplayName("TravelMate · היום")
        .description("הפעילות הקבועה הקרובה, מזג אוויר ועדכוני טיול")
        .supportedFamilies([.systemMedium])
    }
}
